const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { checkoutPath, scope, webRenderer } = require('./paths');
const { read } = require('./audit');
const { sourceFiles } = require('./scan');
const { waves } = require('./graph');
const { report: duplicateReport } = require('./duplicates');

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

// Suites that were failing before the work being published touched them, with
// the reason. A package listed here still runs its tests and still reports the
// failure — it is just not treated as a reason to refuse the publish, because
// the defect is not the publish's to fix and blocking on it would mean the
// package can never ship again.
//
// Nothing goes in here without first checking the suite fails identically at
// the commit before the change.
// Packages whose dependencies cannot be installed on this machine, so their
// compile and test steps cannot run at all. Listed with the reason, and
// reported every time — a package here is published on strictly less evidence
// than the others, and that should be visible rather than assumed.
const KNOWN_UNINSTALLABLE = {
  'simple-ai-client':
    'around twenty `github:` dependencies, each of which npm resolves with a ' +
    'nested install, recursively, until the machine gives up. It is also ' +
    'GitHub-resolved, so releasing it is a push and no tarball is built.',
};

// Empty, and worth keeping that way. `civ1-city` and `civ1-city-improvement`
// sat here through Stages 1-3 as 'shared registry state between tests'. Two of
// the three causes turned out to be that; the third was a duplicated dependency
// producing two copies of one class, which no amount of registry threading
// would have fixed. An entry here should name a cause someone has actually
// found, not a guess at one, or it outlives the defect.
// A compile error the gate is told to carry, because the package builds
// correctly with its *own* tsconfig and only fails under the scope mapping.
//
// `civ compile`/the gate map `@civ-clone/*` onto the renderer's tree so a
// package can be built against sources that are not published yet. Those paths
// are, by construction, not portable — and TypeScript refuses to write a
// declaration that names a type it can only reach that way (TS2742). For
// `core-unit-transport` the unnameable type is the inferred type of the
// `Transport` mixin, which reaches through `Unit` for half the estate.
//
// The package emits correct `.js` and `.d.ts` under its own config, which is
// what the commit holds and what npm packs. Without this the package could
// never be published again — which is how it came to ship a `TransportRegistry`
// five months older than its source.
const KNOWN_COMPILE_ERRORS = {
  'core-unit-transport': {
    // Both are the same class expression, `Transport.ts(58,14)`: TS2742
    // cannot name the inferred type through the mapped paths, and TS4094 is
    // Stage 1's doing — a class expression may not carry `private` members,
    // and `Unit`'s became `private` when `#private` was converted away.
    // Scoped to that file so any other error in the package still refuses.
    pattern: /^Transport\.ts\(\d+,\d+\): error TS(2742|4094): /,
    why:
      'TS2742/TS4094 on the `Transport` mixin under the scope mapping; the ' +
      "package's own tsconfig emits correct .js and .d.ts, which is what the " +
      'commit holds and npm packs.',
  },
};

// Packages whose own suite fails for a reason that predates the change being
// published, keyed by package with the reason. Reported on every run, never
// silently passed. Empty since civ1-wonder's Colossus test was fixed (#22).
const KNOWN_FAILING_TESTS = {};

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

// Several packages carry a `ts-mocha ./tests/*.test.ts` script from a template
// without ever having had a `tests/` directory. Reporting those as "the runner
// is not installed" reads like lost coverage; there is none to lose, and saying
// so is the difference between a problem and a fact.
const hasTests = (dir) => {
  try {
    return fs
      .readdirSync(path.join(dir, 'tests'))
      .some((file) => file.endsWith('.test.ts'));
  } catch (e) {
    return false;
  }
};

// pnpm does not hoist `@types/node`, so its directory has to be found.
const typeRoot = () => {
  const hoisted = path.join(webRenderer, 'node_modules', '@types', 'node');

  if (fs.existsSync(hoisted)) {
    return path.dirname(hoisted);
  }

  const store = path.join(webRenderer, 'node_modules', '.pnpm');
  const match = fs
    .readdirSync(store)
    .find((entry) => entry.startsWith('@types+node@'));

  return match
    ? path.join(store, match, 'node_modules', '@types')
    : path.join(webRenderer, 'node_modules', '@types');
};

const CONFIG = 'tsconfig.publish.json';

