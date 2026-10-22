#!/usr/bin/env node

// The suite runner fails a suite that never finishes its checks (#473).
//
// `tests/engine/respawn.ts` is bundled against an empty `plugins.ts`: with no
// rules the game never reaches the human's turn, the suite's checks never
// start, and the process exits 0 having printed nothing — which the runners
// used to report as a pass. `runOnce` must report it as a failure, and a
// suite that never exits at all as a timeout.

const fs = require('fs');
const path = require('path');

const { bundle, runOnce } = require('./lib/suite');
const { parseArguments } = require('./run-suite');

const failures = [];

const expect = (description, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${description}: expected ${expected}, got ${actual}`);
  }
};

// What the runner writes, kept from cluttering the self-test's own output.
const quietly = (run) => {
  const stdout = process.stdout.write,
    stderr = process.stderr.write,
    written = [];

  process.stdout.write = process.stderr.write = (chunk) => {
    written.push(String(chunk));

    return true;
  };

  try {
    return [run(), written.join('')];
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
};

// The command line: a suite's own arguments reach it, before `--` or after,
//  and `--seeds` without seeds is an error rather than a crash.
const parsed = (...argv) => JSON.stringify(parseArguments(argv));

expect(
  'an argument the runner does not know goes to the suite',
  parsed('engine', 'clientTranscript', '--update'),
  JSON.stringify({
    kind: 'engine',
    name: 'clientTranscript',
    seeds: null,
    args: ['--update'],
  })
);
expect(
  'and so does one after --',
  parsed('engine', 'clientTranscript', '--', '--update'),
  JSON.stringify({
    kind: 'engine',
    name: 'clientTranscript',
    seeds: null,
    args: ['--update'],
  })
);
expect(
  '--seeds takes its list',
  parsed('engine', 'save', '--seeds', '1,2', '--verbose'),
  JSON.stringify({
    kind: 'engine',
    name: 'save',
    seeds: [1, 2],
    args: ['--verbose'],
  })
);
[['--seeds'], ['--seeds', '--update'], ['--seeds', '1,,2']].forEach((tail) =>
  expect(
    `${tail.join(' ')} is an error, not a crash`,
    'error' in parseArguments(['engine', 'save', ...tail]),
    true
  )
);
expect(
  'a run with no suite named is an error',
  'error' in parseArguments(['engine']),
  true
);

(async () => {
  const empty = await bundle('engine', 'respawn', {
    esbuild: {
      plugins: [
        {
          name: 'empty-plugins',
          setup(build) {
            build.onResolve({ filter: /\/src\/js\/plugins$/ }, () => ({
              path: 'plugins',
              namespace: 'empty-plugins',
            }));
            build.onLoad({ filter: /.*/, namespace: 'empty-plugins' }, () => ({
              contents: 'export const plugins = {};',
              loader: 'ts',
            }));
          },
        },
      ],
    },
  });

  const hang = await bundle('engine', 'hang', {
    entryPoint: path.join(__dirname, 'lib', 'hang.js'),
  });

  try {
    const [silent, silentOutput] = quietly(() =>
      runOnce(empty.outfile, { timeout: 120 * 1000 })
    );

    expect('a suite that exits 0 without PASS passes', silent, false);
    expect(
      'and the failure says why',
      /without printing PASS/.test(silentOutput),
      true
    );

    const [hung, hungOutput] = quietly(() =>
      runOnce(hang.outfile, { timeout: 1000 })
    );

    expect('a suite that never exits passes', hung, false);
    expect('and the failure says why', /timed out/.test(hungOutput), true);
  } finally {
    [empty, hang].forEach(({ directory }) =>
      fs.rmSync(directory, { recursive: true, force: true })
    );
  }

  if (failures.length > 0) {
    console.error(`FAIL run-suite\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(
    'PASS run-suite (its arguments reach the suite; a suite with no plugins, which exits 0 silently, fails; so does one that hangs)'
  );
})().catch((error) => {
  console.error(error);

  process.exit(1);
});
