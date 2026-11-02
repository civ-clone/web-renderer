// The city screen under the new interface (#746), with the real `City` window built under linkedom: `openCity` picks the
//  layout by the interface; the strip across the top with the size, the garrison and the citizens, the specialists
//  changing on a click (#107); the yields with their names (#719); each improvement with its upkeep and the total, Sell
//  asking first (#684); the production card, "Nothing in production" with Choose, Buy with its price asking first and
//  pressed by B; the units in the city as buttons that make one active (#482); Previous, Rename and Next in the window's
//  footer, still there after a step (#676, #678); Enter on a focused button not closing it (#484); and a rival's city,
//  read-only, with nothing to press (#58). The behaviour itself is `City`'s, checked with the classic layout in
//  `cityWindow`.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import City, { classicCityLayout } from '../../src/js/UI/components/City';
import { City as CityData } from '../../src/js/UI/types';
import Portal from '../../src/js/UI/components/Portal';
import Transport from '../../src/js/UI/Transport';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';
import { assetStore } from '../../src/js/UI/AssetStore';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
import openCity from '../../src/js/UI/components/openCity';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL cityLayout: stopped after ${checks} checks, before the end\n`
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

// Nor a `MouseEvent`, which B presses Buy with.
(globalThis as any).MouseEvent ??= Event;

(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
};

// No assets: the citizens, icons and units are drawn without their images.
assetStore.firstImported = () => new Promise(() => {});
assetStore.get = () => new Promise(() => {});
assetStore.shownAtURL = () => new Promise(() => {});
assetStore.spriteURL = () => new Promise(() => {});

const babylonian = {
    _: 'Babylonian',
    attributes: [{ name: 'colors', value: ['#ffffff', '#000000'] }],
  },
  player = {
    id: 'Player-1',
    civilization: babylonian,
    world: { width: 10, height: 10, tiles: [] },
    treasuries: [{ id: 'Treasury-1', yield: { _: 'Gold' }, value: 300 }],
    government: { _: 'Monarchy' },
    cities: [] as CityData[],
  },
  rival = { ...player, id: 'Player-2' },
  unit = (id: string, owner: typeof player, active = false) => ({
    _: 'Warrior',
    id,
    active,
    player: owner,
    city: null,
    busy: active ? null : { _: 'Fortified' },
    improvements: [],
    attack: { value: 1 },
    defence: { value: 1 },
    movement: { value: 1 },
    moves: { value: 1 },
  }),
  // A size-4 city with two entertainers, a Barracks it pays 1 gold a turn for and could sell, and a Palace.
  cityData = (id: string, name: string, extra: object = {}): CityData => {
    const city: any = {
      _: 'City',
      id,
      name,
      originalPlayer: player,
      player,
      tile: { x: 2, y: 2, units: [] },
      tiles: [],
      tilesWorked: [],
      units: [],
      improvements: [
        {
          _: 'Barracks',
          id: `${id}-Barracks`,
          saleValue: [{ resource: { _: 'Gold' }, value: 40 }],
        },
        { _: 'Palace', id: `${id}-Palace`, saleValue: [] },
      ],
      yields: [
        {
          _: 'CityImprovementMaintenanceGold',
          __: ['CityImprovementMaintenanceGold', 'Gold', 'Yield'],
          value: -1,
          cityImprovement: { id: `${id}-Barracks` },
        },
      ],
      specialists: [
        { _: 'Entertainer', id: `${id}-S-1` },
        { _: 'Entertainer', id: `${id}-S-2` },
      ],
      build: {
        id: `${id}-Build`,
        building: null,
        auto: false,
        progress: { value: 0 },
        cost: { value: 0 },
        spendCost: [],
      },
      growth: {
        id: `${id}-Growth`,
        progress: { value: 0 },
        cost: { value: 20 },
        size: 4,
      },
      tradeRoutes: [],
      ...extra,
    };

    city.build = { ...city.build, city };

    return city as CityData;
  };

const emitted: [string, unknown][] = [],
  portal = {
    emit: (event: string, value: unknown) => emitted.push([event, value]),
    scale: () => 1,
    tileSize: () => 16,
  } as unknown as Portal;

let sent: { name: string; id: string }[] = [];

const transport = {
  send: (_: string, action: { name: string; id: string }) => sent.push(action),
  request: () => new Promise(() => {}),
} as unknown as Transport;

const key = (element: Element, key: string, target: Element = element) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
    ),
  click = (element: Element | null) =>
    element!.dispatchEvent(new Event('click', { bubbles: true })),
  text = (element: Element | null) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  texts = (elements: NodeListOf<Element> | Element[]) =>
    Array.from(elements).map((element) => text(element)),
  confirmations = () => document.querySelectorAll('.confirmationWindow'),
  clearConfirmations = () =>
    confirmations().forEach((window) => window.remove()),
  settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-unit/en');

  // The layout follows the interface.
  applyInterface('classic', null);

  const classic = openCity(cityData('City-0', 'Kish'), portal, transport);

  expect(
    'the classic interface opens the classic screen',
    [
      classic.hasClass('city-screen-window'),
      classic.element().querySelectorAll('.city-screen').length,
    ],
    [true, 1]
  );

  classic.close();

  applyInterface('new', null);

  const owner = { ...player, cities: [] as CityData[] },
    [first, second] = [
      cityData('City-A', 'Babylon', {
        player: owner,
        tile: {
          x: 2,
          y: 2,
          units: [unit('Unit-1', owner as any), unit('Unit-2', rival as any)],
        },
      }),
      cityData('City-B', 'Ur', { player: owner }),
    ];

  owner.cities.push(first, second);

  const screen = openCity(first, portal, transport),
    element = screen.element(),
    q = (selector: string) => element.querySelector(selector),
    qa = (selector: string) => element.querySelectorAll(selector);

  await settle();

  expect(
    'the new interface opens the new screen, a window with the City eyebrow',
    [
      screen.hasClass('ui-city-window'),
      qa('.ui-city').length,
      text(q('.ui-window-eyebrow')),
      text(q(':scope > header h3')),
    ],
    [true, 1, 'City', 'Babylon']
  );

  // The strip across the top.
  expect(
    'the size, and the units of its own in the city',
    [text(q('.ui-city-size')), text(q('.ui-city-garrison'))],
    ['Size 41 unit in the city', '1 unit in the city']
  );

  sent = [];
  click(qa('.ui-city-header .specialist.clickable')[0]);

  expect('a specialist in the strip changes on a click', sent, [
    { name: 'ChangeSpecialist', id: 'City-A-S-1' },
  ]);

  // The yields, each named.
  expect(
    'the yields, each with its name',
    texts(qa('.yields-detail .yield-row .name')),
    ['Food', 'Production', 'Trade', 'Luxuries', 'Gold', 'Research']
  );

  // The improvements.
  const rows = qa('.ui-city-improvement');

  expect(
    'each improvement, its upkeep, and Sell only where it can be sold',
    Array.from(rows).map((row) => [
      text(row.querySelector('.name')),
      row.querySelector('.ui-city-gold')?.getAttribute('title') ?? null,
      row.querySelectorAll('button.sell').length,
    ]),
    [
      ['Barracks', 'Upkeep: 1 gold a turn', 1],
      ['Palace', null, 0],
    ]
  );
  expect(
    'and the upkeep they come to',
    q('.ui-city-upkeep-total .ui-city-gold')?.getAttribute('title'),
    'Upkeep: 1 gold a turn'
  );

  click(rows[0].querySelector('button.sell'));

  expect('Sell asks first', confirmations().length, 1);

  clearConfirmations();

  // The production card, with nothing chosen.
  expect(
    'nothing chosen: said, with Choose as the card’s main button',
    [
      text(q('.ui-city-production h3')),
      texts(qa('.ui-city-production-actions button.btn-primary')),
    ],
    ['Nothing in production', ['Choose']]
  );

  // Enter on a focused button presses it rather than closing the screen (#484).
  key(element, 'Enter', q('.ui-city-production-actions button')!);

  expect(
    'Enter on a focused button leaves the screen open',
    element.isConnected,
    true
  );

  // The units in the city: one of its own is a button, named, that makes it the active unit; a rival's isn't.
  const portraits = qa('.ui-city-units-strip .ui-city-unit');

  expect(
    'the units in the city, named, the player’s own a button',
    Array.from(portraits).map((portrait) => [
      portrait.tagName.toLowerCase(),
      portrait.getAttribute('title'),
    ]),
    [
      ['button', 'Warrior (Fortified)'],
      ['span', 'Warrior (Fortified)'],
    ]
  );

  sent = [];
  emitted.length = 0;
  click(portraits[0]);
  // A list of one chooses itself once it's built.
  await settle();

  expect(
    'pressing one wakes it, then makes it the active unit',
    [sent, emitted.map(([event, value]) => [event, (value as any).id])],
    [[{ name: 'InactiveUnit', id: 'Unit-1' }], [['activate-unit', 'Unit-1']]]
  );

  // The other cities, in the window's footer.
  const footerButtons = () =>
    texts(element.querySelectorAll(':scope > .ui-window-footer button'));

  expect('Previous, Rename and Next are the window’s footer', footerButtons(), [
    'Previous city',
    'Rename',
    'Next city',
  ]);

  click(element.querySelector(':scope > .ui-window-footer button.next'));
  await settle();

  expect(
    'Next shows the next city, and the footer still has its buttons',
    [text(q(':scope > header h3')), footerButtons()],
    ['Ur', ['Previous city', 'Rename', 'Next city']]
  );

  screen.close();

  // Building something, with a price to buy it.
  const building = cityData('City-C', 'Nineveh', {
    build: {
      id: 'City-C-Build',
      building: {
        item: { _: 'Library', __: ['Library', 'CityImprovement'] },
      },
      auto: false,
      progress: { value: 20 },
      cost: { value: 60 },
      spendCost: [{ resource: { _: 'Gold' }, value: 120 }],
    },
  });

  const buying = openCity(building, portal, transport);

  expect(
    'the item, and Buy with its price',
    [
      text(buying.element().querySelector('.ui-city-production h3')),
      text(buying.element().querySelector('button.buy')),
    ],
    ['Library', 'Buy for 120 Gold']
  );

  click(buying.element().querySelector('button.buy'));

  expect('Buy asks first', confirmations().length, 1);

  clearConfirmations();
  key(buying.element(), 'b');

  expect('and so does B', confirmations().length, 1);

  clearConfirmations();
  buying.close();

  // A rival's city, as a Diplomat investigates it: nothing to press.
  const investigated = openCity(
      cityData('City-D', 'Susa', {
        tile: { x: 2, y: 2, units: [unit('Unit-3', player)] },
      }),
      portal,
      transport,
      { readOnly: true }
    ),
    shown = investigated.element();

  await settle();

  expect(
    'a rival’s city: no specialists, Sell, production buttons, unit buttons, or cities to step to',
    [
      shown.querySelectorAll('.specialist.clickable').length,
      shown.querySelectorAll('button.sell').length,
      shown.querySelectorAll('.ui-city-production-actions').length,
      shown.querySelectorAll('button.ui-city-unit').length,
      texts(shown.querySelectorAll(':scope > .ui-window-footer button')),
    ],
    [0, 0, 0, 0, ['Close']]
  );

  investigated.close();

  // The classic layout is still `City`'s own.
  const plain = new City(cityData('City-E', 'Lagash'), portal, transport);

  expect(
    'without a layout, City draws the classic one',
    plain.hasClass(`${classicCityLayout.window.classes}`),
    true
  );

  plain.close();

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL cityLayout (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS cityLayout (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL cityLayout: ${error.stack ?? error}\n`);
  process.exit(1);
});
