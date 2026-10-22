#!/usr/bin/env node

// Runs tests/engine/save.ts — the Stage 4 acceptance check from
// docs/engine-serialisation/05-engine-plan.md: "the generic-save spike works".
//
// Once per seed (see lib/seeds.js). Each game takes under a second.

const { envForSeed, seedsToRun } = require('./lib/seeds');
const { runSuite } = require('./lib/suite');

runSuite('engine', 'save', {
  runs: seedsToRun([1, 2, 3, 4, 5, 6]).map((seed) => ({
    env: envForSeed(seed),
    label: `seed ${seed}`,
  })),
});
