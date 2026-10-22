#!/usr/bin/env node

// Runs tests/engine/gameEnd.ts once for each ending it plays — retiring, and
// your civilization destroyed (#176).

const { runSuite } = require('./lib/suite');

runSuite('engine', 'gameEnd', {
  runs: ['retired', 'destroyed'].map((ending) => ({
    env: { ...process.env, GAME_END: ending },
    label: ending,
  })),
});
