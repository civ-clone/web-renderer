#!/usr/bin/env node

// Runs tests/ui/cityWindow.ts — the open city screen's keys, clicks and
// updates (#484): Enter on a button, a second specialist change, the focus
// on an update and the production picker, and the turns to grow or build
// (#489). Bundled with esbuild, as the other UI tests are.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'city-window-')),
  'cityWindow.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'ui', 'cityWindow.ts')],
  bundle: true,
  keepNames: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  logLevel: 'error',
  // linkedom reaches for the optional native `canvas` package, and copes
  //  without it.
  external: ['canvas'],
});

try {
  process.stdout.write(
    execFileSync(process.execPath, [outfile], {
      cwd: webRenderer,
      encoding: 'utf8',
    })
  );
} catch (error) {
  process.stdout.write(error.stdout || '');
  process.stderr.write(error.stderr || '');
  process.exit(1);
}
