// The interface follows the map's art in a game (`followMapArt`): a game whose map is drawn with civ.one's own art (the
//  pixel art, on any grid) draws its icons, people, cursor and order buttons with the pixel art, whatever the theme lists
//  first; a game whose map is drawn with imported art (Civ1's, Civ2's) draws them as the theme says, as before; and the
//  menus, before any game, always do. On the hexagonal and isometric grids it's the square pixel art's interface, once
//  its sheet is loaded, and the map's own set's until then, which has the same pictures. A theme's choice is still
//  judged by the theme's art (`themeChangesArt`).

// Must stay first: `AssetStore` opens its database as it loads, and `Window` reads `document.body`.
import './lib/dom';
import './lib/interfaces';
import './lib/artPacks';

import interfaceArt, {
  followMapArt,
  interfaceSprite,
  mapArtChangesInterface,
  mapInterfaceArt,
  provideInterfaceArt,
  themeInterfaceArt,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import {
  installTilesets,
  installedTilesets,
  setMapGrid,
  setRuleSetTileset,
} from '@civ-clone/ui-assets/lib/tilesets';
import { setSprites } from '@civ-clone/ui-assets/lib/getPreloadedImage';
import { orderIconArt } from '@civ-clone/ui-assets/lib/unitActionIcon';
import { groupIcons } from '@civ-clone/ui-assets/lib/groupIcons';
import { themeChangesArt } from '@civ-clone/ui-menus/components/GameOptions';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL mapInterfaceArt: stopped after ${checks} checks\n`
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

// Civ1's and Civ2's imported, and the pixel art on its three grids, hosted.
installTilesets({
  civ1: { complete: true, metadata: null },
  civ2: {
    complete: true,
    metadata: {
      anchors: {},
      colours: { flag: [{ primary: [250, 1, 2], secondary: [160, 3, 4] }] },
    },
  },
  'civ1-pixelart': { complete: true, metadata: null },
  'hex-pixelart': { complete: true, metadata: null },
  'iso-pixelart': { complete: true, metadata: null },
});

// The theme's list, as the page's themes give it: Civ1's, then the pixel art.
provideInterfaceArt(() => ['civ1', 'civ1-pixelart']);

const set = (id: string) => installedTilesets().find((t) => t.id === id)!,
  loaded = (...keys: string[]): void =>
    setSprites(
      new Map(keys.map((key) => [key, {} as unknown as CanvasImageSource]))
    ),
  ids = () => [
    interfaceArt().id,
    orderIconArt().id,
    interfaceSprite(groupIcons.Food).key,
  ];

setRuleSetTileset(null);
setMapGrid('square');

// The menus, before a game: the theme's, Civ1's.
expect("before a game, the theme's art draws the interface", ids(), [
  'civ1',
  'civ1',
  './assets/city/food.png',
]);

// Neither of the imported sets has the interface follow it.
expect(
  'imported art has the interface draw as the theme says',
  [mapInterfaceArt(set('civ1')), mapInterfaceArt(set('civ2'))],
  [null, null]
);

followMapArt(set('civ1'));

expect(
  "a game on Civ1's map draws its interface with Civ1's, as before",
  ids(),
  ['civ1', 'civ1', './assets/city/food.png']
);

// A game on the pixel art's square map.
followMapArt(set('civ1-pixelart'));

expect(
  "a game on the pixel art's square map draws its icons and order buttons with the pixel art",
  ids(),
  ['civ1-pixelart', 'civ1-pixelart', './assets/civ1-pixelart/city/food.png']
);
expect(
  "a theme is still judged by the theme's art",
  [themeInterfaceArt().id, themeChangesArt('slate')],
  ['civ1', false]
);

// Art chosen during that game: another pixel art set whose interface is the same doesn't change it; Civ1's does, so
//  the game needs a new page, as a theme with other art does.
expect(
  'during the game, only art the interface would follow differently changes it',
  [
    mapArtChangesInterface(set('civ1-pixelart')),
    mapArtChangesInterface(set('civ1')),
  ],
  [false, true]
);

followMapArt(set('civ1'));

expect(
  "and in a game on Civ1's map, the pixel art changes it and Civ2's doesn't",
  [
    mapArtChangesInterface(set('civ1-pixelart')),
    mapArtChangesInterface(set('civ2')),
    mapArtChangesInterface(set('civ1')),
  ],
  [true, false, false]
);

// A game on the pixel art's isometric map, the square pixel art's sheet not loaded: the map's own set.
setMapGrid('staggered-iso');
followMapArt(set('iso-pixelart'));

expect(
  "on the isometric map, the map's own pixel art until the square pixel art is loaded",
  ids(),
  ['iso-pixelart', 'iso-pixelart', './assets/iso-pixelart/city/food.png']
);

// Its sheet loaded: the square pixel art's, as the buttons and windows draw it.
loaded('./assets/civ1-pixelart/city/food.png');
followMapArt(set('iso-pixelart'));

expect("and the square pixel art's once it is", ids(), [
  'civ1-pixelart',
  'civ1-pixelart',
  './assets/civ1-pixelart/city/food.png',
]);

setMapGrid('hex-odd-r');
followMapArt(set('hex-pixelart'));

expect('and on the hexagonal map', interfaceArt().id, 'civ1-pixelart');

// A Civ2 game on Civ2's map: the theme's, with Civ2's own sprites over it, as before.
setMapGrid('staggered-iso');
setRuleSetTileset('civ2');
followMapArt(set('civ2'));

expect("a Civ2 game on Civ2's map is as before", interfaceArt().id, 'civ1');

// The same game with a theme whose art is the pixel art already (Civ1's not imported, say): choosing the pixel art's
//  isometric map leaves the interface drawing with the pixel art, so it needs no new page; Civ1's art first again, it
//  does.
provideInterfaceArt(() => ['civ1-pixelart']);
followMapArt(set('civ2'));

expect(
  "art whose interface is the one drawn now doesn't change it",
  [interfaceArt().id, mapArtChangesInterface(set('iso-pixelart'))],
  ['civ1-pixelart', false]
);

provideInterfaceArt(() => ['civ1', 'civ1-pixelart']);
followMapArt(set('civ2'));

expect(
  "but with Civ1's art the theme's, the pixel art does",
  mapArtChangesInterface(set('iso-pixelart')),
  true
);

// And back to the theme's.
setRuleSetTileset(null);
followMapArt(null);

expect("given none, the theme's again", interfaceArt().id, 'civ1');

provideInterfaceArt(() => []);
setMapGrid('square');

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL mapInterfaceArt\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS mapInterfaceArt (${checks} checks)`);
