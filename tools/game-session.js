#!/usr/bin/env node

// Runs tests/ui/gameSession.ts — one game's start (#344): every game receiver
// registered before `start` returns, a patch straight after `gameData`,
// `turnStarted`'s render at once, the welcome, and the `pagehide` teardown.
// Bundled with esbuild, as the other UI tests are.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'game-session-')),
  'gameSession.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'ui', 'gameSession.ts')],
  bundle: true,
  keepNames: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  logLevel: 'error',
  // The menu's and the actions' icons, as the game's own build loads them.
  loader: {
    '.png': 'dataurl',
    '.svg': 'dataurl',
  },
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
