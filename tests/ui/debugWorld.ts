// The 3D map's debug page (docs/3d-renderer-plan.md 1.1b):
//  - its made-up world: the same for the same options, a Civ1 world's terrains and share of land, ice at the poles,
//    rivers, and as much seen as asked, on every grid;
//  - its options, from its address;
//  - its gallery: every unit type the built-in set names, once each, nearest the middle first, ships at sea and the rest
//    on land, never on squares unseen, and no cities;
//  - its specials: every special the built-in set draws, and a cairn, once each, likewise, each on its own square;
//  - the land built over it, every chunk once, and the nearest to where the map is centred first, after it moves too.

import { ChunkMesh } from '@civ-clone/ui-map-3d/terrain/chunks';
import { Stage } from '@civ-clone/ui-map-3d/stage';
import { TopologyName } from '@civ-clone/ui-client/lib/topologyFor';
import { terrainTable } from '@civ-clone/ui-models-builtin/terrain';
import Land from '@civ-clone/ui-map-3d/Land';
import World from '@civ-clone/ui-map/components/World';
import generateWorld from '@civ-clone/ui-map-3d/debug/generateWorld';
import pageOptions from '@civ-clone/ui-map-3d/debug/pageOptions';
import populate, {
  gallery,
  improvementsGallery,
  improvementsShown,
  specialsGallery,
  specialsRows,
  specialsShown,
} from '@civ-clone/ui-map-3d/debug/populate';
import { unitTable } from '@civ-clone/ui-models-builtin/units';
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
    gallery: false,
    specials: false,
    improvements: false,
    distance: null,
    x: 40,
    y: 25,
  }
);
expect(
  'each as asked',
  pageOptions(
    '?grid=hex-odd-r&width=40&height=30&seed=9&seen=0.5&distance=12.5&x=3&y=4&gallery=1&specials=1&improvements=1'
  ),
  {
    topologyId: 'hex-odd-r',
    width: 40,
    height: 30,
    seed: 9,
    seen: 0.5,
    gallery: true,
    specials: true,
    improvements: true,
    distance: 12.5,
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
    height: 160,
    seed: 1,
    seen: 1,
    gallery: false,
    specials: false,
    improvements: false,
    distance: null,
    x: 0,
    y: 80,
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
              isWater: name === 'Ocean',
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
      setOverlay: () => undefined,
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
      setOverlay: () => undefined,
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

// The gallery, on 20 by 10 squares: three rows of sea at the top, with the squares nearest the middle never seen, and
//  land.
const shelf = Array.from({ length: 200 }, (_, index) => {
    const x = index % 20,
      y = Math.floor(index / 20),
      terrain =
        y < 3 && x >= 8 && x <= 12 ? 'Unknown' : y < 3 ? 'Ocean' : 'Grassland';

    return {
      x,
      y,
      terrain: { _: terrain },
      isLand: terrain === 'Grassland',
      city: { name: 'Gone' },
      units: [],
    } as unknown as Tile;
  }),
  placed = (): [string, Tile][] =>
    shelf.flatMap((tile) =>
      (tile.units ?? []).map((unit): [string, Tile] => [unit._, tile])
    );

gallery(shelf, 10, 6);

const laidOut = placed();

expect(
  'its gallery: every unit type once, ships at sea, the rest on land, none unseen, no cities, the nearest the middle first',
  [
    laidOut.map(([type]) => type).sort(),
    laidOut
      .filter(([type, tile]) =>
        unitTable[type]!.shape === 'ship'
          ? tile.isLand || tile.terrain._ !== 'Ocean'
          : !tile.isLand
      )
      .map(([type]) => type),
    shelf.filter((tile) => tile.city !== null).length,
    shelf[6 * 20 + 10]!.units[0]?._,
  ],
  [Object.keys(unitTable).sort(), [], 0, Object.keys(unitTable)[0]]
);

// Its specials, on 30 by 20 squares: three rows of sea at the top, with the squares nearest the middle never seen, and
//  land, with a city and a unit on each square.
const field = Array.from({ length: 600 }, (_, index) => {
    const x = index % 30,
      y = Math.floor(index / 30),
      terrain =
        y < 3 && x >= 12 && x <= 18 ? 'Unknown' : y < 3 ? 'Ocean' : 'Grassland';

    return {
      x,
      y,
      terrain: { _: terrain, features: [] },
      isLand: terrain === 'Grassland',
      city: { name: 'Gone' },
      units: [{ _: 'Warrior' }],
    } as unknown as Tile;
  }),
  // What each square was before the specials were laid, which lay their own terrain.
  before = new Map(field.map((tile) => [tile, tile.terrain._])),
  shownAt = (): [string, Tile][] => {
    specialsGallery(field, 15, 10);

    return field.flatMap((tile) =>
      (tile.terrain.features ?? []).map((feature): [string, Tile] => [
        `${tile.terrain._}:${feature._}`,
        tile,
      ])
    );
  },
  shownSpecials = shownAt();

expect(
  'its specials: every one once, each on its terrain, at sea on the sea and on land on land, none unseen, each on its own, the nearest the middle first, no cities or units',
  [
    shownSpecials.map(([key]) => key).sort(),
    shownSpecials
      .filter(([key, tile]) =>
        key.startsWith('Ocean:')
          ? tile.isLand || before.get(tile) !== 'Ocean'
          : !tile.isLand
      )
      .map(([key]) => key),
    shownSpecials.some(([, a]) =>
      shownSpecials.some(
        ([, b]) =>
          a !== b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1
      )
    ),
    field[10 * 30 + 15]!.terrain.features?.[0]?._,
    field.filter((tile) => tile.city !== null || tile.units.length > 0).length,
  ],
  [
    specialsShown()
      .map(([terrain, feature]) => `${terrain}:${feature}`)
      .sort(),
    [],
    false,
    specialsShown()[0]![1],
    0,
  ]
);

// Its improvements, on 30 by 20 squares as for its specials: each of what it shows once, on land, on its terrain, built
//  as it says, three squares from any other, the nearest the middle first; each of its roads' neighbours with a road on
//  its terrain, or what it says on the terrain it says; each of its rivers' neighbours River; no cities or units.
const works = field.map((tile) => ({
    ...tile,
    terrain: { ...tile.terrain },
    city: { name: 'Gone' },
    units: [{ _: 'Warrior' }],
  })) as unknown as Tile[],
  at = (x: number, y: number) =>
    works.find((tile) => tile.x === x && tile.y === y),
  names = (tile: Tile | undefined) =>
    (tile?.improvements ?? []).map(({ _ }) => _).join('+');

improvementsGallery(works, 15, 10);

const shown = improvementsShown(),
  // Its roads' neighbours: from where each is built, by its roads.
  neighbours = new Set(
    works.flatMap((tile) =>
      shown
        .filter(
          ({ terrain, improvements }) =>
            tile.terrain._ === terrain && names(tile) === improvements.join('+')
        )
        .flatMap(({ roads }) =>
          roads.map(([dx, dy]) => at(tile.x + dx, tile.y + dy))
        )
    )
  ),
  // Where each is built: not its roads' neighbours.
  builtAt = works.filter(
    (tile) => (tile.improvements ?? []).length > 0 && !neighbours.has(tile)
  );

expect(
  'its improvements: each once, on its land, as it says, apart, nearest first, roads out, no cities or units',
  [
    builtAt.length,
    builtAt.map((tile) => `${tile.terrain._}:${names(tile)}`).sort(),
    builtAt.every((tile) => tile.isLand),
    builtAt.every((a) =>
      builtAt.every(
        (b) => a === b || Math.abs(a.x - b.x) >= 3 || Math.abs(a.y - b.y) >= 3
      )
    ),
    names(at(15, 10)),
    shown.every(
      ({
        terrain,
        improvements,
        roads,
        along = ['Road'],
        beside = terrain,
        rivers = [],
      }) => {
        // One built as it says, of those that look alike.
        return builtAt.some(
          (tile) =>
            tile.terrain._ === terrain &&
            names(tile) === improvements.join('+') &&
            roads.every(([dx, dy]) => {
              const neighbour = at(tile.x + dx, tile.y + dy);

              return (
                names(neighbour) === along.join('+') &&
                neighbour!.terrain._ === beside
              );
            }) &&
            rivers.every(
              ([dx, dy]) => at(tile.x + dx, tile.y + dy)?.terrain._ === 'River'
            )
        );
      }
    ),
    works.filter((tile) => tile.city !== null || tile.units.length > 0).length,
  ],
  [
    shown.length,
    shown
      .map(
        ({ terrain, improvements }) => `${terrain}:${improvements.join('+')}`
      )
      .sort(),
    true,
    true,
    shown[0]!.improvements.join('+'),
    true,
    0,
  ]
);

// Its road through a fortress's corner: diagonally below on the square grid; on the others, where that's a neighbour
//  only every other row, the square below, a neighbour on every row.
expect(
  'its road through a fortress’s corner, on each grid, goes to a neighbour on every row',
  (['square', 'staggered-iso', 'hex-odd-r'] as const).map((topologyId) =>
    improvementsShown(topologyId)
      .filter(({ roads }) => roads.length === 1)
      .filter(({ improvements }) => improvements.includes('Fortress'))
      .map(({ roads }) => roads[0])
  ),
  [[[1, 1]], [[0, 1]], [[0, 1]]]
);

// On the staggered grid, where squares two rows apart touch at a corner, its specials are every fourth row.
const staggered = field.map(
    (tile) =>
      ({
        ...tile,
        terrain: { _: before.get(tile)!, features: [] },
      } as unknown as Tile)
  ),
  staggeredRows = (() => {
    specialsGallery(staggered, 15, 10, specialsRows('staggered-iso'));

    return staggered
      .filter((tile) => (tile.terrain.features ?? []).length > 0)
      .map(({ y }) => y);
  })();

expect(
  'on the staggered grid, its specials are every fourth row, every one shown; every other row on the others',
  [
    staggeredRows.every((y) => Math.abs(y - 10) % 4 === 0),
    staggeredRows.length,
    specialsRows('square'),
    specialsRows('hex-odd-r'),
  ],
  [true, specialsShown().length, 2, 2]
);

// Its seeded cities, units and ships: none on squares never seen, on a world mostly unseen.
const mostlyUnseen = Array.from({ length: 4000 }, (_, index) => {
  const x = index % 80,
    y = Math.floor(index / 80),
    terrain = x < 60 ? 'Unknown' : y % 2 === 0 ? 'Ocean' : 'Grassland';

  return {
    x,
    y,
    terrain: { _: terrain },
    isLand: terrain === 'Grassland',
    city: null,
    units: [],
  } as unknown as Tile;
});

populate(mostlyUnseen, 3);

expect(
  'its seeded cities, units and ships are only on squares that have been seen',
  [
    mostlyUnseen.some(
      (tile) => tile.terrain._ !== 'Unknown' && (tile.units ?? []).length > 0
    ),
    mostlyUnseen.filter(
      (tile) =>
        tile.terrain._ === 'Unknown' &&
        (tile.city !== null || (tile.units ?? []).length > 0)
    ).length,
  ],
  [true, 0]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL debugWorld: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS debugWorld (${checks} checks)\n`);
