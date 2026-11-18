// Playing with nothing imported (#1063): civ.one's own pixel art draws the game when Civilization's isn't imported. What
//  defaulted to Civ1's art follows the map's art for the game's grid (`mapTileset`): a sprite looked up, a unit drawn
//  and its letter; the interface's art follows the theme (`interfaceArt`): the cursor and the action buttons, which fit
//  the pixel art's 32 px sprites into their 16 px picture. Windows size art by a 16 px tile, whatever is imported. A
//  square save loads without Civilization's art, and an isometric one still asks for Civilization II's. With storage
//  blocked the pixel art stands in; the art chosen for a grid is fetched before a game on it. With Civ1's imported,
//  everything is as it was.

// Must stay first: it gives the layers a canvas and a `document` to draw with.
import { fakeCanvas } from './lib/fakeCanvas';
import './lib/artPacks';
import './lib/grids';

import {
  REFERENCE_TILE_WIDTH,
  bundledTilesets,
  chooseMapTileset,
  installTilesets,
  mapTileset,
  setMapGrid,
  shownScale,
} from '@civ-clone/ui-assets/lib/tilesets';
import getPreloadedImage, {
  hasPreloadedImage,
  setSprites,
} from '@civ-clone/ui-assets/lib/getPreloadedImage';
import interfaceArt, {
  hasInstalledInterfaceArt,
  provideInterfaceArt,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import supportedTopologies, {
  isSupportedTopology,
  tilesetToImport,
} from '@civ-clone/ui-map/lib/supportedTopologies';
import renderUnit, {
  drawUnitStatus,
} from '@civ-clone/ui-assets/lib/renderUnit';
import { AssetStore, assetStore } from '@civ-clone/ui-assets/AssetStore';
import installPacks, {
  ensureMapArt,
  ensureTilesetLoaded,
  loadFailed,
} from '@civ-clone/ui-assets/lib/installPacks';
import { Store } from '@civ-clone/ui-platform/Store';
import { drawUnitActionIcon } from '@civ-clone/ui-assets/lib/unitActionIcon';
import i18next from 'i18next';
import { canLoad, canPlay, missingArt } from '@civ-clone/ui-menus/lib/playable';
import { setCursor } from '@civ-clone/ui-game/app/assets';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL noImport: stopped after ${checks} checks\n`);
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

// No translations: what's checked is which art is asked for.
i18next.init({ lng: 'en', resources: {}, initAsync: false });

// The sprites there are, noting every key a lookup asks for.
const asked: string[] = [];

class Sprites extends Map<string, CanvasImageSource> {
  override get(key: string): CanvasImageSource | undefined {
    asked.push(key);

    return super.get(key);
  }
}

const sprite = { width: 32, height: 32 } as unknown as CanvasImageSource,
  sprites = new Sprites([
    ['./assets/civ1-pixelart/units/settlers.png', sprite],
    ['./assets/units/settlers.png', sprite],
    ['./assets/civ1-pixelart/map/city.png', sprite],
    ['./assets/map/city.png', sprite],
  ]);

setSprites(sprites);

// What a lookup made by `fn` asked for, whatever `fn` did after it: a unit drawn needs more of a canvas than the
//  shim has, and its sprite is looked up first.
const lookups = (fn: () => unknown): string[] => {
  asked.length = 0;

  try {
    fn();
  } catch {
    // The lookup has been made.
  }

  return [...asked];
};

const settlers = {
  _: 'Settlers',
  busy: { _: 'Fortified' },
  improvements: [],
  player: {
    civilization: { attributes: [{ name: 'colors', value: ['#fff'] }] },
  },
} as any;

// The font a unit's letter is written in.
const statusFont = (): string | undefined => {
  const { calls, canvas } = fakeCanvas(64, 64),
    context = canvas.getContext('2d') as any;

  context.fillText = (...args: unknown[]) =>
    calls.push(['fillText', context.font, ...args]);
  drawUnitStatus(context, settlers, 0, 0, 1);

  return calls.find(([name]) => name === 'fillText')?.[1];
};

// What an action button's picture is drawn with, shown `shownAt` px across on a screen of `ratio`: its canvas's size,
//  its transforms, and where its city is drawn.
const actionIcon = (
  shownAt = 32,
  ratio = 1
): { transforms: unknown[][]; city: unknown[]; size?: number[] } => {
  const { calls, canvas } = fakeCanvas(16, 16),
    context = canvas.getContext('2d') as any;

  context.setTransform = (...args: unknown[]) =>
    calls.push(['setTransform', ...args]);
  (canvas as any).clientWidth = shownAt;
  (globalThis as any).devicePixelRatio = ratio;

  drawUnitActionIcon(canvas, [{ type: 'city', text: 'S', colours: null }]);

  return {
    transforms: calls
      .filter(([name]) => name === 'setTransform')
      .map(([, scale]) => [scale]),
    city: calls.find(([name]) => name === 'drawImage')?.slice(2) ?? [],
    ...(shownAt === 32 && ratio === 1
      ? {}
      : { size: [canvas.width, canvas.height] }),
  };
};

// The cursor the page is given: the sprite and width asked for, and whether it's set.
const cursor = async (
  loaded: boolean
): Promise<{ asked: unknown[]; cursor: string }> => {
  const calls: unknown[] = [],
    body = { style: { cursor: '' } };

  (globalThis as any).document.body = body;
  assetStore.has = async (path: string): Promise<boolean> => {
    calls.push(path);

    return loaded;
  };
  assetStore.shownAtURL = async (
    path: string,
    width: number
  ): Promise<string> => {
    calls.push([path, width]);

    return 'data:cursor';
  };

  await setCursor();

  return { asked: calls, cursor: body.style.cursor };
};

const run = async (): Promise<void> => {
  // The themes' list, as the page has it from the theme in use.
  provideInterfaceArt(() => ['civ1', 'civ1-pixelart']);
  setMapGrid('square');

  // Nothing imported: the pixel art draws everything.
  installTilesets({ civ1: { complete: false, metadata: null } });

  expect(
    "without Civilization's art, the map and the interface draw with civ.one's pixel art, and a game can be played",
    [
      mapTileset().id,
      interfaceArt().id,
      hasInstalledInterfaceArt(),
      missingArt(),
    ],
    ['civ1-pixelart', 'civ1-pixelart', true, null]
  );
  expect(
    "a sprite looked up without a tileset is the map's, the pixel art's",
    [
      lookups(() => getPreloadedImage('units/settlers')),
      getPreloadedImage('units/settlers') === sprite,
      hasPreloadedImage('units/settlers'),
    ],
    [['./assets/civ1-pixelart/units/settlers.png'], true, true]
  );
  expect(
    "a unit drawn without a tileset is drawn with the map's, the pixel art's",
    lookups(() => renderUnit(settlers)),
    ['./assets/civ1-pixelart/units/settlers.png']
  );
  expect(
    "and its letter written at the pixel art's size",
    statusFont(),
    'bold 14px sans-serif'
  );
  expect(
    "an action button fits the pixel art's 32 px sprites into its 16 px picture, its marks written at the picture's size",
    actionIcon(),
    {
      transforms: [[1], [2], [1]],
      city: [1, 1],
    }
  );
  // #1118: a 32 px sprite shrunk into the 24 px a menu shows it at, pixel by pixel, would lose a pixel in four.
  expect(
    "an action button shown smaller than the pixel art's sprites is drawn at their size, every pixel of them kept",
    [actionIcon(24), actionIcon(28)],
    [
      { transforms: [[1], [2], [1]], city: [1, 1], size: [32, 32] },
      { transforms: [[1], [2], [1]], city: [1, 1], size: [32, 32] },
    ]
  );
  expect(
    'and one shown larger, at the next whole number of them: each of their pixels two of the canvas’s',
    [actionIcon(24, 2), actionIcon(40)],
    [
      { transforms: [[2], [4], [2]], city: [1, 1], size: [64, 64] },
      { transforms: [[2], [4], [2]], city: [1, 1], size: [64, 64] },
    ]
  );
  expect(
    "the cursor is the pixel art's torch, at its cursor size",
    await cursor(true),
    {
      asked: [
        './assets/civ1-pixelart/cursor/torch.png',
        ['./assets/civ1-pixelart/cursor/torch.png', 26],
      ],
      cursor: "url('data:cursor'), default",
    }
  );
  expect(
    "and the browser's own while it isn't loaded, rather than one that can't be seen",
    await cursor(false),
    { asked: ['./assets/civ1-pixelart/cursor/torch.png'], cursor: '' }
  );

  // Windows size art by a 16 px tile, not Civ1's: whatever is imported.
  const [civ1, civ2, pixelArt] = ['civ1', 'civ2', 'civ1-pixelart'].map(
    (id) => bundledTilesets().find((tileset) => tileset.id === id)!
  );

  expect(
    "windows are laid out for a 16 px tile: Civ1's art at the scale asked for, a larger tile's at no more than its own default scale",
    [
      REFERENCE_TILE_WIDTH,
      shownScale(2, civ1!),
      shownScale(2, pixelArt!),
      shownScale(1, pixelArt!),
      shownScale(2, civ2!),
    ],
    [16, 2, 1, 1, Math.min(2, civ2!.defaultScale)]
  );

  // Saves: one on the square grid loads without Civilization's art, and one on the isometric grid without
  //  Civilization II's, as the isometric pixel art draws it.
  expect(
    "a square save loads without Civilization's art, and an isometric one without Civilization II's",
    [
      isSupportedTopology('square'),
      tilesetToImport('square'),
      isSupportedTopology('staggered-iso'),
      tilesetToImport('staggered-iso'),
    ],
    [true, null, true, null]
  );

  // The square pixel art's sheet not loaded either: the hexagonal pixel art, which has the same interface art, draws
  //  the interface instead, as hex is offered to every new game (#1122), and a square save names Civilization's art,
  //  the one there is to import, not the pixel art.
  installTilesets({
    civ1: { complete: false, metadata: null },
    'civ1-pixelart': { complete: false, metadata: null },
  });

  expect(
    "with no square art, the hexagonal pixel art draws the interface, a game on hex can be played, and a square save asks for Civilization's art",
    [
      interfaceArt().id,
      hasInstalledInterfaceArt(),
      missingArt(),
      supportedTopologies(),
      isSupportedTopology('square'),
      tilesetToImport('square')?.id,
    ],
    ['hex-pixelart', true, null, ['staggered-iso', 'hex-odd-r'], false, 'civ1']
  );

  // The hexagonal and isometric pixel art's sheets not loaded either: nothing to play with.
  installTilesets({
    civ1: { complete: false, metadata: null },
    'civ1-pixelart': { complete: false, metadata: null },
    'hex-pixelart': { complete: false, metadata: null },
    'iso-pixelart': { complete: false, metadata: null },
  });

  expect(
    "with no art at all, nothing can be played, and a square save asks for Civilization's art",
    [
      hasInstalledInterfaceArt(),
      missingArt(),
      isSupportedTopology('square'),
      tilesetToImport('square')?.id,
    ],
    [false, 'interface', false, 'civ1']
  );

  // Art for hex alone (#1063): a theme drawing its interface with the hexagonal pixel art, and no square art. Hex is
  //  offered to every new game (#1122), so a new game can be started on it, and a save on hex loads (`canLoad`).
  installTilesets({
    civ1: { complete: false, metadata: null },
    'civ1-pixelart': { complete: false, metadata: null },
    'iso-pixelart': { complete: false, metadata: null },
  });
  provideInterfaceArt(() => ['hex-pixelart']);

  expect(
    'with art for hex alone, a new game on hex, and a save loads',
    [
      interfaceArt().id,
      missingArt(),
      missingArt(true),
      supportedTopologies(),
      canPlay(),
      canLoad(),
    ],
    ['hex-pixelart', null, null, ['hex-odd-r'], true, true]
  );

  provideInterfaceArt(() => ['civ1', 'civ1-pixelart']);

  // The browser's storage (#850), as the page starts (`installPacks`), the pixel art's sheet fetched with no network.
  const civ1Store = (): { store: AssetStore; fetched: string[] } => {
      const store = new AssetStore(civ1!),
        fetched: string[] = [];

      // As the store does: only a hosted set has a sheet to fetch.
      store.loadHostedPack = async ({ id, hosted }): Promise<void> => {
        if (hosted !== undefined) {
          fetched.push(id);
        }
      };
      // There's no IndexedDB here: what's imported is what `keys` says, and the sprites stay the suite's.
      store.load = async (): Promise<void> => {};

      return { store, fetched };
    },
    { keys, opens } = Store.prototype;

  // Blocked: nothing is imported, so the pixel art stands in, and a game can be played.
  Store.prototype.opens = async () => false;
  Store.prototype.keys = async () => {
    throw new Error('The user denied permission to access the database.');
  };

  {
    const { store, fetched } = civ1Store();

    expect(
      "with storage blocked, Civilization's art isn't installed, the pixel art's sheet is fetched as the page starts, and a game can be played",
      [
        (await installPacks(store)).map(({ id }) => id),
        fetched,
        interfaceArt().id,
        missingArt(),
      ],
      // The hexagonal pixel art is installed as it ships too, its sheet fetched only for a hex game (#1063).
      [
        ['civ1-pixelart', 'hex-pixelart', 'iso-pixelart'],
        ['civ1-pixelart'],
        'civ1-pixelart',
        null,
      ]
    );
  }

  // Open but unreadable for a passing reason: Civilization's stays installed, as before, when its sprites were read all
  //  the same, and nothing is fetched; but when they weren't either, the pixel art stands in rather than a game drawn
  //  blank, for a player who may never have imported anything.
  Store.prototype.opens = async () => true;

  {
    const { store, fetched } = civ1Store();

    store.has = async (path: string): Promise<boolean> =>
      path.startsWith('./assets/') && !path.startsWith('./assets/civ');

    expect(
      "a store that opens but can't be read, Civilization's sprites read all the same: its art stays installed, and a game can be played",
      [
        (await installPacks(store)).map(({ id }) => id),
        fetched,
        interfaceArt().id,
        missingArt(),
      ],
      [
        ['civ1', 'civ1-pixelart', 'hex-pixelart', 'iso-pixelart'],
        [],
        'civ1',
        null,
      ]
    );
  }

  {
    const { store, fetched } = civ1Store();

    store.has = async (): Promise<boolean> => false;

    expect(
      "a store that opens but can't be read, no sprites read either: the pixel art stands in, fetched as the page starts, and a game can be played",
      [
        (await installPacks(store)).map(({ id }) => id),
        fetched,
        interfaceArt().id,
        mapTileset('square').id,
        missingArt(),
      ],
      [
        ['civ1-pixelart', 'hex-pixelart', 'iso-pixelart'],
        ['civ1-pixelart'],
        'civ1-pixelart',
        'civ1-pixelart',
        null,
      ]
    );
  }

  Store.prototype.keys = keys;
  Store.prototype.opens = opens;

  // The art chosen for a grid (the library's Use) is what's fetched before a game on that grid starts or loads.
  installTilesets({});

  {
    const { store, fetched } = civ1Store();

    await ensureMapArt('square', store);
    chooseMapTileset('square', 'civ1-pixelart');
    await ensureMapArt('square', store);
    chooseMapTileset('square', '');

    expect(
      "the art chosen for square maps is fetched before a game on them starts: none for Civilization's, imported, then the pixel art's once it's chosen",
      [fetched, mapTileset('square').id],
      [['civ1-pixelart'], 'civ1']
    );
  }

  // A sheet that couldn't be fetched as a game started is said so (`loadFailed`), until a later try loads it.
  {
    const store = new AssetStore(civ1!);

    store.loadHostedPack = async (): Promise<void> => {
      throw new Error('offline');
    };

    const failure = await ensureTilesetLoaded(pixelArt!, store).then(
      () => null,
      (error: Error) => error.message
    );

    store.loadHostedPack = async (): Promise<void> => {};

    expect(
      'a sheet that fails is said to have, and not once it loads',
      [
        failure,
        loadFailed(pixelArt!),
        (await ensureTilesetLoaded(pixelArt!, store), loadFailed(pixelArt!)),
      ],
      ["Pixel art (civ1-pixelart) couldn't be loaded: offline", true, false]
    );
  }

  // A theme that names no art there is (an unknown one, or one with no list) still draws with what's installed: the
  //  pixel art with nothing imported.
  installTilesets({ civ1: { complete: false, metadata: null } });
  provideInterfaceArt(() => []);

  expect(
    'a theme with no art list, or naming none there is, draws with the installed set that has interface art: the pixel art, with nothing imported',
    [interfaceArt().id, interfaceArt(['no-such-set']).id, missingArt()],
    ['civ1-pixelart', 'civ1-pixelart', null]
  );

  installTilesets({});

  expect(
    "and with Civilization's imported, Civilization's",
    [interfaceArt().id, interfaceArt(['civ2']).id],
    ['civ1', 'civ1']
  );

  provideInterfaceArt(() => ['civ1', 'civ1-pixelart']);

  // On the isometric grid, what defaults to the map's art is Civilization II's, once it's installed.
  installTilesets({
    civ2: {
      complete: true,
      metadata: {
        anchors: {},
        colours: { flag: [{ primary: [243, 0, 0], secondary: [167, 0, 0] }] },
      },
    },
  });
  setMapGrid('staggered-iso');

  expect(
    "on an isometric map, a sprite looked up, a unit drawn and its letter default to Civilization II's art, and the interface keeps Civilization's",
    [
      mapTileset().id,
      lookups(() => getPreloadedImage('units/settlers')),
      // Not loaded here as Civ2's, though it is as Civ1's and the pixel art's.
      hasPreloadedImage('units/settlers'),
      lookups(() => renderUnit(settlers)),
      statusFont(),
      interfaceArt().id,
    ],
    [
      'civ2',
      ['./assets/civ2/units/settlers.png'],
      false,
      ['./assets/civ2/units/settlers.png'],
      'bold 10px sans-serif',
      'civ1',
    ]
  );

  setMapGrid('square');

  // Civilization's art imported: everything as it was.
  installTilesets({});

  expect(
    "with Civilization's art imported, the map and the interface draw with it, as before",
    [
      mapTileset().id,
      interfaceArt().id,
      lookups(() => getPreloadedImage('units/settlers')),
      lookups(() => renderUnit(settlers)),
      statusFont(),
      actionIcon(),
      (await cursor(true)).asked,
    ],
    [
      'civ1',
      'civ1',
      ['./assets/units/settlers.png'],
      ['./assets/units/settlers.png'],
      'bold 8px sans-serif',
      { transforms: [[2], [2], [2]], city: [1, 1] },
      ['./assets/cursor/torch.png', ['./assets/cursor/torch.png', 26]],
    ]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL noImport: ${failures.length} of ${checks} checks\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS noImport (${checks} checks)\n`);
};

run().catch((error) => {
  process.stderr.write(
    `FAIL noImport: ${error instanceof Error ? error.stack : error}\n`
  );
  process.exit(1);
});
