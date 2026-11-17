#!/usr/bin/env node

// Builds the hosted sets' sheets and indexes into dist/sets (#1063), and tells the packages that register them their
//  names: see `lib/hostedSets.js`. Fails, saying which, when a set has no sprite for one its descriptor requires.

const { buildHostedSets } = require('./lib/hostedSets');

try {
  buildHostedSets();
} catch (error) {
  console.error(`hosted-sets: ${error.message}`);

  process.exit(1);
}
