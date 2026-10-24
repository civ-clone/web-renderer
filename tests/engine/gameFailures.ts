// What the worker's `Game` says when it can't do what the page asked (#470), over a stub transport: a save that can't
//  be loaded (one that needs a plugin that isn't there) is answered on `loadFailed`, not as a passing `notification`,
//  so the page can say so and go back to its menu, and one that can't be built on `saveFailed` (#581). And a game that was never started, as a loaded one isn't, still
//  sends a sign of life as each player's turn starts, which the page counts as the worker answering (#470).

import Game from '../../src/js/Engine/Game';
import { instance as engine } from '@civ-clone/core-engine/Engine';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL gameFailures: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const receivers = new Map<string, (data: any) => void>(),
  sent: [string, any][] = [],
  transport: any = {
    receive: (channel: string, handler: (data: any) => void) => {
      receivers.set(channel, handler);

      return () => receivers.delete(channel);
    },
    receiveOnce: () => () => {},
    send: (channel: string, data: any) => sent.push([channel, data]),
  },
  until = async (channel: string): Promise<any> => {
    for (let i = 0; i < 500; i++) {
      const found = sent.find(([name]) => name === channel);

      if (found) {
        return found[1];
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return null;
  };

// What `Game` binds to each player's turn start as it is made, which a loaded game, never `start`ed, has as well.
//  The engine's own listeners from the plugins are left out: there is no game here for them to play.
const turnStart: ((...args: any[]) => void)[] = [],
  on = engine.on;

engine.on = ((event: string, handler: (...args: any[]) => void): void => {
  if (event === 'player:turn-start') {
    turnStart.push(handler);
  }

  on.call(engine, event as any, handler);
}) as typeof engine.on;

new Game(transport);

engine.on = on;

(async () => {
  const logged = console.error;

  console.error = () => {};

  receivers.get('load')!({
    data: JSON.stringify({
      format: 2,
      entities: [],
      meta: { name: 'needs a plugin', createdAt: 0, turn: 1 },
      engine: { plugins: { '@civ-clone/no-such-plugin': '1.0.0' } },
    }),
  });

  const failed = await until('loadFailed');

  console.error = logged;

  expect(
    'a save that needs a plugin that is not there is answered on loadFailed, naming it',
    typeof failed?.message === 'string' &&
      failed.message.includes('@civ-clone/no-such-plugin'),
    true
  );
  expect(
    'and not only as a passing notification',
    sent
      .filter(([channel]) => channel === 'notification')
      .some(([, text]) => String(text).includes('could not load')),
    false
  );

  // A file that isn't JSON at all fails the same way, rather than as an error nothing hears.
  sent.splice(0);
  receivers.get('load')!({ data: 'not a save' });

  expect(
    'a save that is not JSON is answered on loadFailed too',
    sent.filter(([channel]) => channel === 'loadFailed').length,
    1
  );

  // A save that can't be built is answered on `saveFailed`, for the page to say as it does one it can't write, and
  //  not as a passing notification (#581). Made to fail where the file is written out.
  sent.splice(0);

  const stringify = JSON.stringify;

  JSON.stringify = (() => {
    throw new Error('too big');
  }) as typeof JSON.stringify;

  try {
    receivers.get('save')!({ name: 'a save' });
  } finally {
    JSON.stringify = stringify;
  }

  expect(
    "a save that can't be built is answered on saveFailed, with why, and nothing else",
    sent,
    [['saveFailed', { message: 'too big' }]]
  );

  // A loaded game is never `start`ed, so `bindEvents` never runs for it: the sign of life is bound without it.
  sent.splice(0);
  [1, 2].forEach(() => turnStart.forEach((handler) => handler(null)));

  expect(
    'a game that was not started sends a sign of life as each player turn starts',
    sent.filter(([channel]) => channel === 'alive'),
    [
      ['alive', null],
      ['alive', null],
    ]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL gameFailures (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS gameFailures (${checks} checks)\n`);
  process.exit(0);
})().catch((error) => {
  process.stderr.write(`FAIL gameFailures: ${error?.stack ?? error}\n`);
  process.exit(1);
});
