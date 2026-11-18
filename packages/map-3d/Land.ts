// The land on the 3D map (docs/3d-renderer.md §4): the world's layout, its relief, and its chunks, built a few at a
//  time and handed to the stage that draws them. The nearest to where the map is centred are built first, so the land under the camera
//  is there at once and the rest follows over the next frames.
//
// A tile patch reads the world's terrain again, and builds again only the chunks round the squares whose terrain it
//  changed: as far as the kernel reaches from each, and from each square of sea whose floor it moved. Most patches
//  (a unit moving, a city growing) change no terrain, and build nothing.

import groundLayoutFor, { GroundLayout } from './layouts';
import { REACH } from './terrain/kernel';
import createRelief, { ReliefMap } from './terrain/relief';
import { ChunkGrid, buildChunk, chunkGrid, chunksNear } from './terrain/chunks';
import { Stage } from './stage';
import World from '@civ-clone/ui-map/components/World';
import { seaFloor } from '@civ-clone/ui-models-builtin/terrain';

export class Land {
  readonly layout: GroundLayout;
  #relief: ReliefMap;
  #grid: ChunkGrid;
  // The chunks still to build, by `i,j`, in the order they're wanted.
  #queue: string[] = [];
  // How far a change to a square reaches, in world units.
  #reach: number;

  constructor(world: World) {
    const topology = world.topology(),
      width = world.width(),
      height = world.height(),
      wrapsY = topology.wrapsY();

    this.layout = groundLayoutFor({
      width,
      height,
      topologyId: world.topologyId(),
      wrapsY,
    });
    this.#relief = createRelief({
      layout: this.layout,
      source: {
        width,
        height,
        wrapsY,
        terrainAt: (x, y) => world.get(x, y).terrain._,
        waterAt: (x, y) => world.get(x, y).isWater,
        neighbours: (x, y) =>
          topology
            .directions()
            .map((direction) => topology.neighbour(x, y, direction))
            .filter((square): square is [number, number] => square !== null),
      },
    });
    this.#grid = chunkGrid(this.layout, height);

    // A square's furthest corner, and the furthest a neighbour's middle is: the kernel reaches a square's middle from
    //  past its corner, and a square that becomes land or sea moves the sea's floor a step short of as far out as the
    //  walk goes, a neighbour at a time: the floor that far out and beyond is as deep either way.
    const [cu, cv] = this.layout.centre(0, 0),
      corner = Math.max(
        ...this.layout.outline(0, 0).map(([u, v]) => Math.hypot(u - cu, v - cv))
      ),
      step = Math.max(
        ...topology
          .directions()
          .map((direction) => topology.offset(direction, 0, 0))
          .map(([dx, dy]) => {
            const [u, v] = this.layout.centre(dx, dy);

            return Math.hypot(u - cu, v - cv);
          })
      );

    this.#reach = REACH + corner + (seaFloor.reach - 1) * step;
  }

  /**
   * Where the world's copies lie, as offsets: itself, and as many more a period away each way it wraps as the camera
   *  can see `sight` across from anywhere on it, so a small world doesn't end inside the view.
   */
  copies(sight: number): [number, number][] {
    const { u, v } = this.layout.period(),
      along = (period: number | null): number[] => {
        if (period === null) {
          return [0];
        }

        const offsets: number[] = [];

        for (
          let k = Math.floor(-sight / period);
          k <= Math.floor((period + sight) / period);
          k++
        ) {
          offsets.push(k * period);
        }

        return offsets;
      };

    return along(u).flatMap((across) =>
      along(v).map((offset): [number, number] => [across, offset])
    );
  }

  /** The land's height at a point on the ground. */
  heightAt(u: number, v: number): number {
    return this.#relief.height(u, v);
  }

  /** Every chunk to build again, the nearest to (`u`, `v`) first. */
  queueAll(u: number, v: number): void {
    const { chunksU, chunksV } = this.#grid,
      all: string[] = [];

    for (let j = 0; j < chunksV; j++) {
      for (let i = 0; i < chunksU; i++) {
        all.push(`${i},${j}`);
      }
    }

    this.#queue = this.#nearestFirst(all, u, v);
  }

  /**
   * The world's tiles at `squares` have changed: its terrain read again, and the chunks round any whose terrain has
   *  changed queued with those waiting, the nearest to (`u`, `v`) first. With none, it's read again only if `always`.
   */
  changed(
    squares: [number, number][],
    u: number,
    v: number,
    always = false
  ): void {
    if (squares.length === 0 && !always) {
      return;
    }

    const terrain = this.#relief.refresh();

    if (terrain.length === 0) {
      return;
    }

    const near = chunksNear(this.#grid, this.layout, terrain, this.#reach).map(
      ([i, j]) => `${i},${j}`
    );

    this.#queue = this.#nearestFirst(
      [...new Set([...this.#queue, ...near])],
      u,
      v
    );
  }

  /** The chunks waiting, put in order again, the nearest to (`u`, `v`) first: the map has been centred elsewhere. */
  refocus(u: number, v: number): void {
    this.#queue = this.#nearestFirst(this.#queue, u, v);
  }

  /** How many chunks wait to be built. */
  pending(): number {
    return this.#queue.length;
  }

  /** Builds chunks from the queue for `stage` until `budget` ms have gone, or every one where there's no budget. */
  build(stage: Stage, budget: number | null): void {
    const started = performance.now();

    while (this.#queue.length > 0) {
      if (budget !== null && performance.now() - started >= budget) {
        return;
      }

      const [i, j] = this.#queue.shift()!.split(',').map(Number) as [
        number,
        number
      ];

      stage.setChunk(i, j, buildChunk(this.#grid, this.#relief, i, j));
    }
  }

  // The chunks, nearest to (`u`, `v`) first, measuring round the world's period.
  #nearestFirst(keys: string[], u: number, v: number): string[] {
    const { stepsU, stepsV, spacingU, spacingV } = this.#grid,
      chunkU = stepsU * spacingU,
      chunkV = stepsV * spacingV,
      { u: periodU, v: periodV } = this.layout.period(),
      round = (delta: number, period: number | null): number =>
        period === null
          ? Math.abs(delta)
          : Math.abs(delta - period * Math.round(delta / period)),
      distance = (key: string): number => {
        const [i, j] = key.split(',').map(Number) as [number, number];

        return Math.hypot(
          round((i + 0.5) * chunkU - u, periodU),
          round((j + 0.5) * chunkV - v, periodV)
        );
      };

    return [...keys].sort((a, b) => distance(a) - distance(b));
  }
}

export default Land;
