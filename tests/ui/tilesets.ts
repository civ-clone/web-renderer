// The tileset descriptor (#56, #92). Civ1's says what the renderer already does: its required sprites are the ones the
//  asset store has always asked for (and the store reads them from it), its optional ones the three women specialists,
//  its tile the extractor's default size, and its name templates give the sprite names the map layers ask for. A descriptor the renderer cannot read (another
//  schema, a grid the engine does not know, a size that is not whole pixels, a broken sprite list) is refused.
//
// The map takes its tile size, its scales and its label sizes from the descriptor, and only the tile drawn on screen
//  matters to where everything goes: a 32px tileset at 1× puts every tile where Civ1's 16px tiles at 2× do.

// Must stay first: `AssetStore` opens its database as it loads, and `Window` reads `document.body`.
import './lib/dom';
import './lib/interfaces';
import './lib/grids';

import * as TerrainFeatures from '@civ-clone/civ1-world/TerrainFeatures';
import * as Terrains from '@civ-clone/civ1-world/Terrains';
import * as Units from '@civ-clone/civ1-unit/Units';
import validateDescriptor, {
  TilesetDescriptor,
  expandName,
  notDrawnYet,
  readDescriptor,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import currentTileset, {
  nativeTileSize,
} from '@civ-clone/ui-assets/lib/tilesets';
import GameOptions from '@civ-clone/ui-menus/components/GameOptions';
import Portal from '@civ-clone/ui-map/components/Portal';
import SquareTopology from '@civ-clone/core-world/SquareTopology';
import { Tile } from '@civ-clone/ui-protocol/types';
import World from '@civ-clone/ui-map/components/World';
import projectionFor from '@civ-clone/ui-map/lib/projectionFor';
import {
  AssetStore,
  assetStore,
  shownAtScale,
} from '@civ-clone/ui-assets/AssetStore';
import { setTilesetSizes } from '@civ-clone/ui-game/app/assets';
import i18next from 'i18next';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';
import setOptionDefaults from '@civ-clone/ui-game/app/options';
import civ1Json from '@civ-clone/ui-assets/tilesets/civ1.json';
import extractData from '@civ-clone/civ1-asset-extractor/extract-data.json';
import isoJson from './fixtures/iso-tileset.json';

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

  // The asset store asks for its sprites, where it keeps them.
  const stored = (name: string): string =>
      `${civ1.storage.prefix}${name}${civ1.storage.ext}`,
    { required, optional } = civ1.assets;

  // With nothing imported, every sprite the store needs is missing.
  (assetStore as any).keys = async (): Promise<string[]> => [];

  const storeRequires = await assetStore.missingAssets();

  expect('the store asks for 286 sprites', storeRequires.length, 286);
  expect(
    "the store's sprites are the tileset's, in its order, where it keeps them",
    [assetStore.requiredAssets, storeRequires, assetStore.optionalAssets],
    [required.map(stored), required.map(stored), optional.map(stored)]
  );
  expect(
    'kept where they always have been, so nobody imports again',
    [civ1.storage, required.length, new Set(required).size],
    [{ prefix: './assets/', ext: '.png' }, 286, 286]
  );

  // And a store for another tileset asks for that one's, under its prefix (#56).
  const otherStore = new AssetStore(
    validateDescriptor(
      civ1With({
        id: 'other',
        storage: { prefix: './assets/other/', ext: '.png' },
        assets: {
          required: ['terrain/x', 'terrain/y'],
          optional: ['terrain/z'],
          ui: [],
        },
      })
    )
  );

  (otherStore as any).keys = async (): Promise<string[]> => [
    './assets/terrain/x.png',
    './assets/other/terrain/y.png',
  ];

  expect(
    "a store reads its sprites from the tileset it is for: Civ1's sprite of the same name is not one of them",
    [await otherStore.missingAssets(), otherStore.optionalAssets],
    [['./assets/other/terrain/x.png'], ['./assets/other/terrain/z.png']]
  );
  expect(
    'the optional sprites are the three women specialists, and every icon cut from the optional SP299.PIC (#64)',
    sorted(optional),
    sorted([
      'city/people_tax_f',
      'city/people_science_f',
      'city/people_luxury_f',
      ...Object.entries((extractData as any).files['SP299.PIC']).flatMap(
        ([path, definitions]: [string, any]) =>
          definitions.flatMap((definition: any) =>
            definition.contents.map(({ name }: any) => path + name)
          )
      ),
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
      edgeSprites(families.fog!, edges),
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
      families.fog!.neighbours,
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

  // The layers draw from the descriptor itself, as tests/ui/tilesetDrawing.ts shows: these are Civ1's colour keys,
  //  and which of the player's colours each takes (the city's black takes the second).
  expect(
    "Civ1's colour keys",
    [units.colouring, cities.colouring],
    [
      { mode: 'replaceColours', keys: ['#60E064', '#2C7800'] },
      { mode: 'replaceColours', keys: ['#000'], colours: [1] },
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
    "an anchor or overhang that isn't whole pixels on every side is refused",
    [
      { anchor: {} },
      { anchor: { x: 0, y: '0' } },
      { anchor: { x: 0.5, y: 0 } },
      { overhang: {} },
      { overhang: { top: 0 } },
      { overhang: { top: 0, right: 0, bottom: -1, left: 0 } },
      { overhang: { top: 0, right: 0, bottom: 0, left: 1.5 } },
      {
        anchor: { x: -2, y: 3 },
        overhang: { ...civ1.geometry.overhang, top: 16 },
      },
    ].map((change) =>
      thrown(() =>
        validateDescriptor(
          civ1With({ geometry: { ...civ1.geometry, ...change } })
        )
      )
    ),
    [
      ...Array(3).fill(
        'Tileset "civ1": geometry.anchor must have a whole x and y in px.'
      ),
      ...Array(4).fill(
        'Tileset "civ1": geometry.overhang must have a whole top, right, bottom and left of 0 px or more.'
      ),
      null,
    ]
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
  const namedQuarters = {
    method: 'corners',
    neighbours: 'all',
    sprite: 'terrain/coast/{corner}-{bits}',
    corners: {
      nw: { at: { x: 0, y: 0 }, neighbours: ['w', 'nw', 'n'] },
      ne: { at: { x: 8, y: 0 }, neighbours: ['n', 'ne', 'e'] },
      se: { at: { x: 8, y: 8 }, neighbours: ['e', 'se', 's'] },
      sw: { at: { x: 0, y: 8 }, neighbours: ['s', 'sw', 'w'] },
    },
  };

  expect(
    'a corners coast of named quarter sprites is read, and can be drawn',
    [
      thrown(() => readDescriptor(withCoast(namedQuarters))),
      thrown(() => validateDescriptor(withCoast(namedQuarters))),
    ],
    [null, null]
  );
  const withFamily = (key: string, family: unknown) =>
    civ1With({ families: { ...civ1.families, [key]: family } });

  expect(
    "a coast whose order is not a square tile's eight neighbours, once each, is refused",
    [
      withCoast({ ...civ1.families.coast, order: undefined }),
      withCoast({
        ...civ1.families.coast,
        order: ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 's'],
      }),
      withCoast({
        ...civ1.families.coast,
        order: ['ne', 'e', 'se', 'sw', 'w', 'nw'],
      }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    Array(3).fill(
      `Tileset "civ1": families.coast.order must list each of a square tile's eight neighbours (n, ne, e, se, s, sw, w, nw) once, as a coast strip is cut for them.`
    )
  );
  expect(
    'and a coast in another order is read',
    thrown(() =>
      validateDescriptor(
        withCoast({
          ...civ1.families.coast,
          order: [...civ1.families.coast.order!].reverse(),
        })
      )
    ),
    null
  );
  expect(
    'a map family the map cannot draw is refused',
    [
      civ1With({ families: { ...civ1.families, base: { land: 'x' } } }),
      withFamily('hut', { sprite: '' }),
      withFamily('terrain', { ...civ1.families.terrain, method: 'corners' }),
      withFamily('road', { ...civ1.families.road, method: 'dither' }),
      withFamily('riverMouth', {
        ...civ1.families.riverMouth,
        neighbours: undefined,
      }),
      withFamily('railroad', {
        ...civ1.families.railroad,
        isolated: { dot: '#000', size: 0 },
      }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      'Tileset "civ1": families.base must name the land and ocean sprites.',
      'Tileset "civ1": families.hut.sprite must name a sprite.',
      'Tileset "civ1": families.terrain.method "corners" cannot be drawn yet (#92).',
      'Tileset "civ1": families.road.method "dither" cannot be drawn yet (#92).',
      'Tileset "civ1": families.riverMouth.neighbours must be "edges" or "all".',
      'Tileset "civ1": families.railroad.isolated must be a sprite, or a dot with a colour and a whole size of 1 px or more.',
    ]
  );
  expect(
    'and so is a family whose names or method the map cannot fill or follow, rather than failing on every tile',
    [
      // `{dir}` is for `edges`; a bitmask's directions are `{dirs}`.
      withFamily('terrain', {
        ...civ1.families.terrain,
        sprite: 'terrain/{terrain}_{dir}',
      }),
      withFamily('special', {
        ...civ1.families.special,
        sprite: 'x/{terrain}',
      }),
      withFamily('terrain', {
        ...civ1.families.terrain,
        isolated: 'terrain/{terrain}_{dirs}',
      }),
      withFamily('fog', { sprite: 'map/fog' }),
      withFamily('mine', { ...civ1.families.mine, method: 'edges' }),
      withFamily('road', {
        ...civ1.families.road,
        isolated: { dot: '', size: 2 },
      }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      'Tileset "civ1": families.terrain.sprite has {dir}, but the map fills only {terrain}, {dirs} here.',
      'Tileset "civ1": families.special.sprite has {terrain}, but the map fills only {special} here.',
      'Tileset "civ1": families.terrain.isolated must name a sprite with no placeholders but {terrain}.',
      'Tileset "civ1": families.fog.method must be "bitmask" or "edges": it joins its neighbours.',
      'Tileset "civ1": families.mine is one sprite, drawn whatever its neighbours: it has no method.',
      'Tileset "civ1": families.road.isolated must be a sprite, or a dot with a colour and a whole size of 1 px or more.',
    ]
  );
  expect(
    'and so are words, skips, joins and anchors that are not what the map reads',
    [
      civ1With({ names: { ...civ1.names, terrain: undefined } }),
      civ1With({ names: { ...civ1.names, special: { 'Forest:Game': 1 } } }),
      withFamily('terrain', { ...civ1.families.terrain, skip: 'Ocean' }),
      withFamily('terrain', {
        ...civ1.families.terrain,
        matches: { River: 'River' },
      }),
      withFamily('special', {
        ...civ1.families.special,
        anchors: { Shield: { x: 4 } },
      }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      'Tileset "civ1": names.terrain must map engine names to words in sprite names.',
      'Tileset "civ1": names.special must map engine names to words in sprite names.',
      'Tileset "civ1": families.terrain.skip must list terrain names.',
      'Tileset "civ1": families.terrain.matches must list, for each terrain, what joins it.',
      'Tileset "civ1": families.special.anchors must give a whole x and y in px for each name.',
    ]
  );
  expect(
    'and a join that is not text, or an anchor or overhang left out, saying which (#869)',
    [
      withFamily('road', { ...civ1.families.road, join: 0 }),
      civ1With({ geometry: { ...civ1.geometry, anchor: undefined } }),
      civ1With({ geometry: { ...civ1.geometry, overhang: 0 } }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      'Tileset "civ1": families.road.join must be a string, what goes between the directions in {dirs}.',
      'Tileset "civ1": geometry.anchor must have a whole x and y in px.',
      'Tileset "civ1": geometry.overhang must have a whole top, right, bottom and left of 0 px or more.',
    ]
  );
  expect(
    'a colour is read in any case, as before the schema; a cell that is not whole says the size it must be',
    [
      withCities({ ...civ1.cities, occupied: 'RGB(0, 0, 0)' }),
      withUnits({
        ...civ1.units,
        colouring: { mode: 'replaceColours', keys: ['Rgba(0,0,0,1)', '#ABC'] },
      }),
      withFamily('road', {
        ...civ1.families.road,
        isolated: { dot: '#8C5828', size: 2 },
      }),
      withCities({ ...civ1.cities, occupied: 'rgbx(0, 0, 0)' }),
      withStrip({ cell: 'x' }),
      withStrip({ cell: 16.5 }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      null,
      null,
      null,
      'Tileset "civ1": cities.occupied must be a colour.',
      'Tileset "civ1": families.coast.strip.cell must be two quarters, 16 px, not "x".',
      'Tileset "civ1": families.coast.strip.cell must be two quarters, 16 px, not 16.5.',
    ]
  );
  expect(
    'irrigation may be drawn over the terrain, said with true or false, and nothing else may',
    [
      withFamily('irrigation', {
        ...civ1.families.irrigation,
        overTerrain: true,
      }),
      withFamily('irrigation', {
        ...civ1.families.irrigation,
        overTerrain: 'yes',
      }),
      withFamily('mine', { ...civ1.families.mine, overTerrain: true }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      null,
      'Tileset "civ1": families.irrigation.overTerrain is for irrigation only: true or false.',
      'Tileset "civ1": families.mine.overTerrain is for irrigation only: true or false.',
    ]
  );
  expect(
    'units and cities the map cannot draw are refused',
    [
      withUnits({ ...civ1.units, sprite: 'units/{terrain}' }),
      withUnits({ ...civ1.units, fortified: '' }),
      withUnits({
        ...civ1.units,
        colouring: {
          mode: 'overlay',
          sprite: 'units/shield',
          keys: ['#f00'],
          anchor: 'shield',
        },
      }),
      withUnits({
        ...civ1.units,
        colouring: { mode: 'replaceColours', keys: [] },
      }),
      withUnits({
        ...civ1.units,
        colouring: { mode: 'replaceColours', keys: ['#000'], colours: [0, 1] },
      }),
      withUnits({
        ...civ1.units,
        colouring: { mode: 'replaceColours', keys: ['#000'], colours: [-1] },
      }),
      withUnits({ ...civ1.units, stackOffset: { x: -1, y: 0.5 } }),
      withUnits({
        ...civ1.units,
        status: { ...civ1.units.status, baseline: '0.75' },
      }),
      // Styles cities, at the tile's corner as Civ1's tiles have no room above them.
      withCities({ ...isoJson.cities, anchor: undefined }),
      withCities({ ...civ1.cities, sprite: 'map/{size}' }),
      withCities({ ...civ1.cities, inset: -1 }),
      withCities({ ...civ1.cities, occupied: '' }),
      withCities({
        ...civ1.cities,
        labels: { ...civ1.cities.labels, nameBaseline: undefined },
      }),
      withCities({
        ...civ1.cities,
        labels: { ...civ1.cities.labels, disorderIcon: { x: 5 } },
      }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      'Tileset "civ1": units.sprite has {terrain}, but the map fills only {unit} here.',
      'Tileset "civ1": units.fortified must name a sprite.',
      'Tileset "civ1": units.colouring.mode "overlay" cannot be drawn yet: only replaceColours.',
      'Tileset "civ1": units.colouring.keys must list the colours to replace.',
      'Tileset "civ1": units.colouring.colours must give a player\'s colour, by whole index, for each key.',
      'Tileset "civ1": units.colouring.colours must give a player\'s colour, by whole index, for each key.',
      'Tileset "civ1": units.stackOffset must have a whole x and y in px.',
      'Tileset "civ1": units.status must have an x and a baseline, as parts of the tile.',
      'Tileset "civ1": cities.mode "styles" cannot be drawn yet: only box.',
      'Tileset "civ1": cities.sprite has {size}, but the map fills none here.',
      'Tileset "civ1": cities.inset must be a whole number of px, 0 or more.',
      'Tileset "civ1": cities.occupied must be a colour.',
      'Tileset "civ1": cities.labels must have an x, a sizeBaseline and a nameBaseline, as parts of the tile.',
      'Tileset "civ1": cities.labels.disorderIcon must have a whole x and y in px, within the tile.',
    ]
  );
  expect(
    'and so are colours the recolouring cannot read, and labels outside the tile their region is redrawn in',
    [
      withUnits({
        ...civ1.units,
        colouring: { mode: 'replaceColours', keys: ['black', '#2C7800'] },
      }),
      withCities({ ...civ1.cities, occupied: 'black' }),
      withFamily('road', {
        ...civ1.families.road,
        isolated: { dot: 'brown', size: 2 },
      }),
      withCities({
        ...civ1.cities,
        labels: { ...civ1.cities.labels, x: 1.5 },
      }),
      withCities({
        ...civ1.cities,
        labels: { ...civ1.cities.labels, disorderIcon: { x: 5, y: -1 } },
      }),
      withCities({
        ...civ1.cities,
        labels: { ...civ1.cities.labels, disorderIcon: { x: 16, y: 1 } },
      }),
      // And the formats it does read are read.
      withCities({ ...civ1.cities, occupied: 'rgb(0, 0, 0)' }),
    ].map((json) => thrown(() => validateDescriptor(json))),
    [
      'Tileset "civ1": units.colouring.keys must list the colours to replace.',
      'Tileset "civ1": cities.occupied must be a colour.',
      'Tileset "civ1": families.road.isolated must be a sprite, or a dot with a colour and a whole size of 1 px or more.',
      'Tileset "civ1": cities.labels.x must be within the tile, from 0 to 1.',
      'Tileset "civ1": cities.labels.disorderIcon must have a whole x and y in px, within the tile.',
      'Tileset "civ1": cities.labels.disorderIcon must have a whole x and y in px, within the tile.',
      null,
    ]
  );
  // A pack shaped like Civ2's (#152): a staggered-iso grid of 64 × 32 tiles, a base per terrain with forest, hills,
  //  mountains and river over grassland's, a coast of named quarters, roads over all eight neighbours with an isolated
  //  sprite, no fog, shields over units at each sprite's own anchor with a back-shield for stacks, and cities by style,
  //  size and walls, taller than their tile. Its sprite names are in the Civ2 extractor's style; there are no sprites, and no
  //  Civ2 art or text is in the tests.
  const iso = readDescriptor(isoJson),
    isoWith = (changes: { [key: string]: unknown }): unknown => ({
      ...JSON.parse(JSON.stringify(isoJson)),
      ...changes,
    }),
    isoFamily = (key: string, family: unknown) =>
      isoWith({ families: { ...isoJson.families, [key]: family } }),
    isoCoast = (changes: { [key: string]: unknown }) =>
      isoFamily('coast', { ...isoJson.families.coast, ...changes }),
    isoCorner = (corner: unknown) =>
      isoCoast({ corners: { ...isoJson.families.coast.corners, n: corner } }),
    isoUnits = (changes: { [key: string]: unknown }) =>
      isoWith({ units: { ...isoJson.units, ...changes } }),
    isoColouring = (changes: { [key: string]: unknown }) =>
      isoUnits({ colouring: { ...isoJson.units.colouring, ...changes } }),
    isoCities = (changes: { [key: string]: unknown }) =>
      isoWith({ cities: { ...isoJson.cities, ...changes } }),
    isoStyles = (changes: { [key: string]: unknown }) =>
      isoCities({ styles: { ...isoJson.cities.styles, ...changes } });

  expect(
    "a descriptor shaped like Civ2's is read, with no fog and with Civ1's interface sizes",
    [iso.grid, iso.tile, iso.families.fog, iso.ui],
    [
      'staggered-iso',
      { width: 64, height: 32 },
      undefined,
      { icon: 14, citizen: { width: 16, step: 12 }, cursor: 26 },
    ]
  );
  expect(
    'but cannot be drawn yet, saying the first thing the map cannot draw',
    thrown(() => validateDescriptor(isoJson)),
    'Tileset "iso-test": units.stackOffset must be given: a stack shown by its colouring alone cannot be drawn yet.'
  );

  // Each thing the map cannot draw yet, on Civ1's descriptor, which it can.
  const civ1Read = (changes: { [key: string]: unknown }) =>
    notDrawnYet(readDescriptor(civ1With(changes)));

  expect(
    'what the map cannot draw yet is each named, and Civ1 has none of it; a land sprite per terrain and named coast quarters it can',
    [
      notDrawnYet(civ1),
      civ1Read({
        families: {
          ...civ1.families,
          base: { ...civ1.families.base, land: 'terrain/{terrain}' },
        },
      }),
      civ1Read({ families: { ...civ1.families, coast: namedQuarters } }),
      civ1Read({
        units: { ...civ1.units, colouring: isoJson.units.colouring },
      }),
      civ1Read({ units: { ...isoJson.units, anchor: undefined } }),
      civ1Read({ cities: { ...isoJson.cities, anchor: undefined } }),
      civ1Read({
        cities: { ...civ1.cities, colouring: isoJson.cities.colouring },
      }),
      civ1Read({
        cities: {
          ...civ1.cities,
          labels: { ...civ1.cities.labels, size: 'size' },
        },
      }),
      civ1Read({
        geometry: {
          ...civ1.geometry,
          overhang: { ...civ1.geometry.overhang, top: 4 },
        },
        units: { ...civ1.units, anchor: { x: 0, y: -4 } },
      }),
    ],
    [
      null,
      null,
      null,
      'units.colouring.mode "overlay" cannot be drawn yet: only replaceColours.',
      'units.stackOffset must be given: a stack shown by its colouring alone cannot be drawn yet.',
      'cities.mode "styles" cannot be drawn yet: only box.',
      'cities.colouring.mode "overlay" cannot be drawn yet: only replaceColours.',
      'cities.labels.size cannot be drawn yet: only x and sizeBaseline.',
      "units.anchor cannot be drawn yet: only a sprite at the tile's top-left corner.",
    ]
  );
  expect(
    'a pack with no fog is drawn without fog edges, so Civ1 without its fog can be drawn',
    thrown(() => validateDescriptor(withFamily('fog', undefined))),
    null
  );

  expect(
    "a coast is a strip or named quarters, each quarter's neighbours on the descriptor's own grid, within the tile",
    [
      isoCoast({
        strip: civ1.families.coast.strip,
        order: civ1.families.coast.order,
      }),
      isoCoast({
        strip: civ1.families.coast.strip,
        order: civ1.families.coast.order,
        corners: undefined,
      }),
      isoCoast({ sprite: undefined }),
      isoCoast({ order: ['n'] }),
      isoCoast({ sprite: 'terrain/coast/{corner}' }),
      isoCoast({ sprite: 'terrain/coast/{corner}-{bits}-{dir}' }),
      isoCoast({ corners: {} }),
      isoCorner({ at: { x: 16, y: 0 }, neighbours: ['nw', 'up', 'ne'] }),
      isoCorner({ at: { x: 16, y: 0 }, neighbours: ['nw', 'nw', 'ne'] }),
      isoCorner({ at: { x: 64, y: 0 }, neighbours: ['nw', 'n', 'ne'] }),
      isoCorner({ at: { x: 16, y: 0 }, neighbours: [] }),
      isoCorner({ at: { x: 16.5, y: 0 }, neighbours: ['n'] }),
      // `n` is a neighbour on a staggered-iso grid, and not on a hex one.
      isoWith({ grid: 'hex-odd-r' }),
    ].map((json) => thrown(() => readDescriptor(json))),
    [
      'Tileset "iso-test": families.coast has a strip and named corners: it must have one or the other.',
      'Tileset "iso-test": families.coast has a strip and a quarter sprite: it must have one or the other.',
      'Tileset "iso-test": families.coast must have a strip, or a sprite and the corners it is named for.',
      'Tileset "iso-test": families.coast.order is for a strip: named corners give each quarter\'s own neighbours.',
      'Tileset "iso-test": families.coast.sprite must have {corner} and {bits}, so that each quarter and each mix of its neighbours has a sprite of its own.',
      'Tileset "iso-test": families.coast.sprite has {dir}, but the map fills only {corner}, {bits} here.',
      'Tileset "iso-test": families.coast.corners must name at least one corner.',
      'Tileset "iso-test": families.coast.corners.n.neighbours must list neighbours on the staggered-iso grid (n, ne, e, se, s, sw, w, nw), each once.',
      'Tileset "iso-test": families.coast.corners.n.neighbours must list neighbours on the staggered-iso grid (n, ne, e, se, s, sw, w, nw), each once.',
      'Tileset "iso-test": families.coast.corners.n.at must be within the tile.',
      'Tileset "iso-test": families.coast.corners must give each corner an at, a whole x and y in px, and the neighbours it is picked by.',
      'Tileset "iso-test": families.coast.corners.n.at must have a whole x and y in px.',
      'Tileset "iso-test": families.coast.corners.n.neighbours must list neighbours on the hex-odd-r grid (ne, e, se, sw, w, nw), each once.',
    ]
  );
  expect(
    'a base per terrain has only {terrain}, and only a base per terrain says what is under another terrain',
    [
      isoFamily('base', {
        ...isoJson.families.base,
        land: 'terrain/{terrain}/{dirs}',
      }),
      isoFamily('base', { ...isoJson.families.base, land: 'terrain/land' }),
      isoFamily('base', { ...isoJson.families.base, under: { River: 1 } }),
      isoFamily('base', {
        ...isoJson.families.base,
        under: { Forest: 'Forest' },
      }),
      isoFamily('base', {
        ...isoJson.families.base,
        under: { River: 'Forest', Forest: 'Grassland' },
      }),
      isoFamily('base', {
        land: 'terrain/land',
        ocean: 'terrain/ocean/base-0',
      }),
    ].map((json) => thrown(() => readDescriptor(json))),
    [
      'Tileset "iso-test": families.base.land has {dirs}, but the map fills only {terrain} here.',
      'Tileset "iso-test": families.base.under needs {terrain} in families.base.land: with one land sprite, every terrain is over the same one.',
      'Tileset "iso-test": families.base.under must map engine names to words in sprite names.',
      'Tileset "iso-test": families.base.under.Forest is "Forest", which is drawn over another terrain\'s base itself: name a terrain with a base of its own.',
      'Tileset "iso-test": families.base.under.River is "Forest", which is drawn over another terrain\'s base itself: name a terrain with a base of its own.',
      null,
    ]
  );
  expect(
    'a shield goes on at a point or a named anchor of each sprite, with a back-shield for stacks, and tall sprites have room above',
    [
      isoColouring({ anchor: { x: 12, y: 12 } }),
      isoColouring({ stack: undefined }),
      isoUnits({
        stackOffset: { x: -1, y: -1 },
        colouring: { ...isoJson.units.colouring, stack: undefined },
      }),
      isoColouring({ anchor: undefined }),
      isoColouring({ anchor: { x: 12 } }),
      isoColouring({ anchor: '' }),
      isoColouring({ sprite: 'units/{unit}-shield' }),
      isoColouring({ stack: { sprite: 'units/shield-back' } }),
      isoColouring({ colours: [0, 1] }),
      isoColouring({ mode: 'shield' }),
      isoUnits({
        colouring: { mode: 'replaceColours', keys: ['#f00'], anchor: 'shield' },
      }),
      isoUnits({ anchor: { x: 0, y: -32 } }),
      isoUnits({ anchor: { x: -1, y: 0 } }),
    ].map((json) => thrown(() => readDescriptor(json))),
    [
      null,
      'Tileset "iso-test": units must show a stack: a stackOffset for a copy of the unit, or an overlay colouring\'s stack.',
      null,
      'Tileset "iso-test": units.colouring must name the sprite an overlay draws, and its anchor.',
      'Tileset "iso-test": units.colouring.anchor must have a whole x and y in px, or name an anchor each sprite has.',
      'Tileset "iso-test": units.colouring.anchor must have a whole x and y in px, or name an anchor each sprite has.',
      'Tileset "iso-test": units.colouring.sprite has {unit}, but the map fills none here.',
      'Tileset "iso-test": units.colouring.stack.offset must have a whole x and y in px.',
      'Tileset "iso-test": units.colouring.colours must give a player\'s colour, by whole index, for each key.',
      'Tileset "iso-test": units.colouring.mode must be "replaceColours" or "overlay", not "shield".',
      'Tileset "iso-test": units.colouring.anchor is for an overlay: replaceColours recolours the sprite itself.',
      'Tileset "iso-test": units.anchor reaches 32 px above the tile and 0 px left of it, but geometry.overhang leaves room for 16 above and 0 left.',
      'Tileset "iso-test": units.anchor reaches 0 px above the tile and 1 px left of it, but geometry.overhang leaves room for 16 above and 0 left.',
    ]
  );
  expect(
    "a styles city has a style per civilization, size buckets and walls, and a flag over it, and not a box city's fields",
    [
      isoCities({ mode: 'tiles' }),
      isoCities({ colouring: undefined }),
      isoCities({
        colouring: { ...isoJson.cities.colouring, anchor: { x: 50, y: 21 } },
      }),
      isoCities({ styles: undefined }),
      isoCities({ inset: 1 }),
      isoCities({ colouring: civ1.cities.colouring }),
      isoCities({
        colouring: {
          ...isoJson.cities.colouring,
          stack: isoJson.units.colouring.stack,
        },
      }),
      isoCities({ sprite: 'city/{style}/{unit}' }),
      isoCities({ sprite: 'city/{walls}{size}' }),
      isoCities({ sprite: 'city/{style}/{walls}' }),
      isoCities({ sprite: 'city/{style}/{size}' }),
      // A placeholder that tells no two sprites apart may be left out.
      isoWith({
        cities: {
          ...isoJson.cities,
          sprite: 'city/{size}',
          styles: {
            ...isoJson.cities.styles,
            names: ['ancient'],
            civilizations: {},
            walls: { plain: '', walled: '' },
          },
        },
      }),
      isoStyles({ names: ['ancient', 'ancient'] }),
      isoStyles({ default: 'modern' }),
      isoStyles({ civilizations: { English: 'modern' } }),
      isoStyles({ sizes: [1, 8, 4] }),
      isoStyles({ sizes: [0, 4] }),
      isoStyles({ walls: { plain: '' } }),
      isoWith({ cities: { ...civ1.cities, styles: isoJson.cities.styles } }),
      isoWith({ cities: { ...civ1.cities, inset: undefined } }),
    ].map((json) => thrown(() => readDescriptor(json))),
    [
      'Tileset "iso-test": cities.mode must be "box" or "styles", not "tiles".',
      'Tileset "iso-test": cities.colouring must say how player colours go on.',
      null,
      'Tileset "iso-test": cities.styles must say which sprite each civilization, size and walls have.',
      'Tileset "iso-test": cities.inset is for box cities: a styles city shows its player by its flag.',
      'Tileset "iso-test": cities.colouring must be an overlay for styles cities: the flag, drawn over the city in its player\'s colours.',
      'Tileset "iso-test": cities.colouring.stack is for units: a city is never one of a stack.',
      'Tileset "iso-test": cities.sprite has {unit}, but the map fills only {style}, {size}, {walls} here.',
      'Tileset "iso-test": cities.sprite must have {style}, as there is more than one style.',
      'Tileset "iso-test": cities.sprite must have {size}, as there is more than one size bucket.',
      'Tileset "iso-test": cities.sprite must have {walls}, as walled cities have a word of their own.',
      null,
      'Tileset "iso-test": cities.styles.names must list each style once.',
      'Tileset "iso-test": cities.styles.default "modern" is not one of cities.styles.names.',
      'Tileset "iso-test": cities.styles.civilizations.English "modern" is not one of cities.styles.names.',
      'Tileset "iso-test": cities.styles.sizes must list the size each bucket starts at, smallest first, each once.',
      'Tileset "iso-test": cities.styles must list its style names, a default, a style by civilization, the sizes each bucket starts at, and the plain and walled words.',
      'Tileset "iso-test": cities.styles must list its style names, a default, a style by civilization, the sizes each bucket starts at, and the plain and walled words.',
      'Tileset "iso-test": cities.styles is for styles cities: a box city has one sprite, in its player\'s colour.',
      'Tileset "iso-test": cities.inset must be a whole number of px, 0 or more.',
    ]
  );
  expect(
    'a fallback is another tileset, and special resources may be named by whole words with a slash',
    [
      thrown(() => readDescriptor(isoWith({ fallback: 'iso-test' }))),
      expandName(iso.families.special.sprite, {
        special: iso.names.special['Arctic:Seal']!,
      }),
    ],
    [
      'Tileset "iso-test": fallback names the tileset itself: another tileset\'s id, or null.',
      'terrain/glacier/ivory',
    ]
  );

  expect(
    'a placeholder only takes a value it was given',
    thrown(() => expandName('{constructor}', {})),
    'No value for {constructor} in "{constructor}".'
  );

  // The tileset the map is drawn with.
  const tileset = currentTileset();

  expect(
    "the map is drawn with Civ1's tileset, 16px tiles, at 2× to start",
    [tileset.id, nativeTileSize(tileset), tileset.defaultScale],
    ['civ1', { width: 16, height: 16 }, 2]
  );
  // A tile's size is across and down (#97), and its grid says whether it can be drawn: a square grid's are square.
  const tall = validateDescriptor(
    civ1With({ id: 'tall', tile: { width: 16, height: 24 } })
  );

  expect(
    'a tileset whose tiles are not square gives its tile across and down',
    nativeTileSize(tall),
    { width: 16, height: 24 }
  );
  expect(
    'and a square grid still refuses to draw it',
    thrown(() =>
      projectionFor(
        tall,
        new World({ width: 5, height: 3, tiles: [] } as any),
        { width: 32, height: 48 }
      )
    ),
    'Tileset "tall": a square grid\'s tiles are as far apart as they are wide and tall, and no row is shifted, not 16 × 24 tiles 16 × 16 apart with odd rows 0 across.'
  );

  setOptionDefaults();

  expect(
    "the map scale a player starts on is the tileset's",
    options.get('mapScale'),
    tileset.defaultScale
  );

  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('./lib/strings');

  const optionsWindow = new GameOptions({
    lockVerticalEdges: () => false,
    scale: () => 2,
  } as any);

  expect(
    "the Options window offers the tileset's scales, 2× chosen",
    // The scale's own list: the window has others, such as how often to autosave (#653).
    Array.from(optionsWindow.element().querySelectorAll('option'))
      .filter((option) => option.textContent?.endsWith('×'))
      .map(
        (option) =>
          `${option.textContent}${option.hasAttribute('selected') ? '*' : ''}`
      ),
    ['1×', '2×*', '3×', '4×']
  );

  optionsWindow.close();

  // Where things go on the map depends on the tile drawn on screen, not on how it got that big.
  const stub32 = validateDescriptor(
      civ1With({
        id: 'stub-32',
        name: 'A 32px tileset',
        tile: { width: 32, height: 32 },
        geometry: { ...civ1.geometry, columnStep: 32, rowStep: 32 },
      })
    ),
    // A canvas the portal can draw nothing on.
    blankCanvas = (width: number, height: number) =>
      ({
        width,
        height,
        getContext: () =>
          new Proxy({}, { get: () => () => undefined, set: () => true }),
      } as unknown as HTMLCanvasElement);

  class GeometryPortal extends Portal {
    clamped(y: number, offset: number): [number, number] {
      const [center, settled] = this.clampedCenter(
        { x: 0, y },
        { x: 0, y: offset }
      );

      return [center.y, settled.y];
    }
  }

  // Everything the portal works out about where tiles are, as plain values.
  const geometry = (
    portal: GeometryPortal,
    world: World,
    canvas: HTMLCanvasElement
  ) => {
    const tileName = (tile: Tile | null) =>
        tile === null ? '-' : `${tile.x},${tile.y}`,
      samples: [number, number][] = [
        [0, 0],
        [world.width() - 1, 0],
        [0, world.height() - 1],
        [world.width() - 1, world.height() - 1],
        [Math.floor(world.width() / 2), Math.floor(world.height() / 2)],
      ],
      tileAt: string[] = [];

    for (let y = -3; y < canvas.height + 3; y += 5) {
      for (let x = -3; x < canvas.width + 3; x += 5) {
        tileAt.push(tileName(portal.tileAt(x, y)));
      }
    }

    return {
      tileSize: portal.tileSize(),
      footprint: portal.projection().footprint(),
      worldSize: portal.projection().worldSize(),
      center: { ...portal.center() },
      visibleRange: portal.visibleRange(),
      rawVisibleRange: portal.rawVisibleRange(),
      visibleBounds: portal.visibleBounds(),
      isVisible: [0, 1, 3].map((margin) =>
        samples.map(([x, y]) => portal.isVisible(x, y, margin))
      ),
      pixels: samples.map(([x, y]) => portal.projection().tileToPixel(x, y)),
      clamping: [-2, 0, 1, Math.floor(world.height() / 2), world.height() + 1]
        .map((y) =>
          [-20, -7, 0, 9, 25].map((offset) => portal.clamped(y, offset))
        )
        .join(' | '),
      tileAt: tileAt.join(' '),
    };
  };

  // The same moves made on a portal built from `tileset` at `scale`, recorded after each.
  const record = (
    tileset: typeof civ1,
    scale: number,
    [width, height]: [number, number],
    [canvasWidth, canvasHeight]: [number, number],
    lockVerticalEdges: boolean
  ) => {
    const tiles: Tile[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        tiles.push({ x, y, units: [] } as unknown as Tile);
      }
    }

    const world = new World({ width, height, tiles } as any),
      canvas = blankCanvas(canvasWidth, canvasHeight),
      portal = new GeometryPortal(world, {} as any, canvas, {
        lockVerticalEdges,
        playerId: null,
        scale,
        tileSize: nativeTileSize(tileset),
      }),
      steps: unknown[] = [geometry(portal, world, canvas)];

    (
      [
        [0, 0],
        [width - 1, height - 1],
        [Math.floor(width / 2), 1],
        [3, height - 2],
      ] as [number, number][]
    ).forEach(([x, y]) => {
      portal.setCenter(x, y);
      steps.push(geometry(portal, world, canvas));
    });

    (
      [
        [5, 0],
        [0, -3],
        [19, -3],
        [-40, 25],
        [7.5, 7.5],
        [-1000, 333],
      ] as [number, number][]
    ).forEach(([dx, dy]) => {
      portal.scrollBy(dx, dy);
      steps.push(geometry(portal, world, canvas));
    });

    // Twice the scale is twice the tile either way.
    portal.setScale(scale * 2);
    steps.push(geometry(portal, world, canvas));

    portal.setLockVerticalEdges(!lockVerticalEdges);
    steps.push(geometry(portal, world, canvas));

    return steps;
  };

  const worlds: [number, number][] = [
      [1, 1],
      [5, 3],
      [13, 9],
      [40, 25],
      [80, 50],
    ],
    canvases: [number, number][] = [
      [0, 0],
      [33, 17],
      [100, 60],
      [641, 401],
    ],
    differences: string[] = [];
  let compared = 0;

  worlds.forEach((world) =>
    canvases.forEach((canvas) =>
      [false, true].forEach((lock) => {
        const civ1AtTwo = record(civ1, 2, world, canvas, lock),
          stubAtOne = record(stub32, 1, world, canvas, lock);

        compared += civ1AtTwo.length;

        if (JSON.stringify(civ1AtTwo) !== JSON.stringify(stubAtOne)) {
          differences.push(
            `${world.join('x')} canvas ${canvas.join('x')} ${
              lock ? 'locked' : 'wrapped'
            }`
          );
        }
      })
    )
  );

  expect(
    'a 32px tileset at 1× puts every tile where Civ1 at 2× does: 40 portals, 13 steps each',
    [compared, differences],
    [520, []]
  );
  expect(
    'and both draw 32px tiles',
    [
      record(civ1, 2, [5, 3], [100, 60], false)[0],
      record(stub32, 1, [5, 3], [100, 60], false)[0],
    ].map((step: any) => [step.tileSize, step.footprint]),
    [
      [
        { width: 32, height: 32 },
        { width: 32, height: 32 },
      ],
      [
        { width: 32, height: 32 },
        { width: 32, height: 32 },
      ],
    ]
  );
  expect(
    'while the 32px tileset at 2× draws 64px tiles, so the comparison can fail',
    (record(stub32, 2, [5, 3], [100, 60], false)[0] as any).tileSize,
    { width: 64, height: 64 }
  );
  expect(
    "a portal not told its tile size or scale takes the tileset's: Civ1's 16px at 2×",
    [
      new Portal(
        new World({ width: 5, height: 3, tiles: [] } as any),
        {} as any,
        blankCanvas(100, 60)
      ),
    ].map((portal) => [portal.scale(), portal.tileSize()]),
    [[2, { width: 32, height: 32 }]]
  );
  expect(
    "a portal on the square grid told a tile wider than it is tall is refused, as the square grid's steps would disagree with the layers'",
    (() => {
      try {
        new Portal(
          new World({ width: 5, height: 3, tiles: [] } as any),
          {} as any,
          blankCanvas(100, 60),
          { playerId: null, scale: 2, tileSize: { width: 32, height: 16 } }
        );

        return null;
      } catch (error) {
        return (error as Error).message;
      }
    })(),
    `Tileset "civ1": a square grid's tiles are drawn as tall as they are wide, not 64 × 32.`
  );

  // The sizes the interface shows the tileset's sprites at outside the map (#729).
  expect(
    "Civ1's descriptor gives today's sizes: 14px icons, 16px citizens 12px apart, a 26px cursor",
    civ1.ui,
    { icon: 14, citizen: { width: 16, step: 12 }, cursor: 26 }
  );

  const withoutUi = JSON.parse(JSON.stringify(civ1Json));

  delete withoutUi.ui;

  expect(
    "a descriptor without ui is shown at Civ1's sizes",
    validateDescriptor(withoutUi).ui,
    civ1.ui
  );
  expect(
    'and gets its own copy of them, not one every such tileset shares',
    validateDescriptor(withoutUi).ui !== validateDescriptor(withoutUi).ui &&
      validateDescriptor(withoutUi).ui.citizen !==
        validateDescriptor(withoutUi).ui.citizen,
    true
  );
  expect(
    "one that gives only some of them gets Civ1's for the rest",
    validateDescriptor(civ1With({ ui: { icon: 32, citizen: { step: 20 } } }))
      .ui,
    { icon: 32, citizen: { width: 16, step: 20 }, cursor: 26 }
  );
  expect(
    'a size that is not a whole number of px, 1 or more, is refused, saying which',
    [
      { icon: 0 },
      { icon: -14 },
      { icon: 14.5 },
      { icon: '14' },
      { citizen: { width: null } },
      { cursor: 0 },
    ].map((ui) => thrown(() => validateDescriptor(civ1With({ ui })))),
    [
      'Tileset "civ1": ui.icon must be a whole number of px, 1 or more.',
      'Tileset "civ1": ui.icon must be a whole number of px, 1 or more.',
      'Tileset "civ1": ui.icon must be a whole number of px, 1 or more.',
      'Tileset "civ1": ui.icon must be a whole number of px, 1 or more.',
      'Tileset "civ1": ui.citizen.width must be a whole number of px, 1 or more.',
      'Tileset "civ1": ui.cursor must be a whole number of px, 1 or more.',
    ]
  );
  expect(
    'so is a ui, or a citizen, that is not an object',
    [{ ui: 14 }, { ui: { citizen: 16 } }].map(
      (changes) => thrown(() => validateDescriptor(civ1With(changes))) !== null
    ),
    [true, true]
  );

  setTilesetSizes(
    validateDescriptor(
      civ1With({ ui: { icon: 32, citizen: { width: 24, step: 18 } } })
    )
  );

  expect(
    "the tileset's sizes are set on :root for the stylesheets",
    ['--tileset-icon', '--tileset-citizen-width', '--tileset-citizen-step'].map(
      (property) => document.documentElement.style.getPropertyValue(property)
    ),
    ['32px', '24px', '18px']
  );
  expect(
    "a sprite is enlarged the whole number of times that reaches the size it's shown at, never less than once",
    [
      // Civ1's 7px icons, 8px citizens and 13px torch, doubled as before.
      [7, 14],
      [8, 16],
      [13, 26],
      // Already that size, or larger: CSS shows it at the size.
      [14, 14],
      [32, 14],
      // Civ1's 16px pollution among its 14px icons.
      [16, 14],
      [5, 14],
      // Not loaded.
      [0, 14],
    ].map(([spriteWidth, width]) => shownAtScale(spriteWidth, width)),
    [2, 2, 2, 1, 1, 1, 3, 1]
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
