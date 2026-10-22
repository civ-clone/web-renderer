// The open city screen's own handling of keys, clicks and updates (#484), with the real `City` window built under
//  linkedom: Enter on a focused button doesn't close the screen; a second specialist change before the city is updated
//  is not sent, naming a specialist the city no longer has; an update doesn't take the focus from a window open over
//  the screen; and the production picker opens once however often it is asked for while the worker answers, and not
//  at all once the screen has closed. The production action's picker opens once too.
// Updates reach the screen as they do in the game: collected into the shared `DataChanges` instance and `notify`d.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import { City as CityData, GameData } from '../../src/js/UI/types';
import i18next from 'i18next';
import City from '../../src/js/UI/components/City';
import CityBuildAction from '../../src/js/UI/components/Actions/CityBuild';
import Portal from '../../src/js/UI/components/Portal';
import Transport from '../../src/js/UI/Transport';
import { assetStore } from '../../src/js/UI/AssetStore';
import { instance as dataChanges } from '../../src/js/UI/lib/DataChanges';
import { setPreloadContainer } from '../../src/js/UI/lib/getPreloadedImage';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL cityWindow: stopped after ${checks} checks, before the end\n`
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

// linkedom has no canvas context: one that draws nothing, and reads back no pixels.
(globalThis as any).HTMLCanvasElement.prototype.getContext = () =>
  new Proxy(
    { getImageData: () => ({ data: [] }) } as { [key: string]: unknown },
    {
      get: (target, key: string) => (key in target ? target[key] : () => {}),
      set: (target, key: string, value) => {
        target[key] = value;

        return true;
      },
    }
  );

setPreloadContainer(document.querySelector('#preload') as HTMLElement);

// No assets: the citizens and the action's button are drawn without their images.
assetStore.firstImported = () => new Promise(() => {});
assetStore.get = () => new Promise(() => {});

// linkedom has no focus: what has it is set by hand.
let focused: Element | null = document.body;

Object.defineProperty(document, 'activeElement', {
  configurable: true,
  get: () => focused,
});

const player = {
    id: 'Player-1',
    civilization: {
      _: 'Babylonian',
      attributes: [{ name: 'colors', value: ['#ffffff', '#000000'] }],
    },
    world: { width: 10, height: 10, tiles: [] },
    treasuries: [],
    government: { _: 'Despotism' },
  },
  // A city of size 4 with two entertainers, as the screen reads it.
  cityData = (specialistIds: string[]): CityData => {
    const city = {
      _: 'City',
      id: 'City-1',
      name: 'Babylon',
      player,
      tile: { x: 2, y: 2, units: [] },
      tiles: [],
      tilesWorked: [],
      units: [],
      improvements: [],
      yields: [],
      specialists: specialistIds.map((id) => ({ _: 'Entertainer', id })),
      build: {
        id: 'CityBuild-1',
        building: null,
        auto: false,
        progress: { value: 0 },
        cost: { value: 0 },
        spendCost: [],
      },
      growth: {
        id: 'CityGrowth-1',
        progress: { value: 0 },
        cost: { value: 20 },
        size: 4,
      },
      tradeRoutes: [],
    };

    return Object.assign(city, {
      build: { ...city.build, city },
    }) as unknown as CityData;
  },
  // The city as an update leaves it, drawn on the next render.
  update = (city: CityData): void => {
    dataChanges.collect([city.id]);
    dataChanges.notify({ player: { cities: [city] } } as unknown as GameData);
  };

const portal = {
  emit: () => {},
  scale: () => 1,
  tileSize: () => 16,
} as unknown as Portal;

// What was sent, and the `CityBuildAvailable` requests, answered when the test says.
let sent: Array<{ name: string; id: string }> = [],
  requests: Array<(available: unknown[]) => void> = [];

const transport = {
  send: (_: string, action: { name: string; id: string }) => sent.push(action),
  request: () => new Promise((resolve) => requests.push(resolve as () => void)),
} as unknown as Transport;

const key = (element: Element, key: string, target: Element = element) => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
    );
  },
  windows = (): number => document.querySelectorAll('dialog.window').length,
  settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const run = async (): Promise<void> => {
  await i18next.init({ lng: 'en', resources: {} });

  // Enter on a focused button.

  let screen = new City(cityData(['S-1', 'S-2']), portal, transport);

  const button = screen.element().querySelector('div.build button')!;

  key(screen.element(), 'Enter', button);

  expect(
    'Enter on a focused button leaves the screen open',
    screen.element().isConnected,
    true
  );

  key(screen.element(), 'Enter');

  expect('Enter anywhere else closes it', screen.element().isConnected, false);

  screen = new City(cityData(['S-1', 'S-2']), portal, transport);
  key(
    screen.element(),
    'x',
    screen.element().querySelector('div.build button')!
  );

  expect(
    'X closes it even from a button, which X does not press',
    screen.element().isConnected,
    false
  );

  // A second specialist change before the city is updated.

  sent = [];
  screen = new City(cityData(['S-1', 'S-2']), portal, transport);

  const specialists = () =>
    screen.element().querySelectorAll('.specialist.clickable');

  specialists()[0].dispatchEvent(new Event('click'));
  specialists()[1].dispatchEvent(new Event('click'));
  key(screen.element(), '1');

  expect('a second change before the city is updated is not sent', sent, [
    { name: 'ChangeSpecialist', id: 'S-1' },
  ]);

  // The first is now a Tax Collector: a new specialist, with a new id.
  update(cityData(['S-3', 'S-2']));
  key(screen.element(), '2');

  expect('once it is, the next change is', sent, [
    { name: 'ChangeSpecialist', id: 'S-1' },
    { name: 'ChangeSpecialist', id: 'S-2' },
  ]);

  // The focus on an update.

  let focusTaken = 0;

  screen.element().focus = () => {
    focusTaken++;
  };

  const picker = document.createElement('dialog'),
    pickerButton = document.createElement('button');

  picker.className = 'window';
  picker.append(pickerButton);
  document.body.append(picker);
  focused = pickerButton;
  update(cityData(['S-3', 'S-4']));

  expect(
    'an update leaves the focus in a window open over the screen',
    focusTaken,
    0
  );

  focused = document.body;
  update(cityData(['S-3', 'S-5']));

  expect('and takes it back from the page', focusTaken, 1);

  picker.remove();
  screen.close();

  // The production picker.

  screen = new City(cityData(['S-1', 'S-2']), portal, transport);

  const before = windows();

  key(screen.element(), 'c');
  key(screen.element(), 'c');

  expect(
    'C pressed twice while the worker answers asks once',
    requests.length,
    1
  );

  requests.shift()!([]);
  await settle();

  expect('and opens one picker', windows() - before, 1);

  document
    .querySelectorAll('dialog.window')
    .forEach((window) => window !== screen.element() && window.remove());

  key(screen.element(), 'c');
  screen.close();
  requests.shift()!([]);
  await settle();

  expect(
    'a picker answered after the screen has closed does not open',
    windows(),
    0
  );

  // The production action's picker.

  const action = new CityBuildAction(
    {
      _: 'CityBuild',
      value: cityData([]).build,
    } as any,
    portal,
    transport
  );

  action.activate();
  action.activate();

  expect(
    'the production action asks once, pressed twice while the worker answers',
    requests.length,
    1
  );

  requests.shift()!([]);
  await settle();

  expect('and opens one picker', windows(), 1);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL cityWindow (${failures.length} of ${checks} checks)\n  ${failures
        .slice(0, 20)
        .join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS cityWindow (${checks} checks)\n`);

  // The screens' layout timers.
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL cityWindow: ${error.stack ?? error}\n`);
  process.exit(1);
});
