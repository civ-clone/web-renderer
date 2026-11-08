// The tooltip over a city's banner on the map (#747), with the real `GamePortal` under linkedom and a layer that says
//  whose banner is where: a mouse resting on one of your cities' banners opens it after the shared tooltip's delay,
//  under the banner, with what the city is building and how it grows; a rival's banner, a touch, or a held button
//  opens nothing; and leaving the banner, a press, a key or the map moving closes it.

// Must stay first: `GamePortal` reaches windows that read `document.body` as they load.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/classicInterface';
import './lib/grids';

import { City, Yield } from '@civ-clone/ui-protocol/types';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import GamePortal from '@civ-clone/ui-windows/components/GamePortal';
import Map from '@civ-clone/ui-map/components/Map';
import { Rect } from '@civ-clone/ui-map/lib/viewport';
import World from '@civ-clone/ui-map/components/World';
import { hideTooltip } from '@civ-clone/ui-component-tooltip/Tooltip';
import cityBannerTooltip from '@civ-clone/ui-windows/components/Map/cityBannerTooltip';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

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
    process.stderr.write('FAIL bannerTooltip: stopped before the checks ran\n');
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

// What's under the pointer in the window: the map, unless a check puts a window over it.
let under: Element | null = null;

(document as any).elementFromPoint = () => under;

assetStore.spriteURL = () => new Promise(() => {});
assetStore.shownAtURL = () => new Promise(() => {});

const yieldOf = (_: string, value: number) =>
    ({ _, __: [_, 'Yield'], id: `Yield-${_}`, value } as unknown as Yield),
  item = (_: string) => ({ _, __: [] }),
  // A city of ours building a Bank, 20 of 120 shields at 10 a turn, and growing 12 of 30 food at 3 a turn.
  ours = {
    id: 'City-1',
    name: 'Babylon',
    player: { id: 'Player-1' },
    originalPlayer: { civilization: { _: 'Babylonian' } },
    tile: { x: 1, y: 1 },
    yields: [yieldOf('Production', 10), yieldOf('Food', 3)],
    build: {
      building: { item: item('Bank') },
      progress: { value: 20 },
      cost: { value: 120 },
    },
    growth: { size: 5, progress: { value: 12 }, cost: { value: 30 } },
  } as unknown as City,
  // A rival's, of which only its name and size are known (#274).
  theirs = {
    id: 'City-2',
    name: 'Thebes',
    player: { id: 'Player-2' },
    originalPlayer: { civilization: { _: 'Egyptian' } },
    tile: { x: 6, y: 6 },
    growth: { size: 3 },
  } as unknown as City,
  // Where the banner is drawn on the canvas, as it is to begin with.
  firstBox: Rect = { x: 30, y: 40, width: 50, height: 12 };

// Where it's drawn now: a banner widens with what it says.
let box = firstBox;

// Whose banner is under the pointer, wherever it is: set by each check.
let banner: City | null = null;

// How often the portal has asked whose banner is where.
let asked = 0;

class Banners extends Map {
  bannerAt(): { city: City; box: Rect } | null {
    asked++;

    return banner === null ? null : { city: banner, box };
  }
}

const tiles: any[] = [];

