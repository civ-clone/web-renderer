#!/usr/bin/env node

// Runs tests/engine/clientDispose.ts — what `DataTransferClient.dispose()` stops: the engine listeners, the transport
// receivers, the turn under way and a pending choice (#449). Bundled with esbuild so each package's `.ts` is resolved
// rather than its compiled `.js`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'client-dispose-')),
  'clientDispose.js'
);

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'clientDispose.ts')],
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
