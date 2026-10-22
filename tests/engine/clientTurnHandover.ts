// Handing the turn to the UI and back (#449), checked with plain data and counted in microtasks (#503).
//
// `TurnHandover` is driven over a stub transport with the real `PlayerPatches` (its hold and flush), the real
//  `Notifier`, the real `Automation` and the real `handleAction`:
//  - the hand-over sends `gameData` on the first turn, then 1 ms later the patch with the new turn, `turnStarted`, the
//    notifications held until then and the halted GoTos, in that order, and the player again on later turns only;
//  - a unit's action sends one patch, `actionHandled` and its halts on the 4th microtask after the UI's `action`, a
//    microtask after the hold on flushes is let go (`PlayerPatches.hold` is `async`), with the talks' flush held;
//  - `EndTurn` sends one patch, `actionHandled` and `turnEnded` on the 2nd, and the turn is over 10 ms later;
//  - a throwing action ends the turn with its error and stops listening, and an automated turn is played by
//    automation's client and sends the turn and the whole player in one patch, without a hand-over;
//  - whether notifications are held reads the hand-over and automation as each is given.
// Then, through the client: after `setAutomationEnabled` toggles, the engine listeners the client registered (the
//  halted GoTo, the talks' and the patches' `unit:moved`) and `chooseFromList` read automation as it is now.

import ActionsState from '../../src/js/Engine/Client/ActionsState';
import { ActiveUnit } from '@civ-clone/civ1-unit/PlayerActions';
import Automation from '../../src/js/Engine/Client/Automation';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import { EndTurn } from '@civ-clone/civ1-player/PlayerActions';
import Notifier from '../../src/js/Engine/Client/Notifier';
import PlayerPatches from '../../src/js/Engine/Client/PlayerPatches';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import TurnHandover, {
  registerTurnHandoverEvents,
} from '../../src/js/Engine/Client/TurnHandover';
import { handleAction } from '../../src/js/Engine/Client/handleAction';
import { instance as currentPlayerRegistryInstance } from '@civ-clone/core-player/CurrentPlayerRegistry';
import { instance as engineInstance } from '@civ-clone/core-engine/Engine';
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

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL clientTurnHandover: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

// The microtask a thing happened on, counted from when the count started: a microtask that queues itself again ticks
//  the count, as in `clientHandleAction.ts`.
let tick = 0,
  pumping = false;
const events: string[] = [];
const record = (name: string) =>
  events.push(pumping ? `${name}@${tick}` : name);
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
const startCounting = (): void => {
  tick = 0;
  pumping = true;
  queueMicrotask(pump);
};
const untimed = (list: string[]): string[] =>
  list.map((event) => event.replace(/@\d+$/, ''));
const taken = (): string[] => {
  pumping = false;

  return events.splice(0);
};
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// What the UI is sent, and the `action`s it sends.
let actionHandler: ((...args: any[]) => void) | null = null;
const transport: any = {
  receive: (channel: string, handler: (...args: any[]) => void) => {
    if (channel === 'action') {
      actionHandler = handler;
    }

    return () => false;
  },
  receiveOnce: () => () => false,
  send: (channel: string, data: any): void => {
    if (channel === 'gameNotification') {
      record(`gameNotification(${data.key})`);

      return;
    }

    if (channel === 'unitHalted') {
      record(`unitHalted(${data.unit})`);

      return;
    }

    record(channel);
  },
};
const sendAction = (action: any): void => actionHandler!(action);

const filterCalls: any[][] = [];
const dataFilter: any = (...args: any[]) => {
  filterCalls.push(args);

  return (object: any) => object;
};

let actions: () => any[] = () => [],
  currentPlayers: any[] = [];

const player: any = {
    id: () => 'player-1',
    actions: () => actions(),
  },
  tile = { id: () => 'tile' },
  playerTile = { id: () => 'player-tile', tile: () => tile },
  unit: any = {
    id: () => 'unit-1',
    player: () => player,
    actions: () => [
      {
        sourceClass: () => ({ name: 'Move' }),
        perform: () => {
          record('perform');

          // A GoTo carried on by the move stops next to a choice (#357).
          engineListeners['unit:halted'](unit, tile);
        },
      },
    ],
    tile: () => tile,
    city: () => null,
  };

