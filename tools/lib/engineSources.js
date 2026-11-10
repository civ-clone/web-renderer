const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { webRenderer } = require('./paths');

// What every esbuild build here that bundles the engine is given, so the game, the suites and the tools bundle the
// same code.
//
// The engine's packages are published with their TypeScript beside the JavaScript compiled from it (`Unit.ts`,
// `Unit.js`), and are imported without an extension (`@civ-clone/core-unit/Unit`). esbuild used to take the `.ts`;
// since 0.18 it takes the `.js` for anything inside `node_modules`. That is CommonJS, which it can't tree-shake and
// has to wrap module by module: the worker's bundle came out two thirds larger (670 KB to 1.1 MB minified). And
// `civ sync` copies a checkout's TypeScript over an installed package's, removing the `.js` beside each file it
// changed: a synced package would be bundled partly from each.
//
// So this plugin takes the `.ts` wherever an installed engine package has one beside the `.js`, however the file
// was asked for: without an extension, by the package's name alone (its `main` is `index.js`), or by the full path
// the generated plugin list gives. A module reached two of those ways used to be bundled twice, once from each
// file: now there is one of it.
const ENGINE = /[\\/]@civ-clone[\\/]/,
  INSTALLED = /[\\/]node_modules[\\/]/,
  // A marker on the plugin's own nested `build.resolve`, so it isn't asked the same question again.
  NESTED = Symbol('engineSources');

const installedEngine = (file) => INSTALLED.test(file) && ENGINE.test(file);

// Both remembered while the process runs, as one `npm test -- --for` makes a build per suite, each asking the same
//  questions: what is in a folder, and what a package's name resolves to from each place it is imported. A build
//  that is run again (`npm run watch`) forgets both first, as an install in the meantime moves the packages.
const folders = new Map(),
  named = new Map();

// What a folder holds, by name: read whole, and a name matched exactly, so that on a disk that would take `foo` for
//  `Foo` (a Mac's) a file and a folder whose names differ only in case stay two things.
const entriesOf = (directory) => {
  if (!folders.has(directory)) {
    const entries = new Map();

    try {
      fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
        let kind = entry.isFile()
          ? 'file'
          : entry.isDirectory()
          ? 'folder'
          : null;

        if (entry.isSymbolicLink()) {
          try {
            const linked = fs.statSync(path.join(directory, entry.name));

            kind = linked.isFile()
              ? 'file'
              : linked.isDirectory()
              ? 'folder'
              : null;
          } catch (e) {}
        }

        entries.set(entry.name, kind);
      });
    } catch (e) {}

    folders.set(directory, entries);
  }

  return folders.get(directory);
};

const kindOf = (file) => entriesOf(path.dirname(file)).get(path.basename(file)),
  isFile = (file) => kindOf(file) === 'file',
  isFolder = (file) => kindOf(file) === 'folder';

const realPath = (file) => {
  try {
    return fs.realpathSync(file);
  } catch (e) {
    return file;
  }
};

// The `.ts` beside an installed engine package's `.js`, or `null`.
const sourceOf = (compiled) => {
  if (!compiled.endsWith('.js') || !installedEngine(compiled)) {
    return null;
  }

  const source = `${compiled.slice(0, -3)}.ts`;

  return isFile(source) ? source : null;
};

// What one file of an installed engine package means by `./other`, when that is TypeScript: as esbuild finds it, a
//  file before a folder (unless only a folder was asked for: `.`, `..`, `./rules/`), but the `.ts` before the `.js`.
//  `null` leaves it to esbuild: a `.js` with no `.ts`, a `.json`, a folder with a package.json of its own.
//
// Not allowed for, as no engine package has one: a file or folder that is a link (it would be bundled under the
//  link's path, and again under its own if it is also asked for by that). `npm run test:engine-sources` fails if a
//  file is ever in the game twice, or in it compiled.
const relativeSource = (asked, folderOnly) => {
  if (!folderOnly) {
    if (asked.endsWith('.js')) {
      const source = `${asked.slice(0, -3)}.ts`;

      return isFile(source) ? source : null;
    }

    if (isFile(`${asked}.ts`)) {
      return `${asked}.ts`;
    }

    if (isFile(`${asked}.js`)) {
      return null;
    }
  }

  if (!isFolder(asked) || isFile(path.join(asked, 'package.json'))) {
    return null;
  }

  const index = path.join(asked, 'index.ts');

  return isFile(index) ? index : null;
};

// Where pnpm keeps each package, by version, for a file in one of them: a new folder there is an install, which a
//  watching build has to hear of from here, as it watches for itself only what it found for itself.
const storeOf = (file) => {
  const marker = `${path.sep}node_modules${path.sep}.pnpm${path.sep}`,
    at = file.indexOf(marker);

  return at === -1 ? [] : [file.slice(0, at + marker.length - 1)];
};

