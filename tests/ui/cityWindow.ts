// The open city screen's own handling of keys, clicks and updates (#484), with the real `City` window built under
//  linkedom: Enter on a focused button doesn't close the screen; a second specialist change before the city is updated
//  is not sent, naming a specialist the city no longer has; an update doesn't take the focus from a window open over
//  the screen, nor a change to the player's gold alone from anywhere but the screen itself; and the production picker
//  opens once however often it is asked for while the worker answers, and not at all once the screen has closed. The
//  production action's picker opens once too.
// The turns the screen says growth or production will take (#489): never, for a city with nothing to spare or short.
// The food and shield meters (#686, #687): the stored part, next turn's part or a shortfall's, no more than the cost,
//  and the shields kept for the next item when none is chosen.
// Updates reach the screen as they do in the game: collected into the shared `DataChanges` instance and `notify`d.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import { City as CityData, GameData } from '../../src/js/UI/types';
import i18next from 'i18next';
import City from '../../src/js/UI/components/City';
import CityBuildAction from '../../src/js/UI/components/Actions/CityBuild';
import {
  renderMeter,
  turnsLeft,
} from '../../src/js/UI/components/lib/cityYields';
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

// Nor does it select a field's text.
(globalThis as any).HTMLInputElement.prototype.select = () => {};

setPreloadContainer(document.querySelector('#preload') as HTMLElement);

