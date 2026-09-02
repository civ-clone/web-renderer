#!/usr/bin/env node

// The conformance suite from Stage 0 of docs/engine-serialisation/05-engine-plan.md.
//
// Drives the engine headlessly through a seeded game and compares structural
// invariants and a narrow state checksum against committed fixtures. It is the
// regression net for all 62 packages at once: Stage 1 must not change a single
// checksum.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const START = '<<<conformance';
const END = 'conformance>>>';
const fixturePath = path.join(
  webRenderer,
  'tests',
  'engine',
  'fixtures',
  'baseline.json'
);

const bundle = () => {
  const outfile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'conformance-')),
    'run.js'
  );

  // Same resolution order as the app's bundle: `.ts` ahead of `.js`, and
  // `keepNames` because DataObject ids are derived from `constructor.name`.
  require('esbuild').buildSync({
    entryPoints: [path.join(webRenderer, 'tests', 'engine', 'run.ts')],
    bundle: true,
    keepNames: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile,
    logLevel: 'error',
  });

  return outfile;
};

const run = (config, timeout) => {
  const entry = bundle();
  const output = execFileSync(process.execPath, [entry], {
    cwd: webRenderer,
    encoding: 'utf8',
    timeout,
    maxBuffer: 256 * 1024 * 1024,
    env: {
      ...process.env,
      CONFORMANCE_CONFIG: JSON.stringify(config),
      ...(process.env.CONFORMANCE_DUMP
        ? { CONFORMANCE_DUMP: process.env.CONFORMANCE_DUMP }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const start = output.indexOf(START);
  const end = output.indexOf(END);

  if (start === -1 || end === -1) {
    throw new Error(`The run produced no result document.\n${output.slice(-2000)}`);
  }

  return JSON.parse(output.slice(start + START.length, end));
};

// Report the first difference in terms of what it means, rather than dumping two
// JSON blobs and leaving the reader to diff them.
const differences = (expected, actual, trail = []) => {
  const found = [];

  if (
    expected === null ||
    actual === null ||
    typeof expected !== 'object' ||
    typeof actual !== 'object'
  ) {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      found.push(`${trail.join('.')}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }

    return found;
  }

  if (Array.isArray(expected) !== Array.isArray(actual)) {
    found.push(`${trail.join('.')}: type changed`);

    return found;
  }

  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) {
      found.push(
        `${trail.join('.')}: expected ${expected.length} entries, got ${actual.length}`
      );
    }

    expected.slice(0, Math.min(expected.length, actual.length)).forEach((value, i) =>
      found.push(...differences(value, actual[i], [...trail, i]))
    );

    return found;
  }

  new Set([...Object.keys(expected), ...Object.keys(actual)]).forEach((key) =>
    found.push(...differences(expected[key], actual[key], [...trail, key]))
  );

  return found;
};

const main = () => {
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const twice = args.includes('--twice');
  const seedIndex = args.indexOf('--seed');
  const turnsIndex = args.indexOf('--turns');
  const config = {};

  if (seedIndex !== -1) {
    config.seed = Number(args[seedIndex + 1]);
  }

  if (turnsIndex !== -1) {
    config.turns = Number(args[turnsIndex + 1]);
    config.checkpoints = [1, 10, config.turns].filter(
      (turn) => turn <= config.turns
    );
  }

  const started = Date.now();

  process.stdout.write('running the conformance game... ');

  const result = run(config, 10 * 60 * 1000);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`${elapsed}s`);
  Object.entries(result.checksums).forEach(([turn, value]) =>
    console.log(`  turn ${turn.padStart(3)}  ${value}`)
  );

  if (twice) {
    process.stdout.write('running it again for determinism... ');

    const second = run(config, 10 * 60 * 1000);
    const drift = differences(result, second);

    if (drift.length > 0) {
      console.log('NOT DETERMINISTIC');
      drift.slice(0, 20).forEach((line) => console.log(`  ${line}`));
      process.exit(1);
    }

    console.log('identical');
  }

  if (update) {
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
    fs.writeFileSync(fixturePath, JSON.stringify(result, null, 2) + '\n');
    console.log(`\nwrote ${path.relative(webRenderer, fixturePath)}`);

    return;
  }

  if (!fs.existsSync(fixturePath)) {
    console.log(
      `\nNo fixture at ${path.relative(webRenderer, fixturePath)}. Re-run with --update to record one.`
    );
    process.exit(1);
  }

  const expected = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const found = differences(expected, result);

  if (found.length === 0) {
    console.log('\nconformance: unchanged');

    return;
  }

  console.log(`\nconformance: ${found.length} difference(s) from the fixture`);
  found.slice(0, 40).forEach((line) => console.log(`  ${line}`));

  if (found.length > 40) {
    console.log(`  … and ${found.length - 40} more`);
  }

  process.exit(1);
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
