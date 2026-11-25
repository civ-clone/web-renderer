// Woods on the 3D map (docs/3d-renderer.md §5.1, plan 3.2): forest, jungle and swamp grow as one canopy across their
//  squares, on every grid.
//  - Every point of the woods' lattice is on exactly one square, across the world's seam and over its poles, and none
//    is past the edge of a world that doesn't wrap.
//  - The canopy runs across the edge between two squares of the same woods, and thins to a fringe where woods meet
//    other ground: each way the grid has, from rows of each parity.
//  - A neighbour turning to woods only adds trees, as drawn too, with roads all round.
//  - No tree stands on a road between two of a square's neighbours, across its corner.
//  - At the shore, trees stand on dry land; only reeds stand in the shallows.
//  - Woods count as woods beside a square only where it grows them: not a city's lot, cleared ground, or another woods.
//  - A neighbour's woods changing lays its square's chunk again, across a chunk's border too.

import topologyFor, { Topology } from '@civ-clone/ui-client/lib/topologyFor';
import groundLayoutFor, { GroundLayout } from '@civ-clone/ui-map-3d/layouts';
import overlayFor, {
  OverlayNeighbour,
  SquareOverlay,
} from '@civ-clone/ui-map-3d/overlay/overlayFor';
import {
  CANOPY,
  OverlayMesh,
  OverlayPlace,
  PLANT_NUMBERS,
  layOverlay,
  soup,
  undergrowthPlants,
  woodsPlants,
} from '@civ-clone/ui-map-3d/overlay/overlayMesh';
import {
  PLANTS_THIN_FROM,
  PLANTS_THIN_LEAST,
  plantRank,
  plantsKept,
  rankedOrder,
} from '@civ-clone/ui-map-3d/overlay/thinning';
import { growthOf } from '@civ-clone/ui-models-builtin/vegetation';
import Land from '@civ-clone/ui-map-3d/Land';
import World from '@civ-clone/ui-map/components/World';
import { Stage } from '@civ-clone/ui-map-3d/stage';
import { TopologyId } from '@civ-clone/ui-protocol/topology';
import { Tile } from '@civ-clone/ui-protocol/types';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// The kinds of plant that are woods' trees, not what grows under them.
const TREES: readonly string[] = ['conifer', 'broadleaf', 'palm', 'deadTree'];

const ids: TopologyId[] = ['square', 'staggered-iso', 'hex-odd-r'],
  forest = growthOf('Forest')!;

// A square's place, as the 3D map's land gives it (`Land`), on a flat world.
const placeOf = (
  layout: GroundLayout,
  topology: Topology,
  x: number,
  y: number
): OverlayPlace => ({
  centre: layout.centre(x, y),
  toward: ([dx, dy]) => layout.centre(x + dx, y + dy),
  radius: 0.5,
  inner: 0.35,
  heightAt: () => 0,
  seed: Math.imul(x, 73856093) ^ Math.imul(y, 19349663),
  latitude: 0.5,
  outline: layout.outline(x, y),
  owns: (u, v) => {
    const [tx, ty] = layout.tileAt(u, v);

    return tx === x && ty === y;
  },
  around: topology
    .directions()
    .filter((direction) => topology.neighbour(x, y, direction) !== null)
    .map((direction) => topology.offset(direction, x, y)),
  period: layout.period(),
});

// The overlay of a square of `terrain`, its neighbours each of the terrain `around` gives at their offset.
const overlayOf = (
  topology: Topology,
  x: number,
  y: number,
  terrain: string,
  around: (offset: readonly [number, number]) => string,
  improvements: string[] = [],
  improvementsAt: (offset: readonly [number, number]) => string[] = () => []
): SquareOverlay =>
  overlayFor(
    {
      improvements: improvements.map((_) => ({ _ })),
      terrain: { _: terrain, features: [] },
      goodyHut: null,
      city: null,
    } as unknown as Tile,
    topology
      .directions()
      .filter((direction) => topology.neighbour(x, y, direction) !== null)
      .map((direction): OverlayNeighbour => {
        const offset = topology.offset(direction, x, y);

        return {
          offset,
          tile: {
            improvements: improvementsAt(offset).map((_) => ({ _ })),
            city: null,
            terrain: { _: around(offset), features: [] },
          } as unknown as OverlayNeighbour['tile'],
        };
      })
  )!;

