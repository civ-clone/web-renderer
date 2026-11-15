// Civ2's combat and units in the interface (M2b, #1007), from the data the engine sends, with no rules here:
//
// - the unit card (both interfaces) shows hit points left of the most, firepower and fuel when they're sent, and a
//   Civ1 unit, which has none of them, has none of the pills; the rules' marks (`Aloft`, `MovedThisTurn`,
//   `Paradropped`) aren't listed as the unit's state;
// - a damaged unit gets a hit point bar, drawn beside its busy letter, and a unit at full strength none;
// - the new orders have keys, and Paradrop and Airlift, which the engine offers for distant squares
//   (`actionTargets`), are left out of the neighbours' actions, offered on the squares they reach in the unit's menu,
//   and ask where (a city list, or a square on the map) from their key or button;
// - Pillage with more than one target asks which, and sends the choice;
// - a Spy beside a lone foreign unit is offered Sabotage Unit as its arrival window.

// Must stay first: the components read `document` as they load.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/classicInterface';
import './lib/artPacks';

import { City, Tile, Unit, UnitAction } from '@civ-clone/ui-protocol/types';
import {
  distantOrders,
  neighbourActions,
  targetedActions,
} from '@civ-clone/ui-client/lib/unitActions';
import {
  openArrivalWindow,
  performWithPrompts,
} from '@civ-clone/ui-hud/lib/unitActionPrompts';
import Transport from '@civ-clone/ui-client/Transport';
import UnitCard from '@civ-clone/ui-interface-modern/components/UnitCard';
import UnitCardActions from '@civ-clone/ui-interface-modern/components/UnitCardActions';
import UnitDetails from '@civ-clone/ui-interface-classic/components/UnitDetails';
import chooseDistantTarget from '@civ-clone/ui-hud/lib/distantOrders';
import { drawUnitHitPoints } from '@civ-clone/ui-assets/lib/renderUnit';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import { keyForAction } from '@civ-clone/ui-client/lib/unitActionKeys';
import playUnitKey from '@civ-clone/ui-game/lib/playUnitKey';
import { unitStates } from '@civ-clone/ui-hud/lib/unitLabel';
import unitMenuActions from '@civ-clone/ui-hud/lib/unitMenuActions';

const failures: string[] = [];
let checks = 0,
  finished = false;

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

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL civ2-units: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// The unit sprites aren't loaded, which is logged.
console.error = () => {};

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

const player = {
    id: 'Player-1',
    civilization: {
      _: 'Roman',
      attributes: [{ name: 'colors', value: ['#ffffff', '#000000'] }],
    },
  },
  babylonian = { id: 'Player-2', civilization: { _: 'Babylonian' } },
  city = (name: string, originalPlayer = player) =>
    ({ id: `City-${name}`, name, originalPlayer } as unknown as City),
  square = (
    id: string,
    x: number,
    fields: { [key: string]: unknown } = {}
  ): Tile =>
    ({
      id,
      x,
      y: 0,
      city: null,
      terrain: { _: 'Grassland', features: [] },
      improvements: [],
      units: [],
      ...fields,
    } as unknown as Tile),
  home = square('Tile-home', 0, { city: city('Roma') }),
  near = square('Tile-near', 1),
  far = square('Tile-far', 9),
  outOfReach = square('Tile-out', 20),
  antium = square('Tile-antium', 12, { city: city('Antium') }),
  veii = square('Tile-veii', 15, { city: city('Veii') }),
  tiles = [home, near, far, outOfReach, antium, veii],
  value = (value: number) => ({ value }),
  action = (_: string, to: Tile = home, extra: object = {}): UnitAction =>
    ({ _, __: [], id: `${_}-1`, from: home, to, ...extra } as UnitAction),
  unit = (fields: { [key: string]: unknown } = {}): Unit =>
    ({
      _: 'Paratrooper',
      id: 'Unit-1',
      active: true,
      attack: value(6),
      busy: null,
      city: null,
      defence: value(4),
      improvements: [],
      movement: value(1),
      moves: value(1),
      player,
      tile: home,
      visibility: value(1),
      ...fields,
    } as unknown as Unit);

home.units = [];

