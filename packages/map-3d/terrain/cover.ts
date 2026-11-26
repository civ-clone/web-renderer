// What covers the land beyond its surfaces (docs/3d-renderer.md §4.3), by where it lies, not what its squares are:
//  - bare rock where the ground is steep;
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
  // Snow from this height at the equator, and at the poles; whole a little above. A mountain's top is mostly 0.73 to
  //  0.93 high, about 0.83, up to about 1.07 in a massif, so a quarter to a third of peaks are capped near the equator,
  //  two thirds a third of the way to the poles, and nearly all from halfway to them.
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

// From 0 below `from` to 1 above `to`, smoothly: GLSL's `smoothstep`.
const smooth = (from: number, to: number, value: number): number => {
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