// The engine listener the hand-over registers.
const engineListeners: { [event: string]: (...args: any[]) => void } = {};
const engine: any = {
  on: (event: string, listener: (...args: any[]) => void) => {
    engineListeners[event] = listener;
  },
};

const patches = new PlayerPatches(
  transport,
  dataFilter,
  new ActionsState(),
  () => player
);

// The real hold and flush; what the rest queue is recorded.
Object.assign(patches, {
  update: (id: string) => record(`patches.update(${id})`),
  wholePlayer: (_filter: unknown, type?: string) =>
    record(`patches.wholePlayer(${type ?? ''})`),
  playerState: () => {
    record('patches.playerState');

    return 'state';
  },
  playerStateChanged: (before: string) =>
    record(`patches.playerStateChanged(${before})`),
  actions: () => record('patches.actions'),
  unit: () => record('patches.unit'),
  city: () => record('patches.city'),
  onTiles: () => record('patches.onTiles'),
});

const notifier = new Notifier(transport, dataFilter),
  note = (key: string): any => ({ toPlainObject: () => ({ key }) });

const metOnTheWay = new Set<any>(),
  talks: any = {
    metOnTheWay,
    handOver: () => record('talks.handOver'),
  };

const automationClient: any = {
    takeTurn: async (): Promise<void> => {
      record('automation.takeTurn');
    },
  },
  automation = new Automation(automationClient, false, {
    player: () => player,
    currentPlayers: { entries: () => currentPlayers },
  });

// What a unit's action reads, as `clientHandleAction.ts` has it: the talks under way are over, and the talks with the
//  players met try to flush, which the hold keeps back.
const actionContext: any = {
  player: () => player,
  patches,
  actions: new ActionsState(),
  talks: {
    pending: Promise.resolve(),
    talkToPlayersMet: async (): Promise<void> => {
      record('talkToPlayersMet');
      patches.flush();
    },
  },
  cities: { getBy: () => [], getByPlayer: () => [] },
  cityImprovements: { getByCity: () => [] },
  playerTreasuries: { getBy: () => [] },
  playerWorlds: { getByPlayer: () => [playerTile] },
  rules: {},
};

let throwing = false;

const turnHandover = new TurnHandover({
  player: () => player,
  transport,
  dataFilter,
  actions: new ActionsState(),
  patches,
  notifier,
  talks,
  automation,
  // As the client's own `handleAction` is called, with when it settles recorded.
  handleAction: (...args: any[]): Promise<boolean> => {
    if (throwing) {
      return Promise.reject(new Error('the action threw'));
    }

    const handled = handleAction(actionContext, ...args);

    handled.then((value) => record(`settled(${value})`));

    return handled;
  },
  difficulties: { entries: () => [] } as any,
  playerWorlds: {
    getByPlayer: () => ({
      getByTile: (target: any) => (target === tile ? playerTile : null),
    }),
  } as any,
  turn: { id: () => 'turn' } as any,
  year: { id: () => 'year' } as any,
});

notifier.holdWhile(() => turnHandover.holdsNotifications());
registerTurnHandoverEvents(engine, turnHandover);

