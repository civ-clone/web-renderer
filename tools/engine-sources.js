#!/usr/bin/env node

// The game is built from the engine's TypeScript, each file once (#869). The engine's packages ship `Unit.js`
// beside `Unit.ts`, and esbuild, left to itself, takes the `.js` for anything inside `node_modules`:
// `tools/lib/engineSources.js` says what that costs and is the plugin that takes the `.ts` instead. Nothing else
// would say so if it stopped working, as the compiled file plays the same game: the bundle would only be larger,
// or hold a module twice, once from each file, with whatever that module keeps kept twice.
//
// So this bundles the worker and the page as the build does and reads what went in.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { withEngineSources } = require('./lib/engineSources');
const { webRenderer } = require('./lib/paths');

const ENGINE = /[\\/]node_modules[\\/]@civ-clone[\\/](?!ui-)/;

(async () => {
  // The worker imports the generated plugin list.
  execFileSync(process.execPath, ['buildPluginList.js'], {
    cwd: webRenderer,
    stdio: 'pipe',
  });

  const { metafile } = await require('esbuild').build(
    withEngineSources({
      absWorkingDir: webRenderer,
      entryPoints: ['src/js/backend.ts', 'src/js/frontend.ts'],
      bundle: true,
      write: false,
      metafile: true,
      outdir: path.join(webRenderer, 'dist'),
      logLevel: 'error',
      loader: {
        '.jpg': 'file',
        '.png': 'dataurl',
        '.svg': 'dataurl',
        '.woff2': 'file',
      },
      plugins: [
        {
          // `build.json` is written by the build, not the tests.
          name: 'build-json',
          setup(build) {
            build.onResolve({ filter: /\/build\.json$/ }, () => ({
              path: 'build.json',
              namespace: 'build-json',
            }));
            build.onLoad({ filter: /.*/, namespace: 'build-json' }, () => ({
              contents: '{"version": "0.0.0@test"}',
              loader: 'json',
            }));
          },
        },
      ],
    })
  );

  const inputs = Object.keys(metafile.inputs)
      // Not what a plugin made up (a `namespace:path` input): only files.
      .filter((input) => fs.existsSync(path.resolve(webRenderer, input)))
      .map((input) => path.resolve(webRenderer, input)),
    engine = inputs.filter((input) => ENGINE.test(input)),
    compiled = engine.filter(
      (input) =>
        input.endsWith('.js') && fs.existsSync(`${input.slice(0, -3)}.ts`)
    ),
    places = new Map();

  inputs.forEach((input) => {
    const real = fs.realpathSync(input);

    places.set(real, [...(places.get(real) ?? []), input]);
  });

  const twice = Array.from(places.values()).filter((paths) => paths.length > 1),
    relative = (input) => path.relative(webRenderer, input),
    failures = [
      ...(engine.some((input) => input.endsWith('.ts'))
        ? []
        : ['no engine TypeScript was bundled at all']),
      ...compiled.map(
        (input) => `${relative(input)} was bundled, not the .ts beside it`
      ),
      ...twice.map(
        (paths) => `one file bundled twice: ${paths.map(relative).join(', ')}`
      ),
    ];

  if (failures.length > 0) {
    console.error(`FAIL engine-sources\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(
    `PASS engine-sources (${engine.length} engine files in the worker and the page, each from its TypeScript and each once)`
  );
})().catch((error) => {
  console.error(error);

  process.exit(1);
});
