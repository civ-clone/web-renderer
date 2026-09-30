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
// The file must name the stream the game was on. `core-random`'s `seed()` used
// to report the clock seed the generator was constructed with, not the one
// `restore` moved it to, so every save named a different stream and the game
// played on from it took one of several paths depending on the millisecond
// the saving process started.
checks.push([
  'and it resumes the random stream it was playing',
  played.rngAtSave,
  played.rngPlayed,
]);
checks.push([
  'and it still applies production',
  Number(loaded.productionAtThen) > Number(loaded.productionAtLoad) ||
    `${loaded.productionAtLoad} -> ${loaded.productionAtThen}`,
  true,
]);

checks.push([
  'and has the same city names left to hand out',
  loaded.namePoolAtLoad === played.namePoolAtSave ||
    `${
      loaded.namePoolAtLoad.split(',').length -
      played.namePoolAtSave.split(',').length
    } more names in the pool`,
  true,
]);
checks.push([
  'and no name is handed out twice as it plays on',
  loaded.repeatedCityNamesAtThen || 'none',
  'none',
]);
// Replay equivalence — 05-engine-plan.md's last open Stage 5 criterion (#17).
// The next draw is compared as well as the state, because two games on
// different streams can agree on state for a few turns by chance.
checks.push([
  'and plays on to the game that never stopped',
  `${loaded.atThen} ${loaded.nextDrawAtThen}`,
  `${played.atThen} ${played.nextDrawAtThen}`,
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

process.stdout.write(
  `\n${checks.length - failed}/${
    checks.length
  } — a saved game reloads and plays on\n`
);

fs.rmSync(directory, { recursive: true, force: true });

process.exit(failed === 0 ? 0 : 1);
