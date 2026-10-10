// The difficulty levels New Game offers (#173): labelled easiest to toughest, starting on the level the player chose
// last in this browser, or Prince, and falling back to Prince when storage can't be used.

import {
  DifficultyStorage,
  difficultyLabels,
  preselectedDifficulty,
  rememberDifficulty,
} from '../../src/js/UI/lib/difficulty';
import i18next from 'i18next';

const failures: string[] = [];
let checks = 0;

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

const levels = [
    { name: 'King', level: 3 },
    { name: 'Chieftain', level: 0 },
    { name: 'Prince', level: 2 },
    { name: 'Emperor', level: 4 },
    { name: 'Warlord', level: 1 },
  ],
  memoryStorage = (): {
    items: { [key: string]: string };
    storage: DifficultyStorage;
  } => {
    const items: { [key: string]: string } = {};

    return {
      items,
      storage: {
        getItem: (key: string) => items[key] ?? null,
        setItem: (key: string, value: string) => {
          items[key] = value;
        },
      },
    };
  },
  blocked: DifficultyStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
  };

(async () => {
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('../../translations/local/en');
  await import('../../translations/civ1-difficulty/en');

  expect(
    'the levels, easiest first, with the easiest and toughest marked',
    difficultyLabels(levels).map(({ label }) => label),
    ['Chieftain (easiest)', 'Warlord', 'Prince', 'King', 'Emperor (toughest)']
  );

  expect(
    'each is chosen by its class name',
    difficultyLabels(levels).map(({ value }) => value),
    ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor']
  );

  const { items, storage } = memoryStorage();

  expect(
    'Prince is preselected when nothing was chosen before',
    preselectedDifficulty(levels, () => storage),
    'Prince'
  );

  rememberDifficulty('Emperor', () => storage);

  expect('the choice is kept', items['civ.difficulty'], 'Emperor');

  expect(
    'the last choice is preselected',
    preselectedDifficulty(levels, () => storage),
    'Emperor'
  );

  rememberDifficulty('Deity', () => storage);

  expect(
    'a stored level the rules no longer offer is ignored',
    preselectedDifficulty(levels, () => storage),
    'Prince'
  );

  expect(
    'blocked storage means Prince',
    preselectedDifficulty(levels, () => blocked),
    'Prince'
  );

  expect(
    'no storage means Prince',
    preselectedDifficulty(levels, () => null),
    'Prince'
  );

  let threw = false;

  try {
    rememberDifficulty('King', () => blocked);
  } catch {
    threw = true;
  }

  expect('remembering into blocked storage does not throw', threw, false);

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL difficulty (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS difficulty (${checks} checks)\n`);
})();
