#!/usr/bin/env node

// Runs tests/engine/load.ts twice, in two processes: one plays and saves, the
// other loads that save through the renderer's own load path and plays on.
// Two processes because loading needs an engine that has not started a game —
// see the suite, and `src/js/Engine/loadGame.ts`.
//
// Once per seed (see lib/seeds.js). Each game takes about a second.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { envForSeed, seedsToRun } = require('./lib/seeds');
const { webRenderer } = require('./lib/paths');

const SEEDS = [1, 2, 3, 4, 5, 6];

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

const run = (mode, seed, ...flags) => {
  const output = execFileSync(
    process.execPath,
    [outfile, `--${mode}`, saveFile, ...flags],
    {
      cwd: webRenderer,
      encoding: 'utf8',
      env: envForSeed(seed),
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  const [last] = output.trim().split('\n').slice(-1);

  return JSON.parse(last);
};

const seeds = seedsToRun(SEEDS);

const playSeed = (seed) => {
  const checks = [];
  let played;
  let loaded;
  let loadedOld;

  try {
    played = run('save', seed);
    loaded = run('load', seed);
    loadedOld = run('load', seed, '--old');
  } catch (error) {
    process.stdout.write((error.stdout || '') + (error.stderr || ''));
    process.stdout.write('\n0/2 — a saved game reloads and plays on\n');

    return true;
  }

  checks.push([
    'a loaded game is the game that was saved',
    loaded.atLoad,
    played.atSave,
  ]);
  // The level is in the save (#173). Emperor, so a level lost on the way, read as King, can't pass.
  checks.push([
    'at the level it was played at',
    `${played.difficultyAtSave} ${loaded.difficultyAtLoad}`,
    'Emperor Emperor',
  ]);
  // A save from before there were levels: the player is asked for one, or, with nobody playing, it's Chieftain.
  checks.push([
    'a save with no level asks for one, or is Chieftain',
    `${loadedOld.difficultyAtLoad} / ${loadedOld.difficultyHeadless} / ${loadedOld.difficultyAsked} / ${loadedOld.difficultyChosen}`,
    'none / Chieftain / choose-difficulty: Chieftain, Warlord, Prince, King, Emperor / Emperor',
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
  // Shields put into builds from the save to `then`, against the game that
  // never stopped. None never matches, so a game where production stops on
  // both sides can't pass on two zeroes.
  checks.push([
    'and it still applies production',
    Number(loaded.shieldsThen) > 0
      ? `${loaded.shieldsThen} shields`
      : 'no shields',
    `${played.shieldsThen} shields`,
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
  // Read from the ship's own cargo at the save, not from what `launchShip`
  // meant to do: an embark that failed would leave both cargo lists empty, and
  // the comparison below would pass on two empty strings.
  checks.push([
    'a ship with a unit aboard is saved',
    played.cargoAtSave.split(',').includes(played.shipLaunched) ||
      `${played.shipLaunched} not in "${played.cargoAtSave}"`,
    true,
  ]);
  // Its registries were saved as plain arrays, so a loaded ship couldn't say
  // what it carried, and a computer player owning one lost every turn (#228).
  // The load side writes the Triremes back the way such an old save held them.
  checks.push([
    'and comes back knowing its cargo',
    loaded.cargoAtLoad,
    played.cargoAtSave,
  ]);
  // Zero on both sides, so a failure the uninterrupted game shares can't hide
  // one the loaded game has.
  checks.push([
    'and no turn fails as it plays on',
    `${played.errorsThen}/${loaded.errorsThen}`,
    '0/0',
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

  return failed > 0;
};

const failedSeeds = seeds.filter((seed) => {
  if (seeds.length > 1) {
    process.stdout.write(`seed ${seed}\n`);
  }

  return playSeed(seed);
});

if (seeds.length > 1) {
  process.stdout.write(
    `\n${seeds.length - failedSeeds.length}/${seeds.length} seeds — a saved ` +
      'game reloads and plays on' +
      (failedSeeds.length ? ` (failed: ${failedSeeds.join(', ')})` : '') +
      '\n'
  );
}

fs.rmSync(directory, { recursive: true, force: true });

process.exit(failedSeeds.length > 0 ? 1 : 0);
