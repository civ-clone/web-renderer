#!/usr/bin/env node

// Runs tests/engine/clientTranscript.ts — everything the human's client sends the UI in a short scripted game is the
// same as tests/engine/fixtures/client-transcript.json says (#449). `--update` rewrites the fixture. Bundled with
// esbuild so each package's `.ts` is resolved rather than its compiled `.js`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'client-transcript-')),
  'clientTranscript.js'
);

require('esbuild').buildSync({
  entryPoints: [
    path.join(webRenderer, 'tests', 'engine', 'clientTranscript.ts'),
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
