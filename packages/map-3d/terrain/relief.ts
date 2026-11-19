// The land's height and colour at any point on the ground (docs/3d-renderer.md §4.1): one continuous function, built
//  from each square's terrain and blended across squares, on any grid.
//
// - **Blending:** a point takes every square whose middle is within `REACH` of it, each weighted by the kernel
//   (`kernel.ts`). That's its square and its neighbours, and on the hex grid a next-ring hex too near a corner, which a
//   neighbour list would miss: chosen by distance, the land has no step anywhere.
// - **Peaks** (`peaked`) are weighted by the square of their weight, outside the blend, so a mountain's peak stays in
//   its own square rather than lifting the plain beside it.
// - **Noise** repeats over the world's period, so the wrap has no seam either.
// - **The sea's floor,** under every square the engine says is water, falls away from the shore, by how far a square is from land, walking the squares outwards from
//   it as far as `seaFloor.reach`.
// - **A square never seen** is flat, at sea level, whatever is round it: the client is never told its terrain, and its
//   neighbours' relief doesn't spill into it. The step at its edge is mostly under cloud (§4.5): a hill or a mountain
//   beside it stands through.
//
// Deterministic: the same squares always give the same land.

import { GroundLayout } from '../layouts/GroundLayout';
import { REACH, weight } from './kernel';
import { Noise, fractalNoise, periodicNoise } from './noise';
import {
  Relief,
  ReliefShape,
  TerrainEntry,
  seaFloor,
  terrainEntry,
  unknownTerrain,
} from '@civ-clone/ui-models-builtin/terrain';

/** What the relief needs of the world: its size, each square's terrain, and each square's neighbours. */
export type ReliefSource = {
  width: number;
  height: number;
  wrapsY: boolean;
  // The terrain at (`x`, `y`), on the world (`x` from 0 to `width`, `y` from 0 to `height`): `Unknown` for a square
  //  never seen.
  terrainAt(x: number, y: number): string;
  // Whether the square at (`x`, `y`) is water, as the engine says (`tile.isWater`): its floor is the sea's.
  waterAt(x: number, y: number): boolean;
  // The squares next to (`x`, `y`), on the world, as the topology has them.
  neighbours(x: number, y: number): [number, number][];
};

/** A point's height, in world units, and its colour, as linear red, green and blue from 0 to 1. */
export type GroundSample = {
  height: number;
  colour: [number, number, number];
  // Whether the point is on a square never seen, which cloud covers.
  unseen: boolean;
};

export interface ReliefMap {
  sample(u: number, v: number): GroundSample;
  height(u: number, v: number): number;
  /**
   * Reads every square's terrain again, after the world's tiles have changed: the squares whose terrain has. Given
   *  `released`, those alone are looked at first, and the rest read again only if one of them has changed, as most
   *  changes (a unit moving, a city growing) change no terrain, and reading it all takes milliseconds.
   */
  refresh(
    released?: readonly (readonly [number, number])[]
  ): [number, number][];
}

// How much of a peak's height is its own, weighted by the square of its weight: the rest is in the blend with its
//  neighbours.
const PEAK_SHARE = 0.65;

// A CSS hex colour as linear red, green and blue, for the renderer's lighting.
const linear = (hex: string): [number, number, number] => {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return [channel(1), channel(3), channel(5)];
};

// What's kept for each square, read once per refresh: and for a peak, where it stands off the square's middle and how
//  much taller or lower it is than the terrain's, its own, so a range of mountains isn't a grid of cones.
type Square = {
  relief: Relief;
  colour: [number, number, number];
  unknown: boolean;
  peak: { u: number; v: number; scale: number };
};

/** How far a peak can stand off its square's middle, and a terrain's colour reach past its edge, in world units. */
export const WANDER = 0.22;

// A square's own fraction from 0 to 1, from its co-ordinates, the seed and what it's for.
const chance = (x: number, y: number, seed: number, salt: number): number => {
  let h =
    (Math.imul(x, 374761393) +
      Math.imul(y, 668265263) +
      Math.imul(seed, 2246822519) +
      Math.imul(salt, 3266489917)) |
    0;

  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;

  return (h >>> 0) / 4294967296;
};

/**
 * Where the peak of the square at (`x`, `y`) stands off its middle, within `WANDER` either way, and how much taller or
 *  lower than its terrain's it is, from `seed`: the same every time.
 */
