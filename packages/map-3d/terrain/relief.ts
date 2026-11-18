// The land's height and colour at any point on the ground (docs/3d-renderer.md §4.1): one continuous function, built
//  from each square's terrain and blended across squares, on any grid.
//
// - **Blending:** a point takes every square whose middle is within `REACH` of it, each weighted by the kernel
//   (`kernel.ts`). That's its square and its neighbours, and on the hex grid a next-ring hex too near a corner, which a
//   neighbour list would miss: chosen by distance, the land has no step anywhere.
// - **Peaks** (`peaked`) are weighted by the square of their weight, outside the blend, so a mountain's peak stays in
//   its own square rather than lifting the plain beside it.
// - **Noise** repeats over the world's period, so the wrap has no seam either.
// - **The sea's floor** falls away from the shore, by how far a square is from land, walking the squares outwards from
//   it as far as `seaFloor.reach`.
// - **A square never seen** is flat, at sea level, whatever is round it: the client is never told its terrain, and its
//   neighbours' relief doesn't spill into it. The step at its edge is under cloud (§4.5).
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
  // The squares next to (`x`, `y`), on the world, as the topology has them.
  neighbours(x: number, y: number): [number, number][];
};

/** A point's height, in world units, and its colour, as linear red, green and blue from 0 to 1. */
export type GroundSample = { height: number; colour: [number, number, number] };

export interface ReliefMap {
  sample(u: number, v: number): GroundSample;
  height(u: number, v: number): number;
  /** Reads every square's terrain again, after the world's tiles have changed. */
  refresh(): void;
}

// How much of a peak is in the blend with its neighbours: the rest is its own, at its middle.
const PEAK_SHARE = 0.65;

// A CSS hex colour as linear red, green and blue, for the renderer's lighting.
const linear = (hex: string): [number, number, number] => {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;

    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return [channel(1), channel(3), channel(5)];
};

// What's kept for each square, read once per refresh.
type Square = {
  relief: Relief;
  colour: [number, number, number];
  unknown: boolean;
};

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
    // Which noise each shape rides on. Noise depends on the point alone, not the square, so each is taken once a point.
    noiseFor: { [shape in ReliefShape]: 'rolling' | 'ridged' | null } = {
      flat: null,
      rolling: 'rolling',
      ridged: 'ridged',
      peaked: 'ridged',
    };

  // Every square's terrain, by its index on the world.
  let squares: Square[] = [];

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
  const distancesFromLand = (names: string[]): number[] => {
    const distance = new Array<number>(width * height).fill(Infinity),
      queue: [number, number][] = [];

    names.forEach((name, at) => {
      if (name !== 'Ocean' && name !== 'Unknown') {
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

  const refresh = (): void => {
    const names: string[] = [],
      entries: TerrainEntry[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const name = source.terrainAt(x, y);

        names.push(name);
        entries.push(terrainEntry(name));
      }
    }

    const distance = distancesFromLand(names);

    squares = entries.map((entry, at) => {
      const unknown = entry === unknownTerrain;

      if (names[at] !== 'Ocean') {
        return {
          relief: entry.relief,
          colour: linear(entry.colour),
          unknown,
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
      };
    });
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

        if (Math.hypot(u - cu, v - cv) < REACH + corner + 1e-9) {
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
      return { height: 0, colour: linear(unknownTerrain.colour) };
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
      red = 0,
      green = 0,
      blue = 0;

    (offsets[y0 & 1] ?? []).forEach(([dx, dy]) => {
      const x = x0 + dx,
        y = y0 + dy,
        at = index(x, y);

      if (at === null) {
        return;
      }

      const [cu, cv] = layout.centre(x, y),
        w = weight(Math.hypot(u - cu, v - cv));

      if (w === 0) {
        return;
      }

      const square = squares[at];

      if (square === undefined) {
        return;
      }

      const { relief, colour } = square,
        noise = noiseFor[relief.shape],
        rough = noise === null ? 0 : relief.roughness * noiseHere(noise);

      if (relief.shape === 'peaked') {
        blended += w * (relief.base * (1 - PEAK_SHARE) + rough * 0.5);
        peaks += w * w * (relief.base * PEAK_SHARE + rough * 0.5);
      } else {
        blended += w * (relief.base + rough);
      }

      total += w;
      red += w * colour[0];
      green += w * colour[1];
      blue += w * colour[2];
    });

    return {
      height: blended / total + peaks,
      colour: [red / total, green / total, blue / total],
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
