#!/usr/bin/env node

// Runs tests/ui/savedGame.ts — what crosses the reload when a save is loaded,
// and what the player is told when it cannot (#5).
//
// `src/js/UI/Store.ts` is resolved to `tests/ui/lib/FakeStore.ts` for this
// bundle: node has no `indexedDB`, and `idb` checks its own wrappers with
// `instanceof IDBDatabase` and friends, so a shim faithful enough to run it
// would be more machinery than the thing under test. The `sessionStorage` the
// suite installs keeps its real size limit, which is where the bug was.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const outfile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'saved-game-')),
  'savedGame.js'
);

const fakeStore = path.join(webRenderer, 'tests', 'ui', 'lib', 'FakeStore.ts');

// Asynchronous because `buildSync` takes no plugins.
(async () => {
  await require('esbuild').build({
    entryPoints: [path.join(webRenderer, 'tests', 'ui', 'savedGame.ts')],
    bundle: true,
    keepNames: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile,
    logLevel: 'error',
    plugins: [
      {
        name: 'fake-store',
        setup(build) {
          // `../Store`, and not `./AssetStore`.
          build.onResolve({ filter: /(^|\/)Store$/ }, () => ({
            path: fakeStore,
          }));
        },
      },
    ],
  });

  try {
    process.stdout.write(
      execFileSync(process.execPath, [outfile], {
        cwd: webRenderer,
        encoding: 'utf8',
      })
    );
  } catch (error) {
    process.stdout.write(error.stdout || '');
    process.stderr.write(error.stderr || '');
    process.exit(1);
  }
})();
