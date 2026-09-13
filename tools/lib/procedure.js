// The per-package procedure from 04-package-workflow.md, shared by the stage
// drivers. Every guard here was earned from a way a stage went wrong; the
// comments say which, because each one reads like paranoia until it fires.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { checkoutPath, webRenderer } = require('./paths');

// Compile before formatting: `prettier:format` globs `**/*.ts`, which includes
// the generated `.d.ts`, and the committed ones are prettier-formatted. The
// reverse order leaves every declaration file reformatted in the diff.
//
// `--force` because `tsc --build` skips when its outputs are newer than its
// inputs, and a skipped compile is indistinguishable from a successful one.
const SCRIPTS = [
  ['ts:compile', ['run', 'ts:compile', '--', '--force']],
  ['prettier:format', ['run', 'prettier:format']],
  ['test', ['run', 'test']],
];

const npm = (dir, ...args) =>
  execFileSync('npm', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });

const git = (dir, ...args) =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

const output = (error) =>
  (error.stdout || '') + (error.stderr || '') || error.message;

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

// Five packages declare a `ts-mocha` test script without listing `ts-mocha` in
// devDependencies, so their suites have never been runnable. Detect that by
// looking for the binary rather than by reading an error, and never let it
// count as a pass.
const testRunner = (dir) => {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
        .scripts || {}
    ).test
      .trim()
      .split(/\s+/)[0];
  } catch (e) {
    return null;
  }
};

const testRunnerInstalled = (dir) => {
  const tool = testRunner(dir);

  return (
    Boolean(tool) && fs.existsSync(path.join(dir, 'node_modules', '.bin', tool))
  );
};

const step = (label, work) => {
  try {
    work();

    return null;
  } catch (error) {
    return `${label}: ${output(error)}`;
  }
};

const install = (dir) => {
  if (fs.existsSync(path.join(dir, 'node_modules'))) {
    return null;
  }

  // `ci` first, so the checkout's `package-lock.json` is not modified and
  // cannot end up in the commit. Some lockfiles pin versions no longer on the
  // registry (`base-unit-action-sleep` wants
  // `base-unit-action-build-railroad@0.1.0`, which was unpublished), so fall
  // back to a resolving install that ignores the lockfile entirely.
  //
  // `--ignore-scripts` so a package with a native dependency still installs:
  // `civ1-earth-generator` pulls in `canvas`, whose node-gyp build wants pixman.
  const flags = ['--ignore-scripts', '--no-audit', '--no-fund'];
  const hasLock = fs.existsSync(path.join(dir, 'package-lock.json'));
  const failure = hasLock ? step('npm ci', () => npm(dir, 'ci', ...flags)) : null;

  if (!failure && hasLock) {
    return null;
  }

  return step('npm install', () =>
    npm(dir, 'install', '--no-package-lock', ...flags)
  );
};

// `simple-ai-client` cannot be installed at all — ~20 `github:` dependencies,
// each spawning a nested install, recursively — so its `node_modules` is
// symlinked to the renderer's. Fall back to the renderer's toolchain rather
// than reporting a package that is in fact fine.
const binary = (dir, tool) => {
  const local = path.join(dir, 'node_modules', '.bin', tool);

  return fs.existsSync(local)
    ? local
    : path.join(webRenderer, 'node_modules', '.bin', tool);
};

const runScripts = (dir, { retryTests = true } = {}) =>
  SCRIPTS.map(([label, argv]) => {
    if (!hasScript(dir, label)) {
      return { label, skipped: 'no script' };
    }

    if (label === 'test') {
      if (!testRunnerInstalled(dir)) {
        return { label, skipped: `${testRunner(dir)} is not installed` };
      }

      let failure = null;

      // `core-strategy`'s suite is flaky by construction: its registry breaks
      // priority ties with a random draw and the test assumes an order.
      for (let attempt = 0; attempt < (retryTests ? 4 : 1); attempt += 1) {
        failure = step(label, () => npm(dir, ...argv));

        if (!failure) {
          return { label };
        }
      }

      return { label, failure };
    }

    // Use the package's own tsc and prettier where it has them, the renderer's
    // otherwise, and bypass `npm run` so the fallback is possible.
    const tool = label === 'ts:compile' ? 'tsc' : 'prettier';
    const args =
      label === 'ts:compile'
        ? ['--build', 'tsconfig.json', '--force']
        : ['--config', '.prettierrc', '**/*.ts', '--write'];

    return {
      label,
      failure: step(label, () =>
        execFileSync(binary(dir, tool), args, {
          cwd: dir,
          encoding: 'utf8',
          stdio: 'pipe',
        })
      ),
    };
  });

const isClean = (dir) =>
  git(dir, 'status', '--porcelain', '--untracked-files=no') === '';

const defaultBranch = (dir) => {
  try {
    return git(dir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
      .split('/')
      .pop();
  } catch (e) {
    return git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  }
};

/**
 * Run one package through the procedure: install, record what was already
 * broken, apply `transform`, then compile, format and test.
 *
 * Returning what was already failing is the point. A package that could not
 * build before the change is not this stage's to fix, and treating it as a
 * regression stops the stage dead; treating it as fine hides the fact that its
 * commit now holds compiled output built from nothing.
 */
const perPackage = (
  name,
  transform,
  { commitMessage = null, prepare = null } = {}
) => {
  const dir = checkoutPath(name);
  const result = { name, problems: [], notes: [], changed: [] };

  if (!fs.existsSync(dir)) {
    result.problems.push(`${name}: no checkout`);

    return result;
  }

  const branch = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  const expected = defaultBranch(dir);

  if (branch !== expected) {
    result.problems.push(`${name}: on branch ${branch}, expected ${expected}`);

    return result;
  }

  if (!isClean(dir)) {
    result.problems.push(`${name}: tracked files are modified`);

    return result;
  }

  const installFailure = install(dir);

  if (installFailure) {
    result.problems.push(`${name}: ${installFailure}`);

    return result;
  }

  // After install, before the baseline: a stage that introduces a dependency
  // needs it present for the baseline compile too. Doing this before `install`
  // instead would create `node_modules` and make `install` skip, which left two
  // packages compiling against an empty dependency tree.
  if (prepare) {
    prepare(dir, name);
  }

  const before = runScripts(dir, { retryTests: false });
  const applied = transform(dir, name);

  if (applied && applied.problems && applied.problems.length > 0) {
    result.problems.push(...applied.problems);

    return result;
  }

  result.changed = (applied && applied.changed) || [];

  if (result.changed.length === 0) {
    result.notes.push(`${name}: nothing to change`);

    return result;
  }

  runScripts(dir).forEach(({ label, failure, skipped }, i) => {
    if (skipped) {
      result.notes.push(`${name}: ${label} skipped — ${skipped}`);

      return;
    }

    if (!failure) {
      return;
    }

    if (before[i].failure) {
      result.notes.push(`${name}: ${label} was already failing before the change`);

      return;
    }

    result.problems.push(`${name}: ${failure}`);
  });

  if (result.problems.length === 0 && commitMessage) {
    git(dir, 'commit', '-am', commitMessage);
    result.commit = git(dir, 'rev-parse', '--short', 'HEAD');
  }

  return result;
};

module.exports = {
  SCRIPTS,
  binary,
  defaultBranch,
  git,
  hasScript,
  install,
  isClean,
  npm,
  perPackage,
  runScripts,
  testRunner,
  testRunnerInstalled,
};
