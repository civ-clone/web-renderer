// The 3D map's debug page (docs/3d-renderer-plan.md 1.1b):
//  - its made-up world: the same for the same options, a Civ1 world's terrains and share of land, ice at the poles,
//    rivers, and as much seen as asked, on every grid;
//  - its options, from its address;
//  - the land built over it, every chunk once, and the nearest to where the map is centred first, after it moves too.

import { ChunkMesh } from '@civ-clone/ui-map-3d/terrain/chunks';
import { Stage } from '@civ-clone/ui-map-3d/stage';
import { TopologyName } from '@civ-clone/ui-client/lib/topologyFor';
import { terrainTable } from '@civ-clone/ui-models-builtin/terrain';
import Land from '@civ-clone/ui-map-3d/Land';
import World from '@civ-clone/ui-map/components/World';
import generateWorld from '@civ-clone/ui-map-3d/debug/generateWorld';
import pageOptions from '@civ-clone/ui-map-3d/debug/pageOptions';

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

const grids: TopologyName[] = ['square', 'staggered-iso', 'hex-odd-r'],
  width = 80,
  height = 50,
  count = (terrain: string[][], wanted: (name: string) => boolean): number =>
    terrain.flat().filter(wanted).length;

grids.forEach((topologyId) => {
  const options = { topologyId, width, height, seed: 7, seen: 1 },
    { terrain } = generateWorld(options),
    squares = width * height;

  expect(
    `${topologyId}: the same options give the same world`,
    generateWorld(options).terrain,
    terrain
  );
  expect(
    `${topologyId}: another seed gives another`,
    JSON.stringify(generateWorld({ ...options, seed: 8 }).terrain) ===
      JSON.stringify(terrain),
    false
  );
  expect(
    `${topologyId}: every row is the world's width, and there are as many as its height`,
    [terrain.length, terrain.every((row) => row.length === width)],
    [height, true]
  );
  expect(
    `${topologyId}: every terrain is one the 3D map has, and with everything seen none is Unknown`,
    [...new Set(terrain.flat())].filter(
      (name) => !Object.prototype.hasOwnProperty.call(terrainTable, name)
    ),
    []
  );

  const land = count(terrain, (name) => name !== 'Ocean') / squares;

  expect(
    `${topologyId}: about two fifths of it is land, as on a Civ1 world`,
    [land > 0.35, land < 0.48, land],
    [true, true, land]
  );
  expect(
    `${topologyId}: the top and bottom rows are ice`,
    [terrain[0], terrain[height - 1]].map((row) =>
      row?.every((name) => name === 'Arctic')
    ),
    [true, true]
  );
  expect(
    `${topologyId}: it has hills, mountains, rivers, forest, grassland and plains`,
    ['Hills', 'Mountains', 'River', 'Forest', 'Grassland', 'Plains'].map(
      (wanted) => count(terrain, (name) => name === wanted) > 0
    ),
    [true, true, true, true, true, true]
  );

  [0, 0.3, 0.6].forEach((seen) => {
    const unknown =
      count(
        generateWorld({ ...options, seen }).terrain,
        (name) => name === 'Unknown'
      ) / squares;

    expect(
      `${topologyId}: with ${seen} of it seen, the rest is Unknown`,
      Math.abs(unknown - (1 - seen)) < 0.02,
      true
    );
  });

  const middle = generateWorld({ ...options, seen: 0.3 }).terrain[height / 2];

  expect(
    `${topologyId}: what's seen is round the world's middle`,
    middle?.[width / 2] !== 'Unknown' && middle?.[0] === 'Unknown',
    true
  );
});

expect(
  'a staggered or hex world with an odd number of rows is refused, as the engine would',
  (['staggered-iso', 'hex-odd-r'] as TopologyName[]).map((topologyId) => {
    try {
      generateWorld({ topologyId, width, height: 51, seed: 1, seen: 1 });

      return 'built';
    } catch {
      return 'refused';
    }
  }),
  ['refused', 'refused']
);

