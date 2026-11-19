// What three.js draws (docs/3d-renderer.md §9): the land under a sky, lit by the sun and the sky's light, with haze into
//  the distance. Kept apart from the view, which tests stand a stage of their own in for: a test has no GPU to draw
//  with.
//
// The land comes in chunks (`terrain/chunks.ts`), each drawn at every copy of the world the camera can see (§3.1), so
//  the land carries on past the world's seam whichever way it looks. The sea's surface lies over it (`water.ts`). The
//  camera is an orbit (`camera/orbit.ts`): the view says where it is, and the haze, how far it sees, and the sun's
//  shadows, fitted to what it sees, follow its distance.

import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';
import { ChunkMesh } from './terrain/chunks';
import { MarkerKit, drawMarker } from './markers/drawMarker';
import { TileMarker } from './markers/markerFor';
import { FIELD_OF_VIEW, Orbit, eye, sightFor } from './camera/orbit';
import Water, { Clouds, Ground } from './water';

/** What the stage has drawn, for the debug overlay. */
export type StageStats = {
  drawCalls: number;
  triangles: number;
  geometries: number;
};

/** Draws the scene on a canvas. */
export interface Stage {
  render(): void;
  /** The canvas's box in the page's px, and how many of the screen's pixels one is. */
  resize(width: number, height: number, pixelRatio: number): void;
  /** The land's chunk `i` across and `j` down, drawn at every copy of the world: one drawn before is replaced. */
  setChunk(i: number, j: number, mesh: ChunkMesh): void;
  /**
   * What's marked on the square `key` (`x,y`), standing at `at` (`u`, height, `v`), drawn at every copy of the world:
   *  one marked before is replaced, and nothing takes it away.
   */
  setMarker(
    key: string,
    at: readonly [number, number, number],
    marker: TileMarker | null
  ): void;
  /** The camera, round its focus raised to `height`, the land's there. */
  view(orbit: Orbit, height: number): void;
  stats(): StageStats;
  dispose(): void;
}

export type StageOptions = {
  // How far along the world repeats, across and down (`null` down for a world that doesn't wrap over the poles).
  period: { u: number; v: number | null };
  // How the land's points lie on the ground, for the sea's surface to read their heights.
  ground: Ground;
};

// Something drawn at every copy of the world in sight: where it lies, how to make another of it, and those drawn now.
type Placed = {
  at: readonly [number, number, number];
  make: () => Object3D;
  drawn: Object3D[];
};

export type StageFactory = (
  canvas: HTMLCanvasElement,
  options: StageOptions
) => Stage;

// A muted palette (D2): an overcast sky, and a sun low enough to model the relief.
const SKY = 0x9fb3c4,
  SKY_LIGHT = 0xd6e2ec,
  GROUND_LIGHT = 0x5b5140,
  SUN = 0xfff0d8;

/**
 * The copies of the world within `sight` of `focus`, as offsets on the ground: every multiple of the period across, and
 *  down where it wraps, whose copy comes within that distance.
 */
export const copiesNear = (
  focus: readonly [number, number],
  sight: number,
  period: { u: number; v: number | null }
): [number, number][] => {
  const along = (middle: number, span: number | null): number[] => {
    if (span === null) {
      return [0];
    }

    const found: number[] = [];

    // A copy's ground runs from its offset to a period on: it's in sight if that meets the focus's reach.
    for (
      let k = Math.floor((middle - sight) / span);
      k * span <= middle + sight;
      k++
    ) {
      found.push(k * span);
    }

    return found;
  };

  return along(focus[0], period.u).flatMap((across) =>
    along(focus[1], period.v).map((down): [number, number] => [across, down])
  );
};

// The sun's shadow map's size, in texels a side, and how far the sun is from what it lights (its offset below).
const SHADOW_MAP = 2048,
  SUN_DISTANCE = Math.hypot(30, 40, 20);

