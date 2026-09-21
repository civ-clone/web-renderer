#!/usr/bin/env node

// Counts registry iteration by registry class. See
// `tests/engine/registryProfile.ts` for why a CPU profile cannot answer this
// on its own.
//
//   node tools/registry-profile.js --turns 30

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const index = process.argv.indexOf('--turns');
const turns = Number(index === -1 ? 30 : process.argv[index + 1]);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-profile-'));
const bundle = path.join(directory, 'registryProfile.js');

require('esbuild').buildSync({
  entryPoints: [
    path.join(webRenderer, 'tests', 'engine', 'registryProfile.ts'),
  ],
  bundle: true,
  keepNames: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: bundle,
  logLevel: 'error',
});

execFileSync(process.execPath, [bundle], {
  cwd: webRenderer,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  env: {
    ...process.env,
    CONFORMANCE_CONFIG: JSON.stringify({ turns, checkpoints: [turns] }),
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});

fs.rmSync(directory, { recursive: true, force: true });