ids.forEach((topologyId) => {
  const width = 12,
    height = 10,
    topology = topologyFor({ width, height, topologyId }),
    layout = groundLayoutFor({
      width,
      height,
      topologyId,
      wrapsY: topology.wrapsY(),
    }),
    // Every grid's topology wraps over the poles; a layout that doesn't is checked too, for its edges.
    layouts = [true, false].map((wrapsY) =>
      groundLayoutFor({ width, height, topologyId, wrapsY })
    );

  // An all-forest world: every point of the lattice, on the world, planted once, by the square it's on.
  layouts.forEach((layout) => {
    const period = layout.period(),
      cellsU = Math.round(period.u / CANOPY),
      cellsV = period.v === null ? null : Math.round(period.v / CANOPY),
      stepU = period.u / cellsU,
      stepV = period.v === null || cellsV === null ? CANOPY : period.v / cellsV,
      planted = new Map<string, string[]>(),
      misplaced: string[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        woodsPlants(
          overlayOf(topology, x, y, 'Forest', () => 'Forest'),
          placeOf(layout, topology, x, y),
          forest
        ).forEach(({ u, v }) => {
          // Its cell, round the world's period.
          const i = Math.floor(u / stepU),
            j = Math.floor(v / stepV),
            key = `${((i % cellsU) + cellsU) % cellsU},${
              cellsV === null ? j : ((j % cellsV) + cellsV) % cellsV
            }`,
            [tx, ty] = layout.tileAt(u, v);

          planted.set(key, [...(planted.get(key) ?? []), `${x},${y}`]);

          if (tx !== x || ty !== y) {
            misplaced.push(`${x},${y} at ${u},${v}`);
          }
        });
      }
    }

    // Every cell whose point is on the world, by the layout's own say: once round the period across, and down where it
    //  wraps over the poles, or as far down as the world's squares reach where it doesn't.
    const vs = Array.from({ length: height }, (_, y) =>
        layout.outline(0, y).map(([, v]) => v)
      ).flat(),
      rows =
        cellsV === null
          ? Array.from(
              {
                length:
                  Math.ceil(Math.max(...vs) / stepV) -
                  Math.floor(Math.min(...vs) / stepV),
              },
              (_, at) => Math.floor(Math.min(...vs) / stepV) + at
            )
          : Array.from({ length: cellsV }, (_, at) => at),
      // Each cell's point is where `woodsPlants` puts it: the cell is told by where that point lies.
      onWorld = new Set<string>();

    rows.forEach((j) => {
      for (let i = 0; i < cellsU; i++) {
        // Some point of the cell is on the world if any square planted it; one that wasn't must be off the world.
        onWorld.add(`${i},${j}`);
      }
    });

    const twice = [...planted.entries()].filter(
        ([, squares]) => squares.length > 1
      ),
      offWorld = [...planted.keys()].filter((key) => !onWorld.has(key)),
      // A cell not planted must be one whose point may be off the world: past the edge of a world that doesn't wrap
      //  over the poles, a cell not wholly on its squares. One wholly on them is planted.
      // The cell's point is jittered within the middle 0.6 of it, either way: sampled finely there, all on the world.
      wholly = (key: string): boolean => {
        const [i, j] = key.split(',').map(Number) as [number, number];

        return Array.from({ length: 81 }, (_, at) => [
          0.2 + ((at % 9) / 8) * 0.6,
          0.2 + (Math.floor(at / 9) / 8) * 0.6,
        ]).every(([a, b]) => {
          const [, y] = layout.tileAt((i + a!) * stepU, (j + b!) * stepV);

          return y >= 0 && y < height;
        });
      },
      unplanted = [...onWorld].filter((key) => !planted.has(key));

    expect(
      `${topologyId}, ${
        period.v === null ? 'not wrapping' : 'wrapping'
      } over the poles: in an all-forest world, every point of the woods' lattice is planted by exactly one square, the one the layout says it's on, round the world's period, and none past its edge`,
      [
        planted.size > 0,
        twice.slice(0, 3),
        misplaced.slice(0, 3),
        offWorld.slice(0, 3),
        // On a world that wraps over the poles, every cell; on one that doesn't, every cell wholly on its squares.
        cellsV === null
          ? unplanted.filter(wholly).slice(0, 3)
          : unplanted.slice(0, 3),
      ],
      [true, [], [], [], []]
    );
  });

  // A forest square, and its neighbour each way the grid has, forest or plain, from rows of each parity: the band
  //  along the edge between them has more trees where the neighbour's forest, as the canopy runs across to it, and
  //  some where it's plain, a fringe. And every tree of the fringe is one of the canopy's too, the same kind, standing
  //  where it did: a neighbour turning to woods only adds trees.
  // How far a square's nearest neighbours' middles are, across an edge, and how many it has.
  const [middleU, middleV] = layout.centre(4, 4),
    steps = topology.directions().map((direction) => {
      const [dx, dy] = topology.offset(direction, 4, 4),
        [nu, nv] = layout.centre(4 + dx, 4 + dy);

      return Math.hypot(nu - middleU, nv - middleV);
    }),
    nearest = Math.min(...steps),
    edges = steps.filter((step) => step <= nearest + 1e-6).length,
    thinner: string[] = [],
    added: string[] = [],
    elsewhere: string[] = [],
    // How many trees stand along the edge, each way, from rows of each parity, beside forest and beside plains.
    counts = new Map<string, [number, number]>();
  let canopy = 0,
    fringe = 0;

  // Twelve places on rows of each parity.
  Array.from({ length: 24 }, (_, at) => [
    2 + (at % 3) * 3,
    1 + Math.floor(at / 3),
  ]).forEach(([x, y]) =>
    topology.directions().forEach((direction) => {
      const offset = topology.offset(direction, x!, y!),
        place = placeOf(layout, topology, x!, y!),
        [cu, cv] = place.centre,
        [nu, nv] = place.toward(offset),
        // Within 0.15 of the line halfway between their middles, on this square's side: as far in as the woods thin.
        length = Math.hypot(nu - cu, nv - cv),
        inBand = ({ u, v }: { u: number; v: number }): boolean =>
          ((u - cu) * (nu - cu) + (v - cv) * (nv - cv)) / length >
          length / 2 - 0.15,
        trees = (beside: string) =>
          woodsPlants(
            overlayOf(topology, x!, y!, 'Forest', (other) =>
              other[0] === offset[0] && other[1] === offset[1]
                ? beside
                : 'Forest'
            ),
            place,
            forest
          ),
        withWoods = trees('Forest'),
        withPlain = trees('Plains'),
        near = withWoods.filter(inBand).length,
        far = withPlain.filter(inBand).length,
        // Further in from that edge than the woods thin: the same trees either way, the same size.
        inward = ({ u, v }: { u: number; v: number }): boolean =>
          ((u - cu) * (nu - cu) + (v - cv) * (nv - cv)) / length <=
          length / 2 - 0.15,
        key = (tree: { u: number; v: number; kind: string; size: number }) =>
          `${tree.u},${tree.v},${tree.kind},${tree.size}`;

      if (
        JSON.stringify(withWoods.filter(inward).map(key)) !==
        JSON.stringify(withPlain.filter(inward).map(key))
      ) {
        elsewhere.push(`${x},${y} ${direction}`);
      }

      withPlain.forEach((tree) => {
        if (
          !withWoods.some(
            ({ u, v, kind }) =>
              u === tree.u && v === tree.v && kind === tree.kind
          )
        ) {
          added.push(`${x},${y} ${direction}: ${tree.u},${tree.v}`);
        }
      });

      // The edge's band counted across an edge, its nearest neighbours: past a corner, the band's a sliver.
      if (length > nearest + 1e-6) {
        return;
      }

      const edge = `${direction} from ${y! & 1 ? 'odd' : 'even'} rows`,
        [nearSoFar, farSoFar] = counts.get(edge) ?? [0, 0];

      counts.set(edge, [nearSoFar + near, farSoFar + far]);
      canopy += near;
      fringe += far;
    })
  );

  counts.forEach(([near, far], key) => {
    if (near <= far) {
      thinner.push(`${key}: ${near} ≤ ${far}`);
    }
  });

  expect(
    `${topologyId}: forest beside forest, across each edge the grid has, from rows of each parity, at twelve places, has more trees along the edge than forest beside plains, which has a fringe; further in, the same trees; and a neighbour turning to forest, any way, only adds trees`,
    [
      thinner,
      counts.size === edges * 2,
      fringe > 0,
      fringe < canopy * 0.85,
      elsewhere.slice(0, 3),
      added.slice(0, 3),
    ],
    [[], true, true, true, [], []]
  );

  // A road between a square and its neighbour, each way the grid has, from rows of each parity, in all-forest woods:
  //  the squares beside both of them, whose corner or edge it may cross, plant no tree on it. And with roads all round
  //  a square, at twelve places on rows of each parity, its trees as drawn are only added to when a neighbour turns to
  //  forest, any way.
  const onRoad: string[] = [],
    dropped: string[] = [],
    // The square at (`x`, `y`) on the world, as the topology names it.
    named = (x: number, y: number): string =>
      `${((x % width) + width) % width},${((y % height) + height) % height}`,
    neighboursOf = (x: number, y: number): [number, number][] =>
      topology
        .directions()
        .map((direction) => topology.neighbour(x, y, direction))
        .filter((square): square is [number, number] => square !== null);

  [
    [4, 4],
    [5, 5],
  ].forEach(([x, y]) =>
    topology.directions().forEach((direction) => {
      const to = topology.neighbour(x!, y!, direction)!,
        ends = new Set([named(x!, y!), named(...to)]),
        beside = neighboursOf(x!, y!).filter(([bx, by]) =>
          neighboursOf(...to).some(([tx, ty]) => tx === bx && ty === by)
        );

      beside.forEach(([bx, by]) => {
        const place = placeOf(layout, topology, bx, by),
          // Its neighbours' offsets, and which of them are the road's ends.
          offsets = topology
            .directions()
            .filter((each) => topology.neighbour(bx, by, each) !== null)
            .map((each) => ({
              offset: topology.offset(each, bx, by),
              end: ends.has(named(...topology.neighbour(bx, by, each)!)),
            })),
          [a, b] = offsets
            .filter(({ end }) => end)
            .map(({ offset }) => place.toward(offset)),
          { grown } = layOverlay(
            overlayOf(
              topology,
              bx,
              by,
              'Forest',
              () => 'Forest',
              [],
              (offset) =>
                offsets.some(
                  ({ offset: other, end }) =>
                    end && other[0] === offset[0] && other[1] === offset[1]
                )
                  ? ['Road']
                  : []
            ),
            place,
            soup()
          );

        if (a === undefined || b === undefined) {
          return;
        }

        grown.forEach(([u, v, kind]) => {
          const du = b[0] - a[0],
            dv = b[1] - a[1],
            t = Math.max(
              0,
              Math.min(
                1,
                ((u - a[0]) * du + (v - a[1]) * dv) / (du * du + dv * dv)
              )
            );

          // Half a road's width (0.035), and a crown's (0.065); or for what grows under the trees, as near as anything
          //  stands to a road (0.05).
          if (
            Math.hypot(u - a[0] - du * t, v - a[1] - dv * t) <
            (TREES.includes(kind) ? 0.1 : 0.05)
          ) {
            onRoad.push(`${x},${y} ${direction}: ${bx},${by} at ${u},${v}`);
          }
        });
      });
    })
  );

  // Roads all round a square, at twelve places on rows of each parity, each way.
  Array.from({ length: 24 }, (_, at) => [
    2 + (at % 3) * 3,
    1 + Math.floor(at / 3),
  ]).forEach(([x, y]) =>
    topology.directions().forEach((direction) => {
      // Roads all round, and the neighbour that way forest or plains: the trees drawn beside plains are all drawn
      //  beside forest.
      const place = placeOf(layout, topology, x!, y!),
        offset = topology.offset(direction, x!, y!),
        drawn = (besideIt: string) =>
          layOverlay(
            overlayOf(
              topology,
              x!,
              y!,
              'Forest',
              (other) =>
                other[0] === offset[0] && other[1] === offset[1]
                  ? besideIt
                  : 'Forest',
              ['Road'],
              () => ['Road']
            ),
            place,
            soup()
          ).grown.map(([u, v]) => `${u},${v}`),
        withWoods = new Set(drawn('Forest')),
        withPlain = drawn('Plains');

      withPlain
        .filter((tree) => !withWoods.has(tree))
        .forEach((tree) => dropped.push(`${x},${y} ${direction}: ${tree}`));
    })
  );

  expect(
    `${topologyId}: no tree stands on a road between two squares beside it, across its corner or along its edge, its crown clear of it, each way; and with roads all round, a neighbour turning to forest only adds to the trees drawn`,
    [onRoad.slice(0, 3), dropped.slice(0, 3)],
    [[], []]
  );
});

