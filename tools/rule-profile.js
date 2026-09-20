#!/usr/bin/env node

// Counts rule dispatch by rule type. See `tests/engine/ruleProfile.ts` for why
// a CPU profile cannot answer this on its own.
//
//   node tools/rule-profile.js --turns 30

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const index = process.argv.indexOf('--turns');
const turns = Number(index === -1 ? 30 : process.argv[index + 1]);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-profile-'));
const bundle = path.join(directory, 'ruleProfile.js');

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'ruleProfile.ts')],
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
