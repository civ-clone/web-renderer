#!/usr/bin/env node

// Type-checks tests/ (tsconfig.tests.json), which esbuild bundles without
// checking (#339). Fails on any error in a file under tests/.
//
// The tests import UI modules that `tsconfig.json` doesn't reach yet, so tsc
// reports those modules' own errors too. They're the rest of #339, which
// widens `tsconfig.json` as they're fixed; until then they're counted here,
// not failed on, so a test's types are checked today.

const { spawnSync } = require('child_process');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const { status, stdout, stderr } = spawnSync(
  process.execPath,
  [
    require.resolve('typescript/bin/tsc', { paths: [webRenderer] }),
    '-p',
    path.join(webRenderer, 'tsconfig.tests.json'),
  ],
  { cwd: webRenderer, encoding: 'utf8' }
);

const diagnostics = stdout
    .split('\n')
    .filter((line) => /^[^\s].*\(\d+,\d+\): error TS\d+/.test(line)),
  inTests = diagnostics.filter((line) => line.startsWith('tests/')),
  elsewhere = diagnostics.filter((line) => !line.startsWith('tests/'));

if (status !== 0 && diagnostics.length === 0) {
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  console.error('FAIL typecheck-tests: tsc failed without a diagnostic');

  process.exit(1);
}

if (inTests.length > 0) {
  process.stdout.write(stdout);
  console.error(`FAIL typecheck-tests: ${inTests.length} error(s) in tests/`);

  process.exit(1);
}

console.log(
  `PASS typecheck-tests (no errors in tests/${
    elsewhere.length > 0
      ? `; ${elsewhere.length} in the src/ modules they import, left to #339`
      : ''
  })`
);