export const createStage: StageFactory = (canvas, { period, ground }) => {
  const renderer = new WebGLRenderer({ antialias: true, canvas }),
    scene = new Scene(),
    camera = new PerspectiveCamera(
      (FIELD_OF_VIEW * 180) / Math.PI,
      1,
      0.1,
      400
    ),
    land = new Group(),
    material = new MeshStandardMaterial({
      roughness: 0.92,
      vertexColors: true,
    }),
    sun = new DirectionalLight(SUN, 2.6),
    // What's drawn at every copy of the world in sight: the land's chunks by `i,j`, and the squares' markers by `x,y`.
    //  Each has where it lies, how to make one copy of it, and the copies drawn now.
    chunks = new Map<string, Placed & { geometry: BufferGeometry }>(),
    markers = new Map<string, Placed>(),
    markersGroup = new Group(),
    kit = new MarkerKit(),
    water = new Water(ground, new Color(SKY)),
    clouds = new Clouds(water.texture(), ground),
    fog = new Fog(SKY, 30, 110);

  // The copies of the world drawn now, and their key, to tell when they change.
  let copies: [number, number][] = [[0, 0]],
    copiesKey = '0,0',
    // The markers', fewer: past about twice the camera's distance they're too small and hazy to matter.
    markerCopies: [number, number][] = [[0, 0]],
    markerCopiesKey = '0,0';

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  scene.background = new Color(SKY);
  // Haze into the distance (§9.3), so the land fades into the sky rather than ending at an edge: how far follows the
  //  camera's distance.
  scene.fog = fog;
  scene.add(new HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 0.9));
  scene.add(land);
  scene.add(markersGroup);
  scene.add(water.mesh);
  scene.add(clouds.mesh);

  // From the south-east and well up, so slopes facing it are lit and the far sides of ridges fall into shade.
  sun.position.set(30, 40, 20);
  // One shadow map, over what the camera sees round its focus (`view`).
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // A thing's copies, one for each copy of the world drawn now, in `parent`.
  const copiesOf = (
    placed: Placed,
    parent: Group,
    at: [number, number][] = copies
  ): Object3D[] =>
    at.map(([offsetU, offsetV]) => {
      const drawn = placed.make();

      drawn.position.set(
        placed.at[0] + offsetU,
        placed.at[1],
        placed.at[2] + offsetV
      );
      parent.add(drawn);

      return drawn;
    });

  const view = (orbit: Orbit, height: number): void => {
    const [u, v] = orbit.focus,
      [x, y, z] = eye(orbit, height),
      { near, far } = sightFor(orbit.distance);

    camera.position.set(x, y, z);
    camera.lookAt(u, height, v);
    camera.far = far * 1.2;
    camera.updateProjectionMatrix();
    fog.near = near;
    fog.far = far;

    // The sun's direction stays the same wherever the camera looks, and its shadows cover what the camera sees round
    //  its focus, which the haze doesn't hide much of.
    const reach = orbit.distance * 2.2,
      shadow = sun.shadow.camera;

    sun.position.set(u + 30, height + 40, v + 20);
    sun.target.position.set(u, height, v);
    shadow.left = -reach;
    shadow.right = reach;
    shadow.top = reach;
    shadow.bottom = -reach;
    // As deep as it's wide, round the focus, the sun being as far from it as its offset is long.
    shadow.near = Math.max(0.5, SUN_DISTANCE - reach * 1.6);
    shadow.far = SUN_DISTANCE + reach * 1.6;
    shadow.updateProjectionMatrix();

    // The sea's surface under the camera, as far as it sees.
    water.follow(
      u,
      v,
      far * 2.2,
      sun.position.clone().sub(sun.target.position)
    );
    clouds.follow(u, v, far * 2.2);

    // The copies of the world the haze doesn't hide: when they change, every chunk is drawn at the new ones. And the
    //  markers', nearer.
    const inSight = copiesNear(orbit.focus, far, period),
      key = inSight.join(';'),
      markersInSight = copiesNear(
        orbit.focus,
        Math.min(far, orbit.distance * 2.2),
        period
      ),
      markersKey = markersInSight.join(';');

    if (key !== copiesKey) {
      copies = inSight;
      copiesKey = key;
      chunks.forEach((chunk) => {
        chunk.drawn.forEach((drawn) => land.remove(drawn));
        chunk.drawn = copiesOf(chunk, land);
      });
    }

    if (markersKey !== markerCopiesKey) {
      markerCopies = markersInSight;
      markerCopiesKey = markersKey;
      markers.forEach((marker) => {
        marker.drawn.forEach((drawn) => markersGroup.remove(drawn));
        marker.drawn = copiesOf(marker, markersGroup, markerCopies);
      });
    }
  };

  return {
    render: (): void => renderer.render(scene, camera),
    resize: (width, height, pixelRatio): void => {
      renderer.setPixelRatio(pixelRatio);
      // The canvas's own size only: the page's stylesheet sizes its box.
      renderer.setSize(width, height, false);
      camera.aspect = height > 0 ? width / height : 1;
      camera.updateProjectionMatrix();
    },
    setChunk: (i, j, mesh): void => {
      const key = `${i},${j}`,
        geometry = new BufferGeometry();

      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('color', new BufferAttribute(mesh.colours, 3));
      geometry.setIndex(new BufferAttribute(mesh.indices, 1));
      geometry.computeBoundingSphere();

      const old = chunks.get(key);

      if (old !== undefined) {
        old.drawn.forEach((drawn) => land.remove(drawn));
        old.geometry.dispose();
      }

      const chunk: Placed & { geometry: BufferGeometry } = {
        geometry,
        at: [mesh.u, 0, mesh.v],
        make: () => {
          const drawn = new Mesh(geometry, material);

          drawn.castShadow = true;
          drawn.receiveShadow = true;

          return drawn;
        },
        drawn: [],
      };

      chunk.drawn = copiesOf(chunk, land);
      chunks.set(key, chunk);
      water.setChunk(mesh);
    },
    setMarker: (key, at, marker): void => {
      const old = markers.get(key);

      // Its geometries and materials are the kit's, shared by every marker.
      old?.drawn.forEach((drawn) => markersGroup.remove(drawn));
      markers.delete(key);

      if (marker === null) {
        return;
      }

      const original = drawMarker(kit, marker);

      // Markers cast shadows on the land, as the models will.
      original.traverse((object) => {
        object.castShadow = object instanceof Mesh;
      });

      const placed: Placed = {
        at,
        make: () => original.clone(),
        drawn: [],
      };

      placed.drawn = copiesOf(placed, markersGroup, markerCopies);
      markers.set(key, placed);
    },
    view,
    stats: (): StageStats => ({
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
    }),
    dispose: (): void => {
      chunks.forEach(({ geometry }) => geometry.dispose());
      chunks.clear();
      markers.clear();
      kit.dispose();
      water.dispose();
      clouds.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
};

export default createStage;
