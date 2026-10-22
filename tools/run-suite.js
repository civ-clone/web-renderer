#!/usr/bin/env node

// Runs one test suite, tests/<engine|ui>/<name>.ts — see lib/suite.js for what
// passing means.
//
//   node tools/run-suite.js engine respawn
//   node tools/run-suite.js ui citizens
//   node tools/run-suite.js engine save --seeds 1,2,3,4,5,6
//   node tools/run-suite.js engine clientTranscript --update
//
// `--seeds` plays the suite once per seed, each in its own process (see
// lib/seeds.js; `CONFORMANCE_CONFIG='{"seed":3}'` reruns one). Every other
// argument goes to the suite itself, so `npm run test:x -- --update` reaches
// it; anything after `--` does too, even `--seeds`.

const { envForSeed, seedsToRun } = require('./lib/seeds');
const { runSuite } = require('./lib/suite');

const usage =
  'usage: node tools/run-suite.js <engine|ui> <name> [--seeds 1,2,3] [suite args…] [-- suite args…]';

// `{ kind, name, seeds, args }`, or `{ error }` saying what's wrong.
const parseArguments = (argv) => {
  const separator = argv.indexOf('--'),
    own = separator === -1 ? argv : argv.slice(0, separator),
    after = separator === -1 ? [] : argv.slice(separator + 1),
    [kind, name, ...rest] = own,
    args = [];
  let seeds = null;

  if (!['engine', 'ui'].includes(kind) || !name || name.startsWith('-')) {
    return { error: usage };
  }

  for (let i = 0; i < rest.length; i++) {
    if (rest[i] !== '--seeds') {
      args.push(rest[i]);

      continue;
    }

    const value = rest[++i];

    if (value === undefined || !/^\d+(,\d+)*$/.test(value)) {
      return {
        error: `--seeds needs a comma-separated list of seeds, such as --seeds 1,2,3\n${usage}`,
      };
    }

    seeds = value.split(',').map(Number);
  }

  return { kind, name, seeds, args: [...args, ...after] };
};

if (require.main === module) {
  const { error, kind, name, seeds, args } = parseArguments(
    process.argv.slice(2)
  );

  if (error) {
    process.stderr.write(`${error}\n`);
    process.exit(2);
  }

  const runs =
    seeds === null
      ? [{ args }]
      : seedsToRun(seeds).map((seed) => ({
          args,
          env: envForSeed(seed),
          label: `seed ${seed}`,
        }));

  runSuite(kind, name, { runs }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exit(1);
  });
}

module.exports = { parseArguments };