// No assets: the citizens and the action's button are drawn without their images.
assetStore.firstImported = () => new Promise(() => {});
assetStore.get = () => new Promise(() => {});
assetStore.getScaled = () => new Promise(() => {});

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
    treasuries: [{ id: 'Treasury-1', yield: { _: 'Gold' }, value: 10 }],
    government: { _: 'Despotism' },
  },
  // A city of size 4 with two entertainers, as the screen reads it.
  cityData = (specialistIds: string[]): CityData => {
    const city = {
      _: 'City',
      id: 'City-1',
      name: 'Babylon',
      originalPlayer: player,
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
  // The city as an update leaves it, drawn on the next render: one of the city's own, or one to the player's gold alone.
  update = (city: CityData, changedIds: string[] = [city.id]): void => {
    dataChanges.collect(changedIds);
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

  // A change to the player's gold alone, which can come at any time: the screen keeps the focus it had, and takes it
  //  from nowhere else, the map or the rest of the page (#503). Each check counts the focus taken by its own update.
  const focusesTaken = (
    focus: Element | null,
    changedIds?: string[]
  ): number => {
    const before = focusTaken;

    focused = focus;
    update(cityData(['S-3', 'S-5']), changedIds);

    return focusTaken - before;
  };

  expect(
    'a change to the gold alone does not take the focus from the page',
    focusesTaken(document.body, ['Treasury-1']),
    0
  );
  expect(
    'but gives it back to the screen when the redraw took it from inside',
    focusesTaken(screen.element().querySelector('div.build button'), [
      'Treasury-1',
    ]),
    1
  );
  expect(
    'while a change of its own takes it from the page',
    focusesTaken(document.body),
    1
  );

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

  // Turns to grow or build.

  const food = (...values: number[]) =>
      values.map((value) => ({ _: 'Food', __: ['Food', 'Yield'], value })),
    growth = { progress: { value: 10 }, cost: { value: 30 } } as any;

  expect(
    'a city with 2 Food to spare fills its 20 left in 10 turns',
    turnsLeft(growth, food(6, -4) as any, 'Food'),
    10
  );
  expect(
    'one 2 Food short never does',
    turnsLeft(growth, food(2, -4) as any, 'Food'),
    0
  );
  expect(
    'nor one with nothing to spare',
    turnsLeft(growth, food(4, -4) as any, 'Food'),
    0
  );
  expect(
    'but what progress already covers is done next turn, with nothing to spare',
    turnsLeft(
      { progress: { value: 35 }, cost: { value: 10 } } as any,
      food(4, -4) as any,
      'Food'
    ),
    1
  );

  // A trade route is its city and one Trade icon a point, with the words for a screen reader (#683).
  {
    const city = cityData([]);

    city.tradeRoutes = [{ civilization: 'Babylonian', name: 'Ur', trade: 3 }];

    const tradeScreen = new City(city, portal, transport),
      route = tradeScreen.element().querySelector('.trade-route');

    expect(
      'a trade route draws a Trade icon a point',
      route?.querySelectorAll('.yield-icon').length,
      3
    );
    expect(
      'and keeps its words for a screen reader',
      route?.querySelector('.visually-hidden')?.textContent,
      'City.trade-route'
    );

    tradeScreen.close();
  }

  // Previous and Next step through the player's cities in the order they're sent, wrapping at either end (#678).
  {
    const named = (id: string, name: string, owner = player): CityData => {
        const city = cityData([]) as any;

        Object.assign(city, {
          id,
          name,
          player: owner,
          originalPlayer: owner,
        });
        city.build = { ...city.build, id: `CityBuild-${id}`, city };
        city.growth = { ...city.growth, id: `CityGrowth-${id}` };

        return city;
      },
      owner = { ...player, cities: [] as CityData[] },
      [first, second, third] = [
        named('City-A', 'Babylon', owner as any),
        named('City-B', 'Ur', owner as any),
        named('City-C', 'Nineveh', owner as any),
      ];

    owner.cities.push(first, second, third);

    const stepping = new City(first, portal, transport),
      title = () =>
        stepping.element().querySelector(':scope > header > h3')?.textContent,
      click = (selector: string) =>
        stepping
          .element()
          .querySelector(selector)!
          .dispatchEvent(new Event('click'));

    click('.city-actions button.next');

    expect('Next shows the next city', title(), 'Ur');

    key(stepping.element(), 'ArrowRight');

    expect('and so does Right', title(), 'Nineveh');

    key(stepping.element(), 'ArrowRight');

    expect('past the last is the first', title(), 'Babylon');

    key(stepping.element(), 'ArrowLeft');

    expect('and Left before the first is the last', title(), 'Nineveh');

    click('.city-actions button.previous');

    expect('as Previous steps back', title(), 'Ur');

    const arrow = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowLeft',
    });

    stepping.element().dispatchEvent(arrow);

    expect(
      'the screen keeps the arrow to itself',
      arrow.defaultPrevented,
      true
    );

    // Now on Babylon: an update to Ur, the city left behind, doesn't redraw the screen, and one to Babylon does.
    const updatedUr = named('City-B', 'Ur', owner as any),
      updatedBabylon = named('City-A', 'Babil', owner as any);

    (updatedUr.build as any).building = {
      item: { _: 'Temple', __: ['Temple'] },
    };
    dataChanges.collect(['City-B']);
    dataChanges.notify({ player: owner } as unknown as GameData);

    expect('the city left behind is no longer watched', title(), 'Babylon');

    owner.cities.splice(0, 1, updatedBabylon);
    sent = [];
    dataChanges.collect(['City-A']);
    dataChanges.notify({ player: owner } as unknown as GameData);

    expect(
      'the city stepped to is, and a new name shows at once',
      title(),
      'Babil'
    );

    click('.city-actions button.rename');

    const nameWindow = document.querySelector('.city-name-window')!,
      input = nameWindow.querySelector('input')! as HTMLInputElement;

    expect('Rename fills the box with the name', input.value, 'Babil');
    expect(
      'and allows Civ1’s 12 letters',
      input.getAttribute('maxlength'),
      '12'
    );

    input.value = '  Akkad ';
    key(input, 'Enter');

    expect('Enter sends the name, trimmed, for that city', sent, [
      { name: 'RenameCity', id: 'City-A', cityName: 'Akkad' },
    ]);
    expect(
      'and closes the box',
      document.querySelectorAll('.city-name-window').length,
      0
    );

    // OK pressed with Enter, from the button rather than the field.
    click('.city-actions button.rename');
    (
      document.querySelector('.city-name-window input') as HTMLInputElement
    ).value = 'Uruk';
    key(
      document.querySelector('.city-name-window')!,
      'Enter',
      [...document.querySelectorAll('.city-name-window footer button')][0]
    );

    expect('Enter on OK sends the name too', sent.slice(1), [
      { name: 'RenameCity', id: 'City-A', cityName: 'Uruk' },
    ]);

    sent.splice(1);

    // OK on the name as it was shown is no new name.
    click('.city-actions button.rename');
    key(document.querySelector('.city-name-window input')!, 'Enter');

    expect('the name left as it was sends nothing', sent.length, 1);

    // A confirmation answered after a step is for the city it was opened for.
    (updatedBabylon.build as any).building = {
      item: { _: 'Temple', __: ['Temple'] },
    };
    stepping.completeProduction({
      resource: { _: 'Gold' },
      value: 10,
    } as any);
    key(stepping.element(), 'ArrowRight');
    sent = [];
    (
      [
        ...document.querySelectorAll('.confirmationWindow footer button'),
      ][0] as HTMLElement
    ).dispatchEvent(new Event('click'));

    expect('a purchase confirmed after a step buys the first city’s', sent, [
      {
        name: 'CompleteProduction',
        id: 'CityBuild-City-A',
        treasury: 'Treasury-1',
      },
    ]);

    sent = [{ name: 'RenameCity', id: 'City-A' }];

    click('.city-actions button.rename');

    const emptied = document.querySelector('.city-name-window input')!;

    (emptied as HTMLInputElement).value = '   ';
    key(emptied, 'Enter');

    expect('an empty name sends nothing', sent.length, 1);

    // A name the player typed is text, not HTML, in the title.
    stepping.close();

    const tagged = new City(
      named('City-D', '<b>Kish</b>', owner as any),
      portal,
      transport
    );

    expect(
      'a name with < shows as typed',
      tagged.element().querySelector(':scope > header > h3')?.textContent,
      '<b>Kish</b>'
    );

    tagged.close();

    // A single city has nowhere to step to; a rival's city has none of the buttons.
    const alone = new City(
      named('City-E', 'Lagash', { ...player, cities: [] } as any),
      portal,
      transport
    );

    alone
      .element()
      .querySelector('.city-actions button.next')!
      .dispatchEvent(new Event('click'));
    key(alone.element(), 'ArrowLeft');

    expect(
      'with one city, Next and Left do nothing',
      alone.element().querySelector(':scope > header > h3')?.textContent,
      'Lagash'
    );

    alone.close();

    const rival = new City(first, portal, transport, { readOnly: true });

    expect(
      'a read-only screen has no city buttons',
      rival.element().querySelectorAll('.city-actions').length,
      0
    );

    rival.close();
  }

  // A sellable improvement has a Sell button naming what it fetches; one that can't be sold has none (#684).
  {
    const city = cityData([]) as any;

    city.improvements = [
      {
        _: 'Barracks',
        id: 'Improvement-1',
        saleValue: [{ resource: { _: 'Gold' }, value: 40 }],
      },
      { _: 'Palace', id: 'Improvement-2', saleValue: [] },
    ];

    sent = [];

    const selling = new City(city, portal, transport),
      rows = selling.element().querySelectorAll('.improvements .improvement');

    expect('each improvement has a row', rows.length, 2);
    expect(
      'the sellable one has a Sell button',
      rows[0].querySelector('button.sell')?.textContent,
      'City.SellImprovement.sell'
    );
    expect(
      'the other has none',
      rows[1].querySelectorAll('button.sell').length,
      0
    );

    rows[0].querySelector('button.sell')!.dispatchEvent(new Event('click'));

    expect(
      'Sell asks first',
      document.querySelectorAll('.confirmationWindow').length,
      1
    );

    document
      .querySelectorAll('.confirmationWindow')
      .forEach((window) => window.remove());
    selling.close();
  }

  // The food and shield meters (#686, #687): what's stored, then what next turn brings or a shortfall takes.
  {
    const meterOf = (screen: City, area: string) =>
        screen.element().querySelector(`.${area} .meter`) as HTMLElement | null,
      widths = (meter: HTMLElement | null) =>
        meter && {
          fill: (meter.querySelector('.fill') as HTMLElement).style.width,
          next: (meter.querySelector('.next') as HTMLElement).style.width,
          loss: meter.querySelector('.next')!.classList.contains('loss'),
          tick: meter.style.getPropertyValue('--tick'),
        },
      yieldOf = (_: string, value: number) => ({
        _,
        __: [_, 'Yield'],
        value,
      }),
      meterCity = (
        build: object,
        growth: object,
        yields: object[] = []
      ): CityData => {
        const city = cityData([]);

        city.build = { ...city.build, ...build };
        city.growth = { ...city.growth, ...growth };
        city.yields = yields as CityData['yields'];

        return city;
      };

    // The signed figure is the one wording this checks: `+` for a surplus, `-` for a shortfall.
    i18next.addResource(
      'en',
      'translation',
      'City.Progress.per-turn',
      '{{count, number(signDisplay: exceptZero)}} / turn'
    );

    let meters = new City(
      meterCity(
        {
          building: {
            item: { _: 'Barracks', __: ['Barracks'] },
            cost: { value: 40 },
          },
          progress: { value: 12 },
          cost: { value: 40 },
        },
        { progress: { value: 20 }, cost: { value: 50 }, size: 4 },
        [yieldOf('Food', 5), yieldOf('Production', 4)]
      ),
      portal,
      transport
    );

    expect(
      'the food meter shows the store and next turn’s food',
      widths(meterOf(meters, 'growth')),
      { fill: '40%', next: '10%', loss: false, tick: '20%' }
    );
    expect(
      'the shield meter shows the shields and next turn’s',
      widths(meterOf(meters, 'build')),
      { fill: '30%', next: '10%', loss: false, tick: '25%' }
    );
    expect(
      'the figures name the yield, and say the store, the cost, each turn’s and the turns left',
      [...meters.element().querySelectorAll('.growth .figures > span')].map(
        (span) => [span.className, span.textContent]
      ),
      [
        ['stored', 'Food: Progress.data'],
        ['per-turn', '+5 / turn'],
        ['turns', 'Progress.turns'],
      ]
    );
    meters.close();

    meters = new City(
      meterCity(
        {
          building: {
            item: { _: 'Pyramids', __: ['Pyramids'] },
            cost: { value: 600 },
          },
          progress: { value: 590 },
          cost: { value: 600 },
        },
        { progress: { value: 70 }, cost: { value: 50 } },
        [yieldOf('Food', 5), yieldOf('Production', 30)]
      ),
      portal,
      transport
    );

    expect(
      'a meter goes no further than the cost, and a large cost has fewer ticks',
      [widths(meterOf(meters, 'growth')), widths(meterOf(meters, 'build'))].map(
        (meter) => meter && [meter.fill, meter.next, meter.tick]
      ),
      [
        ['100%', '0%', '20%'],
        [
          `${(590 / 600) * 100}%`,
          `${(10 / 600) * 100}%`,
          `${(20 / 600) * 100}%`,
        ],
      ]
    );
    meters.close();

    meters = new City(
      meterCity({}, { progress: { value: 20 }, cost: { value: 40 } }, [
        yieldOf('Food', -4),
      ]),
      portal,
      transport
    );

    expect(
      'a shortfall is taken from the store, in red',
      widths(meterOf(meters, 'growth')),
      { fill: '40%', next: '10%', loss: true, tick: '25%' }
    );
    expect(
      'and its figure is marked as short',
      [...meters.element().querySelectorAll('.growth .per-turn.negative')].map(
        (span) => span.textContent
      ),
      ['-4 / turn']
    );
    meters.close();

    meters = new City(
      meterCity({ progress: { value: 17 } }, {}),
      portal,
      transport
    );

    expect(
      'with no item, the shields stored are said, with no meter',
      [
        meterOf(meters, 'build'),
        meters.element().querySelector('.build .figures')?.textContent,
      ],
      [null, 'City.Build.stored']
    );
    meters.close();

    meters = new City(meterCity({}, {}), portal, transport);

    expect(
      'with no item and nothing stored, there is no meter and no line',
      [
        meterOf(meters, 'build'),
        meters.element().querySelectorAll('.build .figures').length,
      ],
      [null, 0]
    );
    meters.close();

    expect(
      'a meter with no countable size is hidden',
      renderMeter('Production', NaN, Infinity, 10).hidden,
      true
    );
  }

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
