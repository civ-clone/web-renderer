// The game's own interface art (#1052, #1054, #1165): in a game whose map is drawn with a set that names interface
//  sprites of its own without being interface art (Civ2's), each sprite the interface asks for is drawn from that set
//  when the player has imported it; one it lacks, from civ.one's own art (the pixel art) once that has loaded; and
//  otherwise from the theme's, Civ1's. A Civ1 game draws everything from the theme's art, as before, even with Civ2's
//  imported. Civ2's set is ready with the pixel art as its game starts (`ensureMapArt`), and its descriptor maps every
//  Civ2 improvement and Wonder.

// Must stay first: `AssetStore` opens its database as it loads, and `Window` reads `document.body`.
import './lib/dom';
import './lib/interfaces';
import './lib/artPacks';

import {
  gameInterfaceArt,
  interfaceSprite,
  interfaceSpriteKey,
  interfaceNames,
  ownInterfaceArt,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import {
  installTilesets,
  setMapGrid,
  setRuleSetTileset,
} from '@civ-clone/ui-assets/lib/tilesets';
import { AssetStore } from '@civ-clone/ui-assets/AssetStore';
import { buildingSprite } from '@civ-clone/ui-assets/components/lib/buildingIcon';
import * as Civ2CityImprovements from '@civ-clone/civ2-city-improvement/CityImprovements';
import * as Civ2Wonders from '@civ-clone/civ2-wonder/Wonders';
import civ2Json from '@civ-clone/ui-tileset-civ2/civ2.json';
import { ensureMapArt } from '@civ-clone/ui-assets/lib/installPacks';
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
    'a sprite Civ2 has none of, such as the cursor, is the pixel art’s or Civ1’s too',
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

  // As a Civ2 game starts, its map's art is ready, and the pixel art with it.
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

  asked.length = 0;
  setRuleSetTileset(null);
  await ensureMapArt('square', store);
  await ensureMapArt('staggered-iso', store);

  expect("a Civ1 game's loads only its map's, on Civ2's map too", asked, [
    'civ1',
    'civ2',
  ]);

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
