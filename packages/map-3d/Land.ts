// The land on the 3D map (docs/3d-renderer.md §4): the world's layout, its relief, and its chunks, built a few at a
//  time and handed to the stage that draws them. The nearest to where the map is centred are built first, so the land
//  under the camera is there at once and the rest follows over the next frames.
//
// A tile patch reads the world's terrain again, and builds again only the chunks round the squares whose land it
//  changed (those whose terrain it changed, and the mountains a range joins to them): as far as the kernel reaches
//  from each, along a range's ridge, and from each square of sea whose floor it moved. Most patches (a unit moving, a
//  city growing) change no terrain, and build nothing.
//
// What's laid on the land (`overlay/`: roads, fields, mines, specials, huts) is a mesh for each chunk of the squares
//  whose middles are in it. It's made again when its chunk's land is, or when a square in it or beside it is released,
//  as roads join their neighbours: far cheaper than the land, so a road built rebuilds no land. And when the towns are
//  hidden or shown (`t`, `showTowns`): those with a city on or beside them. Each chunk's mesh is kept, one with the
//  towns shown and one with them hidden (one for both, where no town is on or beside its squares), and taken again
//  while its squares would be laid as they were, so pressing `t` again only swaps them; until the land changes near
//  enough to it to move the heights it's laid on.

import groundLayoutFor, { GroundLayout } from './layouts';
import { REACH } from './terrain/kernel';
import createRelief, { BEND, ReliefMap, WANDER } from './terrain/relief';
import { ChunkGrid, buildChunk, chunkGrid, chunksNear } from './terrain/chunks';
import { Stage } from './stage';
import { Ground } from './water';
import World from '@civ-clone/ui-map/components/World';
import { Tile } from '@civ-clone/ui-protocol/types';
import { seaFloor } from '@civ-clone/ui-models-builtin/terrain';
import { PLANT_BASE, PlantKind } from '@civ-clone/ui-models-builtin/vegetation';
import overlayFor, {
  OverlayNeighbour,
  SquareOverlay,
} from './overlay/overlayFor';
import overlayMesh, {
  NORMAL_STEP,
  OverlayMesh,
  SMOG_REACH,
  OverlayPlace,
  Soup,
  layOverlay,
  meshOf,
  soup,
  roadHalf,
} from './overlay/overlayMesh';

// A chunk's overlay being made a square at a time: which chunk, its squares, how many are made, what's laid so far,
//  what was laid on each square made (as `overlayFor` said), the land's heights read for it, and whether it's to be
//  kept once it's made: not if the land's changed since it was begun.
type Making = {
  key: string;
  squares: [number, number][];
  done: number;
  laid: Soup;
  signatures: string[];
  heights: Map<string, number>;
  keep: boolean;
};

// A chunk's overlay as it was made: what was laid on each of its squares, in turn, and its mesh, or nothing.
type Made = {
  signatures: string[];
  mesh: OverlayMesh | null;
};

// A number of the square at (`x`, `y`)'s own, for where things stand on it and which way its roads bend.
const squareSeed = (x: number, y: number): number =>
  Math.imul(x, 73856093) ^ Math.imul(y, 19349663);

/**
 * How far the model a set draws `kind` with on `terrain` reaches round its origin, for each of its height (`reaches`,
 *  by the model's id): the model `plantModelOf` gives, a base kind's where the set has none of the kind's own, so a fir
 *  drawn with a pine keeps the pine's room; or nothing, where none draws it or its reach isn't known.
 */
export const plantReachFor = (
  models: ReadonlyMap<string, string>,
  reaches: ReadonlyMap<string, number>,
  terrain: string,
  kind: PlantKind
): number | null => {
  const model = plantModelOf(models, terrain, kind);

  return model === null ? null : reaches.get(model) ?? null;
};

