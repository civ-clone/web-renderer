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
    ranged: boolean[] = [];

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
      return {
        height: 0,
        colour: linear(unknownTerrain.colour),
        surfaces: SURFACES.map(() => 0),
        shore: 0,
        unseen: true,
      };
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

  refresh();

  return {
    sample,
    height: (u: number, v: number): number => sample(u, v).height,
    refresh,
  };
};

export default createRelief;
