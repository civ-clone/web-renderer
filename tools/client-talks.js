#!/usr/bin/env node

// Runs tests/engine/clientTalks.ts — gold that changes hands in talks with another player is sent once they are
// over (#492), checked with a stub transport and the real patches. Bundled with esbuild so each package's `.ts` is
// resolved rather than its compiled `.js`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'client-talks-')),
  'clientTalks.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'clientTalks.ts')],
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
