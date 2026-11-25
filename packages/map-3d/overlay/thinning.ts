// Woods thinned when they're small on the screen (docs/3d-renderer.md §5.1): the plants a set's models draw are drawn
//  fewer once a tree stands shorter on the screen than `PLANTS_FULL_PIXELS`, as the camera's drawn out and woods are
//  many of them; at play's distances they're all drawn. Each chunk's plants of a model are ordered by a rank of their
//  own, from a dither repeating over the woods' lattice (`CANOPY`), so drawing its first few draws an even scatter of
//  them, the same ones every time they're laid.

import { Matrix4, Quaternion, Vector3 } from 'three';

/**
 * How tall a woods' tree stands, about, in the world (`PLANT_HEIGHT` times its size where the woods are whole); how tall
 *  it stands on the screen, in the page's pixels, for all of its chunk's to be drawn; and the least share of them drawn
 *  however small.
 */
export const PLANT_TALL = 0.3,
  PLANTS_FULL_PIXELS = 8,
  PLANTS_THIN_LEAST = 0.2;

// How far apart the lattice the dither repeats over is, about: the woods' (`CANOPY` in `overlayMesh.ts`).
const LATTICE = 0.17,
  // An ordered dither, 4 by 4: the order cells in each block of 16 are drawn in, each a block apart from the last.
  DITHER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * A plant's rank among its chunk's, from 0 to 1, by where it stands: the same wherever and whenever it's laid. The
 *  dither's place for its cell, and within it a fraction of its own, so the first of any share are spread evenly.
 */
export const plantRank = (u: number, v: number): number => {
  const i = Math.floor(u / LATTICE),
    j = Math.floor(v / LATTICE),
    hashed = Math.imul(i, 73856093) ^ Math.imul(j, 19349663),
    own = (Math.imul(hashed ^ (hashed >>> 15), 0x2c1b3c6d) >>> 0) / 2 ** 32;

  return (DITHER[(i & 3) * 4 + (j & 3)]! + own) / 16;
};

/**
 * The order to draw a chunk's plants of a model in, `laid` as the overlay lays them (`numbers` to each, where it stands
 *  first, from the chunk's corner at `corner` on the world): by their rank, so the first few drawn are an even scatter.
 */
export const rankedOrder = (
  laid: ArrayLike<number>,
  numbers: number,
  corner: readonly [number, number] = [0, 0]
): number[] =>
  Array.from({ length: Math.floor(laid.length / numbers) }, (_, n) => ({
    n,
    rank: plantRank(
      laid[n * numbers]! + corner[0],
      laid[n * numbers + 2]! + corner[1]
    ),
  }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ n }) => n);

const matrix = new Matrix4(),
  turn = new Quaternion(),
  up = new Vector3(0, 1, 0),
  at = new Vector3(),
  size = new Vector3();

/**
 * Each of a chunk's plants of a model, `laid` as the overlay lays them (where it stands, how tall and its turn, `numbers`
 *  to each, from the chunk's corner at `corner`), as the matrix that stands the model there, `height` tall in its own
 *  units: in the order to draw them in (`rankedOrder`), 16 numbers each.
 */
export const plantMatrices = (
  laid: ArrayLike<number>,
  numbers: number,
  height: number,
  corner: readonly [number, number] = [0, 0]
): Float32Array => {
  const order = rankedOrder(laid, numbers, corner),
    matrices = new Float32Array(order.length * 16);

  order.forEach((n, index) => {
    const scale = laid[n * numbers + 3]! / height;

    matrix
      .compose(
        at.set(
          laid[n * numbers]!,
          laid[n * numbers + 1]!,
          laid[n * numbers + 2]!
        ),
        turn.setFromAxisAngle(up, laid[n * numbers + 4]!),
        size.set(scale, scale, scale)
      )
      .toArray(matrices, index * 16);
  });

  return matrices;
};

/**
 * The share of a chunk's plants drawn, `distance` from the camera to the nearest of them, with `focal` the page's pixels
 *  a thing one unit tall stands one unit away (the screen's height in the page's pixels, over twice the tangent of half
 *  the camera's field of view): all, while a tree there is at least `PLANTS_FULL_PIXELS` tall on the screen, and fewer
 *  as it's smaller, as many to the screen's area as there, never fewer than `PLANTS_THIN_LEAST`.
 */
export const plantsKept = (distance: number, focal: number): number => {
  const pixels = (PLANT_TALL * focal) / Math.max(distance, 1e-6);

  return pixels >= PLANTS_FULL_PIXELS
    ? 1
    : Math.max(PLANTS_THIN_LEAST, (pixels / PLANTS_FULL_PIXELS) ** 2);
};
