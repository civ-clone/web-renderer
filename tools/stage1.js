#!/usr/bin/env node

// Drives the per-package procedure for Stage 1 of
// docs/engine-serialisation/05-engine-plan.md across a wave, or a named list of
// packages.
//
//   node tools/stage1.js --wave 0
//   node tools/stage1.js core-city core-unit
//   node tools/stage1.js --wave 0 --commit
//
// Each package: install if needed, run the codemod, format, compile, test, and
// sync the result into web-renderer/node_modules. It stops at the first failure
// so the diff stays reviewable — nothing is committed unless --commit is given,
// and then only for packages that passed every step.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { checkoutPath } = require('./lib/paths');
const { read } = require('./lib/audit');
const { apply } = require('./codemod/private-fields');
const { defaultBranch } = require('./lib/publish');
const { scanSource } = require('./lib/scan');
const { syncPackage } = require('./lib/sync');

const COMMIT_MESSAGE = [
  'refactor: use TypeScript private instead of #private fields',
  '',
  'Stage 1 of the engine serialisation plan. `#private` slots can only be',
  'installed by running a constructor, which makes generic rehydration',
  'impossible; `private _x` lets',
  '`Object.assign(Object.create(Class.prototype), state)` produce a working',
  'instance. No public API changes — every caller already went through the',
  'accessor methods.',
  '',
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_0192CD1JmgxQZWxDURTRN9HS',
].join('\n');

const npm = (dir, ...args) =>
  execFileSync('npm', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: 'pipe',
  });

const git = (dir, ...args) =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

// The Stage 1 surface, so the dependency sync below never pulls in a checkout
// that this stage does not touch.
const stage1 = new Set(
  Object.entries(read().packages)
    .filter(([, details]) => details.stages.includes(1))
    .map(([name]) => name)
);

const hasScript = (dir, name) => {
  try {
    return Boolean(
      (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
        .scripts || {})[name]
    );
  } catch (e) {
    return false;
  }
};

// Compile before formatting: `prettier:format` globs `**/*.ts`, which includes
// the generated `.d.ts`, and the committed ones are prettier-formatted. The
// reverse order leaves every declaration file reformatted in the diff.
// `--force` because `tsc --build` skips when its outputs are newer than its
// inputs, which makes the before/after comparison below meaningless — and
// leaves a stale `.js` beside an edited `.ts` in the commit.
const SCRIPTS = [
  ['ts:compile', ['run', 'ts:compile', '--', '--force']],
  ['prettier:format', ['run', 'prettier:format']],
  ['test', ['run', 'test']],
];

const step = (label, work) => {
  try {
    work();

    return null;
  } catch (error) {
    return `${label}: ${(error.stdout || '') + (error.stderr || '') || error.message}`;
  }
};

