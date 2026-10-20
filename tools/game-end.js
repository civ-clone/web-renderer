#!/usr/bin/env node

// Runs tests/engine/gameEnd.ts once for each ending it plays — retiring, and your civilization destroyed (#176).
// Bundled with esbuild so each package's `.ts` is resolved rather than its compiled `.js`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'game-end-')),
  'gameEnd.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'gameEnd.ts')],
  bundle: true,
  keepNames: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  logLevel: 'error',
});

['retired', 'destroyed'].forEach((ending) => {
  try {
    process.stdout.write(
      execFileSync(process.execPath, [outfile], {
        cwd: webRenderer,
        encoding: 'utf8',
        env: { ...process.env, GAME_END: ending },
      })
    );
  } catch (error) {
    process.stdout.write(error.stdout || '');
    process.stderr.write(error.stderr || '');
    process.exit(1);
  }
});