for (let x = 0; x < 8; x++) {
  for (let y = 0; y < 8; y++) {
    tiles.push({ x, y, yields: [], improvements: [], city: null, units: [] });
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
const pointer = (
    type: string,
    over: City | null,
    { pointerType = 'mouse', buttons = 0, x = 40 } = {}
  ): void => {
    const event = new Event(type, { cancelable: true });

    banner = over;

    Object.entries({
      buttons,
      clientX: x,
      clientY: 45,
      isPrimary: true,
      offsetX: x,
      offsetY: 45,
      pageX: x,
      pageY: 45,
      pointerId: 7,
      pointerType,
      x,
      y: 45,
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
  // Rests on the banner long enough for its tooltip.
  rest = async (over: City | null, options = {}) => {
    pointer('pointermove', over, options);

    await wait(450);
  };

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');
  await import('../../translations/civ1-city-improvement/en');

  // What it says.
  expect(
    'your city: what it builds and how it grows',
    cityBannerTooltip(ours),
    {
      title: 'Babylon',
      rows: [
        ['Bank', '20 / 120 · 10 turns'],
        ['Grows to size 6', '12 / 30 · 6 turns'],
      ],
    }
  );
  expect(
    'building nothing: a dash, as the banner shows',
    cityBannerTooltip({
      ...ours,
      build: { ...ours.build, building: null },
    } as City).rows[0],
    ['Nothing in production', '–']
  );
  expect(
    'starving: the store and that it is starving, not how long until it grows',
    cityBannerTooltip({
      ...ours,
      yields: [yieldOf('Production', 10), yieldOf('Food', -2)],
    } as City).rows[1],
    ['Grows to size 6', '12 / 30 · Starving']
  );
  expect(
    "at the size the rules cap it at: what it needs, not the turns to a growth that won't happen (#781)",
    cityBannerTooltip({
      ...ours,
      growth: { ...ours.growth, limit: { size: 5, needs: 'Aqueduct' } },
    } as City).rows[1],
    ['Grows to size 6', 'Needs an Aqueduct']
  );
  expect(
    'capped and starving: starving, which matters more',
    cityBannerTooltip({
      ...ours,
      growth: { ...ours.growth, limit: { size: 5, needs: 'Aqueduct' } },
      yields: [yieldOf('Production', 10), yieldOf('Food', -2)],
    } as City).rows[1],
    ['Grows to size 6', '12 / 30 · Starving']
  );
  expect(
    'an improvement without a sentence of its own: its name',
    cityBannerTooltip({
      ...ours,
      growth: { ...ours.growth, limit: { size: 5, needs: 'Granary' } },
    } as City).rows[1],
    ['Grows to size 6', 'Needs Granary']
  );

  // When it opens.
  pointer('pointermove', ours);
  await wait(200);

  expect('not before the delay', shown(), false);

  await wait(250);

  expect(
    'after it, over your own banner',
    [shown(), says().title],
    [true, 'Babylon']
  );
  expect(
    "under the banner, from the banner's left, on the window",
    [panel()?.style.left, panel()?.style.top],
    ['130px', `${50 + 40 + 12 + 4}px`]
  );

  pointer('pointermove', ours);

  expect('moving on the same banner keeps it open', shown(), true);

  pointer('pointermove', null);

  expect('moving off the banner closes it', shown(), false);

  await rest(theirs);

  expect("a rival's banner has nothing more to say", shown(), false);

  await rest(ours, { pointerType: 'touch' });

  expect('nor does a touch, which is the long press', shown(), false);

  await rest(null);
  await rest(ours, { buttons: 1 });

  expect('nor a mouse with a button held', shown(), false);

  // What closes it.
  await rest(null);
  await rest(ours);
  expect('open, before: a press closes it', shown(), true);
  pointer('pointerdown', ours, { buttons: 1 });

  expect('a press closes it', shown(), false);

  pointer('pointerup', ours);
  await rest(null);
  await rest(ours);
  expect('open, before: a key closes it', shown(), true);
  document.dispatchEvent(new Event('keydown'));

  expect('a key closes it', shown(), false);

  await rest(null);
  await rest(ours);
  expect('open, before: the map moving closes it', shown(), true);
  portal.setCenter(5, 5);

  expect('the map moving closes it', shown(), false);

  await rest(null);
  await rest(ours);
  expect('open, before: the mouse leaving the map closes it', shown(), true);
  canvas.dispatchEvent(new Event('pointerleave'));

  expect('the mouse leaving the map closes it', shown(), false);

  pointer('pointermove', ours);
  canvas.dispatchEvent(new Event('pointerleave'));
  await wait(450);

  expect('leaving before the delay, it never opens', shown(), false);

  // A fling: the map glides on after the press is let go.
  const frames = (globalThis as any).window;

  frames.requestAnimationFrame ??= (callback: (now: number) => void) =>
    setTimeout(() => callback(performance.now()), 16);
  frames.cancelAnimationFrame ??= (handle: number) => clearTimeout(handle);

  await rest(null);
  pointer('pointerdown', null, { buttons: 1, x: 40 });

  for (let x = 30; x >= 0; x -= 10) {
    await wait(5);
    pointer('pointermove', null, { buttons: 1, x });
  }

  pointer('pointerup', null, { x: 0 });
  asked = 0;
  pointer('pointermove', ours);

  expect(
    "while the map glides on after a fling, resting on a banner doesn't start a tooltip: it would open where the banner was",
    asked,
    0
  );

  portal.setCenter(4, 4);
  await rest(null);
  await rest(ours);

  expect('once it has stopped, it opens again', shown(), true);

  pointer('pointermove', ours);
  await wait(200);
  document.dispatchEvent(new Event('keydown'));
  await wait(250);

  expect('a key while it waits: it never opens', shown(), false);

  const report = document.createElement('dialog');

  await rest(null);
  pointer('pointermove', ours);
  await wait(200);
  under = report;
  await wait(250);
  under = canvas;

  expect(
    'a window opened over the map while it waits: it never opens over it',
    shown(),
    false
  );

  await rest(null);
  await rest(ours);
  hideTooltip();
  await rest(ours);

  expect(
    'closed by something else (a list scrolling): resting on the banner opens it again',
    shown(),
    true
  );

  pointer('pointermove', { ...ours } as City);

  expect(
    'the same city with its data replaced is the same banner: it stays open',
    shown(),
    true
  );

  await rest(null);
  pointer('pointermove', ours);
  await wait(200);
  banner = {
    ...ours,
    build: { ...ours.build, progress: { value: 50 } },
  } as unknown as City;
  await wait(250);

  expect(
    'what the city is building as it is when it opens, not when the mouse arrived',
    says().rows.slice(0, 2),
    ['Bank', '50 / 120 · 7 turns']
  );

  // The city changing while it's open (#780, Copilot).
  const square = (x: number, y: number) =>
    tiles.find((tile) => tile.x === x && tile.y === y);

  banner = {
    ...ours,
    build: { ...ours.build, progress: { value: 90 } },
  } as unknown as City;
  portal.build([square(5, 5)]);

  expect(
    'another square changing leaves it as it is',
    says().rows.slice(0, 2),
    ['Bank', '50 / 120 · 7 turns']
  );

  box = { x: 26, y: 40, width: 58, height: 12 };
  portal.build([square(1, 1)]);

  expect(
    "its city's square changing: it says what the city's doing now, and moves with its banner",
    [shown(), ...says().rows.slice(0, 2), panel()?.style.left],
    [true, 'Bank', '90 / 120 · 3 turns', '126px']
  );

  box = firstBox;

  banner = null;
  portal.build([square(1, 1)]);

  expect('its banner gone (the city lost): it goes too', shown(), false);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL bannerTooltip (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS bannerTooltip (${checks} checks)\n`);
};

run().catch((error) => {
  process.stderr.write(`FAIL bannerTooltip: ${error?.stack ?? error}\n`);
  process.exit(1);
});
