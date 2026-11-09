#!/usr/bin/env node

// Type-checks tests/ (tsconfig.tests.json), which esbuild bundles without
// checking (#339). Fails on any error, in a test or in a module one imports.

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
  .filter((line) => /^[^\s].*\(\d+,\d+\): error TS\d+/.test(line));

if (status !== 0 && diagnostics.length === 0) {
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  console.error('FAIL typecheck-tests: tsc failed without a diagnostic');

  process.exit(1);
}

if (diagnostics.length > 0) {
  process.stdout.write(stdout);
  console.error(`FAIL typecheck-tests: ${diagnostics.length} error(s)`);

  process.exit(1);
}

console.log('PASS typecheck-tests');
