// The land's height and colour at any point on the ground (docs/3d-renderer.md §4.1): one continuous function, built
//  from each square's terrain and blended across squares, on any grid.
//
// - **Blending:** a point takes every square whose middle is within `REACH` of it, each weighted by the kernel
//   (`kernel.ts`). That's its square and its neighbours, and on the hex grid a next-ring hex too near a corner, which a
//   neighbour list would miss: chosen by distance, the land has no step anywhere.
// - **Peaks** (`peaked`) are weighted by the square of their weight, outside the blend, so a mountain's peak stays in
//   its own square rather than lifting the plain beside it.
// - **Ranges:** neighbouring peaks are joined by a ridge, from one peak down to a saddle and up to the other, so
//   mountains side by side make a range rather than a row of cones. Across the ridge, it falls away as a peak does,
//   so the plain beside a range is barely lifted either. Where ridges and peaks meet, the land is the highest of them.
// - **Noise** repeats over the world's period, so the wrap has no seam either.
// - **The sea's floor,** under every square the engine says is water, falls away from the shore, by how far a square is from land, walking the squares outwards from
//   it as far as `seaFloor.reach`.
// - **A square never seen** has no relief of its own: the client is never told its terrain. Beside land seen, that land
//   carries on into it under the cloud, as it's blended, so there's no wall at its edge (#1393), brought under the
//   cloud where the cloud's whole and to sea level further off (`UNDER_CLOUD`). With nothing seen beside it, it's
//   flat, at sea level.
// - **Rivers** (§5.3, `rivers.ts`) cut their channels into the land, each from a river square seen to its neighbours
//   seen across an edge, with a river or water: their banks wet, darker.
//
// Deterministic: the same squares always give the same land.

import { GroundLayout } from '../layouts/GroundLayout';
import { REACH, weight } from './kernel';
import { smooth } from './cover';
import { Noise, fractalNoise, periodicNoise } from './noise';
import {
  BANK,
  Course,
  DEPTH,
  FLOOR,
  MEANDER,
  MOUTH,
  POOL_WIDTH,
  RIVER_WIDTH,
  STEPS,
  alongOf,
  courseFrom,
  cutBy,
  nearestOn,
  pointAlong,
  underLand,
} from './rivers';
import {
  Relief,
  ReliefShape,
  SURFACES,
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
  // Whether there's a river on the square at (`x`, `y`): Civ1's `River` terrain, or Civ2's `River` feature. None where
  //  it's not given.
  riverAt?(x: number, y: number): boolean;
  // The squares next to (`x`, `y`) across an edge, as the topology has them (`edgeDirections`), which a river joins.
  edgeNeighbours?(x: number, y: number): [number, number][];
};

/** A point's height, in world units, and its colour, as linear red, green and blue from 0 to 1. */
export type GroundSample = {
  height: number;
  colour: [number, number, number];
  // How much of each surface (`SURFACES`, in order) its ground is, blended as its colour is, summing to 1: or none, on
  //  a square never seen.
  surfaces: number[];
  // How much of what its ground's blended from, as its surfaces are, is water squares: 1 at sea, 0 inland, between at
  //  the shore.
  shore: number;
  // Whether the point is on a square never seen, which cloud covers.
  unseen: boolean;
};

export interface ReliefMap {
  sample(u: number, v: number): GroundSample;
  height(u: number, v: number): number;
  /**
   * Reads every square's terrain again, after the world's tiles have changed: the squares whose land has, those whose
   *  terrain has and the mountains a range joins to them, or did, whose ridge to them has come or gone. Given
   *  `released`, those alone are looked at first, and the rest read again only if one of them has changed, as most
   *  changes (a unit moving, a city growing) change no terrain, and reading it all takes milliseconds. A square seen
   *  changes the land carried on into squares never seen (`UNDER_CLOUD`) too, beside it and wherever else that's
   *  blended from it, which aren't listed: `Land` rebuilds the land over its own reach round each square listed
   *  (`Land#reach`, 4 or 5), which takes them in.
   */
  refresh(
    released?: readonly (readonly [number, number])[]
  ): [number, number][];
  /** Every river's course, once each, with the middle of the square that makes it, on the world's first copy. */
  courses(): readonly { course: Course; u: number; v: number }[];
  /**
   * The rivers' courses that reach into the square at (`x`, `y`), each placed at that square's copy of the world: its
   *  points, and how wide its water is either side at each. None made by a square never seen, but those made beside
   *  one can reach into it, and cut the land carried on there (`UNDER_CLOUD`).
   */
  coursesAt(x: number, y: number): readonly RiverPath[];
}

/**
 * A river's course where it lies on the ground: its points (`u`, `v`), and at each how wide its water is either side,
 *  and its level, which its channel's cut under (`rivers.ts`).
 */
export type RiverPath = {
  points: readonly (readonly [number, number])[];
  widths: readonly number[];
  levels: readonly number[];
};

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

// Land never seen with no land seen near: flat, at sea level, the colour of land never seen, with no surface.
const UNSEEN_COLOUR = linear(unknownTerrain.colour);

