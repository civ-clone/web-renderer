// The Civilopedia of a Civilization II game (#1196): with the civ2 plugin set loaded as the worker loads it, every city
//  improvement and Wonder says what it does, bar those whose requirement entries say it, and every effect, scope and
//  class without an entry it sends has wording in en.

// Must stay first: seeds `Math.random` before any engine module evaluates.
import './lib/seed';
// The worker client a civ2 game runs in, as `civ2Isolation` loads it.
import '@civ-clone/ui-worker-client/Game';
import civilopediaData from '@civ-clone/ui-worker-client/lib/civilopedia';
import missingWording from './lib/effectWording';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';

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
    process.stderr.write('FAIL civ2-civilopedia: stopped before its checks\n');
    process.exitCode = 1;
  }
});

const check = (): void => {
  const entries = civilopediaData(),
    silent = (kind: string): string[] =>
      entries
        .filter((entry) => entry.kind === kind && entry.effects.length === 0)
        .map((entry) => entry.key)
        .sort();

  expect(
    'a Civilization II game has its improvements and Wonders',
    [
      entries.filter((entry) => entry.kind === 'improvement').length > 30,
      entries.filter((entry) => entry.kind === 'wonder').length,
    ],
    [true, 28]
  );
  expect(
    'every city improvement says something it does',
    silent('improvement'),
    []
  );
  expect(
    'every Wonder says something it does, bar those whose requirements say it',
    silent('wonder'),
    []
  );
  expect(
    'every effect, scope and class without an entry sent has wording in en',
    missingWording(entries),
    { effects: [], scopes: [], classes: [] }
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL civ2-civilopedia (${
        failures.length
      } of ${checks})\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civ2-civilopedia (${checks} checks)\n`);
};

const civ2 = pluginsFrom(pluginSets).sets.find(({ id }) => id === 'civ2');

if (!civ2) {
  process.stderr.write('FAIL civ2-civilopedia: no civ2 plugin set\n');
  process.exit(1);
}

civ2!
  .load()
  .then(check)
  .catch((error: any): void => {
    process.stderr.write(`FAIL civ2-civilopedia: ${error?.stack ?? error}\n`);
    process.exit(1);
  });
