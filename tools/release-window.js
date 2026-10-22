#!/usr/bin/env node

// Runs tests/ui/releaseWindow.ts — the Releases window loads the notes when it
// opens (#476) — after checking that `frontend.js` no longer bundles
// `changelog/releases.json`, which was most of its size.

const path = require('path');

const { runSuite } = require('./lib/suite');
const { webRenderer } = require('./lib/paths');

(async () => {
  const { metafile } = await require('esbuild').build({
    entryPoints: [path.join(webRenderer, 'src', 'js', 'frontend.ts')],
    bundle: true,
    write: false,
    metafile: true,
    outdir: path.join(webRenderer, 'dist'),
    logLevel: 'error',
    loader: { '.jpg': 'file', '.png': 'dataurl', '.svg': 'dataurl' },
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
  });

  const bundled = Object.keys(metafile.inputs).filter((input) =>
    input.endsWith('releases.json')
  );

  if (bundled.length > 0) {
    console.error(
      `FAIL releaseWindow: frontend.js bundles ${bundled.join(', ')}`
    );

    process.exit(1);
  }

  await runSuite('ui', 'releaseWindow');
})().catch((error) => {
  console.error(error);

  process.exit(1);
});
