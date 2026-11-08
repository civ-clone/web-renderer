// A click on the map where a city's banner hangs over a square (#747), with the real `GamePortal` under linkedom and a
//  layer that says whose banner is where: the square is always told of (`tile-clicked`, the create-unit cheat's
//  coordinates); a city's own square, or our units, win over a banner, which hangs over its neighbours; otherwise the
//  banner opens its city, or, for a city that doesn't open (a rival's), centres the map on it.

// Must stay first: `GamePortal` reaches windows that read `document.body` as they load.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/classicInterface';
import './lib/grids';

import { City } from '@civ-clone-ui/client/types';
import { assetStore } from '@civ-clone-ui/assets/AssetStore';
import GamePortal from '@civ-clone-ui/windows/components/GamePortal';
import Map from '@civ-clone-ui/map/components/Map';
import World from '@civ-clone-ui/map/components/World';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL bannerClicks: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// linkedom has no canvas context: one that draws nothing, and reads back blank pixels for a unit's colours.
const blank = (width: number, height: number) => ({
  data: new Uint8ClampedArray(Math.max(1, width * height) * 4),
  width,
  height,
});

(globalThis as any).HTMLCanvasElement.prototype.getContext = () =>
  new Proxy(
    {
      getImageData: (x: number, y: number, w: number, h: number) => blank(w, h),
      createImageData: blank,
    } as {
      [key: string]: unknown;
    },
    {
      get: (target, key: string) => (key in target ? target[key] : () => {}),
      set: (target, key: string, value) => {
        target[key] = value;

        return true;
      },
    }
  );
(document as any).elementFromPoint = () => null;
(globalThis as any).MouseEvent ??= Event;

// No assets: the units are listed without their images.
assetStore.spriteURL = () => new Promise(() => {});
assetStore.shownAtURL = () => new Promise(() => {});

// Whose banner is under the pointer, wherever it is: set by each check.
let banner: City | null = null;

class Banners extends Map {
  cityAt(): City | null {
    return banner;
  }
}

const player = (id: string) => ({
    id,
    civilization: {
      _: 'Babylonian',
      attributes: [{ name: 'colors', value: ['#ffffff', '#000000'] }],
    },
  }),
  unit = (id: string, owner: string) => ({
    _: 'Settlers',
    id,
    player: player(owner),
    city: null,
    busy: null,
    improvements: [],
    attack: { value: 0 },
    defence: { value: 1 },
    movement: { value: 1 },
    moves: { value: 1 },
  }),
  city = (name: string, x: number, y: number, owner = 'Player-1') =>
    ({ name, player: player(owner), tile: { x, y } } as unknown as City),
  ours = city('Babylon', 1, 1),
  neighbour = city('Ur', 3, 3),
  theirs = city('Thebes', 6, 6, 'Player-2'),
  tiles: any[] = [];

for (let x = 0; x < 8; x++) {
  for (let y = 0; y < 8; y++) {
    tiles.push({
      x,
      y,
      yields: [],
      improvements: [],
      city: x === 3 && y === 3 ? neighbour : null,
      // A Settlers of ours south of Babylon, under its banner; a rival's unit beside it.
      units:
        x === 1 && y === 2
          ? [unit('Unit-1', 'Player-1')]
          : x === 2 && y === 2
          ? [unit('Unit-2', 'Player-2')]
          : [],
    });
  }
}

const canvas = document.createElement('canvas') as HTMLCanvasElement,
  opened: string[] = [],
  clicked: string[] = [];

canvas.width = 128;
canvas.height = 128;
canvas.setPointerCapture = () => {};

const portal = new GamePortal(
  new World({ width: 8, height: 8, tiles } as any),
  { send: () => {}, receive: () => () => {} } as any,
  canvas,
  {
    playerId: 'Player-1',
    scale: 1,
    tileSize: 16,
    cityOpener: {
      opens: (city) => city.player.id === 'Player-1',
      open: (city) => opened.push(city.name),
    },
  },
  Banners
);

portal.on('tile-clicked', (x: number, y: number) => clicked.push(`${x},${y}`));

// linkedom has no `PointerEvent`: an event with what the portal reads.
const pointer = (type: string, x: number, y: number): void => {
    const event = new Event(type, { cancelable: true });

    Object.entries({
      buttons: type === 'pointerup' ? 0 : 1,
      clientX: x,
      clientY: y,
      isPrimary: true,
      offsetX: x,
      offsetY: y,
      pageX: x,
      pageY: y,
      pointerId: 7,
      x,
      y,
    }).forEach(([key, value]) => Object.defineProperty(event, key, { value }));

    canvas.dispatchEvent(event);
  },
  // Where on the canvas the square `x`, `y` is.
  at = (x: number, y: number): [number, number] => {
    for (let py = 1; py < canvas.height; py += 2) {
      for (let px = 1; px < canvas.width; px += 2) {
        const tile = portal.tileAt(px, py);

        if (tile?.x === x && tile?.y === y) {
          return [px, py];
        }
      }
    }

    throw new Error(`${x},${y} isn't on the canvas`);
  },
  click = (x: number, y: number, over: City | null) => {
    const [px, py] = at(x, y);

    banner = over;
    opened.length = 0;
    clicked.length = 0;

    pointer('pointerdown', px, py);
    pointer('pointerup', px, py);

    return {
      opened: [...opened],
      clicked: [...clicked],
      centre: portal.center(),
    };
  };

const run = async (): Promise<void> => {
  portal.setCenter(4, 4);

  expect(
    'a banner over an empty square opens its city, and the square is still told of',
    click(4, 4, ours),
    { opened: ['Babylon'], clicked: ['4,4'], centre: { x: 4, y: 4 } }
  );
  expect("a rival's banner centres the map on its city", click(5, 5, theirs), {
    opened: [],
    clicked: ['5,5'],
    centre: { x: 6, y: 6 },
  });

  portal.setCenter(4, 4);

  expect(
    "a city's own square wins over a neighbour's banner hanging over it",
    click(3, 3, ours).opened,
    ['Ur']
  );
  const underBanner = click(1, 2, ours),
    selection = document.querySelectorAll('.unit-selection-window');

  expect(
    "our units under a banner win: no city opens, and they're listed to pick from",
    [underBanner.opened, selection.length],
    [[], 1]
  );

  selection.forEach((window) => window.remove());

  expect(
    "a rival's units under a banner don't: the banner's city opens",
    click(2, 2, ours).opened,
    ['Babylon']
  );
  expect(
    'with no banner, a click on an empty square centres on it, as before',
    click(5, 4, null),
    { opened: [], clicked: ['5,4'], centre: { x: 5, y: 4 } }
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL bannerClicks (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS bannerClicks (${checks} checks)\n`);
};

run().catch((error) => {
  process.stderr.write(`FAIL bannerClicks: ${error?.stack ?? error}\n`);
  process.exit(1);
});
