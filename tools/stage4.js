#!/usr/bin/env node

// Drives Stage 4 of docs/engine-serialisation/05-engine-plan.md: each stateful
// class declares the fields it does not want saved.
//
//   node tools/stage4.js core-city --commit
//   node tools/stage4.js --all --commit
//
// `--all` asks the workspace which packages the codemod has something to say
// about, rather than reading the manifest: `civ audit` records work *remaining*
// per stage, so a manifest written mid-rollout no longer lists the packages the
// rollout has already done — and a driver that trusted it would do less and
// less on each re-run while still reporting success.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { checkoutPath } = require('./lib/paths');
const { apply } = require('./codemod/transient-fields');
const { binary, cleanMappedConfig, mappedConfig } = require('./lib/publish');
const { git } = require('./lib/procedure');
const { syncPackage } = require('./lib/sync');

// The version a `transient` declaration is both read and safe in.
//
// This range is the whole reason the dependency is touched at all, and it is
// not bookkeeping. `static readonly transient = [...]` is legal TypeScript
// against *any* version of the base class: with an older `core-data-object` it
// compiles as an ordinary new static that `allTransient()` never reads, so the
// declaration is a silent no-op and the field is saved anyway. Under `^0.1.0`
// that outcome is a resolution away.
//
// 0.1.15 rather than 0.1.14, which introduced the mechanism: 0.1.14 declared
// the static as *required*, which stopped `IConstructor<T>` satisfying
// `typeof T` and broke the typecheck of 22 of the 83 checkouts. The mechanism
// works in 0.1.14; the tree does not.
const MECHANISM = '@civ-clone/core-data-object';
const MECHANISM_RANGE = '^0.1.15';

const COMMIT_MESSAGE = [
  'refactor: declare which fields are not saved',
  '',
  'Stage 4 of the engine serialisation plan. Every field of a `DataObject` is',
  'saved unless the class says otherwise, and some of them must not be: a',
  'registry, an `Engine`, a random number generator and a cache are either',
  'supplied by the loading `Game` or derived from what it supplies, and',
  'restoring one restores a stale answer at best.',
  '',
  '`static readonly transient` lists them. The set is derived from the field',
  'types rather than hand-written — a field typed with a registry class, with a',
  'type the `Game` holds, or with `() => number` is transient by construction,',
  'and a cache is matched by name because it has no distinguishing type. Stages',
  '2 and 3 were mechanical for the same reason.',
  '',
  'The dependency on core-data-object moves to ^0.1.15 because that is the',
  'first version the declaration is both read and safe in. Against an older',
  'one it is legal TypeScript that compiles to an unread static, so the field',
  'would be saved regardless and nothing would report it; 0.1.14 reads it but',
  'declared the static as required, which stopped `IConstructor<T>` satisfying',
  '`typeof T` and broke the typecheck of 22 of the 83 checkouts.',
  '',
  'This changes nothing yet: `stateKeys()` has no callers until the save format',
  'lands, and `toPlainObject()` is unaffected, so the conformance checksums and',
  'the DTO digest are both unchanged.',
  '',
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_0192CD1JmgxQZWxDURTRN9HS',
].join('\n');

