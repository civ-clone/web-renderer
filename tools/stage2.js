#!/usr/bin/env node

// Drives Stage 2 of docs/engine-serialisation/05-engine-plan.md: every
// `Math.random()` becomes a draw from the injected, seeded generator in
// `@civ-clone/core-random`.
//
//   node tools/stage2.js --wave 0
//   node tools/stage2.js core-spaceship --commit
//
// Per package: add the dependency, place `core-random` in its `node_modules` so
// it can compile against it, run the codemod, then compile, format, test and
// sync. Packages with an inline `Math.random()` and no parameter to redirect are
// reported rather than guessed at — where that parameter belongs is a judgement
// about the class's signature, and five of them are done by hand.

const fs = require('fs');
const path = require('path');

const { checkoutPath, scope } = require('./lib/paths');
const { apply } = require('./codemod/seeded-rng');
const { git, perPackage } = require('./lib/procedure');
const { read } = require('./lib/audit');
const { syncPackage } = require('./lib/sync');

const DEPENDENCY = '@civ-clone/core-random';
const RANGE = '^0.1.0';

const COMMIT_MESSAGE = [
  'refactor: draw randomness from the injected seeded generator',
  '',
  'Stage 2 of the engine serialisation plan. `Math.random()` makes a game',
  'unreproducible: no replay testing, and a save/load cycle would change the',
  'next combat result.',
  '',
  'The generator now defaults to `@civ-clone/core-random`\'s shared instance',
  'rather than `Math.random`, following the pattern `core-spaceship` already',
  'used. It stays an injectable parameter, which is what lets Stage 3 give each',
  '`Game` its own generator without touching these call sites again.',
  '',
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_0192CD1JmgxQZWxDURTRN9HS',
].join('\n');

// The package must be able to resolve `@civ-clone/core-random` to compile, and
// it is not published yet, so place it from the checkout. Stage 1 learned not
// to sync a whole dependency tree into a checkout — older lockfiles there pin
// versions that current sources have moved past — so this places exactly the
// one new package and nothing else.
const placeDependency = (dir) => {
  const target = path.join(dir, 'node_modules', '@civ-clone');

  fs.mkdirSync(target, { recursive: true });
  syncPackage('core-random', { quiet: true, into: target });
};

const addDependency = (dir) => {
  const manifestPath = path.join(dir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if ((manifest.dependencies || {})[DEPENDENCY]) {
    return false;
  }

  // Insert in alphabetical position without re-sorting the rest: these lists are
  // mostly but not always sorted, and a full sort turns a one-line addition into
  // a diff that also moves unrelated entries.
  const existing = Object.entries(manifest.dependencies || {});
  const at = existing.findIndex(([key]) => key.localeCompare(DEPENDENCY) > 0);
  const inserted = at === -1 ? existing.length : at;

  manifest.dependencies = Object.fromEntries([
    ...existing.slice(0, inserted),
    [DEPENDENCY, RANGE],
    ...existing.slice(inserted),
  ]);

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  return true;
};

const transform = (dir, name) => {
  const report = apply(dir);

  if (report.defaults.length === 0) {
    return { changed: [], problems: [], report };
  }

  addDependency(dir);

  return { changed: report.defaults, problems: [], report };
};

const main = () => {
  const args = process.argv.slice(2);
  const waveIndex = args.indexOf('--wave');
  const commit = args.includes('--commit');
  const named = args.filter(
    (arg, i) =>
      !arg.startsWith('--') && !(waveIndex !== -1 && i === waveIndex + 1)
  );
  const manifest = read();
  const targets =
    waveIndex === -1
      ? named
      : Object.entries(manifest.packages)
          .filter(
            ([name, details]) =>
              details.stages.includes(2) &&
              (details.waves || {})['2'] === Number(args[waveIndex + 1]) &&
              name !== 'core-random'
          )
          .map(([name]) => name)
          .sort();

  if (targets.length === 0) {
    console.error('Nothing to do. Pass package names or --wave N.');
    process.exit(1);
  }

  console.log(`${targets.length} package(s)${commit ? ', committing' : ''}:\n`);

  const problems = [];
  const inline = [];

  targets.forEach((name) => {
    if (problems.length > 0) {
      console.log(`  ${name.padEnd(30)} skipped`);

      return;
    }

    const result = perPackage(name, transform, {
      commitMessage: commit ? COMMIT_MESSAGE : null,
      prepare: placeDependency,
    });

    problems.push(...result.problems);

    if (result.problems.length > 0) {
      console.log(`  ${name.padEnd(30)} FAILED`);

      return;
    }

    const synced = syncPackage(name, { quiet: true });

    console.log(
      `  ${name.padEnd(30)} ${String(result.changed.length).padStart(2)} default(s), synced ${synced.changed.length}${result.commit ? `, committed ${result.commit}` : ''}`
    );

    result.notes.forEach((note) => console.log(`  ${''.padEnd(30)} ! ${note}`));

    const report = apply(checkoutPath(name), { dryRun: true });

    report.inline.forEach((line) => inline.push(`${name}/${line}`));
  });

  if (inline.length > 0) {
    console.log('\ninline Math.random left for conversion by hand:');
    inline.forEach((line) => console.log(`  ${line}`));
  }

  if (problems.length > 0) {
    console.log(`\n${problems.join('\n')}`);
    process.exit(1);
  }

  console.log('\nReview the diffs, then run the conformance suite.');
};

main();
