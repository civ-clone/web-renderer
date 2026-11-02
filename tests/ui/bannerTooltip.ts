// The tooltip over a city's banner on the map (#747), with the real `GamePortal` under linkedom and a layer that says
//  whose banner is where: a mouse resting on one of your cities' banners opens it after the shared tooltip's delay,
//  under the banner, with what the city is building and how it grows; a rival's banner, a touch, or a held button
//  opens nothing; and leaving the banner, a press, a key or the map moving closes it.

// Must stay first: `GamePortal` reaches windows that read `document.body` as they load.
import { document } from './lib/dom';

import { City, Yield } from '../../src/js/UI/types';
import { assetStore } from '../../src/js/UI/AssetStore';
import GamePortal from '../../src/js/UI/components/GamePortal';
import Map from '../../src/js/UI/components/Map';
import { Rect } from '../../src/js/UI/lib/viewport';
import World from '../../src/js/UI/components/World';
import cityBannerTooltip from '../../src/js/UI/components/Map/cityBannerTooltip';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';

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

// What a click lands on, which the press in the checks below asks for.
(document as any).elementFromPoint = () => null;

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
  // Where the banner is drawn on the canvas.
  box: Rect = { x: 30, y: 40, width: 50, height: 12 };

// Whose banner is under the pointer, wherever it is: set by each check.
let banner: City | null = null;

class Banners extends Map {
  bannerAt(): { city: City; box: Rect } | null {
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
    { pointerType = 'mouse', buttons = 0 } = {}
  ): void => {
    const event = new Event(type, { cancelable: true });

    banner = over;

    Object.entries({
      buttons,
      clientX: 40,
      clientY: 45,
      isPrimary: true,
      offsetX: 40,
      offsetY: 45,
      pageX: 40,
      pageY: 45,
      pointerId: 7,
      pointerType,
      x: 40,
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
  await import('../../translations/local/en');
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
  pointer('pointerdown', ours, { buttons: 1 });

  expect('a press closes it', shown(), false);

  pointer('pointerup', ours);
  await rest(null);
  await rest(ours);
  document.dispatchEvent(new Event('keydown'));

  expect('a key closes it', shown(), false);

  await rest(null);
  await rest(ours);
  portal.setCenter(5, 5);

  expect('the map moving closes it', shown(), false);

  await rest(null);
  await rest(ours);
  canvas.dispatchEvent(new Event('pointerleave'));

  expect('the mouse leaving the map closes it', shown(), false);

  pointer('pointermove', ours);
  canvas.dispatchEvent(new Event('pointerleave'));
  await wait(450);

  expect('leaving before the delay, it never opens', shown(), false);

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
