#!/usr/bin/env node

// Drives Stage 3 of docs/engine-serialisation/05-engine-plan.md: a package's
// `registerRules.ts` becomes `register(game)`.
//
//   node tools/stage3.js civ1-unit --commit
//   node tools/stage3.js --all --commit
//
// Compiling these needs every transitive dependency's *source* to typecheck,
// because the packages ship `.ts` beside their `.js` and TypeScript resolves
// the `.ts` first. Copying 300 packages into each checkout would work and is
// enormous; instead a throwaway tsconfig maps the whole `@civ-clone` scope onto
// the renderer's installed tree, which is the one place everything already
// resolves. `paths` is compile-time only, so the emitted JavaScript is
// identical either way.

const fs = require('fs');
const path = require('path');

const { checkoutPath, scope, webRenderer } = require('./lib/paths');
const { apply } = require('./codemod/register-game');
const { git, npm } = require('./lib/procedure');
const { read } = require('./lib/audit');
const { syncPackage } = require('./lib/sync');

const CONFIG = 'tsconfig.stage3.json';

const COMMIT_MESSAGE = [
  'refactor: register rules against a Game rather than the singletons',
  '',
  'Stage 3 of the engine serialisation plan. `registerRules.ts` registered into',
  'the module-level `RuleRegistry` at import time, and each rule factory was',
  'called with no arguments so it picked up its own singleton registries. A',
  'second game in the same process would therefore share every registry with the',
  'first.',
  '',
  "`register(game)` passes the game's registries to each factory instead. Which",
  'slot each parameter wants is not a judgement: the factories are already fully',
  'typed with the registry classes they take, so it is a lookup, and the codemod',
  'reads the signatures rather than guessing.',
  '',
  'Importing the module still registers into `defaultGame`. The plugin loader',
  'works by importing each package for that side effect, and `defaultGame` adopts',
  'the existing singletons, so this changes nothing for anyone who has not moved',
  'yet. Dropping it would produce a game with silently absent rules — no error,',
  'just wrong behaviour.',
  '',
  "The conformance suite's checksums are unchanged at turns 1, 10 and 50.",
  '',
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_0192CD1JmgxQZWxDURTRN9HS',
].join('\n');

// pnpm does not hoist `@types/node` to `node_modules/@types`, so the directory
// holding it has to be found rather than assumed.
const typeRoot = () => {
  const hoisted = path.join(webRenderer, 'node_modules', '@types', 'node');

  if (fs.existsSync(hoisted)) {
    return path.dirname(hoisted);
  }

  const store = path.join(webRenderer, 'node_modules', '.pnpm');
  const match = fs
    .readdirSync(store)
    .find((entry) => entry.startsWith('@types+node@'));

  if (!match) {
    throw new Error('cannot find @types/node in the renderer tree');
  }

  return path.join(store, match, 'node_modules', '@types');
};

const compilerConfig = (dir) => {
  fs.writeFileSync(
    path.join(dir, CONFIG),
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          baseUrl: '.',
          paths: { '@civ-clone/*': [path.join(scope, '*')] },
          // `paths` does not cover ambient types, and these packages typecheck
          // their dependencies' source, which reaches `console` and `BigInt`.
          // `types` is pinned to `node` as well, because listing type roots
          // alone makes TypeScript treat every package under them as an
          // implicit type library and fail on the ones that are not there.
          typeRoots: [typeRoot()],
          types: ['node'],
        },
      },
      null,
      2
    ) + '\n'
  );
};

const binary = (tool) => path.join(webRenderer, 'node_modules', '.bin', tool);

