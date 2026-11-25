// Woods thinned with distance (docs/3d-renderer.md §5.1): the plants a set's models draw are drawn fewer the further
//  their chunk is from the camera, as they're small on the screen there and woods are many of them. Each chunk's plants
//  of a model are ordered by a rank of their own, so drawing its first few draws an even scatter of them, the same ones
//  every time they're laid, and the nearest draws them all.

/** How far from the camera a chunk's plants are all drawn, and the least share of them drawn however far. */
export const PLANTS_THIN_FROM = 8,
  PLANTS_THIN_LEAST = 0.2;

/** A plant's rank among its chunk's, from 0 to 1, by where it stands: the same wherever and whenever it's laid. */
export const plantRank = (u: number, v: number): number => {
  const hashed =
    Math.imul(Math.round(u * 4096), 73856093) ^
    Math.imul(Math.round(v * 4096), 19349663);

  return (Math.imul(hashed ^ (hashed >>> 15), 0x2c1b3c6d) >>> 0) / 2 ** 32;
};

/**
 * The order to draw a chunk's plants of a model in, `laid` as the overlay lays them (`numbers` to each, where it stands
 *  first): by their rank, so the first few drawn, far off, are an even scatter of them.
 */
export const rankedOrder = (
  laid: ArrayLike<number>,
  numbers: number
): number[] =>
  Array.from({ length: Math.floor(laid.length / numbers) }, (_, n) => ({
    n,
    rank: plantRank(laid[n * numbers]!, laid[n * numbers + 2]!),
  }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ n }) => n);

/** The share of a chunk's plants drawn, `distance` from the camera to the nearest of them. */
export const plantsKept = (distance: number): number =>
  distance <= PLANTS_THIN_FROM
    ? 1
    : Math.max(PLANTS_THIN_LEAST, (PLANTS_THIN_FROM / distance) ** 2);