export const peakOf = (
  x: number,
  y: number,
  seed: number
): { u: number; v: number; scale: number } => ({
  u: (chance(x, y, seed, 1) * 2 - 1) * WANDER,
  v: (chance(x, y, seed, 2) * 2 - 1) * WANDER,
  scale: 0.75 + chance(x, y, seed, 3) * 0.5,
});

export const createRelief = ({
  layout,
  seed = 1,
  source,
}: {
  layout: GroundLayout;
  seed?: number;
  source: ReliefSource;
}): ReliefMap => {
  const { width, height, wrapsY } = source,
    period = layout.period(),
    rolling = fractalNoise([
      periodicNoise({ cell: 0.7, period, seed }),
      periodicNoise({ cell: 0.35, period, seed: seed + 1 }),
      periodicNoise({ cell: 0.17, period, seed: seed + 2 }),
    ]),
    ridges = fractalNoise([
      periodicNoise({ cell: 0.45, period, seed: seed + 3 }),
      periodicNoise({ cell: 0.22, period, seed: seed + 4 }),
    ]),
    // A crest where the noise crosses 0, from -1 between them to 1 on them.
    ridged: Noise = (u, v) => 1 - 2 * Math.abs(ridges(u, v)),
    // How far a point's colour is taken from, across and down, so terrains' edges wander rather than run straight.
    wanderU = periodicNoise({ cell: 0.8, period, seed: seed + 5 }),
    wanderV = periodicNoise({ cell: 0.8, period, seed: seed + 6 }),
    // Which noise each shape rides on. Noise depends on the point alone, not the square, so each is taken once a point.
    noiseFor: { [shape in ReliefShape]: 'rolling' | 'ridged' | null } = {
      flat: null,
      rolling: 'rolling',
      ridged: 'ridged',
      peaked: 'ridged',
    };

  // Every square's terrain, by its index on the world, and what it was read as, to tell which have changed since.
  let squares: Square[] = [],
    read: string[] = [];

  const index = (x: number, y: number): number | null => {
    const wrappedX = ((x % width) + width) % width;

    if (!wrapsY && (y < 0 || y >= height)) {
      return null;
    }

    const wrappedY = ((y % height) + height) % height;

    return wrappedY * width + wrappedX;
  };

  // How far each square is from land, in steps, walking out from every square of land at once: as far as the sea's
  //  floor goes on falling, past which every square is as deep.
  const distancesFromLand = (land: boolean[]): number[] => {
    const distance = new Array<number>(width * height).fill(Infinity),
      queue: [number, number][] = [];

    land.forEach((isLand, at) => {
      if (isLand) {
        distance[at] = 0;
        queue.push([at % width, Math.floor(at / width)]);
      }
    });

    for (const [x, y] of queue) {
      const here = distance[y * width + x] ?? Infinity;

      if (here >= seaFloor.reach) {
        continue;
      }

      source.neighbours(x, y).forEach(([nx, ny]) => {
        const at = ny * width + nx;

        if ((distance[at] ?? Infinity) > here + 1) {
          distance[at] = here + 1;
          queue.push([nx, ny]);
        }
      });
    }

    return distance;
  };

  // What the square at index `at` is read as: its terrain's name, and whether it's water.
  const readAs = (x: number, y: number): string => {
    const name = source.terrainAt(x, y);

    return `${name}${
      name !== 'Unknown' && source.waterAt(x, y) ? ' water' : ''
    }`;
  };

  const refresh = (
    released?: readonly (readonly [number, number])[]
  ): [number, number][] => {
    // Only these may have changed: none has, so nothing's to read again.
    if (
      released !== undefined &&
      read.length > 0 &&
      released.every(([x, y]) => {
        const at = index(x, y);

        return at === null || read[at] === readAs(x, y);
      })
    ) {
      return [];
    }

    const names: string[] = [],
      water: boolean[] = [],
      entries: TerrainEntry[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const name = source.terrainAt(x, y);

        names.push(name);
        water.push(name !== 'Unknown' && source.waterAt(x, y));
        entries.push(terrainEntry(name));
      }
    }

    const distance = distancesFromLand(
        names.map((name, at) => name !== 'Unknown' && !water[at])
      ),
      now = names.map((name, at) => `${name}${water[at] ? ' water' : ''}`),
      changed: [number, number][] = [];

    now.forEach((was, at) => {
      if (read[at] !== was) {
        changed.push([at % width, Math.floor(at / width)]);
      }
    });
    read = now;

    squares = entries.map((entry, at) => {
      const unknown = entry === unknownTerrain,
        x = at % width,
        y = Math.floor(at / width),
        peak = peakOf(x, y, seed);

      if (!water[at]) {
        return {
          relief: entry.relief,
          colour: linear(entry.colour),
          unknown,
          peak,
        };
      }

      // The sea's floor, from shallow at the shore to deep `reach` squares out.
      const out = Math.min(distance[at] ?? Infinity, seaFloor.reach),
        depth =
          seaFloor.shore +
          ((seaFloor.deep - seaFloor.shore) * Math.max(0, out - 1)) /
            Math.max(1, seaFloor.reach - 1);

      return {
        relief: { ...entry.relief, base: depth },
        colour: linear(entry.colour),
        unknown,
        peak,
      };
    });

    return changed;
  };

  // The offsets from a square, by its row's parity, of every square whose middle can be within `REACH` of a point in
  //  it: as far as `REACH` past the square's furthest corner.
  const offsetsFor = (parity: number): [number, number][] => {
    const [cu, cv] = layout.centre(0, parity),
      corner = Math.max(
        ...layout.outline(0, parity).map(([u, v]) => Math.hypot(u - cu, v - cv))
      ),
      found: [number, number][] = [];

    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const [u, v] = layout.centre(dx, parity + dy);

        // As far again as a peak or a colour wanders: up to `WANDER` either way, so its diagonal.
        if (
          Math.hypot(u - cu, v - cv) <
          REACH + corner + WANDER * Math.SQRT2 + 1e-9
        ) {
          found.push([dx, dy]);
        }
      }
    }

    return found;
  };

  const offsets = [offsetsFor(0), offsetsFor(1)];

  const sample = (u: number, v: number): GroundSample => {
    const [x0, y0] = layout.tileAt(u, v),
      own = index(x0, y0),
      ownSquare = own === null ? null : squares[own] ?? null;

    // Never seen, or off a world that doesn't wrap over the poles: flat, at sea level.
    if (ownSquare === null || ownSquare.unknown) {
      return { height: 0, colour: linear(unknownTerrain.colour), unseen: true };
    }

    // Each noise at this point, once it's asked for.
    let rollingHere: number | null = null,
      ridgedHere: number | null = null;

    const noiseHere = (which: 'rolling' | 'ridged'): number =>
      which === 'rolling'
        ? (rollingHere ??= rolling(u, v))
        : (ridgedHere ??= ridged(u, v));

    let total = 0,
      blended = 0,
      peaks = 0,
      shades = 0,
      red = 0,
      green = 0,
      blue = 0;

    // Where the colour's taken from.
    const colourU = u + WANDER * wanderU(u, v),
      colourV = v + WANDER * wanderV(u, v);

    (offsets[y0 & 1] ?? []).forEach(([dx, dy]) => {
      const x = x0 + dx,
        y = y0 + dy,
        at = index(x, y);

      if (at === null) {
        return;
      }

      const square = squares[at];

      if (square === undefined) {
        return;
      }

      const [cu, cv] = layout.centre(x, y),
        { relief, colour, peak } = square,
        w = weight(Math.hypot(u - cu, v - cv)),
        // A peak's own, from where it stands; and the colour's, sharper than the land's, from where it's taken.
        peakW =
          relief.shape === 'peaked'
            ? weight(Math.hypot(u - cu - peak.u, v - cv - peak.v))
            : 0,
        shade = weight(Math.hypot(colourU - cu, colourV - cv)) ** 3;

      if (w > 0) {
        const noise = noiseFor[relief.shape],
          rough = noise === null ? 0 : relief.roughness * noiseHere(noise);

        if (relief.shape === 'peaked') {
          blended += w * (relief.base * (1 - PEAK_SHARE) + rough * 0.5);
        } else {
          blended += w * (relief.base + rough);
        }

        total += w;
      }

      if (peakW > 0) {
        const rough = relief.roughness * noiseHere('ridged');

        peaks +=
          peakW * peakW * (relief.base * PEAK_SHARE * peak.scale + rough * 0.5);
      }

      shades += shade;
      red += shade * colour[0];
      green += shade * colour[1];
      blue += shade * colour[2];
    });

    return {
      height: (total > 0 ? blended / total : 0) + peaks,
      colour:
        shades > 0
          ? [red / shades, green / shades, blue / shades]
          : ownSquare.colour,
      unseen: false,
    };
  };

  refresh();

  return {
    sample,
    height: (u: number, v: number): number => sample(u, v).height,
    refresh,
  };
};

export default createRelief;
