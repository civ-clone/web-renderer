#!/usr/bin/env node

// Runs tests/engine/lostWonders.ts: a Wonder lost with its city is never built
// again, and what it allowed stays allowed (#971).
//
// Twice, in two processes, as `load.js` does: one plays and saves with a lost
// Wonder being built again, as an old save could hold, the other loads that
// save and plays its turn start.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { runSuite } = require('./lib/suite');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lost-wonders-')),
  saveFile = path.join(directory, 'game.json');

process.on('exit', () =>
  fs.rmSync(directory, { recursive: true, force: true })
);

runSuite('engine', 'lostWonders', {
  runs: ['save', 'load'].map((mode) => ({
    args: [`--${mode}`, saveFile],
    label: mode,
  })),
});
