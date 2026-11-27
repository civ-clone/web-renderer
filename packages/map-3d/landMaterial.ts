// What the land's drawn with (docs/3d-renderer.md §4.3): three.js's standard material, its colour the land's at each
//  point, with each surface's detail (`terrain/surfaces.ts`) drawn over it, blended by how much of each surface the
//  ground is there (`ChunkMesh#surfacesA` and `surfacesB`). The detail lightens and darkens the colour, tilts the light
//  with its bumps, and sets how rough the ground is. Far off, the detail's smaller copies even out to the colour, and
//  each surface's own roughness (snow and mud shinier, rock a little): before, all land was as rough.
//
// Each surface's texture reaches about `SURFACE_TILE` across the ground before repeating, as many whole times as fit
//  the world's period, across and down, so each copy of the world has the same detail and the seam none. It's laid by
//  where a point is on the ground, not on its chunk, so chunks' borders have no seam either. Rock's is laid from three
//  sides, weighed by which the ground faces (`coverRockFacing`, `terrain/cover.ts`), so it stretches less down a
//  mountain's side.

import {
  Color,
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
import { SURFACES, terrainEntry } from '@civ-clone/ui-models-builtin/terrain';
import surfaceTextures, {
  SURFACE_SIZE,
  SURFACE_TILE,
} from './terrain/surfaces';
import { coverGlsl } from './terrain/cover';

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

const ROCK = SURFACES.indexOf('rock'),
  SNOW = SURFACES.indexOf('snow');

// Each surface's detail, sampled from its layer, weighted by how much of that surface the ground is, and which way its
//  bumps tilt the ground (east, up and south); each kept, for rock and snow to be drawn where they lie whatever the
//  ground's surface. Rock's is laid from three sides (`rockDetail`, `rockTilt`), the others from above.
const layers = SURFACES.map((_, layer) => {
  const weight = `vSurfaces${layer < 4 ? 'A' : 'B'}.${'xyzw'[layer % 4]}`;

  return layer === ROCK
    ? `surface += ${weight} * rockDetail;
  groundTilt += ${weight} * rockTilt;`
    : `vec4 surface${layer} = texture(surfaceDetail, vec3(surfaceAt, ${layer}.0));
  surface += ${weight} * surface${layer};
  groundTilt += ${weight} * laidFlat(surface${layer});`;
}).join('\n  ');

// The surfaces' detail, made once for the page: it's the same for every world.
let surfacesMade: Uint8Array | null = null;

const made = (): Uint8Array => (surfacesMade ??= surfaceTextures());

/**
 * The land's material, and the texture of its surfaces' detail, for a world repeating every `period`, whose ground
 *  runs `extent` down from pole to pole.
 */
export const landMaterial = (
  period: {
    u: number;
    v: number | null;
  },
  extent: number
): { material: MeshStandardMaterial; detail: DataArrayTexture } => {
  const detail = new DataArrayTexture(
      made(),
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
  // Sharper on the camera's slanting view of the ground: as much as the GPU allows, up to 4.
  detail.anisotropy = 4;
  // Numbers, not colours: kept as they are.
  detail.colorSpace = NoColorSpace;
  detail.needsUpdate = true;

  material.onBeforeCompile = (shader) => {
    shader.uniforms['surfaceDetail'] = { value: detail };
    shader.uniforms['surfaceTile'] = { value: new Vector2(tileU, tileV) };
    shader.uniforms['groundExtent'] = { value: extent };
    // Bare rock as mountains are, and snow as glaciers.
    shader.uniforms['rockColour'] = {
      value: new Color(terrainEntry('Mountains').colour),
    };
    shader.uniforms['snowColour'] = {
      value: new Color(terrainEntry('Glacier').colour),
    };
    shader.vertexShader = `attribute vec4 surfacesA;
attribute vec4 surfacesB;
attribute float shore;
varying vec4 vSurfacesA;
varying vec4 vSurfacesB;
varying vec2 vGround;
varying float vHeight;
varying float vShore;
${shader.vertexShader.replace(
  '#include <begin_vertex>',
  `#include <begin_vertex>
  vSurfacesA = surfacesA;
  vSurfacesB = surfacesB;
  vShore = shore;
  // Where it is on the ground, at this copy of the world: east and south; and how high.
  vec4 groundAt = modelMatrix * vec4(transformed, 1.0);
  vGround = groundAt.xz;
  vHeight = groundAt.y;`
)}`;
    shader.fragmentShader = `uniform highp sampler2DArray surfaceDetail;
uniform vec2 surfaceTile;
uniform float groundExtent;
uniform vec3 rockColour;
uniform vec3 snowColour;
varying vec4 vSurfacesA;
varying vec4 vSurfacesB;
varying vec2 vGround;
varying float vHeight;
varying float vShore;
${coverGlsl}
// Which way a texel's bumps tilt the ground, east, up and south, laid flat: across is east, down is south.
vec3 laidFlat(vec4 detail) {
  return vec3(detail.g * 2.0 - 1.0, 0.0, detail.b * 2.0 - 1.0);
}
${shader.fragmentShader
  .replace(
    '#include <color_fragment>',
    `#include <color_fragment>
  // Every surface sampled, so their smaller copies are chosen alike across where they meet.
  vec2 surfaceAt = vGround / surfaceTile;
  float surfaceTotal = dot(vSurfacesA, vec4(1.0)) + dot(vSurfacesB, vec4(1.0));
  vec3 groundNormal = transformDirectionByInverseViewMatrix(normalize(vNormal), viewMatrix);
  // Rock laid from above, from the east or west, and from the north or south (\`coverRockFacing\`), so it stretches
  //  less down a mountain's side: east to west and north to south as it repeats with the world, so no copy has a seam,
  //  and up by height. Laid from the side, each is moved half a texture along the way it shares with laid from above,
  //  and from the east or west it's laid up across and south down, so the two from the side share only height, one
  //  across and one down: they'd otherwise match, or mirror, each other along lines or patches of a slope where they
  //  blend, which the blend's scaling up (below) would make too rugged. All three everywhere, not only where it's
  //  steep, as a texture's smaller copies are chosen from how its coordinates change from pixel to pixel, which a
  //  branch would hide (\`textureGrad\` could skip them on gentle ground).
  vec3 rockFacing = coverRockFacing(groundNormal);
  vec4 rockAbove = texture(surfaceDetail, vec3(surfaceAt, ${ROCK}.0));
  vec4 rockAcross = texture(surfaceDetail, vec3(vHeight / surfaceTile.y, vGround.y / surfaceTile.y + 0.5, ${ROCK}.0));
  vec4 rockAlong = texture(surfaceDetail, vec3(vGround.x / surfaceTile.x + 0.5, vHeight / surfaceTile.x, ${ROCK}.0));
  vec4 rockDetail = rockFacing.x * rockAcross + rockFacing.y * rockAbove + rockFacing.z * rockAlong;
  // Laid from the east or west, the texture's across is up and its down is south; from the north or south, its across
  //  is east and its down is up.
  vec3 rockTilt = rockFacing.x * vec3(0.0, rockAcross.g * 2.0 - 1.0, rockAcross.b * 2.0 - 1.0)
    + rockFacing.y * laidFlat(rockAbove)
    + rockFacing.z * vec3(rockAlong.g * 2.0 - 1.0, rockAlong.b * 2.0 - 1.0, 0.0);
  // Two or three blended are smoother than one, as their shades and bumps partly cancel: scaled back up about their
  //  mean, so rock's as rugged wherever it's laid from.
  float rockSpread = inversesqrt(dot(rockFacing, rockFacing));
  rockDetail.r = 0.5 + (rockDetail.r - 0.5) * rockSpread;
  rockTilt *= rockSpread;
  vec4 surface = vec4(0.0);
  vec3 groundTilt = vec3(0.0);
  ${layers}
  // Fading to none (the colour alone) as the ground nears a square never seen, whose points have no surface.
  surface = surface / max(surfaceTotal, 1.0) + max(0.0, 1.0 - surfaceTotal) * vec4(0.5, 0.5, 0.5, roughness);
  groundTilt /= max(surfaceTotal, 1.0);
  // Where the land lies (\`terrain/cover.ts\`): bare rock where it's steep, snow high up, wet at the waterline. Not on a
  //  square never seen, whose ground is the cloud's.
  float seen = min(surfaceTotal, 1.0);
  float rockShare = coverRock(groundNormal.y) * seen;
  // How far from the equator, the same at every copy of the world above or below.
  float snowShare = coverSnow(vHeight, groundNormal.y, coverLatitude(vGround.y, groundExtent)) * seen;
  float wetShare = coverWet(vHeight, vShore) * seen;
  diffuseColor.rgb = mix(diffuseColor.rgb, rockColour, rockShare);
  surface = mix(surface, rockDetail, rockShare);
  groundTilt = mix(groundTilt, rockTilt, rockShare);
  diffuseColor.rgb = mix(diffuseColor.rgb, snowColour, snowShare);
  surface = mix(surface, surface${SNOW}, snowShare);
  groundTilt = mix(groundTilt, laidFlat(surface${SNOW}), snowShare);
  diffuseColor.rgb *= 0.5 + surface.r;
  // Wet: darker, and shinier.
  diffuseColor.rgb *= 1.0 - 0.3 * wetShare;`
  )
  .replace(
    '#include <roughnessmap_fragment>',
    `#include <roughnessmap_fragment>
  roughnessFactor = mix(surface.a, 0.3, wetShare);`
  )
  .replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
  // The detail's bumps tilt the ground, as the view sees it, along the ground's own slope.
  vec3 surfaceTilt = mat3(viewMatrix) * groundTilt;
  normal = normalize(normal + surfaceTilt - dot(surfaceTilt, normal) * normal);`
  )}`;
  };
  material.customProgramCacheKey = () => 'land-surfaces-cover';

  return { material, detail };
};

export default landMaterial;
