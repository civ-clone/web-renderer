// Acting on what the UI sends (#449), checked with plain data: `findPlayerAction` finds the player's action by name and
//  value id, the handler table has one entry for each action the client acts on, in the order its `if` chain tested
//  them, End Turn, Reassign Workers and the actions the client can't act on answer as they did, and a unit's action
//  waits for the talks under way, then offers talks with the players met on the way, inside the hold on flushes, in
//  the same number of microtasks as before the move (#503): counted through `handleAction` and through the client.

import { ActiveUnit, InactiveUnit } from '@civ-clone/civ1-unit/PlayerActions';
import { Activate } from '@civ-clone/civ1-unit/Actions';
import {
  ChangeProduction,
  CityBuild,
} from '@civ-clone/core-city-build/PlayerActions';
import {
  ChooseGovernment,
  Revolution,
} from '@civ-clone/civ1-government/PlayerActions';
import {
  CompleteProduction,
  SellImprovement,
} from '@civ-clone/civ1-treasury/PlayerActions';
import {
  actionHandlers,
  findPlayerAction,
  handleAction,
} from '../../src/js/Engine/Client/handleAction';
import {
  handleActiveUnit,
  handleInactiveUnit,
} from '../../src/js/Engine/Client/actions/unit';
import {
  handleAdjustTradeRates,
  handleChooseGovernment,
  handleChooseResearch,
  handleLaunchSpaceship,
  handleRevolution,
} from '../../src/js/Engine/Client/actions/player';
import {
  handleChangeSpecialist,
  handleChangeWorkedTile,
  handleCityBuild,
  handleCompleteProduction,
  handleSellImprovement,
} from '../../src/js/Engine/Client/actions/city';
import { ActionContext } from '../../src/js/Engine/Client/actions/ActionContext';
import ActionsState from '../../src/js/Engine/Client/ActionsState';
import { AdjustTradeRates } from '@civ-clone/civ1-trade-rate/PlayerActions';
import ChangeSpecialist from '@civ-clone/core-city/PlayerActions/ChangeSpecialist';
import ChangeWorkedTile from '@civ-clone/core-city/PlayerActions/ChangeWorkedTile';
import ChooseResearch from '@civ-clone/civ1-science/PlayerActions/ChooseResearch';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import { EndTurn } from '@civ-clone/civ1-player/PlayerActions';
import { LaunchSpaceship } from '@civ-clone/civ1-spaceship/PlayerActions';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import type Unit from '@civ-clone/core-unit/Unit';
import PlayerPatches from '../../src/js/Engine/Client/PlayerPatches';
import Talks from '../../src/js/Engine/Client/Talks';
import { stubView } from './lib/view';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';

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

