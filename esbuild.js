(async () => {
  const esbuild = require('esbuild'),
    { sassPlugin } = require('esbuild-sass-plugin'),
    { engineSources, tsconfig } = require('./tools/lib/engineSources'),
    watching = process.argv.includes('watch'),
    buildOptions = {
      entryPoints: [
        'src/css/app.scss',
        'src/js/backend.ts',
        'src/js/frontend.ts',
        // Its own file, for `audioWorklet.addModule()` (#126): dist/musicWorklet.js.
        'packages/audio/musicWorklet.ts'
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
        '.woff2': 'file'
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
    // Whole, with its titles and descriptions, for a pack author's editor to be pointed at (#869):
    //  https://civ.one/dist/tileset.schema.json, the schema's `$id`.
    copySchema = () =>
      require('fs').copyFileSync(
        'packages/assets/tilesets/tileset.schema.json',
        'dist/tileset.schema.json'
      ),
    failed = (e) => {
      console.log(`\x1b[31mfailed.\x1b[0m`);
      console.log('');
      console.error(e);

      process.exit(1);
    };

  process.stdout.write(`Building... `);

  if (!watching) {
    esbuild
      .build(buildOptions)
      .then(() => {
        copyReleases();
        copySchema();

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
                copySchema();
              }

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
