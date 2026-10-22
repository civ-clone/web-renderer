#!/usr/bin/env node

// Runs tests/engine/earth.ts once for each size there is an Earth map for: an
// Earth game is played on that size's map, with every civilization on its
// start tile.

const { runSuite } = require('./lib/suite');

const sizes = [
  [80, 50],
  [104, 65],
  [128, 80],
];

runSuite('engine', 'earth', {
  runs: sizes.map(([width, height]) => ({
    env: {
      ...process.env,
      CONFORMANCE_CONFIG: JSON.stringify({ width, height, players: 14 }),
    },
    label: `${width}x${height}`,
  })),
});
