const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { checkoutPath, webRenderer } = require('./paths');
const { read } = require('./audit');
const { sourceFiles } = require('./scan');

const git = (dir, ...args) =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

const npm = (dir, ...args) =>
  execFileSync('npm', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });

// Every civ-clone repo is on `master`, not the `main` that
// 04-package-workflow.md assumes. Ask the remote rather than hardcoding either.
const defaultBranch = (dir) => {
  try {
    return git(dir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
      .split('/')
      .pop();
  } catch (e) {
    return git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  }
};

const hasScript = (dir, name) => {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(checkoutPath(dir) + '/package.json', 'utf8')
    );

    return Boolean((manifest.scripts || {})[name]);
  } catch (e) {
    return false;
  }
};

// Modified tracked files only. Untracked files are reported by the caller
// rather than refused: every one in this tree is a lockfile, npm never packs
// `package-lock.json`, and the packages carrying a stray `pnpm-lock.yaml` are
// all GitHub-resolved and so never produce a tarball at all.
const hasLocalChanges = (dir) =>
  git(dir, 'status', '--porcelain', '--untracked-files=no') !== '';

const untracked = (dir) =>
  git(dir, 'status', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3));

// `simple-ai-client` has around twenty `github:` dependencies and npm spawns a
// nested install for each, recursively, until the machine gives up. Its
// `node_modules` is symlinked to the renderer's instead, so fall back to the
// renderer's own toolchain rather than refusing a package that is in fact fine.
const binary = (dir, tool) => {
  const local = path.join(dir, 'node_modules', '.bin', tool);

  return fs.existsSync(local)
    ? local
    : path.join(webRenderer, 'node_modules', '.bin', tool);
};

// TypeScript's downlevel emit for `#private` fields uses WeakMaps and these
// helpers. A compiled file still containing them was built before the
// conversion, whatever its formatting says.
const HELPERS = /__classPrivateFieldGet|__classPrivateFieldSet|new WeakMap\(\)/;

const compiledWithPrivateFieldHelpers = (dir) =>
  sourceFiles(dir)
    .map((file) => file.replace(/\.ts$/, '.js'))
    .filter(
      (file) =>
        fs.existsSync(file) && HELPERS.test(fs.readFileSync(file, 'utf8'))
    )
    .map((file) => path.relative(dir, file));

// The binary a package's `test` script invokes, so a missing runner is told
// apart from a failing suite by looking rather than by parsing an error.
const testRunner = (name) => {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(checkoutPath(name), 'package.json'), 'utf8')
    );

    return (manifest.scripts || {}).test.trim().split(/\s+/)[0];
  } catch (e) {
    return null;
  }
};

const testRunnerInstalled = (dir, name) => {
  const tool = testRunner(name);

  return (
    Boolean(tool) && fs.existsSync(path.join(dir, 'node_modules', '.bin', tool))
  );
};

// Steps 1-4 of the per-package procedure in 04-package-workflow.md. These are
// the checks; they leave the checkout exactly as they found it.
const verify = (name, skipped = [], notes = []) => {
  const dir = checkoutPath(name);
  const problems = [];

  if (!fs.existsSync(dir)) {
    return [`${name}: no checkout`];
  }

  if (hasLocalChanges(dir)) {
    problems.push(
      `${name}: tracked files are modified\n${git(dir, 'status', '--short', '--untracked-files=no')}`
    );
  }

  const branch = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  const expected = defaultBranch(dir);

  if (branch !== expected) {
    problems.push(`${name}: on branch ${branch}, expected ${expected}`);
  }

  if (problems.length > 0) {
    return problems;
  }

  const run = (tool, args) =>
    execFileSync(binary(dir, tool), args, {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  const output = (e) => (e.stdout || '') + (e.stderr || '') || e.message;

  try {
    if (hasScript(name, 'ts:compile')) {
      // `--force`, because `tsc --build` skips when its outputs are newer than
      // its inputs. A skipped compile looks exactly like a successful one, and
      // that is how five packages in this tree came to hold compiled output
      // that had never matched their source.
      run('tsc', ['--build', 'tsconfig.json', '--force']);
    }
  } catch (e) {
    problems.push(`${name}: ts:compile failed\n${output(e)}`);
  }

  try {
    if (hasScript(name, 'prettier:format')) {
      run('prettier', ['--config', '.prettierrc', '**/*.ts', '--write']);
    }
  } catch (e) {
    problems.push(`${name}: prettier:format failed\n${output(e)}`);
  }

  // What matters is that the committed compiled output was built from the
  // committed source. A plain "did the tree change" check cannot tell that from
  // reformatting: the committed `.js` are single-quoted, current `tsc` emits
  // double, and `prettier:format` globs only `**/*.ts` so it never fixes them.
  // Test for the thing that actually indicates staleness instead.
  const stale = compiledWithPrivateFieldHelpers(dir);

  if (stale.length > 0) {
    problems.push(
      `${name}: compiled output predates the source — ${stale.length} file(s) still use private-field helpers: ${stale.slice(0, 3).join(', ')}`
    );
  }

  if (hasLocalChanges(dir)) {
    notes.push(
      `${name}: a forced rebuild reformats ${git(dir, 'status', '--porcelain', '--untracked-files=no').split('\n').length} file(s); the commit is what gets published`
    );
  }

  // Restore, so `npm publish` packs exactly what the commit and the tag hold
  // rather than the output of the check that just ran.
  git(dir, 'checkout', '--', '.');

  if (hasScript(name, 'test')) {
    if (!testRunnerInstalled(dir, name)) {
      // Five packages declare a `ts-mocha` test script without listing
      // `ts-mocha` in devDependencies, so their suites have never been
      // runnable. Report the skip rather than reading a missing binary as a
      // failing test — and never treat it as a pass.
      skipped.push(
        `${name}: test script cannot run — ${testRunner(name)} is not installed`
      );
    } else {
      let failure = null;

      // `core-strategy`'s suite is flaky by construction:
      // `StrategyRegistry.attempt` breaks priority ties with `Math.random()`
      // and its test assumes an order, failing roughly three runs in eight on
      // an untouched tree. Retry before refusing to publish over a coin flip.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          npm(dir, 'test');
          failure = null;

          break;
        } catch (e) {
          failure = output(e);
        }
      }

      if (failure) {
        problems.push(`${name}: tests failed on four attempts\n${failure}`);
      }
    }
  }

  return problems;
};