const mappedConfig = (dir) => {
  fs.writeFileSync(
    path.join(dir, CONFIG),
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          baseUrl: '.',
          paths: { '@civ-clone/*': [path.join(scope, '*')] },
          typeRoots: [typeRoot()],
          types: ['node'],
        },
      },
      null,
      2
    ) + '\n'
  );

  return CONFIG;
};

const cleanMappedConfig = (dir) => {
  fs.rmSync(path.join(dir, CONFIG), { force: true });
  fs.rmSync(path.join(dir, CONFIG.replace('.json', '.tsbuildinfo')), {
    force: true,
  });
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
      `${name}: tracked files are modified\n${git(
        dir,
        'status',
        '--short',
        '--untracked-files=no'
      )}`
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

  if (KNOWN_UNINSTALLABLE[name]) {
    skipped.push(
      `${name}: compile and tests not run — ${KNOWN_UNINSTALLABLE[name]}`
    );

    return problems;
  }

  try {
    if (hasScript(name, 'ts:compile')) {
      // `--force`, because `tsc --build` skips when its outputs are newer than
      // its inputs. A skipped compile looks exactly like a successful one, and
      // that is how five packages in this tree came to hold compiled output
      // that had never matched their source.
      //
      // The scope is mapped onto the renderer's installed tree. These packages
      // ship `.ts` beside their `.js` and TypeScript resolves the `.ts`, so a
      // compile here needs every transitive dependency's *source* — including
      // ones a package has only just declared and not installed. `paths` is
      // compile-time only, so the emitted JavaScript is unaffected. It is
      // weaker evidence than a clean per-package install would be, and the
      // conformance suite over the assembled tree is what covers the gap.
      run('tsc', ['--build', mappedConfig(dir), '--force']);
    }
  } catch (e) {
    const known = KNOWN_COMPILE_ERRORS[name];
    const errors = output(e)
      .split('\n')
      .filter((line) => / error TS\d+: /.test(line));

    // Allowed only when *every* error is the recorded one. A package with a
    // known failure still has to be told about a new one.
    if (
      known &&
      errors.length > 0 &&
      errors.every((line) => known.pattern.test(line))
    ) {
      skipped.push(
        `${name}: ts:compile reports ${errors.length} known error(s) — ${known.why}`
      );
    } else {
      problems.push(`${name}: ts:compile failed\n${output(e)}`);
    }
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
      `${name}: compiled output predates the source — ${
        stale.length
      } file(s) still use private-field helpers: ${stale
        .slice(0, 3)
        .join(', ')}`
    );
  }

  if (hasLocalChanges(dir)) {
    notes.push(
      `${name}: a forced rebuild reformats ${
        git(dir, 'status', '--porcelain', '--untracked-files=no').split('\n')
          .length
      } file(s); the commit is what gets published`
    );
  }

  cleanMappedConfig(dir);

  // Restore, so `npm publish` packs exactly what the commit and the tag hold
  // rather than the output of the check that just ran.
  git(dir, 'checkout', '--', '.');

  if (hasScript(name, 'test')) {
    if (!hasTests(dir)) {
      skipped.push(`${name}: has a test script but no tests/*.test.ts`);
    } else if (!testRunnerInstalled(dir, name)) {
      // A missing runner is detected by looking for the binary rather than by
      // reading an error, and reported as a skip — never as a pass.
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

      if (failure && KNOWN_FAILING_TESTS[name]) {
        skipped.push(
          `${name}: tests fail, known and pre-existing — ${KNOWN_FAILING_TESTS[name]}`
        );
      } else if (failure) {
        problems.push(`${name}: tests failed on four attempts\n${failure}`);
      }
    }
  }

  return problems;
};

