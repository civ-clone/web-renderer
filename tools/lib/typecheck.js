const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { checkoutPath } = require('./paths');
const { binary, cleanMappedConfig, mappedConfig } = require('./publish');

// Compile every checkout, because a package cannot verify a change it is the
// base class of.
//
// `core-data-object@0.1.14` added one *required* static to `DataObject` and
// stopped 22 of the 83 checkouts typechecking. Nothing in `core-data-object`
// failed: its own tests passed either side, the publish gate ran them, the
// renderer's suites stayed green — esbuild does not typecheck — and the
// conformance checksums did not move. The defect lived entirely in two call
// sites in *other* packages, which annotate `typeof X` where a
// `ConstructorRegistry` hands out `IConstructor<X>`.
//
// Every other gate here is per-package, so none of them could see it. This one
// can, and it costs about a minute. Run it after changing anything in
// `core-data-object`, `core-registry` or `core-rule` — the packages whose types
// everything else's source is checked against, since these packages ship `.ts`
// beside their `.js` and TypeScript resolves the `.ts` first.
//
// Each package is compiled against the renderer's installed tree rather than its
// own, for the reason `stage3.js` gives: a per-package install of 300 transitive
// dependencies' *source* is enormous, and the renderer is the one place
// everything already resolves.
const KNOWN_FAILING = {
  'base-unit-action-capture-city':
    "TS1023 on core-data-object's `PlainObject`, whose index signature is a " +
    'union. That needs TypeScript 4.4; this package pins an older one. ' +
    'Predates the serialisation work — verified against 0.1.13.',
  'core-civ-client': 'Same TS1023 as base-unit-action-capture-city.',
  'core-unit-transport':
    'TS2742: the inferred type of `Transport` cannot be named without a ' +
    'reference to a nested path. Predates the serialisation work — verified ' +
    'against 0.1.13.',
};

const compile = (name) => {
  const dir = checkoutPath(name);

  if (!fs.existsSync(path.join(dir, 'tsconfig.json'))) {
    return { name, skipped: 'no tsconfig' };
  }

  const config = mappedConfig(dir);

  try {
    execFileSync(binary(dir, 'tsc'), ['--build', config, '--force'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    return { name };
  } catch (error) {
    const text = (error.stdout || '') + (error.stderr || '') || error.message;

    return {
      name,
      failure: text
        .split('\n')
        .filter((line) => /error TS/.test(line))
        .slice(0, 3)
        .join('\n'),
    };
  } finally {
    cleanMappedConfig(dir);

    // A `--force` rebuild rewrites every `.js`/`.d.ts`/`.js.map` in the
    // checkout, and without a formatting pass they differ from the committed
    // copies. Leaving 80 checkouts dirty is its own kind of damage — the stage
    // drivers refuse to run against a modified tree — so put them back. This is
    // a read-only check and must leave no trace.
    try {
      execFileSync('git', ['checkout', '--', '.'], { cwd: dir, stdio: 'pipe' });
    } catch (error) {}
  }
};

const run = (args) => {
  const named = args.filter((arg) => !arg.startsWith('--'));
  const root = path.dirname(checkoutPath('x'));
  const names =
    named.length > 0
      ? named
      : fs
          .readdirSync(root, { withFileTypes: true })
          .filter(
            (entry) => entry.isDirectory() && entry.name !== 'web-renderer'
          )
          .map((entry) => entry.name)
          .sort();

  // Refuse rather than silently revert someone's work: the `finally` above
  // restores the checkout, which is safe for a tree this tool dirtied and
  // destructive for one that was already dirty.
  const dirty = names.filter((name) => {
    try {
      return (
        execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
          cwd: checkoutPath(name),
          encoding: 'utf8',
        }).trim() !== ''
      );
    } catch (error) {
      return false;
    }
  });

  if (dirty.length > 0) {
    console.log(
      `refusing to run: ${dirty.length} checkout(s) have modified tracked ` +
        `files, and this rebuilds and then restores each one.\n  ${dirty.join(
          '\n  '
        )}\n\nCommit or stash them first.`
    );
    process.exitCode = 1;

    return;
  }

  const results = names.map(compile);
  const failures = results.filter(({ failure }) => failure);
  const unexpected = failures.filter(({ name }) => !KNOWN_FAILING[name]);
  const expected = failures.filter(({ name }) => KNOWN_FAILING[name]);
  const skipped = results.filter(({ skipped: reason }) => reason);

  console.log(
    `${results.length - skipped.length} checkout(s) compiled, ` +
      `${unexpected.length} unexpected failure(s)`
  );

  unexpected.forEach(({ name, failure }) =>
    console.log(`\n${name}:\n${failure}`)
  );

  if (expected.length > 0) {
    console.log('\nknown failing, and pre-existing:');
    expected.forEach(({ name }) =>
      console.log(`  ! ${name} — ${KNOWN_FAILING[name]}`)
    );
  }

  // A package on the known list that has started passing should come off it,
  // for the same reason `KNOWN_FAILING_TESTS` is kept honest: a stale entry
  // hides a real failure the next time one appears here.
  const fixed = Object.keys(KNOWN_FAILING).filter(
    (name) =>
      names.includes(name) && !failures.some((failure) => failure.name === name)
  );

  if (fixed.length > 0) {
    console.log(
      `\nno longer failing — remove from KNOWN_FAILING: ${fixed.join(', ')}`
    );
  }

  if (unexpected.length > 0) {
    process.exitCode = 1;
  }
};

module.exports = { compile, run };
