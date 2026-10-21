#!/usr/bin/env node

// Runs tests/engine/clientVisibilityFilter.ts — the parts of the client's visibility filter that need no game: tiles as
// refs, Busy by name, the held actions forgotten, a build without `available`, checked with stand-in objects (#449).
// Bundled with esbuild so each package's `.ts` is resolved rather than its compiled `.js`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'client-visibility-filter-')),
  'clientVisibilityFilter.js'
);

require('esbuild').buildSync({
  entryPoints: [
    path.join(webRenderer, 'tests', 'engine', 'clientVisibilityFilter.ts'),
  ],
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