// Read the resolution from the installed tree, not the manifest. `--pending`
// deliberately operates on packages the manifest no longer lists (a stage drops
// them once its work is done), and an absent entry meant `resolution` came back
// `undefined` — which read as "not github", so a package that has never been on
// npm was offered to `npm publish` as a new private scoped package. npm refused
// with E402; had the account carried a paid plan it would have succeeded.
const resolutionOf = (name) => {
  let real;

  try {
    real = fs.realpathSync(path.join(scope, name));
  } catch (e) {
    // Guessing here fails open in the dangerous direction: "npm" would offer a
    // package that lives only on GitHub to `npm publish` as a new private
    // scoped package.
    throw new Error(
      `${name}: not installed, so its resolution cannot be determined. ` +
        'Run `pnpm install` in web-renderer — note that a damaged tree needs ' +
        '`rm -rf node_modules` first, as pnpm reports "Already up to date" ' +
        'from its state file without checking the links exist.'
    );
  }

  if (/codeload\.github\.com/.test(real)) {
    return 'github';
  }

  // A package `civ sync` placed has no codeload path to read, because it is a
  // plain directory rather than a pnpm link — so the path alone would call
  // every new package an npm one. No `civ1-*` package is on npm; they are
  // consumed as `github:civ-clone/<name>`.
  //
  // `publishConfig.access` is the right signal because npm already requires it:
  // a brand-new scoped package without it is restricted, and publishing one
  // fails with E402 unless the account pays for private packages. So declaring
  // it is exactly the act of opting in to npm.
  const declared = (() => {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(checkoutPath(name), 'package.json'), 'utf8')
      );
    } catch (e) {
      return {};
    }
  })();

  if ((declared.publishConfig || {}).access) {
    return 'npm';
  }

  return onRegistry(name, null) ? 'npm' : 'github';
};

const localVersion = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;

// `npm version patch` commits and tags. If a later step fails — an OTP prompt,
// a dropped connection — a retry must not bump again: that would skip a version
// number and leave the previous tag pointing at something never published.
// The tag npm just wrote is the record that the bump has happened.
const alreadyBumped = (dir) =>
  git(dir, 'tag', '--points-at', 'HEAD')
    .split('\n')
    .filter(Boolean)
    .includes(`v${localVersion(dir)}`);

// `npm view` and the registry's package document are both served from a cache
// that can lag minutes behind a publish, so this is a hint and never proof.
// Asking for the exact version rather than the version list is the least stale
// of the available answers.
const onRegistry = (name, version) => {
  try {
    const output = execFileSync(
      'npm',
      [
        'view',
        version ? `@civ-clone/${name}@${version}` : `@civ-clone/${name}`,
        'version',
      ],
      { encoding: 'utf8', stdio: 'pipe' }
    ).trim();

    // A null version asks whether the package exists on npm at all.
    return version ? output === version : output !== '';
  } catch (e) {
    return false;
  }
};

// Which is why the conflict itself has to be read as success: the check above
// can say a version is absent when it is already published, and letting that
// abort a wave of twenty would leave the wave half done.
//
// But only *this* conflict. npm has a second, near-identically worded one —
// "Cannot publish over previously staged version" (E409) — which means the
// publish began and did not finish, so the version exists in the registry's
// staging area and nowhere else. Matching loosely on "cannot publish over"
// read that as success and moved on, leaving `core-civ-client@0.1.2` tagged and
// pushed but absent from npm.
const ALREADY_PUBLISHED = /previously published versions|EPUBLISHCONFLICT/i;
const STAGED = /previously staged version/i;

const release = (name, resolution, otp) => {
  const dir = checkoutPath(name);

  if (!alreadyBumped(dir)) {
    npm(dir, 'version', 'patch');
  }

  const version = localVersion(dir);

  // The 22 GitHub-resolved packages are consumed straight from the default
  // branch, so pushing is the publish. Attempting `npm publish` on them would
  // fail on a name that was never registered.
  if (resolution !== 'github' && !onRegistry(name, version)) {
    try {
      npm(dir, 'publish', ...(otp ? [`--otp=${otp}`] : []));
    } catch (e) {
      const text = (e.stdout || '') + (e.stderr || '');

      if (STAGED.test(text)) {
        throw new Error(
          `${name}@${version} is staged but not published. npm began the publish ` +
            "and did not finish it; the version exists in the registry's staging " +
            'area only. It usually clears within a few minutes — re-run then, and ' +
            'the idempotent bump means the same version is retried rather than ' +
            `skipped.\n${text}`
        );
      }

      if (!ALREADY_PUBLISHED.test(text)) {
        throw e;
      }
    }
  }

  git(dir, 'push');
  git(dir, 'push', '--tags');

  return version;
};

