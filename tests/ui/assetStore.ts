// The asset store loads the sprites of the tileset in use, and only those, decoded before anything is drawn from them
//  (#730): the map's lookups find each one there, or the placeholder, reported once. A sprite that will not decode is
//  left out rather than holding the game up, and one imported before #730, as a data URI, is kept as its PNG from then
//  on. The interface's URL for a sprite at a size is made once.

// Must stay first: it gives the store a `document`, and an `indexedDB` that never opens.
import './lib/dom';

import { AssetStore, decodeSprite } from '../../src/js/UI/AssetStore';
import { Store } from '../../src/js/UI/Store';
import currentTileset from '../../src/js/UI/lib/tilesets';
import getPreloadedImage, {
  onPreloadedImagesChanged,
} from '../../src/js/UI/lib/getPreloadedImage';
import { spriteKey } from '../../src/js/UI/tilesets/TilesetDescriptor';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL asset-store: stopped before its checks\n');
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

const tileset = currentTileset(),
  key = (name: string): string => spriteKey(tileset, name),
  png = (text: string): Blob => new Blob([text], { type: 'image/png' }),
  // The records in IndexedDB: Civ1's, one from before #730 as a data URI, one that will not decode, and another pack's.
  records = new Map<string, any>([
    [key('city/food'), { name: key('city/food'), blob: png('food') }],
    [
      key('city/gold'),
      {
        name: key('city/gold'),
        uri: `data:image/png;base64,${Buffer.from('gold').toString('base64')}`,
      },
    ],
    [key('city/trade'), { name: key('city/trade'), blob: png('broken') }],
    [
      './assets/other/city/food.png',
      { name: './assets/other/city/food.png', blob: png('other') },
    ],
  ]),
  asked: string[] = [],
  written: any[] = [],
  logged: string[] = [];

Store.prototype.get = async function (name: any) {
  asked.push(name);

  return records.get(name);
};
Store.prototype.setAll = async function (stored: any[]) {
  written.push(...stored);
};

// A bitmap is the PNG's text and its size; "broken" will not decode.
(globalThis as any).createImageBitmap = async (blob: Blob) => {
  const text = await blob.text();

  if (text === 'broken') {
    throw new Error('The source image could not be decoded.');
  }

  return { text, width: 7, height: 7 };
};

console.error = (message: unknown) => logged.push(String(message));

let changed = 0;

onPreloadedImagesChanged(() => changed++);

