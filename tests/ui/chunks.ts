// The land's mesh (docs/3d-renderer.md §4.2, plan 1.1), on every grid:
//  - the chunks divide the world's period exactly;
//  - a point two chunks share has the same place, height and normal in both, across the world's wrap too;
//  - every normal is a unit, and faces up;
//  - a change to a square reaches the chunks round it, and only those, taken round the world's period.

import topologyFor, { Topology } from '@civ-clone/ui-client/lib/topologyFor';
import groundLayoutFor from '@civ-clone/ui-map-3d/layouts';
import createRelief, {
  ReliefSource,
} from '@civ-clone/ui-map-3d/terrain/relief';
import {
  ChunkMesh,
  buildChunk,
  chunkGrid,
  chunksNear,
} from '@civ-clone/ui-map-3d/terrain/chunks';
import { Stage } from '@civ-clone/ui-map-3d/stage';
import { TopologyId } from '@civ-clone/ui-protocol/topology';
import { REACH } from '@civ-clone/ui-map-3d/terrain/kernel';
import Land from '@civ-clone/ui-map-3d/Land';
import World from '@civ-clone/ui-map/components/World';

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

const width = 16,
  height = 12,
  ids: TopologyId[] = ['square', 'staggered-iso', 'hex-odd-r'],
  terrains = ['Grassland', 'Hills', 'Mountains', 'Ocean', 'Plains', 'Forest'];

const sourceFor = (topology: Topology): ReliefSource => ({
  width,
  height,
  wrapsY: topology.wrapsY(),
  terrainAt: (x, y) =>
    terrains[(x * 3 + y * 5 + ((x * y) % 4)) % terrains.length],
  waterAt: (x, y) =>
    terrains[(x * 3 + y * 5 + ((x * y) % 4)) % terrains.length] === 'Ocean',
  neighbours: (x, y) =>
    topology
      .directions()
      .map((direction) => topology.neighbour(x, y, direction))
      .filter((square): square is [number, number] => square !== null),
});

// A point of a chunk, on the whole ground: its place, height and normal, rounded past any float noise.
const point = (chunk: ChunkMesh, index: number): number[] =>
  [
    chunk.positions[index * 3]! + chunk.u,
    chunk.positions[index * 3 + 1]!,
    chunk.positions[index * 3 + 2]! + chunk.v,
    chunk.normals[index * 3]!,
    chunk.normals[index * 3 + 1]!,
    chunk.normals[index * 3 + 2]!,
  ].map((value) => Number(value.toFixed(5)));