const run = async (): Promise<void> => {
  currentPlayers = [player];

  // The first turn: what happened before it is held, and goes after `turnStarted`.
  notifier.notify(note('before'));
  engineListeners['unit:halted'](unit, tile);
  engineListeners['unit:halted'](unit, { id: () => 'unseen' });

  let firstOver = false;
  const first = turnHandover.takeTurn().then(() => {
    firstOver = true;
  });

  notifier.notify(note('during'));
  expect('the first turn sends the initial data at once', events.splice(0), [
    'patches.unit',
    'gameData',
  ]);
  expect(
    "the initial data goes through the player's filter, tiles in full",
    filterCalls.map((args) => args[1] ?? null),
    [null, { tilesInFull: true }, null]
  );
  expect('not handed over yet', turnHandover.handedOver, false);

  await wait(20);
  expect(
    'a ms later: the turn, turnStarted, what was held, the halts, then the talks',
    events.splice(0),
    [
      'patches.update(turn)',
      'patches.update(year)',
      'gameDataPatch',
      'turnStarted',
      'gameNotification(before)',
      'gameNotification(during)',
      'unitHalted(unit-1)',
      'talks.handOver',
    ]
  );
  expect('handed over', turnHandover.handedOver, true);

  notifier.notify(note('after'));
  expect('once handed over, a notification goes at once', events.splice(0), [
    'gameNotification(after)',
  ]);

  // A unit's action: one patch, `actionHandled`, then the halts, a microtask after the hold is let go.
  actions = () => [new ActiveUnit(player, unit)];
  startCounting();
  sendAction({
    name: 'ActiveUnit',
    id: 'unit-1',
    unitAction: 'Move',
    target: 'player-tile',
  });
  await wait(20);
  expect("a unit's action, counted from the UI's action", taken(), [
    'patches.playerState@0',
    'perform@0',
    // The halt, held until the move's patch has gone.
    'patches.unit@0',
    // Its flush held: no gameDataPatch here.
    'talkToPlayersMet@1',
    'patches.unit@2',
    'patches.city@2',
    'patches.city@2',
    'patches.onTiles@2',
    'settled(false)@3',
    'patches.playerStateChanged(state)@4',
    'patches.actions@4',
    'gameDataPatch@4',
    'actionHandled@4',
    'unitHalted(unit-1)@4',
  ]);

  // End Turn: one patch, `actionHandled` and `turnEnded`, and the turn is over 10 ms later.
  actions = () => [new EndTurn(player, null)];
  startCounting();
  sendAction({ name: 'EndTurn' });
  await wait(5);
  expect("End Turn, counted from the UI's action", taken(), [
    'patches.playerState@0',
    'settled(true)@1',
    'gameDataPatch@2',
    'actionHandled@2',
    'turnEnded@2',
  ]);
  expect('no longer handed over', turnHandover.handedOver, false);
  expect('the turn is not over before 10 ms', firstOver, false);
  await wait(20);
  await first;
  expect('the turn is over after 10 ms', firstOver, true);

  sendAction({ name: 'EndTurn' });
  await wait(5);
  expect('the ended turn listens no more', events.splice(0), []);

  // Held while it is our turn and not handed over, read as each notification is given.
  notifier.notify(note('ours'));
  automation.setEnabled(true);
  notifier.notify(note('automated'));
  automation.setEnabled(false);
  currentPlayers = [];
  notifier.notify(note('theirs'));
  currentPlayers = [player];
  expect(
    'held on our turn by hand, not automated, nor on their turn',
    events.splice(0),
    ['gameNotification(automated)', 'gameNotification(theirs)']
  );

  // A later turn: no initial data, the player again, and what was held.
  const second = turnHandover.takeTurn();
  let secondError = '';

  second.catch((error: Error) => {
    secondError = error.message;
  });

  await wait(20);
  expect('a later turn sends the player again', events.splice(0), [
    'patches.update(turn)',
    'patches.update(year)',
    'patches.wholePlayer(add)',
    'gameDataPatch',
    'turnStarted',
    'gameNotification(ours)',
    'talks.handOver',
  ]);

  // A throwing action ends the turn with its error, and the turn listens no more.
  throwing = true;
  sendAction({ name: 'EndTurn' });
  await wait(5);
  throwing = false;
  expect('a throwing action rejects the turn', secondError, 'the action threw');
  expect('a throwing action sends nothing', events.splice(0), [
    'patches.playerState',
  ]);
  sendAction({ name: 'EndTurn' });
  await wait(5);
  expect('after a throw, the turn listens no more', events.splice(0), []);

  // An automated turn: automation's client plays it, and the turn and the whole player go in one patch. What a GoTo
  //  halted on and who was met before it are dropped.
  engineListeners['unit:halted'](unit, tile);
  metOnTheWay.add('someone');
  automation.setEnabled(true);
  engineListeners['unit:halted'](unit, tile);
  await turnHandover.takeTurn();
  expect('an automated turn', events.splice(0), [
    'patches.unit',
    'automation.takeTurn',
    'patches.update(turn)',
    'patches.update(year)',
    'patches.wholePlayer()',
    'gameDataPatch',
  ]);
  expect('who was met is dropped', metOnTheWay.size, 0);

  automation.setEnabled(false);

  const third = turnHandover.takeTurn();

  await wait(20);
  expect('the halt dropped by automation is not sent', events.splice(0), [
    'patches.update(turn)',
    'patches.update(year)',
    'patches.wholePlayer(add)',
    'gameDataPatch',
    'turnStarted',
    'talks.handOver',
  ]);
  actions = () => [new EndTurn(player, null)];
  sendAction({ name: 'EndTurn' });
  await third;
  events.length = 0;

  await throughTheClient();

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL clientTurnHandover (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS clientTurnHandover (${checks} checks)\n`);
};

// Through the client: the listeners it registered and `chooseFromList` read automation as `setAutomationEnabled`
//  leaves it, not as it was when they were registered.
const throughTheClient = async (): Promise<void> => {
  const registered: [string, (...args: any[]) => void][] = [],
    on = engineInstance.on.bind(engineInstance);

  (engineInstance as any).on = (
    event: string,
    listener: (...args: any[]) => void
  ) => {
    registered.push([event, listener]);

    return on(event as any, listener as any);
  };

  (playerWorldRegistryInstance as any).getByPlayer = () => ({
    getByTile: () => {
      record('playerWorld.getByTile');

      return playerTile;
    },
  });
  (currentPlayerRegistryInstance as any).entries = () => [player];
  ['tile', 'unit', 'city', 'onTiles', 'flush'].forEach((name) => {
    (PlayerPatches.prototype as any)[name] = () => record(`patches.${name}`);
  });
  (SimpleAIClient.prototype as any).chooseFromList = () => {
    record('automation.chooseFromList');

    return Promise.resolve('automation');
  };

  const client = new DataTransferClient(player, transport);

  const listenersFor = (event: string) =>
      registered
        .filter(([name]) => name === event)
        .map(([, listener]) => listener),
    [halted] = listenersFor('unit:halted'),
    [talksMoved, patchesMoved] = listenersFor('unit:moved');

  expect(
    'the client registers one unit:halted and two unit:moved listeners',
    [listenersFor('unit:halted').length, listenersFor('unit:moved').length],
    [1, 2]
  );

  const neighbour: any = {
      id: () => 'unit-2',
      player: () => ({}),
    },
    moving: any = {
      ...unit,
      tile: () => ({
        getNeighbours: () => {
          record('neighbours');

          return [];
        },
      }),
    },
    move = { from: () => tile, to: () => tile },
    choice = { value: () => 'only', id: () => 'choice-1' },
    meta: any = { choices: () => [choice], key: () => 'some.choice' };

  const observe = async (): Promise<[string[], unknown]> => {
    halted(moving, tile);
    talksMoved(moving);
    talksMoved(neighbour);
    patchesMoved(moving, move);

    const chosen = await client.chooseFromList(meta);

    return [untimed(events.splice(0)), chosen];
  };

  const byHand: [string[], unknown] = [
      [
        'playerWorld.getByTile',
        'patches.unit',
        'neighbours',
        'playerWorld.getByTile',
        'playerWorld.getByTile',
        'patches.tile',
        'patches.tile',
        'patches.unit',
        'patches.city',
        'patches.onTiles',
        'patches.flush',
      ],
      'only',
    ],
    automated: [string[], unknown] = [
      [
        'playerWorld.getByTile',
        'playerWorld.getByTile',
        'patches.tile',
        'patches.tile',
        'patches.flush',
        'automation.chooseFromList',
      ],
      'automation',
    ];

  expect('by hand', await observe(), byHand);
  client.setAutomationEnabled(true);
  expect('automated, once turned on', await observe(), automated);
  client.setAutomationEnabled(false);
  expect('by hand, once turned off', await observe(), byHand);
  (client as any).setAutomationEnabled(1);
  expect(
    'automated, turned on with a truthy value',
    await observe(),
    automated
  );
};

run().catch((error) => {
  process.stderr.write(
    `FAIL clientTurnHandover: ${error instanceof Error ? error.stack : error}\n`
  );
  process.exit(1);
});