// At the shore, where the land under a square dips below the sea: a forest's trees stand on dry land, a swamp's reeds in
//  the shallows too.
{
  const topology = topologyFor({ width: 12, height: 10, topologyId: 'square' }),
    layout = groundLayoutFor({
      width: 12,
      height: 10,
      topologyId: 'square',
      wrapsY: topology.wrapsY(),
    }),
    // The land falls away west to east across the square at (4, 4), under the sea past its middle.
    shore = {
      ...placeOf(layout, topology, 4, 4),
      heightAt: (u: number) => 4.5 - u,
    },
    laid = (terrain: string) =>
      layOverlay(
        overlayOf(topology, 4, 4, terrain, () => terrain),
        shore,
        soup()
      ).grown;

  expect(
    'at the shore, a forest’s trees stand on dry land, and a swamp’s dead trees too, but its reeds in the shallows as well',
    [
      laid('Forest').length > 0,
      laid('Forest').every(([u]) => u <= 4.5),
      laid('Swamp').some(([u]) => u > 4.5),
      laid('Swamp')
        .filter(([u]) => u > 4.5)
        .every(([, , kind]) => kind === 'reeds'),
      laid('Swamp').some(([u, , kind]) => kind === 'deadTree' && u <= 4.5),
    ],
    [true, true, true, true, true]
  );
}