(async () => {
  const store = new AssetStore(tileset),
    loading = store.load();

  expect('ready is the load in progress', store.ready === loading, true);

  await store.ready;

  expect(
    "only the tileset's own sprites are read, every one it lists",
    [
      asked.length,
      asked.every((name) => name.startsWith(tileset.storage.prefix)),
      asked.includes('./assets/other/city/food.png'),
    ],
    [
      tileset.assets.required.length + tileset.assets.optional.length,
      true,
      false,
    ]
  );
  expect(
    'the sprites are drawn from their bitmaps, the data URI one too',
    ['city/food', 'city/gold'].map(
      (name) => (getPreloadedImage(name) as any).text
    ),
    ['food', 'gold']
  );
  expect(
    'a sprite imported as a data URI is written back as its PNG, without the URI',
    await Promise.all(
      written.map(async ({ name, blob, uri }) => [
        name,
        blob instanceof Blob ? await blob.text() : null,
        uri ?? null,
      ])
    ),
    [[key('city/gold'), 'gold', null]]
  );
  expect(
    'one that will not decode is left out, and the rest still load',
    [
      logged.filter((message) => message.startsWith('Could not decode')),
      (getPreloadedImage('city/trade') as any).text ?? null,
    ],
    [[`Could not decode ${key('city/trade')}.`], null]
  );

  logged.length = 0;
  getPreloadedImage('city/trade');
  getPreloadedImage('city/trade');

  expect(
    'a missing sprite is reported once, however often it is drawn',
    logged,
    []
  );
  expect('what was drawn from the last sprites is dropped', changed, 1);

  await store.load();

  expect(
    'and again on each load, which reports a missing sprite afresh',
    [
      changed,
      (getPreloadedImage('city/trade'),
      logged.filter((message) => message.startsWith('Missing image'))),
    ],
    [2, ['Missing image: city/trade.']]
  );

  // An old record that can't be read, and a store that won't take the converted ones: the rest still load.
  records.set(key('city/bulb'), {
    name: key('city/bulb'),
    uri: 'data:image/png;base64,%%%',
  });
  records.set(key('city/gold'), {
    name: key('city/gold'),
    uri: `data:image/png;base64,${Buffer.from('gold').toString('base64')}`,
  });
  logged.length = 0;

  const setAll = Store.prototype.setAll;

  Store.prototype.setAll = async () => {
    throw new Error('QuotaExceededError');
  };
  (globalThis as any).fetch = (
    (fetch) => (url: string) =>
      url.endsWith('%%%')
        ? Promise.reject(new TypeError('Bad URL'))
        : fetch(url)
  )(fetch);

  await store.load();

  Store.prototype.setAll = setAll;

  expect(
    "an old record that can't be read is left out, and converted ones the store won't take are still drawn",
    [
      (getPreloadedImage('city/gold') as any).text,
      (getPreloadedImage('city/food') as any).text,
      logged.filter((message) => /^Could not (read|store)/.test(message)),
    ],
    [
      'gold',
      'food',
      [
        `Could not read ${key('city/bulb')}.`,
        'Could not store the converted assets.',
      ],
    ]
  );

  // A store that can't be read at all: the game goes on without the sprites.
  const get = Store.prototype.get;

  Store.prototype.get = async () => {
    throw new Error('The database connection is closing.');
  };
  logged.length = 0;

  const failed = await store.load().then(
    () => 'resolved',
    () => 'rejected'
  );

  Store.prototype.get = get;

  expect(
    "a store that can't be read doesn't fail the load, it says so",
    [failed, logged],
    ['resolved', ['Could not load the assets.']]
  );

  // Two loads at once, the first slower: the later one's sprites are the ones drawn.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  Store.prototype.get = async function (name: any) {
    await held;

    return records.get(name);
  };

  const first = store.load();

  Store.prototype.get = get;
  records.set(key('city/food'), { name: key('city/food'), blob: png('newer') });

  await store.load();
  release();
  await first;

  expect(
    'of two loads at once, the later one is drawn from, however they finish',
    (getPreloadedImage('city/food') as any).text,
    'newer'
  );

  // The interface's URL for a sprite at a size, made once.
  let made = 0;

  (store as any).getShownAt = async () => ({
    toDataURL: () => `url ${++made}`,
  });

  expect(
    'a URL for a sprite at a size is made once',
    [
      await store.shownAtURL(key('city/food'), 14),
      await store.shownAtURL(key('city/food'), 14),
      await store.shownAtURL(key('city/food'), 28),
    ],
    ['url 1', 'url 1', 'url 2']
  );
  expect(
    "but not kept for a sprite that isn't loaded, so an import is used once it is",
    [
      await store.shownAtURL(key('city/trade'), 14),
      await store.shownAtURL(key('city/trade'), 14),
    ],
    ['url 3', 'url 4']
  );

  // A bitmap that doesn't come in time, as might happen in a background tab: the sprite is loaded as an <img> instead.
  const createImageBitmap = (globalThis as any).createImageBitmap,
    createElement = document.createElement.bind(document),
    images: string[] = [];

  (globalThis as any).createImageBitmap = () => new Promise(() => {});
  (document as any).createElement = (tag: string) => {
    const element = createElement(tag);

    if (tag === 'img') {
      Object.defineProperty(element, 'src', {
        set: (url: string) => {
          images.push(url);
          setTimeout(() => element.dispatchEvent(new Event('load')));
        },
      });
    }

    return element;
  };

  const late = await decodeSprite(png('late'), 10);

  (globalThis as any).createImageBitmap = createImageBitmap;
  (document as any).createElement = createElement;

  expect(
    "a sprite whose bitmap doesn't come in time is loaded as an image instead",
    [(late as HTMLElement).tagName, images.length],
    ['IMG', 1]
  );
  expect(
    'and one whose bitmap does is the bitmap',
    ((await decodeSprite(png('soon'), 10)) as any).text,
    'soon'
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL asset-store (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS asset-store (${checks} checks)\n`);
  process.exit(0);
})().catch((error) => {
  process.stderr.write(`FAIL asset-store: ${error.stack ?? error}\n`);
  process.exit(1);
});
