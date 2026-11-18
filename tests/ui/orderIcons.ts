// The order buttons' pictures (#1053): in a Civ2 game they're drawn with Civ2's own art, the unit's own sprite with its
//  order's mark over it, Civ2's terrain, road and city, and its own Trade icon; in a Civ1 game, Civ1's on any map. Where
//  they come from is the `orderIcons` slot, which the manifests fill with `gameArt` and another package could fill with
//  icons of its own.

// Must stay first: it gives the components a `document`.
import './lib/dom';
import './lib/interfaces';
import './lib/artPacks';

import {
  IconLayer,
  drawUnitActionIcon,
  orderIconArt,
  unitActionIconLayers,
} from '@civ-clone/ui-assets/lib/unitActionIcon';
import classicManifest from '@civ-clone/ui-interface-classic/manifest.json';
import modernManifest from '@civ-clone/ui-interface-modern/manifest.json';
import { provideInterfaceArt } from '@civ-clone/ui-assets/lib/interfaceArt';
import { setSprites } from '@civ-clone/ui-assets/lib/getPreloadedImage';
import { Tile, Unit, UnitAction } from '@civ-clone/ui-protocol/types';
import {
  applyInterface,
  currentInterface,
  registerInterface,
} from '@civ-clone/ui-platform/lib/interfaceMode';
import {
  installTilesets,
  setMapGrid,
  setRuleSetTileset,
} from '@civ-clone/ui-assets/lib/tilesets';
import orderIcons, {
  currentOrderIcons,
} from '@civ-clone/ui-assets/lib/orderIcons';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL orderIcons: stopped after ${checks} checks\n`);
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

installTilesets({
  civ1: { complete: true, metadata: null },
  civ2: {
    complete: true,
    metadata: {
      anchors: {},
      colours: { flag: [{ primary: [250, 1, 2], secondary: [160, 3, 4] }] },
    },
  },
});

const tile = { id: 'Tile-1', x: 1, y: 1 } as unknown as Tile,
  action = (_: string, result?: string): UnitAction =>
    ({ _, __: [], id: `${_}-1`, from: tile, to: tile, result } as UnitAction),
  archers = {
    _: 'Archer',
    __: [],
    id: 'Archer-1',
    actions: [],
    actionsForNeighbours: {},
    busy: null,
    improvements: [],
    player: { civilization: { _: 'Persian' } },
    tile,
  } as unknown as Unit,
  names = (layers: IconLayer[]) =>
    layers.map((layer) =>
      layer.type === 'image'
        ? `${layer.interface ? 'interface:' : ''}${layer.path}`
        : layer.type === 'city'
        ? `city:${layer.civilization}`
        : `unit:${layer.unit._}`
    ),
  layersFor = (name: string, result?: string) =>
    names(unitActionIconLayers(action(name, result), archers, null, 'S'));

// A Civ1 game, on Civ2's map too: Civ1's art, its names as before.
setRuleSetTileset(null);
setMapGrid('staggered-iso');

expect(
  "a Civ1 game's order icons are drawn with Civ1's art, on Civ2's map too",
  [orderIconArt().id, layersFor('BuildRoad')],
  [
    'civ1',
    [
      'terrain/land',
      'terrain/grassland',
      'improvements/road_w',
      'improvements/road_e',
    ],
  ]
);

// A Civ2 game.
setRuleSetTileset('civ2');

expect("a Civ2 game's are drawn with Civ2's", orderIconArt().id, 'civ2');
expect(
  'a unit Civ1 has none of is its own sprite, marked',
  unitActionIconLayers(action('Sleep'), archers, null, 'S').map((layer) =>
    layer.type === 'unit' ? [layer.unit._, layer.status] : layer.type
  ),
  [['Archer', 'S']]
);
expect(
  "the improvements are Civ2's, on Civ2's Grassland, which has no terrain sprite over its base",
  [
    layersFor('BuildRoad'),
    layersFor('BuildRailroad'),
    layersFor('BuildMine'),
    layersFor('CleanPollution'),
  ],
  [
    ['terrain/grassland/base-0', 'improvements/road/w', 'improvements/road/e'],
    [
      'terrain/grassland/base-0',
      'improvements/railroad/w',
      'improvements/railroad/e',
    ],
    ['terrain/grassland/base-0', 'improvements/mine'],
    ['terrain/grassland/base-0', 'improvements/pollution'],
  ]
);
expect(
  "irrigation over Civ2's terrain, as its map draws it",
  layersFor('BuildIrrigation'),
  ['terrain/grassland/base-0', 'improvements/irrigation']
);
expect(
  "the terrain a Clear or Plant leaves, as Civ2's map draws it: its base, and its own sprite where it has one",
  [layersFor('ClearForest', 'Plains'), layersFor('PlantForest', 'Forest')],
  [
    ['terrain/plains/base-0'],
    ['terrain/forest/base-0', 'terrain/forest/isolated'],
  ]
);
expect(
  "the cities are the civilization's own, and Trade is the interface's",
  [
    layersFor('FoundCity'),
    layersFor('SetHomeCity'),
    layersFor('EstablishTradeRoute'),
  ],
  [['city:Persian'], ['city:Persian'], ['interface:city/trade']]
);

// Drawn: Civ2's road halves laid where the tile is, so they meet across it, not each centred on itself.
const calls: [string, ...unknown[]][] = [],
  context = new Proxy({} as { [key: string]: unknown }, {
    get: (target, name: string) =>
      name in target
        ? target[name]
        : (...args: unknown[]) => calls.push([name, ...args]),
    set: (target, name: string, value) => {
      target[name] = value;

      return true;
    },
  }),
  canvas = {
    width: 0,
    height: 0,
    clientWidth: 16,
    getContext: () => context,
  } as unknown as HTMLCanvasElement,
  roadW = { width: 64, height: 32 },
  roadE = { width: 64, height: 32 },
  base = { width: 64, height: 32 };

setSprites(
  new Map<string, CanvasImageSource>([
    ['./assets/civ2/terrain/grassland/base-0.png', base as any],
    ['./assets/civ2/improvements/road/w.png', roadW as any],
    ['./assets/civ2/improvements/road/e.png', roadE as any],
  ])
);
drawUnitActionIcon(
  canvas,
  unitActionIconLayers(action('BuildRoad'), archers, null, 'S')
);

expect(
  "Civ2's base and road halves, each laid where the tile is in the middle of the picture",
  calls
    .filter(([name]) => name === 'drawImage')
    .map(([, image, x, y]) => [
      image === base ? 'base' : image === roadW ? 'w' : 'e',
      x,
      y,
    ]),
  [
    ['base', 0, 16],
    ['w', 0, 16],
    ['e', 0, 16],
  ]
);

// The lost-city notice: our city, in our colours and our civilization's style.
expect(
  'the lost city is ours',
  currentOrderIcons().lostCity(['#f00', '#0f0'], 'Persian'),
  [
    {
      type: 'city',
      text: null,
      colours: ['#f00', '#0f0'],
      civilization: 'Persian',
    },
  ]
);

// The pixel art as the theme's art, in a Civ1 game: its own names, as before.
setRuleSetTileset(null);
installTilesets({
  civ1: { complete: false, metadata: null },
  'civ1-pixelart': { complete: true, metadata: null },
});
provideInterfaceArt(() => ['civ1-pixelart']);

expect(
  "with the pixel art as the theme's, its names, as Civ1's were",
  [orderIconArt().id, layersFor('BuildRoad'), layersFor('BuildIrrigation')],
  [
    'civ1-pixelart',
    [
      'terrain/land',
      'terrain/grassland',
      'improvements/road_w',
      'improvements/road_e',
    ],
    ['terrain/land', 'terrain/grassland', 'improvements/irrigation'],
  ]
);

provideInterfaceArt(() => []);

// The slot: the manifests name `gameArt`, and another provider can be named instead.
expect(
  'both interfaces draw them with the game’s art',
  [classicManifest.slots.orderIcons, modernManifest.slots.orderIcons],
  ['gameArt', 'gameArt']
);

applyInterface(null, null);

expect(
  'and the gameArt provider is the one drawn with',
  currentOrderIcons().draw.name,
  'drawUnitActionIcon'
);

const neutral = {
  layers: (): IconLayer[] => [{ type: 'image', path: 'neutral/order' }],
  lostCity: (): IconLayer[] => [],
  draw: (): void => {},
  canvasSize: (): number => 24,
};

orderIcons.provide('neutral', neutral);
registerInterface({
  ...currentInterface(),
  id: 'neutral-test',
  slots: { ...currentInterface().slots, orderIcons: 'neutral' },
});
applyInterface('neutral-test', null);

expect(
  'an interface naming other order icons draws with those, at their own size',
  [
    currentOrderIcons().layers(action('Sleep'), archers, null, 'S'),
    currentOrderIcons().canvasSize(canvas),
  ],
  [[{ type: 'image', path: 'neutral/order' }], 24]
);

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL orderIcons\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS orderIcons (${checks} checks)`);