const flatUnseen = (): GroundSample => ({
  height: 0,
  colour: [...UNSEEN_COLOUR],
  surfaces: SURFACES.map(() => 0),
  shore: 0,
  unseen: true,
});

// A river's banks, wet: darker, muddy, and how much of it they take at the water's edge; and over how far they fade out
//  as the land comes down to the sea's level, where the sea's drawn.
const WET_BANK = linear('#3e4630'),
  WET_SHARE = 0.55,
  WET_FADE = 0.0002;

// A river's course, kept by its ends: how it's drawn and the squares it reaches into, to tell which have changed; and
//  the middle of the square that makes it, on the world's first copy.
type Kept = {
  drawn: string;
  into: number[];
  course: Course;
  u: number;
  v: number;
  // The lowest of the land round each of its points (`rivers`), kept till land it reaches into changes.
  lows: number[];
};

// What's kept for each square, read once per refresh: and for a peak, where it stands off the square's middle and how
//  much taller or lower it is than the terrain's, its own, so a range of mountains isn't a grid of cones.
type Square = {
  relief: Relief;
  colour: [number, number, number];
  // Its surface, by its place in `SURFACES`: the sea's floor is sand.
  surface: number;
  // Whether it's water, as the engine says.
  water: boolean;
  unknown: boolean;
  peak: { u: number; v: number; scale: number };
};

/** How far a peak can stand off its square's middle, and a terrain's colour reach past its edge, in world units. */
export const WANDER = 0.22;

/** How far a range's saddle can stand off the line between its two peaks, either way, in world units. */
export const BEND = 0.12;

/**
 * Land never seen beside land seen (#1393): the seen land carries on under the cloud, as it's blended, rather than
 *  dropping to sea level at the edge as a wall. What stands over `ceiling` is brought down to it, under the cloud
 *  (`CLOUD_HEIGHT`, 0.18), smoothly from the edge, wholly by `within` from it (in world units), where the cloud's
 *  whole; and from `flatFrom` to `flat` it all comes down to sea level, as land seen nowhere near is. `flat` is under
 *  the nearest a square comes to one not beside it, on any grid (a hex's, 1/√3), so only squares beside land seen
 *  have any.
 */
export const UNDER_CLOUD = {
  ceiling: 0.14,
  within: 0.3,
  flatFrom: 0.4,
  flat: 0.55,
} as const;

// How low a range's saddle is between its peaks, as a share of the lower peak's own height: from `low` to `high`.
const SADDLE = { low: 0.2, high: 0.5 };

// A range's ridge between two neighbouring peaks: its crest runs from one peak (`a`) down to its saddle (`m`) and up
//  to the other (`b`), each point as (`u`, `v`) from the middle of the square that makes it, and how high each stands
//  over the blend, as a peak's own height is. How rough it is, as its peaks are. And a circle round it as far as it
//  reaches (`cu`, `cv`, and its radius squared), past which it's nothing.
type Ridge = {
  au: number;
  av: number;
  ah: number;
  mu: number;
  mv: number;
  mh: number;
  bu: number;
  bv: number;
  bh: number;
  roughness: number;
  cu: number;
  cv: number;
  reach: number;
};

