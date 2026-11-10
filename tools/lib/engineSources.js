const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { webRenderer } = require('./paths');

// What every esbuild build of this project is given, so the game, the suites and the tools bundle the same code.
//
// The engine's packages are published with their TypeScript beside the JavaScript compiled from it (`Unit.ts`,
// `Unit.js`), and are imported without an extension (`@civ-clone/core-unit/Unit`). esbuild used to take the `.ts`;
// since 0.18 it takes the `.js` for anything inside `node_modules`. That is CommonJS, which it can't tree-shake and
// has to wrap module by module: the worker's bundle came out two thirds larger (670 KB to 1.1 MB minified). And a
// checkout linked in by `civ sync` is outside `node_modules`, so it would still be bundled from its `.ts`: a linked
// package and an installed one would no longer be the same code.
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

// Both remembered for as long as the process runs, as one `npm test -- --for` makes a build per suite, each asking
//  the same questions: what is on the disk, and what a package's name resolves to from each place it is imported.
//  A watching build therefore doesn't notice a `.ts` that appears beside a `.js` it has already bundled.
const files = new Map(),
  named = new Map();

const isFile = (file) => {
  if (!files.has(file)) {
    let found = false;

    try {
      found = fs.statSync(file).isFile();
    } catch (e) {}

    files.set(file, found);
  }

  return files.get(file);
};

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

        const asked = path.join(args.resolveDir, args.path),
          compiled = [asked, `${asked}.js`, path.join(asked, 'index.js')].find(
            (candidate) => candidate.endsWith('.js') && isFile(candidate)
          ),
          source = compiled === undefined ? null : sourceOf(compiled);

        // With no `.js` there (a `.json`, a folder with its own package.json), esbuild finds it as it would have.
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
