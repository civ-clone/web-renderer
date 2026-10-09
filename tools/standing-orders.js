#!/usr/bin/env node

// Runs tests/engine/standingOrders.ts — Explore and Automate carry on
// by themselves, turn after turn (#198, #200). Bundled with esbuild so each
// package's `.ts` is resolved rather than its compiled `.js`.
//
// Twice, in two processes, as `load.js` does: one plays and saves part way
// through the orders, the other loads that save and plays on.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'standing-orders-'));
const outfile = path.join(directory, 'standingOrders.js');
const saveFile = path.join(directory, 'game.json');

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'standingOrders.ts')],
  bundle: true,
  keepNames: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  logLevel: 'error',
});

const run = (mode) => {
  try {
    process.stdout.write(
      execFileSync(process.execPath, [outfile, `--${mode}`, saveFile], {
        cwd: webRenderer,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
    );
  } catch (error) {
    process.stdout.write(error.stdout || '');
    process.stderr.write(error.stderr || '');
    process.exit(1);
  }
};

run('save');
run('load');
