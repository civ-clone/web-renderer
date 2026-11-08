// The tooltip over a map square (#748), with the real `GamePortal` under linkedom: what it says about a square (its
//  terrain and resource, yields, defence bonus, move cost, improvements, city and units), that a mouse resting on a
//  square opens it after the shared tooltip's delay over the square, and that it doesn't open on a square never seen,
//  under the classic interface, with its option off, or while the other players move. A rival's banner is about its
//  city's square. The rest of what closes it is the banner's, in `bannerTooltip`.

// Must stay first: `GamePortal` reaches windows that read `document.body` as they load.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/grids';

import { City, Tile, Yield } from '@civ-clone/ui-protocol/types';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import GamePortal from '@civ-clone/ui-windows/components/GamePortal';
import Map from '@civ-clone/ui-map/components/Map';
import { Rect } from '@civ-clone/ui-map/lib/viewport';
import World from '@civ-clone/ui-map/components/World';
import { applyInterface } from '@civ-clone/ui-client/lib/interfaceMode';
import {
  TooltipContent,
  TooltipText,
} from '@civ-clone/ui-widgets/components/lib/Tooltip';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import { instance as options } from '@civ-clone/ui-client/GameOptionsRegistry';
import squareTooltip, {
  hasSquareTooltip,
} from '@civ-clone/ui-windows/components/Map/squareTooltip';

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
    process.stderr.write('FAIL squareTooltip: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// linkedom has no canvas context: one that draws nothing.
(globalThis as any).HTMLCanvasElement.prototype.getContext = () =>
  new Proxy({} as { [key: string]: unknown }, {
    get: (target, key: string) => (key in target ? target[key] : () => {}),
    set: (target, key: string, value) => {
      target[key] = value;

      return true;
    },
  });

// What's under the pointer in the window: the map.
let under: Element | null = null;

(document as any).elementFromPoint = () => under;

assetStore.spriteURL = () => new Promise(() => {});
// The tileset's pictures, by their sprite key.
assetStore.shownAtURL = async (key: string) => `sprite:${key}`;

const yieldOf = (_: string, value: number) =>
    ({ _, __: [_, 'Yield'], id: `Yield-${_}`, value } as unknown as Yield),
  entity = (_: string) => ({ _, __: [_], id: `${_}-1` }),
  terrain = (
    _: string,
    defence: number,
    movementCost: number | null,
    features: string[] = []
  ) => ({
    _,
    __: [_, 'Terrain'],
    id: `${_}-1`,
    features: features.map(entity),
    defence,
    movementCost,
  }),
  unit = (_: string, civilization: string) => ({
    _,
    player: { id: `Player-${civilization}`, civilization: { _: civilization } },
  }),
  babylon = {
    id: 'City-1',
    name: 'Babylon',
    player: { id: 'Player-1' },
    originalPlayer: { civilization: { _: 'Babylonian' } },
    tile: { x: 1, y: 1 },
  } as unknown as City,
  // A rival's city, whose banner has nothing more to say (#274).
  thebes = {
    id: 'City-2',
    name: 'Thebes',
    player: { id: 'Player-2' },
    originalPlayer: { civilization: { _: 'Egyptian' } },
    tile: { x: 6, y: 6 },
    growth: { size: 3 },
  } as unknown as City,
  grassland = {
    x: 0,
    y: 0,
    terrain: terrain('Grassland', 1, 1),
    yields: [yieldOf('Food', 2), yieldOf('Production', 0), yieldOf('Trade', 1)],
    improvements: [entity('Road')],
    city: null,
    workedBy: babylon,
    units: [],
  } as unknown as Tile,
  hills = {
    x: 0,
    y: 0,
    terrain: terrain('Hills', 2, 2, ['Coal']),
    yields: [yieldOf('Food', 1), yieldOf('Production', 5)],
    improvements: [entity('Mine')],
    city: null,
    workedBy: null,
    units: [],
  } as unknown as Tile,
  ocean = {
    x: 0,
    y: 0,
    terrain: terrain('Ocean', 1, 1),
    yields: [yieldOf('Food', 1), yieldOf('Trade', 2)],
    improvements: [],
    city: null,
    workedBy: null,
    units: [unit('Trireme', 'Egyptian')],
  } as unknown as Tile;

// Whose banner is under the pointer, and where it's drawn: set by each check.
let banner: City | null = null;

const bannerBox: Rect = { x: 30, y: 40, width: 50, height: 12 };

class Banners extends Map {
  bannerAt(): { city: City; box: Rect } | null {
    return banner === null ? null : { city: banner, box: bannerBox };
  }
}

const tiles: any[] = [];

for (let x = 0; x < 8; x++) {
  for (let y = 0; y < 8; y++) {
    tiles.push({
      x,
      y,
      terrain: terrain('Plains', 1, 1),
      yields: [yieldOf('Food', 1), yieldOf('Production', 1)],
      improvements: [],
      city: null,
      workedBy: null,
      units: [],
    });
  }
}

const canvas = document.createElement('canvas') as HTMLCanvasElement;

canvas.width = 128;
canvas.height = 128;
canvas.setPointerCapture = () => {};
// Where the canvas is in the window.
canvas.getBoundingClientRect = () =>
  ({ left: 100, top: 50, right: 228, bottom: 178 } as DOMRect);
document.body.append(canvas);
under = canvas;

// The window it's kept inside, and the tooltip's own size: linkedom lays nothing out.
Object.assign((globalThis as any).window, {
  innerWidth: 1024,
  innerHeight: 768,
});
Object.defineProperties((globalThis as any).HTMLElement.prototype, {
  offsetWidth: { get: () => 120, configurable: true },
  offsetHeight: { get: () => 40, configurable: true },
});

applyInterface('modern', null);

const portal = new GamePortal(
  new World({ width: 8, height: 8, tiles } as any),
  { send: () => {}, receive: () => () => {} } as any,
  canvas,
  {
    playerId: 'Player-1',
    scale: 1,
    tileSize: 16,
    cityOpener: { opens: () => false, open: () => {} },
  },
  Banners
);

// linkedom has no `PointerEvent`: an event with what the portal reads.
const pointer = (type: string, x: number, y: number): void => {
    const event = new Event(type, { cancelable: true });

    Object.entries({
      buttons: 0,
      clientX: x,
      clientY: y,
      isPrimary: true,
      offsetX: x,
      offsetY: y,
      pageX: x,
      pageY: y,
      pointerId: 7,
      pointerType: 'mouse',
      x,
      y,
    }).forEach(([key, value]) => Object.defineProperty(event, key, { value }));

    canvas.dispatchEvent(event);
  },
  wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  panel = () => document.getElementById('tooltip'),
  shown = () => {
    const element = panel();

    return element !== null && !element.hidden;
  },
  says = () => ({
    title: panel()?.querySelector('h4')?.textContent ?? null,
    rows: [...(panel()?.querySelectorAll('dt, dd') ?? [])].map(
      (element) => element.textContent
    ),
  }),
  // A cell as a screen reader has it: an icon's name, then its figure.
  cellText = (cell: TooltipText): string =>
    typeof cell === 'string'
      ? cell
      : (cell instanceof Element && cell.matches('.yield-amount')
          ? [cell]
          : [...(cell as Element).querySelectorAll('.yield-amount')]
        )
          .map((amount) => amount.textContent!.trim())
          .join(', '),
  plain = ({ title, rows }: TooltipContent) => ({
    title,
    rows: rows.map((row) => row.map(cellText)),
  }),
  // Moves off anything, then rests on the pixel long enough for its tooltip.
  rest = async (x: number, y: number) => {
    canvas.dispatchEvent(new Event('pointerleave'));
    pointer('pointermove', x, y);

    await wait(450);
  },
  // The square under a pixel: the one the checks change.
  squareUnder = (x: number, y: number) => {
    const { x: tileX, y: tileY } = portal.tileAt(x, y)!;

    return tiles.find((tile) => tile.x === tileX && tile.y === tileY);
  };

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-world/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-civilization/en');

  // What it says.
  expect(
    'grassland with a road, worked by a city',
    plain(squareTooltip(grassland, 'Player-1')),
    {
      title: 'Grassland',
      rows: [
        ['Yields', 'Food: 2, Trade: 1'],
        ['Movement cost', '1'],
        ['Improvements', 'Road'],
        ['Worked by', 'Babylon'],
      ],
    }
  );
  expect(
    'hills with coal and a mine: the resource, and the defence bonus',
    plain(squareTooltip(hills, 'Player-1')),
    {
      title: 'Hills, Coal',
      rows: [
        ['Yields', 'Food: 1, Production: 5'],
        ['Defense', '+100%'],
        ['Movement cost', '2'],
        ['Improvements', 'Mine'],
      ],
    }
  );

  const [[, yieldsShown], [, defenceShown], [, movesShown]] = squareTooltip(
    hills,
    'Player-1'
  ).rows;

  expect(
    "yields as the tileset's icons, defence and moves named, then the figure and the unit card's glyph",
    [
      (yieldsShown as Element).querySelectorAll('.yield-icon').length,
      (defenceShown as Element).lastElementChild?.matches(
        '.glyph-stat-defence'
      ),
      (movesShown as Element).lastElementChild?.matches('.glyph-stat-moves'),
    ],
    [2, true, true]
  );
  expect(
    "ocean with a rival's Trireme: not the unit, which the map shows, as much as you know of a rival's stack",
    plain(squareTooltip(ocean, 'Player-1')),
    {
      title: 'Ocean',
      rows: [
        ['Yields', 'Food: 1, Trade: 2'],
        ['Movement cost', '1'],
      ],
    }
  );
  expect(
    'a city on the square, rather than working it',
    plain(squareTooltip({ ...grassland, city: babylon } as Tile, 'Player-1'))
      .rows[3],
    ['City', 'Babylon']
  );
  expect(
    "a rival's city working it: not said, as the map doesn't show it",
    plain(
      squareTooltip({ ...grassland, workedBy: thebes } as Tile, 'Player-1')
    ).rows.map(([label]) => label),
    ['Yields', 'Movement cost', 'Improvements']
  );
  expect(
    'a square yielding nothing: a dash',
    plain(
      squareTooltip({ ...ocean, yields: [] } as unknown as Tile, 'Player-1')
    ).rows[0],
    ['Yields', '–']
  );
  expect(
    'a terrain no unit can move onto: no move cost',
    plain(
      squareTooltip(
        {
          ...hills,
          terrain: terrain('Hills', 2, null),
        } as unknown as Tile,
        'Player-1'
      )
    ).rows.map(([label]) => label),
    ['Yields', 'Defense', 'Improvements']
  );
  expect(
    'a square never seen has none',
    hasSquareTooltip({
      ...ocean,
      terrain: { _: 'Unknown', __: ['Unknown', 'Terrain'], features: [] },
    } as unknown as Tile),
    false
  );

  await import('../../translations/local/en-GB');
  await i18next.changeLanguage('en-GB');

  expect(
    'British English: Defence',
    plain(squareTooltip(hills, 'Player-1')).rows[1],
    ['Defence', '+100%']
  );

  await i18next.changeLanguage('en');

  // When it opens.
  const { terrain: hillsTerrain, yields, improvements } = hills;

  Object.assign(squareUnder(40, 45), {
    terrain: hillsTerrain,
    yields,
    improvements,
  });

  pointer('pointermove', 40, 45);
  await wait(200);

  expect('not before the delay', shown(), false);

  await wait(250);

  const size = portal.tileSize(),
    { box } = portal.squareAt(40, 45)!;

  expect(
    "the square's box is the one under the mouse",
    [
      box.x <= 40 && 40 < box.x + box.width,
      box.y <= 45 && 45 < box.y + box.height,
      box.width,
    ],
    [true, true, size]
  );
  expect(
    'after it, about the square under the mouse',
    [shown(), says().title],
    [true, 'Hills, Coal']
  );
  expect(
    "under the square, from the square's left, on the window",
    [panel()?.style.left, panel()?.style.top],
    [`${100 + box.x}px`, `${50 + box.y + box.height + 4}px`]
  );

  await wait(0);

  expect(
    "the yields' pictures, by the tileset's keys for them",
    [...(panel()?.querySelectorAll('dd .yield-icon img') ?? [])].map(
      (img) => /city\/(\w+)/.exec(img.getAttribute('src') ?? '')?.[1]
    ),
    ['food', 'production']
  );
  expect(
    'the icons are in the panel, not just the content',
    [
      panel()?.querySelectorAll('dd .yield-icon').length,
      panel()?.querySelector('dd .glyph-stat-defence') !== null,
    ],
    [2, true]
  );

  pointer('pointermove', 41, 46);

  expect('moving within the square keeps it open', shown(), true);

  pointer('pointermove', 40 + size, 45);

  expect('moving to the next square closes it', shown(), false);

  await wait(450);

  expect('and resting there opens it for that square', says().title, 'Plains');

  // The square changing while it's open.
  Object.assign(squareUnder(40 + size, 45), {
    improvements: [entity('Irrigation')],
  });
  portal.build([squareUnder(40 + size, 45)]);

  expect(
    'its square changing: it says what is there now',
    says().rows.slice(-2),
    ['Improvements', 'Irrigation']
  );

  // When it doesn't.
  Object.assign(squareUnder(40, 45 + size), {
    terrain: { _: 'Unknown', __: ['Unknown', 'Terrain'], features: [] },
  });
  await rest(40, 45 + size);

  expect('a square never seen', shown(), false);

  await rest(40, 45);
  expect('open, before: the other players moving closes it', shown(), true);
  portal.setWaiting(true);

  expect('the other players moving closes it', shown(), false);

  await rest(40, 45);

  expect('nor does it open while they move', shown(), false);

  portal.setWaiting(false);
  await rest(40, 45);

  expect('once it is your turn, it opens again', shown(), true);

  options.set('squareTooltips', false);
  await rest(40, 45);

  expect('nor with its option off', shown(), false);

  options.set('squareTooltips', true);
  applyInterface('classic', null);
  await rest(40, 45);

  expect('nor under the classic interface', shown(), false);

  applyInterface('modern', null);

  // A rival's banner.
  Object.assign(
    tiles.find((tile) => tile.x === 6 && tile.y === 6),
    { terrain: terrain('Hills', 2, 2), city: thebes }
  );
  banner = thebes;
  await rest(40, 45);

  expect(
    "a rival's banner: what its city's square is, over the banner",
    [shown(), says().title, says().rows.slice(-2), panel()?.style.left],
    [true, 'Hills', ['City', 'Thebes'], '130px']
  );

  // The same square, pointed at: a pixel on Thebes's square, found by asking the portal.
  let thebesAt: [number, number] | null = null;

  for (let y = 0; y < 128 && thebesAt === null; y += 4) {
    for (let x = 0; x < 128 && thebesAt === null; x += 4) {
      const square = portal.squareAt(x, y);

      if (square?.tile.x === 6 && square.tile.y === 6) {
        thebesAt = [x, y];
      }
    }
  }

  banner = null;
  pointer('pointermove', ...thebesAt!);

  expect(
    "from a rival's banner onto its city's square: a new hover, as it opens somewhere else",
    shown(),
    false
  );

  await wait(450);

  expect(
    'which opens over the square',
    [shown(), says().title, panel()?.style.left],
    [true, 'Hills', `${100 + portal.squareAt(...thebesAt!)!.box.x}px`]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL squareTooltip (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS squareTooltip (${checks} checks)\n`);
};

run().catch((error) => {
  process.stderr.write(`FAIL squareTooltip: ${error?.stack ?? error}\n`);
  process.exit(1);
});
