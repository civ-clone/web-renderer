#!/usr/bin/env node

// Runs tests/engine/diplomacy.ts twice, in two processes: one plays, opens a
// negotiation and a treaty and saves; the other loads that save through the
// renderer's own load path, carries the negotiation on and plays a turn (#80).

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'diplomacy-'));
const outfile = path.join(directory, 'diplomacy.js');
const saveFile = path.join(directory, 'game.json');

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'diplomacy.ts')],
  bundle: true,
  keepNames: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  logLevel: 'error',
});

const run = (mode) => {
  const output = execFileSync(
    process.execPath,
    [outfile, `--${mode}`, saveFile],
    {
      cwd: webRenderer,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  const [last] = output.trim().split('\n').slice(-1);

  return JSON.parse(last);
};

let saved;
let loaded;

try {
  saved = run('save');
  loaded = run('load');
} catch (error) {
  process.stdout.write((error.stdout || '') + (error.stderr || ''));
  process.stdout.write('\n0/7 — a game with diplomacy in progress reloads\n');
  process.exit(1);
}

const checks = [
  [
    'nothing saves the rule registry or the turn',
    JSON.stringify(saved.carried),
    '[]',
  ],
  [
    'the negotiation comes back as it was',
    JSON.stringify(loaded.interactions),
    JSON.stringify(saved.interactions),
  ],
  [
    'and offers the same next steps',
    JSON.stringify(loaded.nextSteps),
    JSON.stringify(saved.nextSteps),
  ],
  ["with the game's rules and turn", loaded.injected, true],
  ['the treaty is still in force', loaded.peaceActive, true],
  ['the negotiation can be carried on', loaded.terminated, true],
  ['and the game plays on', loaded.playedOn > 0, true],
];

let failed = 0;

checks.forEach(([label, actual, expected]) => {
  const ok = actual === expected;

  if (!ok) {
    failed += 1;
  }

  process.stdout.write(
    `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(45)} ${actual}${
      ok ? '' : ` (expected ${expected})`
    }\n`
  );
});

process.stdout.write(
  `\n${checks.length - failed}/${
    checks.length
  } — a game with diplomacy in progress reloads\n`
);

fs.rmSync(directory, { recursive: true, force: true });

process.exit(failed === 0 ? 0 : 1);
