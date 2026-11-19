// What the land's drawn with (docs/3d-renderer.md §4.3): three.js's standard material, its colour the land's at each
//  point, with each surface's detail (`terrain/surfaces.ts`) drawn over it, blended by how much of each surface the
//  ground is there (`ChunkMesh#surfacesA` and `surfacesB`). The detail lightens and darkens the colour, tilts the light
//  with its bumps, and sets how rough the ground is. Far off, the detail's smaller copies even out to the colour alone.
//
// Each surface's texture reaches about `SURFACE_TILE` across the ground before repeating, as many whole times as fit
//  the world's period, across and down, so each copy of the world has the same detail and the seam none. It's laid by
//  where a point is on the ground, not on its chunk, so chunks' borders have no seam either.

import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector2,
} from 'three';
import { SURFACES } from '@civ-clone/ui-models-builtin/terrain';
import surfaceTextures, {
  SURFACE_SIZE,
  SURFACE_TILE,
} from './terrain/surfaces';

/**
 * How far across and down the ground each surface's texture reaches before it repeats: about `SURFACE_TILE`, as many
 *  whole times as fit the world's period (down, where it wraps over the poles).
 */
export const surfaceTile = (period: {
  u: number;
  v: number | null;
}): [number, number] => [
  period.u / Math.max(1, Math.round(period.u / SURFACE_TILE)),
  period.v === null
    ? SURFACE_TILE
    : period.v / Math.max(1, Math.round(period.v / SURFACE_TILE)),
];

// Each surface's detail, sampled from its layer, weighted by how much of that surface the ground is.
const layers = SURFACES.map(
  (_, layer) =>
    `surface += vSurfaces${layer < 4 ? 'A' : 'B'}.${
      'xyzw'[layer % 4]
    } * texture(surfaceDetail, vec3(surfaceAt, ${layer}.0));`
).join('\n');

/** The land's material, and the texture of its surfaces' detail, for a world repeating every `period`. */
export const landMaterial = (period: {
  u: number;
  v: number | null;
}): { material: MeshStandardMaterial; detail: DataArrayTexture } => {
  const detail = new DataArrayTexture(
      surfaceTextures(),
      SURFACE_SIZE,
      SURFACE_SIZE,
      SURFACES.length
    ),
    material = new MeshStandardMaterial({
      roughness: 0.92,
      vertexColors: true,
    }),
    [tileU, tileV] = surfaceTile(period);

  detail.format = RGBAFormat;
  detail.type = UnsignedByteType;
  detail.wrapS = RepeatWrapping;
  detail.wrapT = RepeatWrapping;
  detail.magFilter = LinearFilter;
  detail.minFilter = LinearMipmapLinearFilter;
  detail.generateMipmaps = true;
  // Numbers, not colours: kept as they are.
  detail.colorSpace = NoColorSpace;
  detail.needsUpdate = true;

  material.onBeforeCompile = (shader) => {
    shader.uniforms['surfaceDetail'] = { value: detail };
    shader.uniforms['surfaceTile'] = { value: new Vector2(tileU, tileV) };
    shader.vertexShader = `attribute vec4 surfacesA;
attribute vec4 surfacesB;
varying vec4 vSurfacesA;
varying vec4 vSurfacesB;
varying vec2 vGround;
${shader.vertexShader.replace(
  '#include <begin_vertex>',
  `#include <begin_vertex>
  vSurfacesA = surfacesA;
  vSurfacesB = surfacesB;
  // Where it is on the ground, at this copy of the world: east and south.
  vGround = (modelMatrix * vec4(transformed, 1.0)).xz;`
)}`;
    shader.fragmentShader = `uniform highp sampler2DArray surfaceDetail;
uniform vec2 surfaceTile;
varying vec4 vSurfacesA;
varying vec4 vSurfacesB;
varying vec2 vGround;
${shader.fragmentShader
  .replace(
    '#include <color_fragment>',
    `#include <color_fragment>
  // Every surface sampled, so their smaller copies are chosen alike across where they meet.
  vec2 surfaceAt = vGround / surfaceTile;
  float surfaceTotal = dot(vSurfacesA, vec4(1.0)) + dot(vSurfacesB, vec4(1.0));
  vec4 surface = vec4(0.0);
  ${layers}
  // None on a square never seen: the colour alone.
  surface = surfaceTotal > 0.001 ? surface / surfaceTotal : vec4(0.5, 0.5, 0.5, roughness);
  diffuseColor.rgb *= 0.5 + surface.r;`
  )
  .replace(
    '#include <roughnessmap_fragment>',
    `#include <roughnessmap_fragment>
  roughnessFactor = surface.a;`
  )
  .replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
  // The detail's bumps tilt the ground east and south, as the view sees it.
  normal = normalize(normal + mat3(viewMatrix) * vec3(surface.g * 2.0 - 1.0, 0.0, surface.b * 2.0 - 1.0));`
  )}`;
  };
  material.customProgramCacheKey = () => 'land-surfaces';

  return { material, detail };
};

export default landMaterial;
