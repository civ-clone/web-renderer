// Rivers' water on the 3D map (docs/3d-renderer.md §5.3, plan 3.3): the material its strips (`terrain/ribbons.ts`) are
//  drawn in. A river's water is darker and greener than the sea at its shore, as a river's carries silt; where it falls
//  steeply it breaks white, as each point's `foam` says (`foamAt`), in patches rather than a wash, nearly all white
//  where it falls steepest, and rough there, as broken water's no mirror. Still: it doesn't flow (#1365).

import { Color, MeshStandardMaterial, Vector4 } from 'three';

const WATER = 0x2f5f66,
  // As the sea's foam (`water.ts`).
  FOAM = 0xe8eeee,
  // About how many times across a unit of ground the white water breaks up, and again finer.
  BREAKS = 22,
  FLECKS = 66;

/**
 * A noise's lattice on a world repeating every `period` (`v` null where it doesn't repeat down), about `perUnit` cells
 *  to a unit: how many cells to a unit across and down, a whole number of them in each period, and how many that is
 *  (0 where it doesn't repeat), so the noise repeats with the world, the same at every copy of it.
 */
export const latticeOf = (
  period: { u: number; v: number | null },
  perUnit: number
): [scaleU: number, scaleV: number, cellsU: number, cellsV: number] => {
  const cellsU = Math.max(1, Math.round(period.u * perUnit)),
    cellsV =
      period.v === null ? 0 : Math.max(1, Math.round(period.v * perUnit));

  return [
    cellsU / period.u,
    period.v === null ? perUnit : cellsV / period.v,
    cellsU,
    cellsV,
  ];
};

/**
 * The material rivers' water is drawn in, on a world repeating every `period`, its strips each with a `foam` at each
 *  point, from 0 to 1.
 */
export const riverMaterial = (period: {
  u: number;
  v: number | null;
}): MeshStandardMaterial => {
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
    shader.uniforms['riverBreaks'] = {
      value: new Vector4(...latticeOf(period, BREAKS)),
    };
    shader.uniforms['riverFlecks'] = {
      value: new Vector4(...latticeOf(period, FLECKS)),
    };
    shader.vertexShader = `attribute float foam;
varying float vFoam;
varying vec2 vRiverAt;
${shader.vertexShader.replace(
  '#include <begin_vertex>',
  `#include <begin_vertex>
  vFoam = foam;
  // Where it is on the ground, at this copy of the world.
  vRiverAt = (modelMatrix * vec4(transformed, 1.0)).xz;`
)}`;
    shader.fragmentShader = `uniform vec3 foamColour;
uniform vec4 riverBreaks;
uniform vec4 riverFlecks;
varying float vFoam;
varying vec2 vRiverAt;
// A fraction from 0 to 1 for each whole point of a lattice, by where it is.
float riverHash(vec2 at) {
  vec3 p = fract(vec3(at.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
// A whole point of a lattice, \`cells\` of it to the world across and down, taken round where the world repeats, so it's
//  the same at every copy of the world. Not \`mod\`, which a GPU dividing by a reciprocal can leave a whole lap over.
vec2 riverWrap(vec2 whole, vec2 cells) {
  vec2 laps = floor((whole + 0.5) / max(cells, 1.0));
  return vec2(
    cells.x > 0.0 ? whole.x - cells.x * laps.x : whole.x,
    cells.y > 0.0 ? whole.y - cells.y * laps.y : whole.y
  );
}
// Smoothly between a lattice's points at \`at\` on the ground: its cells to a unit across and down, and to the world.
float riverNoise(vec2 at, vec4 lattice) {
  vec2 scaled = at * lattice.xy;
  vec2 whole = floor(scaled);
  vec2 part = fract(scaled);
  vec2 s = part * part * (3.0 - 2.0 * part);
  return mix(
    mix(
      riverHash(riverWrap(whole, lattice.zw)),
      riverHash(riverWrap(whole + vec2(1.0, 0.0), lattice.zw)),
      s.x
    ),
    mix(
      riverHash(riverWrap(whole + vec2(0.0, 1.0), lattice.zw)),
      riverHash(riverWrap(whole + vec2(1.0, 1.0), lattice.zw)),
      s.x
    ),
    s.y
  );
}
${shader.fragmentShader
  .replace(
    '#include <color_fragment>',
    `#include <color_fragment>
  // White where its foam's over the noise there: more of it the more it foams, none at 0, and at 1 all but flecks of
  //  the water between.
  float broken = riverNoise(vRiverAt, riverBreaks) * 0.65 + riverNoise(vRiverAt, riverFlecks) * 0.35;
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