const process1 = (name, { commit = false } = {}) => {
  const dir = checkoutPath(name);
  const problems = [];

  if (!fs.existsSync(dir)) {
    return [`${name}: no checkout — run \`tools/civ clone --stage 1\``];
  }

  const branch = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  const expected = defaultBranch(dir);

  if (branch !== expected) {
    return [`${name}: on branch ${branch}, expected ${expected}`];
  }

  // Untracked files are ignored deliberately: the codemod only rewrites tracked
  // `.ts` files and the commit below is `-a`, so a stray lockfile in a checkout
  // cannot be swept in.
  if (git(dir, 'status', '--porcelain', '--untracked-files=no') !== '') {
    return [`${name}: tracked files are modified — resolve before running`];
  }

  if (!fs.existsSync(path.join(dir, 'node_modules'))) {
    // `ci` where there is a lockfile, so the checkout's `package-lock.json` is
    // not modified and cannot end up in the refactor commit.
    // `ci` first, so the checkout's `package-lock.json` is not modified and
    // cannot end up in the refactor commit. Some lockfiles pin versions that are
    // no longer on the registry (`base-unit-action-sleep` wants
    // `base-unit-action-build-railroad@0.1.0`), so fall back to a resolving
    // install and restore the lockfile afterwards.
    //
    // `--ignore-scripts` so a package with a native dependency still installs:
    // `civ1-earth-generator` pulls in `canvas`, whose node-gyp build needs
    // pixman and friends. Type-checking needs the types, not the binary.
    const flags = ['--ignore-scripts', '--no-audit', '--no-fund'];
    const hasLock = fs.existsSync(path.join(dir, 'package-lock.json'));
    let failure = hasLock
      ? step('npm ci', () => npm(dir, 'ci', ...flags))
      : null;

    if (failure || !hasLock) {
      // `--no-package-lock` so the unsatisfiable pin is ignored rather than
      // honoured, and so the checkout's lockfile is left untouched.
      failure = step('npm install', () =>
        npm(dir, 'install', '--no-package-lock', ...flags)
      );
    }

    if (failure) {
      return [`${name}: ${failure}`];
    }
  }

  // Several packages do not build cleanly from a fresh checkout — `core-engine`
  // has no `@types/node`, so `console` is unresolvable. Record what was already
  // broken, so the only thing that fails this stage is a regression the codemod
  // actually caused.
  const before = SCRIPTS.map(([label, argv]) =>
    hasScript(dir, label) ? step(label, () => npm(dir, ...argv)) : null
  );

  const report = apply(dir);

  if (report.brandChecks.length > 0 || report.collisions.length > 0) {
    return [
      `${name}: codemod refused`,
      ...report.brandChecks,
      ...report.collisions,
    ];
  }

  if (report.fields.length === 0) {
    const source = scanSource(dir);

    if (source.fields === 0) {
      console.log(`  ${name.padEnd(42)} already converted`);

      return [];
    }

    return [
      `${name}: the codemod converted nothing, but ${source.fields} #private field(s) remain`,
    ];
  }

  const preExisting = [];

  SCRIPTS.forEach(([label, argv], i) => {
    if (problems.length > 0 || !hasScript(dir, label)) {
      return;
    }

    let failure = step(label, () => npm(dir, ...argv));

    // `core-strategy`'s suite is flaky by construction: `StrategyRegistry.attempt`
    // breaks priority ties with `Math.random()` and the test assumes an order.
    // Retry before calling a test failure a regression, or the stage stalls on
    // a coin flip.
    for (let attempt = 0; failure && label === 'test' && attempt < 3; attempt += 1) {
      failure = step(label, () => npm(dir, ...argv));

      if (!failure) {
        preExisting.push(`${label} is flaky — passed on retry ${attempt + 1}`);
      }
    }

    if (failure && before[i]) {
      preExisting.push(`${label} was already failing before the change`);

      return;
    }

    if (failure) {
      problems.push(`${name}: ${failure}`);
    }
  });

  if (problems.length > 0) {
    return problems;
  }

  const synced = syncPackage(name, { quiet: true });

  if (synced.skipped) {
    problems.push(`${name}: sync skipped (${synced.skipped})`);

    return problems;
  }

  console.log(
    `  ${name.padEnd(42)} ${String(report.fields.length).padStart(3)} field(s), ${report.files.size} file(s), synced ${synced.changed.length}`
  );

  preExisting.forEach((line) => console.log(`  ${''.padEnd(42)} ! ${line}`));

  if (commit) {
    git(dir, 'commit', '-am', COMMIT_MESSAGE);
    console.log(`  ${''.padEnd(42)} committed ${git(dir, 'rev-parse', '--short', 'HEAD')}`);
  }

  return [];
};

const main = () => {
  const args = process.argv.slice(2);
  const waveIndex = args.indexOf('--wave');
  const commit = args.includes('--commit');
  // Skip the value that follows `--wave`, but only when `--wave` was given —
  // `args[-1 + 1]` is otherwise the first package name.
  const named = args.filter(
    (arg, i) => !arg.startsWith('--') && !(waveIndex !== -1 && i === waveIndex + 1)
  );
  const manifest = read();
  const targets =
    waveIndex === -1
      ? named
      : Object.entries(manifest.packages)
          .filter(
            ([, details]) =>
              details.stages.includes(1) &&
              (details.waves || {})[1] === Number(args[waveIndex + 1])
          )
          .map(([name]) => name)
          .sort();

  if (targets.length === 0) {
    console.error('Nothing to do. Pass package names or --wave N.');
    process.exit(1);
  }

  console.log(`${targets.length} package(s)${commit ? ', committing' : ''}:\n`);

  const problems = [];

  targets.forEach((name) => {
    if (problems.length > 0) {
      console.log(`  ${name.padEnd(42)} skipped`);

      return;
    }

    problems.push(...process1(name, { commit }));
  });

  if (problems.length > 0) {
    console.log(`\n${problems.join('\n')}`);
    process.exit(1);
  }

  console.log('\nAll clean. Review the diffs, then run the conformance suite.');
};

main();
