// Hosted sets (#1063): a set that ships with civ.one is built into one sheet and an index of where each sprite is in it
//  (`tools/lib/hostedSets.js`), which the asset store fetches and cuts each sprite out of under its usual key, with
//  nothing read from or written to the browser's storage. It is installed as it is declared, with its own colours,
//  unless its sheet can't be loaded, which never stops the rest loading. The map of a grid is drawn with the set the
//  player chose for it, or the one imported for it, or the one that ships. The pixel art is the first: its sheet is read
//  from disk here (the suite's runner builds it), with no network.

// Must stay first: it gives the store a `document`, and an `indexedDB` that never opens.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/classicInterface';
import './lib/artPacks';

import {
  AssetStore,
  fetchHosted,
  loadHosted,
} from '@civ-clone/ui-assets/AssetStore';
import {
  AssetPack,
  PackMetadata,
  metadataKey,
} from '@civ-clone/ui-assets/lib/packs';
import {
  OptionStorage,
  instance as options,
} from '@civ-clone/ui-platform/GameOptionsRegistry';
import {
  TilesetDescriptor,
  spriteKey,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import {
  PackState,
  chooseMapTileset,
  installTilesets,
  interfaceTileset,
  mapTileset,
  mapTilesetOption,
  registerTileset,
  setRuleSetTileset,
} from '@civ-clone/ui-assets/lib/tilesets';
import {
  importedTilesets,
  mayOfferOtherGames,
} from '@civ-clone/ui-menus/lib/pluginSets';
import interfaceArt, {
  interfaceSpriteKey,
  provideInterfaceArt,
  requiredInterfaceNames,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import { readFileSync, existsSync } from 'fs';
import { Store } from '@civ-clone/ui-platform/Store';
import civ1Json from '@civ-clone/ui-tileset-civ1/civ1.json';
import civ2Json from '@civ-clone/ui-tileset-civ2/civ2.json';
import getPreloadedImage from '@civ-clone/ui-assets/lib/getPreloadedImage';
import installPacks, {
  ensureMapArt,
} from '@civ-clone/ui-assets/lib/installPacks';
import prepareStart, {
  provideStartPreparation,
} from '@civ-clone/ui-client/lib/startPreparation';
import prepareMapArt from '@civ-clone/ui-menus/lib/mapArt';
import { askPlayerCount } from '@civ-clone/ui-menus/components/newGame';
import { GameSetup } from '@civ-clone/ui-client/lib/gameSetup';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import { join } from 'path';
import pixelArt from '@civ-clone/ui-tileset-pixelart';
import pixelArtJson from '@civ-clone/civ1-tileset-pixelart/pack/tileset.json';
import setOptionDefaults from '@civ-clone/ui-game/app/options';
import { sheets } from '@civ-clone/ui-tileset-pixelart/sheets';
import { uiThemeArt } from '@civ-clone/ui-widgets/lib/theme';
import validateDescriptor from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

// The build's own code, which the suite checks as it is: plain JS, so typed here by what it's used for.
type Pixels = { width: number; height: number; data: Buffer };
type Sheet = {
  png: Buffer;
  json: string;
  hash: string;
  index: {
    id: string;
    width: number;
    height: number;
    sprites: {
      [name: string]: { x: number; y: number; width: number; height: number };
    };
  };
};

const { readPng, writePng } = require('../../tools/lib/png') as {
    readPng: (buffer: Buffer, name?: string) => Pixels;
    writePng: (pixels: Pixels) => Buffer;
  },
  { buildSheet } = require('../../tools/lib/hostedSets') as {
    buildSheet: (
      descriptor: unknown,
      readSprite: (name: string) => Pixels | null
    ) => Sheet;
  };

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL hostedSets: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

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

// The message `fn` throws, or `null` when it does not.
const thrown = (fn: () => unknown): string | null => {
  try {
    fn();

    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

// A sprite of one colour, `width` × `height`.
const solid = (
  width: number,
  height: number,
  [r, g, b, a]: number[]
): Pixels => {
  const data = Buffer.alloc(width * height * 4);

  for (let at = 0; at < data.length; at += 4) {
    data[at] = r!;
    data[at + 1] = g!;
    data[at + 2] = b!;
    data[at + 3] = a!;
  }

  return { width, height, data };
};

// The pixels of `sheet` in `rectangle`, row by row.
const crop = (
  sheet: Pixels,
  x: number,
  y: number,
  width: number,
  height: number
): Pixels => {
  const data = Buffer.alloc(width * height * 4);

  for (let row = 0; row < height; row++) {
    sheet.data.copy(
      data,
      row * width * 4,
      ((y + row) * sheet.width + x) * 4,
      ((y + row) * sheet.width + x + width) * 4
    );
  }

  return { width, height, data };
};

// A bitmap is the PNG's pixels; one cut from another is those pixels cut out, as a browser's `createImageBitmap(image,
//  x, y, width, height)` is.
const cuts: number[][] = [];

(globalThis as any).createImageBitmap = async (
  source: Blob | Pixels,
  x?: number,
  y?: number,
  width?: number,
  height?: number
): Promise<Pixels> => {
  if (source instanceof Blob) {
    return readPng(Buffer.from(await source.arrayBuffer()));
  }

  cuts.push([x!, y!, width!, height!]);

  return crop(source, x!, y!, width!, height!);
};

// Nothing imported unless a check says so, and every read noted: a hosted set's sprites are never read from storage.
const records = new Map<string, unknown>(),
  asked: string[] = [],
  logged: string[] = [];
let keys: string[] = [];

Store.prototype.get = async function (name: any) {
  asked.push(name);

  return records.get(name);
};
Store.prototype.keys = async () => keys as any;
Store.prototype.setAll = async () => {};

console.error = (message: unknown) => logged.push(String(message));

// What's served: the built sets from disk, as the page's server serves `dist/sets`, and anything a check adds.
const served = new Map<string, Buffer>(),
  fetched: string[] = [];
let offline = false;

(globalThis as any).fetch = async (url: string): Promise<Response> => {
  fetched.push(url);

  if (offline) {
    throw new TypeError('Failed to fetch');
  }

  const body =
    served.get(url) ??
    (url.startsWith('dist/sets/') && existsSync(join(process.cwd(), url))
      ? readFileSync(join(process.cwd(), url))
      : null);

  return body === null
    ? new Response('', { status: 404 })
    : new Response(new Uint8Array(body));
};

// linkedom's `<select>` `value` is read-only, where a browser's selects the option: the choice windows set it.
const selectPrototype = (globalThis as any).HTMLSelectElement.prototype,
  selectValue = Object.getOwnPropertyDescriptor(selectPrototype, 'value')!;

Object.defineProperty(selectPrototype, 'value', {
  configurable: true,
  get(this: HTMLSelectElement) {
    return selectValue.get!.call(this);
  },
  set(this: HTMLSelectElement, value: string) {
    Array.from(this.querySelectorAll('option')).forEach((option) =>
      option.toggleAttribute('selected', option.getAttribute('value') === value)
    );
  },
});

const settle = async (): Promise<void> => {
  for (let index = 0; index < 10; index++) {
    await Promise.resolve();
  }
};

// The newest choice window open, and choosing `value` in it as the keyboard does.
const choose = (value: string): void => {
  const dialogs = Array.from(
      (document as unknown as Document).querySelectorAll('dialog[open]')
    ),
    select = dialogs[dialogs.length - 1]!.querySelector(
      'select'
    ) as HTMLSelectElement;

  // linkedom's `value` is read-only: it follows the selected option.
  Array.from(select.querySelectorAll('option')).forEach((option) =>
    option.toggleAttribute('selected', option.getAttribute('value') === value)
  );
  select.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
  );
};

const ids = (tilesets: TilesetDescriptor[]): string[] =>
    tilesets.map(({ id }) => id),
  civ1 = interfaceTileset(),
  civ1Keys = civ1.assets.required.map((name) => spriteKey(civ1, name)),
  memoryStorage = (initial: { [key: string]: unknown }): OptionStorage => {
    const items: { [key: string]: string } = {
      gameOptions: JSON.stringify(initial),
    };

    return {
      getItem: (key: string) => items[key] ?? null,
      setItem: (key: string, value: string) => {
        items[key] = value;
      },
    } as OptionStorage;
  };

(async () => {
  // The interface's words, for what the player is told.
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');

  // The sheet and its index.
  {
    const fixture = {
        id: 'fixture',
        assets: { required: ['a', 'b'], optional: ['c', 'd'] },
      },
      sprites: { [name: string]: Pixels | null } = {
        a: solid(2, 2, [255, 0, 0, 255]),
        b: solid(3, 1, [0, 255, 0, 255]),
        c: solid(1, 3, [0, 0, 255, 128]),
        d: null,
      },
      built = buildSheet(fixture, (name) => sprites[name] ?? null),
      sheet = readPng(built.png),
      rectangles = Object.entries(built.index.sprites);

    expect(
      'the index names each sprite there is, required and optional, by its own name: one that is missing is left out',
      [built.index.id, Object.keys(built.index.sprites)],
      ['fixture', ['a', 'b', 'c']]
    );
    expect(
      "each sprite is in the sheet, where the index says, at its own size, and the sheet is the index's size",
      [
        rectangles.map(([name, { x, y, width, height }]) =>
          crop(sheet, x, y, width, height).data.equals(sprites[name]!.data)
        ),
        [sheet.width, sheet.height],
      ],
      [
        [true, true, true],
        [built.index.width, built.index.height],
      ]
    );
    expect(
      'no two sprites overlap',
      rectangles.some(([a, one]) =>
        rectangles.some(
          ([b, other]) =>
            a !== b &&
            one.x < other.x + other.width &&
            other.x < one.x + one.width &&
            one.y < other.y + other.height &&
            other.y < one.y + one.height
        )
      ),
      false
    );
    expect(
      "the hash is the content's: the same sprites give the same, a pixel changed another",
      [
        buildSheet(fixture, (name) => sprites[name] ?? null).hash ===
          built.hash,
        buildSheet(fixture, (name) =>
          name === 'a' ? solid(2, 2, [255, 0, 1, 255]) : sprites[name] ?? null
        ).hash === built.hash,
        /^[0-9a-f]{12}$/.test(built.hash),
      ],
      [true, false, true]
    );
    expect(
      'the build fails for a set missing a sprite it requires, naming it',
      thrown(() =>
        buildSheet(fixture, (name) => (name === 'b' ? null : sprites[name]!))
      ),
      'The fixture set has no sprite for 1 it requires: b.'
    );

    const rgb = writePng(solid(1, 1, [0, 0, 0, 255]));

    // Colour type 2, RGB without alpha.
    rgb[25] = 2;

    expect(
      'a PNG that is not 8-bit RGBA is refused, not read wrongly',
      thrown(() => readPng(rgb, 'rgb.png')),
      'rgb.png is not an 8-bit RGBA, non-interlaced PNG (bit depth 8, colour type 2, interlace 0).'
    );
  }

  // The pixel art as it is built: every sprite its descriptor lists, as its own PNG has it.
  {
    const { sheet, index } = sheets['civ1-pixelart']!,
      built = readPng(readFileSync(sheet)),
      json = JSON.parse(readFileSync(index, 'utf8')) as Sheet['index'],
      listed = [
        ...pixelArtJson.assets.required,
        ...pixelArtJson.assets.optional,
      ],
      pack = join(
        process.cwd(),
        'node_modules/@civ-clone/civ1-tileset-pixelart/pack'
      );

    expect(
      'the pixel art is built into dist/sets, named by its hash, and its package told where',
      [
        /^dist\/sets\/civ1-pixelart\.[0-9a-f]{12}\.png$/.test(sheet),
        index === sheet.replace(/\.png$/, '.json'),
      ],
      [true, true]
    );
    expect(
      'its index lists every sprite its descriptor does',
      Object.keys(json.sprites).sort(),
      [...listed].sort()
    );
    expect(
      'and each is in the sheet as its own PNG has it',
      listed.filter((name) => {
        const { x, y, width, height } = json.sprites[name]!;

        return !crop(built, x, y, width, height).data.equals(
          readPng(readFileSync(join(pack, `${name}.png`))).data
        );
      }),
      []
    );
  }

  // The pixel art's descriptor: hosted, MIT, and with every name the interface asks for.
  expect(
    'the pixel art is registered hosted, with its licence, from its own descriptor',
    [
      pixelArt.id,
      pixelArt.grid,
      pixelArt.source,
      pixelArt.licence,
      pixelArt.storage.prefix,
    ],
    [
      'civ1-pixelart',
      'square',
      'hosted',
      {
        name: 'MIT',
        url: 'https://github.com/civ-clone/civ1-tileset-pixelart/blob/main/LICENSE',
      },
      './assets/civ1-pixelart/',
    ]
  );
  expect(
    'it has every sprite the interface needs, by its own name for it',
    requiredInterfaceNames.filter(
      (name) =>
        !pixelArt.assets.required.some(
          (sprite) =>
            spriteKey(pixelArt, sprite) === interfaceSpriteKey(name, pixelArt)
        )
    ),
    []
  );
  expect(
    'a hosted set is registered with its sheet, and only a hosted one',
    [
      thrown(() =>
        registerTileset({ ...pixelArt, id: 'no-sheet', source: 'hosted' })
      ),
      thrown(() =>
        registerTileset(
          { ...pixelArt, id: 'not-hosted', source: 'imported' },
          { hosted: { sheet: 'a.png', index: 'a.json' } }
        )
      ),
    ],
    [
      'Tileset "no-sheet" is hosted, and has no sheet to load: build the hosted sets (tools/hosted-sets.js).',
      'Tileset "not-hosted" has a sheet, and isn\'t hosted.',
    ]
  );

  // Loading a hosted set: its sheet and index fetched, and each sprite it lists cut out under its key.
  const fixture = buildSheet(
      { id: 'fixture', assets: { required: ['a', 'b'], optional: ['c'] } },
      (name) =>
        ({
          a: solid(2, 2, [255, 0, 0, 255]),
          b: solid(3, 1, [0, 255, 0, 255]),
          c: solid(1, 3, [0, 0, 255, 255]),
        }[name] ?? null)
    ),
    fixturePack: AssetPack = {
      id: 'fixture',
      storage: { prefix: './assets/fixture/', ext: '.png' },
      // `e` isn't in the sheet: it is left out, and drawn as missing.
      assets: { required: ['a', 'b'], optional: ['c', 'e'], ui: [] },
      hosted: { sheet: 'sets/fixture.png', index: 'sets/fixture.json' },
    },
    // `getPreloadedImage` looks a sprite up by its pack's storage alone.
    fixtureTileset = fixturePack as unknown as TilesetDescriptor,
    fixtureSprite = (name: string): Pixels =>
      getPreloadedImage(name, fixtureTileset) as unknown as Pixels;

  served.set('sets/fixture.png', fixture.png);
  served.set('sets/fixture.json', Buffer.from(fixture.json));

  {
    const store = new AssetStore(civ1, [fixturePack]);

    asked.length = 0;
    cuts.length = 0;
    fetched.length = 0;
    await store.load();

    expect(
      'a hosted set is not fetched as the store loads',
      [
        fetched,
        await store.missingAssets(fixturePack),
        store.hostedLoaded(fixturePack),
      ],
      [[], ['./assets/fixture/a.png', './assets/fixture/b.png'], false]
    );

    await Promise.all([
      store.loadHostedPack(fixturePack),
      store.loadHostedPack(fixturePack),
    ]);

    expect(
      'but when it is asked for, once: each sprite is cut from the sheet where the index says, under its key',
      [
        fetched,
        cuts.length,
        ['a', 'b', 'c'].map((name) => [
          fixtureSprite(name).width,
          fixtureSprite(name).height,
          fixtureSprite(name).data?.[1],
        ]),
        await store.has(spriteKey(fixturePack, 'c')),
        await store.has(spriteKey(fixturePack, 'e')),
      ],
      [
        ['sets/fixture.png', 'sets/fixture.json'],
        3,
        [
          [2, 2, 0],
          [3, 1, 255],
          [1, 3, 0],
        ],
        true,
        false,
      ]
    );

    await store.load();

    expect(
      'nothing of it is read from storage, it is complete without anything imported, and a load after keeps it',
      [
        asked.filter((key) => key.startsWith('./assets/fixture/')),
        await store.hasAllAssets(fixturePack),
        await store.missingAssets(fixturePack),
        fixtureSprite('a').width,
        fetched.length,
      ],
      [[], true, [], 2, 2]
    );
  }

  // Storage blocked (#850): the imported packs' sprites are left out, and the hosted set's still load.
  {
    const get = Store.prototype.get,
      storedKeys = Store.prototype.keys,
      opens = Store.prototype.opens,
      store = new AssetStore(civ1, [fixturePack]);

    Store.prototype.opens = async () => false;
    Store.prototype.get = async () => {
      throw new Error('The user denied permission to access the database.');
    };
    Store.prototype.keys = Store.prototype.get as any;
    logged.length = 0;

    await store.load();
    await store.loadHostedPack(fixturePack);

    expect(
      "with storage blocked, a hosted set's sprites still load, and the rest are said not to be there",
      [
        fixtureSprite('a').width,
        await store.hasAllAssets(fixturePack),
        await store.hasAllAssets(),
        await store.isComplete(),
        logged,
      ],
      [2, true, false, false, ['Could not load the assets.']]
    );

    Store.prototype.get = get;
    Store.prototype.keys = storedKeys;
    Store.prototype.opens = opens;
  }

  // A sheet that can't be loaded: said, and the set's sprites left out, the rest loaded as ever.
  {
    const store = new AssetStore(civ1, [fixturePack]);

    records.set(civ1Keys[0]!, {
      name: civ1Keys[0],
      blob: new Blob([readFileSync(sheets['civ1-pixelart']!.sheet)]),
    });
    await store.load();
    offline = true;

    const failure = await store.loadHostedPack(fixturePack).then(
      () => null,
      (error: Error) => error.message
    );

    offline = false;

    expect(
      "a sheet that can't be fetched: the set is incomplete, the rest loaded, and it can be asked for again",
      [
        failure,
        await store.missingAssets(fixturePack),
        await store.has(civ1Keys[0]!),
        await store.loadHostedPack(fixturePack).then(
          () => store.hostedLoaded(fixturePack),
          () => 'rejected'
        ),
      ],
      [
        'Failed to fetch',
        ['./assets/fixture/a.png', './assets/fixture/b.png'],
        true,
        true,
      ]
    );

    records.clear();

    expect(
      "nor one that isn't there, nor an index for another set, nor a request, its body, or the decoding, that doesn't come in time",
      await Promise.all([
        loadHosted(fixturePack, {
          sheet: 'sets/gone.png',
          index: 'sets/fixture.json',
        }).then(
          () => null,
          (error: Error) => error.message
        ),
        loadHosted({ ...fixturePack, id: 'other' }, fixturePack.hosted!).then(
          () => null,
          (error: Error) => error.message
        ),
        (async () => {
          const fetching = (globalThis as any).fetch,
            decoding = (globalThis as any).createImageBitmap;

          (globalThis as any).fetch = () => new Promise(() => {});

          const hung = await fetchHosted(
            'sets/fixture.png',
            (response) => response.blob(),
            5
          ).then(
            () => null,
            (error: Error) => error.message
          );

          // Headers that come, and a body that never does.
          (globalThis as any).fetch = async () =>
            ({ ok: true, blob: () => new Promise(() => {}) } as unknown);

          const stalled = await fetchHosted(
            'sets/fixture.json',
            (response) => response.blob(),
            5
          ).then(
            () => null,
            (error: Error) => error.message
          );

          // A sheet that comes, and a decode that never finishes.
          (globalThis as any).fetch = fetching;
          (globalThis as any).createImageBitmap = () => new Promise(() => {});

          const undecoded = await loadHosted(
            fixturePack,
            fixturePack.hosted!,
            20
          ).then(
            () => null,
            (error: Error) => error.message
          );

          (globalThis as any).createImageBitmap = decoding;

          return [hung, stalled, undecoded];
        })(),
      ]),
      [
        "sets/gone.png couldn't be fetched (404).",
        "sets/fixture.json is not the other set's index.",
        [
          "sets/fixture.png didn't come within 5 ms.",
          "sets/fixture.json didn't come within 5 ms.",
          "The fixture set's sheet didn't come within 20 ms.",
        ],
      ]
    );
  }

  // Installing (`installPacks`): the pixel art is installed as it's declared, and its sheet fetched as the page starts
  //  only when the interface draws with it; Civ1's once its sprites are all in, or when the store can't say.
  {
    const theme = uiThemeArt('slate');

    provideInterfaceArt(() => theme);
    keys = civ1Keys;
    fetched.length = 0;

    const store = new AssetStore(civ1),
      withCiv1 = ids(await installPacks(store));

    expect(
      "with Civ1's art imported: Civ1's and the pixel art installed, nothing fetched, and Civ1's drawn on the square map and the interface, as before",
      [
        withCiv1,
        fetched,
        mapTileset('square').id,
        interfaceArt().id,
        store.hostedLoaded(pixelArt),
      ],
      [['civ1', 'civ1-pixelart'], [], 'civ1', 'civ1', false]
    );
    expect(
      "nothing is asked of the worker for a game of another kind: the pixel art is no game's own",
      [mayOfferOtherGames(), importedTilesets()],
      [false, ['civ1']]
    );

    await ensureMapArt('square', store);

    expect(
      "a game on the square grid drawn with Civ1's art fetches nothing",
      fetched,
      []
    );

    chooseMapTileset('square', 'civ1-pixelart');
    await ensureMapArt('square', store);

    expect(
      'one drawn with the pixel art fetches its sheet first, and draws from it',
      [
        fetched,
        (getPreloadedImage('terrain/ocean', pixelArt) as unknown as Pixels)
          .width,
      ],
      [[sheets['civ1-pixelart']!.sheet, sheets['civ1-pixelart']!.index], 32]
    );

    fetched.length = 0;

    expect(
      'and a chosen hosted set is fetched as the page starts',
      [ids(await installPacks(new AssetStore(civ1))), fetched.length],
      [['civ1', 'civ1-pixelart'], 2]
    );

    chooseMapTileset('square', '');
    keys = [];
    fetched.length = 0;

    expect(
      'with nothing imported, the pixel art draws the square map and the interface, its sheet fetched as the page starts',
      [
        ids(await installPacks(new AssetStore(civ1))),
        mapTileset('square').id,
        interfaceArt().id,
        interfaceArt(uiThemeArt('civ1-classic')).id,
        fetched.length,
      ],
      [['civ1-pixelart'], 'civ1-pixelart', 'civ1-pixelart', 'civ1-pixelart', 2]
    );

    keys = civ1Keys;
    offline = true;
    logged.length = 0;

    expect(
      "offline with Civ1's art: nothing is fetched, so nothing fails, and the pixel art is still declared",
      [ids(await installPacks(new AssetStore(civ1))), logged],
      [['civ1', 'civ1-pixelart'], []]
    );

    keys = [];

    expect(
      "offline with nothing imported: the pixel art's sheet can't be fetched, which is said, and it isn't installed",
      [
        ids(await installPacks(new AssetStore(civ1))),
        logged.includes("Could not load the civ1-pixelart set's sheet."),
        interfaceArt().id,
      ],
      [[], true, 'civ1']
    );

    offline = false;

    // A store that opens but can't be read says nothing of Civ1's sprites: it stays installed, as it was before.
    const storedKeys = Store.prototype.keys,
      storedGet = Store.prototype.get,
      opens = Store.prototype.opens;

    Store.prototype.opens = async () => true;
    Store.prototype.keys = async () => {
      throw new Error('The database connection is closing.');
    };
    fetched.length = 0;

    expect(
      "a store that opens but can't be read leaves Civ1's installed, and the pixel art declared and not fetched",
      [ids(await installPacks(new AssetStore(civ1))), fetched],
      [['civ1', 'civ1-pixelart'], []]
    );

    // One the browser won't open at all (site data blocked, #850) has nothing imported: the pixel art stands in.
    Store.prototype.opens = async () => false;
    Store.prototype.keys = Store.prototype.get = async () => {
      throw new Error('The user denied permission to access the database.');
    };
    fetched.length = 0;

    expect(
      "with storage blocked, the pixel art is the interface's and the square map's art, its sheet fetched as the page starts",
      [
        ids(await installPacks(new AssetStore(civ1))),
        interfaceArt().id,
        mapTileset('square').id,
        fetched,
      ],
      [
        ['civ1-pixelart'],
        'civ1-pixelart',
        'civ1-pixelart',
        [sheets['civ1-pixelart']!.sheet, sheets['civ1-pixelart']!.index],
      ]
    );

    Store.prototype.keys = storedKeys;
    Store.prototype.get = storedGet;
    Store.prototype.opens = opens;
    keys = civ1Keys;
    await installPacks(new AssetStore(civ1));
    keys = [];

    // The start of a game waits for its map's art, through the page's preparation, and stops, saying why, without it.
    provideStartPreparation(prepareMapArt);
    chooseMapTileset('square', 'civ1-pixelart');
    offline = true;
    logged.length = 0;

    const refused = await prepareStart('square');

    offline = false;
    fetched.length = 0;

    expect(
      "a game whose art can't be fetched doesn't start, and the player is told why",
      [
        refused,
        logged.some((message) =>
          message.startsWith(
            "Error: Pixel art (civ1-pixelart) couldn't be loaded: Failed to fetch"
          )
        ),
        (document as unknown as Document).body.textContent?.includes(
          "Pixel art (civ1-pixelart) couldn't be loaded"
        ) ?? false,
      ],
      [false, true, true]
    );

    expect(
      'and one whose art can be starts once it has been fetched',
      [await prepareStart('square'), fetched],
      [true, [sheets['civ1-pixelart']!.sheet, sheets['civ1-pixelart']!.index]]
    );

    // The game setup's Start waits for it too, and stays open without it.
    {
      const sent: string[] = [],
        transport = {
          request: async () => ({}),
          send: (channel: string) => sent.push(channel),
        } as any,
        setup = new GameSetup(
          {
            aiClients: ['SimpleAIClient'],
            civilizations: [{ name: 'Roman', leaders: ['JuliusCaesar'] }],
            difficulties: [],
            existing: {},
          } as any,
          {}
        );

      const prepared: string[] = [];
      let ready = false;

      provideStartPreparation(async (topologyId) => {
        prepared.push(topologyId);

        return ready;
      });

      const refusedStart = await setup.start(transport, {} as any, '');

      ready = true;

      const started = await setup.start(transport, {} as any, '');

      expect(
        "the game setup's Start waits for its map's art: without it nothing is sent, and the setup stays open; with it, the game starts",
        [refusedStart, started, sent, prepared],
        [false, true, ['start'], ['square', 'square']]
      );

      // Closed while its art is fetched: nothing starts.
      let release: (ready: boolean) => void = () => {};

      provideStartPreparation(
        () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          })
      );
      sent.length = 0;

      const closing = setup.start(transport, {} as any, '');

      await settle();
      setup.cancelStart();
      release(true);

      expect(
        'a setup closed while its art is fetched starts nothing',
        [await closing, sent],
        [false, []]
      );

      provideStartPreparation(prepareMapArt);
    }

    // New Game chosen again while the first is waiting for its art: the second is left out.
    {
      const sent: string[] = [];
      let requests = 0,
        release: (ready: boolean) => void = () => {};

      const transport = {
        request: async () => {
          requests++;

          return {};
        },
        send: (channel: string) => sent.push(channel),
      } as any;

      provideStartPreparation(
        () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          })
      );

      (document as unknown as Document)
        .querySelectorAll('dialog[open]')
        .forEach((dialog) => dialog.removeAttribute('open'));
      askPlayerCount(transport, { topologyId: 'square' }, [2, 3], 2);
      choose('2');
      await settle();
      askPlayerCount(transport, { topologyId: 'square' }, [2, 3], 3);
      choose('3');
      await settle();
      release(true);
      await settle();

      expect(
        'a second New Game while the first waits for its art sends nothing',
        [requests, sent],
        [1, ['start']]
      );

      provideStartPreparation(prepareMapArt);
    }

    chooseMapTileset('square', '');
    provideInterfaceArt(() => []);
    installTilesets({});
  }

  // Installed as declared, with its own colours: a hosted set has no import to have recorded others, so a set whose
  //  cities' flags are an overlay keeps its descriptor's keys, where an imported one needs its import's.
  const hostedIso = registerTileset(
    validateDescriptor({
      ...JSON.parse(JSON.stringify(civ2Json)),
      id: 'hosted-iso',
      storage: { prefix: './assets/hosted-iso/', ext: '.png' },
      source: 'hosted',
    }),
    { hosted: { sheet: 'sets/hosted-iso.png', index: 'sets/hosted-iso.json' } }
  );

  {
    const keysOf = (tileset: TilesetDescriptor): string[] =>
        (tileset.cities.colouring as { keys: string[] }).keys,
      civ2Metadata: PackMetadata = {
        anchors: {},
        colours: {
          flag: [{ primary: [250, 1, 2], secondary: [160, 3, 4] }],
        },
      },
      installed = installTilesets({
        civ2: { complete: true, metadata: civ2Metadata },
        'hosted-iso': { complete: true, metadata: null },
      });

    expect(
      'a hosted set is installed with no state, or a complete one, and not once its sheet failed',
      [
        ids(installTilesets({})),
        ids(
          installTilesets({ 'hosted-iso': { complete: true, metadata: null } })
        ),
        ids(
          installTilesets({
            'hosted-iso': { complete: false, metadata: null },
            'civ1-pixelart': { complete: false, metadata: null },
          })
        ),
      ],
      [
        ['civ1', 'civ1-pixelart', 'hosted-iso'],
        ['civ1', 'civ1-pixelart', 'hosted-iso'],
        ['civ1'],
      ]
    );
    expect(
      "an overlay's keys: the hosted set's its descriptor's own, the imported set's its import's",
      [
        keysOf(installed.find(({ id }) => id === 'hosted-iso')!),
        keysOf(installed.find(({ id }) => id === 'civ2')!),
      ],
      [keysOf(hostedIso), ['#fa0102', '#a00304']]
    );
    expect(
      'no record of anchors and colours is read for it',
      asked.includes(metadataKey(hostedIso)),
      false
    );
  }

  // The map's art per grid: the player's choice, or the imported set, or the hosted one.
  {
    const civ2Installed: { [id: string]: PackState } = {
      civ2: {
        complete: true,
        metadata: {
          anchors: {},
          colours: {
            flag: [{ primary: [250, 1, 2], secondary: [160, 3, 4] }],
          },
        },
      },
    };

    chooseMapTileset('square', '');
    chooseMapTileset('staggered-iso', '');
    installTilesets(civ2Installed);

    expect(
      'unchosen, each grid has the set imported for it',
      [mapTileset('square').id, mapTileset('staggered-iso').id],
      ['civ1', 'civ2']
    );
    expect(
      'settled once: the same set each time the layers ask',
      mapTileset('square') === mapTileset('square'),
      true
    );

    installTilesets({ civ1: { complete: false, metadata: null } });

    expect(
      'without one imported, the one that ships',
      [mapTileset('square').id, mapTileset('staggered-iso').id],
      ['civ1-pixelart', 'hosted-iso']
    );

    // Another imported square set, registered after the pixel art: imported comes first whatever the order.
    registerTileset(
      validateDescriptor({
        ...JSON.parse(JSON.stringify(civ1Json)),
        id: 'imported-square',
        storage: { prefix: './assets/imported-square/', ext: '.png' },
      })
    );
    installTilesets({
      civ1: { complete: false, metadata: null },
      'imported-square': { complete: true, metadata: null },
    });

    expect(
      'an imported set comes before the one that ships, though registered after it',
      mapTileset('square').id,
      'imported-square'
    );

    installTilesets(civ2Installed);
    chooseMapTileset('square', 'civ1-pixelart');
    chooseMapTileset('staggered-iso', 'hosted-iso');

    expect(
      "the player's choice over the imported set, kept as an option",
      [
        mapTileset('square').id,
        mapTileset('staggered-iso').id,
        options.get(mapTilesetOption('square')),
      ],
      ['civ1-pixelart', 'hosted-iso', 'civ1-pixelart']
    );

    setRuleSetTileset('civ2');

    expect(
      "a rule set that names its art (Civ2's) has its grid drawn with it, over the player's choice, and not another grid",
      [mapTileset('staggered-iso').id, mapTileset('square').id],
      ['civ2', 'civ1-pixelart']
    );

    setRuleSetTileset(null);

    expect(
      'and the choice again for a rule set that names none',
      mapTileset('staggered-iso').id,
      'hosted-iso'
    );

    options.set(mapTilesetOption('staggered-iso'), '');

    expect(
      'the option changed however it is changed, the map follows',
      mapTileset('staggered-iso').id,
      'civ2'
    );

    chooseMapTileset('square', 'civ2');
    chooseMapTileset('staggered-iso', 'gone');

    expect(
      "a choice of another grid's set, or one that isn't installed, is passed over",
      [mapTileset('square').id, mapTileset('staggered-iso').id],
      ['civ1', 'civ2']
    );

    chooseMapTileset('square', 'civ1-pixelart');
    installTilesets({
      ...civ2Installed,
      'civ1-pixelart': { complete: false, metadata: null },
    });

    expect(
      "a chosen set whose sheet didn't load is passed over too",
      mapTileset('square').id,
      'civ1'
    );

    chooseMapTileset('square', '');
    chooseMapTileset('staggered-iso', '');
    installTilesets({});
  }

  // The options: each set's zoom, the hosted ones' too, and the art chosen for each grid, kept as they were chosen.
  {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage({}),
    });

    setOptionDefaults();

    expect(
      "a hosted set's zoom is an option, at its default, and each grid's art, unchosen",
      [
        options.get('zoom.civ1-pixelart'),
        options.get('zoom.hosted-iso'),
        options.get(mapTilesetOption('square')),
        options.get(mapTilesetOption('staggered-iso')),
      ],
      [1, 1.4, '', '']
    );

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage({
        'zoom.civ1-pixelart': 1.5,
        [mapTilesetOption('square')]: 'civ1-pixelart',
      }),
    });

    setOptionDefaults();
    installTilesets({});

    expect(
      'and what the player chose comes back on the next start: the zoom, and the art, which the map is drawn with',
      [
        options.get('zoom.civ1-pixelart'),
        options.get(mapTilesetOption('square')),
        mapTileset('square').id,
      ],
      [1.5, 'civ1-pixelart', 'civ1-pixelart']
    );

    chooseMapTileset('square', '');
    installTilesets({});
  }

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL hostedSets (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS hostedSets (${checks} checks)\n`);
  process.exit(0);
})().catch((error) => {
  process.stderr.write(`FAIL hostedSets: ${error.stack ?? error}\n`);
  process.exit(1);
});
