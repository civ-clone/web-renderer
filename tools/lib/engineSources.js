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
// So this plugin takes the `.ts` wherever an engine package has one beside the `.js` esbuild chose.
const ENGINE = /[\\/]@civ-clone[\\/]/,
  INSTALLED = /[\\/]node_modules[\\/]/,
  // A marker on the plugin's own nested `build.resolve`, so it isn't asked the same question again.
  NESTED = Symbol('engineSources');

const engineSources = () => ({
  name: 'engine-sources',
  setup(build) {
    const sources = new Map();

    const sourceOf = (compiled) => {
      if (!sources.has(compiled)) {
        const source = `${compiled.slice(0, -3)}.ts`;

        sources.set(compiled, fs.existsSync(source) ? source : null);
      }

      return sources.get(compiled);
    };

    build.onResolve({ filter: /.*/ }, async (args) => {
      if (
        args.pluginData?.[NESTED] ||
        !(
          args.path.startsWith('@civ-clone/') ||
          (args.path.startsWith('.') && ENGINE.test(args.resolveDir))
        )
      ) {
        return;
      }

      const resolved = await build.resolve(args.path, {
        importer: args.importer,
        kind: args.kind,
        namespace: args.namespace,
        pluginData: { [NESTED]: true },
        resolveDir: args.resolveDir,
      });

      if (
        resolved.errors.length > 0 ||
        resolved.external ||
        !resolved.path.endsWith('.js') ||
        !INSTALLED.test(resolved.path) ||
        !ENGINE.test(resolved.path)
      ) {
        return;
      }

      const source = sourceOf(resolved.path);

      if (source === null) {
        return;
      }

      return {
        namespace: resolved.namespace,
        path: source,
        sideEffects: resolved.sideEffects,
        suffix: resolved.suffix,
      };
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
