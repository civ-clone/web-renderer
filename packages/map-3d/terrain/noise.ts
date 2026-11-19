// Noise that repeats exactly over the world's period (docs/3d-renderer.md §4.1), so the land has no seam where the world
//  wraps: gradient (Perlin) noise on a lattice whose cells divide the period, each lattice point's slope hashed from its
//  own co-ordinates (taken round the period) and a seed. The same point always gives the same value. Gradient noise,
//  not value noise: value noise flattens at every lattice point, which shows as a grid of lines in the light.

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

// The 16 directions a lattice point's slope can take, round the circle: each one's cosine and sine, worked out once.
const DIRECTIONS = Float64Array.from({ length: 32 }, (_, at) =>
  (at % 2 === 0 ? Math.cos : Math.sin)(Math.floor(at / 2) * (Math.PI / 8))
);

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

  // The slope at a lattice point, along (`dx`, `dy`) from it: one of 16 directions round the circle, hashed.
  const slope = (i: number, j: number, dx: number, dy: number): number => {
    const direction = Math.floor(hash(i, j, seed) * 16) * 2;

    return (
      (DIRECTIONS[direction] ?? 0) * dx + (DIRECTIONS[direction + 1] ?? 0) * dy
    );
  };

  return (u: number, v: number): number => {
    const x = u / stepU,
      y = v / stepV,
      i = Math.floor(x),
      j = Math.floor(y),
      dx = x - i,
      dy = y - j,
      fx = fade(dx),
      fy = fade(dy),
      i0 = wrapU(i),
      i1 = wrapU(i + 1),
      j0 = wrapV(j),
      j1 = wrapV(j + 1),
      top =
        slope(i0, j0, dx, dy) +
        (slope(i1, j0, dx - 1, dy) - slope(i0, j0, dx, dy)) * fx,
      bottom =
        slope(i0, j1, dx, dy - 1) +
        (slope(i1, j1, dx - 1, dy - 1) - slope(i0, j1, dx, dy - 1)) * fx;

    // Gradient noise stays within about ±0.71: scaled to about ±1.
    return Math.max(-1, Math.min(1, (top + (bottom - top) * fy) * 1.4));
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