// What counts as woods beside a square: the same woods (forest and jungle), growing there.
{
  const topology = topologyFor({ width: 12, height: 10, topologyId: 'square' }),
    neighbour = (
      offset: [number, number],
      terrain: string,
      improvements: string[] = [],
      city = false
    ): OverlayNeighbour => ({
      offset,
      tile: {
        improvements: improvements.map((_) => ({ _ })),
        city: city ? ({} as Tile['city']) : null,
        terrain: { _: terrain, features: [] },
      } as unknown as OverlayNeighbour['tile'],
    }),
    square = (terrain: string, improvements: string[] = []) =>
      ({
        improvements: improvements.map((_) => ({ _ })),
        terrain: { _: terrain, features: [] },
        goodyHut: null,
        city: null,
      } as unknown as Tile),
    around = [
      neighbour([0, -1], 'Forest'),
      neighbour([1, 0], 'Jungle'),
      neighbour([0, 1], 'Swamp'),
      neighbour([-1, 0], 'Forest', [], true),
      neighbour([1, -1], 'Forest', ['Fortress']),
      neighbour([1, 1], 'Jungle', ['Irrigation']),
      neighbour([-1, 1], 'Unknown'),
      neighbour([-1, -1], 'Plains'),
    ];

  void topology;

  expect(
    'woods beside a square are the same woods, growing: forest and jungle are one; swamp is its own; not a city’s lot, a fortress, fields, a square never seen, or plains; and a square that grows no woods, or is cleared, has none',
    [
      overlayFor(square('Forest'), around)?.woods,
      overlayFor(square('Swamp'), around)?.woods,
      overlayFor(square('Plains'), around)?.woods,
      overlayFor(square('Forest', ['Irrigation']), around)?.woods,
    ],
    [
      [
        [0, -1],
        [1, 0],
      ],
      [[0, 1]],
      [],
      [],
    ]
  );
}

