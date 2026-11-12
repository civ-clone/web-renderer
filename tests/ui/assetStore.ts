// The asset store loads the sprites of the tileset in use, and only those, decoded before anything is drawn from them
//  (#730): the map's lookups find each one there, or the placeholder, reported once. A sprite that will not decode is
//  left out rather than holding the game up, and one imported before #730, as a data URI, is kept as its PNG from then
//  on. The interface's URL for a sprite at a size is made once. Another pack, such as the map's (#97), is loaded beside
//  the interface's, with what its import said about its sprites, and is complete or not on its own.

// Must stay first: it gives the store a `document`, and an `indexedDB` that never opens.
import './lib/dom';
import './lib/interfaces';
import './lib/artPacks';

import { AssetStore, decodeSprite } from '@civ-clone/ui-assets/AssetStore';
import { Store } from '@civ-clone/ui-platform/Store';
import currentTileset, {
  bundledTilesets,
  installTilesets,
  installedTilesets,
} from '@civ-clone/ui-assets/lib/tilesets';
import installPacks from '@civ-clone/ui-assets/lib/installPacks';
import spriteAnchors, {
  clearSpriteAnchors,
} from '@civ-clone/ui-assets/lib/spriteAnchors';
import getPreloadedImage, {
  onPreloadedImagesChanged,
} from '@civ-clone/ui-assets/lib/getPreloadedImage';
import { AssetPack, metadataKey } from '@civ-clone/ui-assets/lib/packs';
import {
  TilesetDescriptor,
  spriteKey,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

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
    "only the tileset's own sprites are read, every one it lists, and no record of anchors, which Civ1's import doesn't keep",
    [
      asked.length,
      asked.includes(metadataKey(tileset)),
      asked.every((name) => name.startsWith(tileset.storage.prefix)),
      asked.includes('./assets/other/city/food.png'),
    ],
    [
      tileset.assets.required.length + tileset.assets.optional.length,
      false,
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

  // Two packs (#97): the interface's tileset and another, each keeping its sprites under its own prefix. Both are drawn
  //  from, the other's with what its import said about its sprites, and each is complete or not on its own.
  {
    const other: AssetPack = {
        id: 'other',
        storage: { prefix: './assets/other/', ext: '.png' },
        assets: {
          required: ['city/food', 'city/wall'],
          optional: ['city/extra'],
          ui: [],
        },
        metadata: true,
      },
      // `getPreloadedImage` looks a sprite up by its pack's storage alone.
      otherTileset = other as unknown as TilesetDescriptor,
      anchors = { 'city/food': { flag: { x: 3, y: 4 } } },
      keys = Store.prototype.keys;

    records.set(metadataKey(other), {
      name: metadataKey(other),
      blob: new Blob([JSON.stringify({ anchors, colours: {} })], {
        type: 'application/json',
      }),
    });
    Store.prototype.keys = async () => [...records.keys()];

    const both = new AssetStore(tileset, [other, other]);

    await both.load();

    expect(
      "two packs: the interface's first, and each only once",
      both.packs.map(({ id }) => id),
      [tileset.id, 'other']
    );
    expect(
      "two packs: each pack's sprite of the same name is drawn from its own",
      [
        (getPreloadedImage('city/food') as any).text,
        (getPreloadedImage('city/food', otherTileset) as any).text,
      ],
      ['newer', 'other']
    );
    expect(
      "two packs: the other's import says where its sprites' anchors are; the interface's said nothing",
      [both.metadata(other), both.metadata(tileset)],
      [{ anchors, colours: {} }, null]
    );
    expect(
      'two packs: each is complete or not on its own, the interface by default',
      [
        await both.hasAllAssets(),
        await both.hasAllAssets(other),
        await both.missingAssets(other),
        await both.importedCount(other),
        (await both.missingAssets()).length,
      ],
      [
        false,
        false,
        ['./assets/other/city/wall.png'],
        1,
        tileset.assets.required.filter((name) => !records.has(key(name)))
          .length,
      ]
    );

    records.set('./assets/other/city/wall.png', {
      name: './assets/other/city/wall.png',
      blob: png('wall'),
    });

    expect(
      'two packs: one is complete once its required sprites are in',
      await both.hasAllAssets(other),
      true
    );

    const added = new AssetStore(tileset);

    added.addPack(other);
    added.addPack(other);
    await added.load();

    expect(
      'a pack added later is loaded from the next load on, once',
      [
        added.packs.map(({ id }) => id),
        (getPreloadedImage('city/wall', otherTileset) as any).text,
      ],
      [[tileset.id, 'other'], 'wall']
    );

    // A record of anchors that can't be read: the sprites are still drawn, without it, and an import is told so.
    records.set(metadataKey(other), {
      name: metadataKey(other),
      blob: new Blob(['{"anchors":'], { type: 'application/json' }),
    });
    logged.length = 0;
    await added.load();

    expect(
      "a record of anchors that can't be read: the pack is drawn without it, and the load says so",
      [
        added.metadata(other),
        (getPreloadedImage('city/wall', otherTileset) as any).text,
        logged.includes(`Could not read ${metadataKey(other)}.`),
      ],
      [null, 'wall', true]
    );
    expect(
      "a record of anchors that can't be read is refused when it's asked for, not taken for nothing",
      await added.readMetadata(other).then(
        () => 'resolved',
        () => 'rejected'
      ),
      'rejected'
    );

    records.set(metadataKey(other), {
      name: metadataKey(other),
      blob: new Blob(['{"anchors":{}}'], { type: 'application/json' }),
    });

    expect(
      'nor is one that is not a record of anchors and colours',
      await added.readMetadata(other).then(
        () => 'resolved',
        () => 'rejected'
      ),
      'rejected'
    );

    Store.prototype.keys = keys;
  }

  // Installing the bundled packs (#97): Civ2's sprites are loaded beside Civ1's, its anchors set from what its import
  //  said, and it is installed, with its flag's colours, only once every sprite it requires is in.
  {
    const keys = Store.prototype.keys,
      civ2 = bundledTilesets().find(({ id }) => id === 'civ2')!,
      civ2Key = (name: string): string => spriteKey(civ2, name),
      anchors = { 'units/settlers': { shield: { x: 12, y: 12 } } },
      colours = {
        flag: [{ primary: [243, 0, 0], secondary: [167, 0, 0] }],
      };

    records.set(metadataKey(civ2), {
      name: metadataKey(civ2),
      blob: new Blob([JSON.stringify({ anchors, colours })], {
        type: 'application/json',
      }),
    });
    civ2.assets.required
      .slice(1)
      .forEach((name) =>
        records.set(civ2Key(name), { name: civ2Key(name), blob: png(name) })
      );
    Store.prototype.keys = async () => [...records.keys()];
    clearSpriteAnchors();

    const packs = new AssetStore(tileset),
      partly = await installPacks(packs);

    expect(
      "Civ2's pack: loaded beside Civ1's, with its import's record, and its anchors set, but one sprite short it isn't installed",
      [
        packs.packs.map(({ id, metadata }) => [id, metadata ?? false]),
        packs.metadata(civ2),
        spriteAnchors(civ2),
        partly.map(({ id }) => id),
      ],
      [
        [
          [tileset.id, false],
          ['civ2', true],
        ],
        { anchors, colours },
        anchors,
        [tileset.id],
      ]
    );

    const first = civ2.assets.required[0]!;

    records.set(civ2Key(first), { name: civ2Key(first), blob: png(first) });

    const whole = await installPacks(packs);

    expect(
      "Civ2's pack: with every sprite in, it is installed, its flag recoloured by its import's own red flag's colours",
      [
        whole.map(({ id }) => id),
        installedTilesets().map(({ id }) => id),
        (whole[1]?.cities.colouring as { keys: string[] }).keys,
      ],
      [
        [tileset.id, 'civ2'],
        [tileset.id, 'civ2'],
        ['#f30000', '#a70000'],
      ]
    );

    records.delete(metadataKey(civ2));

    expect(
      "Civ2's pack: without its import's record of anchors, it isn't installed",
      (await installPacks(packs)).map(({ id }) => id),
      [tileset.id]
    );

    // An import whose record can't be drawn from, or a store that fails: the pack isn't installed, and the game still
    //  starts with Civ1's, rather than not at all.
    const errors = logged.length;

    records.set(metadataKey(civ2), {
      name: metadataKey(civ2),
      blob: new Blob(
        [JSON.stringify({ anchors, colours: { flag: [{ primary: 'red' }] } })],
        { type: 'application/json' }
      ),
    });

    const corrupt = await installPacks(packs).then(
        (installed) => installed.map(({ id }) => id),
        () => 'rejected'
      ),
      failing = new AssetStore(tileset);

    failing.load = () => Promise.reject(new Error('The store failed.'));

    const failed = await installPacks(failing).then(
      (installed) => installed.map(({ id }) => id),
      () => 'rejected'
    );

    expect(
      "Civ2's pack: a flag whose colours can't be read, or a store that fails, leaves it uninstalled, said, and Civ1's still installed",
      [corrupt, failed, logged.length > errors],
      [[tileset.id], [tileset.id], true]
    );

    records.delete(metadataKey(civ2));
    civ2.assets.required.forEach((name) => records.delete(civ2Key(name)));
    clearSpriteAnchors();
    installTilesets({});
    Store.prototype.keys = keys;
  }

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
  expect(
    "a URL already made is there to draw at once (#64), at that size only, and not one that wasn't kept",
    [
      store.cachedURL(key('city/food'), 14),
      store.cachedURL(key('city/food'), 28),
      store.cachedURL(key('city/food'), 36),
      store.cachedURL(key('city/trade'), 14),
    ],
    ['url 1', 'url 2', null, null]
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
