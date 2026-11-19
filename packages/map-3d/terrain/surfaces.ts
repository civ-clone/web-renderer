// The land's surfaces' detail (docs/3d-renderer.md §4.3): for each surface (`SURFACES`), a texture made by code, drawn
//  over the land's colour close to: how much lighter or darker the ground is from point to point, which way its bumps
//  tilt it, and how rough it is. Made when the map's made, the same every time, each tiling seamlessly. Pure: the
//  stage turns them into a texture array, and its land's shader blends them by the surfaces' weights at each point.
//
// Each texel is four bytes:
//  - red: how much the land's colour is scaled by, from 0.5 (0) to 1.5 (255), 1 on average;
//  - green and blue: which way its bumps tilt the ground, across (east) and down (south), from -1 (0) to 1 (255);
//  - alpha: how rough it is, from 0 to 1.

import { SURFACES, Surface } from '@civ-clone/ui-models-builtin/terrain';
import { Noise, fractalNoise, periodicNoise } from './noise';

/** How many texels a side each surface's texture is. */
export const SURFACE_SIZE = 128;

/** How far across the ground each surface's texture reaches before it repeats, about, in world units. */
export const SURFACE_TILE = 0.5;

// How a surface is made: its grain (from -1 to 1, mean 0), how much it lightens and darkens the colour, its bumps'
//  height (from -1 to 1) and how steep they are, and how rough it is, and how much that varies with the grain.
// `noise` makes noise in cells about `cell` texels across; `wave` a wave `across` times across the texture and `down`
//  times down it, so it tiles too.
type Makers = {
  noise: (cell: number, salt: number) => Noise;
  wave: (across: number, down: number) => Noise;
};

type Recipe = {
  grain: (makers: Makers) => Noise;
  shade: number;
  bumps: (makers: Makers) => Noise;
  steep: number;
  rough: number;
  roughVaries: number;
};

// A ridge where noise crosses 0: from -1 between to 1 on it.
const ridge =
  (noise: Noise): Noise =>
  (x, y) =>
    1 - 2 * Math.abs(noise(x, y));

const recipes: { [surface in Surface]: Recipe } = {
  // Patches of lusher and drier grass, and its blades.
  grass: {
    grain: ({ noise }) =>
      fractalNoise([noise(96, 1), noise(16, 2), noise(4, 25)]),
    shade: 0.3,
    bumps: ({ noise }) => fractalNoise([noise(4, 3), noise(12, 4)]),
    steep: 2.5,
    rough: 0.9,
    roughVaries: 0.05,
  },
  // Dry grass with bare soil between.
  plains: {
    grain: ({ noise }) => fractalNoise([noise(64, 5), noise(8, 6)]),
    shade: 0.3,
    bumps: ({ noise }) => fractalNoise([noise(8, 7), noise(24, 8)]),
    steep: 2.2,
    rough: 0.92,
    roughVaries: 0.04,
  },
  // Ripples blown across it, a little wandering.
  sand: {
    grain: ({ noise, wave }) => {
      const ripples = wave(7, 3),
        wander = noise(64, 9),
        drift = noise(32, 10);

      // The ripples' phase moved by the wander, a little: as a wave's, it can't break the tiling.
      return (x, y) =>
        0.7 * ripples(x + 6 * wander(x, y), y) + 0.3 * drift(x, y);
    },
    shade: 0.12,
    bumps: ({ noise, wave }) => {
      const ripples = wave(7, 3),
        wander = noise(64, 9);

      return (x, y) => ripples(x + 6 * wander(x, y), y);
    },
    steep: 1.5,
    rough: 0.88,
    roughVaries: 0.04,
  },
  // Cracked stone: ridges where it splits.
  rock: {
    grain: ({ noise }) =>
      fractalNoise([ridge(noise(24, 11)), ridge(noise(12, 12)), noise(6, 13)]),
    shade: 0.35,
    bumps: ({ noise }) =>
      fractalNoise([ridge(noise(24, 11)), ridge(noise(12, 12)), noise(6, 13)]),
    steep: 2.5,
    rough: 0.75,
    roughVaries: 0.1,
  },
  // Smooth, softly drifted.
  snow: {
    grain: ({ noise }) => noise(64, 14),
    shade: 0.06,
    bumps: ({ noise }) => noise(32, 15),
    steep: 0.8,
    rough: 0.55,
    roughVaries: 0.05,
  },
  // Leaf litter under the trees.
  forest: {
    grain: ({ noise }) => fractalNoise([noise(10, 16), noise(40, 17)]),
    shade: 0.3,
    bumps: ({ noise }) => noise(8, 18),
    steep: 2.0,
    rough: 0.9,
    roughVaries: 0.05,
  },
  // Mud with wet patches, shinier where wet.
  mud: {
    grain: ({ noise }) => noise(48, 19),
    shade: 0.25,
    bumps: ({ noise }) => fractalNoise([noise(32, 20), noise(8, 21)]),
    steep: 1.2,
    rough: 0.65,
    roughVaries: 0.25,
  },
  // Lichen speckled over low growth.
  tundra: {
    grain: ({ noise }) => fractalNoise([noise(4, 22), noise(48, 23)]),
    shade: 0.3,
    bumps: ({ noise }) => noise(6, 24),
    steep: 2.0,
    rough: 0.9,
    roughVaries: 0.05,
  },
};

