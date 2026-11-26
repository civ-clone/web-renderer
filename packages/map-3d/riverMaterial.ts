// Rivers' water on the 3D map (docs/3d-renderer.md §5.3, plan 3.3): the material its strips (`terrain/ribbons.ts`) are
//  drawn in. A river's water is darker and greener than the sea at its shore, as a river's carries silt; where it falls
//  steeply it breaks white, as each point's `foam` says (`foamAt`), in patches rather than a wash, nearly all white
//  where it falls steepest, and rough there, as broken water's no mirror. Still: it doesn't flow (#1365).

import { Color, MeshStandardMaterial } from 'three';

const WATER = 0x2f5f66,
  // As the sea's foam (`water.ts`).
  FOAM = 0xe8eeee,
  // How many times across a unit of ground the white water breaks up, and again finer.
  BREAKS = 22,
  FLECKS = 66;

/** The material rivers' water is drawn in, its strips each with a `foam` at each point, from 0 to 1. */
export const riverMaterial = (): MeshStandardMaterial => {
  // A little in front of the land it lies on, which is close under it.
  const material = new MeshStandardMaterial({
    color: WATER,
    roughness: 0.3,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms['foamColour'] = { value: new Color(FOAM) };
    shader.vertexShader = `attribute float foam;
varying float vFoam;
varying vec2 vRiverAt;
${shader.vertexShader.replace(
  '#include <begin_vertex>',
  `#include <begin_vertex>
  vFoam = foam;
  // Where it is on the ground, at this copy of the world, so its white water's broken up the same at every copy's.
  vRiverAt = (modelMatrix * vec4(transformed, 1.0)).xz;`
)}`;
    shader.fragmentShader = `uniform vec3 foamColour;
varying float vFoam;
varying vec2 vRiverAt;
// A fraction from 0 to 1 for each whole point on the ground, by where it is.
float riverHash(vec2 at) {
  vec3 p = fract(vec3(at.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
// Smoothly between them.
float riverNoise(vec2 at) {
  vec2 whole = floor(at);
  vec2 part = fract(at);
  vec2 s = part * part * (3.0 - 2.0 * part);
  return mix(
    mix(riverHash(whole), riverHash(whole + vec2(1.0, 0.0)), s.x),
    mix(riverHash(whole + vec2(0.0, 1.0)), riverHash(whole + vec2(1.0, 1.0)), s.x),
    s.y
  );
}
${shader.fragmentShader
  .replace(
    '#include <color_fragment>',
    `#include <color_fragment>
  // White where its foam's over the noise there: more of it the more it foams, none at 0, and at 1 all but flecks of
  //  the water between.
  float broken = riverNoise(vRiverAt * ${BREAKS.toFixed(
    1
  )}) * 0.65 + riverNoise(vRiverAt * ${FLECKS.toFixed(1)}) * 0.35;
  float white = smoothstep(broken - 0.06, broken + 0.06, vFoam * 0.85) * smoothstep(0.0, 0.15, vFoam);
  diffuseColor.rgb = mix(diffuseColor.rgb, foamColour, white);`
  )
  .replace(
    '#include <roughnessmap_fragment>',
    `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.85, white);`
  )}`;
  };
  material.customProgramCacheKey = () => 'river-foam';

  return material;
};

export default riverMaterial;
