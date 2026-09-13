const fs = require('fs');
const path = require('path');

const { checkoutPath, webRenderer } = require('./paths');

// Two copies of one package is not a version conflict that something reports.
// It is silent, and it breaks `instanceof`.
//
// pnpm satisfies every spec it is given. Ask for `github:civ-clone/x` in one
// place and `^0.1.0` in another — which is what happens when a package declares
// a `github:` spec for something a published dependency ranges on — and both
// are installed. The two copies can hold byte-identical code, as
// `base-city-yield-population-support-food@0.1.1` did in `civ1-city`, and still
// produce two distinct class objects, because the module graph loads each one
// separately. `Rules/City/cost.ts` built its yields from one copy and the tests
// compared them with `instanceof` against the other; five tests failed with
// `undefined` yields and `-0` totals, and nothing anywhere said "duplicate".
//
// The second way in is a partial update. `pnpm update <a> <b>` re-resolves only
// what it is named and leaves every other parent pinned to what the lockfile
// already had, so the renderer accumulated three `civ1-city` tarballs — one per
// stage that published it — and two `core-strategy` versions. Only
// `rm -rf node_modules pnpm-lock.yaml` and a full install clears that.
//
// So: check, rather than trust. Run it after any install, and before believing
// a conformance run.
const STORE_ENTRY = /[/\\]\.pnpm[/\\]([^/\\]+)/;

// The store directory name, which encodes the version or the tarball hash, is
// the identity that matters — not the `package.json` version, which is equal
// across the copies in exactly the case this exists to catch.
const storeEntryOf = (link) => {
  let real;

  try {
    real = fs.realpathSync(link);
  } catch (e) {
    return null;
  }

  const match = real.match(STORE_ENTRY);

  // A directory `civ sync` placed, or a plain `npm install` tree, has no store
  // path. Fall back to the real path so two such copies still differ.
  return match ? match[1] : real;
};

// Every `@civ-clone/<name>` directory anywhere in the tree, including the
// nested ones pnpm creates under `.pnpm/<parent>/node_modules`, because that is
// where a second copy hides: the top level looks correct while a dependency
// resolves to something else.
const linksIn = (root) => {
  const scopes = [path.join(root, 'node_modules', '@civ-clone')];
  const pnpmDir = path.join(root, 'node_modules', '.pnpm');

  try {
    fs.readdirSync(pnpmDir).forEach((entry) =>
      scopes.push(path.join(pnpmDir, entry, 'node_modules', '@civ-clone'))
    );
  } catch (e) {}

  const found = new Map();

  scopes.forEach((dir) => {
    let names;

    try {
      names = fs.readdirSync(dir);
    } catch (e) {
      return;
    }

    names.forEach((name) => {
      const entry = storeEntryOf(path.join(dir, name));

      if (entry === null) {
        return;
      }

      if (!found.has(name)) {
        found.set(name, new Map());
      }

      const entries = found.get(name);

      entries.set(entry, (entries.get(entry) ?? 0) + 1);
    });
  });

  return found;
};

const report = (label, root) => {
  const found = linksIn(root);

  if (found.size === 0) {
    return { label, checked: 0, duplicated: [] };
  }

  const duplicated = [...found.entries()]
    .filter(([, entries]) => entries.size > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, entries]) => ({
      name,
      copies: [...entries.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([entry, links]) => ({ entry, links })),
    }));

  return { label, checked: found.size, duplicated };
};

const run = (args) => {
  const targets =
    args.length > 0
      ? args.map((name) => ({ label: name, root: checkoutPath(name) }))
      : [{ label: 'web-renderer', root: webRenderer }];

  let failed = false;

  targets.forEach(({ label, root }) => {
    const { checked, duplicated } = report(label, root);

    if (checked === 0) {
      console.log(
        `${label}: no @civ-clone packages installed — nothing checked`
      );

      return;
    }

    if (duplicated.length === 0) {
      console.log(`${label}: ${checked} package(s), one copy each`);

      return;
    }

    failed = true;

    console.log(
      `${label}: ${duplicated.length} of ${checked} package(s) installed more than once`
    );

    duplicated.forEach(({ name, copies }) => {
      console.log(`  ${name}`);
      copies.forEach(({ entry, links }) =>
        console.log(`    ${String(links).padStart(3)} link(s)  ${entry}`)
      );
    });

    console.log(
      '\nEvery copy is a separate module, so a class from one is not ' +
        '`instanceof` the\nsame class from another. Two causes, two fixes:\n' +
        '  - a `github:` spec for something a published dependency ranges on:\n' +
        '    change the spec to `^0.1.0` in the package that declares it.\n' +
        '  - a partial `pnpm update`: `rm -rf node_modules pnpm-lock.yaml` and\n' +
        '    install again. `pnpm update` alone will not clear it.'
    );
  });

  if (failed) {
    process.exitCode = 1;
  }
};

module.exports = { linksIn, report, run };