// A neighbour's woods changing lays its square's chunk again: a forest on one side of a chunk's border, its neighbour
//  across it given a fortress, which clears its woods, and then without it. Every chunk whose overlay that changes is
//  laid again, as land made afresh lays it.
ids.forEach((topologyId) => {
  const width = 64,
    height = 40,
    tiles = Array.from({ length: width * height }, (_, at) => ({
      x: at % width,
      y: Math.floor(at / width),
      isWater: false,
      improvements: [],
      units: [],
      city: null,
      goodyHut: null,
      terrain: {
        _: 'Forest',
        __: ['Forest'],
        id: `Forest-${at}`,
        features: [],
      },
    })),
    world = new World({
      _: 'World',
      __: ['World', 'DataObject'],
      id: 'woods',
      width,
      height,
      topologyId,
      tiles: tiles as never,
    } as never),
    overlays = (land: Land): Map<string, OverlayMesh | null> => {
      const laid = new Map<string, OverlayMesh | null>();

      land.build(
        {
          setChunk: () => undefined,
          setOverlay: (i: number, j: number, mesh: OverlayMesh | null) =>
            void laid.set(`${i},${j}`, mesh),
        } as unknown as Stage,
        null
      );

      return laid;
    },
    same = (a: OverlayMesh | null, b: OverlayMesh | null): boolean =>
      a === null || b === null
        ? a === b
        : a.positions.length === b.positions.length &&
          a.positions.every((value, at) => value === b.positions[at]),
    land = new Land(world);

  land.queueAll(0, 0);

  const before = overlays(land),
    // The square on row 20 whose middle is the last before the first chunk's border, and the one after it.
    border = Math.min(
      ...[...before.keys()]
        .map((key) => Number(key.split(',')[0]))
        .filter((i) => i > 0)
    ),
    row = 20,
    west = Array.from({ length: width - 1 }, (_, x) => x).find(
      (x) =>
        land.overlayKeyOf(x, row).startsWith('0,') &&
        land.overlayKeyOf(x + 1, row).startsWith(`${border},`)
    )!,
    // Its neighbour across an edge in the next chunk: across a corner, the woods barely thin.
    topology = world.topology(),
    [westU, westV] = land.layout.centre(west, row),
    across = topology
      .directions()
      .map((direction) => topology.neighbour(west, row, direction)!)
      .filter(
        ([x, y]) => land.overlayKeyOf(x, y) !== land.overlayKeyOf(west, row)
      )
      .sort(
        (a, b) =>
          Math.hypot(
            land.layout.centre(...a)[0] - westU,
            land.layout.centre(...a)[1] - westV
          ) -
          Math.hypot(
            land.layout.centre(...b)[0] - westU,
            land.layout.centre(...b)[1] - westV
          )
      )[0]!,
    results: unknown[] = [];

  // A fortress built there and taken away: no terrain changes, so no land is built again, and only what's laid on it
  //  and beside it can lay the forest's chunk again.
  [['Fortress'], []].forEach((improvements) => {
    const tile = tiles.find(
      (each) => each.x === across[0] && each.y === across[1]
    )!;

    (tile as { improvements: unknown[] }).improvements = improvements.map(
      (_) => ({ _ })
    );
    land.changed([across], 0, 0);
    results.push(land.pending());

    const laid = overlays(land),
      fresh = new Land(world);

    fresh.queueAll(0, 0);

    const after = overlays(fresh),
      differ = [...after.keys()].filter(
        (key) => !same(after.get(key) ?? null, before.get(key) ?? null)
      );

    results.push([
      differ.includes(land.overlayKeyOf(west, row)),
      differ.filter((key) => !laid.has(key)),
      [...laid.keys()].every((key) =>
        same(laid.get(key) ?? null, after.get(key) ?? null)
      ),
    ]);
    after.forEach((mesh, key) => before.set(key, mesh));
  });

  expect(
    `${topologyId}: a forest's neighbour across a chunk's border, given a fortress and then without it, builds no land again, but lays the forest's chunk again, and every chunk it changes, as land made afresh lays them`,
    results,
    [0, [true, [], true], 0, [true, [], true]]
  );
});