/**
 * The model a set draws `kind` with on `terrain`, of `models` (by the plant as a set names it, as `conifer` or
 *  `Jungle:broadleaf`): the kind on the terrain, then the kind, then, where a set has neither, its base kind on the
 *  terrain and its base kind (`PLANT_BASE`), so a set with pines and no firs draws its pines for both; or none.
 */
export const plantModelOf = (
  models: ReadonlyMap<string, string>,
  terrain: string,
  kind: PlantKind
): string | null => {
  const base = PLANT_BASE[kind];

  return (
    models.get(`${terrain}:${kind}`) ??
    models.get(kind) ??
    (base === undefined
      ? undefined
      : models.get(`${terrain}:${base}`) ?? models.get(base)) ??
    null
  );
};

class Land {
  readonly layout: GroundLayout;
  #relief: ReliefMap;
  #grid: ChunkGrid;
  // The chunks still to build, by `i,j`, in the order they're wanted.
  #queue: string[] = [];
  // How far a change to a square reaches, in world units.
  #reach: number;
  // How far past its chunk what's laid on a chunk reads the land's heights: its squares' outlines reach a corner past
  //  their middles, a point's normal reads the land either side of it, and a point's height is read from the land's
  //  points round it.
  #overhang: number;
  #world: World;
  // The chunks whose overlays are to be made again, and which squares' middles each has, worked out once.
  #overlaysDue = new Set<string>();
  // The chunk whose overlay's being made, a few squares a frame: which, its squares, how many are laid, and what so far.
  #making: Making | null = null;
  #squaresByChunk: Map<string, [number, number][]> | null = null;
  // What was last laid on each square, by `x,y`, as `overlayFor` said: a chunk's made again only when one changes.
  #laid = new Map<string, string>();
  // Each chunk's overlay as it was last made, by `i,j`, with the towns shown and with them hidden: taken again rather
  //  than made again while its squares would be laid as they were then. Let go when the land it's laid on may move.
  #made = new Map<string, { shown?: Made; hidden?: Made }>();
  // The city shown on a square, where it's shown otherwise than the world has it (`keepCities`).
  #keptCity: (x: number, y: number) => Tile['city'] | undefined = () =>
    undefined;
  // Whether the towns are laid: hidden (`t`), every square's laid as though no city stood on it, but for the spot in
  //  front of where a city's buildings are, kept clear for its unit (`front`).
  #townsShown = true;
  // Where the map was last centred, for what's laid to be made nearest it first.
  #focus: [number, number] = [0, 0];
  // The models sets draw plants with, by the plant as a set names it (`conifer`, or `Jungle:broadleaf` for a kind on a
  //  terrain of its own), each the model's id among every set's.
  #plantModels: ReadonlyMap<string, string> = new Map();
  // How far each of those models reaches round its origin, for each of its height, by its id: the room it takes.
  #plantReaches: ReadonlyMap<string, number> = new Map();
  // How far a square reaches from its middle every way, its outline's nearest edge; and half the biggest square, with
  //  sides along the ground's axes, that fits inside it.
  #radius: number;
  #inner: number;

