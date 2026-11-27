// What covers the land beyond its surfaces (docs/3d-renderer.md §4.3), by where it lies, not what its squares are:
//  - bare rock where the ground is steep, its texture laid from the side it faces, so it stretches less down a
//    mountain's steepest sides (and a little more on slopes of about 18° to 45°, or 55° facing a corner, where it's
//    blended);
//  - snow high up, lower towards the poles, where the ground's level enough to hold it;
//  - wet ground (darker, shinier, whatever its surface) at the waterline, where the land comes down to water.
// Pure: each is a share from 0 to 1, as the land's shader works it out at every point it draws (`landMaterial.ts`),
//  from the same numbers (`coverGlsl`), so the tests can say where each lies.

/** The numbers each cover's worked out from. */
export const COVER = {
  // Rock from where the ground's normal tilts below `rockFrom` upright (about 14° from level), wholly rock by `rockTo`
  //  (about 28°).
  rockFrom: 0.97,
  rockTo: 0.88,
  // Rock's texture is laid from above, from the east or west, and from the north or south, each weighed by how
  //  squarely the ground faces it: by how far the normal's part along it is over `rockFaces`, to the power of
  //  `rockSharp`. So ground tilted less than about 17°, gentler than nearly all rock, is laid from above alone, as the
  //  other surfaces are, and a mountain's steep side mostly from the side it faces.
  rockFaces: 0.3,
  rockSharp: 4,
  // Snow from this height at the equator, and at the poles; whole a little above. A mountain's top is mostly 0.75 to
  //  0.95 high, about 0.85, up to about 1.05 in a massif, so fewer peaks are capped near the equator, and nearly all
  //  from halfway to the poles, a little fewer than before mountains rose (#1391).
  snowAtEquator: 0.86,
  snowAtPoles: 0.56,
  snowDeepens: 0.08,
  // Snow lies on ground more upright than `snowSlips` (about 53° from level), wholly by `snowHolds` (about 37°), as a
  //  peak's top is steep.
  snowSlips: 0.6,
  snowHolds: 0.8,
  // Wet where water squares are this share of what the ground's blended from, wholly by the second; up to this height
  //  over the sea.
  wetFrom: 0.1,
  wetTo: 0.4,
  wetUpTo: 0.03,
} as const;

/** From 0 below `from` to 1 above `to`, smoothly: GLSL's `smoothstep`. */
export const smooth = (from: number, to: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));

  return t * t * (3 - 2 * t);
};

/**
 * How far a point is from the equator (0) to the poles (1), from how far down the ground it is (`v`), on a ground
 *  `extent` from pole to pole: the same at every copy of the world, a period above or below.
 */
export const latitudeOf = (v: number, extent: number): number => {
  const down = ((v % extent) + extent) % extent;

  return Math.min(1, Math.abs((2 * down) / extent - 1));
};

/** How much of the ground is bare rock, by how upright its normal is (its `y`, 1 on level ground). */
export const rockness = (upright: number): number =>
  1 - smooth(COVER.rockTo, COVER.rockFrom, upright);

/**
 * How much of rock's texture is laid from the east or west, from above, and from the north or south, at ground whose
 *  normal is `normal` (east, up and south, of length 1): from 0 to 1, adding up to 1.
 */
export const rockFacing = (
  normal: [number, number, number]
): [number, number, number] => {
  const weights = normal.map(
      (part) => Math.max(0, Math.abs(part) - COVER.rockFaces) ** COVER.rockSharp
    ) as [number, number, number],
    total = weights[0] + weights[1] + weights[2];

  return weights.map((weight) => weight / total) as [number, number, number];
};

/**
 * How much of the ground is snow, by its height, how upright its normal is, and how far it is from the equator (0)
 *  to the poles (1).
 */
export const snowiness = (
  height: number,
  upright: number,
  latitude: number
): number => {
  const line =
    COVER.snowAtEquator + (COVER.snowAtPoles - COVER.snowAtEquator) * latitude;

  return (
    smooth(line, line + COVER.snowDeepens, height) *
    smooth(COVER.snowSlips, COVER.snowHolds, upright)
  );
};

/** How wet the ground is, by its height and how much of what it's blended from is water squares (`shore`). */
export const wetness = (height: number, shore: number): number =>
  smooth(COVER.wetFrom, COVER.wetTo, shore) *
  (1 - smooth(0, COVER.wetUpTo, height));

const number = (value: number): string =>
  Number.isInteger(value) ? `${value}.0` : `${value}`;

/** The same, in GLSL, for the land's shader. */
export const coverGlsl = `
float coverLatitude(float v, float extent) {
  float down = mod(v, extent);

  return min(1.0, abs(2.0 * down / extent - 1.0));
}

float coverRock(float upright) {
  return 1.0 - smoothstep(${number(COVER.rockTo)}, ${number(
  COVER.rockFrom
)}, upright);
}

vec3 coverRockFacing(vec3 normal) {
  vec3 weights = pow(max(abs(normal) - ${number(
    COVER.rockFaces
  )}, 0.0), vec3(${number(COVER.rockSharp)}));

  return weights / (weights.x + weights.y + weights.z);
}

float coverSnow(float height, float upright, float latitude) {
  float line = ${number(COVER.snowAtEquator)} + (${number(
  COVER.snowAtPoles
)} - ${number(COVER.snowAtEquator)}) * latitude;

  return smoothstep(line, line + ${number(
    COVER.snowDeepens
  )}, height) * smoothstep(${number(COVER.snowSlips)}, ${number(
  COVER.snowHolds
)}, upright);
}

float coverWet(float height, float shore) {
  return smoothstep(${number(COVER.wetFrom)}, ${number(
  COVER.wetTo
)}, shore) * (1.0 - smoothstep(0.0, ${number(COVER.wetUpTo)}, height));
}
`;

export default coverGlsl;
