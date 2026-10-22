#!/usr/bin/env node

// Runs tests/engine/standingOrders.ts — Explore and Automate carry on by
// themselves, turn after turn (#198, #200).
//
// Twice, in two processes, as `load.js` does: one plays and saves part way
// through the orders, the other loads that save and plays on.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { runSuite } = require('./lib/suite');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'standing-orders-')),
  saveFile = path.join(directory, 'game.json');

process.on('exit', () =>
  fs.rmSync(directory, { recursive: true, force: true })
);

runSuite('engine', 'standingOrders', {
  runs: ['save', 'load'].map((mode) => ({
    args: [`--${mode}`, saveFile],
    label: mode,
  })),
});