  constructor(world: World) {
    this.#world = world;

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
        // Civ1's River terrain, or Civ2's River feature on any land, as the 2D map tells them (`Landscape#isTerrain`).
        riverAt: (x, y) => {
          const { terrain } = world.get(x, y);

          return (
            terrain._ === 'River' ||
            (terrain.features ?? []).some(({ _ }) => _ === 'River')
          );
        },
        edgeNeighbours: (x, y) =>
          topology
            .edgeDirections()
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

    // And as far again as a peak or a colour wanders from its square's middle. A range's ridge runs from a square's
    //  peak to its neighbour's, and both are among the squares whose land a change reshapes (`ReliefMap#refresh`): so
    //  from one or the other, as far again as halfway between their peaks and the ridge's bend.
    this.#reach =
      REACH +
      corner +
      WANDER * Math.SQRT2 +
      Math.max(
        (seaFloor.reach - 1) * step,
        step / 2 + WANDER * Math.SQRT2 + BEND
      );

    // Each edge of a square's outline: how far it is from the middle, and which way it faces.
    const outline = this.layout.outline(0, 0),
      edges = outline.flatMap(([au, av], index) => {
        const [bu, bv] = outline[(index + 1) % outline.length]!,
          length = Math.hypot(bu - au, bv - av);

        return length === 0
          ? []
          : [
              {
                away:
                  Math.abs((bu - au) * (cv - av) - (bv - av) * (cu - au)) /
                  length,
                normal: [(bv - av) / length, (au - bu) / length],
              },
            ];
      });

    this.#radius = Math.min(...edges.map(({ away }) => away));
    // As far past a square as what's laid on it reads the land: its corners, or its smog where that reaches further.
    this.#overhang =
      Math.max(corner, SMOG_REACH * this.#radius) +
      NORMAL_STEP +
      Math.max(this.#grid.spacingU, this.#grid.spacingV);
    // A square of half-side h fits inside an edge `away` from the middle while |nu|·h + |nv|·h ≤ away.
    this.#inner = Math.min(
      ...edges.map(
        ({ away, normal: [nu, nv] }) => away / (Math.abs(nu!) + Math.abs(nv!))
      )
    );
  }

  /**
   * The land's height at a point as it's drawn: flat triangles between the chunks' points, which on a hill can stand a
   *  little above or below the true relief. What's laid on the land follows this, so it's never under it.
   */
  surfaceAt(u: number, v: number, heights = new Map<string, number>()): number {
    const { spacingU, spacingV } = this.#grid,
      a = Math.floor(u / spacingU),
      b = Math.floor(v / spacingV),
      fu = u / spacingU - a,
      fv = v / spacingV - b,
      at = (pa: number, pb: number): number => {
        const key = `${pa},${pb}`;
        let height = heights.get(key);

        if (height === undefined) {
          height = this.#relief.height(pa * spacingU, pb * spacingV);
          heights.set(key, height);
        }

        return height;
      },
      topLeft = at(a, b),
      topRight = at(a + 1, b),
      bottomLeft = at(a, b + 1);

    // As the chunks split each cell: the triangle by its top-left corner, or the one by its bottom-right.
    if (fu + fv <= 1) {
      return topLeft + (topRight - topLeft) * fu + (bottomLeft - topLeft) * fv;
    }

    const bottomRight = at(a + 1, b + 1);

    return (
      bottomRight +
      (bottomLeft - bottomRight) * (1 - fu) +
      (topRight - bottomRight) * (1 - fv)
    );
  }

  /** How the land's points lie on the ground, for the sea's surface to read their heights (`water.ts`). */
  ground(): Ground {
    const { chunksU, chunksV, stepsU, stepsV, spacingU, spacingV } = this.#grid;

    return {
      columns: chunksU * stepsU,
      rows: chunksV * stepsV,
      spacingU,
      spacingV,
      wrapsV: this.layout.period().v !== null,
    };
  }

  /** How far the ground runs down: its period where it wraps over the poles, or to its last row's bottom. */
  extentV(): number {
    return this.#grid.chunksV * this.#grid.stepsV * this.#grid.spacingV;
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
    this.#focus = [u, v];
    all.forEach((key) => this.#overlaysDue.add(key));
    this.#landChanged();
  }

  /**
   * The world's tiles at `squares` have changed: its terrain read again, and the chunks round any whose land has
   *  changed queued with those waiting, the nearest to (`u`, `v`) first. With none, it's read again only if `always`.
   *  Returns the squares whose land has changed, if any: those whose terrain has, and the mountains a range joins to
   *  them, or did.
   */
  changed(
    squares: [number, number][],
    u: number,
    v: number,
    always = false
  ): [number, number][] {
    if (squares.length === 0 && !always) {
      return [];
    }

    this.#focus = [u, v];

    // What's laid on them and beside them, as roads join their neighbours, where it's changed: every square's, for a
    //  world replaced with none released.
    this.#layAgain(
      squares.length === 0
        ? [...this.#chunksOfSquares().values()].flat()
        : this.#besides(squares)
    );

    // The squares released alone, unless the world itself may have been replaced.
    const terrain = this.#relief.refresh(always ? undefined : squares);

    if (terrain.length === 0) {
      return terrain;
    }

    const near = chunksNear(this.#grid, this.layout, terrain, this.#reach).map(
      ([i, j]) => `${i},${j}`
    );

    // What's laid on those, and on any whose squares reach into the land they're on.
    this.#landChanged(
      chunksNear(
        this.#grid,
        this.layout,
        terrain,
        this.#reach + this.#overhang
      ).map(([i, j]) => `${i},${j}`)
    );

    this.#queue = this.#nearestFirst(
      [...new Set([...this.#queue, ...near])],
      u,
      v
    );

    return terrain;
  }

  /**
   * Shows the towns, or hides them (`t`): hidden, every square's laid as though no city stood on it, so the land shows as
   *  it is, without a city's buildings or the houses round it, and with the woods and fields they took whole again, but
   *  for the spot a city's unit stands on, in front of where its buildings are, which what grows keeps clear of. The
   *  squares cities stand on, and those beside them, are laid again, the nearest to (`u`, `v`) first.
   */
  showTowns(shown: boolean, u: number, v: number): void {
    if (shown === this.#townsShown) {
      return;
    }

    const towns = [...this.#chunksOfSquares().values()]
      .flat()
      .filter(([x, y]) => this.#townAt(x, y));

    this.#townsShown = shown;
    this.#focus = [u, v];
    this.#layAgain(this.#besides(towns));
  }

  /**
   * The plants sets of models draw, and with which models (`models`, by the plant as a set names it, as `conifer` or
   *  `Jungle:broadleaf`): every chunk's overlay laid again with them, the nearest to (`u`, `v`) first. A kind on a
   *  terrain of its own is drawn with its own model before the kind's. Each keeps the room its model takes, by how far
   *  the model reaches round its origin for each of its height (`reaches`, by the model's id), where that's known.
   */
  growWith(
    models: ReadonlyMap<string, string>,
    u: number,
    v: number,
    reaches: ReadonlyMap<string, number> = new Map()
  ): void {
    this.#plantModels = new Map(models);
    this.#plantReaches = new Map(reaches);
    this.#focus = [u, v];
    // What was laid before, with the plants as they were drawn then, is let go.
    this.#landChanged();
    [...this.#chunksOfSquares().keys()].forEach((key) =>
      this.#overlaysDue.add(key)
    );
  }

  // The chunks with any of `squares` on them whose overlays are to be made again: those where what's laid on one has
  //  changed.
  #layAgain(squares: [number, number][]): void {
    squares.forEach(([x, y]) => {
      const chunk = this.#chunkOf(x, y);

      // Its chunk's to be made again anyway, or it's being made and hasn't reached this square, which it'll read as it
      //  is now: no need to look.
      if (
        this.#overlaysDue.has(chunk) ||
        (this.#making?.key === chunk && !this.#reached(this.#making, x, y))
      ) {
        return;
      }

      const signature = JSON.stringify(this.#overlayAt(x, y));

      if (signature !== (this.#laid.get(`${x},${y}`) ?? 'null')) {
        this.#overlaysDue.add(chunk);
      }
    });
  }

  // Whether a city stands on the square at (`x`, `y`), as the world has it or as one's kept from before a battle.
  #townAt(x: number, y: number): boolean {
    return Boolean(this.#world.get(x, y).city) || Boolean(this.#keptCity(x, y));
  }

  // The land's changed under the chunks `near` (every one, if none's given), or under what's laid on them: what's laid
  //  on them, as it was made, is let go, as it read the land's heights, and so is the chunk being made among them, once
  //  it's made.
  #landChanged(near?: string[]): void {
    const changed = near === undefined ? null : new Set(near);

    if (changed === null) {
      this.#made.clear();
    } else {
      changed.forEach((key) => this.#made.delete(key));
    }

    if (
      this.#making !== null &&
      (changed === null || changed.has(this.#making.key))
    ) {
      this.#making.keep = false;
    }
  }

  /** The chunks waiting, put in order again, the nearest to (`u`, `v`) first: the map has been centred elsewhere. */
  refocus(u: number, v: number): void {
    this.#queue = this.#nearestFirst(this.#queue, u, v);
    this.#focus = [u, v];
  }

  /** How many chunks wait to be built. */
  pending(): number {
    return this.#queue.length;
  }

  /** How many chunks wait to have what's laid on them made again, one being made among them. */
  overlaysPending(): number {
    return (
      this.#overlaysDue.size +
      (this.#making === null || this.#overlaysDue.has(this.#making.key) ? 0 : 1)
    );
  }

  // Whether the chunk being made has made the square at (`x`, `y`) yet.
  #reached(making: Making, x: number, y: number): boolean {
    return making.squares
      .slice(0, making.done)
      .some(([sx, sy]) => sx === x && sy === y);
  }

  /**
   * Builds chunks from the queue for `stage`, then what's laid on them, until `budget` ms have gone, or every one where
   *  there's no budget.
   */
  build(stage: Stage, budget: number | null): void {
    const started = performance.now(),
      spent = (): boolean =>
        budget !== null && performance.now() - started >= budget;

    while (this.#queue.length > 0) {
      if (spent()) {
        return;
      }

      const key = this.#queue.shift()!,
        [i, j] = key.split(',').map(Number) as [number, number];

      stage.setChunk(i, j, buildChunk(this.#grid, this.#relief, i, j));
      this.#overlaysDue.add(key);
    }

    // What's laid on the chunks, the nearest first, a square at a time, so a busy chunk is made over a few frames
    //  rather than holding one up. One that's changed again while it's being made is begun again.
    // Whether a chunk's been handed to the stage this frame: past the budget, no other's begun.
    let handed = false;

    while (this.#overlaysDue.size > 0 || this.#making !== null) {
      if (this.#making !== null && this.#overlaysDue.has(this.#making.key)) {
        this.#making = null;
      }

      if (this.#making === null) {
        if (handed && spent()) {
          return;
        }

        const key = this.#nearestFirst(
            [...this.#overlaysDue],
            ...this.#focus
          )[0]!,
          squares = this.#chunksOfSquares().get(key) ?? [],
          made = this.#madeAs(key, squares);

        this.#overlaysDue.delete(key);

        // As it was made before, as `t` hides the towns and shows them again: taken again, and nothing to make.
        if (made !== null) {
          const [i, j] = key.split(',').map(Number) as [number, number];

          squares.forEach(([x, y], index) =>
            this.#laid.set(`${x},${y}`, made.signatures[index]!)
          );
          stage.setOverlay(i, j, made.mesh);
          handed = true;

          continue;
        }

        this.#making = {
          key,
          squares,
          done: 0,
          laid: soup(),
          signatures: [],
          heights: new Map(),
          keep: true,
        };
      }

      const making = this.#making;

      // A square at least, every time, so even the smallest budget gets it made.
      while (making.done < making.squares.length) {
        const [x, y] = making.squares[making.done]!,
          square = this.#square(x, y, making.heights);

        making.signatures.push(this.#laid.get(`${x},${y}`)!);
        making.done++;

        if (square !== null) {
          layOverlay(square.overlay, square.place, making.laid);
        }

        if (making.done < making.squares.length && spent()) {
          return;
        }
      }

      const [i, j] = making.key.split(',').map(Number) as [number, number],
        { stepsU, stepsV, spacingU, spacingV } = this.#grid,
        mesh =
          making.laid.positions.length === 0 &&
          making.laid.haze.positions.length === 0 &&
          making.laid.plants.size === 0
            ? null
            : meshOf(i * stepsU * spacingU, j * stepsV * spacingV, making.laid);

      this.#making = null;

      // Kept as it's laid with the towns as they are now, for `t` to take again: one with no town on or beside its
      //  squares is laid the same either way, so it's kept for both, and no other kept for it lingers.
      if (making.keep) {
        const made = { signatures: making.signatures, mesh };

        this.#made.set(
          making.key,
          this.#besides(making.squares).some(([x, y]) => this.#townAt(x, y))
            ? {
                ...this.#made.get(making.key),
                [this.#townsShown ? 'shown' : 'hidden']: made,
              }
            : { shown: made, hidden: made }
        );
      }

      stage.setOverlay(i, j, mesh);
      handed = true;
    }
  }

  // The chunk `key`'s overlay as it was made before, with the towns shown or hidden, if its `squares` would be laid as
  //  they were then; or nothing.
  #madeAs(key: string, squares: [number, number][]): Made | null {
    const made = this.#made.get(key);

    if (made === undefined) {
      return null;
    }

    const signatures = squares.map(([x, y]) =>
      JSON.stringify(this.#overlayAt(x, y))
    );

    return (
      [made.shown, made.hidden].find(
        (kept): kept is Made =>
          kept !== undefined &&
          kept.signatures.length === signatures.length &&
          kept.signatures.every(
            (signature, index) => signature === signatures[index]
          )
      ) ?? null
    );
  }

  /**
   * Lays on each square the city `keptAt` says, where it says one (or `null`, none), rather than the world's: a city as
   *  it was before a battle there whose blow hasn't fallen, as its marker shows it. A square it no longer says one for
   *  is to be told `changed`, to be laid as the world has it.
   */
  keepCities(keptAt: (x: number, y: number) => Tile['city'] | undefined): void {
    this.#keptCity = keptAt;
  }

  // The tile at (`x`, `y`) as it's shown: its city kept as it was (`keepCities`), if one is; none, the towns hidden.
  #shownAt(x: number, y: number): Tile {
    const tile = this.#world.get(x, y),
      city = this.#townsShown ? this.#keptCity(x, y) : null;

    return city === undefined ? tile : { ...tile, city };
  }

  // What's laid on the square at (`x`, `y`), as its tile and its neighbours' say.
  #overlayAt(x: number, y: number): SquareOverlay | null {
    const topology = this.#world.topology(),
      overlay = overlayFor(
        this.#shownAt(x, y),
        topology.directions().flatMap((direction) => {
          const at = topology.neighbour(x, y, direction);

          return at === null
            ? []
            : [
                {
                  offset: topology.offset(direction, x, y),
                  tile: this.#shownAt(at[0], at[1]),
                } as OverlayNeighbour,
              ];
        })
      ),
      kept = this.#keptCity(x, y);

    // A city whose town is hidden: a unit there still stands in front of where its buildings are.
    return overlay !== null &&
      !this.#townsShown &&
      Boolean(kept === undefined ? this.#world.get(x, y).city : kept)
      ? { ...overlay, front: true }
      : overlay;
  }

  /**
   * The way a unit walks from the square at (`x`, `y`) to its neighbour at (`nx`, `ny`) along the road between them, as
   *  it's drawn: the half each draws (`roadHalf`), from the middle of one to the edge they share and on to the middle of
   *  the other, as points relative to the middle of the square it's going to. Where a railroad takes the way, its half,
   *  straight to the edge. Where only one draws a half (the other a city, say), straight from or to the edge on the
   *  other's side. Nothing where neither does, or they aren't neighbours.
   */
  roadPath(
    x: number,
    y: number,
    nx: number,
    ny: number
  ): [number, number][] | null {
    const topology = this.#world.topology(),
      offsetTo = (
        fromX: number,
        fromY: number,
        toX: number,
        toY: number
      ): readonly [number, number] | null => {
        const direction = topology.directions().find((way) => {
          const at = topology.neighbour(fromX, fromY, way);

          return at !== null && at[0] === toX && at[1] === toY;
        });

        return direction === undefined
          ? null
          : topology.offset(direction, fromX, fromY);
      },
      out = offsetTo(x, y, nx, ny),
      back = offsetTo(nx, ny, x, y);

    if (out === null || back === null) {
      return null;
    }

    // The half the square at (`ax`, `ay`) draws `offset` away, from its middle to the edge, in its own frame: its road's,
    //  as it bends, or where a railroad takes that way instead, the railroad's, straight; or nothing, where it draws
    //  none that way.
    const half = (
        ax: number,
        ay: number,
        offset: readonly [number, number]
      ): [number, number][] | null => {
        const overlay = this.#overlayAt(ax, ay),
          joins = (route: { joins: (readonly [number, number])[] } | null) =>
            route !== null &&
            route.joins.some(
              ([du, dv]) => du === offset[0] && dv === offset[1]
            ),
          centre = this.layout.centre(ax, ay);

        if (joins(overlay?.road ?? null)) {
          return roadHalf(
            {
              centre,
              toward: ([du, dv]) => this.layout.centre(ax + du, ay + dv),
              seed: squareSeed(ax, ay),
            },
            offset
          ).points;
        }

        if (joins(overlay?.railroad ?? null)) {
          const [tu, tv] = this.layout.centre(ax + offset[0], ay + offset[1]);

          return [
            [centre[0], centre[1]],
            [(centre[0] + tu) / 2, (centre[1] + tv) / 2],
          ];
        }

        return null;
      },
      leaving = half(x, y, out),
      coming = half(nx, ny, back);

    if (leaving === null && coming === null) {
      return null;
    }

    // The edge they share, in each one's frame: the copies the two halves are drawn at.
    const here = this.layout.centre(x, y),
      there = this.layout.centre(nx, ny),
      edgeHere = this.layout.centre(x + out[0], y + out[1]),
      edgeThere = this.layout.centre(nx + back[0], ny + back[1]),
      fromEdge: [number, number] = [
        (here[0] + edgeHere[0]) / 2,
        (here[1] + edgeHere[1]) / 2,
      ],
      toEdge: [number, number] = [
        (there[0] + edgeThere[0]) / 2,
        (there[1] + edgeThere[1]) / 2,
      ],
      // From the leaving square's frame to the arriving one's.
      shift = [toEdge[0] - fromEdge[0], toEdge[1] - fromEdge[1]],
      path = [
        ...(leaving ?? [here, fromEdge]).map(([u, v]): [number, number] => [
          u + shift[0]!,
          v + shift[1]!,
        ]),
        ...(coming ?? [there, toEdge]).slice(0, -1).reverse(),
      ];

    return path.map(([u, v]) => [u - there[0], v - there[1]]);
  }

  /** What's laid on the land of chunk `i` across and `j` down: its squares' roads, fields and the rest, or nothing. */
  overlayOf(i: number, j: number): OverlayMesh | null {
    const { stepsU, stepsV, spacingU, spacingV } = this.#grid,
      // The land's heights at its points, each read once for the chunk.
      heights = new Map<string, number>(),
      laid = (this.#chunksOfSquares().get(`${i},${j}`) ?? []).flatMap(
        ([x, y]) => this.#square(x, y, heights) ?? []
      );

    return laid.length === 0
      ? null
      : overlayMesh(i * stepsU * spacingU, j * stepsV * spacingV, laid);
  }

  // What's laid on the square at (`x`, `y`), and where, or nothing; kept as what was last laid there.
  #square(
    x: number,
    y: number,
    heights: Map<string, number>
  ): { overlay: SquareOverlay; place: OverlayPlace } | null {
    const overlay = this.#overlayAt(x, y);

    this.#laid.set(`${x},${y}`, JSON.stringify(overlay));

    if (overlay === null) {
      return null;
    }

    // Where it is, as its marker is, even where that's at the world's edge (an odd row's last square, the last row of
    //  a world that wraps over the poles): the chunk's drawn at every copy of the world, so its overlay lies where it
    //  is in each, a chunk's corner or not. Its neighbours as the nearest copy of each.
    const [u, v] = this.layout.centre(x, y);
    const topology = this.#world.topology();

    return {
      overlay,
      place: {
        centre: [u, v],
        toward: ([dx, dy]) => this.layout.centre(x + dx, y + dy),
        radius: this.#radius,
        inner: this.#inner,
        heightAt: (pu, pv) => this.surfaceAt(pu, pv, heights),
        seed: squareSeed(x, y),
        latitude: Math.min(1, Math.abs((2 * v) / this.extentV() - 1)),
        latitudeAt: (pv) =>
          Math.min(1, Math.abs((2 * pv) / this.extentV() - 1)),
        outline: this.layout.outline(x, y),
        owns: (pu, pv) => {
          const [tx, ty] = this.layout.tileAt(pu, pv);

          return tx === x && ty === y;
        },
        plantModel: (kind) =>
          plantModelOf(this.#plantModels, overlay.terrain, kind),
        plantReach: (kind) =>
          plantReachFor(
            this.#plantModels,
            this.#plantReaches,
            overlay.terrain,
            kind
          ),
        around: topology
          .directions()
          .filter((direction) => topology.neighbour(x, y, direction) !== null)
          .map((direction) => topology.offset(direction, x, y)),
        period: this.layout.period(),
        rivers: this.#relief.coursesAt(x, y),
      },
    };
  }

  /** The chunk whose overlay has the square at (`x`, `y`), by `i,j`: the one its middle is in. */
  overlayKeyOf(x: number, y: number): string {
    return this.#chunkOf(x, y);
  }

  // The chunk the square at (`x`, `y`) has its middle in, by `i,j`: one whose middle is on the world's edge (an odd
  //  row's last square, the last row of a world that wraps over the poles) in the chunk beside it, not the first.
  #chunkOf(x: number, y: number): string {
    const { chunksU, chunksV, stepsU, stepsV, spacingU, spacingV } = this.#grid,
      [u, v] = this.layout.centre(x, y),
      i = Math.floor(u / (stepsU * spacingU)),
      j = Math.floor(v / (stepsV * spacingV));

    return `${Math.min(chunksU - 1, Math.max(0, i))},${Math.min(
      chunksV - 1,
      Math.max(0, j)
    )}`;
  }

  // Each chunk's squares, by the chunk their middles are in: worked out once, as squares don't move.
  #chunksOfSquares(): Map<string, [number, number][]> {
    if (this.#squaresByChunk === null) {
      const byChunk = new Map<string, [number, number][]>();

      for (let y = 0; y < this.#world.height(); y++) {
        for (let x = 0; x < this.#world.width(); x++) {
          const key = this.#chunkOf(x, y);

          byChunk.set(key, [...(byChunk.get(key) ?? []), [x, y]]);
        }
      }

      this.#squaresByChunk = byChunk;
    }

    return this.#squaresByChunk;
  }

  // `squares`, and the squares beside each.
  #besides(squares: [number, number][]): [number, number][] {
    const topology = this.#world.topology(),
      found = new Map<string, [number, number]>();

    squares.forEach(([x, y]) =>
      [
        [x, y] as [number, number],
        ...topology
          .directions()
          .map((direction) => topology.neighbour(x, y, direction))
          .filter((at): at is [number, number] => at !== null),
      ].forEach((square) => found.set(square.join(), square))
    );

    return [...found.values()];
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
