#!/usr/bin/env node

// `npm test`'s own runner (tools/test-all.js, #879): what it chooses to run, and that one failing script fails the
// run and is named. It is run by the runner it tests, so it asks only for lists and for two quick scripts.

const { spawnSync } = require('child_process');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const scripts = require(path.join(webRenderer, 'package.json')).scripts,
  failures = [];
let checks = 0;

const expect = (description, actual, expected) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const runner = (args, env = {}) =>
    spawnSync(
      process.execPath,
      [path.join(__dirname, 'test-all.js'), ...args],
      {
        cwd: webRenderer,
        encoding: 'utf8',
        env: { ...process.env, ...env },
      }
    ),
  list = (...args) =>
    runner(['--list', ...args])
      .stdout.split('\n')
      .filter(Boolean);

const everything = list(),
  tests = Object.keys(scripts).filter((name) => name.startsWith('test:'));

expect(
  'everything is both type-checks and every `test:*` script, but the ones that rewrite a fixture and the browser check',
  [...everything].sort(),
  [
    'ts:compile',
    'ts:compile:tests',
    ...tests.filter(
      (name) => !name.endsWith(':update') && name !== 'test:browser'
    ),
  ].sort()
);
expect(
  'the type-checks and the longest suites start first',
  everything.slice(0, 3),
  ['ts:compile', 'ts:compile:tests', 'test:overlap-draw:1of4']
);
expect('nothing is run twice', new Set(everything).size, everything.length);

const named = list('window-chrome', 'join');

expect(
  'named: the scripts with any of the words in their name, and no type-check',
  [
    named.includes('test:window-chrome'),
    named.includes('test:join-city'),
    named.every((name) => /window-chrome|join/.test(name)),
  ],
  [true, true, true]
);

// Asked of three scripts by name, so that only those are bundled to see what they import.
const reached = list(
  '--for',
  'packages/component-progress-bar',
  'progress-bar',
  'changelog',
  'join-city'
);

expect(
  '--for: a suite that imports the path, the checks that aren’t suites, and not a suite that never reaches it',
  [
    reached.includes('test:progress-bar'),
    reached.includes('test:changelog'),
    reached.includes('test:join-city'),
    reached.includes('ts:compile'),
  ],
  [true, true, false, false]
);

// The same of two ui suites, which are bundled with more than the engine's are: one reaches the file, and one, which
//  loads no interface, doesn't. (Most ui suites load them all, and so reach most of the interface.)
const reachedMap = list(
  '--for',
  'packages/map/lib/reducedMotion.ts',
  'map-view',
  'data-changes'
);

expect(
  '--for a file: the ui suite that imports it, and not the one that doesn’t',
  [
    reachedMap.includes('test:map-view'),
    reachedMap.includes('test:data-changes'),
  ],
  [true, false]
);

expect(
  '--for the whole checkout is every suite asked of',
  list('--for', '.', 'map-view', 'progress-bar', 'join-city').sort(),
  ['test:join-city', 'test:map-view', 'test:progress-bar']
);

expect(
  'an option it doesn’t know is refused',
  runner(['--parallel']).status,
  2
);

// Two quick scripts, one of them made to fail: a suite given no time at all.
const mixed = runner(['--jobs', '2', 'world-sizes', 'button-variants'], {
  SUITE_TIMEOUT_MS: '1',
});

expect(
  'one script failing fails the run, names it, and leaves the other passed',
  [
    mixed.status,
    /^FAIL 1 of 2 in .*: test:world-sizes$/m.test(mixed.stdout),
    /^> test:button-variants \([\d.]+s\)$/m.test(mixed.stdout),
  ],
  [1, true, true]
);

const passing = runner(['--jobs', '1', 'button-variants']);

expect(
  'all passing: exit 0, and a line saying so',
  [passing.status, /^PASS 1 of 1 in /m.test(passing.stdout)],
  [0, true]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL test-all (${failures.length} of ${checks} checks)\n  ${failures.join(
      '\n  '
    )}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS test-all (${checks} checks)\n`);
