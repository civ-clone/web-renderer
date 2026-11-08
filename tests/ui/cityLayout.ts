// The city screen under the new interface (#746), with the real `City` window built under linkedom: `openCity` picks the
//  layout by the interface; the strip across the top with the size, the garrison and the citizens, the specialists
//  changing on a click (#107); the yields with their names (#719); each improvement with its upkeep and the total, Sell
//  asking first (#684) about that row's improvement; the city's Wonders, sent among them, in a section of their own;
//  the production card, "Nothing in production" with Choose, Buy with its price asking first and pressed by B; the
//  units in the city as buttons that make one active (#482); Previous, Rename and Next in the window's footer, still
//  there after a step (#676, #678); Enter on a focused button not closing it (#484); and a rival's city, read-only,
//  with nothing to press (#58). The behaviour itself is `City`'s, checked with the classic layout in `cityWindow`.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/grids';

import City, { classicCityLayout } from '../../src/js/UI/components/City';
import { City as CityData } from '../../src/js/UI/types';
import Portal from '../../src/js/UI/components/Portal';
import Transport from '../../src/js/UI/Transport';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';
import { assetStore } from '../../src/js/UI/AssetStore';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
import openCity from '../../src/js/UI/components/openCity';
import { turnsLeft } from '../../src/js/UI/lib/cityTurns';
import { turnsText } from '../../src/js/UI/components/lib/cityYields';

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
          __: ['Barracks', 'CityImprovement', 'Buildable'],
          id: `${id}-Barracks`,
          saleValue: [{ resource: { _: 'Gold' }, value: 40 }],
        },
        {
          _: 'Palace',
          __: ['Palace', 'CityImprovement', 'Buildable'],
          id: `${id}-Palace`,
          saleValue: [],
        },
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
  // The headed sections in a column after the production card, each with its rows' names, or what it says instead.
  sections = (column: Element) =>
    Array.from(column.querySelectorAll(':scope > .ui-city-section')).map(
      (section) => [
        text(section.querySelector('h3')),
        texts(
          section.querySelectorAll('.ui-city-improvement .name, .ui-city-empty')
        ),
      ]
    ),
  confirmations = () => document.querySelectorAll('.confirmationWindow'),
  clearConfirmations = () =>
    confirmations().forEach((window) => window.remove()),
  settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-wonder/en');

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

  applyInterface('modern', null);

  const owner = { ...player, cities: [] as CityData[] },
    [first, second] = [
      cityData('City-A', 'Babylon', {
        player: owner,
        improvements: [
          {
            _: 'Colossus',
            __: ['Colossus', 'Wonder', 'CityImprovement', 'Buildable'],
            id: 'City-A-Colossus',
            saleValue: [],
          },
          ...cityData('City-A', 'Babylon').improvements,
        ],
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

  // The improvements, then the Wonders, which the engine sends among them.
  const rows = qa('.ui-city-improvement');

  expect(
    'each improvement, its upkeep, and Sell only where it can be sold; then the Wonders, with neither',
    Array.from(rows).map((row) => [
      text(row.querySelector('.name')),
      row.querySelector('.ui-city-gold')?.getAttribute('title') ?? null,
      row.querySelectorAll('button.sell').length,
    ]),
    [
      ['Barracks', 'Upkeep: 1 gold a turn', 1],
      ['Palace', null, 0],
      ['Colossus', null, 0],
    ]
  );
  expect(
    'the Wonders in a section of their own, below the improvements',
    sections(q('.ui-city-right')!),
    [
      ['Improvements', ['Barracks', 'Palace']],
      ['Wonders', ['Colossus']],
    ]
  );
  expect(
    'and the upkeep they come to',
    q('.ui-city-upkeep-total .ui-city-gold')?.getAttribute('title'),
    'Upkeep: 1 gold a turn'
  );

  click(rows[0].querySelector('button.sell'));

  // The rows are in their own order, not the engine's: Sell is still for its row's improvement.
  expect(
    'Sell asks first, about that row’s improvement',
    [
      confirmations().length,
      text(confirmations()[0])?.includes('Barracks') ?? false,
    ],
    [1, true]
  );

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

  expect(
    'Previous and Next show the arrow keys that do the same (#814)',
    ['previous', 'next'].map((name) => {
      const found = element.querySelector<HTMLElement>(
        `:scope > .ui-window-footer button.${name}`
      );

      return [found?.dataset.hotkey, found?.getAttribute('aria-keyshortcuts')];
    }),
    [
      ['←', 'ArrowLeft'],
      ['→', 'ArrowRight'],
    ]
  );

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

  // A city with Wonders and no improvements lists them, saying it has no improvements; one with neither says only that.
  const listed = (wonders: string[]) => {
    const window = openCity(
        cityData(`City-W${wonders.length}`, 'Eridu', {
          improvements: wonders.map((wonder) => ({
            _: wonder,
            __: [wonder, 'Wonder', 'CityImprovement', 'Buildable'],
            id: `Eridu-${wonder}`,
            saleValue: [],
          })),
          yields: [],
        }),
        portal,
        transport
      ),
      section = window.element().querySelector('.ui-city-right');

    window.close();

    return sections(section!);
  };

  expect('Wonders alone are listed', listed(['Pyramids', 'GreatLibrary']), [
    ['Improvements', ['No improvements yet']],
    ['Wonders', ['Pyramids', 'Great Library']],
  ]);
  expect('and with neither, the city says so', listed([]), [
    ['Improvements', ['No improvements yet']],
  ]);

  // Under rules that charge upkeep for a Wonder, each section's total is its own rows'.
  const charged = openCity(
      cityData('City-U', 'Uruk', {
        improvements: [
          {
            _: 'Colossus',
            __: ['Colossus', 'Wonder', 'CityImprovement', 'Buildable'],
            id: 'City-U-Colossus',
            saleValue: [],
          },
          ...cityData('City-U', 'Uruk').improvements,
        ],
        yields: [
          ...cityData('City-U', 'Uruk').yields,
          {
            _: 'CityImprovementMaintenanceGold',
            __: ['CityImprovementMaintenanceGold', 'Gold', 'Yield'],
            value: -2,
            cityImprovement: { id: 'City-U-Colossus' },
          },
        ],
      }),
      portal,
      transport
    ),
    totals = Array.from(
      charged.element().querySelectorAll('.ui-city-right > .ui-city-section')
    ).map((section) => [
      text(section.querySelector('h3')),
      section
        .querySelector('.ui-city-upkeep-total .ui-city-gold')
        ?.getAttribute('title') ?? null,
    ]);

  charged.close();

  expect(
    'a Wonder’s upkeep is counted under Wonders, not Improvements',
    totals,
    [
      ['Improvements', 'Upkeep: 1 gold a turn'],
      ['Wonders', 'Upkeep: 2 gold a turn'],
    ]
  );

  // At the size the rules cap it at, the figures say what it needs, not the turns to a growth that won't happen (#781).
  const capped = openCity(
    cityData('City-F', 'Eridu', {
      player: owner,
      growth: {
        id: 'City-F-Growth',
        progress: { value: 5 },
        cost: { value: 20 },
        size: 10,
        limit: { size: 10, needs: 'Aqueduct' },
      },
    }),
    portal,
    transport
  );

  await settle();

  expect(
    'a city capped at its size: what it needs, in place of the turns',
    text(capped.element().querySelector('.ui-city-growth .turns')),
    'Needs an Aqueduct'
  );

  capped.close();

  // Each improvement and Wonder with its icon from SP299.PIC, and the production card when it builds one (#64). The
  //  icons are optional: one the player hasn't imported isn't drawn.
  // Nothing imported, through the store's own `has`: no icons, and no gap for them.
  const plainIcons = openCity(
    cityData('City-I', 'Kish', { player: owner }),
    portal,
    transport
  );

  await settle();

  expect(
    'icons not imported: each row has an empty icon, and the name alone',
    Array.from(
      plainIcons
        .element()
        .querySelectorAll('.ui-city-improvement .building-icon')
    ).map((icon) => icon.childElementCount),
    [0, 0]
  );

  plainIcons.close();

  const has = assetStore.has,
    shownAtURL = assetStore.shownAtURL;

  assetStore.has = async (key: string) => !key.includes('barracks');
  assetStore.shownAtURL = async (key: string) => `sprite:${key}`;

  const iconed = openCity(
    cityData('City-G', 'Nippur', {
      player: owner,
      improvements: [
        {
          _: 'Colossus',
          __: ['Colossus', 'Wonder', 'CityImprovement', 'Buildable'],
          id: 'City-G-Colossus',
          saleValue: [],
        },
        ...cityData('City-G', 'Nippur').improvements,
      ],
    }),
    portal,
    transport
  );

  const wonderBuild = {
    ...cityData('City-H', 'Larsa', { player: owner }),
  } as CityData;

  wonderBuild.build = {
    ...wonderBuild.build,
    building: {
      item: { _: 'Pyramids', __: ['Pyramids', 'Wonder', 'Buildable'] },
    },
    cost: { value: 120 },
    progress: { value: 30 },
  } as unknown as CityData['build'];

  const card = openCity(wonderBuild, portal, transport);

  await settle();
  await settle();

  const icons = (screen: { element(): HTMLElement }, selector: string) =>
    Array.from(screen.element().querySelectorAll(selector)).map(
      (icon) => icon.querySelector('img')?.getAttribute('src') ?? ''
    );

  expect(
    'improvements with their icons, a Wonder with its own, and none where it was not imported',
    icons(iconed, '.ui-city-improvement .building-icon'),
    [
      '',
      'sprite:./assets/city-improvements/palace.png',
      'sprite:./assets/wonders/colossus.png',
    ]
  );
  expect(
    'the production card building a Wonder shows its icon',
    icons(card, '.ui-city-production header .building-icon'),
    ['sprite:./assets/wonders/pyramids.png']
  );

  iconed.close();
  card.close();
  assetStore.has = has;
  assetStore.shownAtURL = shownAtURL;

  // Shown before: drawn as the row is, not after the store answers.
  const cachedURL = assetStore.cachedURL;

  assetStore.cachedURL = (key: string) => `cached:${key}`;

  const again = openCity(
    cityData('City-J', 'Uruk', { player: owner }),
    portal,
    transport
  );

  expect(
    'an icon shown before is drawn at once',
    icons(again, '.ui-city-improvement .building-icon'),
    [
      'cached:./assets/city-improvements/barracks.png',
      'cached:./assets/city-improvements/palace.png',
    ]
  );

  again.close();
  assetStore.cachedURL = cachedURL;

  // What the city builds next (#774): each item, its turns from nothing at the city's production, and Up, Down and
  //  Remove, which send the edit as the city's ChangeProduction.
  const queuedCity = cityData('City-K', 'Eshnunna', { player: owner });

  queuedCity.build = {
    ...queuedCity.build,
    building: {
      item: { _: 'Barracks', __: ['Barracks', 'CityImprovement', 'Buildable'] },
    },
    cost: { value: 40 },
    progress: { value: 10 },
    queue: [
      {
        item: { _: 'Temple', __: ['Temple', 'CityImprovement', 'Buildable'] },
        cost: { value: 40 },
      },
      {
        item: { _: "Magellan'sExpedition", __: ['Wonder', 'Buildable'] },
        cost: { value: 400 },
      },
    ],
  } as unknown as CityData['build'];

  const turnsFor = (cost: number): string =>
      turnsText(
        turnsLeft(
          { cost: { value: cost }, progress: { value: 0 } } as any,
          queuedCity.yields,
          'Production'
        )
      ),
    queued = openCity(queuedCity, portal, transport),
    queueRows = Array.from(
      queued.element().querySelectorAll('.ui-city-queue .ui-city-queued')
    ),
    labels = (row: Element) =>
      Array.from(row.querySelectorAll('button')).map((button) =>
        button.getAttribute('aria-label')
      );

  expect(
    'the queue under the progress: each item and its turns from nothing',
    queueRows.map((row) => [
      text(row.querySelector('.name')),
      text(row.querySelector('.turns')),
    ]),
    [
      ['Then: Temple', turnsFor(40)],
      ["Then: Magellan'sExpedition", turnsFor(400)],
    ]
  );
  expect(
    'the first moves down, the last up, and each is removed',
    queueRows.map(labels),
    [
      ['Move Temple down', 'Remove Temple from the queue'],
      [
        "Move Magellan'sExpedition up",
        "Remove Magellan'sExpedition from the queue",
      ],
    ]
  );

  sent = [];
  click(queueRows[1].querySelector('button'));
  click(queueRows[0].querySelectorAll('button')[1]);

  expect('Up and Remove send the edit', sent, [
    {
      name: 'ChangeProduction',
      id: queuedCity.build.id,
      queue: {
        op: 'move',
        index: 1,
        to: 0,
        queued: ['Temple', "Magellan'sExpedition"],
      },
    },
    {
      name: 'ChangeProduction',
      id: queuedCity.build.id,
      queue: {
        op: 'remove',
        index: 0,
        queued: ['Temple', "Magellan'sExpedition"],
      },
    },
  ]);

  queued.close();

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
