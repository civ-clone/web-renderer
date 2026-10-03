// When a selection list is chosen for the player instead of being shown: it
// has exactly one option, and the caller hasn't opted out (#148).

import singleChoice from '../../src/js/UI/lib/singleChoice';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (actual !== expected) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const option = (value: unknown) => ({ label: String(value), value }),
  futureTechnology = option('FutureTechnology'),
  zero = option(0),
  empty = option('');

expect(
  'a list with one option is chosen for the player',
  singleChoice([futureTechnology]),
  futureTechnology
);

expect(
  'a list with several options is shown',
  singleChoice([option('Monarchy'), option('Despotism')]),
  null
);

expect('a list with no options is shown', singleChoice([]), null);

expect(
  'a caller that opts out has its one option shown',
  singleChoice([futureTechnology], false),
  null
);

expect(
  'opting out changes nothing for a list with several options',
  singleChoice([option('Monarchy'), option('Despotism')], false),
  null
);

expect(
  'an option whose value is 0 still counts as the one option',
  singleChoice([zero]),
  zero
);

expect(
  'an option whose value is an empty string still counts as the one option',
  singleChoice([empty]),
  empty
);

if (failures.length) {
  process.stderr.write(
    `FAIL singleChoice\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS singleChoice (${checks} checks)`);