// A checkout with commits its remote does not have, or a version the registry
// does not have, has something to publish.
//
// This exists because the manifest reports work *remaining*: once a stage's
// codemod lands, its packages drop out of that stage's set, taking the wave
// mapping with them and leaving nothing to publish against. Asking the
// checkouts what is unpublished cannot go stale that way.
const pending = (manifest) =>
  Object.keys(manifest.packages)
    .concat(
      fs
        .readdirSync(path.dirname(checkoutPath('x')))
        .filter((name) => fs.existsSync(path.join(checkoutPath(name), '.git')))
    )
    .filter((name, i, all) => all.indexOf(name) === i)
    .filter((name) => {
      const dir = checkoutPath(name);

      if (!fs.existsSync(path.join(dir, '.git')) || name === 'web-renderer') {
        return false;
      }

      try {
        // No upstream at all means it has never been pushed — a package a stage
        // introduced. `stdio` is piped so git's "no upstream configured" does
        // not print as if it were an error.
        execFileSync(
          'git',
          ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
          { cwd: dir, encoding: 'utf8', stdio: 'pipe' }
        );
      } catch (e) {
        return true;
      }

      if (git(dir, 'log', '--oneline', '@{u}..HEAD') !== '') {
        return true;
      }

      const details = manifest.packages[name];

      try {
        return resolutionOf(name) !== 'github'
          ? !onRegistry(name, localVersion(dir))
          : false;
      } catch (e) {
        // Not installed: nothing this stage published, so nothing to publish.
        return false;
      }
    })
    .sort();

const run = (args) => {
  const manifest = read();
  const waveIndex = args.indexOf('--wave');

  if (args.includes('--pending')) {
    return runPending(manifest, args);
  }

  if (waveIndex === -1) {
    throw new Error('civ publish requires --wave N or --pending');
  }

  const wave = Number(args[waveIndex + 1]);
  const stageIndex = args.indexOf('--stage');
  const stage = stageIndex === -1 ? 1 : Number(args[stageIndex + 1]);
  const dryRun = args.includes('--dry-run');
  const otpIndex = args.indexOf('--otp');
  const otp = otpIndex === -1 ? null : args[otpIndex + 1];
  const packages = Object.entries(manifest.packages)
    .filter(
      ([, details]) =>
        details.stages.includes(stage) && (details.waves || {})[stage] === wave
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
    `wave ${wave}, stage ${stage}: ${packages
      .map((entry) => entry.name)
      .join(', ')}\n`
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
      `  ${entry.name.padEnd(42)} ${found.length === 0 ? 'ok' : 'FAILED'}${
        stray.length ? `  (untracked: ${stray.join(', ')})` : ''
      }`
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
    console.log('\n--dry-run: what a real run would do');
    packages.forEach((entry) => {
      // The live checkout, not the manifest: a previous attempt may have
      // already bumped, and reporting the recorded version would say a package
      // is about to move to a version it is already on.
      const dir = checkoutPath(entry.name);
      const version = localVersion(dir);
      const bumped = alreadyBumped(dir);
      const published =
        entry.resolution !== 'github' && onRegistry(entry.name, version);

      console.log(
        `  ${entry.name.padEnd(42)} ${
          bumped ? `${version} already bumped` : `${version} → patch`
        }, ${
          published
            ? 'already on the registry'
            : entry.resolution === 'github'
            ? 'git push only'
            : 'npm publish'
        }`
      );
    });

    return;
  }

  const npmPackages = packages.filter(
    (entry) => entry.resolution !== 'github'
  ).length;

  // An npm one-time password is a 30-second TOTP window. It cannot cover a wave
  // of twenty publishes, so say so rather than failing halfway through.
  if (npmPackages > 1 && otp) {
    console.log(
      `\nnote: one OTP for ${npmPackages} npm publishes will expire part-way. An\n` +
        '      automation token (npm token create) or 2FA set to authorisation-only\n' +
        '      is what lets a wave run unattended.\n'
    );
  }

  packages.forEach((entry) => {
    const version = release(entry.name, entry.resolution, otp);

    console.log(`  ${entry.name.padEnd(42)} published ${version}`);
  });

  console.log(
    "\nNext: `pnpm update '@civ-clone/*'` in web-renderer, run the conformance " +
      'suite, smoke test, then commit pnpm-lock.yaml.'
  );
};