// The folder of the installed package `directory` is in, which is where a package's name is resolved from.
const packageRoot = (directory) => {
  const marker = `${path.sep}node_modules${path.sep}`,
    at = directory.lastIndexOf(marker);

  if (at === -1) {
    return directory;
  }

  const [scope, name] = directory.slice(at + marker.length).split(path.sep);

  return path.join(
    directory.slice(0, at + marker.length),
    ...(scope.startsWith('@') ? [scope, name] : [scope])
  );
};

const engineSources = () => ({
  name: 'engine-sources',
  setup(build) {
    const options = build.initialOptions,
      // What else decides where a name leads: a build that differs in any of it keeps its own answers.
      variant = JSON.stringify([
        options.platform,
        options.external,
        options.mainFields,
        options.conditions,
        options.resolveExtensions,
        options.alias,
        options.nodePaths,
        options.packages,
        options.preserveSymlinks,
        options.tsconfig,
        options.tsconfigRaw,
        (options.plugins ?? []).map((plugin) => plugin.name),
      ]);

    let built = false;

    build.onStart(() => {
      if (built) {
        folders.clear();
        named.clear();
      }

      built = true;
    });

    build.onResolve({ filter: /.*/, namespace: 'file' }, async (args) => {
      if (args.pluginData?.[NESTED]) {
        return;
      }

      // The generated plugin list's full paths, which go through `node_modules/@civ-clone/<name>`: a link, under
      //  pnpm, to where the package is. esbuild knows a file by where it really is, and would take the same file
      //  under the link's path for another one.
      if (path.isAbsolute(args.path)) {
        const source = sourceOf(realPath(args.path));

        return source === null ? undefined : { path: source };
      }

      // One file of an installed engine package importing another, which is nearly every import there is: answered
      //  from the disk, as asking esbuild (`build.resolve`) for each made a build eight times slower.
      if (args.path.startsWith('.')) {
        if (!installedEngine(args.resolveDir)) {
          return;
        }

        const source = relativeSource(
          path.join(args.resolveDir, args.path),
          /(^|[\\/])\.{1,2}$|[\\/]$/.test(args.path)
        );

        return source === null ? undefined : { path: source };
      }

      if (!args.path.startsWith('@civ-clone/')) {
        return;
      }

      // A package's name, with or without a file in it: where that is depends on who asks, so esbuild is asked,
      //  once for each place it is asked from.
      const key = [
        args.path,
        args.kind,
        INSTALLED.test(args.resolveDir)
          ? packageRoot(args.resolveDir)
          : args.resolveDir,
        variant,
      ].join('\0');

      // The answer is remembered from the moment it is asked for, not from when it comes: the builds of one
      //  `npm test -- --for` all ask at once, and each would otherwise ask esbuild for itself.
      if (!named.has(key)) {
        named.set(
          key,
          build
            .resolve(args.path, {
              importer: args.importer,
              kind: args.kind,
              namespace: args.namespace,
              pluginData: { [NESTED]: true },
              resolveDir: args.resolveDir,
            })
            .then((resolved) => {
              // Not remembered: esbuild reports it when the plugin steps aside, and it may be there next time.
              if (resolved.errors.length > 0) {
                named.delete(key);

                return undefined;
              }

              const source = resolved.external ? null : sourceOf(resolved.path);

              return source === null
                ? undefined
                : {
                    namespace: resolved.namespace,
                    path: source,
                    sideEffects: resolved.sideEffects,
                    suffix: resolved.suffix,
                    watchDirs: storeOf(source),
                  };
            })
            // The build that asked was stopped before esbuild answered: the next one asks again.
            .catch(() => {
              named.delete(key);

              return undefined;
            })
        );
      }

      return named.get(key);
    });
  },
});

// The project's own tsconfig.json, named rather than found. esbuild looks for no tsconfig for a file inside
//  `node_modules`, and without one a class field declared with no value (`name: string;`) is defined, as
//  `undefined`, after the parent's constructor has run: a value the parent's constructor gave it is lost. Named
//  here, the file applies to the engine's TypeScript too, as its `target` (ES2018) keeps fields assigned, which is
//  what the engine's own compiler does with them.
const tsconfig = path.join(webRenderer, 'tsconfig.json');

// `options`, with both of the above.
const withEngineSources = (options) => ({
  ...options,
  tsconfig,
  plugins: [engineSources(), ...(options.plugins ?? [])],
});

// esbuild's `buildSync` runs no plugins, so a tool that bundles before it goes on has the build done by this file,
//  run as a script, and waits for it. `options` is passed as JSON: no plugins or functions of its own.
const buildSync = (options) => {
  execFileSync(process.execPath, [__filename, JSON.stringify(options)], {
    cwd: webRenderer,
    stdio: 'inherit',
  });
};

if (require.main === module) {
  require('esbuild')
    .build(withEngineSources(JSON.parse(process.argv[2])))
    .catch(() => process.exit(1));
}

module.exports = { buildSync, engineSources, tsconfig, withEngineSources };
