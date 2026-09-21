#!/usr/bin/env node

// Runs tests/ui/translations.ts — names with an apostrophe must survive
// translation intact (#3). Bundled with esbuild so the translation files'
// engine imports resolve the same way they do in the app.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'translations-')),
  'translations.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'ui', 'translations.ts')],
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
