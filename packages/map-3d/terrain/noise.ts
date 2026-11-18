// Noise that repeats exactly over the world's period (docs/3d-renderer.md §4.1), so the land has no seam where the world
//  wraps: value noise on a lattice whose cells divide the period, each lattice point's value hashed from its own
//  co-ordinates (taken round the period) and a seed. The same point always gives the same value.

/** A point's noise, between -1 and 1. */
export type Noise = (u: number, v: number) => number;

// An integer hash of a lattice point and a seed, as a fraction from 0 to 1.
const hash = (i: number, j: number, seed: number): number => {
  let h =
    (Math.imul(i, 374761393) +
      Math.imul(j, 668265263) +
      Math.imul(seed, 1442695041)) |
    0;

  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;

  return (h >>> 0) / 4294967296;
};

// Smooth from 0 to 1, flat at both ends, with a smooth slope too, so the land's normals have no creases at cell edges.
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Noise in cells about `cell` across, repeating every `period.u` across and every `period.v` down (or not down, where
 *  that's `null`), as many whole cells as fit in it.
 */
export const periodicNoise = ({
  cell,
  period,
  seed,
}: {
  cell: number;
  period: { u: number; v: number | null };
  seed: number;
}): Noise => {
  const cellsU = Math.max(1, Math.round(period.u / cell)),
    stepU = period.u / cellsU,
    cellsV =
      period.v === null ? null : Math.max(1, Math.round(period.v / cell)),
    stepV = period.v === null || cellsV === null ? cell : period.v / cellsV,
    wrapU = (i: number): number => ((i % cellsU) + cellsU) % cellsU,
    wrapV = (j: number): number =>
      cellsV === null ? j : ((j % cellsV) + cellsV) % cellsV;

  return (u: number, v: number): number => {
    const x = u / stepU,
      y = v / stepV,
      i = Math.floor(x),
      j = Math.floor(y),
      fx = fade(x - i),
      fy = fade(y - j),
      i0 = wrapU(i),
      i1 = wrapU(i + 1),
      j0 = wrapV(j),
      j1 = wrapV(j + 1),
      top = hash(i0, j0, seed) + (hash(i1, j0, seed) - hash(i0, j0, seed)) * fx,
      bottom =
        hash(i0, j1, seed) + (hash(i1, j1, seed) - hash(i0, j1, seed)) * fx;

    return (top + (bottom - top) * fy) * 2 - 1;
  };
};

/** Layers of noise, each half the size and half the weight of the last, between -1 and 1. */
export const fractalNoise = (layers: Noise[]): Noise => {
  const weights = layers.map((_, index) => 0.5 ** index),
    total = weights.reduce((sum, weight) => sum + weight, 0);

  return (u: number, v: number): number =>
    layers.reduce(
      (sum, layer, index) => sum + layer(u, v) * (weights[index] ?? 0),
      0
    ) / total;
};
