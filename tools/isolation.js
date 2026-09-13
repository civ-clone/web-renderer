#!/usr/bin/env node

// Runs tests/engine/isolation.ts — Stage 3's acceptance criterion, that two
// `Game`s in one process are independent. Bundled with esbuild so it resolves
// each package's `.ts` rather than its compiled `.js`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'isolation-')),
  'isolation.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'isolation.ts')],
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