// The page's options.
expect(
  'with none, an 80 by 50 square world, all seen, centred',
  pageOptions(''),
  {
    topologyId: 'square',
    width: 80,
    height: 50,
    seed: 1,
    seen: 1,
    x: 40,
    y: 25,
  }
);
expect(
  'each as asked',
  pageOptions('?grid=hex-odd-r&width=40&height=30&seed=9&seen=0.5&x=3&y=4'),
  {
    topologyId: 'hex-odd-r',
    width: 40,
    height: 30,
    seed: 9,
    seen: 0.5,
    x: 3,
    y: 4,
  }
);
expect(
  'a grid it does not know is square; sizes and the centre are kept to what they can be; blanks are as if not given',
  pageOptions('?grid=triangles&width=2&height=9999&seed=&seen=7&x=-4&y=nope'),
  {
    topologyId: 'square',
    width: 8,
    height: 400,
    seed: 1,
    seen: 1,
    x: 0,
    y: 200,
  }
);
expect(
  'an odd number of rows on a grid that wraps over the poles is made even',
  [
    pageOptions('?grid=staggered-iso&height=31').height,
    pageOptions('?grid=square&height=31').height,
  ],
  [32, 31]
);

// The land over it.
grids.forEach((topologyId) => {
  const { terrain } = generateWorld({
      topologyId,
      width: 64,
      height: 40,
      seed: 3,
      seen: 1,
    }),
    world = new World({
      _: 'World',
      __: ['World', 'DataObject'],
      id: 'debug-world',
      width: 64,
      height: 40,
      topologyId,
      tiles: terrain.flatMap((row, y) =>
        row.map(
          (name, x) =>
            ({
              x,
              y,
              terrain: { _: name, __: [name], id: `${name}-${x}-${y}` },
            } as never)
        )
      ),
    }),
    land = new Land(world),
    built: [number, number][] = [],
    stage = {
      setChunk: (i: number, j: number, mesh: ChunkMesh) => {
        void mesh;
        built.push([i, j]);
      },
    } as unknown as Stage,
    // The middle of chunk `i`, `j` on the ground, from where the land puts it.
    chunkMiddles = new Map<string, [number, number]>(),
    recordingStage = {
      setChunk: (i: number, j: number, mesh: ChunkMesh) => {
        built.push([i, j]);

        const points = mesh.positions.length / 3,
          last = (points - 1) * 3;

        chunkMiddles.set(`${i},${j}`, [
          mesh.u + (mesh.positions[last] ?? 0) / 2,
          mesh.v + (mesh.positions[last + 2] ?? 0) / 2,
        ]);
      },
    } as unknown as Stage,
    { u: periodU, v: periodV } = land.layout.period(),
    // How far apart two places are, the short way round the world.
    round = (delta: number, period: number | null): number =>
      period === null
        ? Math.abs(delta)
        : Math.abs(delta - period * Math.round(delta / period));

  land.queueAll(0, 0);
  land.build(recordingStage, null);

  const all = built.splice(0),
    keys = all.map(([i, j]) => `${i},${j}`);

  expect(
    `${topologyId}: every chunk is built once`,
    [keys.length > 1, new Set(keys).size === keys.length, land.pending()],
    [true, true, 0]
  );

  // Somewhere far from where it started: half the world along.
  const [farU, farV] = land.layout.centre(32, 20),
    distance = (key: string): number => {
      const [u, v] = chunkMiddles.get(key) ?? [0, 0];

      return Math.hypot(round(u - farU, periodU), round(v - farV, periodV));
    },
    nearest = [...keys].sort((a, b) => distance(a) - distance(b))[0];

  land.queueAll(0, 0);
  land.refocus(farU, farV);
  land.build(stage, null);

  expect(
    `${topologyId}: centred elsewhere, the chunk nearest the new centre is built first`,
    built.map(([i, j]) => `${i},${j}`)[0],
    nearest
  );

  built.length = 0;
});

if (failures.length > 0) {
  process.stderr.write(
    `FAIL debugWorld: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS debugWorld (${checks} checks)\n`);