const same = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (actual !== expected) {
    failures.push(`${description}: not the same object`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL clientHandleAction: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

// What the console was told, for the paths that only log.
const logged: string[] = [];
const log = console.log;

console.log = (...args: any[]): void => {
  logged.push(args.map((arg) => JSON.stringify(arg) ?? 'undefined').join(' '));
};

const player: any = { actions: (): PlayerAction[] => [] },
  valued = (id: string) => ({ id: () => id } as unknown as Unit);

// findPlayerAction
const first = new InactiveUnit(player, valued('unit-1')),
  second = new InactiveUnit(player, valued('unit-2')),
  active = new ActiveUnit(player, valued('unit-1')),
  endTurn = new EndTurn(player, null),
  duplicate = new InactiveUnit(player, valued('unit-1')),
  actions: PlayerAction[] = [first, second, active, endTurn, duplicate];

same(
  'found by name and value id',
  findPlayerAction(actions, { name: 'InactiveUnit', id: 'unit-2' }),
  second
);
same(
  'the same value under another name is that action',
  findPlayerAction(actions, { name: 'ActiveUnit', id: 'unit-1' }),
  active
);
same(
  'of two that match, the first',
  findPlayerAction(actions, { name: 'InactiveUnit', id: 'unit-1' }),
  first
);
same(
  'an action with no value is found with no id',
  findPlayerAction(actions, { name: 'EndTurn' }),
  endTurn
);
expect(
  'an action with no value is not found with an id',
  findPlayerAction(actions, { name: 'EndTurn', id: 'unit-1' }) ?? null,
  null
);
expect(
  'an action with a value is not found with no id',
  findPlayerAction(actions, { name: 'InactiveUnit' }) ?? null,
  null
);
expect('no name finds nothing', findPlayerAction(actions, {}) ?? null, null);
expect(
  'a name the player has no action of finds nothing',
  findPlayerAction(actions, { name: 'Revolution', id: 'unit-1' }) ?? null,
  null
);
expect(
  'an id none of that name has finds nothing',
  findPlayerAction(actions, { name: 'InactiveUnit', id: 'unit-3' }) ?? null,
  null
);
expect(
  'no actions, nothing found',
  findPlayerAction([], { name: 'InactiveUnit', id: 'unit-1' }) ?? null,
  null
);

// The table: each action the client acted on, once, in the order its `if` chain tested them, with its handler.
const expectedTable: [Function, Function][] = [
  [ActiveUnit, handleActiveUnit],
  [InactiveUnit, handleInactiveUnit],
  [CityBuild, handleCityBuild],
  [ChangeProduction, handleCityBuild],
  [ChooseResearch, handleChooseResearch],
  [CompleteProduction, handleCompleteProduction],
  [SellImprovement, handleSellImprovement],
  [Revolution, handleRevolution],
  [ChooseGovernment, handleChooseGovernment],
  [AdjustTradeRates, handleAdjustTradeRates],
  [ChangeWorkedTile, handleChangeWorkedTile],
  [ChangeSpecialist, handleChangeSpecialist],
  [LaunchSpaceship, handleLaunchSpaceship],
];

expect(
  'the table lists the actions in the order the client tested them',
  actionHandlers.map(([ActionType]) => ActionType.name),
  expectedTable.map(([ActionType]) => ActionType.name)
);
expectedTable.forEach(([ActionType, handler], index) => {
  same(
    `entry ${index} is ${ActionType.name} itself`,
    actionHandlers[index]?.[0],
    ActionType
  );
  same(
    `${ActionType.name} is acted on by ${handler.name}`,
    actionHandlers[index]?.[1],
    handler
  );
  expect(
    `${ActionType.name} has one entry`,
    actionHandlers.filter(([Type]) => Type === ActionType).length,
    1
  );
});
// No action in the table is an instance of another's class, so which comes first can't change which handler acts.
expect(
  'no two classes in the table are one a subclass of the other',
  actionHandlers.flatMap(([A]) =>
    actionHandlers
      .filter(([B]) => A !== B && A.prototype instanceof B)
      .map(([B]) => `${A.name} < ${B.name}`)
  ),
  []
);

// What a ctx needs for the paths that only look at the player's actions.
const patchesCalls: string[] = [],
  plainContext = (overrides: Partial<ActionContext> = {}): ActionContext =>
    ({
      player: () => player,
      view: stubView(() => player, { getByTile: () => null, filter: () => [] }),
      patches: {
        city: () => patchesCalls.push('city'),
        unit: () => patchesCalls.push('unit'),
      },
      actions: new ActionsState(),
      talks: { pending: Promise.resolve(), talkToPlayersMet: async () => {} },
      cities: { getBy: () => [], getByPlayer: () => [] },
      cityImprovements: { getByCity: () => [] },
      playerTreasuries: { getBy: () => [] },
      rules: {},
      ...overrides,
    } as any);

class NotActedOn extends PlayerAction {}

const answers = async (): Promise<[string, unknown, string[]][]> => {
  const answer = async (
    description: string,
    actions: PlayerAction[],
    action: any
  ): Promise<[string, unknown, string[]]> => {
    player.actions = () => actions;
    logged.length = 0;

    const value = await handleAction(plainContext(), action);

    return [description, value, logged.splice(0)];
  };

  return [
    await answer('End Turn with only End Turn left', [endTurn], {
      name: 'EndTurn',
    }),
    await answer(
      'End Turn with a unit still to move',
      [endTurn, new ActiveUnit(player, valued('unit-1'))],
      { name: 'EndTurn' }
    ),
    await answer('End Turn with none', [], { name: 'EndTurn' }),
    // Looked for before the player's actions, so not "not specified", and nothing is sent for a city not found.
    await answer('Reassign Workers in no city', [], {
      name: 'ReassignWorkers',
      city: 'city-1',
    }),
    await answer('no name', actions, { id: 'unit-1' }),
    await answer('an action the player has not got', actions, {
      name: 'Revolution',
      id: 'government-1',
    }),
    await answer(
      'an action the client does not act on',
      [new NotActedOn(player, valued('x-1'))],
      { name: 'NotActedOn', id: 'x-1' }
    ),
  ];
};

// The microtask a thing happened on, counted from the call: a microtask that queues itself again ticks the count.
let tick = 0,
  pumping = false;
const events: string[] = [];
const record = (name: string) => events.push(`${name}@${tick}`);
const pump = (): void => {
  if (!pumping) {
    return;
  }

  tick++;

  if (tick > 100) {
    pumping = false;

    return;
  }

  queueMicrotask(pump);
};

const sent: string[] = [];
const transport: any = {
  receive: () => () => false,
  receiveOnce: () => () => false,
  send: (channel: string) => sent.push(channel),
};

// The hold the action listener puts on flushes while the action is handled, as it is: a flush from the talks is held.
const patchesView = stubView(() => player),
  patches = new PlayerPatches(
    transport,
    (() => ({})) as any,
    new ActionsState(),
    () => patchesView
  );

const tile = { id: () => 'tile' },
  playerTile = { id: () => 'player-tile', tile: () => tile },
  unit: any = {
    id: () => 'unit-1',
    actions: () => [
      {
        sourceClass: () => ({ name: 'Move' }),
        perform: () => record('perform'),
      },
      // The order that wakes it (#160): the client performs it rather than calling `activate`.
      Object.assign(Object.create(Activate.prototype), {
        sourceClass: () => Activate,
        perform: () => record('perform(Activate)'),
      }),
    ],
    activate: () => record('activate'),
    tile: () => tile,
    city: () => null,
  },
  talkToPlayersMet = async (): Promise<void> => {
    record('talkToPlayersMet');

    const before = sent.length;

    patches.flush();

    record(sent.length === before ? 'held' : 'not-held');
  };

['unit', 'city', 'onTiles'].forEach((name) => {
  (patches as any)[name] = () => record(`patches.${name}`);
});

const untimed = (events: string[]): string[] =>
  events.map((event) => event.replace(/@\d+$/, ''));

const counted = (
  handle: (action: any) => Promise<boolean>,
  action: any
): Promise<string[]> =>
  new Promise((resolve) => {
    events.length = 0;
    tick = 0;
    pumping = true;
    queueMicrotask(pump);

    patches
      .hold(() => {
        const handled = handle(action);

        handled.then((value) => record(`settled(${value})`));

        return handled;
      })
      .then(() => record('released'));

    setTimeout(() => {
      pumping = false;
      resolve(events.splice(0));
    }, 20);
  });

const moved = {
    name: 'ActiveUnit',
    id: 'unit-1',
    unitAction: 'Move',
    target: 'player-tile',
  },
  woken = { name: 'InactiveUnit', id: 'unit-1' };

// Measured on the client before the move (`DataTransferClient#handleAction` at 1c64f77), with Talks and PlayerPatches
//  patched as below: the action is performed at once, the talks under way are waited for, the talks with the players
//  met offered a microtask later with flushes still held, what the action changed queued a microtask after that, and
//  the hold let go two after that.
const activeUnitTicks = [
    'perform@0',
    'pending@0',
    'talkToPlayersMet@1',
    'held@1',
    'patches.unit@2',
    'patches.city@2',
    'patches.city@2',
    'patches.onTiles@2',
    'settled(false)@3',
    'released@4',
  ],
  inactiveUnitTicks = [
    'perform(Activate)@0',
    'patches.unit@0',
    'settled(false)@1',
    'released@2',
  ];

const run = async (): Promise<void> => {
  (await answers()).forEach(([description, value, logs]) =>
    expect(description, [value, logs], expectedAnswers[description])
  );

  const ctx = plainContext({
    patches,
    talks: {
      get pending() {
        record('pending');

        return Promise.resolve();
      },
      talkToPlayersMet,
    } as any,
    view: stubView(() => player, {
      getByTile: () => null,
      filter: (filter: (tile: any) => boolean) => [playerTile].filter(filter),
    }),
  });

  player.actions = () => [new ActiveUnit(player, unit)];
  expect(
    "a unit's action, through handleAction",
    await counted((action) => handleAction(ctx, action), moved),
    activeUnitTicks
  );

  player.actions = () => [new InactiveUnit(player, unit)];
  expect(
    'waking a unit, through handleAction',
    await counted((action) => handleAction(ctx, action), woken),
    inactiveUnitTicks
  );

  // Talks still under way: the action waits for them, with flushes held, before it offers its own.
  let finishTalks = (): void => {};
  const talksUnderWay = new Promise<void>((resolve) => {
    finishTalks = resolve;
  });

  player.actions = () => [new ActiveUnit(player, unit)];
  events.length = 0;

  const waiting = patches.hold(() =>
    handleAction(
      { ...ctx, talks: { pending: talksUnderWay, talkToPlayersMet } as any },
      moved
    )
  );

  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(
    'nothing is offered while talks are under way',
    untimed(events.splice(0)),
    ['perform']
  );

  finishTalks();
  await waiting;
  expect(
    'once they are over, the talks with those met, then what changed',
    untimed(events.splice(0)),
    [
      'talkToPlayersMet',
      'held',
      'patches.unit',
      'patches.city',
      'patches.city',
      'patches.onTiles',
    ]
  );

  // Through the client, as the action listener calls it: its `handleAction` settles when the handler does.
  Object.defineProperty(Talks.prototype, 'pending', {
    get() {
      record('pending');

      return Promise.resolve();
    },
  });
  (Talks.prototype as any).talkToPlayersMet = talkToPlayersMet;
  ['unit', 'city', 'onTiles'].forEach((name) => {
    (PlayerPatches.prototype as any)[name] = function () {
      record(`patches.${name}`);
    };
  });
  (playerWorldRegistryInstance as any).getByPlayer = () => [playerTile];

  const client = new DataTransferClient(player, transport);

  player.actions = () => [new ActiveUnit(player, unit)];
  expect(
    "a unit's action, through the client",
    await counted((action) => client.handleAction(action), moved),
    activeUnitTicks
  );

  player.actions = () => [new InactiveUnit(player, unit)];
  expect(
    'waking a unit, through the client',
    await counted((action) => client.handleAction(action), woken),
    inactiveUnitTicks
  );

  // A throw on the way rejects, as the client's `async` method did, rather than throwing at the caller.
  player.actions = () => {
    throw new Error('no actions');
  };

  let threw = false,
    rejected = '';

  try {
    await handleAction(ctx, woken).catch((error: Error) => {
      rejected = error.message;
    });
  } catch {
    threw = true;
  }

  expect('a throw rejects', [threw, rejected], [false, 'no actions']);

  finished = true;
  console.log = log;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL clientHandleAction (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS clientHandleAction (${checks} checks)\n`);
};

// What each path answers, and what it logs (#526 asks about the first "action not specified").
const expectedAnswers: { [description: string]: [unknown, string[]] } = {
  'End Turn with only End Turn left': [true, []],
  'End Turn with a unit still to move': [false, []],
  'End Turn with none': [false, []],
  'Reassign Workers in no city': [false, []],
  'no name': [false, ['"action not specified: " {"id":"unit-1"}']],
  'an action the player has not got': [false, ['"action not specified"']],
  'an action the client does not act on': [
    false,
    ['"unhandled action: {\\"name\\":\\"NotActedOn\\",\\"id\\":\\"x-1\\"}"'],
  ],
};

run().catch((error) => {
  console.log = log;
  process.stderr.write(
    `FAIL clientHandleAction: ${error instanceof Error ? error.stack : error}\n`
  );
  process.exit(1);
});