ids.forEach((topologyId) => {
  const topology = topologyFor({ width, height, topologyId }),
    layout = groundLayoutFor({
      width,
      height,
      topologyId,
      wrapsY: topology.wrapsY(),
    }),
    relief = createRelief({ layout, source: sourceFor(topology) }),
    // Small chunks, coarsely sampled, so the test is quick: several chunks each way.
    grid = chunkGrid(layout, height, { size: 5, perUnit: 3 }),
    { u: acrossPeriod, v: downPeriod } = layout.period(),
    chunk = (i: number, j: number) => buildChunk(grid, relief, i, j),
    columns = grid.stepsU + 1;

  expect(
    `${topologyId}: the chunks divide the world's period exactly`,
    [
      Math.abs(grid.chunksU * grid.stepsU * grid.spacingU - acrossPeriod) <
        1e-9,
      Math.abs(grid.chunksV * grid.stepsV * grid.spacingV - downPeriod!) < 1e-9,
      grid.chunksU > 1 && grid.chunksV > 1,
    ],
    [true, true, true]
  );

  // Neighbouring chunks: the right column of one is the left column of the next, and the bottom row of one the top row
  //  of the one below. And the last chunk across meets the first a period along.
  const first = chunk(0, 0),
    right = chunk(1, 0),
    below = chunk(0, 1),
    last = chunk(grid.chunksU - 1, 0),
    rightColumn = (mesh: ChunkMesh) =>
      Array.from({ length: grid.stepsV + 1 }, (_, b) =>
        point(mesh, b * columns + grid.stepsU)
      ),
    leftColumn = (mesh: ChunkMesh, shiftU = 0) =>
      Array.from({ length: grid.stepsV + 1 }, (_, b) => {
        const [u, ...rest] = point(mesh, b * columns);

        return [Number((u! + shiftU).toFixed(5)), ...rest];
      });

  expect(
    `${topologyId}: a chunk's right border is the next chunk's left, place, height and normal`,
    rightColumn(first),
    leftColumn(right)
  );
  expect(
    `${topologyId}: a chunk's bottom border is the top of the one below`,
    Array.from({ length: columns }, (_, a) =>
      point(first, grid.stepsV * columns + a)
    ),
    Array.from({ length: columns }, (_, a) => point(below, a))
  );
  expect(
    `${topologyId}: the last chunk across meets the first a period along`,
    rightColumn(last),
    leftColumn(first, acrossPeriod)
  );

  const normals = Array.from({ length: first.normals.length / 3 }, (_, n) => [
    first.normals[n * 3]!,
    first.normals[n * 3 + 1]!,
    first.normals[n * 3 + 2]!,
  ]);

  expect(
    `${topologyId}: every normal is a unit, facing up`,
    normals.every(
      ([x, y, z]) => Math.abs(Math.hypot(x!, y!, z!) - 1) < 1e-6 && y! > 0
    ),
    true
  );

  // A change at the world's corner reaches the chunks round it, taken round the period on both sides.
  const near = chunksNear(grid, layout, [[0, 0]], 2)
    .map(([i, j]) => `${i},${j}`)
    .sort();

  expect(
    `${topologyId}: a change at the world's corner reaches the chunks either side of it, round the period`,
    [
      near.includes('0,0'),
      near.includes(`${grid.chunksU - 1},0`),
      near.includes(`0,${grid.chunksV - 1}`),
      near.includes('2,2'),
    ],
    [true, true, true, false]
  );

  // Every chunk a square's surroundings overlap, worked out the long way: each chunk's own box against the square's.
  //  One that only touches the reach's edge needn't be rebuilt (the kernel is 0 there), and may be either way.
  const chunkU = grid.stepsU * grid.spacingU,
    chunkV = grid.stepsV * grid.spacingV,
    { u: periodU, v: periodV } = layout.period(),
    overlapping = (
      x: number,
      y: number,
      reach: number,
      touching: boolean
    ): string[] => {
      const [u, v] = layout.centre(x, y),
        found: string[] = [];

      for (let i = 0; i < grid.chunksU; i++) {
        for (let j = 0; j < grid.chunksV; j++) {
          const meets = (
            low: number,
            span: number,
            middle: number,
            period: number | null
          ): boolean =>
            (period === null ? [0] : [-period, 0, period]).some((offset) =>
              touching
                ? low + offset <= middle + reach &&
                  low + offset + span >= middle - reach
                : low + offset < middle + reach &&
                  low + offset + span > middle - reach
            );

          if (
            meets(i * chunkU, chunkU, u, periodU) &&
            meets(j * chunkV, chunkV, v, periodV)
          ) {
            found.push(`${i},${j}`);
          }
        }
      }

      return found.sort();
    };

  expect(
    `${topologyId}: a change reaches every chunk within its reach on every side, and no others`,
    [
      [0, 0],
      [3, 4],
      [width - 1, height - 1],
      [7, 2],
    ].flatMap(([x, y]) =>
      [0.5, 2, 3.7]
        .map((reach) => ({
          x,
          y,
          reach,
          near: chunksNear(grid, layout, [[x!, y!]], reach)
            .map(([i, j]) => `${i},${j}`)
            .sort(),
          within: overlapping(x!, y!, reach, false),
          touching: overlapping(x!, y!, reach, true),
        }))
        .filter(
          ({ near, within, touching }) =>
            within.some((key) => !near.includes(key)) ||
            near.some((key) => !touching.includes(key))
        )
    ),
    []
  );
});

// Each chunk marks its points on squares never seen, for the cloud: on the square grid, a square of them.
{
  const topology = topologyFor({ width, height, topologyId: 'square' }),
    layout = groundLayoutFor({
      width,
      height,
      topologyId: 'square',
      wrapsY: topology.wrapsY(),
    }),
    relief = createRelief({
      layout,
      source: {
        ...sourceFor(topology),
        terrainAt: (x, y) => (x === 2 && y === 2 ? 'Unknown' : 'Grassland'),
        waterAt: () => false,
      },
    }),
    grid = chunkGrid(layout, height, { size: 4, perUnit: 4 }),
    chunk = buildChunk(grid, relief, 0, 0),
    across = grid.stepsU + 1,
    marked = Array.from(chunk.unseen).flatMap((value, point) =>
      value === 1
        ? [
            [
              (point % across) * grid.spacingU,
              Math.floor(point / across) * grid.spacingV,
            ],
          ]
        : []
    );

  expect(
    'a chunk marks the points on a square never seen, and only those',
    [
      marked.length > 0,
      marked.every(([u, v]) => u! >= 2 && u! < 3 && v! >= 2 && v! < 3),
      Array.from(chunk.unseen).every((value) => value === 0 || value === 1),
    ],
    [true, true, true]
  );
}

