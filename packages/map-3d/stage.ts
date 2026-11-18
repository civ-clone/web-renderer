// What three.js draws (docs/3d-renderer.md §9): the land under a sky, lit by the sun and the sky's light, with haze into
//  the distance. Kept apart from the view, which tests stand a stage of their own in for: a test has no GPU to draw
//  with.
//
// The land comes in chunks (`terrain/chunks.ts`), each drawn at every copy of the world the camera can see (§3.1), so
//  the land carries on past the world's seam whichever way it looks. The camera is an orbit (`camera/orbit.ts`): the
//  view says where it is, and the haze and how far it sees follow its distance.

import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';
import { ChunkMesh } from './terrain/chunks';
import { FIELD_OF_VIEW, Orbit, eye, sightFor } from './camera/orbit';

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
  /** The camera, round its focus raised to `height`, the land's there. */
  view(orbit: Orbit, height: number): void;
  stats(): StageStats;
  dispose(): void;
}

export type StageOptions = {
  // How far along the world repeats, across and down (`null` down for a world that doesn't wrap over the poles).
  period: { u: number; v: number | null };
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

export const createStage: StageFactory = (canvas, { period }) => {
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
    // Each chunk's geometry and where it lies, by `i,j`, and the meshes that draw it at the world's copies in sight.
    chunks = new Map<
      string,
      { geometry: BufferGeometry; u: number; v: number; meshes: Mesh[] }
    >(),
    fog = new Fog(SKY, 30, 110);

  // The copies of the world drawn now, and their key, to tell when they change.
  let copies: [number, number][] = [[0, 0]],
    copiesKey = '0,0';

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;

  scene.background = new Color(SKY);
  // Haze into the distance (§9.3), so the land fades into the sky rather than ending at an edge: how far follows the
  //  camera's distance.
  scene.fog = fog;
  scene.add(new HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 0.9));
  scene.add(land);

  // From the south-east and well up, so slopes facing it are lit and the far sides of ridges fall into shade.
  sun.position.set(30, 40, 20);
  scene.add(sun);
  scene.add(sun.target);

  // A chunk's meshes, one for each copy of the world drawn now.
  const meshesFor = (geometry: BufferGeometry, u: number, v: number): Mesh[] =>
    copies.map(([offsetU, offsetV]) => {
      const drawn = new Mesh(geometry, material);

      drawn.position.set(u + offsetU, 0, v + offsetV);
      land.add(drawn);

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

    // The sun's direction stays the same wherever the camera looks.
    sun.position.set(u + 30, height + 40, v + 20);
    sun.target.position.set(u, height, v);

    // The copies of the world the haze doesn't hide: when they change, every chunk is drawn at the new ones.
    const inSight = copiesNear(orbit.focus, far, period),
      key = inSight.join(';');

    if (key !== copiesKey) {
      copies = inSight;
      copiesKey = key;
      chunks.forEach((chunk) => {
        chunk.meshes.forEach((drawn) => land.remove(drawn));
        chunk.meshes = meshesFor(chunk.geometry, chunk.u, chunk.v);
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
        old.meshes.forEach((drawn) => land.remove(drawn));
        old.geometry.dispose();
      }

      chunks.set(key, {
        geometry,
        u: mesh.u,
        v: mesh.v,
        meshes: meshesFor(geometry, mesh.u, mesh.v),
      });
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
      material.dispose();
      renderer.dispose();
    },
  };
};

export default createStage;