// Dense woods (#1363), on the square grid, on 24 squares each whole forest and whole jungle (their neighbours the
//  same): trees close together, smaller towards the clearing round the middle where a unit stands; undergrowth under
//  them, more of it in a jungle; in the clearing only what's lower than a unit's stand (0.03), most squares' clearing
//  growing some; a swamp as sparse as woods were (a point every 0.26, about 15 a square, against 35).
{
  const width = 12,
    height = 10,
    topologyId: TopologyId = 'square',
    topology = topologyFor({ width, height, topologyId }),
    layout = groundLayoutFor({
      width,
      height,
      topologyId,
      wrapsY: topology.wrapsY(),
    }),
    squares = Array.from({ length: 24 }, (_, at) => [
      2 + (at % 8),
      2 + Math.floor(at / 8),
    ]),
    TREE_KINDS = new Set(TREES),
    laidOn = (terrain: string, models: boolean) =>
      squares.map(([x, y]) => {
        const into = soup(),
          place = placeOf(layout, topology, x!, y!),
          { grown } = layOverlay(
            overlayOf(topology, x!, y!, terrain, () => terrain),
            models
              ? {
                  ...place,
                  plantModel: (kind) => (TREE_KINDS.has(kind) ? 'tree' : null),
                }
              : place,
            into
          );

        return { centre: place.centre, grown, into };
      }),
    average = (counts: number[]) =>
      counts.reduce((sum, count) => sum + count, 0) / counts.length,
    under = (terrain: string) =>
      average(
        laidOn(terrain, false).map(
          ({ grown }) =>
            grown.filter(([, , kind]) => !TREE_KINDS.has(kind)).length
        )
      ),
    trees = (terrain: string) =>
      average(
        laidOn(terrain, false).map(
          ({ grown }) =>
            grown.filter(([, , kind]) => TREE_KINDS.has(kind)).length
        )
      ),
    // Points of what's built in that stand higher than a unit's stand within 0.17 of the middle, on squares of
    //  `terrain`; and how many squares grow something within 0.2 of it.
    inClearing = (terrain: string) => {
      const laid = laidOn(terrain, false);

      return [
        laid.flatMap(({ centre, into }) =>
          Array.from(
            { length: into.positions.length / 3 },
            (_, n) =>
              [
                into.positions[n * 3]!,
                into.positions[n * 3 + 1]!,
                into.positions[n * 3 + 2]!,
              ] as const
          ).filter(
            ([u, y, v]) =>
              Math.hypot(u - centre[0], v - centre[1]) < 0.17 && y > 0.031
          )
        ).length,
        laid.filter(({ centre, grown }) =>
          grown.some(([u, v]) => Math.hypot(u - centre[0], v - centre[1]) < 0.2)
        ).length,
      ];
    },
    // The heights of a set's trees on whole forest, near the clearing (within 0.36 of the middle) and further out.
    heights = laidOn('Forest', true).reduce<[number[], number[]]>(
      ([near, far], { centre, into }) => {
        const laid = into.plants.get('tree') ?? [];

        for (let n = 0; n < laid.length / PLANT_NUMBERS; n++) {
          const out = Math.hypot(
            laid[n * PLANT_NUMBERS]! - centre[0],
            laid[n * PLANT_NUMBERS + 2]! - centre[1]
          );

          (out < 0.36 ? near : far).push(laid[n * PLANT_NUMBERS + 3]!);
        }

        return [near, far];
      },
      [[], []]
    ),
    swamp = average(
      squares.map(
        ([x, y]) =>
          woodsPlants(
            overlayOf(topology, x!, y!, 'Swamp', () => 'Swamp'),
            placeOf(layout, topology, x!, y!),
            growthOf('Swamp')!
          ).length
      )
    ),
    // Each of the undergrowth's points on the square the layout says, as the trees' are.
    misplaced = squares.flatMap(([x, y]) =>
      undergrowthPlants(
        overlayOf(topology, x!, y!, 'Jungle', () => 'Jungle'),
        placeOf(layout, topology, x!, y!),
        growthOf('Jungle')!
      ).filter(({ u, v }) => {
        const [tx, ty] = layout.tileAt(u, v);

        return tx !== x || ty !== y;
      })
    ).length;

  expect(
    'whole forest and jungle: at least 20 trees a square; undergrowth under them, more in a jungle; in the clearing nothing taller than a unit’s stand, but something growing on most squares; a set’s trees smaller near the clearing; a swamp sparse; undergrowth on the square it’s on',
    [
      trees('Forest') >= 20,
      trees('Jungle') >= 20,
      under('Forest') >= 10,
      under('Jungle') > under('Forest') * 1.5,
      inClearing('Forest')[0],
      inClearing('Jungle')[0],
      inClearing('Forest')[1]! > 18,
      inClearing('Jungle')[1]! > 18,
      heights[0].length > 0 && average(heights[0]) < average(heights[1]) * 0.92,
      swamp < 18,
      misplaced,
    ],
    [true, true, true, true, 0, 0, true, true, true, true, 0]
  );
}

