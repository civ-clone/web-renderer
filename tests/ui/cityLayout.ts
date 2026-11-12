// The city screen under the new interface (#746), with the real `City` window built under linkedom: `openCity` picks the
//  layout by the interface; the strip across the top with the size, the garrison and the citizens, the specialists
//  changing on a click (#107); the yields with their names (#719); each improvement with its upkeep and the total, Sell
//  asking first (#684) about that row's improvement; the city's Wonders, sent among them, in a section of their own;
//  the production card, "Nothing in production" with Choose, Buy with its price asking first and pressed by B; the
//  units in the city as buttons that make one active (#482); Previous, Rename and Next in the window's footer, still
//  there after a step (#676, #678); Enter on a focused button not closing it (#484); and a rival's city, read-only,
//  with nothing to press (#58). The city's map on a staggered isometric world (#97): its squares placed with their
//  real neighbours across both seams, buttons clipped to diamonds, and arrow keys that reach every square. The
//  behaviour itself is `City`'s, checked with the classic layout in `cityWindow`.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/grids';

import City from '@civ-clone/ui-city/components/City';
import classicCityLayout from '@civ-clone/ui-interface-classic/components/classicCityLayout';
import { City as CityData, GameData } from '@civ-clone/ui-protocol/types';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { applyInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { instance as dataChanges } from '@civ-clone/ui-client/lib/DataChanges';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import openCity from '@civ-clone/ui-city/components/openCity';
import { turnsLeft } from '@civ-clone/ui-client/lib/cityTurns';
import { turnsText } from '@civ-clone/ui-city/components/lib/cityYields';
import { PlayerTile } from '@civ-clone/ui-protocol/types';
import { Projection } from '@civ-clone/ui-map/lib/projection';
import World from '@civ-clone/ui-map/components/World';
import cityMapLayout from '@civ-clone/ui-map/lib/cityMapLayout';
import isoJson from './fixtures/iso-tileset.json';
import projectionFor from '@civ-clone/ui-map/lib/projectionFor';
import { readDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import { renderMap } from '@civ-clone/ui-city/components/lib/cityParts';
import topologyFor from '@civ-clone/ui-client/lib/topologyFor';

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
    tileSize: () => ({ width: 16, height: 16 }),
    nativeTileSize: () => ({ width: 16, height: 16 }),
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
  await import('./lib/strings');
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

  // The keyboard on a queue button when the city is updated (#852): the screen is drawn afresh, and the focus goes to
  //  that item's button, wherever the item now is. linkedom has no focus, so it's tracked by hand.
  let focused: Element | null = null;

  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => focused,
  });

  const focus = HTMLElement.prototype.focus;

  HTMLElement.prototype.focus = function (this: HTMLElement) {
    focused = this;
  };

  const queueItem = (name: string) => ({
      item: { _: name, __: [name, 'CityImprovement', 'Buildable'] },
      cost: { value: 40 },
    }),
    // The city as the worker sends it after an edit, drawn on the next render.
    requeue = (...names: string[]): void => {
      const city = {
        ...queuedCity,
        build: { ...queuedCity.build, queue: names.map(queueItem) },
      } as unknown as CityData;

      dataChanges.collect([queuedCity.build.id]);
      dataChanges.notify({
        player: { cities: [city] },
      } as unknown as GameData);
    },
    queueButton = (label: string): HTMLElement | null =>
      Array.from(
        queued.element().querySelectorAll<HTMLElement>('.ui-city-queue button')
      ).find((button) => button.getAttribute('aria-label') === label) ?? null,
    // What has the focus, and whether it's in the screen as drawn now.
    focusedNow = (): unknown[] => [
      focused?.getAttribute('aria-label') ?? null,
      focused !== null && queued.element().contains(focused),
    ];

  requeue('Temple', 'Library', 'Granary');

  focused = queueButton('Move Granary up');
  requeue('Temple', 'Granary', 'Library');

  expect(
    "an item moved up: the keyboard is on that item's Up, in its new place",
    [...focusedNow(), focused === queueButton('Move Granary up')],
    ['Move Granary up', true, true]
  );

  requeue('Granary', 'Temple', 'Library');

  expect(
    'moved up to first, which has no Up: on its next button, not another item',
    focusedNow(),
    ['Move Granary down', true]
  );

  focused = queueButton('Remove Temple from the queue');
  requeue('Granary', 'Library');

  expect(
    'an item removed: on the item now in its place, and not on its Remove, which a second Enter would press',
    focusedNow(),
    ['Move Library up', true]
  );

  // The build finishes while the keyboard is on the last item's Up: it's now the only one queued, with Remove alone.
  requeue('Granary', 'Library');
  focused = queueButton('Move Library up');
  requeue('Library');

  expect(
    'an item left with Remove alone: the screen has the focus, not Remove',
    [
      queueButton('Remove Library from the queue') !== null,
      focused === queued.element(),
    ],
    [true, true]
  );

  // Two alike: the second's Remove pressed, and the first's is not where the focus goes.
  requeue('Temple', 'Granary', 'Temple');
  focused = Array.from(
    queued
      .element()
      .querySelectorAll<HTMLElement>('.ui-city-queue button[data-destructive]')
  )[2];
  requeue('Temple', 'Granary');

  expect("one of two alike removed: not on the other's Remove", focusedNow(), [
    'Move Granary up',
    true,
  ]);

  // Two alike, the first moved up to first, where it has no Up: on its own row, not on the other's Up, which the
  //  next Enter would press.
  requeue('Temple', 'Granary', 'Library', 'Granary');
  focused = queueButton('Move Granary up');
  requeue('Granary', 'Temple', 'Library', 'Granary');

  expect(
    "the first of two alike moved to first: on its own row's button, not the other's Up",
    [
      ...focusedNow(),
      focused ===
        queued
          .element()
          .querySelector('.ui-city-queued')
          ?.querySelector('button'),
    ],
    ['Move Granary down', true, true]
  );

  requeue('Granary');
  focused = queueButton('Remove Granary from the queue');
  requeue();

  expect(
    'the last item removed: nothing like it is left, so the screen has the focus',
    focused === queued.element(),
    true
  );

  HTMLElement.prototype.focus = focus;
  delete (document as any).activeElement;
  queued.close();

  // The city's squares from the keyboard (#854): a button over each, one stop for Tab, the arrow keys from square to
  //  square, a press doing what a click does, and the keyboard still on the square once the city is drawn again.
  {
    const square = (
        x: number,
        y: number,
        terrain: string,
        yields: [string, number][]
      ) => ({
        _: 'PlayerTile',
        id: `Tile-${x}-${y}`,
        x,
        y,
        city: null,
        goodyHut: null,
        improvements: [],
        isCoast: false,
        isLand: true,
        isWater: false,
        terrain: { _: terrain, __: [terrain, 'Terrain'], features: [] },
        units: [],
        workedBy: null as { id: string } | null,
        yields: yields.map(([name, value]) => ({
          _: name,
          __: [name, 'Yield'],
          value,
        })),
      }),
      centre = square(2, 2, 'Plains', [
        ['Food', 2],
        ['Production', 1],
      ]),
      east = square(3, 2, 'Grassland', [['Food', 2]]),
      west = square(1, 2, 'Hills', [['Food', 1]]),
      north = square(2, 1, 'Desert', []),
      south = square(2, 3, 'Forest', [
        ['Food', 1],
        ['Production', 2],
      ]),
      tiles = [west, north, centre, south, east],
      mapped = (worked: typeof tiles, extra: object = {}) => {
        const city = cityData('City-M', 'Mari', {
          player: { ...player, world: { ...player.world, tiles } },
          tile: centre,
          tiles,
          tilesWorked: worked,
          ...extra,
        });

        return city;
      };

    // Worked by another city: it says so.
    north.workedBy = { id: 'City-Other' };

    const first = mapped([centre, east]),
      mapScreen = openCity(first, portal, transport),
      squares = (): HTMLButtonElement[] =>
        Array.from(mapScreen.element().querySelectorAll('.city-square')),
      labelled = (start: string): HTMLButtonElement | undefined =>
        squares().find((button) =>
          button.getAttribute('aria-label')?.startsWith(start)
        );

    expect(
      'a button over each of the city’s squares, saying what it is, whether it’s worked and what it yields',
      squares()
        .map((button) => button.getAttribute('aria-label'))
        .sort(),
      [
        'Desert, worked by another city',
        'Forest, not worked. Food: 1, Production: 2',
        'Grassland, worked. Food: 2',
        'Hills, not worked. Food: 1',
        'Plains, the city. Food: 2, Production: 1',
      ]
    );
    expect(
      'one stop for Tab, on the city’s own square, in a group that says how to use it',
      [
        squares()
          .filter((button) => button.getAttribute('tabindex') === '0')
          .map((button) => button.getAttribute('aria-label')),
        mapScreen
          .element()
          .querySelector('.city-squares')
          ?.getAttribute('aria-label'),
      ],
      [
        ['Plains, the city. Food: 2, Production: 1'],
        "The city's squares: arrow keys move, Enter works or frees a square",
      ]
    );
    // Three squares across and down, so each is a third of the canvas: the city's in the middle, the east one to
    //  its right.
    const placed = (button: HTMLButtonElement | undefined): number[] =>
      ['left', 'top', 'width', 'height'].map((side) =>
        Math.round(parseFloat(button?.style.getPropertyValue(side) ?? ''))
      );

    expect(
      'each is placed over its square, by its share of the canvas',
      [
        placed(labelled('Plains')),
        placed(labelled('Grassland')),
        placed(labelled('Desert')),
        squares().every((button) =>
          ['left', 'top', 'width', 'height'].every((side) =>
            button.style.getPropertyValue(side).endsWith('%')
          )
        ),
      ],
      [[33, 33, 33, 33], [67, 33, 33, 33], [33, 0, 33, 33], true]
    );
    expect(
      'on the square grid each is its whole box: not clipped to a shape',
      squares().some(
        (button) =>
          button.style.getPropertyValue('clip-path') !== '' ||
          button.classList.contains('outlined')
      ),
      false
    );

    const pressed = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });

    labelled('Forest')!.dispatchEvent(pressed);

    expect(
      'a pointer’s press doesn’t take the keyboard to the square: Enter is still the screen’s',
      pressed.defaultPrevented,
      true
    );

    sent = [];
    labelled('Forest')!.click();

    expect('a press on one sends what a click on its square does', sent, [
      { name: 'ChangeWorkedTile', id: 'City-M', tile: south.id },
    ]);

    // linkedom has no focus: tracked by hand, as the keyboard's. (Typed so: `focus` sets it, which the compiler can't
    //  see.)
    let focused = null as Element | null;

    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => focused,
    });

    const focus = HTMLElement.prototype.focus;

    HTMLElement.prototype.focus = function (this: HTMLElement) {
      focused = this;
      this.dispatchEvent(new Event('focusin', { bubbles: true }));
    };

    // The arrow keys the map takes never reach the screen, where Left and Right are the previous and next city.
    let reached = 0;

    const count = (event: Event): void => {
      if ((event as KeyboardEvent).key.startsWith('Arrow')) {
        reached++;
      }
    };

    mapScreen.element().addEventListener('keydown', count);

    const arrow = (direction: string): boolean => {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: `Arrow${direction}`,
      });

      focused!.dispatchEvent(event);

      return event.defaultPrevented;
    };

    labelled('Plains')!.focus();

    const taken = [arrow('Right')];

    expect(
      'Right from the city’s square: on the square to its east, which is now the stop for Tab',
      [
        focused?.getAttribute('aria-label'),
        squares()
          .filter((button) => button.getAttribute('tabindex') === '0')
          .map((button) => button.getAttribute('aria-label')),
      ],
      ['Grassland, worked. Food: 2', ['Grassland, worked. Food: 2']]
    );

    taken.push(arrow('Right'));

    expect(
      'Right again, with no square of the city’s that way: it stays',
      focused?.getAttribute('aria-label'),
      'Grassland, worked. Food: 2'
    );

    // With Shift too, which the screen would take for the next city.
    const shifted = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowRight',
      shiftKey: true,
    });

    focused!.dispatchEvent(shifted);
    taken.push(shifted.defaultPrevented);

    // Enter is the button's own: it doesn't close the screen. Held down, it presses once.
    const enter = (repeat: boolean): boolean => {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
      });

      // linkedom's events don't take it from what they're made with.
      Object.defineProperty(event, 'repeat', { value: repeat });

      focused!.dispatchEvent(event);

      return event.defaultPrevented;
    };

    expect(
      'Enter on a square leaves the screen open, and a held Enter is not a second press',
      [enter(false), mapScreen.element().isConnected, enter(true)],
      [false, true, true]
    );

    taken.push(arrow('Left'), arrow('Left'), arrow('Right'), arrow('Up'));

    expect(
      'Left twice, Right, then Up: the west, back to the city, then north',
      focused?.getAttribute('aria-label'),
      'Desert, worked by another city'
    );
    expect(
      'the arrow keys are the map’s: none reached the screen, and none scrolls the window',
      [reached, taken],
      [0, [true, true, true, true, true, true, true]]
    );

    // The city drawn again with the square freed: the keyboard is on that square's new button.
    labelled('Grassland')!.focus();

    const before = focused;

    dataChanges.collect([first.id]);
    dataChanges.notify({
      player: { cities: [mapped([centre])] },
    } as unknown as GameData);

    expect(
      'the city drawn again: the keyboard is on the same square, which now says it isn’t worked',
      [
        focused !== before,
        focused?.getAttribute('aria-label'),
        focused !== null && mapScreen.element().contains(focused),
      ],
      [true, 'Grassland, not worked. Food: 2', true]
    );

    // The keyboard gone elsewhere in the screen, and the city drawn again: Tab still comes back to that square.
    focused = mapScreen.element();

    dataChanges.collect([first.id]);
    dataChanges.notify({
      player: { cities: [mapped([centre])] },
    } as unknown as GameData);

    expect(
      'drawn again with the keyboard elsewhere: the square it was last on is still the stop for Tab',
      squares()
        .filter((button) => button.getAttribute('tabindex') === '0')
        .map((button) => button.getAttribute('aria-label')),
      ['Grassland, not worked. Food: 2']
    );

    mapScreen.element().removeEventListener('keydown', count);
    mapScreen.close();

    // Two squares that read alike, whose states swap in one update, as when the engine moves a worker: the keyboard
    //  stays on the square it was on, not on the one that now reads as that one did.
    {
      const left = square(1, 2, 'Grassland', [['Food', 2]]),
        right = square(3, 2, 'Grassland', [['Food', 2]]),
        alike = [left, centre, right],
        twin = (worked: typeof alike) =>
          cityData('City-T', 'Tuttul', {
            player: { ...player, world: { ...player.world, tiles: alike } },
            tile: centre,
            tiles: alike,
            tilesWorked: worked,
          }),
        start = twin([centre, right]),
        twins = openCity(start, portal, transport),
        at = (x: number): HTMLElement =>
          twins
            .element()
            .querySelector(`.city-square[data-x="${x}"]`) as HTMLElement;

      // The small world has a square's border: the city's is at 2, its neighbours at 1 and 3.
      at(3).focus();

      dataChanges.collect([start.id]);
      dataChanges.notify({
        player: { cities: [twin([centre, left])] },
      } as unknown as GameData);

      expect(
        'two alike that swap: the keyboard is on the same square, which now reads as the other did',
        [
          focused === at(3),
          focused?.getAttribute('aria-label'),
          at(1).getAttribute('aria-label'),
        ],
        [true, 'Grassland, not worked. Food: 2', 'Grassland, worked. Food: 2']
      );

      twins.close();
    }

    HTMLElement.prototype.focus = focus;
    delete (document as any).activeElement;

    // A city only looked at has no squares to choose.
    const looked = openCity(mapped([centre, east]), portal, transport, {
      readOnly: true,
    });

    expect(
      'a city only looked at has its map, and no buttons over it',
      [
        looked.element().querySelector('.city-map canvas') !== null,
        looked.element().querySelectorAll('.city-square').length,
      ],
      [true, 0]
    );

    looked.close();
  }

  // The city's map on a staggered isometric world (#97), for cities on even and odd rows and across both seams. The
  //  small world it is drawn in keeps the city's row parity, has an even number of rows, and gives each of the city's
  //  21 squares the neighbours it has in the world. Drawn with the synthetic isometric test pack, each square's button
  //  is clipped to its diamond, and the arrow keys walk the squares that share an edge, reaching every one.
  {
    const isoTileset = readDescriptor(isoJson),
      // The city portal, drawn with the test pack rather than Civ1's, and kept to look at.
      made: Portal[] = [];

    class IsoPortal extends Portal {
      protected override createProjection(): Projection {
        return projectionFor(
          isoTileset,
          this.world(),
          this.tileSize(),
          !this.lockVerticalEdges()
        );
      }
    }

    const isoPortal = {
        ...portal,
        scale: () => 1,
        tileSize: () => ({ width: 64, height: 32 }),
        nativeTileSize: () => ({ width: 64, height: 32 }),
      } as unknown as Portal,
      width = 10,
      height = 8,
      tile = (x: number, y: number): PlayerTile =>
        ({
          _: 'PlayerTile',
          id: `Tile-${x}-${y}`,
          x,
          y,
          city: null,
          goodyHut: null,
          improvements: [],
          isCoast: false,
          isLand: true,
          isWater: false,
          terrain: {
            _: (x + y) % 2 ? 'Plains' : 'Grassland',
            __: ['Terrain'],
            features: [],
          },
          units: [],
          workedBy: null,
          yields: [],
        } as unknown as PlayerTile),
      worldTiles = Array.from({ length: width * height }, (_, index) =>
        tile(index % width, Math.floor(index / width))
      ),
      worldData = {
        _: 'World',
        id: 'World-Iso',
        width,
        height,
        topologyId: 'staggered-iso',
        tiles: worldTiles,
      },
      real = new World(worldData as any),
      topology = real.topology(),
      at = (x: number, y: number): PlayerTile => worldTiles[y * width + x]!,
      // The engine's 21: the logical 5 × 5 round the city, without its corners.
      cityAt = (x: number, y: number): CityData => {
        const tiles = topology
          .area(x, y, 2)
          .filter(([tx, ty]) => {
            const [a, b] = topology.logicalDelta(x, y, tx, ty)!;

            return !(Math.abs(a) === 2 && Math.abs(b) === 2);
          })
          .map(([tx, ty]) => at(tx, ty));

        return cityData(`City-${x}-${y}`, `Iso ${x},${y}`, {
          player: { ...player, world: worldData },
          tile: at(x, y),
          tiles,
          tilesWorked: [at(x, y)],
        });
      },
      makeIsoPortal = (...args: ConstructorParameters<typeof Portal>) => {
        const [world, cityTransport, canvas, options] = args,
          cityPortal = new IsoPortal(world, cityTransport, canvas, options);

        made.push(cityPortal);

        return cityPortal;
      };

    // linkedom has no focus: tracked by hand, as above.
    let focused = null as Element | null;

    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => focused,
    });

    const focus = HTMLElement.prototype.focus;

    HTMLElement.prototype.focus = function (this: HTMLElement) {
      focused = this;
      this.dispatchEvent(new Event('focusin', { bubbles: true }));
    };

    (
      [
        ['in the middle, on an even row', 5, 4],
        ['in the middle, on an odd row', 5, 3],
        ['on the west seam, on an even row', 0, 4],
        ['on the west seam, on an odd row', 0, 3],
        ['on the east seam, on an odd row', 9, 5],
        ['on the north seam, on an even row', 4, 0],
        ['on the north seam, on an odd row', 4, 1],
        ['on the south seam, on an odd row', 6, 7],
        ['in the corner, across both seams', 9, 7],
        ['in the other corner, across both seams', 0, 0],
      ] as [string, number, number][]
    ).forEach(([where, cityX, cityY]) => {
      const city = cityAt(cityX, cityY),
        layout = cityMapLayout(city),
        small = new World(
          {
            ...worldData,
            width: layout.width,
            height: layout.height,
            tiles: layout.tiles,
          } as any,
          layout.context
        ),
        byId = new Map(worldTiles.map((square) => [square.id, square]));

      expect(
        `an iso city ${where}: its 21 squares placed apart, on a row of its own row's parity, in an even number of rows`,
        [
          layout.tiles.length,
          new Set(layout.tiles.map(({ x, y }) => `${x},${y}`)).size,
          layout.center.y % 2 === cityY % 2,
          layout.height % 2,
          layout.tiles.find(({ id }) => id === city.tile.id) &&
            [
              layout.tiles.find(({ id }) => id === city.tile.id)!.x,
              layout.tiles.find(({ id }) => id === city.tile.id)!.y,
            ].join() === [layout.center.x, layout.center.y].join(),
        ],
        [21, 21, true, 0, true]
      );

      expect(
        `an iso city ${where}: each of its squares has the neighbours it has in the world, every way`,
        layout.tiles.flatMap((local) =>
          topology
            .directions()
            .filter(
              (direction) =>
                small.getNeighbour(local, direction).id !==
                real.getNeighbour(byId.get(local.id)!, direction).id
            )
            .map((direction) => `${local.id} ${direction}`)
        ),
        []
      );

      made.length = 0;

      const map = renderMap(
          isoPortal,
          city,
          transport,
          false,
          makeIsoPortal
        ) as HTMLElement,
        cityPortal = made[0]!,
        canvas = map.querySelector('canvas') as HTMLCanvasElement,
        buttons = Array.from(
          map.querySelectorAll('.city-square')
        ) as HTMLButtonElement[],
        // Where a button is on the canvas, in its px, from its share of it.
        boxOf = (button: HTMLButtonElement) => {
          const share = (side: string) =>
            parseFloat(button.style.getPropertyValue(side)) / 100;

          return {
            x: share('left') * canvas.width,
            y: share('top') * canvas.height,
            width: share('width') * canvas.width,
            height: share('height') * canvas.height,
          };
        },
        clip = buttons.map((button) =>
          button.style.getPropertyValue('clip-path')
        ),
        // A model of what the browser does with a click: the buttons whose box and diamond (`clip-path`) the pixel's
        //  centre is in. linkedom has no layout, so this reads the button's own numbers back.
        hit = (px: number, py: number): HTMLButtonElement[] =>
          buttons.filter((button) => {
            const box = boxOf(button),
              x = (px + 0.5 - box.x) / box.width,
              y = (py + 0.5 - box.y) / box.height;

            return Math.abs(x - 0.5) + Math.abs(y - 0.5) < 0.5;
          }),
        squareAt = (px: number, py: number): string | null => {
          const square = cityPortal.tileAt(px, py);

          return square === null ||
            !city.tiles.some(({ id }) => id === square.id)
            ? null
            : `${square.x},${square.y}`;
        },
        misses: string[] = [];

      expect(
        `an iso city ${where}: a button over each of its squares, each clipped to its diamond, with a focus ring inside it`,
        [
          buttons.length,
          clip.every(
            (value) => value === 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
          ),
          buttons.every((button) => button.classList.contains('outlined')),
          buttons.every(
            (button) =>
              button.style.getPropertyValue('--focus-ring') ===
              'polygon(evenodd, 50% 0%, 100% 50%, 50% 100%, 0% 50%, 50% 0%, calc(50%) calc(0% + var(--ring) * 1.12), calc(100% - var(--ring) * 2.24) calc(50%), calc(50%) calc(100% - var(--ring) * 1.12), calc(0% + var(--ring) * 2.24) calc(50%), calc(50%) calc(0% + var(--ring) * 1.12))'
          ),
        ],
        [21, true, true, true]
      );

      for (let py = 0; py < canvas.height; py++) {
        for (let px = 0; px < canvas.width; px++) {
          const under = hit(px, py).map(
              ({ dataset }) => `${dataset.x},${dataset.y}`
            ),
            square = squareAt(px, py);

          if (under.join('|') !== (square ?? '')) {
            misses.push(`${px},${py}: ${under.join('|')} not ${square}`);
          }
        }
      }

      const own = buttons.find(({ dataset }) => dataset.own === 'true')!,
        ownBox = boxOf(own),
        [nwX, nwY] = cityPortal
          .world()
          .topology()
          .neighbour(layout.center.x, layout.center.y, 'nw')!;

      expect(
        `an iso city ${where}: every pixel of the canvas picks the one square under it, and none off the city's squares; the city's box's top left corner is its north-west neighbour's`,
        [
          misses.slice(0, 5),
          hit(Math.ceil(ownBox.x) + 1, Math.ceil(ownBox.y) + 1).map(
            ({ dataset }) => `${dataset.x},${dataset.y}`
          ),
        ],
        [[], [`${nwX},${nwY}`]]
      );

      // The arrow keys from the city's own square: Up is the square up and to the right, its north-east neighbour,
      //  and between them the four reach every one of the city's squares.
      const press = (from: HTMLButtonElement, arrow: string): string => {
          focused = null;
          from.dispatchEvent(
            new KeyboardEvent('keydown', {
              bubbles: true,
              cancelable: true,
              key: `Arrow${arrow}`,
            })
          );

          const to = (focused ?? from) as HTMLButtonElement;

          return `${to.dataset.x},${to.dataset.y}`;
        },
        [neX, neY] = cityPortal
          .world()
          .topology()
          .neighbour(layout.center.x, layout.center.y, 'ne')!,
        reached = new Set([`${own.dataset.x},${own.dataset.y}`]),
        queue = [own];

      while (queue.length > 0) {
        const from = queue.shift()!;

        ['Up', 'Right', 'Down', 'Left'].forEach((arrow) => {
          const to = press(from, arrow);

          if (!reached.has(to)) {
            reached.add(to);
            queue.push(
              buttons.find(({ dataset }) => `${dataset.x},${dataset.y}` === to)!
            );
          }
        });
      }

      expect(
        `an iso city ${where}: Up from its square is its north-east neighbour, and the arrow keys reach all 21`,
        [press(own, 'Up'), reached.size],
        [`${neX},${neY}`, 21]
      );
    });

    HTMLElement.prototype.focus = focus;
    delete (document as any).activeElement;

    // The whole screen for a city on an isometric world opens, its map drawn with the isometric grid's pack (#97), as
    //  the game's own portal on that grid is.
    const isoScreen = openCity(cityAt(5, 3), isoPortal, transport);

    expect(
      'the city screen opens for a city on an isometric world, a button over each of its 21 squares',
      isoScreen.element().querySelectorAll('.city-square').length,
      21
    );

    isoScreen.close();
  }

  // The classic layout, given to `City` as the classic interface's slot gives it (#861).
  const plain = new City(cityData('City-E', 'Lagash'), portal, transport, {
    layout: classicCityLayout,
  });

  expect(
    'given the classic layout, City draws it',
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
