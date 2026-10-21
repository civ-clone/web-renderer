// What `DataTransferClient.dispose()` stops (#449), checked over a stub transport and the engine itself. Each check is
//  made twice, once before `dispose()`, where it must send, so that it cannot pass by sending nothing either way, and
//  once after, where it must send nothing:
//  - an engine event that queues a patch (a trade route: both cities), whose patch goes at the next flush;
//  - an engine event the player is told of (`game:retirement-warning`);
//  - the UI's `cheat` (GrantGold) and a request (`topCities`), each acted on and answered;
//  - the UI's `action` in a turn under way (the client's `handleAction` is called, and the turn ends);
//  - the UI's answer to a choice pending, which settles it (after, one pending as the client is disposed of; a choice
//    asked of a client already disposed of is its caller's to avoid).
// Then that a second `dispose()` is harmless, and that every engine listener and transport receiver the client added
//  is gone.

import Civilization from '@civ-clone/core-civilization/Civilization';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import PlayerPatches from '../../src/js/Engine/Client/PlayerPatches';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import TurnHandover from '../../src/js/Engine/Client/TurnHandover';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as yearInstance } from '@civ-clone/core-game-year/Year';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';

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
    process.stderr.write('FAIL clientDispose: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// The engine listeners the client adds, and those it takes away again.
const listening = new Set<(...args: any[]) => void>(),
  on = engine.on.bind(engine),
  off = engine.off.bind(engine);

(engine as any).on = (event: string, listener: (...args: any[]) => void) => {
  listening.add(listener);
  on(event, listener);
};
(engine as any).off = (event: string, listener: (...args: any[]) => void) => {
  listening.delete(listener);
  off(event, listener);
};

// What the UI is sent, and a stand-in for the transport's receivers, which the UI's messages are delivered to.
const sent: [string, any][] = [],
  receivers = new Map<string, Set<(...args: any[]) => void>>(),
  receive = (channel: string, handler: (...args: any[]) => void) => {
    if (!receivers.has(channel)) {
      receivers.set(channel, new Set());
    }

    receivers.get(channel)!.add(handler);

    return (): void => {
      receivers.get(channel)!.delete(handler);
    };
  },
  transport: any = {
    receive,
    receiveOnce: (channel: string, handler: (...args: any[]) => void) => {
      const dispose = receive(channel, (...args: any[]) => {
        dispose();
        handler(...args);
      });

      return dispose;
    },
    send: (channel: string, data: any): void => {
      sent.push([channel, data]);
    },
  },
  deliver = (channel: string, data: unknown): void =>
    [...(receivers.get(channel) ?? [])].forEach((handler) => handler(data)),
  receiving = (): string[] =>
    [...receivers.entries()]
      .filter(([, handlers]) => handlers.size > 0)
      .map(([channel]) => channel);

// A notification is sent as `{ hierarchy, objects }`, its key in the object the hierarchy refers to.
const keyOf = ({ hierarchy, objects }: any): string =>
  (objects[hierarchy['#ref']] ?? hierarchy).key;

// The channels sent since the last look, with the ids in each patch, and the key of each notification.
const taken = (): string[] =>
  sent
    .splice(0)
    .map(([channel, data]) =>
      channel === 'gameDataPatch'
        ? `gameDataPatch(${data
            .flatMap((patch: object) => Object.keys(patch))
            .join(',')})`
        : channel === 'gameNotification'
        ? `gameNotification(${keyOf(data)})`
        : channel
    );

const player = new Player(new RuleRegistry()),
  // Only its id, its owner and how it serialises are read.
  cityOf = (id: string): any => ({
    id: () => id,
    player: () => player,
    toPlainObject: () => ({ id }),
  }),
  home = cityOf('home'),
  city = cityOf('city'),
  granted: number[] = [],
  treasury = {
    id: () => 'treasury',
    add: (amount: number) => granted.push(amount),
    toPlainObject: () => ({ id: 'treasury' }),
  };

player.setCivilization(new Civilization());
(playerTreasuryRegistryInstance as any).getByPlayerAndType = () => treasury;
// A world with nothing seen in it, which is all the Top Cities report reads of it with no cities in the game.
(playerWorldRegistryInstance as any).getByPlayer = () => ({
  getByTile: () => null,
});

// The initial data is the player's whole state, which needs a game, and the year a game's rules; the hand-over's own
//  patch is all this needs.
(TurnHandover.prototype as any).sendInitialData = function (): void {};
(yearInstance as any).toPlainObject = () => ({ id: yearInstance.id() });
// What the player's research and treasury were before an action, which needs a game too: each action here ends the
//  turn, which sends the patch whatever they were.
(PlayerPatches.prototype as any).playerState = () => null;

const client = new DataTransferClient(player, transport),
  handled: unknown[] = [];

// As the client's action listener calls it, live: each action ends the turn.
client.handleAction = (action: unknown): Promise<boolean> => {
  handled.push(action);

  return Promise.resolve(true);
};

const added = listening.size,
  receivedOn = receiving();

const meta = (): any => {
  const choices = ['a', 'b'].map((id) => ({ id: () => id, value: () => id }));

  return {
    choices: () => choices,
    key: () => 'some.choice',
    id: () => 'meta',
    toPlainObject: () => ({ key: 'some.choice' }),
  };
};

const settled = (promise: Promise<unknown>): Promise<unknown> =>
  Promise.race([promise, wait(20).then(() => 'unsettled')]);

// Each thing the client listens for, done, and what the UI was sent for it, with what else it did.
const observe = async (): Promise<{ [check: string]: unknown }> => {
  const results: { [check: string]: unknown } = {};

  engine.emit('unit:trade-route-established', player, home, city, 'Wine', 10);
  client.flush();
  results['a trade route, then a flush'] = taken();

  engine.emit('game:retirement-warning');
  results['the retirement warning'] = taken();

  // A cheat sends its patch itself.
  deliver('cheat', { name: 'GrantGold', value: { amount: 10 } });
  results['GrantGold'] = [taken(), granted.splice(0)];

  deliver('topCities', null);
  results['topCities'] = taken();

  // A turn under way: the hand-over is a ms later, then each action is acted on.
  const turn = client.takeTurn();

  await wait(20);
  taken();
  deliver('action', { name: 'EndTurn' });
  results['an action in the turn under way'] = [
    handled.splice(0),
    await settled(turn),
  ];
  taken();

  return results;
};

// A choice sent to the UI, and what it settles as once the UI answers.
const choose = async (): Promise<[string[], unknown]> => {
  const choice = client.chooseFromList(meta()),
    asked = taken();

  deliver('chooseFromList', 'b');

  return [asked, await settled(choice)];
};

const run = async (): Promise<void> => {
  expect('before dispose(): it sends', await observe(), {
    'a trade route, then a flush': [
      'gameNotification(Unit.trade-route-established)',
      'gameDataPatch(home,city)',
    ],
    'the retirement warning': ['gameNotification(Game.retirement-warning)'],
    GrantGold: [['gameDataPatch(treasury)'], [10]],
    topCities: ['topCities'],
    'an action in the turn under way': [[{ name: 'EndTurn' }], undefined],
  });
  expect('before dispose(): a choice is answered', await choose(), [
    ['chooseFromList'],
    'b',
  ]);

  expect(
    'before dispose(): it listens on the engine and receives on the transport',
    [added > 0, receivedOn],
    [
      true,
      [
        'action',
        'cheat',
        'cheatUnitTypes',
        'cheatAdvances',
        'cheatPlayers',
        'topCities',
        'civilizationScore',
        'cityBuildAvailable',
        'unitActions',
        'intelligence',
        'retire',
        'gameContinue',
      ],
    ]
  );

  // A turn and a choice under way when it is disposed of.
  const turn = client.takeTurn();

  await wait(20);
  taken();

  const choice = client.chooseFromList(meta());

  taken();

  client.dispose();

  expect(
    'after dispose(): nothing is listened for',
    [listening.size, receiving()],
    [0, []]
  );

  deliver('action', { name: 'EndTurn' });
  expect(
    'after dispose(): the turn under way is not acted on',
    [handled.splice(0), await settled(turn)],
    [[], 'unsettled']
  );

  deliver('chooseFromList', 'b');
  expect(
    'after dispose(): the pending choice is not answered',
    await settled(choice),
    'unsettled'
  );

  const { ['an action in the turn under way']: action, ...rest } =
    await observe();

  expect('after dispose(): it sends nothing, but for an empty flush', rest, {
    'a trade route, then a flush': ['gameDataPatch()'],
    'the retirement warning': [],
    GrantGold: [[], []],
    topCities: [],
  });
  expect('after dispose(): a new turn is not acted on either', action, [
    [],
    'unsettled',
  ]);

  client.dispose();
  expect(
    'a second dispose() is harmless',
    [listening.size, receiving(), taken()],
    [0, [], []]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL clientDispose (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(
    `PASS clientDispose (${checks} checks: ${added} engine listeners and ${receivedOn.length} receivers, all gone after dispose())\n`
  );
};

run().catch((error) => {
  process.stderr.write(
    `FAIL clientDispose: ${error instanceof Error ? error.stack : error}\n`
  );
  process.exit(1);
});
