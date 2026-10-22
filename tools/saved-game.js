#!/usr/bin/env node

// Runs tests/ui/savedGame.ts — what crosses the reload when a save is loaded,
// and what the player is told when it cannot (#5).
//
// `src/js/UI/Store.ts` is resolved to `tests/ui/lib/FakeStore.ts` for this
// bundle: node has no `indexedDB`, and `idb` checks its own wrappers with
// `instanceof IDBDatabase` and friends, so a shim faithful enough to run it
// would be more machinery than the thing under test. The `sessionStorage` the
// suite installs keeps its real size limit, which is where the bug was.

const path = require('path');

const { runSuite } = require('./lib/suite');
const { webRenderer } = require('./lib/paths');

const fakeStore = path.join(webRenderer, 'tests', 'ui', 'lib', 'FakeStore.ts');

runSuite('ui', 'savedGame', {
  esbuild: {
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
  },
});
