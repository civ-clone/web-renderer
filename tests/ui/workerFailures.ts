// What went wrong in the worker, said to the player (#470): `workerError` opens a window that says so, with the
//  worker's message as text (it can hold text from a save file), or that the game has stopped answering, and
//  `loadFailed` says so and goes back to the main menu, by reloading the page, and `saveFailed` says so and the game
//  goes on (#581). A request the worker could not answer reaches it as a `workerError` from `WorkerTransport`
//  (tests/engine/requestIds.ts).

// Must stay first: the components read `document` as they load.
import './lib/dom';

import i18next from 'i18next';
import Transport from '../../src/js/UI/Transport';
import WorkerFailures from '../../src/js/UI/app/WorkerFailures';
import WorkerTransport from '../../src/js/Engine/WorkerTransport';

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
    process.stderr.write(
      'FAIL workerFailures: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

const receivers = new Map<string, (data: any) => void>(),
  disposed: string[] = [],
  transport = {
    receive: (channel: string, handler: (data: any) => void) => {
      receivers.set(channel, handler);

      return () => disposed.push(channel);
    },
  } as unknown as Transport,
  deliver = (channel: string, data: unknown): void =>
    receivers.get(channel)!(data),
  windows = (): string[] =>
    Array.from(document.querySelectorAll('.notificationWindow')).map((window) =>
      (window as HTMLElement).textContent!.replace(/\s+/g, ' ')
    ),
  closeAll = (): void =>
    document
      .querySelectorAll('.notificationWindow')
      .forEach((window) => window.remove());

const run = async (): Promise<void> => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          SavedGame: {
            'could-not-load': 'Not loaded: {{error}}',
            'could-not-write': 'Not saved: {{error}}',
          },
          WorkerFailure: {
            body: 'Something went wrong.',
            'not-answering': 'The game has stopped answering.',
            title: 'Oops',
          },
        },
      },
    },
  });

  const alerts: string[] = [];
  let reloads = 0;

  const dispose = WorkerFailures.listen(transport, {
    alert: (message) => alerts.push(message),
    reload: () => reloads++,
  });

  expect(
    'it listens for errors, failed loads and failed saves, and not for failed requests, which come as errors',
    Array.from(receivers.keys()),
    ['workerError', 'loadFailed', 'saveFailed']
  );

  deliver('workerError', { message: '<img src=x> broke' });

  expect(
    'an error opens a window saying so, with the message',
    windows().map((text) =>
      ['Oops', 'Something went wrong.', '<img src=x> broke'].every((part) =>
        text.includes(part)
      )
    ),
    [true]
  );
  expect(
    'the message is text, not markup',
    document.querySelectorAll('.notificationWindow img').length,
    0
  );

  closeAll();
  deliver('workerError', { message: '' });

  expect(
    'an error with no message says so all the same',
    windows().map((text) => text.includes('Something went wrong.')),
    [true]
  );

  closeAll();
  deliver('workerError', { message: '', notAnswering: true });

  expect(
    'a game that has stopped answering says so in its own words',
    windows().map(
      (text) =>
        text.includes('The game has stopped answering.') &&
        !text.includes('Something went wrong.')
    ),
    [true]
  );

  closeAll();
  deliver('loadFailed', { message: "needs <plugin> 'x'" });

  expect(
    'a failed load is said, unescaped, and the page goes back to the menu',
    [alerts, reloads],
    [["Not loaded: needs <plugin> 'x'"], 1]
  );

  alerts.splice(0);
  deliver('saveFailed', { message: "can't <copy> 'x'" });

  expect(
    "a save the worker can't build is said as one the page can't write, unescaped, and the game goes on (#581)",
    [alerts, reloads, windows()],
    [["Not saved: can't <copy> 'x'"], 1, []]
  );

  // The page's side of the `Worker`: an error it raises, or a message it can't read, reaches the `workerError`
  //  listeners, as one the worker sent would.
  //  A stand-in for one: linkedom's events aren't node's, and node's `EventTarget` won't take them.
  const listeners: { [type: string]: ((event: any) => void)[] } = {},
    worker = {
      addEventListener: (type: string, listener: (event: any) => void) =>
        (listeners[type] ??= []).push(listener),
      removeEventListener: () => {},
      dispatchEvent: (event: any): boolean => {
        (listeners[event.type] ?? []).forEach((listener) => listener(event));

        return true;
      },
      postMessage: () => {},
    },
    heard: unknown[] = [];

  new WorkerTransport(worker as unknown as Worker).receive(
    'workerError',
    (data) => heard.push(data)
  );

  worker.dispatchEvent({
    type: 'error',
    message: 'Uncaught TypeError: it broke',
  });
  worker.dispatchEvent({ type: 'messageerror' });

  expect("the Worker's own errors reach the workerError listeners", heard, [
    { message: 'Uncaught TypeError: it broke' },
    { message: '' },
  ]);

  dispose();

  expect('every receiver is disposed of', disposed, [
    'workerError',
    'loadFailed',
    'saveFailed',
  ]);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL workerFailures (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS workerFailures (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL workerFailures: ${error?.stack ?? error}\n`);
  process.exit(1);
});
