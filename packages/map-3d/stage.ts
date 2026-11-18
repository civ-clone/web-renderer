// What three.js draws (docs/3d-renderer.md §9): the land under a sky, lit by the sun and the sky's light, with haze into
//  the distance. Kept apart from the view, which tests stand a stage of their own in for: a test has no GPU to draw
//  with.
//
// The land comes in chunks (`terrain/chunks.ts`), each drawn at every copy of the world (§3.1), so the land carries on
//  past the world's seam. The camera looks down at the square the map is centred on, from the south, at a strategy
//  game's angle: turning, tilting and zooming it are slice 1.2's.

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
  /** The point on the ground the camera looks at, and the land's height there. */
  lookAt(u: number, v: number, height: number): void;
  stats(): StageStats;
  dispose(): void;
}

export type StageOptions = {
  // Where the world's copies lie, as offsets on the ground: the world itself at (0, 0), and its neighbours a period away.
  copies: readonly (readonly [number, number])[];
};

export type StageFactory = (
  canvas: HTMLCanvasElement,
  options: StageOptions
) => Stage;

// A muted palette (D2): an overcast sky, and a sun low enough to model the relief.
const SKY = 0x9fb3c4,
  SKY_LIGHT = 0xd6e2ec,
  GROUND_LIGHT = 0x5b5140,
  SUN = 0xfff0d8,
  // The camera, back and above the point it looks at, from the south: about 45° down.
  CAMERA_BACK = 16,
  CAMERA_UP = 16;

export const createStage: StageFactory = (canvas, { copies }) => {
  const renderer = new WebGLRenderer({ antialias: true, canvas }),
    scene = new Scene(),
    camera = new PerspectiveCamera(40, 1, 0.1, 400),
    land = new Group(),
    material = new MeshStandardMaterial({
      roughness: 0.92,
      vertexColors: true,
    }),
    sun = new DirectionalLight(SUN, 2.6),
    // Each chunk's geometry, by `i,j`, and the meshes that draw it at the world's copies.
    chunks = new Map<string, { geometry: BufferGeometry; meshes: Mesh[] }>();

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;

  scene.background = new Color(SKY);
  // Haze into the distance (§9.3), so the land fades into the sky rather than ending at an edge.
  scene.fog = new Fog(SKY, 30, 110);
  scene.add(new HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 0.9));
  scene.add(land);

  // From the south-east and well up, so slopes facing it are lit and the far sides of ridges fall into shade.
  sun.position.set(30, 40, 20);
  scene.add(sun);
  scene.add(sun.target);

  const lookAt = (u: number, v: number, height: number): void => {
    camera.position.set(u, height + CAMERA_UP, v + CAMERA_BACK);
    camera.lookAt(u, height, v);
    // The sun's direction stays the same wherever the camera looks.
    sun.position.set(u + 30, height + 40, v + 20);
    sun.target.position.set(u, height, v);
  };

  lookAt(0, 0, 0);

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

      const meshes = copies.map(([offsetU, offsetV]) => {
        const drawn = new Mesh(geometry, material);

        drawn.position.set(mesh.u + offsetU, 0, mesh.v + offsetV);
        land.add(drawn);

        return drawn;
      });

      chunks.set(key, { geometry, meshes });
    },
    lookAt,
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
