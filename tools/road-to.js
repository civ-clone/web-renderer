#!/usr/bin/env node

// Runs tests/engine/roadTo.ts — Settlers sent Road to a distant square build a Road
// on each square of the way and are handed back on arrival, and the UI is told which
// route orders to offer (#195). Bundled with
// esbuild so each package's `.ts` is resolved rather than its compiled `.js`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'road-to-')),
  'roadTo.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'roadTo.ts')],
  bundle: true,
  keepNames: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  logLevel: 'error',
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
