const fs = require('fs');
const path = require('path');

const { checkoutPath, scope } = require('./paths');

// A green suite proves nothing about code that is not in the tree.
//
// `civ duplicates` catches the tree holding two copies of a package. It does not
// catch the tree holding an *old* copy and no new one, which is the quieter
// failure and the more misleading: everything passes, and the thing you changed
// was never loaded.
//
// Stage 3 was declared verified on that basis. The renderer's lockfile pinned
// `core-turn-based-game@0.1.6` and `civ1-player@0.1.1` — the commits
// immediately before each `registerEvents` change — because the post-wave step
// was `pnpm update '@civ-clone/*'`, which re-resolves only what it names. Every
// conformance, hydration and isolation run cited as evidence for that stage used
// the pre-change copies of exactly the two packages the stage's second half
// touched.
//
// Version is the comparison rather than the commit because publishing always
// bumps it: `npm version patch` runs for GitHub-resolved packages too, so a
// checkout ahead of the installed copy shows up as a version difference whether
// it is served from npm or from a tarball. A checkout *behind* the installed
// copy is reported too — it means someone else published and this checkout has
// not pulled.
const versionOf = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      .version;
  } catch (e) {
    return null;
  }
};

// `0.1.9 < 0.1.10` is false as strings, and these packages are well past .9.
const order = (a, b) => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

const compare = (names) =>
  names
    .map((name) => {
      const installed = versionOf(path.join(scope, name));
      const checkout = versionOf(checkoutPath(name));

      return { name, installed, checkout };
    })
    .filter(({ installed, checkout }) => installed && checkout)
    .filter(({ installed, checkout }) => installed !== checkout);

// Not the manifest. `civ audit` records work *remaining* per stage, so packages
// drop out of it as each stage lands — it currently lists eighteen of the
// eighty-four checkouts, and defaulting to it would silently check a fifth of
// the tree while reporting success. Ask the workspace instead, the same reason
// `civ publish --pending` derives its waves from checkout state.
const everyCheckout = () => {
  const root = path.dirname(checkoutPath('x'));

  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => versionOf(checkoutPath(name)));
  } catch (e) {
    return [];
  }
};

const run = (args) => {
  const named = args.filter((arg) => !arg.startsWith('--'));
  const names = named.length > 0 ? named : everyCheckout();
  const drifted = compare(names);
  const checked = names.filter(
    (name) => versionOf(path.join(scope, name)) && versionOf(checkoutPath(name))
  ).length;

  if (checked === 0) {
    console.log(
      'Nothing to compare: no package is both installed and checked out.'
    );

    return;
  }

  if (drifted.length === 0) {
    console.log(
      `${checked} package(s) compared — every installed copy matches its checkout`
    );

    return;
  }

  console.log(
    `${drifted.length} of ${checked} package(s) differ from their checkout:\n`
  );

  drifted.forEach(({ name, installed, checkout }) =>
    console.log(
      `  ${name.padEnd(34)} installed ${installed.padEnd(
        8
      )} checkout ${checkout}`
    )
  );

  const behind = drifted.filter(
    ({ installed, checkout }) => order(checkout, installed) < 0
  );

  console.log(
    '\nA suite run against this tree does not exercise the difference. If the\n' +
      'checkout is ahead, either the package is not published yet (`civ publish\n' +
      '--pending`) or the lockfile has not picked it up — and `pnpm update` will\n' +
      'not, it re-resolves only what it names:\n\n' +
      '  rm -rf node_modules pnpm-lock.yaml && pnpm install \\\n' +
      '    --config.confirmModulesPurge=false --config.minimumReleaseAge=0 \\\n' +
      '    --config.blockExoticSubdeps=false\n' +
      (behind.length > 0
        ? `\n${behind.length} checkout(s) are BEHIND the installed copy — someone ` +
          'published\nfrom elsewhere. `git pull` those before changing them.\n'
        : '')
  );

  process.exitCode = 1;
};

module.exports = { compare, run };