const run = (dir, tool, args) => {
  try {
    execFileSync(binary(dir, tool), args, {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    return null;
  } catch (error) {
    return (error.stdout || '') + (error.stderr || '') || error.message;
  }
};

// Insert in sorted position, or move an existing entry's range up. Declared
// even where the package only inherits `DataObject` through another package:
// the class is using core-data-object's contract directly the moment it
// declares `transient`, and saying so is what pins the version.
const requireMechanism = (dir) => {
  const manifestPath = path.join(dir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const dependencies = manifest.dependencies || {};

  if (dependencies[MECHANISM] === MECHANISM_RANGE) {
    return null;
  }

  const before = dependencies[MECHANISM];
  const entries = Object.entries(dependencies).filter(
    ([key]) => key !== MECHANISM
  );
  const at = entries.findIndex(([key]) => key.localeCompare(MECHANISM) > 0);

  manifest.dependencies = Object.fromEntries([
    ...entries.slice(0, at === -1 ? entries.length : at),
    [MECHANISM, MECHANISM_RANGE],
    ...entries.slice(at === -1 ? entries.length : at),
  ]);

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  return before ? `${before} → ${MECHANISM_RANGE}` : `added ${MECHANISM_RANGE}`;
};

const process1 = (name, { commit = false } = {}) => {
  const dir = checkoutPath(name);

  if (!fs.existsSync(dir)) {
    return [`${name}: no checkout`];
  }

  if (git(dir, 'status', '--porcelain', '--untracked-files=no') !== '') {
    return [`${name}: tracked files are modified`];
  }

  let report;

  try {
    report = apply(dir);
  } catch (error) {
    return [`${name}: ${error.message}`];
  }

  // A field with neither a type annotation nor a `new X()` initialiser cannot
  // be classified, and guessing is the one thing this must not do — a wrong
  // `transient` entry is silent data loss.
  if (report.unknown.length > 0) {
    return [`${name}: cannot classify ${report.unknown.join('; ')}`];
  }

  if (report.classes.length === 0) {
    console.log(`  ${name.padEnd(24)} nothing to declare`);

    return [];
  }

  const dependency = requireMechanism(dir);

  const format = () =>
    run(dir, 'prettier', ['--config', '.prettierrc', '**/*.ts', '--write']);

  // Format, compile, format — the order matters in both directions. The
  // trailing pass is for the generated `.d.ts`, whose committed copies are
  // prettier-formatted. The leading pass is for the emitted `.js` and its map:
  // ts-morph writes `static readonly transient = ['_a', '_b', '_c'];` on one
  // line, prettier wraps it past 80 columns, and compiling in between produced
  // a `World.js` holding the one-line form against a `World.ts` holding the
  // wrapped one. Harmless — same array — and exactly the drift that survives
  // every gate, which is why `lib/procedure.js` was changed the same way.
  const beforeFailure = format();

  if (beforeFailure) {
    return [`${name}: prettier failed\n${beforeFailure}`];
  }

  const config = mappedConfig(dir);
  const failure = run(dir, 'tsc', ['--build', config, '--force']);

  cleanMappedConfig(dir);

  if (failure) {
    return [`${name}: ts:compile failed\n${failure}`];
  }

  const formatFailure = format();

  if (formatFailure) {
    return [`${name}: prettier failed\n${formatFailure}`];
  }

  const synced = syncPackage(name, { quiet: true });

  console.log(
    `  ${name.padEnd(24)} ${String(report.classes.length).padStart(
      2
    )} class(es)${dependency ? `, ${dependency}` : ''}, synced ${
      synced.changed.length
    }`
  );
  report.classes.forEach((line) => console.log(`  ${''.padEnd(24)} ${line}`));

  if (commit) {
    // `-am`, never `git add -A`: several checkouts carry an untracked
    // `pnpm-lock.yaml` that is not ours to commit.
    git(dir, 'commit', '-am', COMMIT_MESSAGE);
    console.log(
      `  ${''.padEnd(24)} committed ${git(dir, 'rev-parse', '--short', 'HEAD')}`
    );
  }

  return [];
};

// Ask the codemod, not the manifest. A package is a target if a dry run finds a
// class to declare for, which is also what makes a re-run a no-op rather than a
// second pass: an already-declared class is skipped, so the dry run reports
// nothing and the package drops out on its own.
const targetsFromWorkspace = () => {
  const root = path.dirname(checkoutPath('x'));

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'web-renderer')
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        return apply(checkoutPath(name), { dryRun: true }).classes.length > 0;
      } catch (error) {
        return false;
      }
    })
    .sort();
};

const main = () => {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const named = args.filter((arg) => !arg.startsWith('--'));
  const targets = args.includes('--all') ? targetsFromWorkspace() : named;

  if (targets.length === 0) {
    console.error('Nothing to do. Pass package names or --all.');
    process.exit(1);
  }

  console.log(`${targets.length} package(s)${commit ? ', committing' : ''}:\n`);

  const problems = [];

  targets.forEach((name) => {
    if (problems.length > 0) {
      console.log(`  ${name.padEnd(24)} skipped`);

      return;
    }

    problems.push(...process1(name, { commit }));
  });

  if (problems.length > 0) {
    console.log(`\n${problems.join('\n')}`);
    process.exit(1);
  }

  console.log('\nRun the conformance suite before publishing.');
};

main();
