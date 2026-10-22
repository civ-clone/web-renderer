// The tileset descriptor (#56, #92). Civ1's says what the renderer already does: its required sprites are the ones the
//  asset store asks for today, its optional ones the three women specialists, its tile the extractor's default size,
//  and its name templates give the sprite names the map layers ask for. A descriptor the renderer cannot read (another
//  schema, a grid the engine does not know, a size that is not whole pixels, a broken sprite list) is refused.

// Must stay first: `AssetStore` opens its database as it loads.
import './lib/dom';

import * as fs from 'fs';
import * as path from 'path';
import * as TerrainFeatures from '@civ-clone/civ1-world/TerrainFeatures';
import * as Terrains from '@civ-clone/civ1-world/Terrains';
import * as Units from '@civ-clone/civ1-unit/Units';
import validateDescriptor, {
  TilesetDescriptor,
  expandName,
} from '../../src/js/UI/tilesets/TilesetDescriptor';
import SquareTopology from '@civ-clone/core-world/SquareTopology';
import { assetStore } from '../../src/js/UI/AssetStore';
import civ1Json from '../../src/js/UI/tilesets/civ1.json';
import extractData from '@civ-clone/civ1-asset-extractor/extract-data.json';

const failures: string[] = [];
let checks = 0,
  finished = false;

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

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL tilesets: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// The message `fn` throws, or `null` when it does not.
const thrown = (fn: () => unknown): string | null => {
  try {
    fn();

    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

const sorted = (names: Iterable<string>): string[] => [...names].sort();

// Civ1's descriptor with `changes` made to a copy of it.
const civ1With = (changes: { [key: string]: unknown }): unknown => ({
  ...JSON.parse(JSON.stringify(civ1Json)),
  ...changes,
});

(async () => {
  // It is a descriptor.
  const civ1: TilesetDescriptor = validateDescriptor(civ1Json);

  expect(
    "Civ1's descriptor is read: schema 1, a square grid",
    [civ1.schema, civ1.kind, civ1.id, civ1.grid],
    [1, 'tileset', 'civ1', 'square']
  );

  // The tile is the extractor's default sprite size.
  const { width, height } = (extractData as any).defaults;

  expect("its tile is the extractor's default size, 16 × 16", civ1.tile, {
    width,
    height,
  });
  expect(
    'and a square tile steps a whole tile each way',
    [civ1.geometry.columnStep, civ1.geometry.rowStep],
    [width, height]
  );
  expect(
    'the scales are the four the Options window has always offered, 2× to start',
    [civ1.scales, civ1.defaultScale],
    [[1, 2, 3, 4], 2]
  );

  // Its sprites are the asset store's.
  const stored = (name: string): string =>
      `${civ1.storage.prefix}${name}${civ1.storage.ext}`,
    { required, optional } = civ1.assets;

  // With nothing imported, every sprite the store needs is missing.
  (assetStore as any).keys = async (): Promise<string[]> => [];

  const storeRequires = await assetStore.missingAssets();

  expect('the store asks for 286 sprites', storeRequires.length, 286);
  expect(
    "the required sprites are the store's, where it keeps them",
    sorted(required.map(stored)),
    sorted(storeRequires)
  );
  expect(
    'kept where they always have been, so nobody imports again',
    [civ1.storage, required.length, new Set(required).size],
    [{ prefix: './assets/', ext: '.png' }, 286, 286]
  );
  expect(
    'the optional sprites are the three women specialists',
    sorted(optional),
    sorted([
      'city/people_tax_f',
      'city/people_science_f',
      'city/people_luxury_f',
    ])
  );

  // And the extractor makes every one of them, and nothing else.
  const extracted: string[] = [];

  Object.values((extractData as any).files).forEach((definitions: any) =>
    Object.entries(definitions).forEach(([assetPath, rows]: [string, any]) =>
      rows.forEach((row: any) =>
        row.contents.forEach((sprite: any) =>
          extracted.push(`${assetPath}${sprite.name}`)
        )
      )
    )
  );

  expect(
    'the extractor makes every required and optional sprite, and no other',
    sorted([...required, ...optional]),
    sorted(extracted)
  );

  // The name templates give the sprites the layers draw.
  const has = new Set(required),
    lower = (name: string) => name.toLowerCase(),
    edges = new SquareTopology(3, 3).edgeDirections() as string[],
    all = new SquareTopology(3, 3).directions() as string[],
    { families, names, units, cities } = civ1,
    // Every combination of `directions`, in order, as a terrain join names them.
    combinations = (directions: string[]): string[][] =>
      new Array(1 << directions.length)
        .fill(null)
        .map((_, mask) =>
          directions.filter((direction, bit) => mask & (1 << bit))
        ),
    missing = (expanded: string[]): string[] =>
      expanded.filter((name) => !has.has(name));

  const terrainSprites = Object.keys(Terrains)
    .filter((terrain) => !families.terrain.skip!.includes(terrain))
    .flatMap((terrain) =>
      combinations(edges).map((directions) =>
        directions.length === 0
          ? expandName(families.terrain.isolated as string, {
              terrain: names.terrain[terrain] ?? lower(terrain),
            })
          : expandName(families.terrain.sprite, {
              terrain: names.terrain[terrain] ?? lower(terrain),
              dirs: directions.join(families.terrain.join!),
            })
      )
    );

  expect(
    'every land terrain joins its neighbours on each edge every way: 11 × 16 sprites',
    [terrainSprites.length, new Set(terrainSprites).size],
    [176, 176]
  );
  expect('and each is a required sprite', missing(terrainSprites), []);
  expect(
    'a join is named for its edges in the order the topology gives them',
    [
      edges,
      expandName(families.terrain.sprite, {
        terrain: 'hills',
        dirs: ['n', 'e', 's'].join(families.terrain.join!),
      }),
    ],
    [['n', 'e', 's', 'w'], 'terrain/hills_nes']
  );

  const edgeSprites = (family: { sprite: string }, directions: string[]) =>
    directions.map((dir) => expandName(family.sprite, { dir }));

  expect(
    'a river mouth and fog for each edge, a road and a railroad for every neighbour',
    [
      edgeSprites(families.riverMouth, edges),
      edgeSprites(families.fog, edges),
      edgeSprites(families.road, all),
      edgeSprites(families.railroad, all),
    ].map((sprites) => [sprites.length, missing(sprites)]),
    [
      [4, []],
      [4, []],
      [8, []],
      [8, []],
    ]
  );
  expect(
    'the neighbours each family looks at',
    [
      families.terrain.neighbours,
      families.coast.neighbours,
      families.riverMouth.neighbours,
      families.fog.neighbours,
      families.road.neighbours,
      families.railroad.neighbours,
    ],
    ['edges', 'all', 'edges', 'edges', 'all', 'all']
  );

  const specialSprites = Object.keys(TerrainFeatures).map((special) =>
    expandName(families.special.sprite, {
      special: names.special[special] ?? lower(special),
    })
  );

  expect(
    'every special has a sprite, and Game on Forest is a doe',
    [
      specialSprites.length,
      missing(specialSprites),
      expandName(families.special.sprite, {
        special: names.special['Forest:Game'],
      }),
      has.has('terrain/doe'),
    ],
    [10, [], 'terrain/doe', true]
  );

  const unitSprites = Object.keys(Units).map((unit) =>
    expandName(units.sprite, { unit: names.unit[unit] ?? lower(unit) })
  );

  expect(
    'every Civ1 unit has a sprite',
    [unitSprites.length, missing(unitSprites)],
    [28, []]
  );

  const fixedSprites = [
    families.base.land,
    families.base.ocean,
    families.coast.strip!.sprite,
    families.irrigation.sprite,
    families.mine.sprite,
    families.pollution.sprite,
    families.hut.sprite,
    units.fortified,
    cities.sprite,
  ];

  expect(
    'and the sprites drawn as they are',
    [missing(fixedSprites), fixedSprites],
    [
      [],
      [
        'terrain/land',
        'terrain/ocean',
        'terrain/coast_sprite',
        'improvements/irrigation',
        'improvements/mine',
        'improvements/pollution',
        'map/hut',
        'map/fortify',
        'map/city',
      ],
    ]
  );

  // The layers still ask for the sprites by the names these templates give: each template, with its placeholders as
  //  `${…}`, is in the layer's code.
  const source = (file: string): string =>
      fs.readFileSync(
        path.join(process.cwd(), 'src', 'js', 'UI', ...file.split('/')),
        'utf8'
      ),
    asCode = (template: string): RegExp =>
      new RegExp(
        template
          .split(/\{[a-z]+\}/i)
          .map((part) => part.replace(/[.*+?^$()|[\]\\]/g, '\\$&'))
          .join('\\$\\{[^}]+\\}')
      ),
    landscape = source('components/Map/Landscape.ts'),
    fog = source('components/Map/Fog.ts'),
    renderUnit = source('lib/renderUnit.ts');

  expect(
    "the layers' code builds the names the templates give",
    [
      asCode(families.terrain.sprite).test(landscape),
      asCode(families.terrain.isolated as string).test(landscape),
      asCode(families.riverMouth.sprite).test(landscape),
      asCode(families.road.sprite).test(landscape),
      asCode(families.railroad.sprite).test(landscape),
      asCode(families.fog.sprite).test(fog),
      asCode(units.sprite).test(renderUnit),
      // And a template the code does not use is not found.
      asCode('terrain/{terrain}-{dirs}').test(landscape),
    ],
    [true, true, true, true, true, true, true, false]
  );
  expect(
    'and the colour keys are the ones the code swaps',
    [
      units.colouring,
      renderUnit.includes(
        `[${(units.colouring as { keys: string[] }).keys
          .map((key) => `'${key}'`)
          .join(', ')}]`
      ),
      cities.colouring,
    ],
    [
      { mode: 'replaceColours', keys: ['#60E064', '#2C7800'] },
      true,
      { mode: 'replaceColours', keys: ['#000'] },
    ]
  );

  // Names.
  expect(
    'a placeholder is filled wherever it is',
    expandName('{a}/{b}_{a}', { a: 'x', b: 'y' }),
    'x/y_x'
  );
  expect(
    'a placeholder with no value is refused rather than drawn as a hole',
    thrown(() => expandName('terrain/{terrain}_{dirs}', { terrain: 'hills' })),
    'No value for {dirs} in "terrain/{terrain}_{dirs}".'
  );

  // What is refused.
  expect(
    'another schema is refused, saying which one this reads',
    thrown(() => validateDescriptor(civ1With({ schema: 2 }))),
    'Tileset "civ1": schema 2 cannot be read here, only schema 1. A newer civ.one may read it.'
  );
  expect(
    'a schema that is not the number 1 is refused, and so is none',
    [
      thrown(() => validateDescriptor(civ1With({ schema: '1' }))) !== null,
      thrown(() => validateDescriptor(civ1With({ schema: 1.0 }))),
      thrown(() => validateDescriptor(civ1With({ schema: undefined }))) !==
        null,
    ],
    [true, null, true]
  );
  expect(
    "a grid is the engine's name for it, never iso or hex",
    ['iso', 'hex', 'triangles', undefined].map((grid) =>
      thrown(() => validateDescriptor(civ1With({ grid })))
    ),
    ['"iso"', '"hex"', '"triangles"', 'undefined'].map(
      (grid) =>
        `Tileset "civ1": grid ${grid} is not one of square, staggered-iso, hex-odd-r.`
    )
  );
  expect(
    'every grid the engine has is accepted',
    ['square', 'staggered-iso', 'hex-odd-r'].map(
      (grid) => validateDescriptor(civ1With({ grid })).grid
    ),
    ['square', 'staggered-iso', 'hex-odd-r']
  );
  expect(
    'a tile that is not whole pixels is refused',
    [
      { width: 0, height: 16 },
      { width: 16, height: 15.5 },
      { width: '16', height: 16 },
      { width: 16 },
      null,
    ].map(
      (tile) => thrown(() => validateDescriptor(civ1With({ tile }))) !== null
    ),
    [true, true, true, true, true]
  );
  expect(
    'a scale it cannot be shown at is refused',
    [
      civ1With({ scales: [] }),
      civ1With({ scales: [1, 0.5] }),
      civ1With({ defaultScale: 5 }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      'Tileset "civ1": scales must list at least one whole scale of 1 or more.',
      'Tileset "civ1": scales must list at least one whole scale of 1 or more.',
      'Tileset "civ1": defaultScale 5 is not in scales.',
    ]
  );
  expect(
    'a sprite list that is missing, empty or names a sprite twice is refused',
    [
      civ1With({ assets: { ...civ1.assets, required: undefined } }),
      civ1With({ assets: { ...civ1.assets, required: [] } }),
      civ1With({
        assets: { ...civ1.assets, optional: ['city/bulb'] },
      }),
      civ1With({ assets: { ...civ1.assets, required: ['', 'city/bulb'] } }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      'Tileset "civ1": assets must list its required, optional and ui sprites.',
      'Tileset "civ1": assets.required must list at least one sprite.',
      'Tileset "civ1": assets lists "city/bulb" more than once.',
      'Tileset "civ1": assets lists an empty sprite name.',
    ]
  );
  expect(
    'and so is something that is not a tileset at all',
    [
      thrown(() => validateDescriptor(null)),
      thrown(() => validateDescriptor([])),
      thrown(() => validateDescriptor(civ1With({ kind: 'theme' }))),
      thrown(() => validateDescriptor(civ1With({ id: '' }))),
      thrown(() => validateDescriptor(civ1With({ units: undefined }))),
    ],
    [
      'A tileset descriptor must be an object.',
      'A tileset descriptor must be an object.',
      'Tileset "civ1": kind must be "tileset", not "theme".',
      'Tileset descriptor: id must be a non-empty string.',
      'Tileset "civ1": units must be an object.',
    ]
  );

  // What the map reads as it draws.
  const withUnits = (units: unknown) => civ1With({ units }),
    withCities = (cities: unknown) => civ1With({ cities }),
    withCoast = (coast: unknown) =>
      civ1With({ families: { ...civ1.families, coast } }),
    withStrip = (changes: { [key: string]: unknown }) =>
      withCoast({
        ...civ1.families.coast,
        strip: { ...civ1.families.coast.strip, ...changes },
      });

  expect(
    'a unit status or city label size that is not whole pixels is refused',
    [
      withUnits({ ...civ1.units, status: undefined }),
      withUnits({
        ...civ1.units,
        status: { ...civ1.units.status, fontSize: 0 },
      }),
      withUnits({
        ...civ1.units,
        status: { ...civ1.units.status, fontSize: 7.5 },
      }),
      withCities({ ...civ1.cities, labels: undefined }),
      withCities({
        ...civ1.cities,
        labels: { ...civ1.cities.labels, fontSize: '8' },
      }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      'Tileset "civ1": units.status.fontSize must be a whole number of px, 1 or more.',
      'Tileset "civ1": units.status.fontSize must be a whole number of px, 1 or more.',
      'Tileset "civ1": units.status.fontSize must be a whole number of px, 1 or more.',
      'Tileset "civ1": cities.labels.fontSize must be a whole number of px, 1 or more.',
      'Tileset "civ1": cities.labels.fontSize must be a whole number of px, 1 or more.',
    ]
  );
  expect(
    'a coast that cannot be cut from its strip is refused',
    [
      withCoast(undefined),
      withCoast({ ...civ1.families.coast, method: 'bitmask' }),
      withStrip({ sprite: '' }),
      withStrip({ quarter: 0 }),
      withStrip({ quarter: 8.5 }),
      withStrip({ cell: 17 }),
      withStrip({ cell: undefined }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      'Tileset "civ1": families.coast must be a corners family.',
      'Tileset "civ1": families.coast must be a corners family.',
      'Tileset "civ1": families.coast.strip.sprite must name a sprite.',
      'Tileset "civ1": families.coast.strip.quarter must be a whole number of px, 1 or more.',
      'Tileset "civ1": families.coast.strip.quarter must be a whole number of px, 1 or more.',
      'Tileset "civ1": families.coast.strip.cell must be two quarters, 16 px, not 17.',
      'Tileset "civ1": families.coast.strip.cell must be two quarters, 16 px, not undefined.',
    ]
  );
  expect(
    'and so is a corners coast of named quarter sprites, which cannot be drawn yet',
    thrown(() =>
      validateDescriptor(
        withCoast({
          method: 'corners',
          neighbours: 'all',
          sprite: 'terrain/coast/{corner}-{bits}',
          corners: ['n', 'e', 's', 'w'],
        })
      )
    ),
    'Tileset "civ1": families.coast must have a strip: only a coast cut from one strip can be drawn yet.'
  );
  expect(
    'a placeholder only takes a value it was given',
    thrown(() => expandName('{constructor}', {})),
    'No value for {constructor} in "{constructor}".'
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL tilesets (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS tilesets (${checks} checks)\n`);
  process.exit(0);
})().catch((error) => {
  process.stderr.write(`FAIL tilesets: ${error.stack ?? error}\n`);
  process.exit(1);
});
