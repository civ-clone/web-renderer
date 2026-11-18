(async () => {
  const esbuild = require('esbuild'),
    { sassPlugin } = require('esbuild-sass-plugin'),
    { engineSources, tsconfig } = require('./tools/lib/engineSources'),
    { buildHostedSets } = require('./tools/lib/hostedSets'),
    watching = process.argv.includes('watch'),
    buildOptions = {
      entryPoints: [
        'src/css/app.scss',
        'src/js/backend.ts',
        'src/js/frontend.ts',
        // Its own file, for `audioWorklet.addModule()` (#126): dist/musicWorklet.js.
        'packages/audio/musicWorklet.ts',
        // The 3D map (docs/3d-renderer.md §2.4): dist/map3d.js, fetched the first time a game starts in 3D, so the 2D
        //  map's players never download three.js.
        'packages/map-3d/map3d.ts',
        // The 3D map's debug page's own script (docs/3d-renderer-plan.md 1.1b): dist/map3d-debug.js, which only
        //  dist/map3d-debug.html loads.
        'packages/map-3d/debug/map3d-debug.ts',
      ],
      bundle: true,
      keepNames: true,
      minify: !process.argv.includes('dev'),
      sourcemap: true,
      // Said here because esbuild no longer takes it from tsconfig.json (since 0.18), and without one it writes the
      //  newest syntax there is: anything newer than ES2022 is rewritten.
      target: 'es2022',
      // Except the one piece of ES2022 that the old build never wrote: with `keepNames`, esbuild would name every
      //  class in a static block, which Safari only has from 16.4. Without them it names a class after it is made,
      //  and to do that it rewrites the fields and private members of every named class (to WeakMaps), as the old
      //  build did for the frontend's own code.
      supported: { 'class-static-blocks': false },
      tsconfig,
      outdir: 'dist',
      plugins: [
        engineSources(),
        sassPlugin(),
        // A schema's titles, descriptions and examples are for pack authors' editors (#869): the game only checks
        //  against it, so they are left out of the bundle.
        {
          name: 'schema-annotations',
          setup(build) {
            build.onLoad({ filter: /\.schema\.json$/ }, ({ path }) => ({
              contents: JSON.stringify(
                JSON.parse(require('fs').readFileSync(path, 'utf8')),
                (key, value) =>
                  (['title', 'description'].includes(key) &&
                    typeof value === 'string') ||
                  (key === 'examples' && Array.isArray(value))
                    ? undefined
                    : value
              ),
              loader: 'json',
            }));
          },
        },
      ],
      loader: {
        '.jpg': 'file',
        '.png': 'dataurl',
        '.svg': 'dataurl',
        // The interface's faces (#737), as files beside the stylesheet.
        '.woff2': 'file',
      },
      entryNames: '[name]',
    },
    // Fetched by the Releases window when it opens, rather than bundled into
    // frontend.js (#476).
    copyReleases = () =>
      require('fs').copyFileSync(
        'changelog/releases.json',
        'dist/releases.json'
      ),
    // Whole, with their titles and descriptions, for a pack author's editor to be pointed at (#869, #1063):
    //  https://civ.one/dist/tileset.schema.json and https://civ.one/dist/sound.schema.json, each schema's `$id`.
    copySchema = () => {
      require('fs').copyFileSync(
        'packages/assets/tilesets/tileset.schema.json',
        'dist/tileset.schema.json'
      );
      require('fs').copyFileSync(
        'packages/assets/sounds/sound.schema.json',
        'dist/sound.schema.json'
      );
    },
    // The 3D map's debug page (docs/3d-renderer-plan.md 1.1b), beside the scripts it loads: dist/map3d-debug.html, its
    //  scripts versioned by `build.json` as the game's are, or by the time where it hasn't been made (a dev build).
    copyDebugPage = () => {
      const fs = require('fs'),
        version = fs.existsSync('build.json')
          ? JSON.parse(fs.readFileSync('build.json', 'utf8')).version
          : String(Date.now());

      fs.writeFileSync(
        'dist/map3d-debug.html',
        fs
          .readFileSync('packages/map-3d/debug/map3d-debug.html', 'utf8')
          .replaceAll('{{version}}', encodeURIComponent(version))
      );
    },
    failed = (e) => {
      console.log(`\x1b[31mfailed.\x1b[0m`);
      console.log('');
      console.error(e);

      process.exit(1);
    };

  process.stdout.write(`Building... `);

  // The hosted sets' sheets (#1063), and the module that names them, before anything is bundled: the build, the dev
  //  build and `watch` alike. A set missing a sprite it requires stops the build.
  try {
    buildHostedSets();
  } catch (e) {
    failed(e);
  }

  if (!watching) {
    esbuild
      .build(buildOptions)
      .then(() => {
        copyReleases();
        copySchema();
        copyDebugPage();

        console.log('\x1b[32mdone.\x1b[0m');
      })
      .catch(failed);

    return;
  }

  // `watch` was a build option until esbuild 0.17; it is now a context that is told to watch, and what follows each
  //  build is a plugin's `onEnd`. The first build is reported as the one-off build is, the ones after it as rebuilds.
  let built = false;

  const context = await esbuild
    .context({
      ...buildOptions,
      plugins: [
        ...buildOptions.plugins,
        {
          name: 'report',
          setup(build) {
            build.onEnd((result) => {
              if (result.errors.length > 0) {
                // esbuild has already written the errors themselves.
                console.log(
                  built
                    ? '\x1b[31mError rebuilding.\x1b[0m'
                    : '\x1b[31mfailed.\x1b[0m'
                );

                return;
              }

              if (!built) {
                copyReleases();
              }

              // After every build: the schema may have changed with it. The debug page isn't a script, so an edit to it
              //  alone is copied with the next build.
              copySchema();
              copyDebugPage();

              console.log(
                built ? '\x1b[32mRebuilt.\x1b[0m' : '\x1b[32mdone.\x1b[0m'
              );

              built = true;
            });
          },
        },
      ],
    })
    .catch(failed);

  await context.watch();
})();
