#!/usr/bin/env node

// Runs tests/engine/clientActionsState.ts — what the client holds of the player's actions on the frontend, which action
// lists go again and which unit goes with its actions (#411, #323, #449), checked with plain data. Bundled with esbuild
// so each package's `.ts` is resolved rather than its compiled `.js`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'client-actions-state-')),
  'clientActionsState.js'
);

require('esbuild').buildSync({
  entryPoints: [
    path.join(webRenderer, 'tests', 'engine', 'clientActionsState.ts'),
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
