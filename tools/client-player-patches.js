#!/usr/bin/env node

// Runs tests/engine/clientPlayerPatches.ts — the flush of the client's patches, which sends what is queued as one
// patch and nothing while an action holds it (#321, #449), checked with a stub transport and plain data. Bundled with
// esbuild so each package's `.ts` is resolved rather than its compiled `.js`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'client-player-patches-')),
  'clientPlayerPatches.js'
);

require('esbuild').buildSync({
  entryPoints: [
    path.join(webRenderer, 'tests', 'engine', 'clientPlayerPatches.ts'),
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
