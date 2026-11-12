// A game whose rules are handed in to load lazily (#825): `Game` loads them when the page asks it to start, before it
//  checks the seats, so a seat that names a civilization the rules register is filled, not refused. The plugins aren't
//  imported until `load` is called: nothing else here imports them, so no civilization is registered before then.
//  (civ.one's own worker entry imports them statically, which these checks don't need.)

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import Game from '@civ-clone/ui-worker-client/Game';
import Player from '@civ-clone/core-player/Player';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';

const receivers = new Map<string, (data: any) => void>(),
  workerErrors: any[] = [],
  civilizationsBeforeLoad = defaultGame.civilizations.entries().length;
let loads = 0,
  players: string[] = [];

const transport: any = {
  receive: (channel: string, handler: (data: any) => void) => {
    receivers.set(channel, handler);

    return () => receivers.delete(channel);
  },
  receiveOnce: () => () => {},
  reply: () => {},
  request: () => new Promise(() => {}),
  send: (channel: string, data: any) => {
    if (channel === 'workerError') {
      workerErrors.push(data);
    }
  },
};

new Game(transport, {
  sets: [
    {
      id: 'lazy',
      manifest: {},
      load: () => {
        loads++;

        return import('../../src/js/plugins');
      },
    },
  ],
  default: 'lazy',
  withoutOne: 'lazy',
});

engine.on('game:start', (): void => {
  players = playerRegistryInstance
    .entries()
    .map(
      (player: Player) =>
        (player.civilization() as any)?.sourceClass?.()?.name ?? ''
    );
});

console.error = () => {};

receivers.get('setOption')!({ name: 'automateLocalPlayer', value: true });

Object.entries({
  width: 40,
  height: 30,
  difficulty: 'Chieftain',
  seats: [
    { kind: 'human', civilization: 'Babylonian' },
    { kind: 'computer', civilization: 'Roman' },
  ],
}).forEach(([name, value]) => receivers.get('setOption')!({ name, value }));

receivers.get('start')!(null);

const until = async (done: () => boolean): Promise<boolean> => {
  for (let i = 0; i < 1000; i++) {
    if (done()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return false;
};

until(() => players.length > 0 || workerErrors.length > 0).then(() => {
  const failures: string[] = [],
    expect = (description: string, actual: unknown, expected: unknown) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures.push(
          `${description}\n    expected: ${JSON.stringify(
            expected
          )}\n    actual:   ${JSON.stringify(actual)}`
        );
      }
    };

  expect(
    'no civilization is registered before the rules load',
    civilizationsBeforeLoad,
    0
  );
  expect('the start loads the rules', loads > 0, true);
  expect(
    'and fills the seats it names, rather than refusing them',
    workerErrors,
    []
  );
  expect(
    'the players are the civilizations the seats chose',
    [...players].sort(),
    ['Babylonian', 'Roman']
  );

  if (failures.length > 0) {
    process.stderr.write(`FAIL lazyPlugins\n${failures.join('\n')}\n`);
    process.exit(1);
  }

  process.stdout.write('PASS lazyPlugins (4 checks)\n');
  process.exit(0);
});
