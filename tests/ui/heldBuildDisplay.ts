// A build a rule holds back (#959): the engine sends the ids of the rules holding the item with every build (`held`),
//  from the moment it is chosen, and the page reads only that and `remaining`. Checked here: the one function every
//  place asks (`buildOutlook`, `buildHold`, `buildTurnsOrder`); the words for a rule's id, and the plain ones for a rule
//  it has none for; the city screen under both interfaces, waiting now (the reason in place of the turns, the figures
//  still "42 / 40", no Buy) and waiting once paid for (the turns, the reason beneath them, Buy pointing to it and its
//  confirmation saying so); the sidebar's list, with the hold glyph (#970) in place of "1 turn", its words as its tooltip and for a
//  screen reader, sorted after the builds that will be done; the map banner's tooltip; the queue, both build menus and the notice that a build is waiting (#970), which
//  say an item would wait before it is chosen, beside its turns or, when the shields stored pay for it, in their place.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/grids';
import './lib/artPacks';

import {
  buildHold,
  buildOutlook,
  buildTurnsOrder,
} from '@civ-clone/ui-client/lib/cityTurns';
import {
  BuildItem,
  City as CityData,
  GameData,
  Player,
} from '@civ-clone/ui-protocol/types';
import CitiesList from '@civ-clone/ui-hud/components/CitiesList';
import { DataChanges } from '@civ-clone/ui-client/lib/DataChanges';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { applyInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import cityBannerTooltip from '@civ-clone/ui-hud/components/Map/cityBannerTooltip';
import {
  heldPurchaseText,
  heldText,
} from '@civ-clone/ui-client/components/lib/cityBuild';
import CityStatus from '@civ-clone/ui-interface-classic/components/CityStatus';
import { cityStatusColumns } from '@civ-clone/ui-interface-modern/components/CityStatusTable';
import i18next from 'i18next';
import addFormatters from '@civ-clone/ui-game/app/i18nFormatters';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import openCity from '@civ-clone/ui-city/components/openCity';
import Notifications from '@civ-clone/ui-hud/components/Notifications';
import Notices from '@civ-clone/ui-hud/components/Notices';
import { noticeText } from '@civ-clone/ui-hud/components/Actions/Notice';
import { openCityBuild } from '@civ-clone/ui-city/components/choices';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL heldBuildDisplay: stopped after ${checks} checks, before the end\n`
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

(globalThis as any).MouseEvent ??= Event;
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };

// No assets: the citizens, icons and units are drawn without their images.
assetStore.firstImported = () => new Promise(() => {});
assetStore.get = () => new Promise(() => {});
assetStore.shownAtURL = () => new Promise(() => {});
assetStore.spriteURL = () => new Promise(() => {});

const WAIT = 'civ1-enhanced:city/hold/settlers-until-size-two',
  CHIEFTAIN = 'civ1-unit:city/hold/chieftain-settlers';

const player = {
    id: 'Player-1',
    civilization: {
      _: 'Babylonian',
      attributes: [{ name: 'colors', value: ['#ffffff', '#000000'] }],
    },
    world: { width: 10, height: 10, tiles: [] },
    treasuries: [{ id: 'Treasury-1', yield: { _: 'Gold' }, value: 300 }],
    government: { _: 'Monarchy' },
    actions: [],
    cities: [] as CityData[],
  },
  yieldOf = (name: string, value: number) => ({
    _: name,
    __: [name, 'Yield'],
    value,
  }),
  // A size-1 city building Settlers (drawn as a plain item, not a unit, which needs more than this to draw), with
  //  `progress` of 40 shields, 2 spare a turn, and `held` as the engine sends it. Bought only while there's more to pay.
  cityData = (
    id: string,
    name: string,
    { progress, held }: { progress: number; held: (string | null)[] }
  ): CityData => {
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
      improvements: [],
      yields: [yieldOf('Production', 2), yieldOf('Food', 1)],
      specialists: [],
      build: {
        id: `${id}-Build`,
        building: { item: { _: 'Settlers', __: ['Settlers', 'Buildable'] } },
        auto: false,
        progress: { value: progress },
        cost: { value: 40 },
        remaining: 40 - progress,
        held,
        spendCost:
          progress < 40 ? [{ resource: { _: 'Gold' }, value: 2 * 40 }] : [],
      },
      growth: {
        id: `${id}-Growth`,
        progress: { value: 0 },
        cost: { value: 20 },
        size: 1,
      },
      tradeRoutes: [],
    };

    city.build = { ...city.build, city };

    return city as CityData;
  };

const portal = {
    emit: () => {},
    openCity: () => true,
    scale: () => 1,
    tileSize: () => ({ width: 16, height: 16 }),
    nativeTileSize: () => ({ width: 16, height: 16 }),
  } as unknown as Portal,
  transport = {
    send: () => {},
    request: () => new Promise(() => {}),
  } as unknown as Transport;

const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  click = (element: Element | null) =>
    element!.dispatchEvent(new Event('click', { bubbles: true })),
  confirmations = () => document.querySelectorAll('.confirmationWindow');

// What a city screen says of a build: its figures, its turns, the note, what comes straight after the note, each Buy
//  and what it is described by, and the confirmation Buy opens.
const screenSays = (city: CityData) => {
  const screen = openCity(city, portal, transport),
    element = screen.element(),
    buy = element.querySelector('button.buy'),
    describedBy = buy?.getAttribute('aria-describedby') ?? null,
    note = element.querySelector('.held-note'),
    // The build's figures, not the growth's.
    figures = Array.from(element.querySelectorAll('.figures')).find((figures) =>
      text(figures.querySelector('.stored'))?.startsWith('Production:')
    );

  confirmations().forEach((window) => window.remove());

  if (buy) {
    click(buy);
  }

  const said = {
    stored: text(figures?.querySelector('.stored'))?.replace(
      /^Production: /,
      ''
    ),
    turns: text(figures?.querySelector('.turns')),
    note: text(note),
    afterNote: note?.nextElementSibling?.className ?? null,
    buy: buy !== null,
    buyDescribedByNote:
      describedBy !== null &&
      describedBy === note?.id &&
      document.getElementById(describedBy) === note,
    confirmation: text(confirmations()[0]),
  };

  confirmations().forEach((window) => window.remove());
  screen.close();

  return said;
};

// The words for both rules and both fallbacks, as `heldText` and `heldPurchaseText` give them now.
const words = () => [
  heldText({ now: true, held: [WAIT] }),
  heldText({ now: false, held: [WAIT] }),
  heldText({ now: true, held: [CHIEFTAIN] }),
  heldText({ now: false, held: [CHIEFTAIN] }),
  heldText({ now: true, held: [null] }),
  heldText({ now: false, held: ['someone:city/hold/else'] }),
  heldText({ now: true, held: [null, CHIEFTAIN] }),
  heldPurchaseText({ now: false, held: [WAIT] }, 'Settlers'),
  heldPurchaseText({ now: false, held: [CHIEFTAIN] }, 'Settlers'),
  heldPurchaseText({ now: false, held: [null] }, 'Settlers'),
];

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  // City names, as the notices word them.
  addFormatters(i18next);
  await import('./lib/strings');
  // The rules' own sentences are their packages' text, loaded with the rest of them.
  await import('../../translations/civ1-enhanced/en');
  await import('../../translations/civ1-unit/en');

  // --- the one function ----------------------------------------------------------------------------------------------
  const will = cityData('City-1', 'Kish', { progress: 12, held: [WAIT] }),
    now = cityData('City-2', 'Ur', { progress: 42, held: [WAIT] }),
    free = cityData('City-3', 'Uruk', { progress: 12, held: [] }),
    paid = cityData('City-4', 'Lagash', { progress: 42, held: [] });

  expect(
    'held and something still to pay: not yet; held and paid for: it waits now; not held: nothing',
    [now, will, free, paid].map(({ build }) => buildHold(build)),
    [{ now: true, held: [WAIT] }, { now: false, held: [WAIT] }, null, null]
  );
  expect(
    'nothing being built is held by nothing, whatever it is sent',
    buildHold({ ...free.build, building: null, held: [WAIT] }),
    null
  );
  expect(
    'a build sent without `held`, from an engine before it, is not held',
    buildHold({ ...free.build, held: undefined }),
    null
  );
  expect(
    'the order by turns: the soonest first, then one waiting now, and one that never finishes last',
    [
      buildTurnsOrder({ turns: 3, hold: null }),
      buildTurnsOrder(buildOutlook(now)) > 1000,
      buildTurnsOrder(buildOutlook(now)) < Infinity,
      buildTurnsOrder({ turns: 0, hold: null }),
      buildTurnsOrder(buildOutlook(will)),
    ],
    [3, true, true, null, 14]
  );

  // --- the words -----------------------------------------------------------------------------------------------------
  const expectedWords = [
    'Waiting until the city is size 2',
    'Can’t be completed until the city is size 2',
    'Waiting until the city is size 2',
    'Can’t be completed until the city is size 2',
    'Waiting',
    'Can’t be completed yet',
    'Waiting until the city is size 2',
    'Settlers can’t be completed until the city is size 2.',
    'Settlers can’t be completed until the city is size 2.',
    'Settlers can’t be completed yet.',
  ];

  expect(
    "each rule that holds Settlers until size 2 says so, from its own package's text, paid for or not; any other id, or none, has the plain words",
    words(),
    expectedWords
  );

  // --- the city screen, both interfaces -----------------------------------------------------------------------------
  // With something queued after it: the modern screen draws the queue between the figures and the buttons.
  const queued = {
    ...will,
    build: {
      ...will.build,
      queue: [
        {
          item: { _: 'Warrior', __: ['Warrior', 'Buildable'] },
          cost: { value: 10 },
        },
      ],
    },
  } as unknown as CityData;

  (
    [
      ['modern', 'ui-city-production-actions'],
      ['classic', 'build-actions'],
    ] as const
  ).forEach(([mode, actions]) => {
    applyInterface(mode, null);

    expect(
      `${mode}: waiting now, the figures read true, the reason is in place of the turns, and there is nothing to buy`,
      screenSays(now),
      {
        stored: '42 / 40',
        turns: 'Waiting until the city is size 2',
        note: null,
        afterNote: null,
        buy: false,
        buyDescribedByNote: false,
        confirmation: null,
      }
    );

    const before = screenSays(mode === 'modern' ? queued : will);

    expect(
      `${mode}: before it is paid for, the turns, the reason straight above the buttons${
        mode === 'modern' ? ', after the queue' : ''
      }, Buy described by it, and its confirmation saying it of the item`,
      [
        before.stored,
        before.turns,
        before.note,
        before.afterNote,
        before.buy,
        before.buyDescribedByNote,
        before.confirmation?.includes(
          'available. Settlers can’t be completed until the city is size 2.'
        ),
      ],
      [
        '12 / 40',
        '14 turns',
        'Can’t be completed until the city is size 2',
        actions,
        true,
        true,
        true,
      ]
    );

    const plain = screenSays(free);

    expect(
      `${mode}: a build nothing holds says none of it, and its confirmation is as it was`,
      [
        plain.note,
        plain.buyDescribedByNote,
        plain.confirmation?.includes('available.') &&
          !plain.confirmation.includes('completed'),
      ],
      [null, false, true]
    );
  });

  // --- the queue (#970) ------------------------------------------------------------------------------------------------
  // Only the modern city screen draws the queue. Each queued item's ids come by its place; an older worker sends none.
  {
    applyInterface('modern', null);

    const queuedItems = [
        {
          item: { _: 'Settlers', __: ['Settlers', 'Buildable'] },
          cost: { value: 40 },
        },
        {
          item: { _: 'Warrior', __: ['Warrior', 'Buildable'] },
          cost: { value: 10 },
        },
      ],
      queueSays = (queueHeld?: (string | null)[][]) => {
        const city = {
            ...free,
            build: {
              ...free.build,
              queue: queuedItems,
              ...(queueHeld ? { queueHeld } : {}),
            },
          } as unknown as CityData,
          screen = openCity(city, portal, transport),
          rows = Array.from(
            screen.element().querySelectorAll('.ui-city-queued')
          ).map((row) => [
            text(row.querySelector('.name')),
            text(row.querySelector('.held')),
            text(row.querySelector('.turns')),
          ]);

        screen.close();

        return rows;
      };

    expect(
      "the queue: queued Settlers say what would hold them as the city is now, under their name, in the menu's words, and keep their turns; a Warrior says nothing",
      queueSays([[WAIT], []]),
      [
        [
          'Then: Settlers',
          'Can’t be completed until the city is size 2',
          '20 turns',
        ],
        ['Then: Warrior', null, '5 turns'],
      ]
    );
    expect(
      'the queue from a worker that sends no ids says nothing of holds',
      queueSays(undefined).map(([, held]) => held),
      [null, null]
    );
  }

  // --- the build menus, both interfaces (#970) -----------------------------------------------------------------------
  // What a city could build, with the ids the worker sends with each: Settlers would wait, a Warrior wouldn't, and one
  //  sent without them (an older worker) is like the Warrior.
  const offered = [
      {
        _: 'BuildItem',
        id: 'Offer-1',
        item: { _: 'Settlers', __: ['Settlers', 'Buildable'] },
        cost: { value: 40 },
        held: [WAIT],
      },
      {
        _: 'BuildItem',
        id: 'Offer-2',
        item: { _: 'Warrior', __: ['Warrior', 'Buildable'] },
        cost: { value: 10 },
        held: [],
      },
      {
        _: 'BuildItem',
        id: 'Offer-3',
        item: { _: 'Temple', __: ['Temple', 'Buildable'] },
        cost: { value: 40 },
      },
    ] as unknown as BuildItem[],
    menuSays = (mode: 'classic' | 'modern', city: CityData) => {
      applyInterface(mode, null);

      const menu = openCityBuild(city.build, offered, transport),
        said =
          mode === 'classic'
            ? Array.from(menu.element().querySelectorAll('option')).map(
                (option) => [option.value, text(option)]
              )
            : Array.from(menu.element().querySelectorAll('.ui-choice-row')).map(
                (row) => [
                  text(row.querySelector('.ui-choice-name')),
                  text(row.querySelector('.ui-choice-meta')),
                  Array.from(row.querySelectorAll('.ui-choice-fact')).map(
                    (fact) => fact.getAttribute('title')
                  ),
                ]
              );

      menu.close();

      return said;
    };

  expect(
    'classic menu, 12 shields stored: Settlers say they can’t be completed until size 2 after their turns; the others are as they were',
    menuSays('classic', will),
    [
      [
        'Settlers',
        'Settlers (Cost: 40 / 14 turns) – Can’t be completed until the city is size 2',
      ],
      ['Warrior', 'Warrior (Cost: 10 / 1 turn)'],
      ['Temple', 'Temple (Cost: 40 / 14 turns)'],
    ]
  );
  // A city building a Warrior with 42 shields stored, which would pay for Settlers at once: they aren't chosen, so they
  //  can't be completed, not "waiting".
  const covered = {
    ...now,
    build: {
      ...now.build,
      building: { item: { _: 'Warrior', __: ['Warrior', 'Buildable'] } },
      cost: { value: 10 },
      remaining: -32,
      held: [],
    },
  } as unknown as CityData;

  expect(
    'classic menu, building the paid-for, waiting Settlers: said in place of their turns',
    menuSays('classic', now)[0],
    ['Settlers', 'Settlers (Cost: 40 / Waiting until the city is size 2)']
  );
  expect(
    'classic menu, 42 shields stored but building a Warrior: Settlers can’t be completed, after their turn, not "waiting"',
    menuSays('classic', covered)[0],
    [
      'Settlers',
      'Settlers (Cost: 40 / 1 turn) – Can’t be completed until the city is size 2',
    ]
  );
  expect(
    'modern menu, 12 shields stored: Settlers say it under their name, and still count their turns',
    menuSays('modern', will),
    [
      [
        'Settlers',
        'Can’t be completed until the city is size 2',
        ['Cost in shields', 'Turns'],
      ],
      ['Warrior', null, ['Cost in shields', 'Turns']],
      ['Temple', null, ['Cost in shields', 'Turns']],
    ]
  );
  expect(
    'modern menu, building the paid-for, waiting Settlers: no turns are promised',
    menuSays('modern', now)[0],
    ['Settlers', 'Waiting until the city is size 2', ['Cost in shields']]
  );
  expect(
    'modern menu, 42 shields stored but building a Warrior: Settlers can’t be completed, with their turn, not "waiting"',
    menuSays('modern', covered)[0],
    [
      'Settlers',
      'Can’t be completed until the city is size 2',
      ['Cost in shields', 'Turns'],
    ]
  );

  // The pane beside the modern list says it for the highlighted item, at once, before its Civilopedia entry (which
  //  never comes here); nothing for an item nothing would hold.
  {
    applyInterface('modern', null);

    const menu = openCityBuild(will.build, offered, transport),
      pane = () =>
        text(menu.element().querySelector('.ui-choice-details .held-note')),
      rows = Array.from(menu.element().querySelectorAll('.ui-choice-row'));

    await new Promise((resolve) => setTimeout(resolve, 0));

    const onSettlers = pane();

    click(rows[1]!);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      'modern menu: the pane beside the list gives the reason for highlighted Settlers, and none for a Warrior',
      [onSettlers, pane()],
      ['Can’t be completed until the city is size 2', null]
    );

    menu.close();
  }

  // --- the sidebar's list --------------------------------------------------------------------------------------------
  const element = document.createElement('div'),
    never = cityData('City-5', 'Eridu', { progress: 0, held: [] });

  never.yields = [yieldOf('Production', 0)] as unknown as CityData['yields'];
  new CitiesList(
    element,
    {
      ...player,
      cities: [now, never, will, free],
    } as unknown as Player,
    portal as any,
    new DataChanges()
  );

  const rows = Array.from(element.querySelectorAll('.city-row')),
    held = element.querySelector('.city-row[data-city="City-2"] .turns');

  expect(
    'the list: the soonest first, then the one waiting now, and the one that never finishes last',
    rows.map((row) => row.querySelector('.name')?.textContent),
    ['Kish', 'Uruk', 'Ur', 'Eridu']
  );
  expect(
    'the one waiting now has the hold glyph (#970), not "1 turn" or "…", with the words as its tooltip and for a screen reader',
    [
      held?.querySelector('svg.glyph-hold use')?.getAttribute('href'),
      held?.querySelector('svg.glyph-hold')?.getAttribute('aria-hidden'),
      held?.querySelector('.visually-hidden')?.textContent,
      held?.getAttribute('title'),
    ],
    [
      '#g-hold',
      'true',
      'Waiting until the city is size 2',
      'Waiting until the city is size 2',
    ]
  );

  // From 39 of 40 (1 turn) to 40 of 40 (waiting): the turns read "1 turn" either way, so only the hold in what the
  //  list compares makes it draw the row again.
  {
    const nearly = cityData('City-6', 'Nippur', { progress: 39, held: [WAIT] }),
      data = { ...player, cities: [nearly] } as unknown as Player,
      changes = new DataChanges(),
      list = document.createElement('div'),
      turnsShown = () =>
        list.querySelector('.city-row .turns')?.textContent ?? null;

    new CitiesList(list, data, portal as any, changes);

    const before = turnsShown();

    (nearly.build.progress as any).value = 40;
    (nearly.build as any).remaining = 0;
    nearly.build.spendCost = [];
    changes.collect([nearly.build.id]);
    changes.notify({ player: data } as GameData);

    expect(
      'a build paid for in the list goes from "1 turn" to waiting, drawn again',
      [before, turnsShown()],
      ['1 turn', 'Waiting until the city is size 2']
    );
  }

  // --- City Status ---------------------------------------------------------------------------------------------------
  const buildColumn = cityStatusColumns().find(({ key }) => key === 'build')!;

  expect(
    'modern City Status: the words in place of the turns while it waits, the turns before',
    [now, will].map((city) =>
      text(
        (buildColumn.cell!(city) as HTMLElement).querySelector(
          '.ui-report-meter-turns'
        )
      )
    ),
    ['Waiting until the city is size 2', '14 turns']
  );
  expect(
    'and sorted after a build that will finish, before one that never will',
    [will, now, never].map((city) => buildColumn.sortValue!(city) as number),
    [14, Number.MAX_SAFE_INTEGER, Infinity]
  );

  // The classic report draws its rows once the yield icons are in.
  assetStore.shownAtURL = () => Promise.resolve('');

  const classicStatus = new CityStatus(
    { ...player, cities: [now] } as unknown as Player,
    portal,
    transport
  );

  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(
    'classic City Status: the words in place of the turns while it waits',
    text(classicStatus.element().querySelector('tr .build')),
    '2 Settlers 42 / 40 (Waiting until the city is size 2)'
  );

  classicStatus.close();

  // --- the map banner's tooltip --------------------------------------------------------------------------------------
  expect(
    "the banner's tooltip: the reason in place of the turns once paid for, and after them before",
    [now, will, free].map((city) => cityBannerTooltip(city).rows[0]![1]),
    [
      '42 / 40 · Waiting until the city is size 2',
      '12 / 40 · 14 turns · Can’t be completed until the city is size 2',
      '12 / 40 · 14 turns',
    ]
  );

  // --- the notice that a paid-for build is waiting (#970) --------------------------------------------------------------
  // As the worker sends it, worded in both places a notice is: its window, and the notice beside End Turn.
  {
    const notice = (held: (string | null)[]) => ({
        key: 'City.building-held.unit',
        bubble: true,
        data: {
          city: { name: 'Kish', originalPlayer: player },
          item: { _: 'Settlers' },
          held,
        },
      }),
      windowSays = (held: (string | null)[]) => {
        const container = document.createElement('div');

        document.body.append(container);
        new Notifications(container).receive(notice(held));

        const window = document.querySelector('.notificationWindow'),
          said = text(window);

        window?.remove();
        container.remove();

        return said;
      };

    expect(
      'the notice beside End Turn: its title, and its body worded from the rule, as the city screen words a build waiting now',
      [
        noticeText(notice([WAIT]), 'title', true),
        noticeText(notice([WAIT]), 'body', true),
        noticeText(notice([CHIEFTAIN]), 'body', true),
        noticeText(notice([null]), 'body', true),
      ],
      [
        'Production waiting',
        'Production of Settlers in Kish is paid for. Waiting until the city is size 2.',
        'Production of Settlers in Kish is paid for. Waiting until the city is size 2.',
        'Production of Settlers in Kish is paid for. Waiting.',
      ]
    );
    expect(
      'and its window says the same',
      windowSays([WAIT])?.includes(
        'Production of Settlers in Kish is paid for. Waiting until the city is size 2.'
      ),
      true
    );

    // Beside End Turn, it stands while the city's build is the same item, paid for and held, and is withdrawn once it
    //  isn't, as the data the notices are rebuilt from says, rather than going on saying something untrue.
    const notices = new Notices(),
      dataWith = (cities: CityData[]) =>
        ({ player: { ...player, cities } } as unknown as GameData),
      waitingNotice = (city: CityData) => ({
        key: 'City.building-held.unit',
        bubble: true,
        data: { city: { id: city.id }, item: { _: 'Settlers' }, held: [WAIT] },
      }),
      shown = (cities: CityData[]) =>
        notices
          .actions(dataWith(cities))
          .map(({ value }) => value.notification.data.city.id),
      completed = {
        ...now,
        build: {
          ...now.build,
          building: null,
          remaining: undefined,
          held: [],
          progress: { value: 0 },
        },
      } as unknown as CityData,
      changed = {
        ...now,
        build: {
          ...now.build,
          building: { item: { _: 'Warrior', __: ['Warrior', 'Buildable'] } },
          held: [],
        },
      } as unknown as CityData,
      sabotaged = {
        ...now,
        build: { ...now.build, progress: { value: 0 }, remaining: 40 },
      } as unknown as CityData;

    [now, now, now, now].forEach((city) => notices.add(waitingNotice(city)));

    expect(
      'the notice stands while its build waits, and is withdrawn once it completes, changes, or loses its shields',
      [
        shown([now]),
        shown([completed]),
        (notices.add(waitingNotice(now)), shown([changed])),
        (notices.add(waitingNotice(now)), shown([sabotaged])),
        (notices.add(waitingNotice(now)), shown([now]).length),
        shown([]).length,
      ],
      [['City-2', 'City-2', 'City-2', 'City-2'], [], [], [], 1, 1]
    );
  }

  // --- en-GB ---------------------------------------------------------------------------------------------------------
  // Nothing here is spelt differently: the British page reads the same, through its fallback to en.
  await import('../../translations/civ1-enhanced/en-GB');
  await import('../../translations/civ1-unit/en-GB');
  await import('@civ-clone/ui-client/translations/en-GB');
  await i18next.changeLanguage('en-GB');

  expect('in en-GB, the same words', words(), expectedWords);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL heldBuildDisplay (${
        failures.length
      } of ${checks})\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS heldBuildDisplay (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL heldBuildDisplay: ${error?.stack ?? error}\n`);
  process.exit(1);
});