// Publish everything outstanding, in dependency order, without needing a stage
// or a wave number.
const runPending = (manifest, args) => {
  const dryRun = args.includes('--dry-run');
  const otpIndex = args.indexOf('--otp');
  const otp = otpIndex === -1 ? null : args[otpIndex + 1];

  // Before anything else, because `resolutionOf` reads this tree to decide
  // whether a package goes to npm or to a git push, and two copies of one
  // package means it may read the wrong one. A duplicated tree also invalidates
  // the conformance run this wave is verified against: `instanceof` across two
  // copies of a class is false, so the suite can pass or fail for reasons that
  // have nothing to do with the change.
  const duplicates = duplicateReport('web-renderer', webRenderer);

  if (duplicates.duplicated.length > 0) {
    console.log(
      `refusing to publish: ${duplicates.duplicated.length} package(s) are ` +
        'installed more than once in web-renderer.\n' +
        duplicates.duplicated
          .map(
            ({ name, copies }) =>
              `  ${name}\n` +
              copies
                .map(({ entry, links }) => `    ${links} link(s)  ${entry}`)
                .join('\n')
          )
          .join('\n') +
        '\n\nRun `civ duplicates` for what causes this and how to clear it.'
    );

    process.exitCode = 1;

    return;
  }

  const names = pending(manifest);

  if (names.length === 0) {
    console.log('Nothing pending.');

    return;
  }

  // Scoped to what is about to be published, and before any of it is. A rule
  // registered inside an `Effect` is a closure no save can carry, and once
  // published it reaches every consumer on the next patch — see `civ lint`.
  const lintHits = names
    .filter((name) => fs.existsSync(checkoutPath(name)))
    .flatMap((name) => {
      const { findings, sourcesIn } = require('./lint');

      return sourcesIn(checkoutPath(name)).flatMap((file) =>
        findings(file).map(
          ({ line, text }) =>
            `  ${name}/${path.relative(
              checkoutPath(name),
              file
            )}:${line}  ${text}`
        )
      );
    });

  if (lintHits.length > 0) {
    console.log(
      `refusing to publish: ${lintHits.length} rule(s) registered inside an ` +
        `Effect.\n${lintHits.join('\n')}\n\n` +
        'Run `civ lint` for why.'
    );

    process.exitCode = 1;

    return;
  }

  const dependenciesOf = (name) => {
    try {
      return Object.keys(
        JSON.parse(
          fs.readFileSync(path.join(checkoutPath(name), 'package.json'), 'utf8')
        ).dependencies || {}
      )
        .filter((key) => key.startsWith('@civ-clone/'))
        .map((key) => key.slice('@civ-clone/'.length));
    } catch (e) {
      return [];
    }
  };
  const { wave } = waves(names, dependenciesOf);
  const byWave = {};

  names.forEach((name) => {
    (byWave[wave.get(name)] = byWave[wave.get(name)] || []).push(name);
  });

  console.log(
    `${names.length} package(s) pending across ${
      Object.keys(byWave).length
    } wave(s)\n`
  );

  const problems = [];
  const skipped = [];
  const notes = [];

  Object.keys(byWave)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((index) => {
      console.log(`wave ${index}: ${byWave[index].join(', ')}`);

      byWave[index].forEach((name) => {
        if (problems.length > 0) {
          console.log(`  ${name.padEnd(38)} skipped`);

          return;
        }

        const found = verify(name, skipped, notes);

        if (found.length > 0) {
          console.log(`  ${name.padEnd(38)} FAILED`);
          problems.push(...found);

          return;
        }

        if (dryRun) {
          const dir = checkoutPath(name);

          console.log(
            `  ${name.padEnd(38)} ${localVersion(dir)}${
              alreadyBumped(dir) ? ' already bumped' : ' → patch'
            }, ${
              resolutionOf(name) === 'github' ? 'git push only' : 'npm publish'
            }`
          );

          return;
        }

        const version = release(name, resolutionOf(name), otp);

        console.log(`  ${name.padEnd(38)} published ${version}`);
      });
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
    console.log(`\n${problems.join('\n')}`);
    process.exitCode = 1;
  }
};

// `mappedConfig`/`cleanMappedConfig`/`binary` are exported for the stage
// drivers. `stage3.js` predates this and carries its own copy; `stage4.js`
// onwards should use these, so there are two rather than one per stage.
module.exports = {
  binary,
  cleanMappedConfig,
  defaultBranch,
  mappedConfig,
  pending,
  run,
  verify,
};