// Far woods thinned (#1363): all of a chunk's plants drawn near the camera, fewer further off but never fewer than the
//  least share; each plant's rank the same wherever it's laid, from 0 to 1; and the first quarter of a forest's trees by
//  rank, as a far chunk draws them, spread over every quarter of its squares.
{
  const width = 12,
    height = 10,
    topologyId: TopologyId = 'square',
    topology = topologyFor({ width, height, topologyId }),
    layout = groundLayoutFor({
      width,
      height,
      topologyId,
      wrapsY: topology.wrapsY(),
    }),
    planted = Array.from({ length: 16 }, (_, at) => [
      2 + (at % 4),
      2 + Math.floor(at / 4),
    ]).flatMap(([x, y]) =>
      woodsPlants(
        overlayOf(topology, x!, y!, 'Forest', () => 'Forest'),
        placeOf(layout, topology, x!, y!),
        forest
      )
    ),
    // As the stage orders them to draw: by the overlay's numbers, where each stands first.
    ranked = rankedOrder(
      planted.flatMap(({ u, v }) => [u, 0, v, 1, 0]),
      PLANT_NUMBERS
    ).map((n) => planted[n]!),
    first = ranked.slice(0, Math.ceil(ranked.length / 4)),
    // How many of the first quarter are in each quarter of the 4 by 4 squares, from (2, 2).
    quarters = [0, 1, 2, 3].map(
      (quarter) =>
        first.filter(
          ({ u, v }) => (u >= 4 ? 1 : 0) + (v >= 4 ? 2 : 0) === quarter
        ).length
    ),
    distances = [0, PLANTS_THIN_FROM, PLANTS_THIN_FROM * 1.5, 20, 40, 400],
    kept = distances.map(plantsKept);

  expect(
    'far woods thinned: all drawn near, fewer further, never under the least; a plant’s rank its own, from 0 to 1; the first quarter by rank spread over every quarter of the woods',
    [
      kept.slice(0, 2),
      kept.every((share, n) => n === 0 || share <= kept[n - 1]!),
      Math.min(...kept) >= PLANTS_THIN_LEAST,
      kept[5],
      planted.every(
        ({ u, v }) =>
          plantRank(u, v) === plantRank(u, v) &&
          plantRank(u, v) >= 0 &&
          plantRank(u, v) < 1
      ),
      quarters.every(
        (count) =>
          count > (first.length / 4) * 0.6 && count < (first.length / 4) * 1.4
      ),
    ],
    [[1, 1], true, true, PLANTS_THIN_LEAST, true, true]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL woods: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS woods (${checks} checks)\n`);
