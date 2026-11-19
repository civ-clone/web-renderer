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
  cutSprite,
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
  installedTilesets,
  interfaceTileset,
  mapTileset,
  mapTilesetOption,
  registerTileset,
  setRuleSetTileset,
  sheetFailure,
} from '@civ-clone/ui-assets/lib/tilesets';
import {
  followSavedRuleSet,
  mayOfferOtherGames,
  presentTilesets,
} from '@civ-clone/ui-menus/lib/pluginSets';
import interfaceArt, {
  interfaceSpriteKey,
  provideInterfaceArt,
  requiredInterfaceNames,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import { readFileSync, existsSync } from 'fs';
import { crc32, deflateSync, inflateSync } from 'zlib';
import { Store } from '@civ-clone/ui-platform/Store';
import civ1Json from '@civ-clone/ui-tileset-civ1/civ1.json';
import civ2Json from '@civ-clone/ui-tileset-civ2/civ2.json';
import getPreloadedImage from '@civ-clone/ui-assets/lib/getPreloadedImage';
import installPacks, {
  ensureMapArt,
  loadFailed,
} from '@civ-clone/ui-assets/lib/installPacks';
import prepareStart, {
  provideStartPreparation,
} from '@civ-clone/ui-client/lib/startPreparation';
import prepareMapArt, {
  prepareSavedMapArt,
} from '@civ-clone/ui-menus/lib/mapArt';
import { askPlayerCount } from '@civ-clone/ui-menus/components/newGame';
import { GameSetup } from '@civ-clone/ui-client/lib/gameSetup';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import { join } from 'path';
import pixelArt, {
  hexPixelArtTileset as hexPixelArt,
} from '@civ-clone/ui-tileset-pixelart';
import hexPixelArtJson from '@civ-clone/civ1-tileset-pixelart/pack-hex/tileset.json';
import isoPixelArtJson from '@civ-clone/civ1-tileset-pixelart/pack-iso/tileset.json';
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

  // The hexagonal pixel art as it is built (slice 4 of docs/asset-library.md): all 902 of its sprites, as its PNGs
  //  have them.
  {
    const { sheet, index } = sheets['hex-pixelart']!,
      built = readPng(readFileSync(sheet)),
      json = JSON.parse(readFileSync(index, 'utf8')) as Sheet['index'],
      listed = [
        ...hexPixelArtJson.assets.required,
        ...hexPixelArtJson.assets.optional,
      ],
      pack = join(
        process.cwd(),
        'node_modules/@civ-clone/civ1-tileset-pixelart/pack-hex'
      );

    expect(
      'the hexagonal pixel art is built into dist/sets beside the square, named by its hash, and its package told where',
      [
        /^dist\/sets\/hex-pixelart\.[0-9a-f]{12}\.png$/.test(sheet),
        index === sheet.replace(/\.png$/, '.json'),
        Object.keys(sheets).sort(),
      ],
      [true, true, ['civ1-pixelart', 'hex-pixelart', 'iso-pixelart']]
    );
    expect(
      'its index lists every sprite its descriptor does, every one it requires among them',
      [
        Object.keys(json.sprites).sort(),
        hexPixelArtJson.assets.required.filter(
          (name) => json.sprites[name] === undefined
        ),
        listed.length,
      ],
      [[...listed].sort(), [], 902]
    );
    expect(
      'and each is in the sheet as its own PNG has it, a hex tile 32 × 36',
      [
        listed.filter((name) => {
          const { x, y, width, height } = json.sprites[name]!;

          return !crop(built, x, y, width, height).data.equals(
            readPng(readFileSync(join(pack, `${name}.png`))).data
          );
        }),
        json.sprites['terrain/ocean'],
      ],
      [[], { ...json.sprites['terrain/ocean']!, width: 32, height: 36 }]
    );
  }

  // The isometric pixel art as it is built: all its sprites, as its PNGs have them.
  {
    const { sheet, index } = sheets['iso-pixelart']!,
      built = readPng(readFileSync(sheet)),
      json = JSON.parse(readFileSync(index, 'utf8')) as Sheet['index'],
      listed = [
        ...isoPixelArtJson.assets.required,
        ...isoPixelArtJson.assets.optional,
      ],
      pack = join(
        process.cwd(),
        'node_modules/@civ-clone/civ1-tileset-pixelart/pack-iso'
      );

    expect(
      'the isometric pixel art is built into dist/sets beside the others, named by its hash, every sprite it requires indexed',
      [
        /^dist\/sets\/iso-pixelart\.[0-9a-f]{12}\.png$/.test(sheet),
        index === sheet.replace(/\.png$/, '.json'),
        Object.keys(json.sprites).sort(),
        isoPixelArtJson.assets.required.filter(
          (name) => json.sprites[name] === undefined
        ),
      ],
      [true, true, [...listed].sort(), []]
    );
    expect(
      'and each is in the sheet as its own PNG has it, a diamond tile 64 × 32 and a unit 64 × 48',
      [
        listed.filter((name) => {
          const { x, y, width, height } = json.sprites[name]!;

          return !crop(built, x, y, width, height).data.equals(
            readPng(readFileSync(join(pack, `${name}.png`))).data
          );
        }),
        json.sprites['terrain/ocean'],
        json.sprites['units/settlers'],
      ],
      [
        [],
        { ...json.sprites['terrain/ocean']!, width: 64, height: 32 },
        { ...json.sprites['units/settlers']!, width: 64, height: 48 },
      ]
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
    'the hexagonal pixel art is registered hosted too, with its licence, from its own descriptor, on the hex grid',
    [
      hexPixelArt.id,
      hexPixelArt.grid,
      hexPixelArt.source,
      hexPixelArt.licence,
      hexPixelArt.storage.prefix,
      hexPixelArt.tile,
      hexPixelArt.geometry.rowStep,
      hexPixelArt.geometry.oddRowShift,
    ],
    [
      'hex-pixelart',
      'hex-odd-r',
      'hosted',
      {
        name: 'MIT',
        url: 'https://github.com/civ-clone/civ1-tileset-pixelart/blob/main/LICENSE',
      },
      './assets/hex-pixelart/',
      { width: 32, height: 36 },
      27,
      16,
    ]
  );
  expect(
    'it passes the validator as it ships, and has every sprite the interface needs, by its own name for it',
    [
      thrown(() =>
        validateDescriptor({ ...hexPixelArtJson, source: 'hosted' })
      ),
      requiredInterfaceNames.filter(
        (name) =>
          !hexPixelArt.assets.required.some(
            (sprite) =>
              spriteKey(hexPixelArt, sprite) ===
              interfaceSpriteKey(name, hexPixelArt)
          )
      ),
    ],
    [null, []]
  );
  expect(
    'its cities are drawn in styles, with the rim an overlay in its own key colours',
    [
      hexPixelArt.cities.mode,
      hexPixelArt.cities.colouring,
      spriteKey(hexPixelArt, 'map/city_rim'),
    ],
    [
      'styles',
      {
        mode: 'overlay',
        sprite: 'map/city_rim',
        keys: ['#60E064', '#2C7800'],
        anchor: { x: 0, y: 0 },
      },
      './assets/hex-pixelart/map/city_rim.png',
    ]
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

  // The build's PNG reader and writer checked by what they didn't make (#1114): a browser's PNG, and rows filtered
  //  every way a PNG can be, read back by `readPng`; and the built sheets' rows read here, without it.
  {
    // A pattern of colours, with some pixels clear, as the browser's PNG below holds it.
    const pattern = (width: number, height: number): Buffer => {
        const data = Buffer.alloc(width * height * 4);

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 4;

            if ((x + y) % 7 !== 0) {
              data[at] = (x * 37 + y * 5) % 256;
              data[at + 1] = (y * 53 + x * 3) % 256;
              data[at + 2] = (x * y * 11) % 256;
              data[at + 3] = 255;
            }
          }
        }

        return data;
      },
      // Chrome's `canvas.toDataURL('image/png')` of `pattern(16, 8)`.
      browserPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAABQElEQVR4AWyRwUcEYRjG33czKZvSHhKx2dRuVJcYe4ytw9pMh07baakOSxSpiCVqDmkjEWVJidWQ0iliiO1QW39BpK10iOhU57fnM9b4MsNzmPm97298zxciPH0NJJlGkoVmkr0Wkus2kpcICRD1d5JYXSSLUZL9GInbS/KW8NjAEEnIMEkMM0yG2YHEkEEkST3fxE0ZCyyL9xlkHllFbOp+Ig7nSmBlUgJ81AUpt8qfBRsDFpguGDkt8NduFKwEFiCY3nL4/qKMgRQGdEFuuZUfb7fBdsACBOvZQ3ZeLzGQxIAuWBu94rPfDzAbLEBwEnd4M6L+7HVgmL7gqH2Ji4k4lr0ODPOfoPJT5fyYOrNfYl1wU0vz3NQklv0S6wL34Y5D7xXi9IpqW78FJaidD/N4MY9l/RaU4PlglieON+QPAAD///9+3ZsAAAAGSURBVAMA19p/4fJV7X8AAAAASUVORK5CYII=',
        'base64'
      ),
      // A PNG of `data` whose row y is filtered with filter y % 5: none, Sub, Up, Average and Paeth, as the PNG
      //  specification sets them out.
      filteredPng = (width: number, height: number, data: Buffer): Buffer => {
        const stride = width * 4,
          raw = Buffer.alloc((stride + 1) * height),
          at = (x: number, y: number): number =>
            x < 0 || y < 0 ? 0 : data[y * stride + x]!,
          chunk = (type: string, body: Buffer): Buffer => {
            const length = Buffer.alloc(4),
              crc = Buffer.alloc(4),
              typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);

            length.writeUInt32BE(body.length);
            crc.writeUInt32BE(crc32(typed));

            return Buffer.concat([length, typed, crc]);
          },
          header = Buffer.alloc(13);

        for (let y = 0; y < height; y++) {
          const filter = y % 5;

          raw[y * (stride + 1)] = filter;

          for (let x = 0; x < stride; x++) {
            const value = at(x, y),
              a = at(x - 4, y),
              b = at(x, y - 1),
              c = at(x - 4, y - 1),
              p = a + b - c,
              [pa, pb, pc] = [a, b, c].map((near) => Math.abs(p - near)),
              predicted = [
                0,
                a,
                b,
                (a + b) >> 1,
                pa! <= pb! && pa! <= pc! ? a : pb! <= pc! ? b : c,
              ][filter]!;

            raw[y * (stride + 1) + 1 + x] = (value - predicted) & 0xff;
          }
        }

        header.writeUInt32BE(width, 0);
        header.writeUInt32BE(height, 4);
        header[8] = 8;
        header[9] = 6;

        return Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          chunk('IHDR', header),
          chunk('IDAT', deflateSync(raw)),
          chunk('IEND', Buffer.alloc(0)),
        ]);
      },
      // The pixels of a PNG whose rows are all unfiltered, as `writePng` writes them, read without `readPng`: its
      //  IDAT inflated, and each row's filter byte dropped. Null for a row with another filter.
      unfiltered = (png: Buffer): Pixels | null => {
        const width = png.readUInt32BE(16),
          height = png.readUInt32BE(20),
          stride = width * 4,
          idat: Buffer[] = [];

        for (let at = 8; at < png.length; ) {
          const length = png.readUInt32BE(at);

          if (png.toString('ascii', at + 4, at + 8) === 'IDAT') {
            idat.push(png.subarray(at + 8, at + 8 + length));
          }

          at += length + 12;
        }

        const raw = inflateSync(Buffer.concat(idat)),
          data = Buffer.alloc(stride * height);

        for (let y = 0; y < height; y++) {
          if (raw[y * (stride + 1)] !== 0) {
            return null;
          }

          raw.copy(
            data,
            y * stride,
            y * (stride + 1) + 1,
            (y + 1) * (stride + 1)
          );
        }

        return { width, height, data };
      },
      big = pattern(23, 11);

    expect(
      "a browser's PNG, and one with rows filtered each of the five ways, read as they were drawn",
      [
        readPng(browserPng).data.equals(pattern(16, 8)),
        readPng(filteredPng(23, 11, big)).data.equals(big),
      ],
      [true, true]
    );
    expect(
      'the built sheets, read without the reader that built them, are the pixels it reads',
      Object.values(sheets).map(({ sheet }) => {
        const png = readFileSync(sheet),
          read = unfiltered(png);

        return read !== null && read.data.equals(readPng(png).data);
      }),
      [true, true, true]
    );
  }

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

          // The same request hung, through the set's own load: said to be the fetch, not the decode (#1114).
          (globalThis as any).fetch = () => new Promise(() => {});

          const unfetched = await loadHosted(
            fixturePack,
            fixturePack.hosted!,
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

          // A sheet decoded, and a sprite cut from it that never is.
          (globalThis as any).createImageBitmap = (source: unknown) =>
            source instanceof Blob ? decoding(source) : new Promise(() => {});

          const uncut = await loadHosted(
            fixturePack,
            fixturePack.hosted!,
            20
          ).then(
            () => null,
            (error: Error) => error.message
          );

          (globalThis as any).createImageBitmap = decoding;

          return [hung, stalled, unfetched, undecoded, uncut];
        })(),
      ]),
      [
        "sets/gone.png couldn't be fetched (404).",
        "sets/fixture.json is not the other set's index.",
        [
          "sets/fixture.png didn't come within 5 ms.",
          "sets/fixture.json didn't come within 5 ms.",
          "The fixture set's sheet didn't come within 5 ms: it was still being fetched.",
          "The fixture set's sheet didn't come within 20 ms: it was still being decoded.",
          "The fixture set's sheet didn't come within 20 ms: it was still being cut up.",
        ],
      ]
    );

    // What comes in time leaves no timer behind (#1114): a timer left would abort, or reject, once nothing waits.
    const setTimer = globalThis.setTimeout,
      clearTimer = globalThis.clearTimeout,
      pending = new Set<unknown>();

    (globalThis as any).setTimeout = (
      ...args: Parameters<typeof setTimeout>
    ) => {
      const timer = setTimer(...args);

      pending.add(timer);

      return timer;
    };
    (globalThis as any).clearTimeout = (
      timer: ReturnType<typeof setTimeout>
    ) => {
      pending.delete(timer);
      clearTimer(timer);
    };

    const fetchedInTime = await fetchHosted('sets/fixture.json', (response) =>
        response.json()
      ).then(() => pending.size),
      loadedInTime = await loadHosted(fixturePack, fixturePack.hosted!).then(
        (sprites) => [sprites.size, pending.size]
      );

    globalThis.setTimeout = setTimer;
    globalThis.clearTimeout = clearTimer;

    expect(
      "a sheet or index that comes in time clears the timer that would have given up on it, and the decode's",
      [fetchedInTime, loadedInTime],
      [0, [3, 0]]
    );
  }

  // A sheet decoded as an `<img>`, as a background tab's is (#1114): each sprite cut onto a canvas of its own size.
  {
    const image = (document as unknown as Document).createElement('img'),
      drawn: unknown[][] = [],
      getContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = function () {
      return { drawImage: (...args: unknown[]) => drawn.push(args) } as any;
    } as any;

    const cut = (await cutSprite(image, {
      x: 4,
      y: 2,
      width: 3,
      height: 5,
    })) as HTMLCanvasElement;

    HTMLCanvasElement.prototype.getContext = getContext;

    expect(
      'a sprite cut from an <img> is a canvas its size, drawn from the sheet where the index says, with no bitmap made',
      [
        cut instanceof HTMLCanvasElement,
        cut.width,
        cut.height,
        drawn.map(([source, ...rest]) => [source === image, ...rest]),
      ],
      [true, 3, 5, [[true, 4, 2, 3, 5, 0, 0, 3, 5]]]
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
      [
        ['civ1', 'civ1-pixelart', 'hex-pixelart', 'iso-pixelart'],
        [],
        'civ1',
        'civ1',
        false,
      ]
    );
    expect(
      "the worker is asked for games of another kind, with every set here, as the isometric pixel art draws Civ2's rules",
      [mayOfferOtherGames(), presentTilesets()],
      [true, ['civ1', 'civ1-pixelart', 'hex-pixelart', 'iso-pixelart']]
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
    await ensureMapArt('hex-odd-r', store);

    const hexSprite = (name: string): number[] => {
      const { width, height } = getPreloadedImage(
        name,
        hexPixelArt
      ) as unknown as Pixels;

      return [width, height];
    };

    expect(
      'a game on the hex grid is drawn with the hexagonal pixel art, its sheet fetched first, and its sprites there by their keys',
      [
        mapTileset('hex-odd-r').id,
        fetched,
        store.hostedLoaded(hexPixelArt),
        hexSprite('terrain/grassland_ne-e-se-sw-w-nw'),
        hexSprite('terrain/coast_nw_101'),
        hexSprite('map/city_rim'),
      ],
      [
        'hex-pixelart',
        [sheets['hex-pixelart']!.sheet, sheets['hex-pixelart']!.index],
        true,
        [32, 36],
        [32, 36],
        [32, 36],
      ]
    );

    fetched.length = 0;

    expect(
      'and a chosen hosted set is fetched as the page starts',
      [ids(await installPacks(new AssetStore(civ1))), fetched.length],
      [['civ1', 'civ1-pixelart', 'hex-pixelart', 'iso-pixelart'], 2]
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
      [
        ['civ1-pixelart', 'hex-pixelart', 'iso-pixelart'],
        'civ1-pixelart',
        'civ1-pixelart',
        'civ1-pixelart',
        2,
      ]
    );

    keys = civ1Keys;
    offline = true;
    logged.length = 0;

    expect(
      "offline with Civ1's art: nothing is fetched, so nothing fails, and the pixel art is still declared",
      [ids(await installPacks(new AssetStore(civ1))), logged],
      [['civ1', 'civ1-pixelart', 'hex-pixelart', 'iso-pixelart'], []]
    );

    keys = [];
    fetched.length = 0;

    // The hexagonal pixel art has interface art too, and its grid is offered (#1122), so it's fallen back on for the
    //  interface next, and tried, and can't be fetched either.
    expect(
      "offline with nothing imported: the pixel art's sheet can't be fetched, nor the hexagonal one's, tried next, which is said, and neither is installed",
      [
        ids(await installPacks(new AssetStore(civ1))),
        logged.includes("Could not load the civ1-pixelart set's sheet."),
        logged.includes("Could not load the hex-pixelart set's sheet."),
        fetched.filter((url) => url.includes('hex-pixelart')).length,
        interfaceArt().id,
      ],
      [[], true, true, 2, 'civ1']
    );

    offline = false;

    // A store that opens but can't be read says nothing of Civ1's sprites: it stays installed when they were read all
    //  the same (`tests/ui/noImport.ts`), and here, where none were, the pixel art stands in rather than a game drawn
    //  blank (#1063).
    const storedKeys = Store.prototype.keys,
      storedGet = Store.prototype.get,
      opens = Store.prototype.opens;

    Store.prototype.opens = async () => true;
    Store.prototype.keys = async () => {
      throw new Error('The database connection is closing.');
    };
    fetched.length = 0;

    expect(
      "a store that opens but can't be read, with none of Civ1's sprites read: the pixel art stands in, fetched as the page starts",
      [ids(await installPacks(new AssetStore(civ1))), fetched],
      [
        ['civ1-pixelart', 'hex-pixelart', 'iso-pixelart'],
        [sheets['civ1-pixelart']!.sheet, sheets['civ1-pixelart']!.index],
      ]
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
        ['civ1-pixelart', 'hex-pixelart', 'iso-pixelart'],
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

    // The start of a game waits for its map's art, through the page's preparation. A chosen set whose sheet can't be
    //  fetched is passed over for another ready for the grid, which is said (#1141).
    provideStartPreparation(prepareMapArt);
    chooseMapTileset('square', 'civ1-pixelart');
    offline = true;
    logged.length = 0;

    const fellBack = await prepareStart('square'),
      fellBackSaid = (document as unknown as Document).body.textContent ?? '';

    expect(
      "a game whose chosen art can't be fetched starts with Civ1's, ready for its grid, and says why, keeping the choice",
      [
        fellBack,
        mapTileset('square').id,
        options.get(mapTilesetOption('square')),
        loadFailed(pixelArt),
        fellBackSaid.includes(
          'Pixel art couldn’t be loaded (Failed to fetch'
        ) && fellBackSaid.includes('so the map is drawn with Civilization'),
      ],
      [true, 'civ1', 'civ1-pixelart', true, true]
    );

    // A saved game loading (bootstrap's load path) does the same: drawn with Civ1's, which is said (#1114, #1141).
    const openDialogs = (): number =>
        (document as unknown as Document).querySelectorAll('dialog[open]')
          .length,
      dialogsBefore = openDialogs(),
      squareSave = {
        entities: [{ type: 'World', state: { _topologyId: 'square' } }],
      },
      loading = await prepareSavedMapArt({} as any, squareSave);

    expect(
      "a save loading whose chosen art can't be fetched loads with Civ1's, saying why",
      [
        loading.tileset.id,
        loading.failed.map(({ tileset }) => tileset.id),
        openDialogs() - dialogsBefore,
      ],
      ['civ1', ['civ1-pixelart'], 1]
    );

    // A choice whose sheet failed as the page started, and was left uninstalled, is tried again as a game starts:
    //  said while it still fails, and installed again and drawn with once it loads.
    keys = civ1Keys;

    const startUp = new AssetStore(civ1);

    await installPacks(startUp);

    const leftOut = !ids(installedTilesets()).includes('civ1-pixelart'),
      stillFailing = await ensureMapArt('square', startUp);

    offline = false;

    const loadsNow = await ensureMapArt('square', startUp);

    const reinstalled = ids(installedTilesets()).includes('civ1-pixelart');

    keys = [];

    // Offline as the page starts with nothing imported, it fails again as the game starts: nothing to draw with.
    offline = true;

    const bare = new AssetStore(civ1);

    await installPacks(bare);

    const nothingToDraw = await ensureMapArt('square', bare).then(
      () => 'drawn',
      (error: Error) => error.message
    );

    offline = false;

    expect(
      'offline from the start with nothing imported, a game on the grid is refused, saying why',
      nothingToDraw,
      "Pixel art (civ1-pixelart) couldn't be loaded: Failed to fetch"
    );

    expect(
      'a choice that failed as the page started is tried again as a game starts: said while it fails, drawn with once it loads',
      [
        leftOut,
        stillFailing.tileset.id,
        stillFailing.failed.map(({ tileset }) => tileset.id),
        loadsNow.tileset.id,
        loadsNow.failed,
        reinstalled,
      ],
      [true, 'civ1', ['civ1-pixelart'], 'civ1-pixelart', [], true]
    );

    // With nothing else for the grid (nothing imported), the start stops, saying why.
    (document as unknown as Document)
      .querySelectorAll('dialog[open]')
      .forEach((dialog) => dialog.removeAttribute('open'));
    offline = false;
    await installPacks(new AssetStore(civ1));
    offline = true;
    logged.length = 0;

    const refused = await prepareStart('square'),
      loadRefused = await prepareSavedMapArt({} as any, {
        entities: [{ type: 'World', state: { _topologyId: 'square' } }],
      }).then(
        () => null,
        (error: Error) => error.message
      );

    offline = false;
    fetched.length = 0;

    expect(
      "a game whose art can't be fetched, with no other art ready for its grid, doesn't start, and the player is told why",
      [
        ids(installedTilesets()).includes('civ1'),
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
      [false, false, true, true]
    );
    expect(
      'and a save loading on it stops too, saying why, for the page to say',
      loadRefused,
      "Pixel art (civ1-pixelart) couldn't be loaded: Failed to fetch"
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

    // New Game's wait through the page's own preparation (#1114), not a stand-in: the hex grid's art, not yet fetched,
    //  is fetched first, and nothing is sent until it has come.
    {
      const sent: string[] = [],
        fetching = (globalThis as any).fetch,
        held: (() => void)[] = [],
        transport = {
          request: async () => ({}),
          send: (channel: string) => sent.push(channel),
        } as any;

      (globalThis as any).fetch = (url: string) =>
        new Promise<void>((resolve) => held.push(resolve)).then(() =>
          fetching(url)
        );
      fetched.length = 0;

      (document as unknown as Document)
        .querySelectorAll('dialog[open]')
        .forEach((dialog) => dialog.removeAttribute('open'));
      askPlayerCount(transport, { topologyId: 'hex-odd-r' }, [2, 3], 2);
      choose('2');
      await settle();

      const waiting = [...sent];

      held.forEach((release) => release());

      for (let tries = 0; tries < 100 && sent.length === 0; tries++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      (globalThis as any).fetch = fetching;

      expect(
        "New Game on a grid whose art isn't fetched yet waits for it, through the page's preparation, then starts",
        [waiting, fetched, sent],
        [
          [],
          [sheets['hex-pixelart']!.sheet, sheets['hex-pixelart']!.index],
          ['start'],
        ]
      );
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
        'hex-pixelart': { complete: true, metadata: null },
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
        ['civ1', 'civ1-pixelart', 'hex-pixelart', 'iso-pixelart', 'hosted-iso'],
        ['civ1', 'civ1-pixelart', 'hex-pixelart', 'iso-pixelart', 'hosted-iso'],
        ['civ1', 'hex-pixelart', 'iso-pixelart'],
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
      "the hexagonal pixel art's city rim keeps its own keys, and nothing of its is read from storage",
      [
        keysOf(installed.find(({ id }) => id === 'hex-pixelart')!),
        asked.includes(metadataKey(hexPixelArt)),
      ],
      [['#60E064', '#2C7800'], false]
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

    // The isometric pixel art's sheet couldn't be fetched earlier in this suite (offline), so it's passed over (#1141):
    //  the fixture's hosted-iso is the isometric set that ships, here.
    expect(
      'without one imported, the one that ships, of those whose sheet has loaded',
      [
        mapTileset('square').id,
        sheetFailure('iso-pixelart') !== null,
        mapTileset('staggered-iso').id,
      ],
      ['civ1-pixelart', true, 'hosted-iso']
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

    // A save is drawn with the art its rule set names too (#1114), as the worker says which that is: the first of the
    //  set's own art it is asked with. Asked with the sets here first; when none of the set's art is here, again with
    //  every pack that can be imported (here Civ1's, Civ2's and the imported square set above), to say which. The
    //  worker here draws Civ2's rules with Civ2's art, or else the fixture's hosted-iso, standing in for the isometric
    //  pixel art, whose sheet couldn't be fetched in this suite.
    {
      const asked: unknown[] = [],
        worker = (civ2: string[]) =>
          ({
            request: async (request: { args: () => unknown[] }) => {
              const tilesets = request.args()[0] as string[];

              asked.push(tilesets);

              return {
                sets: [
                  { id: 'civ1', tileset: null },
                  {
                    id: 'civ2',
                    tileset: civ2.find((id) => tilesets.includes(id)) ?? null,
                  },
                ].filter(
                  ({ id, tileset }) => id === 'civ1' || tileset !== null
                ),
                default: 'civ1',
                chosen: null,
              };
            },
          } as any),
        transport = worker(['civ2', 'hosted-iso']),
        here = presentTilesets();

      await followSavedRuleSet(transport, 'civ2');

      const civ2Save = mapTileset('staggered-iso').id;

      await followSavedRuleSet(transport, 'civ1');

      const civ1Save = mapTileset('staggered-iso').id;

      await followSavedRuleSet(transport, undefined);

      expect(
        "a save with Civ2's rules is drawn with its art; one with rules that name none, or none, with the choice; each asked once, with the sets here",
        [civ2Save, civ1Save, mapTileset('staggered-iso').id, asked],
        ['civ2', 'hosted-iso', 'hosted-iso', [here, here]]
      );

      // Without Civ2's art, a save with Civ2's rules is drawn with civ.one's own isometric art in its place.
      installTilesets({ civ2: { complete: false, metadata: null } });
      asked.length = 0;

      await followSavedRuleSet(transport, 'civ2');

      expect(
        "without Civ2's art, a save with Civ2's rules is drawn with the isometric art that ships, asking once",
        [mapTileset('staggered-iso').id, asked.length],
        ['hosted-iso', 1]
      );

      // And with none of its art here, as when the isometric art that ships couldn't be loaded either, it's refused,
      //  naming the art to import, as the worker says when asked again with every pack that can be imported. One with
      //  Civ1's rules is asked once, and drawn as the player chose.
      installTilesets({
        civ2: { complete: false, metadata: null },
        'hosted-iso': { complete: false, metadata: null },
      });
      asked.length = 0;

      const without = presentTilesets(),
        refused = await followSavedRuleSet(transport, 'civ2').then(
          () => '',
          (error: Error) => error.message
        );

      installTilesets({ civ2: { complete: false, metadata: null } });

      await followSavedRuleSet(transport, 'civ1');

      expect(
        "with none of its art here, a save with Civ2's rules is refused, naming Civ2's art, after asking with the sets here and then every pack that can be imported; one with Civ1's is asked once and drawn as the player chose",
        [
          without.includes('hosted-iso'),
          /hasn’t been imported/.test(refused),
          refused.includes(civ2Json.name),
          mapTileset('staggered-iso').id,
          asked,
        ],
        [
          false,
          true,
          true,
          'hosted-iso',
          [without, ['civ1', 'civ2', 'imported-square'], presentTilesets()],
        ]
      );

      installTilesets(civ2Installed);
    }

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
