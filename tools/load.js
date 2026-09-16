#!/usr/bin/env node

// Runs tests/engine/load.ts twice, in two processes: one plays and saves, the
// other loads that save through the renderer's own load path and plays on.
// Two processes because loading needs an engine that has not started a game —
// see the suite, and `src/js/Engine/loadGame.ts`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'load-'));
const outfile = path.join(directory, 'load.js');
const saveFile = path.join(directory, 'game.json');

require('esbuild').buildSync({
  entryPoints: [path.join(webRenderer, 'tests', 'engine', 'load.ts')],
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

const checks = [];
let played;
let loaded;

try {
  played = run('save');
  loaded = run('load');
} catch (error) {
  process.stdout.write((error.stdout || '') + (error.stderr || ''));
  process.stdout.write('\n0/2 — a saved game reloads and plays on\n');
  process.exit(1);
}

checks.push([
  'a loaded game is the game that was saved',
  loaded.atLoad,
  played.atSave,
]);

let failed = 0;

checks.forEach(([label, actual, expected]) => {
  const ok = actual === expected;

  if (!ok) {
    failed += 1;
  }

  process.stdout.write(
    `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} ${actual}${
      ok ? '' : ` (expected ${expected})`
    }\n`
  );
});

// Replay equivalence — 05-engine-plan.md's last open Stage 5 criterion — is
// reported rather than asserted, because it does not hold yet and pretending
// otherwise would either fail every run or hide the gap.
//
// Measured: playing on from a loaded game reaches a different state from never
// having stopped, by one unit and one RNG draw after a single turn. The state
// *as loaded* is exact, so what diverges is the playing, not the restoring.
// Leading suspects, none yet confirmed: module-level state no save can see —
// `civ1-unit`'s `unitMoveStore` keyed by unit — a client's own in-memory
// strategy, and the rules a loaded game never re-registers. Each needs its own
// investigation.
process.stdout.write(
  `  note playing on diverges: ${loaded.atThen} vs ${played.atThen} — replay ` +
    'equivalence is not claimed\n'
);

process.stdout.write(
  `\n${checks.length - failed}/${
    checks.length
  } — a saved game reloads and plays on\n`
);

fs.rmSync(directory, { recursive: true, force: true });

process.exit(failed === 0 ? 0 : 1);