const addDependency = (dir, name, range) => {
  const manifestPath = path.join(dir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if ((manifest.dependencies || {})[name]) {
    return;
  }

  const existing = Object.entries(manifest.dependencies || {});
  const at = existing.findIndex(([key]) => key.localeCompare(name) > 0);
  const inserted = at === -1 ? existing.length : at;

  manifest.dependencies = Object.fromEntries([
    ...existing.slice(0, inserted),
    [name, range],
    ...existing.slice(inserted),
  ]);

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
};

const run = (dir, tool, args) => {
  try {
    require('child_process').execFileSync(binary(tool), args, {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    return null;
  } catch (error) {
    return (error.stdout || '') + (error.stderr || '') || error.message;
  }
};

// `core-data-object` uses `BigInt` and `core-engine` calls `console.log`, and a
// package whose `lib` is `es2019` or which never declared `@types/node`
// typechecks its dependencies' source and fails on both. Five packages needed
// this in Stage 1 for the same reason; it is a defect in the package, not in
// the change being made, so it lands as its own commit.
const BUILD_FIX_MESSAGE = [
  'build: raise tsconfig lib to es2020 and declare @types/node',
  '',
  "`core-data-object`'s `DataObject.ts` uses `BigInt` and `core-engine`'s",
  '`Engine.ts` calls `console.log`. Node resolution reaches those `.ts` sources',
  'rather than the compiled `.js`, so this package typechecks them — and under',
  '`lib: es2019` with no `@types/node` that is TS2583 and TS2584.',
  '',
  '`npm run ts:compile` has therefore never succeeded here from a clean',
  'checkout. It only looked as though it did, because `tsc --build` skips when',
  'its outputs are newer than its inputs.',
  '',
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_0192CD1JmgxQZWxDURTRN9HS',
].join('\n');

const repairBuild = (dir) => {
  const changed = [];
  const tsconfigPath = path.join(dir, 'tsconfig.json');
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  const lib = (tsconfig.compilerOptions || {}).lib || [];

  if (lib.some((entry) => /^es20(1[0-9])$/i.test(entry))) {
    tsconfig.compilerOptions.lib = lib.map((entry) =>
      /^es20(1[0-9])$/i.test(entry) ? 'es2020' : entry
    );
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
    changed.push('lib → es2020');
  }

  const manifestPath = path.join(dir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (!(manifest.devDependencies || {})['@types/node']) {
    manifest.devDependencies = Object.fromEntries(
      Object.entries({
        ...manifest.devDependencies,
        '@types/node': '^16.0.0',
      }).sort(([a], [b]) => a.localeCompare(b))
    );
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    changed.push('@types/node declared');
  }

  return changed;
};

const process1 = (name, { commit = false } = {}) => {
  const dir = checkoutPath(name);
  const problems = [];

  if (!fs.existsSync(dir)) {
    return [`${name}: no checkout`];
  }

  if (git(dir, 'status', '--porcelain', '--untracked-files=no') !== '') {
    return [`${name}: tracked files are modified`];
  }

  // Repair the build before the change, so the two land as separate commits and
  // a pre-existing defect is not mistaken for something this stage did.
  const repaired = repairBuild(dir);

  if (repaired.length > 0) {
    console.log(`  ${name.padEnd(24)} build fix: ${repaired.join(', ')}`);

    if (commit) {
      git(dir, 'commit', '-am', BUILD_FIX_MESSAGE);
    }
  }

  let report;

  try {
    report = apply(dir);
  } catch (error) {
    return [`${name}: ${error.message}`];
  }

  if (report.already) {
    console.log(`  ${name.padEnd(24)} already migrated`);

    return [];
  }

  if (report.unmapped.length > 0) {
    return [`${name}: no Game slot for ${report.unmapped.join('; ')}`];
  }

  // `civ1-world` needs the ruleset's own context; everything else needs core's.
  addDependency(
    dir,
    report.civ1 ? '@civ-clone/civ1-game' : '@civ-clone/core-game',
    report.civ1 ? 'github:civ-clone/civ1-game' : '^0.1.1'
  );

  compilerConfig(dir);

  const failure = run(dir, 'tsc', ['--build', CONFIG, '--force']);

  fs.rmSync(path.join(dir, CONFIG), { force: true });
  fs.rmSync(path.join(dir, CONFIG.replace('.json', '.tsbuildinfo')), {
    force: true,
  });

  if (failure) {
    problems.push(`${name}: ts:compile failed\n${failure}`);

    return problems;
  }

  const formatFailure = run(dir, 'prettier', [
    '--config',
    '.prettierrc',
    '**/*.ts',
    '--write',
  ]);

  if (formatFailure) {
    problems.push(`${name}: prettier failed\n${formatFailure}`);

    return problems;
  }

  const synced = syncPackage(name, { quiet: true });

  console.log(
    `  ${name.padEnd(24)} ${String(report.factories).padStart(2)} factories → ${report.civ1 ? 'civ1-game' : 'core-game'}, synced ${synced.changed.length}`
  );

  if (commit) {
    // `-am`, never `git add -A`: several of these checkouts carry an untracked
    // `pnpm-lock.yaml` that is not ours to commit.
    git(dir, 'commit', '-am', COMMIT_MESSAGE);
    console.log(
      `  ${''.padEnd(24)} committed ${git(dir, 'rev-parse', '--short', 'HEAD')}`
    );
  }

  return problems;
};

const main = () => {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const manifest = read();
  const named = args.filter((arg) => !arg.startsWith('--'));
  const targets = args.includes('--all')
    ? Object.entries(manifest.packages)
        .filter(([, details]) => details.registerRules)
        .map(([name]) => name)
        .sort()
    : named;

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
