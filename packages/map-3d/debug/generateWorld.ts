// A made-up world for the 3D map's debug page (docs/3d-renderer-plan.md 1.1b): land and sea, hills and mountains,
//  rivers running down to the sea, and the terrains a Civ1 world has, by latitude and how wet the land is. Not the
//  engine's generator, and not meant to play on: it's for seeing the land on any grid, the isometric grid included,
//  without starting a game.
//
// It's built on the ground, not on the grid: each square's terrain comes from noise at its middle on the ground
//  (`GroundLayout`), noise that repeats over the world's period, so a world on any grid wraps without a seam.
//
// Deterministic: the same options always give the same world.

import { GroundLayout } from '../layouts/GroundLayout';
import groundLayoutFor from '../layouts';
import { fractalNoise, periodicNoise } from '../terrain/noise';
import topologyFor, {
  Topology,
  TopologyName,
} from '@civ-clone/ui-client/lib/topologyFor';

export type DebugWorldOptions = {
  topologyId: TopologyName;
  width: number;
  height: number;
  seed: number;
  // How much of the world has been seen, from 0 to 1: the rest is `Unknown`, as the client gets it.
  seen: number;
};

export type DebugWorld = {
  topology: Topology;
  layout: GroundLayout;
  // Each square's terrain, by `y` then `x`: `Unknown` where it hasn't been seen.
  terrain: string[][];
};

// How much of the world is land, as on a Civ1 world.
const LAND = 0.4;
// The share of the land that's mountains, and that's hills.
const MOUNTAINS = 0.07,
  HILLS = 0.12;

// A square's own fraction from 0 to 1, from its co-ordinates and the seed.
const chance = (x: number, y: number, seed: number): number => {
  let h =
    (Math.imul(x, 374761393) +
      Math.imul(y, 668265263) +
      Math.imul(seed, 2246822519)) |
    0;

  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;

  return (h >>> 0) / 4294967296;
};

// The value `share` of the way up `values`.
const quantile = (values: number[], share: number): number => {
  const sorted = [...values].sort((a, b) => a - b);

  return (
    sorted[
      Math.min(
        sorted.length - 1,
        Math.max(0, Math.floor(share * sorted.length))
      )
    ] ?? 0
  );
};

/** The world `options` describe. Throws for a size its grid can't be, as the engine would. */
export const generateWorld = ({
  topologyId,
  width,
  height,
  seed,
  seen,
}: DebugWorldOptions): DebugWorld => {
  const topology = topologyFor({ width, height, topologyId }),
    wrapsY = topology.wrapsY(),
    layout = groundLayoutFor({ width, height, topologyId, wrapsY }),
    period = layout.period(),
    noise = (cell: number, offset: number) =>
      periodicNoise({ cell, period, seed: seed * 101 + offset }),
    elevationAt = fractalNoise([noise(14, 0), noise(7, 1), noise(3.5, 2)]),
    wetnessAt = fractalNoise([noise(10, 3), noise(4, 4)]),
    // Breaks up the edge of what's been seen, so it isn't a circle.
    frontierAt = fractalNoise([noise(6, 5), noise(3, 6)]),
    squares: [number, number][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      squares.push([x, y]);
    }
  }

  const key = (x: number, y: number): number => y * width + x,
    middles = squares.map(([x, y]) => layout.centre(x, y)),
    elevation = middles.map(([u, v]) => elevationAt(u, v)),
    seaLevel = quantile(elevation, 1 - LAND),
    landElevation = elevation.filter((value) => value >= seaLevel),
    mountainLevel = quantile(landElevation, 1 - MOUNTAINS),
    hillLevel = quantile(landElevation, 1 - MOUNTAINS - HILLS),
    // 0 at the equator and 1 at the poles.
    latitude = (y: number): number => Math.abs(((y + 0.5) / height) * 2 - 1),
    terrain: string[][] = Array.from({ length: height }, () =>
      new Array<string>(width).fill('Ocean')
    );

  squares.forEach(([x, y], index) => {
    const value = elevation[index] ?? 0,
      [u, v] = middles[index] ?? [0, 0],
      wet = wetnessAt(u, v),
      lat = latitude(y),
      row = terrain[y];

    if (row === undefined) {
      return;
    }

    // The poles' ice, as on a Civ1 world: land or sea.
    if (y === 0 || y === height - 1) {
      row[x] = 'Arctic';

      return;
    }

    if (value < seaLevel) {
      return;
    }

    row[x] =
      value >= mountainLevel
        ? 'Mountains'
        : value >= hillLevel
        ? 'Hills'
        : lat > 0.88
        ? 'Arctic'
        : lat > 0.72
        ? 'Tundra'
        : wet > 0.3 && lat < 0.35
        ? 'Jungle'
        : wet > 0.35 && value < seaLevel + 0.04
        ? 'Swamp'
        : wet > 0.12
        ? 'Forest'
        : wet < -0.3 && lat < 0.5
        ? 'Desert'
        : wet < 0
        ? 'Plains'
        : 'Grassland';
  });

  const terrainAt = (x: number, y: number): string =>
      terrain[y]?.[x] ?? 'Ocean',
    elevationOf = (x: number, y: number): number => elevation[key(x, y)] ?? 0,
    neighbours = (x: number, y: number): [number, number][] =>
      topology
        .directions()
        .map((direction) => topology.neighbour(x, y, direction))
        .filter((square): square is [number, number] => square !== null),
    // Civ1's rivers are squares of their own: from the hills, each step to the lowest square next to it, until the sea.
    sources = squares
      .filter(([x, y]) => terrainAt(x, y) === 'Hills')
      .filter(([x, y]) => chance(x, y, seed) < 0.12);

  sources.forEach(([startX, startY]) => {
    let [x, y] = [startX, startY];

    for (let step = 0; step < width; step++) {
      const lowest = neighbours(x, y).reduce<[number, number] | null>(
        (best, square) =>
          best === null || elevationOf(...square) < elevationOf(...best)
            ? square
            : best,
        null
      );

      if (lowest === null || elevationOf(...lowest) >= elevationOf(x, y)) {
        return;
      }

      [x, y] = lowest;

      const there = terrainAt(x, y);

      if (there === 'Ocean' || there === 'Arctic') {
        return;
      }

      if (['Grassland', 'Plains', 'Desert', 'Forest'].includes(there)) {
        const row = terrain[y];

        if (row !== undefined) {
          row[x] = 'River';
        }
      }
    }
  });

  // What's been seen: the squares nearest the world's middle, by a frontier broken up by noise.
  if (seen < 1) {
    const [middleU, middleV] = layout.centre(
        Math.floor(width / 2),
        Math.floor(height / 2)
      ),
      round = (delta: number, span: number | null): number =>
        span === null ? delta : delta - span * Math.round(delta / span),
      reach = middles.map(
        ([u, v]) =>
          Math.hypot(
            round(u - middleU, period.u),
            round(v - middleV, period.v)
          ) *
          (1 + 0.35 * frontierAt(u, v))
      ),
      limit = seen <= 0 ? -Infinity : quantile(reach, seen);

    squares.forEach(([x, y], index) => {
      const row = terrain[y];

      if (row !== undefined && !((reach[index] ?? Infinity) <= limit)) {
        row[x] = 'Unknown';
      }
    });
  }

  return { topology, layout, terrain };
};

export default generateWorld;
