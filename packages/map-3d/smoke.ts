// Smoke rising from a city in civil disorder on the 3D map (docs/3d-renderer.md §7.4): see-through, so a unit behind it
//  shows, and lit by nothing, as smog is, but shaded as it's laid (`overlay/overlayMesh.ts`). Each chunk's is drawn
//  twice, after the cloud (`SMOKE_DEPTH_ORDER`, `SMOKE_ORDER`): first only into the depth buffer, then its colour
//  where it's the nearest smoke there. So each point on the screen takes one puff's surface, as solid as that puff
//  says, however many puffs a column stacks up there when it's seen end on, and the order they're laid in doesn't
//  show. Its puffs are closed, so only their faces toward the camera are drawn. Nothing drawn after it is tested
//  against depth: what stands over units and cities is drawn over everything.

import {
  BufferGeometry,
  FrontSide,
  LessEqualDepth,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { SMOKE_DEPTH_ORDER, SMOKE_ORDER } from './water';

/** The two materials smoke is drawn with: its depth first, then its colour. */
export type SmokeMaterials = {
  depth: MeshBasicMaterial;
  colour: MeshBasicMaterial;
};

/**
 * Smoke's materials, for a stage to share between its chunks, clip at the poles and let go of: its colour, and its
 *  depth, which is the colour's but for what it writes, so both are drawn by the one shader and their depths match
 *  exactly, which two shaders don't promise.
 */
export const smokeMaterials = (): SmokeMaterials => {
  // Its colour and how solid it is, where it's as near as the nearest smoke (less than or equal, as three.js tests by
  //  default), each point once, in the haze as the land is.
  const colour = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthFunc: LessEqualDepth,
      fog: true,
      side: FrontSide,
    }),
    // Only its depth, after what's solid and see-through below it, so the sea and the cloud are drawn behind it first.
    depth = colour.clone();

  depth.colorWrite = false;
  depth.depthWrite = true;

  return { depth, colour };
};

/** A chunk's smoke, its `geometry` laid as `overlayMesh.ts` lays it, as the two meshes it's drawn as, in order. */
export const smokeMeshes = (
  geometry: BufferGeometry,
  { depth, colour }: SmokeMaterials
): Mesh[] =>
  (
    [
      [depth, SMOKE_DEPTH_ORDER],
      [colour, SMOKE_ORDER],
    ] as const
  ).map(([material, order]) => {
    const mesh = new Mesh(geometry, material);

    mesh.renderOrder = order;

    return mesh;
  });
