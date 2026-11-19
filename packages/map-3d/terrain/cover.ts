// What covers the land beyond its surfaces (docs/3d-renderer.md §4.3), by where it lies, not what its squares are:
//  - bare rock where the ground is steep;
//  - snow high up, lower towards the poles, where the ground's level enough to hold it;
//  - wet sand at the waterline, where the land comes down to water.
// Pure: each is a share from 0 to 1, as the land's shader works it out at every point it draws (`landMaterial.ts`),
//  from the same numbers (`coverGlsl`), so the tests can say where each lies.

/** The numbers each cover's worked out from. */
export const COVER = {
  // Rock from where the ground's normal tilts below `rockFrom` upright (about 14° from level), wholly rock by `rockTo`
  //  (about 28°).
  rockFrom: 0.97,
  rockTo: 0.88,
  // Snow from this height at the equator, and at the poles (a mountain's peak is about 0.33 to 0.41 high, so the
  //  tallest are capped, more of them towards the poles); whole a little above.
  snowAtEquator: 0.4,
  snowAtPoles: 0.26,
  snowDeepens: 0.04,
  // Snow lies on ground more upright than `snowSlips`, wholly by `snowHolds`.
  snowSlips: 0.85,
  snowHolds: 0.95,
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
