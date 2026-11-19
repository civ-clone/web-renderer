// The game's own interface art (#1052, #1054, #1165): in a game whose rule set names art for its map that names
//  interface sprites of its own without being interface art (Civ2's), each sprite the interface asks for is drawn from
//  that set when the player has imported it; one it lacks, from civ.one's own art (the pixel art) once that has loaded;
//  and otherwise from the theme's, Civ1's. A Civ1 game draws everything from the theme's art, as before, even with
//  Civ2's imported or on Civ2's map. A Civ2 game's start fetches the pixel art without waiting for it (`ensureMapArt`),
//  and Civ2's descriptor maps every Civ2 improvement and Wonder.

// Must stay first: `AssetStore` opens its database as it loads, and `Window` reads `document.body`.
import './lib/dom';
import './lib/interfaces';
import './lib/artPacks';

import {
  gameInterfaceArt,
  interfaceSprite,
  interfaceSpriteKey,
  interfaceNames,
  followerCount,
  ownInterfaceArt,
  provideInterfaceArt,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import { runInNewContext } from 'vm';
import { setFlagsFromString } from 'v8';
import {
  installTilesets,
  setMapGrid,
  setRuleSetTileset,
  setSheetFailed,
  sheetFailure,
} from '@civ-clone/ui-assets/lib/tilesets';
import { AssetStore } from '@civ-clone/ui-assets/AssetStore';
import { buildingSprite } from '@civ-clone/ui-assets/components/lib/buildingIcon';
import * as Civ2CityImprovements from '@civ-clone/civ2-city-improvement/CityImprovements';
import * as Civ2Wonders from '@civ-clone/civ2-wonder/Wonders';
import civ2Json from '@civ-clone/ui-tileset-civ2/civ2.json';
import {
  ensureMapArt,
  setFallbackRetryDelays,
  startFallbackInterfaceArt,
} from '@civ-clone/ui-assets/lib/installPacks';
import {
  citizenFace,
  yieldIcon,
} from '@civ-clone/ui-city/components/lib/cityYields';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { mapTileset } from '@civ-clone/ui-assets/lib/tilesets';
import { groupIcons } from '@civ-clone/ui-assets/lib/groupIcons';
import { setSprites } from '@civ-clone/ui-assets/lib/getPreloadedImage';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL gameInterfaceArt: stopped after ${checks} checks\n`
    );
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

console.error = () => {};

// To check that what's followed is let go (`followInterfaceArt`).
setFlagsFromString('--expose-gc');

const civ2Tileset = () => mapTileset('staggered-iso');

const run = async (): Promise<void> => {
  // Civ1's, the theme's; Civ2's, imported; the pixel art, hosted.
  installTilesets({
    civ1: { complete: true, metadata: null },
    civ2: {
      complete: true,
      metadata: {
        anchors: {},
        colours: {
          flag: [{ primary: [250, 1, 2], secondary: [160, 3, 4] }],
        },
      },
    },
    'civ1-pixelart': { complete: true, metadata: null },
  });

  const loaded = (...keys: string[]): void =>
      setSprites(
        new Map(keys.map((key) => [key, {} as unknown as CanvasImageSource]))
      ),
    civ2Key = (name: string) => `./assets/civ2/${name}.png`,
    civ1Key = (name: string) => `./assets/${name}.png`,
    from = (name: string) => {
      const { tileset, key } = interfaceSprite(name);

      return [tileset.id, key];
    };

  // A Civ1 game: Civ1's art, whatever else is imported.
  setRuleSetTileset(null);
  setMapGrid('square');
  loaded(civ2Key('icons/food'), civ2Key('people/small/happy-male'));

  expect('a Civ1 game has no art of its own', gameInterfaceArt(), null);
  expect(
    "a Civ1 game's food is Civ1's, Civ2's imported or not",
    from(groupIcons.Food),
    ['civ1', civ1Key('city/food')]
  );
  expect(
    'and so is its happy citizen',
    interfaceSpriteKey('city/people_happy_m'),
    civ1Key('city/people_happy_m')
  );

  // A Civ1 game on Civ2's isometric map (M1): its rule set names no art, so Civ1's still.
  setMapGrid('staggered-iso');

  expect(
    "a Civ1 game on Civ2's map has no art of its own",
    [gameInterfaceArt(), from(groupIcons.Food)],
    [null, ['civ1', civ1Key('city/food')]]
  );

  // A Civ2 game.
  setRuleSetTileset('civ2');
  setMapGrid('staggered-iso');

  expect(
    "a Civ2 game's own art is Civ2's",
    gameInterfaceArt()?.id ?? null,
    'civ2'
  );
  expect(
    "civ.one's own art is the pixel art",
    ownInterfaceArt()?.id,
    'civ1-pixelart'
  );

  // Everything imported: Civ2's.
  loaded(
    civ2Key('icons/food'),
    civ2Key('icons/shield'),
    civ2Key('icons/science'),
    civ2Key('icons/research/2'),
    civ2Key('icons/warming/0'),
    civ2Key('people/small/happy-male'),
    civ2Key('people/small/tax-collector'),
    civ2Key('buildings/harbor'),
    civ2Key('buildings/palace'),
    civ2Key('wonders/sun-tzu-s-war-academy'),
    './assets/civ1-pixelart/city/food.png'
  );

  expect(
    "the yields, meters, citizens and pictures it has are Civ2's",
    [
      interfaceSpriteKey(groupIcons.Food),
      interfaceSpriteKey(groupIcons.Production),
      interfaceSpriteKey(groupIcons.Research),
      interfaceSpriteKey('status/science_50'),
      interfaceSpriteKey('status/pollution_0'),
      interfaceSpriteKey('city/people_happy_m'),
      interfaceSpriteKey(buildingSprite('Harbour', false)),
      interfaceSpriteKey(buildingSprite('Palace', false)),
      interfaceSpriteKey(buildingSprite('SunTzusWarAcademy', true)),
    ],
    [
      civ2Key('icons/food'),
      civ2Key('icons/shield'),
      civ2Key('icons/science'),
      civ2Key('icons/research/2'),
      civ2Key('icons/warming/0'),
      civ2Key('people/small/happy-male'),
      civ2Key('buildings/harbor'),
      civ2Key('buildings/palace'),
      civ2Key('wonders/sun-tzu-s-war-academy'),
    ]
  );
  expect(
    "a woman specialist is Civ2's one specialist, not the pixel art's woman",
    [
      interfaceSpriteKey('city/people_tax_f'),
      interfaceSpriteKey('city/people_tax'),
    ],
    [
      civ2Key('people/small/tax-collector'),
      civ2Key('people/small/tax-collector'),
    ]
  );

  // Not imported: the pixel art's, once it has loaded, then Civ1's.
  loaded('./assets/civ1-pixelart/city/food.png');

  expect("without Civ2's icon, the pixel art's", from(groupIcons.Food), [
    'civ1-pixelart',
    './assets/civ1-pixelart/city/food.png',
  ]);
  expect(
    "and without the pixel art's either, Civ1's",
    [from(groupIcons.Gold), from(buildingSprite('Harbour', false))],
    [
      ['civ1', civ1Key('city/gold')],
      ['civ1', civ1Key('city-improvements/harbour')],
    ]
  );
  expect(
    'a sprite Civ2 has none of, such as the cursor, is the pixel art’s when it has loaded, and Civ1’s here, where it hasn’t',
    from('cursor/torch')[0],
    'civ1'
  );

  // The descriptor: every Civ2 improvement and Wonder the engine has, by civ.one's name, is one of the interface's
  //  names, and Civ2's names one of its sprites (`validateDescriptor` checks the rest as it registers).
  const ui = (civ2Json as { names: { ui: { [name: string]: string } } }).names
      .ui,
    // Capitalization is its own package's class, not among the rest (`Rules/City/capitalization`).
    civ2Buildings = [
      ...Object.keys(Civ2CityImprovements),
      'Capitalization',
    ].map((_) => buildingSprite(_, false)),
    civ2Wonders = Object.keys(Civ2Wonders).map((_) => buildingSprite(_, true));

  expect(
    "the engine's Civ2 improvements and Wonders, all of them",
    [civ2Buildings.length, civ2Wonders.length],
    [35, 28]
  );

  expect(
    'every Civ2 improvement and Wonder has a picture of its own, unshared',
    [
      [...civ2Buildings, ...civ2Wonders].filter((name) => !(name in ui)),
      new Set([...civ2Buildings, ...civ2Wonders].map((name) => ui[name])).size,
    ],
    [[], 63]
  );
  expect(
    "and each is one of the interface's names",
    [...civ2Buildings, ...civ2Wonders].filter(
      (name) => !interfaceNames.some((listed) => listed.name === name)
    ),
    []
  );

  // As a Civ2 game starts, its map's art is ready, and the pixel art is fetched with it, but not waited for.
  const asked: string[] = [],
    store = {
      loadHostedPack: ({ id }: { id: string }) => {
        asked.push(id);

        return Promise.resolve();
      },
    } as unknown as AssetStore;

  await ensureMapArt('staggered-iso', store);

  expect("a Civ2 game's start loads Civ2's art and civ.one's own", asked, [
    'civ2',
    'civ1-pixelart',
  ]);

  // A pixel art sheet that never comes holds nothing up.
  const never = {
    loadHostedPack: ({ id }: { id: string }) =>
      id === 'civ1-pixelart' ? new Promise(() => {}) : Promise.resolve(),
  } as unknown as AssetStore;

  expect(
    "a Civ2 game starts while the pixel art's sheet is still coming",
    (await ensureMapArt('staggered-iso', never)).tileset.id,
    'civ2'
  );

  // No real waits between tries in this suite.
  setFallbackRetryDelays([0, 0]);

  // One that can't be fetched isn't marked as failed for the square maps.
  const failing = {
    loadHostedPack: ({ id }: { id: string }) =>
      id === 'civ1-pixelart'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(),
  } as unknown as AssetStore;

  expect(
    "a Civ2 game starts without the pixel art's sheet",
    [
      (await ensureMapArt('staggered-iso', failing)).tileset.id,
      sheetFailure('civ1-pixelart'),
    ],
    ['civ2', null]
  );

  // The theme's own art the pixel art: nothing to fall back to before it.
  provideInterfaceArt(() => ['civ1-pixelart']);
  loaded('./assets/civ1-pixelart/city/gold.png');

  expect(
    "with the pixel art the theme's, a sprite Civ2 hasn't got is the theme's",
    from(groupIcons.Gold),
    ['civ1-pixelart', './assets/civ1-pixelart/city/gold.png']
  );

  provideInterfaceArt(() => []);

  asked.length = 0;
  setRuleSetTileset(null);
  await ensureMapArt('square', store);
  await ensureMapArt('staggered-iso', store);

  expect("a Civ1 game's loads only its map's, on Civ2's map too", asked, [
    'civ1',
    'civ2',
  ]);

  // In a Civ2 game, a sheet that couldn't be fetched is tried again, and is drawn from once it comes.
  setRuleSetTileset('civ2');
  let tries = 0;

  // An earlier failure, said, which a sheet that loads clears.
  setSheetFailed('civ1-pixelart', 'offline earlier');

  const flaky = {
    loadHostedPack: () =>
      ++tries < 3 ? Promise.reject(new Error('offline')) : Promise.resolve(),
  } as unknown as AssetStore;

  await startFallbackInterfaceArt(civ2Tileset(), flaky);

  expect(
    'a sheet that fails is tried again, until it loads',
    [tries, sheetFailure('civ1-pixelart')],
    [3, null]
  );

  tries = -10;
  await startFallbackInterfaceArt(civ2Tileset(), flaky);

  expect('and no more than a few times', tries, -7);

  // What's drawn before the pixel art comes is drawn again with it.
  const imported = new Set<string>(),
    settle = () => new Promise((resolve) => setTimeout(resolve, 0)),
    src = (element: Element) =>
      element.querySelector('img')?.getAttribute('src') ?? null;

  (assetStore as any).shownAtURL = (key: string) => Promise.resolve(key);
  (assetStore as any).firstImported = (keys: string[]) =>
    Promise.resolve(keys.find((key) => imported.has(key)) ?? keys.at(-1));

  loaded();

  const gold = yieldIcon('Gold'),
    face = citizenFace('happy');

  await settle();

  expect(
    "before the pixel art comes, the theme's",
    [src(gold), src(face)],
    [civ1Key('city/gold'), civ1Key('city/people_happy_m')]
  );

  const pixelGold = './assets/civ1-pixelart/city/gold.png',
    pixelFaces = [
      './assets/civ1-pixelart/city/people_happy_m.png',
      './assets/civ1-pixelart/city/people_happy_f.png',
    ];

  pixelFaces.forEach((key) => imported.add(key));
  loaded(pixelGold, ...pixelFaces);
  await settle();

  expect(
    "and once it has come, the pixel art's, in what's already drawn",
    [src(gold), pixelFaces.includes(src(face)!)],
    [pixelGold, true]
  );

  // A face is shown at the size of the set it's drawn from (#1221): Civ1's pixel art at Civ1's, Civ2's at Civ2's.
  const faceSize = () => [
    (face as HTMLElement).style.getPropertyValue('--citizen-width'),
    (face as HTMLElement).style.getPropertyValue('--citizen-step'),
  ];

  expect("the pixel art's face at Civ1's size", faceSize(), ['16px', '12px']);

  const civ2Face = civ2Key('people/small/happy-male');

  imported.add(civ2Face);
  loaded(pixelGold, ...pixelFaces, civ2Face);
  await settle();

  expect(
    "and Civ2's own, once imported, at Civ2's",
    [src(face), ...faceSize()],
    [civ2Face, '15px', '13px']
  );

  // What's followed is let go once it's gone, and nothing is followed in a game without art of its own.
  const gc = runInNewContext('gc') as () => void,
    before = followerCount();

  for (let i = 0; i < 200; i++) {
    yieldIcon('Gold');
  }

  expect(
    'each picture drawn in a Civ2 game is followed',
    followerCount(),
    before + 200
  );

  await settle();
  gc();
  await settle();
  gc();

  expect("and let go once it's gone", followerCount() <= before + 1, true);

  setRuleSetTileset(null);
  setMapGrid('square');

  const civ1Before = followerCount();

  yieldIcon('Gold');
  citizenFace('happy');

  expect('nothing is followed in a Civ1 game', followerCount(), civ1Before);

  finished = true;
};

run()
  .catch((error) => failures.push(`threw: ${error?.stack ?? error}`))
  .finally(() => {
    finished = true;

    if (failures.length) {
      process.stderr.write(
        `FAIL gameInterfaceArt\n${failures
          .map((failure) => `  ${failure}`)
          .join('\n')}\n`
      );
      process.exit(1);
    }

    console.log(`PASS gameInterfaceArt (${checks} checks)`);
  });
