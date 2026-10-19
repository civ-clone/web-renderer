#!/usr/bin/env node

// Runs tests/engine/earth.ts once for each size there is an Earth map for: an
// Earth game is played on that size's map, with every civilization on its
// start tile. Bundled with esbuild so each package's `.ts` is resolved rather
// than its compiled `.js`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'earth-')),
  'earth.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'earth.ts')],
  bundle: true,
  keepNames: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  logLevel: 'error',
});

const sizes = [
  [80, 50],
  [104, 65],
  [128, 80],
];

let failed = false;

sizes.forEach(([width, height]) => {
  try {
    process.stdout.write(
      execFileSync(process.execPath, [outfile], {
        cwd: webRenderer,
        encoding: 'utf8',
        env: {
          ...process.env,
          CONFORMANCE_CONFIG: JSON.stringify({ width, height, players: 14 }),
        },
      })
    );
  } catch (error) {
    process.stdout.write(error.stdout || '');
    process.stderr.write(error.stderr || '');
    failed = true;
  }
});

process.exit(failed ? 1 : 0);
