#!/usr/bin/env node

// Runs tests/ui/citizenState.ts — the citizens the city screen draws match the
// ones the engine counts (#269). Bundled with esbuild, as the other UI tests
// are.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'citizen-state-')),
  'citizenState.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'ui', 'citizenState.ts')],
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
