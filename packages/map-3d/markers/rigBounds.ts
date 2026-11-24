// How far a model's rigged copy's clips take its figures (plan 2.2), so each is drawn only where the camera, or the
//  sun's shadows, would see it. A skinned mesh's own bounds are its bind pose's, worked out once, wherever a clip takes
//  it after: these cover every pose its clips have instead, as the rig's loaded, and its copies take them with them.
//
// Worked out by its bones, not its points, which would take a twentieth of a second a rig: each point a bone moves lies
//  within a reach of it, as far as the furthest it moves lay from it as the model stands, however it's turned (and
//  further, as far as it's grown or stretched). Where a point's moved by several, it lies between where each would
//  take it.

import {
  AnimationMixer,
  Box3,
  Matrix4,
  Object3D,
  SkinnedMesh,
  Sphere,
  Vector3,
} from 'three';
import { LoadedRig } from '../models/loadModels';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** How often a clip's poses are taken for its rig's bounds, in seconds. */
export const BOUNDS_STEP = 0.1;

/** How much further than any pose taken a rig's bounds reach: for what a clip does between the poses taken. */
export const BOUNDS_SPARE = 1.1;

// The skinned meshes in `scene`, in the order a walk of it finds them.
const skinnedOf = (scene: Object3D): SkinnedMesh[] => {
  const found: SkinnedMesh[] = [];

  scene.traverse((object) => {
    if ((object as SkinnedMesh).isSkinnedMesh) {
      found.push(object as SkinnedMesh);
    }
  });

  return found;
};

/**
 * How far `matrix` stretches anything, at most: its longest axis, where its axes are square to each other, as a bone's
 *  turned and grown are; sheared, no more than its three axes together, which is never less.
 */
export const stretchOf = (matrix: Matrix4): number => {
  const e = matrix.elements,
    axes = [0, 4, 8].map((at) => [e[at]!, e[at + 1]!, e[at + 2]!]),
    dot = (a: number[], b: number[]): number =>
      a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!,
    lengths = axes.map((axis) => dot(axis, axis)),
    square = [
      [0, 1],
      [0, 2],
      [1, 2],
    ].every(
      ([a, b]) =>
        Math.abs(dot(axes[a!]!, axes[b!]!)) <=
        1e-4 * Math.sqrt(lengths[a!]! * lengths[b!]!)
    );

  return Math.sqrt(
    square ? Math.max(...lengths) : lengths.reduce((all, n) => all + n, 0)
  );
};

/**
 * The bones that move `mesh`'s points, by their index in its skeleton: where each stood as the model stands, in the
 *  world, and how far from there the furthest point it moves lay.
 */
export const reachOf = (
  mesh: SkinnedMesh
): Map<number, { at: Vector3; reach: number }> => {
  const reaches = new Map<number, { at: Vector3; reach: number }>(),
    { boneInverses } = mesh.skeleton,
    position = mesh.geometry.getAttribute('position'),
    indices = mesh.geometry.getAttribute('skinIndex'),
    weights = mesh.geometry.getAttribute('skinWeight'),
    point = new Vector3();

  if (
    position === undefined ||
    indices === undefined ||
    weights === undefined
  ) {
    return reaches;
  }

  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix);

    for (let k = 0; k < 4; k++) {
      const bone = indices.getComponent(i, k),
        inverse = boneInverses[bone];

      if (weights.getComponent(i, k) === 0 || inverse === undefined) {
        continue;
      }

      let reach = reaches.get(bone);

      if (reach === undefined) {
        reach = {
          at: new Vector3().setFromMatrixPosition(inverse.clone().invert()),
          reach: 0,
        };
        reaches.set(bone, reach);
      }

      reach.reach = Math.max(reach.reach, point.distanceTo(reach.at));
    }
  }

  return reaches;
};

/**
 * Each of `rig`'s skinned meshes bounded, in its own space, as far as it reaches as the model stands and at every
 *  `BOUNDS_STEP` of each of its clips, and its clip's end, and `BOUNDS_SPARE` further: then drawn only where it's seen,
 *  as every other mesh is, and a ray tested against its box before its points. Its copies (`SkeletonUtils.clone`)
 *  take its bounds with them. Posed on a copy of its own, so the rig's scene stays as the model stands.
 */
export const boundClips = (rig: LoadedRig): void => {
  const posed = cloneSkinned(rig.scene),
    meshes = skinnedOf(posed),
    reaches = meshes.map(reachOf),
    boxes = meshes.map(() => new Box3()),
    moved = new Matrix4(),
    centre = new Vector3(),
    corner = new Vector3(),
    world = new Box3(),
    take = (): void => {
      posed.updateMatrixWorld(true);
      meshes.forEach((mesh, index) => {
        const { bones, boneInverses } = mesh.skeleton;

        world.makeEmpty();
        reaches[index]!.forEach(({ at, reach }, bone) => {
          moved.multiplyMatrices(bones[bone]!.matrixWorld, boneInverses[bone]!);
          centre.copy(at).applyMatrix4(moved);

          const far = reach * stretchOf(moved);

          world.expandByPoint(corner.copy(centre).addScalar(far));
          world.expandByPoint(corner.copy(centre).addScalar(-far));
        });

        // From the world back to the mesh's own space, as three.js skins its points.
        if (!world.isEmpty()) {
          boxes[index]!.union(world.applyMatrix4(mesh.bindMatrixInverse));
        }
      });
    },
    mixer = new AnimationMixer(posed);

  take();
  rig.clips.forEach((clip) => {
    mixer.stopAllAction();
    mixer.clipAction(clip).play();

    for (let at = 0; at < clip.duration; at += BOUNDS_STEP) {
      mixer.setTime(at);
      take();
    }

    mixer.setTime(Math.max(0, clip.duration - 1e-4));
    take();
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(posed);

  // One with no points to bound is drawn wherever it is.
  skinnedOf(rig.scene).forEach((mesh, index) => {
    const box = boxes[index];

    if (box === undefined || box.isEmpty()) {
      mesh.frustumCulled = false;

      return;
    }

    const sphere = box.getBoundingSphere(new Sphere()),
      size = box.getSize(new Vector3());

    sphere.radius *= BOUNDS_SPARE;
    mesh.boundingSphere = sphere;
    mesh.boundingBox = box
      .clone()
      .expandByVector(size.multiplyScalar((BOUNDS_SPARE - 1) / 2));
    mesh.frustumCulled = true;
  });
};

export default boundClips;