// The window most recently opened, and what it says and offers.
const latest = () => {
    const dialogs = document.querySelectorAll('dialog');

    return dialogs[dialogs.length - 1] as HTMLElement;
  },
  text = (element: Element | null): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  shown = () => {
    const dialog = latest();

    return {
      title: text(dialog.querySelector('header')).replace(/Close$/, ''),
      options: Array.from(dialog.querySelectorAll('option')).map(text),
    };
  },
  choose = (value: string) => {
    const select = latest().querySelector('select') as HTMLSelectElement;

    Array.from(select.querySelectorAll('option')).forEach((option) =>
      option.toggleAttribute('selected', option.getAttribute('value') === value)
    );
    select.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
    );
  },
  pills = (element: HTMLElement, selector: string) =>
    Array.from(element.querySelectorAll(selector)).map((stat) => [
      stat.getAttribute('title'),
      stat.querySelector('.value')?.textContent ?? null,
    ]);

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-world/en');
  await import('../../translations/civ2-unit/en');
  await import('../../translations/civ2-world/en');

  // The unit card, both interfaces.

  const damaged = unit({
      _: 'Fighter',
      hitPoints: { current: 12, max: 20 },
      firepower: 2,
      fuel: { range: 1, turnsLeft: 1 },
      improvements: [{ _: 'Veteran' }, { _: 'Aloft' }, { _: 'MovedThisTurn' }],
    }),
    civ1 = unit({ _: 'Musketman' });

  {
    const element = document.createElement('div');

    document.body.append(element);

    const card = new UnitCard(element, {
      portal: { openCity: () => true },
      transport: { send: () => {} } as unknown as Transport,
      setActiveUnit: () => {},
    });

    card.update(damaged);

    expect(
      'the card: hit points left of the most, firepower and fuel, on a line of their own',
      pills(element, '.ui-unit-card-combat .ui-unit-card-stat'),
      [
        ['Hit points', '12/20'],
        ['Firepower', '2'],
        ['Fuel', '1/1'],
      ]
    );
    expect(
      "the card: the rules' marks aren't the unit's state",
      text(element.querySelector('.ui-unit-card-states')),
      'Veteran'
    );

    card.update(civ1);

    expect(
      'the card: a unit with none of them (Civ1’s) has no such line',
      element.querySelectorAll('.ui-unit-card-combat').length,
      0
    );

    card.update(unit({ _: 'Musketman', hitPoints: { current: 20, max: 20 } }));

    expect(
      'the card: only what is sent',
      pills(element, '.ui-unit-card-combat .ui-unit-card-stat'),
      [['Hit points', '20/20']]
    );
  }

  {
    const element = document.createElement('div');

    document.body.append(element);

    const details = new UnitDetails(element, {
      portal: { openCity: () => true },
      transport: { send: () => {} } as unknown as Transport,
      setActiveUnit: () => {},
    });

    details.update(damaged);

    expect(
      'the classic card: attack, defence and visibility, then hit points, firepower and fuel',
      Array.from(element.querySelectorAll('.stats .stat')).map((stat) => [
        stat.getAttribute('title'),
        stat.querySelector('abbr')?.textContent,
        stat.querySelector('.value')?.textContent,
      ]),
      [
        ['Attack', 'A', '6'],
        ['Defense', 'D', '4'],
        ['Visibility', 'V', '1'],
        ['Hit points', 'HP', '12/20'],
        ['Firepower', 'FP', '2'],
        ['Fuel', 'FU', '1/1'],
      ]
    );

    details.update(civ1);

    expect(
      'the classic card: a Civ1 unit as before',
      Array.from(element.querySelectorAll('.stats .stat')).map((stat) =>
        stat.getAttribute('title')
      ),
      ['Attack', 'Defense', 'Visibility']
    );
  }

  expect(
    'the state: Paradropped is a mark too',
    unitStates(
      unit({ busy: { _: 'Fortifying' }, improvements: [{ _: 'Paradropped' }] })
    ),
    ['Fortifying']
  );

  // The hit point bar.

  const drawn = (hitPoints: unknown) => {
    const calls: unknown[] = [],
      context = new Proxy({} as { [key: string]: unknown }, {
        get: (target, key: string) =>
          key === 'fillRect'
            ? (...args: number[]) => calls.push([target.fillStyle, ...args])
            : target[key],
        set: (target, key: string, value) => {
          target[key] = value;

          return true;
        },
      });

    drawUnitHitPoints(
      context as unknown as CanvasRenderingContext2D,
      { hitPoints } as Unit,
      0,
      0,
      2,
      { width: 64, height: 32 },
      {
        units: { status: { x: 0.5, baseline: 0.75, fontSize: 10 } },
      } as any
    );

    return calls;
  };

  expect(
    'the bar: none for a unit at full strength, or with no hit points sent',
    [drawn({ current: 20, max: 20 }), drawn(undefined), drawn(null)],
    [[], [], []]
  );
  expect(
    'the bar: a damaged unit has a dark ground and its share lit, above its busy letter',
    drawn({ current: 10, max: 20 }),
    [
      ['black', 44, 16, 40, 6],
      ['#e0c000', 45, 17, 19, 4],
    ]
  );
  expect(
    'the bar: green above two thirds, red at a third or less',
    [drawn({ current: 15, max: 20 }), drawn({ current: 5, max: 20 })].map(
      (calls) => (calls[1] as unknown[])[0]
    ),
    ['#20c020', '#e02020']
  );

  // The keys.

  expect(
    "the new orders' keys: Civ2's where they're free, Shift+E for the airbase",
    [
      'TransformTerrain',
      'BuildFortress',
      'BuildAirbase',
      'Paradrop',
      'Airlift',
      'Pillage',
    ].map(keyForAction),
    ['o', 'f', 'E', 'p', 'l', 'P']
  );

  // Paradrop and Airlift.

  const paratrooper = unit({
    actions: [action('Fortify')],
    actionsForNeighbours: {
      e: [action('Move', near), action('Paradrop', near)],
    },
    actionTargets: { Paradrop: [near.id, far.id] },
  });

  expect('the long-range orders', distantOrders(paratrooper), ['Paradrop']);
  expect(
    'an arrow key moves, it doesn’t paradrop one square',
    neighbourActions(paratrooper, 'e').map(({ _ }) => _),
    ['Move']
  );
  expect(
    'a square in reach is offered the paradrop, one out of reach not',
    [far, outOfReach].map((tile) =>
      targetedActions(paratrooper, tile).map(({ _, to }) => [_, to.id])
    ),
    [[['Paradrop', far.id]], []]
  );
  expect(
    "the unit's menu: a distant square in reach, the paradrop first",
    unitMenuActions(far, paratrooper, {} as Transport).actions.map(
      ({ label }) => label
    ),
    ['Paradrop', 'Go to']
  );
  expect(
    "the unit's menu: a neighbour in reach, the paradrop and the move",
    unitMenuActions(near, paratrooper, {} as Transport).actions.map(
      ({ label }) => label
    ),
    ['Paradrop', 'Move']
  );
  expect(
    "the unit's menu: out of reach, only Go to",
    unitMenuActions(outOfReach, paratrooper, {} as Transport).actions.map(
      ({ label }) => label
    ),
    ['Go to']
  );

  {
    const sent: unknown[] = [];

    unitMenuActions(far, paratrooper, {
      send: (...args: unknown[]) => sent.push(args),
    } as unknown as Transport).actions[0]!.run();

    expect("the unit's menu sends the paradrop for the square", sent, [
      [
        'action',
        {
          name: 'ActiveUnit',
          id: 'Unit-1',
          unitAction: 'Paradrop',
          target: far.id,
        },
      ],
    ]);
  }

  {
    const asked: string[] = [],
      played = playUnitKey('p', paratrooper, {
        apply: () => {},
        chooseTarget: (chosen, name) => asked.push(`${chosen.id} ${name}`),
        pendingMove: { start: () => {} },
        scheduleRender: () => {},
        send: () => asked.push('sent'),
        transport: { send: () => asked.push('sent') },
        world: {} as any,
      });

    expect(
      'the key asks where, and sends nothing yet',
      [played, asked],
      ['prompted', ['Unit-1 Paradrop']]
    );
  }

  {
    const performed: string[] = [],
      picked: {
        accept: (tile: Tile) => boolean;
        onPick: (tile: Tile) => void;
      }[] = [];

    const list = chooseDistantTarget(
      paratrooper,
      'Paradrop',
      tiles,
      (accept, onPick) => picked.push({ accept, onPick }),
      (chosen) => performed.push(`${chosen._} ${chosen.to.id}`)
    );

    expect(
      'a paradrop asks for a square on the map: no list',
      [list, picked.length],
      [null, 1]
    );
    expect(
      'which takes only the squares in reach',
      tiles.map((tile) => picked[0]!.accept(tile)),
      [false, true, true, false, false, false]
    );

    picked[0]!.onPick(far);

    expect('and sends the paradrop for the one clicked', performed, [
      `Paradrop ${far.id}`,
    ]);
  }

  {
    const infantry = unit({
        _: 'Musketman',
        actions: [],
        actionsForNeighbours: {},
        actionTargets: { Airlift: [veii.id, antium.id] },
      }),
      performed: string[] = [],
      picked: unknown[] = [];

    chooseDistantTarget(
      infantry,
      'Airlift',
      tiles,
      (...args) => picked.push(args),
      (chosen) => performed.push(`${chosen._} ${chosen.to.id}`)
    );

    expect('an airlift lists the cities it reaches, by name', shown(), {
      title: 'Airlift to which city?',
      options: ['Antium', 'Veii'],
    });

    choose(veii.id);

    expect(
      'and sends the airlift for the city chosen',
      [performed, picked],
      [[`Airlift ${veii.id}`], []]
    );
  }

  {
    const element = document.createElement('div'),
      acted: unknown[] = [];

    document.body.append(element);

    new UnitCardActions(
      element,
      (...args) => acted.push(args),
      () => {}
    ).build(paratrooper, home);

    expect(
      'the card has a button for the paradrop, with its key',
      Array.from(element.querySelectorAll('.ui-unit-card-action')).map(
        (button) => [
          button.getAttribute('data-action'),
          button.getAttribute('aria-keyshortcuts'),
        ]
      ),
      [
        ['Fortify', 'f'],
        ['Paradrop', 'p'],
      ]
    );

    element
      .querySelector<HTMLElement>(
        '.ui-unit-card-action[data-action="Paradrop"]'
      )!
      .dispatchEvent(new Event('click', { bubbles: true }));

    expect('which asks the controller for it', acted, [
      ['Unit-1', 'Paradrop', undefined],
    ]);
  }

  // Pillage, with a choice.

  {
    const sent: unknown[] = [],
      pillage = action('Pillage', home, { targets: ['Mine', 'Road'] }),
      settlers = unit({ _: 'Settlers' });

    performWithPrompts(settlers, pillage, [pillage], (chosen) =>
      sent.push([chosen._, chosen.choice])
    );

    expect('pillaging a square with two improvements asks which', shown(), {
      title: 'Pillage: which one?',
      options: ['Mine', 'Road'],
    });

    choose('Road');

    performWithPrompts(
      settlers,
      action('Pillage', home, { targets: ['Road'] }),
      [],
      (chosen) => sent.push([chosen._, chosen.choice])
    );
    performWithPrompts(settlers, action('Pillage'), [], (chosen) =>
      sent.push([chosen._, chosen.choice])
    );

    expect(
      'and sends the one chosen; one with a single target, or none (Civ1), is sent as it is',
      sent,
      [
        ['Pillage', 'Road'],
        ['Pillage', undefined],
        ['Pillage', undefined],
      ]
    );
  }

  // A Spy's arrival beside a lone foreign unit.

  {
    const target = square('Tile-target', 2, {
        units: [{ _: 'Warrior', player: babylonian }],
      }),
      sent: string[] = [],
      sabotage = action('SabotageUnit', target),
      bribe = action('BribeUnit', target, { cost: 50 }),
      spy = unit({
        _: 'Spy',
        player: {
          ...player,
          treasuries: [{ yield: { _: 'Gold' }, value: 100 }],
        },
      });

    openArrivalWindow(spy, [bribe, sabotage], (chosen) => sent.push(chosen._));

    expect("a Spy beside a lone unit: its arrival window's missions", shown(), {
      title: 'Roman Spy reaches the Babylonian Warrior',
      options: ['Bribe unit', 'Sabotage unit'],
    });

    choose('sabotage-unit');

    expect('choosing Sabotage Unit sends it', sent, ['SabotageUnit']);

    sent.length = 0;

    const opened = openArrivalWindow(spy, [sabotage], (chosen) =>
      sent.push(chosen._)
    );

    // It answers itself once the window is made.
    await Promise.resolve();

    expect(
      'with Sabotage Unit its only mission (Civ2 has no bribe yet), the one row answers itself, as such a list does',
      [opened !== null && 'autoChosen' in opened && opened.autoChosen(), sent],
      [true, ['SabotageUnit']]
    );
  }

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL civ2-units (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civ2-units (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL civ2-units: ${error.stack ?? error}\n`);
  process.exit(1);
});
