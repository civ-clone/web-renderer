// Woods thinned when they're small on the screen (docs/3d-renderer.md §5.1): the plants a set's models draw are drawn
//  fewer once a tree stands shorter on the screen than `PLANTS_FULL_PIXELS`, as the camera's drawn out and woods are
//  many of them; at play's distances they're all drawn. Each chunk's plants of a model are ordered by a rank laid with
//  each (`ditherRank`), a dither over the cells of the lattice it stands on, so drawing its first few draws an even
//  scatter of them, the same ones every time they're laid.

import { Matrix4, Quaternion, Vector3 } from 'three';

/**
 * How tall a woods' tree stands, about, in the world (`PLANT_HEIGHT` times its size where the woods are whole); how tall
 *  it stands on the screen, in the page's pixels, for all of its chunk's to be drawn; and the least share of them drawn
 *  however small.
 */
export const PLANT_TALL = 0.3,
  PLANTS_FULL_PIXELS = 8,
  PLANTS_THIN_LEAST = 0.2;

// An ordered dither, 4 by 4: the order cells in each block of 16 are drawn in, each a block apart from the last.
const DITHER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * A plant's rank, from 0 to 1, for the cell (`i`, `j`) of the lattice it stands on (taken round the world's period),
 *  and a fraction of its own (`own`): the dither's place for the cell, and within it its own, so the first of any share
 *  of a lattice's plants are spread evenly over it. The overlay lays it with the plant.
 */
export const ditherRank = (i: number, j: number, own: number): number =>
  (DITHER[(i & 3) * 4 + (j & 3)]! + own) / 16;

// Which of a plant's numbers, as the overlay lays them, is its rank (`ditherRank`): the sixth.
const RANK = 5;

/**
 * The order to draw a chunk's plants of a model in, `laid` as the overlay lays them (`numbers` to each): by their rank,
 *  so the first few drawn are an even scatter of them.
 */
export const rankedOrder = (
  laid: ArrayLike<number>,
  numbers: number
): number[] =>
  Array.from({ length: Math.floor(laid.length / numbers) }, (_, n) => n).sort(
    (a, b) => laid[a * numbers + RANK]! - laid[b * numbers + RANK]!
  );

const matrix = new Matrix4(),
  turn = new Quaternion(),
  up = new Vector3(0, 1, 0),
  at = new Vector3(),
  size = new Vector3();

/**
 * Each of a chunk's plants of a model, `laid` as the overlay lays them (where it stands, how tall, its turn and its rank,
 *  `numbers` to each), as the matrix that stands the model there, `height` tall in its own units: in the order to draw
 *  them in (`rankedOrder`), 16 numbers each.
 */
export const plantMatrices = (
  laid: ArrayLike<number>,
  numbers: number,
  height: number
): Float32Array => {
  const order = rankedOrder(laid, numbers),
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
 * The share of a chunk's plants drawn, `depth` into the view from the camera to the nearest of them (along the way it
 *  looks, as how big a thing looks goes by), with `focal` the page's pixels a thing one unit tall stands one unit deep
 *  (the screen's height in the page's pixels, over twice the tangent of half the camera's field of view): all, while a
 *  tree there is at least `PLANTS_FULL_PIXELS` tall on the screen, and fewer as it's smaller, as many to the screen's
 *  area as there, never fewer than `PLANTS_THIN_LEAST`.
 */
export const plantsKept = (depth: number, focal: number): number => {
  const pixels = (PLANT_TALL * focal) / Math.max(depth, 1e-6);

  return pixels >= PLANTS_FULL_PIXELS
    ? 1
    : Math.max(PLANTS_THIN_LEAST, (pixels / PLANTS_FULL_PIXELS) ** 2);
};
