#!/usr/bin/env node

// Runs tests/ui/renderGeometry.ts — every draw call the map layers make and every number the portal works out are the
// same as tests/ui/fixtures/render-geometry.json says (#90). `--update` rewrites the fixture. Bundled with esbuild, as
// the other UI tests are.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'render-geometry-')),
  'renderGeometry.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'ui', 'renderGeometry.ts')],
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
    execFileSync(process.execPath, [outfile, ...process.argv.slice(2)], {
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
