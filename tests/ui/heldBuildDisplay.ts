// A build a rule holds back (#959): the engine sends the ids of the rules holding the item with every build (`held`),
//  from the moment it is chosen, and the page reads only that and `remaining`. Checked here: the one function every
//  place asks (`buildOutlook`, `buildHold`, `buildTurnsOrder`); the words for a rule's id, and the plain ones for a rule
//  it has none for; the city screen under both interfaces, waiting now (the reason in place of the turns, the figures
//  still "42 / 40", no Buy) and waiting once paid for (the turns, the reason beneath them, Buy pointing to it and its
//  confirmation saying so); the sidebar's list, with a marker in place of "1 turn", its words as its tooltip and for a
//  screen reader, sorted after the builds that will be done; and the map banner's tooltip.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/grids';

import {
  buildHold,
  buildOutlook,
  buildTurnsOrder,
} from '@civ-clone/ui-client/lib/cityTurns';
import { City as CityData, Player } from '@civ-clone/ui-protocol/types';
import CitiesList from '@civ-clone/ui-hud/components/CitiesList';
import { DataChanges } from '@civ-clone/ui-client/lib/DataChanges';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { applyInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import cityBannerTooltip from '@civ-clone/ui-hud/components/Map/cityBannerTooltip';
import { heldText } from '@civ-clone/ui-client/components/lib/cityBuild';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import openCity from '@civ-clone/ui-city/components/openCity';

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
    tileSize: () => 16,
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

// What a city screen says of a build: its figures, its turns, the note beneath them, each Buy and what it is described
//  by, and the confirmation Buy opens.
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
    buy: buy !== null,
    buyDescribedByNote: describedBy !== null && describedBy === note?.id,
    confirmation: text(confirmations()[0]),
  };

  confirmations().forEach((window) => window.remove());
  screen.close();

  return said;
};

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');

  // --- the one function ----------------------------------------------------------------------------------------------
  const will = cityData('City-1', 'Kish', { progress: 12, held: [WAIT] }),
    now = cityData('City-2', 'Ur', { progress: 42, held: [WAIT] }),
    free = cityData('City-3', 'Uruk', { progress: 12, held: [] }),
    paid = cityData('City-4', 'Lagash', { progress: 42, held: [] });

  expect(
    'held and something still to pay: it will wait; held and paid for: it waits now; not held: nothing',
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
  expect(
    'each rule that holds Settlers until size 2 says so, waiting or before; any other id, or none, has the plain words',
    [
      heldText({ now: true, held: [WAIT] }),
      heldText({ now: false, held: [WAIT] }),
      heldText({ now: true, held: [CHIEFTAIN] }),
      heldText({ now: false, held: [CHIEFTAIN] }),
      heldText({ now: true, held: [null] }),
      heldText({ now: false, held: ['someone:city/hold/else'] }),
      heldText({ now: true, held: [null, CHIEFTAIN] }),
    ],
    [
      'Waiting until the city is size 2',
      'Will wait until the city is size 2',
      'Waiting until the city is size 2',
      'Will wait until the city is size 2',
      'Waiting',
      'Will wait when finished',
      'Waiting until the city is size 2',
    ]
  );

  // --- the city screen, both interfaces -----------------------------------------------------------------------------
  (['modern', 'classic'] as const).forEach((mode) => {
    applyInterface(mode, null);

    expect(
      `${mode}: waiting now, the figures read true, the reason is in place of the turns, and there is nothing to buy`,
      screenSays(now),
      {
        stored: '42 / 40',
        turns: 'Waiting until the city is size 2',
        note: null,
        buy: false,
        buyDescribedByNote: false,
        confirmation: null,
      }
    );

    const before = screenSays(will);

    expect(
      `${mode}: before it is paid for, the turns, the reason beneath them, Buy described by it and its confirmation saying it`,
      [
        before.stored,
        before.turns,
        before.note,
        before.buy,
        before.buyDescribedByNote,
        before.confirmation?.includes(
          'available. Will wait until the city is size 2.'
        ),
      ],
      [
        '12 / 40',
        '14 turns',
        'Will wait until the city is size 2',
        true,
        true,
        true,
      ]
    );

    expect(
      `${mode}: a build nothing holds says none of it`,
      [screenSays(free).note, screenSays(free).buyDescribedByNote],
      [null, false]
    );
  });

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
    'the one waiting now has a marker, not "1 turn", with the words as its tooltip and for a screen reader',
    [
      held?.querySelector('[aria-hidden="true"]')?.textContent,
      held?.querySelector('.visually-hidden')?.textContent,
      held?.getAttribute('title'),
    ],
    [
      '…',
      'Waiting until the city is size 2',
      'Waiting until the city is size 2',
    ]
  );

  // --- the map banner's tooltip --------------------------------------------------------------------------------------
  expect(
    "the banner's tooltip: the reason in place of the turns once paid for, and after them before",
    [now, will, free].map((city) => cityBannerTooltip(city).rows[0]![1]),
    [
      '42 / 40 · Waiting until the city is size 2',
      '12 / 40 · 14 turns · Will wait until the city is size 2',
      '12 / 40 · 14 turns',
    ]
  );

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