// The land's own reach for a change: a square that changes rebuilds every chunk whose mesh it changes, and a patch that
//  changes no terrain (a unit moving, a city growing) rebuilds none. On a world big enough for many chunks.
ids.forEach((topologyId) => {
  const landWidth = 64,
    landHeight = 40,
    terrainFor = (x: number, y: number): string =>
      terrains[(x * 7 + y * 3 + ((x * y) % 5)) % terrains.length]!,
    tiles = Array.from({ length: landWidth * landHeight }, (_, at) => {
      const x = at % landWidth,
        y = Math.floor(at / landWidth),
        name = terrainFor(x, y);

      return {
        x,
        y,
        isWater: name === 'Ocean',
        terrain: { _: name, __: [name], id: `${name}-${x}-${y}` },
      };
    }),
    world = new World({
      _: 'World',
      __: ['World', 'DataObject'],
      id: 'world',
      width: landWidth,
      height: landHeight,
      topologyId,
      tiles: tiles as never,
    }),
    meshes = (land: Land): Map<string, ChunkMesh> => {
      const built = new Map<string, ChunkMesh>();

      land.build(
        {
          setChunk: (i: number, j: number, mesh: ChunkMesh) =>
            void built.set(`${i},${j}`, mesh),
          setOverlay: () => undefined,
        } as unknown as Stage,
        null
      );

      return built;
    },
    same = (a: ChunkMesh, b: ChunkMesh): boolean =>
      a.positions.every((value, at) => value === b.positions[at]) &&
      a.normals.every((value, at) => value === b.normals[at]) &&
      a.colours.every((value, at) => value === b.colours[at]),
    land = new Land(world);

  land.queueAll(0, 0);

  const before = meshes(land);

  land.changed([[20, 20]], 0, 0);

  expect(
    `${topologyId}: a patch that changes no terrain rebuilds nothing`,
    land.pending(),
    0
  );

  // The square at (`x`, `y`) made `name`: every chunk whose mesh that changes is built again, and not the whole world.
  const change = (x: number, y: number, name: string): void => {
    const tile = tiles.find((each) => each.x === x && each.y === y)!;

    tile.terrain = { _: name, __: [name], id: 'changed' };
    tile.isWater = name === 'Ocean';

    land.changed([[x, y]], 0, 0);

    const rebuilt = meshes(land),
      fresh = new Land(world);

    fresh.queueAll(0, 0);

    const after = meshes(fresh),
      differ = [...after.keys()].filter(
        (key) => !same(after.get(key)!, before.get(key)!)
      );

    expect(
      `${topologyId}: ${name} at ${x},${y} rebuilds every chunk it changes, and not the whole world`,
      [
        differ.length > 0,
        differ.filter((key) => !rebuilt.has(key)),
        rebuilt.size < after.size,
      ],
      [true, [], true]
    );

    after.forEach((mesh, key) => before.set(key, mesh));
  };

  (
    [
      [20, 20, 'Mountains'],
      [33, 11, 'Ocean'],
      [12, 30, 'Grassland'],
    ] as const
  ).forEach(([x, y, wanted]) => {
    const tile = tiles.find((each) => each.x === x && each.y === y)!;

    // Something other than it is.
    change(x, y, tile.terrain._ === wanted ? 'Plains' : wanted);
  });

  // A range made across the first chunk's border, a mountain at a time: one either side of it on a row, joined, then
  //  one beside the second on the next row, then the first taken away. Plains first, where they're not already.
  const grid = chunkGrid(land.layout, landHeight),
    border = grid.stepsU * grid.spacingU,
    row = 20,
    west = Array.from({ length: landWidth - 1 }, (_, x) => x).find(
      (x) =>
        land.layout.centre(x, row)[0] < border &&
        land.layout.centre(x + 1, row)[0] >= border
    )!,
    topology = world.topology(),
    below = topology
      .directions()
      .map((direction) => topology.neighbour(west + 1, row, direction))
      .find((square) => square !== null && square[1] > row)!,
    range: [number, number][] = [[west, row], [west + 1, row], below];

  range.forEach(([x, y]) => {
    if (
      tiles.find((each) => each.x === x && each.y === y)!.terrain._ !== 'Plains'
    ) {
      change(x, y, 'Plains');
    }
  });
  range.forEach(([x, y]) => change(x, y, 'Mountains'));
  change(west, row, 'Plains');
});

