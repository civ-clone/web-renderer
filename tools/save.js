#!/usr/bin/env node

// Runs tests/engine/save.ts — the Stage 4 acceptance check from
// docs/engine-serialisation/05-engine-plan.md: "the generic-save spike
// works". Bundled with esbuild for the same reason the conformance suite is:
// so it resolves each package's `.ts` rather than its compiled `.js`.
//
// Once per seed (see lib/seeds.js). Each game takes under a second.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { envForSeed, seedsToRun } = require('./lib/seeds');
const { webRenderer } = require('./lib/paths');

const SEEDS = [1, 2, 3, 4, 5, 6];

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'save-')),
  'save.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'save.ts')],
  bundle: true,
  keepNames: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  logLevel: 'error',
});

const seeds = seedsToRun(SEEDS);

const failed = seeds.filter((seed) => {
  if (seeds.length > 1) {
    process.stdout.write(`seed ${seed}\n`);
  }

  try {
    process.stdout.write(
      execFileSync(process.execPath, [outfile], {
        cwd: webRenderer,
        encoding: 'utf8',
        env: envForSeed(seed),
      })
    );

    return false;
  } catch (error) {
    process.stdout.write(error.stdout || '');
    process.stderr.write(error.stderr || '');

    return true;
  }
});

if (seeds.length > 1) {
  process.stdout.write(
    `\n${seeds.length - failed.length}/${seeds.length} seeds — save and load` +
      (failed.length ? ` (failed: ${failed.join(', ')})` : '') +
      '\n'
  );
}

process.exit(failed.length > 0 ? 1 : 0);
