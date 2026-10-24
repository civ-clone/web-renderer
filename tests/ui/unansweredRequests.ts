// A request the worker could not answer, on the page (#580): the player has been told in a window already (#470), so a
//  caller ends its chain with `unlessRequestFailed`, which drops that failure and lets anything else through to the
//  console. A report whose request isn't answered closes rather than staying open and empty, and leaves no unhandled
//  rejection; one whose request fails some other way closes too, and the error still reaches the console.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { RequestFailed } from '../../src/js/Engine/AbstractTransport';
import TopCitiesReport from '../../src/js/UI/components/TopCitiesReport';
import Transport from '../../src/js/UI/Transport';
import i18next from 'i18next';
import unlessRequestFailed from '../../src/js/UI/lib/unlessRequestFailed';

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
    process.stderr.write(
      'FAIL unansweredRequests: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

const unhandled: string[] = [];

process.on('unhandledRejection', (reason: unknown): void => {
  unhandled.push(reason instanceof Error ? reason.message : String(reason));
});

// What a request rejects with, for each report opened.
const failingWith = (error: Error): Transport =>
    ({
      request: () => Promise.reject(error),
    } as unknown as Transport),
  settle = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, 10)),
  reports = (): number =>
    document.querySelectorAll('dialog.top-cities-report').length;

(async () => {
  await i18next.init({ lng: 'en', resources: { en: { translation: {} } } });

  const thrown = (error: Error): string | null => {
    try {
      unlessRequestFailed(error);
    } catch (caught) {
      return (caught as Error).message;
    }

    return null;
  };

  expect(
    'a request the worker could not answer stops there',
    thrown(new RequestFailed('topCities', 'no answer')),
    null
  );
  expect('anything else goes on', thrown(new TypeError('a bug')), 'a bug');

  new TopCitiesReport(failingWith(new RequestFailed('topCities', 'no answer')));

  await settle();

  expect(
    'a report the worker could not answer closes, with nothing unhandled',
    [reports(), unhandled],
    [0, []]
  );

  new TopCitiesReport(failingWith(new TypeError('a bug')));

  await settle();

  expect(
    'one that fails some other way closes too, and the error reaches the console',
    [reports(), unhandled],
    [0, ['a bug']]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL unansweredRequests (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS unansweredRequests (${checks} checks)\n`);
})().catch((error) => {
  process.stderr.write(`FAIL unansweredRequests: ${error?.stack ?? error}\n`);
  process.exit(1);
});