// Land rising from an empty sea, where the floor it moves is what reaches the next chunk: two squares out, the floor
//  rises, and that square's kernel reaches over a chunk's border that the new land's own doesn't.
ids.forEach((topologyId) => {
  const seaWidth = 64,
    seaHeight = 40,
    tiles = Array.from({ length: seaWidth * seaHeight }, (_, at) => ({
      x: at % seaWidth,
      y: Math.floor(at / seaWidth),
      isWater: true,
      terrain: { _: 'Ocean', __: ['Ocean'], id: `Ocean-${at}` },
    })),
    world = new World({
      _: 'World',
      __: ['World', 'DataObject'],
      id: 'sea',
      width: seaWidth,
      height: seaHeight,
      topologyId,
      tiles: tiles as never,
    }),
    topology = world.topology(),
    layout = groundLayoutFor({
      width: seaWidth,
      height: seaHeight,
      topologyId,
      wrapsY: topology.wrapsY(),
    }),
    grid = chunkGrid(layout, seaHeight),
    chunkU = grid.stepsU * grid.spacingU,
    [cu, cv] = layout.centre(0, 0),
    kernel =
      REACH +
      Math.max(
        ...layout.outline(0, 0).map(([u, v]) => Math.hypot(u - cu, v - cv))
      ),
    neighbours = (x: number, y: number): [number, number][] =>
      topology
        .directions()
        .map((direction) => topology.neighbour(x, y, direction))
        .filter((square): square is [number, number] => square !== null),
    // The furthest a neighbour's middle is: a step of the sea floor's walk.
    step = Math.max(
      ...neighbours(10, 20).map(([nx, ny]) => {
        const [nu, nv] = layout.centre(nx, ny),
          [u, v] = layout.centre(10, 20);

        return Math.hypot(nu - u, nv - v);
      })
    ),
    // A square whose own reach stops short of the next chunk's border by more than `short`, but whose sea two steps
    //  out, its floor raised, reaches over it: on an even row or an odd one, whose middles lie half a step apart. Away
    //  from the world's seam, so no neighbour is a world away.
    choose = (short: number): [number, number] | undefined =>
      [20, 21]
        .flatMap((y) =>
          Array.from({ length: seaWidth - 16 }, (_, x): [number, number] => [
            x + 8,
            y,
          ])
        )
        .find(([x, y]) => {
          const [u] = layout.centre(x, y),
            border = Math.ceil(u / chunkU) * chunkU;

          return (
            border - u > short + 0.05 &&
            neighbours(x, y)
              .flatMap(([nx, ny]) => neighbours(nx, ny))
              .some(
                ([fx, fy]) => layout.centre(fx, fy)[0] + REACH > border + 0.05
              )
          );
        }),
    // Past a walk of one step too, where the grid has such a square, so the reach is two steps and not one. On the
    //  square grid one step reaches as far: a diagonal step is longer than two steps along.
    twoSteps = choose(kernel + step),
    [chosen, row] = twoSteps ?? choose(kernel) ?? [undefined, 20],
    short = twoSteps === undefined ? kernel : kernel + step,
    meshes = (land: Land): Map<string, ChunkMesh> => {
      const built = new Map<string, ChunkMesh>();

      land.build(
        {
          setChunk: (i: number, j: number, mesh: ChunkMesh) =>
            void built.set(`${i},${j}`, mesh),
          setOverlay: () => undefined,
        } as unknown as Stage,
        null
      );

      return built;
    },
    land = new Land(world);

  land.queueAll(0, 0);

  const before = meshes(land),
    tile = tiles.find((each) => each.x === chosen && each.y === row)!;

  tile.terrain = { _: 'Grassland', __: ['Grassland'], id: 'land' };
  tile.isWater = false;
  land.changed([[chosen!, row]], 0, 0);

  const rebuilt = meshes(land),
    fresh = new Land(world);

  fresh.queueAll(0, 0);

  const after = meshes(fresh),
    differ = [...after.keys()].filter(
      (key) =>
        !after
          .get(key)!
          .positions.every(
            (value, at) => value === before.get(key)!.positions[at]
          )
    ),
    within = chunksNear(grid, layout, [[chosen!, row]], short).map(
      ([i, j]) => `${i},${j}`
    );

  expect(
    `${topologyId}: land rising from the sea rebuilds the chunk past where its own kernel reaches${
      topologyId === 'square' ? '' : ', and a step of the sea further'
    }, whose floor it raised`,
    [
      twoSteps !== undefined || topologyId === 'square',
      chosen !== undefined,
      differ.some((key) => !within.includes(key)),
      differ.filter((key) => !rebuilt.has(key)),
    ],
    [true, true, true, []]
  );
});

if (failures.length > 0) {
  process.stderr.write(
    `FAIL chunks: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS chunks (${checks} checks)\n`);
