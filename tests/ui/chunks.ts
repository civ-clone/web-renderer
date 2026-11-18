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
import { TopologyId } from '@civ-clone/ui-protocol/topology';

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
