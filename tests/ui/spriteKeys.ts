// The map finds each sprite by its whole key (#56): `./assets/terrain/land.png` for Civ1's `terrain/land`. It used to
//  take any preloaded image whose key ended in `terrain/land.png`, which would have found another pack's sprite of the
//  same name once a second pack is kept under a prefix of its own (`./assets/<id>/`).
//
// Every sprite the map asks for is found as it was before: the same image, or the same miss. The names come from the
//  render-geometry run (what its layers asked for, and what it preloaded), from the tileset's name templates over every
//  Civ1 terrain, special and unit, from the sprites drawn by name in the layers, and from the tileset's own lists. Each
//  is looked up the old way, by the end of the key, and the new way, over everything the import stores.

// Must stay first: it gives the test a `document` with a `#preload` container.
import { document } from './lib/dom';

import * as fs from 'fs';
import * as TerrainFeatures from '@civ-clone/civ1-world/TerrainFeatures';
import * as Terrains from '@civ-clone/civ1-world/Terrains';
import * as Units from '@civ-clone/civ1-unit/Units';
import getPreloadedImage, {
  setPreloadContainer,
} from '../../src/js/UI/lib/getPreloadedImage';
import validateDescriptor, {
  expandName,
  spriteKey,
} from '../../src/js/UI/tilesets/TilesetDescriptor';
import SquareTopology from '@civ-clone/core-world/SquareTopology';
import civ1Json from '../../src/js/UI/tilesets/civ1.json';
import currentTileset from '../../src/js/UI/lib/tilesets';
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
    process.stderr.write(`FAIL spriteKeys: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

const logged: string[] = [];

console.error = (...args: unknown[]) =>
  logged.push(args.map((arg) => String(arg)).join(' '));

const civ1 = currentTileset(),
  { families, names, units, cities } = civ1,
  lower = (name: string): string => name.toLowerCase();

// What the import stores: `./assets/<path><name>.png` for every sprite the extractor cuts out
//  (`ImportAssetsWindow`), whichever list of the tileset's it is on.
const imported: string[] = [];

Object.values((extractData as any).files).forEach((definitions: any) =>
  Object.entries(definitions).forEach(([assetPath, rows]: [string, any]) =>
    rows.forEach((row: any) =>
      row.contents.forEach((sprite: any) =>
        imported.push(`./assets/${assetPath}${sprite.name}.png`)
      )
    )
  )
);

// The sprites the render-geometry run asked for, and the ones it preloaded, from `tools/sprite-keys.js`.
const harness: { asked: string[]; preloaded: string[] } = JSON.parse(
  fs.readFileSync(process.argv[2], 'utf8')
);

const civ1Name = (key: string): string | null => {
  const { prefix, ext } = civ1.storage;

  return key.startsWith(prefix) && key.endsWith(ext)
    ? key.slice(prefix.length, key.length - ext.length)
    : null;
};

expect(
  'the render-geometry run asked for sprites, each by its Civ1 key',
  [
    harness.asked.length > 0,
    harness.asked.filter((key) => civ1Name(key) === null),
  ],
  [true, []]
);

// Every name the map asks for: the templates expanded as the layers expand them.
const edges = new SquareTopology(3, 3).edgeDirections() as string[],
  all = new SquareTopology(3, 3).directions() as string[],
  combinations = (directions: string[]): string[][] =>
    new Array(1 << directions.length)
      .fill(null)
      .map((_, mask) =>
        directions.filter((direction, bit) => mask & (1 << bit))
      ),
  terrainName = (terrain: string): string =>
    names.terrain[terrain] ?? lower(terrain),
  // `Landscape`: each land terrain alone and joined to its neighbours, river mouths, roads, railroads, specials (and
  //  Forest's doe), the hut, the base squares, the coast and the improvements; `Fog`; `renderUnit`; `Cities` and
  //  `unitActionIcon`; `Yields`; `CityNames`' disorder icon.
  templated = [
    ...Object.keys(Terrains)
      .filter((terrain) => !families.terrain.skip!.includes(terrain))
      .flatMap((terrain) =>
        combinations(edges).map((directions) =>
          directions.length === 0
            ? expandName(families.terrain.isolated as string, {
                terrain: terrainName(terrain),
              })
            : expandName(families.terrain.sprite, {
                terrain: terrainName(terrain),
                dirs: directions.join(families.terrain.join!),
              })
        )
      ),
    // A terrain a unit's action leaves, as `unitActionIcon` draws it.
    ...Object.keys(Terrains).map((terrain) => `terrain/${lower(terrain)}`),
    ...edges.map((dir) => expandName(families.riverMouth.sprite, { dir })),
    ...edges.map((dir) => expandName(families.fog.sprite, { dir })),
    ...all.map((dir) => expandName(families.road.sprite, { dir })),
    ...all.map((dir) => expandName(families.railroad.sprite, { dir })),
    ...Object.keys(TerrainFeatures).map((special) =>
      expandName(families.special.sprite, { special: lower(special) })
    ),
    ...Object.values(names.special).map((special) =>
      expandName(families.special.sprite, { special })
    ),
    ...Object.keys(Units).map((unit) =>
      expandName(units.sprite, { unit: names.unit[unit] ?? lower(unit) })
    ),
    families.base.land,
    families.base.ocean,
    families.coast.strip!.sprite,
    families.irrigation.sprite,
    families.mine.sprite,
    families.pollution.sprite,
    families.hut.sprite,
    units.fortified,
    cities.sprite,
    ...['Food', 'Production', 'Trade'].map((yieldName) =>
      lower(`city/${yieldName}`)
    ),
    'city/people_unhappy_m',
  ],
  // And names that are not sprites, which both ways miss: a unit from a plugin, a join Ocean is never drawn with, fog
  //  on a corner, and the render-geometry run's own plain square.
  absent = ['units/warship', 'terrain/ocean_n', 'map/fog_ne', 'map/plain'],
  asked = [
    ...new Set([
      ...harness.asked.map((key) => civ1Name(key)!),
      ...harness.preloaded,
      ...templated,
      ...civ1.assets.required,
      ...civ1.assets.optional,
      ...absent,
    ]),
  ].sort();

const container = (keys: string[]): HTMLElement => {
  const element = document.createElement('div');

  keys.forEach((key) => {
    const image = document.createElement('img');

    image.setAttribute('data-path', key);
    element.append(image);
  });

  return element as unknown as HTMLElement;
};

const keyOf = (image: unknown): string | null =>
  image instanceof (globalThis as any).HTMLImageElement
    ? (image as HTMLImageElement).getAttribute('data-path')
    : null;

// The old way: the first image whose key ends in the name (`[data-path$="…"]`).
const before = (preload: HTMLElement, name: string): string | null =>
  keyOf(preload.querySelector(`[data-path$="${name}.png"]`));

// The new way, through the map's own lookup: for the current tileset, or for `tileset`.
const after = (
  name: string,
  tileset?: ReturnType<typeof currentTileset>
): string | null =>
  keyOf(
    tileset === undefined
      ? getPreloadedImage(name)
      : getPreloadedImage(name, tileset)
  );

// Everything the import stores, preloaded before the map looks (found by the container's index) and after it has
//  started to look (found as the images arrive).
const civ1Preload = container(imported),
  results = (preload: HTMLElement) =>
    asked.map((name) => [name, before(preload, name), after(name)]);

setPreloadContainer(civ1Preload);

const indexed = results(civ1Preload);

// Asked for again, each missing sprite is not reported again.
absent.forEach((name) => [after(name), after(name)]);

const reported = logged.splice(0),
  lateArrivals = container([]);

setPreloadContainer(lateArrivals);
imported.forEach((key) => {
  const image = document.createElement('img');

  image.setAttribute('data-path', key);
  lateArrivals.append(image as unknown as HTMLElement);
});

const arrived = results(lateArrivals),
  differing = (rows: (string | null)[][]) =>
    rows.filter(([, old, now]) => old !== now),
  count = (rows: (string | null)[][], found: boolean) =>
    rows.filter(([, old]) => (old !== null) === found).length;

expect(
  'every sprite the map asks for is found as it was: the same image, or the same miss',
  [differing(indexed), differing(arrived)],
  [[], []]
);
expect(
  'which is every sprite the import stores, each by its own key, and none of the names that are not sprites',
  [
    asked.length,
    count(indexed, true),
    count(indexed, false),
    indexed
      .filter(([, , now]) => now !== null)
      .every(([name, , now]) => now === spriteKey(civ1, name!)),
    indexed.filter(([, , now]) => now === null).map(([name]) => name),
    count(arrived, true),
  ],
  [
    imported.length + absent.length,
    imported.length,
    absent.length,
    true,
    [...absent].sort(),
    imported.length,
  ]
);
expect(
  'the render-geometry run and the templates ask only for sprites the import stores, and the plain square',
  [
    ...new Set([
      ...harness.asked.map((key) => civ1Name(key)!),
      ...harness.preloaded,
      ...templated,
    ]),
  ].filter((name) => !imported.includes(spriteKey(civ1, name))),
  ['map/plain']
);
expect(
  'a missing sprite is reported once, not on every lookup',
  reported,
  absent.map((name) => `Missing image: ${name}.`).sort()
);
expect(
  "only a name the map never asks for, the end of a sprite's key, was found before and is not now",
  [before(civ1Preload, 'land'), after('land')],
  ['./assets/terrain/land.png', null]
);

// A miss is not kept: a sprite that arrives after it was asked for is found.
logged.length = 0;

const waiting = container([]);

setPreloadContainer(waiting);

const missed = [after('units/settlers'), after('units/settlers')];

waiting.append(container(['./assets/units/settlers.png']).firstChild as any);

expect(
  'a sprite asked for before it arrives is reported once, and found once it is there',
  [missed, after('units/settlers'), logged],
  [
    [null, null],
    './assets/units/settlers.png',
    ['Missing image: units/settlers.'],
  ]
);

// A second pack, kept under its own prefix, with the same names as Civ1's and one of its own, preloaded first.
const other = validateDescriptor({
    ...JSON.parse(JSON.stringify(civ1Json)),
    id: 'other',
    storage: { prefix: './assets/other/', ext: '.png' },
  }),
  bothKeys = [
    ...imported.map((key) => key.replace('./assets/', './assets/other/')),
    './assets/other/terrain/x.png',
    ...imported,
  ],
  sprites = asked.filter((name) => !absent.includes(name)),
  bothIndexed = container(bothKeys),
  bothArriving = container([]);

expect(
  "by the end of the key, Civ1's sprites would have been the other pack's",
  [
    sprites.filter(
      (name) => before(bothIndexed, name) !== spriteKey(other, name)
    ),
    before(bothIndexed, 'terrain/x'),
  ],
  [[], './assets/other/terrain/x.png']
);

// Found both ways: from the container's index, and as the images arrive.
const twoPacks = (when: string): void => {
  expect(
    `by the whole key, Civ1's sprites are Civ1's, and the other pack's its own (${when})`,
    [
      sprites.filter((name) => after(name) !== spriteKey(civ1, name)),
      sprites.filter((name) => after(name, other) !== spriteKey(other, name)),
    ],
    [[], []]
  );
  expect(
    `a sprite only the other pack has is not taken for Civ1's (${when})`,
    [after('terrain/x'), after('terrain/x', other)],
    [null, './assets/other/terrain/x.png']
  );
};

setPreloadContainer(bothIndexed);
twoPacks('preloaded');

setPreloadContainer(bothArriving);
[...bothIndexed.children].forEach((image) =>
  bothArriving.append(image.cloneNode() as HTMLElement)
);
twoPacks('arriving');

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL spriteKeys (${failures.length} of ${checks} checks)\n  ${failures
      .slice(0, 20)
      .join('\n  ')}\n`
  );
  process.exit(1);
}

console.log(
  `PASS spriteKeys (${checks} checks: ${asked.length} sprite names, ${
    harness.asked.length
  } asked for by the render-geometry run, ${count(
    indexed,
    true
  )} found and ${count(indexed, false)} missed the same way before and after)`
);