const byte = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value * 255)));

/**
 * Every surface's texture, in `SURFACES`' order, `size` texels a side: four bytes a texel (`surfaces.ts`), a layer
 *  after another.
 */
export const surfaceTextures = (
  size = SURFACE_SIZE,
  // Where the texture starts, in texels: for the tests to show it tiles.
  [startX, startY]: readonly [number, number] = [0, 0]
): Uint8Array => {
  const data = new Uint8Array(size * size * 4 * SURFACES.length),
    period = { u: size, v: size };

  SURFACES.forEach((surface, layer) => {
    const recipe = recipes[surface],
      // Noise in cells about `cell` texels across, repeating with the texture, its own for each salt.
      noise = (cell: number, salt: number): Noise =>
        periodicNoise({
          cell: (cell * size) / SURFACE_SIZE,
          period,
          seed: 7919 * (layer + 1) + salt,
        }),
      wave =
        (across: number, down: number): Noise =>
        (x, y) =>
          Math.sin((2 * Math.PI * (across * x + down * y)) / size),
      makers = { noise, wave },
      grain = recipe.grain(makers),
      bumps = recipe.bumps(makers),
      offset = layer * size * size * 4,
      // The bumps' height at every texel, once.
      heights = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        heights[y * size + x] = bumps(x + startX, y + startY);
      }
    }

    const height = (x: number, y: number): number =>
        heights[((y + size) % size) * size + ((x + size) % size)] ?? 0,
      // The grain at every texel, about its mean: so the colour's scaled by 1 on average, whatever the grain.
      grains = new Float32Array(size * size);
    let total = 0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        grains[y * size + x] = grain(x + startX, y + startY);
        total += grains[y * size + x] ?? 0;
      }
    }

    const mean = total / (size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const at = offset + (y * size + x) * 4,
          here = (grains[y * size + x] ?? 0) - mean,
          // The bumps' slope, from either side, round the texture's edge.
          across = (height(x + 1, y) - height(x - 1, y)) / 2,
          down = (height(x, y + 1) - height(x, y - 1)) / 2;

        data[at] = byte(recipe.shade * here + 0.5);
        data[at + 1] = byte(
          (1 - Math.max(-1, Math.min(1, across * recipe.steep))) / 2
        );
        data[at + 2] = byte(
          (1 - Math.max(-1, Math.min(1, down * recipe.steep))) / 2
        );
        data[at + 3] = byte(recipe.rough + recipe.roughVaries * here);
      }
    }
  });

  return data;
};

export default surfaceTextures;