// Half a ridge, at (`pu`, `pv`): from its peak at (`su`, `sv`), `sh` high, to its saddle at (`eu`, `ev`), `eh` high.
//  Its crest falls from the peak and levels out at the saddle; across it, the land falls away by the kernel squared,
//  as a peak's does, so the end past its peak is that peak exactly. `rough` is the noise on it there. Where it doesn't
//  reach, it's nothing, lower than any land.
const halfRidge = (
  pu: number,
  pv: number,
  su: number,
  sv: number,
  sh: number,
  eu: number,
  ev: number,
  eh: number,
  rough: number
): number => {
  const du = eu - su,
    dv = ev - sv,
    length = du * du + dv * dv,
    t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((pu - su) * du + (pv - sv) * dv) / length)),
    w = weight(Math.hypot(pu - su - du * t, pv - sv - dv * t)),
    fall = 1 - t;

  return w === 0
    ? -Infinity
    : w * w * (sh + (eh - sh) * (1 - fall * fall * fall) + rough);
};

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
  ranges: joined = true,
  seed = 1,
  source,
}: {
  layout: GroundLayout;
  // Whether neighbouring peaks are joined into ranges: they are, unless asked not to (for the tests to compare).
  ranges?: boolean;
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

  // Every square's terrain, by its index on the world, and what it was read as, to tell which have changed since. And
  //  the ridges of the ranges that reach into each square, for its points to take, and where the middle of the square
  //  each was made by is from its own (`u`, `v` by turns).
  let squares: Square[] = [],
    read: string[] = [],
    ridgesIn: Ridge[][] = [],
    madeFrom: number[][] = [],
    // Which squares a range joins: peaks seen, on land.
    ranged: boolean[] = [],
    // Which squares never seen have a square seen beside them, across an edge or a corner: those whose land carries on
    //  what's seen. No point of any other is within `UNDER_CLOUD.flat` of land seen, on any grid (the relief suite
    //  checks), so any other is flat.
    frontier: boolean[] = [],
    // The rivers' courses that reach into each square, and where the middle of the square each was made by is from its
    //  own, as with ranges; and each course, by its ends, as it's drawn and the squares it reaches into, to tell which
    //  have changed.
    riversIn: Course[][] = [],
    riversFrom: number[][] = [],
    coursesBy = new Map<string, Kept>();

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

  // What the square at (`x`, `y`) is read as: its terrain's name, whether it's water, and whether it has a river.
  const readAs = (x: number, y: number): string => {
    const name = source.terrainAt(x, y);

    return name === 'Unknown'
      ? name
      : `${name}${source.waterAt(x, y) ? ' water' : ''}${
          source.riverAt?.(x, y) === true ? ' river' : ''
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
      entries: TerrainEntry[] = [],
      now: string[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const name = source.terrainAt(x, y);

        names.push(name);
        water.push(name !== 'Unknown' && source.waterAt(x, y));
        entries.push(terrainEntry(name));
        now.push(readAs(x, y));
      }
    }

    const distance = distancesFromLand(
        names.map((name, at) => name !== 'Unknown' && !water[at])
      ),
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
          surface: SURFACES.indexOf(entry.surface),
          water: false,
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
        surface: SURFACES.indexOf('sand'),
        water: true,
        unknown,
        peak,
      };
    });

    // The squares whose land has changed: those whose terrain has, and the peaks a range joins to one of them, or did,
    //  whose ridge to it has come or gone.
    const was = ranged,
      reshaped = new Map<string, [number, number]>(
        changed.map(([x, y]) => [`${x},${y}`, [x, y]])
      );

    ranged = squares.map(
      ({ relief, unknown }, at) =>
        !unknown && !water[at] && relief.shape === 'peaked'
    );
    frontier = squares.map(
      ({ unknown }, at) =>
        unknown &&
        source.neighbours(at % width, Math.floor(at / width)).some(([x, y]) => {
          const there = index(x, y);

          return there !== null && squares[there]?.unknown === false;
        })
    );

    // The ranges made again only when a square they join has changed, or one now joins them: a square of sea or plain
    //  newly seen, the most common change, leaves them as they are.
    if (
      changed.some(([x, y]) => {
        const at = y * width + x;

        return ranged[at] === true || was[at] === true;
      })
    ) {
      [ridgesIn, madeFrom] = ranges();
    }

    changed.forEach(([x, y]) => {
      const at = y * width + x;

      if (ranged[at] !== true && was[at] !== true) {
        return;
      }

      source.neighbours(x, y).forEach(([nx, ny]) => {
        const there = index(nx, ny);

        // One that's no longer ranged has changed itself.
        if (there !== null && ranged[there] === true) {
          reshaped.set(`${nx},${ny}`, [nx, ny]);
        }
      });
    });

    // The rivers made again, now the land's as it is, and every square a river that's changed reaches into, or did.
    //  The land round a course is looked at again only where it may have changed: within a few steps of a square
    //  whose land has, as far as the sea's floor's walk, as land that comes or goes deepens or shallows the sea that
    //  far out, which the land at the shore is blended from.
    if (changed.length > 0) {
      const old = coursesBy,
        stale = new Set<number>(),
        walked: [number, number, number][] = [...reshaped.values()].map(
          ([x, y]) => [x, y, 0]
        );

      for (const [x, y, out] of walked) {
        const at = index(x, y);

        if (at === null || stale.has(at)) {
          continue;
        }

        stale.add(at);

        if (out <= seaFloor.reach) {
          source
            .neighbours(x, y)
            .forEach(([nx, ny]) => walked.push([nx, ny, out + 1]));
        }
      }

      [riversIn, riversFrom, coursesBy] = rivers(water, old, stale);

      new Set([...old.keys(), ...coursesBy.keys()]).forEach((key) => {
        const before = old.get(key),
          after = coursesBy.get(key);

        if (
          before !== undefined &&
          after !== undefined &&
          before.drawn === after.drawn
        ) {
          return;
        }

        [...(before?.into ?? []), ...(after?.into ?? [])].forEach((at) =>
          reshaped.set(`${at % width},${Math.floor(at / width)}`, [
            at % width,
            Math.floor(at / width),
          ])
        );
      });
    }

    return [...reshaped.values()];
  };

  // How far a square's furthest corner is from its middle, on a row of each parity.
  const cornerOf = (parity: number): number => {
    const [cu, cv] = layout.centre(0, parity);

    return Math.max(
      ...layout.outline(0, parity).map(([u, v]) => Math.hypot(u - cu, v - cv))
    );
  };

  // The offsets from a square, by its row's parity, of every square whose middle is within `radius` of its middle.
  const offsetsWithin = (
    parity: number,
    radius: number
  ): [number, number][] => {
    const [cu, cv] = layout.centre(0, parity),
      found: [number, number][] = [];

    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const [u, v] = layout.centre(dx, parity + dy);

        if (Math.hypot(u - cu, v - cv) < radius + 1e-9) {
          found.push([dx, dy]);
        }
      }
    }

    return found;
  };

  // The ways from the square at (`x`, `y`) to its neighbour at (`nx`, `ny`) on the world: to the copy of it whose
  //  middle is nearest, across the world's seam or over its poles if that's nearer, or to each that's as near (on a
  //  world two squares across, or down). By its middle, not its index: on the staggered and hex grids, a row's
  //  neighbours lie half a step aside.
  const stepsTo = (
    x: number,
    y: number,
    nx: number,
    ny: number
  ): [number, number][] => {
    // On a world six squares or more each way it wraps, a neighbour's nearest copy is the nearest by its index: it's
    //  a step or two away one way, and four or more the other.
    if (width >= 6 && (!wrapsY || height >= 6)) {
      const nearest = (delta: number, period: number): number => {
          const ahead = ((delta % period) + period) % period;

          return ahead * 2 < period ? ahead : ahead - period;
        },
        dx = nearest(nx - x, width),
        dy = wrapsY ? nearest(ny - y, height) : ny - y;

      return dx === 0 && dy === 0 ? [] : [[dx, dy]];
    }

    // Each copy's way, one the near side of the world, one the far.
    const copies = (delta: number, period: number): number[] => {
        const ahead = ((delta % period) + period) % period;

        return ahead === 0 ? [0] : [ahead, ahead - period];
      },
      [cu, cv] = layout.centre(x, y),
      ways = copies(nx - x, width).flatMap((dx) =>
        (wrapsY ? copies(ny - y, height) : [ny - y]).flatMap(
          (dy): [number, number, number][] => {
            if (dx === 0 && dy === 0) {
              return [];
            }

            const [u, v] = layout.centre(x + dx, y + dy);

            return [[dx, dy, Math.hypot(u - cu, v - cv)]];
          }
        )
      ),
      nearest = Math.min(...ways.map(([, , away]) => away));

    return ways
      .filter(([, , away]) => away <= nearest + 1e-9)
      .map(([dx, dy]) => [dx, dy]);
  };

  // How far a square's furthest neighbour's middle is from its own, on a row of either parity.
  const furthest = Math.max(
    ...[0, 1].flatMap((parity) => {
      const [cu, cv] = layout.centre(0, parity);

      return source.neighbours(0, parity).flatMap(([nx, ny]) =>
        stepsTo(0, parity, nx, ny).map(([dx, dy]) => {
          const [u, v] = layout.centre(dx, parity + dy);

          return Math.hypot(u - cu, v - cv);
        })
      );
    }),
    1
  );

  // The squares a ridge can reach into, from the square it's kept by, by its row's parity: as far as its far peak is,
  //  the furthest neighbour's middle, and as far again as that peak wanders and its saddle bends, and the kernel's
  //  reach past that to a square's furthest corner.
  //  Each with where its middle is from the square's, worked out once.
  const reachOfRidges = [0, 1].map((parity) => {
    const [cu, cv] = layout.centre(0, parity);

    return offsetsWithin(
      parity,
      furthest +
        WANDER * Math.SQRT2 +
        BEND +
        REACH +
        Math.max(cornerOf(0), cornerOf(1))
    ).flatMap(([dx, dy]) => {
      const [u, v] = layout.centre(dx, parity + dy);

      return [dx, dy, u - cu, v - cv];
    });
  });

  // How far the point (`pu`, `pv`) is from the line from (`su`, `sv`) to (`eu`, `ev`).
  const toSegment = (
    pu: number,
    pv: number,
    su: number,
    sv: number,
    eu: number,
    ev: number
  ): number => {
    const du = eu - su,
      dv = ev - sv,
      length = du * du + dv * dv,
      t =
        length === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((pu - su) * du + (pv - sv) * dv) / length)
            );

    return Math.hypot(pu - su - du * t, pv - sv - dv * t);
  };

  // Every range's ridge, joining each peak to each neighbouring peak, across an edge or a corner, listed under every
  //  square it reaches into, with where the square that made it is from that square's middle. Each is made once, by the
  //  end that comes first down the world (or along it, on the same row), so every square it reaches, at every copy of
  //  the world, has the same ridge.
  const ranges = (): [Ridge[][], number[][]] => {
    const listed: Ridge[][] = squares.map(() => []),
      offsetsOf: number[][] = squares.map(() => []),
      corner = Math.max(cornerOf(0), cornerOf(1));

    if (!joined) {
      return [listed, offsetsOf];
    }

    squares.forEach((square, at) => {
      if (ranged[at] !== true) {
        return;
      }

      const x = at % width,
        y = Math.floor(at / width),
        [cu, cv] = layout.centre(x, y);

      // The way to each ranged neighbour, once each, with its index on the world.
      const steps = new Map<string, [number, number, number]>();

      source.neighbours(x, y).forEach(([nx, ny]) => {
        const there = index(nx, ny);

        if (there !== null && ranged[there] === true) {
          stepsTo(x, y, nx, ny).forEach(([dx, dy]) =>
            steps.set(`${dx},${dy}`, [dx, dy, there])
          );
        }
      });

      steps.forEach(([dx, dy, there]) => {
        const other = squares[there];

        if (other === undefined) {
          return;
        }

        // Made by the other end.
        if (dy < 0 || (dy === 0 && dx < 0)) {
          return;
        }

        const [tu, tv] = layout.centre(x + dx, y + dy),
          { peak: from, relief: fromRelief } = square,
          { peak: to, relief: toRelief } = other,
          au = from.u,
          av = from.v,
          bu = tu - cu + to.u,
          bv = tv - cv + to.v,
          ah = fromRelief.base * PEAK_SHARE * from.scale,
          bh = toRelief.base * PEAK_SHARE * to.scale,
          length = Math.hypot(bu - au, bv - av) || 1,
          // Each ridge its own, from the square it's made by and which way it runs.
          salt = 16 + (dy + 2) * 5 + (dx + 2),
          bend = (chance(x, y, seed, salt) * 2 - 1) * BEND,
          share =
            SADDLE.low +
            (SADDLE.high - SADDLE.low) * chance(x, y, seed, salt + 32),
          mu = (au + bu) / 2 - ((bv - av) / length) * bend,
          mv = (av + bv) / 2 + ((bu - au) / length) * bend,
          // A circle round it as far as it reaches: about its saddle, out to the further peak, and the kernel's reach.
          reach =
            Math.max(
              Math.hypot(au - mu, av - mv),
              Math.hypot(bu - mu, bv - mv)
            ) + REACH,
          ridge: Ridge = {
            au,
            av,
            ah,
            mu,
            mv,
            mh: share * Math.min(ah, bh),
            bu,
            bv,
            bh,
            roughness: (fromRelief.roughness + toRelief.roughness) / 2,
            cu: mu,
            cv: mv,
            reach: reach * reach,
          };

        // As far from its saddle as a square's middle can be with it reaching into the square, and from its crest.
        const near = (Math.sqrt(ridge.reach) + corner) ** 2,
          candidates = reachOfRidges[y & 1] ?? [];

        // Each candidate square: its offset (`dx`, `dy`) and where its middle is (`ou`, `ov`), four numbers to one.
        for (let at = 0; at < candidates.length; at += 4) {
          const ou = candidates[at + 2]!,
            ov = candidates[at + 3]!;

          if (
            (ou - mu) ** 2 + (ov - mv) ** 2 >= near ||
            Math.min(
              toSegment(ou, ov, au, av, mu, mv),
              toSegment(ou, ov, mu, mv, bu, bv)
            ) >=
              REACH + corner
          ) {
            continue;
          }

          const into = index(x + candidates[at]!, y + candidates[at + 1]!);

          if (into !== null) {
            listed[into]?.push(ridge);
            offsetsOf[into]?.push(ou, ov);
          }
        }
      });
    });

    return [listed, offsetsOf];
  };

  // The squares a river's course can reach into, from the square that makes it, by its row's parity: as far as the
  //  furthest neighbour's middle, and its bend, and its mouth's width, its bed and its bank, and a square's furthest
  //  corner past that. Each with where its middle is from the square's.
  const widest = Math.max(RIVER_WIDTH * MOUTH, POOL_WIDTH),
    reachOfRivers = [0, 1].map((parity) => {
      const [cu, cv] = layout.centre(0, parity);

      return offsetsWithin(
        parity,
        furthest +
          MEANDER +
          widest +
          FLOOR +
          BANK +
          Math.max(cornerOf(0), cornerOf(1))
      ).flatMap(([dx, dy]) => {
        const [u, v] = layout.centre(dx, parity + dy);

        return [dx, dy, u - cu, v - cv];
      });
    });

  // Every river's course (`rivers.ts`): from each river square seen, on land, to each neighbour seen across an edge
  //  with a river, made once, by the end that comes first down the world (or along it, on the same row), as a range's
  //  ridge is; to each such neighbour that's water, a mouth; or, with neither, a pool. Each with its level: at each end,
  //  under the lowest of the land seen and dry round every course from that end (of a mouth, only up to the coast), as
  //  it would be with no rivers; between them, from one to the other, but never over the land round each point; and a
  //  mouth's down to the sea's at the coast. Listed under every square it reaches into, as ridges
  //  are; and by its ends, with how it's drawn and the squares it reaches into, to tell which change. The land round
  //  a course is looked at again only where one of the squares it reaches into is `stale`: otherwise it's as `kept`.
  const rivers = (
    water: boolean[],
    kept: ReadonlyMap<string, Kept>,
    stale: ReadonlySet<number>
  ): [Course[][], number[][], Map<string, Kept>] => {
    const listed: Course[][] = squares.map(() => []),
      offsetsOf: number[][] = squares.map(() => []),
      byKey = new Map<string, Kept>(),
      period = layout.period(),
      edgeNeighbours = source.edgeNeighbours,
      rivered = squares.map(
        ({ unknown }, at) =>
          !unknown &&
          water[at] !== true &&
          source.riverAt?.(at % width, Math.floor(at / width)) === true
      );

    if (edgeNeighbours === undefined || !rivered.includes(true)) {
      return [listed, offsetsOf, byKey];
    }

    const made: {
      course: Course;
      x: number;
      y: number;
      key: string;
      from: number;
      to: number | null;
    }[] = [];

    rivered.forEach((isRiver, at) => {
      if (!isRiver) {
        return;
      }

      const x = at % width,
        y = Math.floor(at / width),
        [cu, cv] = layout.centre(x, y),
        // The way to each neighbour it joins, once each, with its index on the world.
        steps = new Map<string, [number, number, number]>();

      edgeNeighbours(x, y).forEach(([nx, ny]) => {
        const there = index(nx, ny);

        // Neither a river nor water: or never seen, which is neither.
        if (
          there === null ||
          (rivered[there] !== true && water[there] !== true)
        ) {
          return;
        }

        stepsTo(x, y, nx, ny).forEach(([dx, dy]) =>
          steps.set(`${dx},${dy}`, [dx, dy, there])
        );
      });

      if (steps.size === 0) {
        made.push({
          course: courseFrom(x, y, 0, 0, { seed }),
          x,
          y,
          key: `${at}`,
          from: at,
          to: null,
        });

        return;
      }

      steps.forEach(([dx, dy, there]) => {
        const mouth = water[there] === true;

        // Between two rivers, made by the other end.
        if (!mouth && (dy < 0 || (dy === 0 && dx < 0))) {
          return;
        }

        const [tu, tv] = layout.centre(x + dx, y + dy);

        made.push({
          course: courseFrom(x, y, tu - cu, tv - cv, {
            mouth,
            salt: (dy + 2) * 5 + (dx + 2),
            seed,
          }),
          x,
          y,
          key: `${at}${mouth ? '~' : '>'}${dx},${dy}`,
          from: at,
          to: mouth ? null : there,
        });
      });
    });

    // The lowest of the land seen and dry round each of each course's points: at it, and either side at its bed's edge
    //  and at its bank's top, there and halfway to the points either side of it, so a dip between two is counted.
    const lows = made.map(({ course, x, y, key }) => {
      const before = kept.get(key);

      // As it was, where none of the land it reaches into has changed.
      if (before !== undefined && !before.into.some((at) => stale.has(at))) {
        return before.lows;
      }

      const [cu, cv] = layout.centre(x, y),
        pool = course.points.every((n) => n === 0);

      const lowAt = (along: number): number => {
        const [pu, pv, du, dv] = pointAlong(course, along),
          bed = alongOf(course.widths, along) + FLOOR,
          length = Math.hypot(du, dv),
          // At its bed's edge, and its bank's top.
          ways: [number, number][] = [bed, bed + BANK].flatMap((out) =>
            pool
              ? Array.from({ length: 8 }, (_, way): [number, number] => [
                  Math.cos((way * Math.PI) / 4) * out,
                  Math.sin((way * Math.PI) / 4) * out,
                ])
              : [
                  [(-dv / length) * out, (du / length) * out],
                  [(dv / length) * out, (-du / length) * out],
                ]
          );
        let low = Infinity;

        [[0, 0] as [number, number], ...ways].forEach(([ou, ov]) => {
          const u = cu + pu + ou,
            v = cv + pv + ov,
            [sx, sy] = layout.tileAt(u, v),
            there = index(sx, sy),
            square = there === null ? undefined : squares[there];

          if (square !== undefined && !square.unknown && !square.water) {
            low = Math.min(low, landAt(u, v).height);
          }
        });

        return low;
      };

      const halves = Array.from({ length: STEPS * 2 + 1 }, (_, half) =>
        lowAt(half / 2)
      );

      return course.widths.map((_, step) =>
        Math.min(
          halves[step * 2] ?? Infinity,
          halves[step * 2 - 1] ?? Infinity,
          halves[step * 2 + 1] ?? Infinity
        )
      );
    });

    // Each end's level, the same for every course from it, so they meet at one: under the lowest round each's end there.
    const ends = new Map<number, number>();

    made.forEach(({ from, to }, which) => {
      const low = lows[which] ?? [];

      ends.set(from, Math.min(ends.get(from) ?? Infinity, low[0] ?? Infinity));

      if (to !== null) {
        ends.set(
          to,
          Math.min(ends.get(to) ?? Infinity, low[STEPS] ?? Infinity)
        );
      }
    });

    const levelAt = (end: number): number => {
        const low = ends.get(end) ?? Infinity;

        return Number.isFinite(low) ? underLand(low) : 0;
      },
      corner = Math.max(cornerOf(0), cornerOf(1));

    // Between its ends, from one's level to the other's, but never over the land round each point: a mouth's from its
    //  end's down to the sea's at the coast, and on down under it, so its bed's under the sea past the coast.
    made.forEach(({ course, x, y, key, from, to }, which) => {
      const a = levelAt(from),
        b = to === null ? (course.mouth ? Math.min(0, a) : a) : levelAt(to),
        low = lows[which] ?? [];

      course.levels = course.widths.map((_, step) => {
        // Each end exactly its end's level.
        const t = step / STEPS,
          between = !course.mouth
            ? a * (1 - t) + b * t
            : t <= 0.5
            ? a * (1 - t * 2) + b * t * 2
            : b - (t - 0.5) * 2 * DEPTH;

        return step === 0 || (step === STEPS && !course.mouth)
          ? between
          : Math.min(between, underLand(low[step] ?? Infinity));
      });

      const candidates = reachOfRivers[y & 1] ?? [],
        near = (Math.sqrt(course.reach) + corner) ** 2,
        into: number[] = [];

      for (let at = 0; at < candidates.length; at += 4) {
        const ou = candidates[at + 2]!,
          ov = candidates[at + 3]!;

        if (
          (ou - course.cu) ** 2 + (ov - course.cv) ** 2 >= near ||
          nearestOn(course, ou, ov)[0] >= widest + FLOOR + BANK + corner
        ) {
          continue;
        }

        const there = index(x + candidates[at]!, y + candidates[at + 1]!);

        if (there !== null) {
          listed[there]?.push(course);
          offsetsOf[there]?.push(ou, ov);
          into.push(there);
        }
      }

      const [mu, mv] = layout.centre(x, y);

      byKey.set(key, {
        drawn: JSON.stringify([course.points, course.widths, course.levels]),
        into,
        lows: lows[which] ?? [],
        course,
        u: ((mu % period.u) + period.u) % period.u,
        v: period.v === null ? mv : ((mv % period.v) + period.v) % period.v,
      });
    });

    return [listed, offsetsOf, byKey];
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

  // Each square's outline, from its middle, by its row's parity: (`u`, `v`) by turns.
  const outlines = [0, 1].map((parity) => {
    const [cu, cv] = layout.centre(0, parity);

    return layout.outline(0, parity).flatMap(([u, v]) => [u - cu, v - cv]);
  });

  // How far a point (`pu`, `pv`, from a square's middle) is from the square, on a row of `parity`: from its nearest
  //  edge, as it's outside it.
  const fromOutline = (pu: number, pv: number, parity: number): number => {
    const corners = outlines[parity] ?? [],
      count = corners.length / 2;
    let least = Infinity;

    for (let at = 0; at < count; at++) {
      const next = (at + 1) % count;

      least = Math.min(
        least,
        toSegment(
          pu,
          pv,
          corners[at * 2]!,
          corners[at * 2 + 1]!,
          corners[next * 2]!,
          corners[next * 2 + 1]!
        )
      );
    }

    return least;
  };

  // The land at (`u`, `v`) as it would be with no rivers: what their levels are taken from.
  const landAt = (u: number, v: number): GroundSample => {
    const [x0, y0] = layout.tileAt(u, v),
      own = index(x0, y0),
      ownSquare = own === null ? null : squares[own] ?? null;

    // Off a world that doesn't wrap over the poles, or never seen with nothing seen beside it: flat, at sea level.
    if (
      own === null ||
      ownSquare === null ||
      (ownSquare.unknown && frontier[own] !== true)
    ) {
      return flatUnseen();
    }

    // Never seen: how far it is from the nearest land seen, and flat if that's as far as land carried on reaches,
    //  before the blend's worked out.
    let fromSeen = Infinity;

    if (ownSquare.unknown) {
      (offsets[y0 & 1] ?? []).forEach(([dx, dy]) => {
        const x = x0 + dx,
          y = y0 + dy,
          at = index(x, y);

        if (at !== null && squares[at]?.unknown === false) {
          const [cu, cv] = layout.centre(x, y);

          fromSeen = Math.min(fromSeen, fromOutline(u - cu, v - cv, y & 1));
        }
      });

      if (fromSeen >= UNDER_CLOUD.flat) {
        return flatUnseen();
      }
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
      // Each surface's share, weighed as the colour is, but of squares seen alone: a square never seen has none.
      surfaces = SURFACES.map(() => 0),
      surfaced = 0,
      watered = 0,
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
        { relief, colour, peak, surface } = square,
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

      if (!square.unknown) {
        surfaces[surface] = (surfaces[surface] ?? 0) + shade;
        surfaced += shade;
        watered += square.water ? shade : 0;
      }

      red += shade * colour[0];
      green += shade * colour[1];
      blue += shade * colour[2];
    });

    // The ranges through this square: the highest of them and the peaks, so a ridge leaves its own peaks as they are.
    const through = own === null ? [] : ridgesIn[own] ?? [],
      makers = own === null ? [] : madeFrom[own] ?? [];
    let mountains = peaks;

    if (through.length > 0) {
      const [ou, ov] = layout.centre(x0, y0);

      through.forEach((ridge, which) => {
        // The point, from the middle of the square that made the ridge.
        const pu = u - ou + (makers[which * 2] ?? 0),
          pv = v - ov + (makers[which * 2 + 1] ?? 0);

        if ((pu - ridge.cu) ** 2 + (pv - ridge.cv) ** 2 >= ridge.reach) {
          return;
        }

        const rough = ridge.roughness * noiseHere('ridged') * 0.5;

        mountains = Math.max(
          mountains,
          halfRidge(
            pu,
            pv,
            ridge.au,
            ridge.av,
            ridge.ah,
            ridge.mu,
            ridge.mv,
            ridge.mh,
            rough
          ),
          halfRidge(
            pu,
            pv,
            ridge.bu,
            ridge.bv,
            ridge.bh,
            ridge.mu,
            ridge.mv,
            ridge.mh,
            rough
          )
        );
      });
    }

    // Never seen (`UNDER_CLOUD`): the land seen beside it carries on under the cloud, as it's blended, so there's no
    //  wall at the edge, brought under the cloud where it's whole, and to sea level further off; with no surface, as
    //  the cloud's. Never under sea level, as no water's drawn over it.
    if (ownSquare.unknown) {
      const carried = (total > 0 ? blended / total : 0) + mountains,
        under = smooth(0, UNDER_CLOUD.within, fromSeen),
        flat = smooth(UNDER_CLOUD.flatFrom, UNDER_CLOUD.flat, fromSeen),
        [red0, green0, blue0] = ownSquare.colour;

      return {
        height:
          Math.max(
            0,
            carried * (1 - under) +
              Math.min(carried, UNDER_CLOUD.ceiling) * under
          ) *
          (1 - flat),
        colour:
          shades > 0
            ? [
                red / shades + (red0 - red / shades) * flat,
                green / shades + (green0 - green / shades) * flat,
                blue / shades + (blue0 - blue / shades) * flat,
              ]
            : ownSquare.colour,
        surfaces: SURFACES.map(() => 0),
        shore: 0,
        unseen: true,
      };
    }

    return {
      height: (total > 0 ? blended / total : 0) + mountains,
      colour:
        shades > 0
          ? [red / shades, green / shades, blue / shades]
          : ownSquare.colour,
      // Never none at a point seen: its own square's middle is within the kernel's reach of where the colour's taken
      //  from (its furthest corner and `WANDER` along both ways, 1.02 at most, against `REACH`, 1.2).
      surfaces:
        surfaced > 0
          ? surfaces.map((share) => share / surfaced)
          : SURFACES.map((_, at) => (at === ownSquare.surface ? 1 : 0)),
      shore: surfaced > 0 ? watered / surfaced : ownSquare.water ? 1 : 0,
      unseen: false,
    };
  };

  // The land as the rivers through its square cut it, the lowest any does, and its banks wet as the wettest makes them.
  const sample = (u: number, v: number): GroundSample => {
    const land = landAt(u, v);

    // Never seen and at sea level, as all of it is but what's carried on from land seen beside it: as it is, as no
    //  river cuts it under sea level. Carried on, the rivers there cut it as they cut the land seen, so there's no wall
    //  at the edge there either.
    if (land.unseen && land.height <= 0) {
      return land;
    }

    const [x0, y0] = layout.tileAt(u, v),
      own = index(x0, y0),
      through = own === null ? [] : riversIn[own] ?? [],
      makers = own === null ? [] : riversFrom[own] ?? [];

    if (through.length === 0) {
      return land;
    }

    const [ou, ov] = layout.centre(x0, y0);
    let cut = land.height,
      wet = 0;

    through.forEach((course, which) => {
      const [height, wetness] = cutBy(
        course,
        u - ou + (makers[which * 2] ?? 0),
        v - ov + (makers[which * 2 + 1] ?? 0),
        land.height
      );

      cut = Math.min(cut, land.unseen ? Math.max(0, height) : height);
      wet = Math.max(wet, wetness);
    });

    if (wet === 0 && cut === land.height) {
      return land;
    }

    // Not where the sea's drawn, in a mouth or on the sea's floor under it: banks are land, so they fade out as the land
    //  comes down the last `WET_FADE` to the sea's level, which a river's bed only comes down to within a thousandth or
    //  so of the sea's.
    const dry = Math.max(0, Math.min(1, cut / WET_FADE)),
      share = wet * WET_SHARE * dry * dry * (3 - 2 * dry),
      [red, green, blue] = land.colour;

    return {
      ...land,
      height: cut,
      colour: [
        red + (WET_BANK[0] - red) * share,
        green + (WET_BANK[1] - green) * share,
        blue + (WET_BANK[2] - blue) * share,
      ],
    };
  };

  refresh();

  return {
    sample,
    height: (u: number, v: number): number => sample(u, v).height,
    refresh,
    coursesAt: (x, y) => {
      const at = index(x, y),
        through = at === null ? [] : riversIn[at] ?? [],
        makers = at === null ? [] : riversFrom[at] ?? [],
        [cu, cv] = layout.centre(x, y);

      // Where the middle of the square that made each is, from this square's at this copy of the world.
      return through.map((course, which) => {
        const mu = cu - (makers[which * 2] ?? 0),
          mv = cv - (makers[which * 2 + 1] ?? 0);

        return {
          points: course.widths.map((_, step): [number, number] => [
            mu + (course.points[step * 2] ?? 0),
            mv + (course.points[step * 2 + 1] ?? 0),
          ]),
          widths: course.widths,
          levels: course.levels,
        };
      });
    },
    courses: () =>
      [...coursesBy.values()].map(({ course, u, v }) => ({ course, u, v })),
  };
};

export default createRelief;