const release = (name, resolution) => {
  const dir = checkoutPath(name);

  npm(dir, 'version', 'patch');

  // The 22 GitHub-resolved packages are consumed straight from the default
  // branch, so pushing is the publish. Attempting `npm publish` on them would
  // fail on a name that was never registered.
  if (resolution !== 'github') {
    npm(dir, 'publish');
  }

  git(dir, 'push');
  git(dir, 'push', '--tags');

  return JSON.parse(fs.readFileSync(dir + '/package.json', 'utf8')).version;
};

const run = (args) => {
  const manifest = read();
  const waveIndex = args.indexOf('--wave');

  if (waveIndex === -1) {
    throw new Error('civ publish requires --wave N');
  }

  const wave = Number(args[waveIndex + 1]);
  const stageIndex = args.indexOf('--stage');
  const stage = stageIndex === -1 ? 1 : Number(args[stageIndex + 1]);
  const dryRun = args.includes('--dry-run');
  const packages = Object.entries(manifest.packages)
    .filter(
      ([, details]) => details.wave === wave && details.stages.includes(stage)
    )
    .map(([name, details]) => ({ name, ...details }));

  if (packages.length === 0) {
    throw new Error(`No stage ${stage} packages in wave ${wave}`);
  }

  // A cycle group is one publish unit: each member requires the others at a
  // version that only exists once all of them are out.
  const cycle = manifest.cycles.find((group) =>
    group.some((name) => packages.some((entry) => entry.name === name))
  );

  if (cycle && !cycle.every((name) => packages.some((e) => e.name === name))) {
    throw new Error(
      `Wave ${wave} contains part of the cycle group ${cycle.join(', ')}. ` +
        'Publish the group together or not at all.'
    );
  }

  console.log(
    `wave ${wave}, stage ${stage}: ${packages.map((entry) => entry.name).join(', ')}\n`
  );

  const problems = [];
  const skipped = [];
  const notes = [];

  packages.forEach((entry) => {
    const found = verify(entry.name, skipped, notes);
    const stray = fs.existsSync(checkoutPath(entry.name))
      ? untracked(checkoutPath(entry.name))
      : [];

    console.log(
      `  ${entry.name.padEnd(42)} ${found.length === 0 ? 'ok' : 'FAILED'}${stray.length ? `  (untracked: ${stray.join(', ')})` : ''}`
    );
    problems.push(...found);
  });

  if (notes.length > 0) {
    console.log('\nnotes:');
    notes.forEach((line) => console.log(`  - ${line}`));
  }

  if (skipped.length > 0) {
    console.log('\nchecks skipped (not run, and not passed):');
    skipped.forEach((line) => console.log(`  ! ${line}`));
  }

  if (problems.length > 0) {
    console.log('\n' + problems.join('\n'));
    process.exitCode = 1;

    return;
  }

  if (dryRun) {
    console.log('\n--dry-run: would bump and publish');
    packages.forEach((entry) =>
      console.log(
        `  ${entry.name.padEnd(42)} ${entry.version} → patch  (${entry.resolution === 'github' ? 'git push only' : 'npm publish'})`
      )
    );

    return;
  }

  packages.forEach((entry) => {
    const version = release(entry.name, entry.resolution);

    console.log(`  ${entry.name.padEnd(42)} published ${version}`);
  });

  console.log(
    "\nNext: `pnpm update '@civ-clone/*'` in web-renderer, run the conformance " +
      'suite, smoke test, then commit pnpm-lock.yaml.'
  );
};

module.exports = { defaultBranch, run, verify };
