// Units' and cities' meshes on the 3D map (`drawMarker.ts`: a unit's figures, stand and wall, the ring at its feet, a
//  city's walls), drawn as instances (#1204, #1424): every one of the same shape in the same material is drawn in one
//  draw call, where each was a draw call of its own, as the camera sees them and again for the sun's shadows. Each is
//  still a mesh in its marker, placed, copied, walked, blinked and faded as before, but on a layer of its own
//  (`MARKER_LAYER`) that the camera doesn't draw. The stage gathers them as it draws (`gatherDrawn`), and draws those
//  the camera sees, or that cast a shadow the sun's shadow map covers (`MarkerInstances#draw`).
//
// A unit's figures that play a clip are skinned, each posed its own way, so they stay on the camera's layer and are
//  drawn as they were. So is one whose material can't be drawn this way: see-through, or more than one.

import {
  Camera,
  DynamicDrawUsage,
  Frustum,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  Object3D,
  Sphere,
  Sprite,
} from 'three';
import { BADGE_LAYER } from './badges';

/** The layer marker meshes drawn as instances are on: not the camera's. */
export const MARKER_LAYER = 2;

/** `mesh` drawn as an instance (`MarkerInstances`), on its layer alone. */
export const instanced = <T extends Object3D>(mesh: T): T => {
  mesh.layers.set(MARKER_LAYER);

  return mesh;
};

/** What a frame draws of the markers: their badges (`badges.ts`), and their meshes drawn as instances. */
export type Drawn = { sprites: Sprite[]; meshes: Mesh[] };

/**
 * What's shown in `root` to draw together: the sprites on `BADGE_LAYER` and the meshes on `MARKER_LAYER`, each in a
 *  part shown, its material shown, in the order they're found.
 */
export const gatherDrawn = (root: Object3D): Drawn => {
  const sprites: Sprite[] = [],
    meshes: Mesh[] = [];

  root.traverseVisible((object) => {
    if (object instanceof Sprite) {
      if (object.layers.isEnabled(BADGE_LAYER) && object.material.visible) {
        sprites.push(object);
      }

      return;
    }

    const mesh = object as Mesh;

    if (
      mesh.isMesh &&
      !(mesh as InstancedMesh).isInstancedMesh &&
      mesh.layers.isEnabled(MARKER_LAYER) &&
      [mesh.material].flat().some((material) => material.visible)
    ) {
      meshes.push(mesh);
    }
  });

  return { sprites, meshes };
};

/** Whether `mesh` can be drawn as an instance of others like it: not skinned, in one material, solid. */
export const batchable = (mesh: Mesh): boolean =>
  !(mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh &&
  !Array.isArray(mesh.material) &&
  !(mesh.material as Material).transparent;

/**
 * What `mesh` is drawn as an instance with: the same shape, in the same material, casting and taking shadows the same,
 *  in the same order.
 */
export const batchKey = (mesh: Mesh): string =>
  [
    mesh.geometry.id,
    (mesh.material as Material).id,
    mesh.castShadow,
    mesh.receiveShadow,
    mesh.renderOrder,
  ].join(' ');

const sphere = new Sphere(),
  viewing = new Matrix4();

// How many of a batch there's room for at first, doubling as more are drawn.
const ROOM = 16;

/** The markers' meshes, drawn as instances: add `group` to the scene, and `draw` them as each frame's drawn. */
export class MarkerInstances {
  readonly group = new Group();
  #batches = new Map<string, InstancedMesh>();
  #seen = new Frustum();
  #shadowed = new Frustum();

  /** The batches drawn now, by their key (`batchKey`). */
  get batches(): ReadonlyMap<string, InstancedMesh> {
    return this.#batches;
  }

  /**
   * Draws `meshes` (`gatherDrawn`) as instances: those `camera` sees, or that cast a shadow `shadow` (the sun's shadow
   *  camera, aimed) covers, each with others like it (`batchKey`). One that can't be drawn so (`batchable`) is put on
   *  the camera's layer too, to be drawn as a mesh of its own. The world's matrices as they are: the caller works them
   *  out first. How many are drawn as instances.
   */
  draw(meshes: readonly Mesh[], camera: Camera, shadow: Camera | null): number {
    this.#seen.setFromProjectionMatrix(
      viewing.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      )
    );

    if (shadow !== null) {
      this.#shadowed.setFromProjectionMatrix(
        viewing.multiplyMatrices(
          shadow.projectionMatrix,
          shadow.matrixWorldInverse
        )
      );
    }

    const groups = new Map<string, Mesh[]>();
    let drawn = 0;

    meshes.forEach((mesh) => {
      if (!batchable(mesh)) {
        mesh.layers.enable(0);

        return;
      }

      mesh.layers.disable(0);

      if (mesh.frustumCulled) {
        const { geometry } = mesh;

        if (geometry.boundingSphere === null) {
          geometry.computeBoundingSphere();
        }

        sphere.copy(geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);

        if (
          !this.#seen.intersectsSphere(sphere) &&
          !(
            shadow !== null &&
            mesh.castShadow &&
            this.#shadowed.intersectsSphere(sphere)
          )
        ) {
          return;
        }
      }

      const key = batchKey(mesh),
        group = groups.get(key);

      if (group === undefined) {
        groups.set(key, [mesh]);
      } else {
        group.push(mesh);
      }
    });

    // Those not drawn now let go of: the meshes' shapes and materials are the markers' own.
    this.#batches.forEach((batch, key) => {
      if (!groups.has(key)) {
        this.group.remove(batch);
        batch.dispose();
        this.#batches.delete(key);
      }
    });

    groups.forEach((group, key) => {
      const batch = this.#batch(key, group[0]!, group.length),
        { array } = batch.instanceMatrix;

      group.forEach((mesh, index) => {
        array.set(mesh.matrixWorld.elements, index * 16);
      });

      batch.count = group.length;
      batch.instanceMatrix.clearUpdateRanges();
      batch.instanceMatrix.addUpdateRange(0, group.length * 16);
      batch.instanceMatrix.needsUpdate = true;
      // Round where they are now, for three.js to cull it by, as the camera and the sun's shadows see it.
      batch.computeBoundingSphere();
      drawn += group.length;
    });

    return drawn;
  }

  dispose(): void {
    this.#batches.forEach((batch) => batch.dispose());
    this.#batches.clear();
    this.group.clear();
  }

  // The batch drawn with `key`, like `like`, with room for `count`: made afresh, twice as big, where there isn't.
  #batch(key: string, like: Mesh, count: number): InstancedMesh {
    const before = this.#batches.get(key);

    if (before !== undefined && before.instanceMatrix.count >= count) {
      return before;
    }

    let room = before?.instanceMatrix.count ?? ROOM;

    while (room < count) {
      room *= 2;
    }

    if (before !== undefined) {
      this.group.remove(before);
      before.dispose();
    }

    const batch = new InstancedMesh(
      like.geometry,
      like.material as Material,
      room
    );

    batch.instanceMatrix.setUsage(DynamicDrawUsage);
    batch.castShadow = like.castShadow;
    batch.receiveShadow = like.receiveShadow;
    batch.renderOrder = like.renderOrder;
    batch.name = key;
    this.#batches.set(key, batch);
    this.group.add(batch);

    return batch;
  }
}

export default MarkerInstances;
