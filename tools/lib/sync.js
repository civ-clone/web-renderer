const fs = require('fs');
const path = require('path');

const { checkoutPath, scope } = require('./paths');
const { read } = require('./audit');
const { sourceFiles } = require('./scan');

// `buildPluginList.js` checks that each package's `main` exists and writes an
// absolute import of it into `src/js/plugins.ts`, so the entrypoint `.js` is the
// one compiled file the renderer genuinely consumes. Everything else beside a
// synced `.ts` is stale weight and gets removed.
const entrypoint = (packageDir) => {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')
    );

    return path.normalize(manifest.main || 'index.js');
  } catch (e) {
    return 'index.js';
  }
};

const installedPath = (name, root = scope) => {
  const linkPath = path.join(root, name);

  if (!fs.existsSync(linkPath)) {
    return null;
  }

  return fs.realpathSync(linkPath);
};

// `into` targets a node_modules/@civ-clone directory other than the renderer's.
// Stage 1 needs this: a package whose base class lives in another package only
// hits the `private` name collision once both are converted, and each checkout
// otherwise compiles against the published (still `#private`) dependency.
const syncPackage = (name, { quiet = false, into = scope } = {}) => {
  const from = checkoutPath(name);
  let to = installedPath(name, into);
  // The renderer's esbuild resolves `.ts` ahead of `.js`, so a compiled sibling
  // there is stale weight. A package checkout is different: its `ts-mocha` suite
  // resolves dependencies through plain node, which picks the `.js` — and Node
  // refuses to strip types from a `.ts` under `node_modules`. So carry the
  // compiled files across instead of deleting them.
  const keepCompiled = into !== scope;
  const result = { name, files: 0, changed: [], removed: 0, skipped: null };

  if (!fs.existsSync(from)) {
    result.skipped = 'no checkout';

    return result;
  }

  // A package introduced by a stage — `core-random` in Stage 2 — has no
  // installed copy to write over until it is published and depended upon. Place
  // it as a plain directory so the rest of the tree can resolve it in the
  // meantime. pnpm will replace this with a symlink at the next install.
  if (!to) {
    to = path.join(into, name);
    fs.mkdirSync(to, { recursive: true });
    result.created = true;
  }

  // A bare specifier resolves through `package.json`'s `main`, so a placed
  // package needs it and its compiled entrypoint as well as the sources.
  if (result.created) {
    ['package.json', 'index.js', 'index.d.ts'].forEach((file) => {
      if (fs.existsSync(path.join(from, file))) {
        fs.copyFileSync(path.join(from, file), path.join(to, file));
      }
    });
  }

  const main = entrypoint(to);

  sourceFiles(from).forEach((fullPath) => {
    const relative = path.relative(from, fullPath);
    const target = path.join(to, relative);
    const source = fs.readFileSync(fullPath);

    result.files += 1;

    let existing = null;

    try {
      existing = fs.readFileSync(target);
    } catch (e) {}

    if (existing && existing.equals(source)) {
      return;
    }

    if (existing) {
      // §3 of 04-package-workflow.md: with `packageImportMethod=hardlink` on a
      // filesystem without copy-on-write, writing in place would corrupt the
      // global pnpm store for every project on the machine.
      const { nlink } = fs.statSync(target);

      if (nlink > 1) {
        throw new Error(
          `${name}: ${relative} has ${nlink} hard links — refusing to write.\n` +
            'The pnpm store is shared. Set `packageImportMethod=clone` (or ' +
            '`copy`) in .npmrc and reinstall before syncing.'
        );
      }
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Write through a copy rather than editing in place, so a hard-linked file
    // that slipped past the check above is replaced rather than mutated.
    fs.rmSync(target, { force: true });
    fs.writeFileSync(target, source);
    result.changed.push(relative);

    const base = relative.replace(/\.ts$/, '');

    ['.js', '.d.ts', '.js.map'].forEach((extension) => {
      const sibling = path.join(to, base + extension);

      if (keepCompiled) {
        const compiled = path.join(from, base + extension);

        if (fs.existsSync(compiled)) {
          fs.rmSync(sibling, { force: true });
          fs.copyFileSync(compiled, sibling);
        }

        return;
      }

      if (path.normalize(base + extension) === main) {
        return;
      }

      if (fs.existsSync(sibling)) {
        fs.rmSync(sibling);
        result.removed += 1;
      }
    });
  });

  if (!quiet) {
    console.log(
      `  ${name.padEnd(42)} ${String(result.files).padStart(4)} files → node_modules  (${result.changed.length} changed${result.removed ? `, ${result.removed} stale compiled removed` : ''}${result.created ? ', directory created' : ''})`
    );
  }

  return result;
};

const run = (args) => {
  const names = args.filter((arg) => !arg.startsWith('--'));
  const manifest = read();
  const targets =
    names.length > 0
      ? names
      : Object.keys(manifest ? manifest.packages : {}).filter((name) =>
          fs.existsSync(checkoutPath(name))
        );

  if (targets.length === 0) {
    console.log('Nothing to sync.');

    return;
  }

  let changed = 0;

  targets.forEach((name) => {
    const result = syncPackage(name);

    if (result.skipped) {
      console.log(`  ${name.padEnd(42)} skipped (${result.skipped})`);

      return;
    }

    changed += result.changed.length;
  });

  console.log(`\n${targets.length} package(s), ${changed} file(s) changed`);
};

module.exports = { installedPath, run, syncPackage };
