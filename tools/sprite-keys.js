#!/usr/bin/env node

// Runs tests/ui/spriteKeys.ts — the map finds each sprite by its whole key, as it found it before (#56). It first runs
// tests/ui/renderGeometry.ts to learn which sprites the map layers ask for there, and hands the list over. Bundled with
// esbuild, as the other UI tests are.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sprite-keys-')),
  sprites = path.join(directory, 'sprites.json');

const bundle = (name) => {
  const outfile = path.join(directory, `${name}.js`);

  require('esbuild').buildSync({
    entryPoints: [path.join(webRenderer, 'tests', 'ui', `${name}.ts`)],
    bundle: true,
    keepNames: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile,
    logLevel: 'error',
    // linkedom reaches for the optional native `canvas` package, and copes
    //  without it.
    external: ['canvas'],
  });

  return outfile;
};

try {
  execFileSync(process.execPath, [bundle('renderGeometry')], {
    cwd: webRenderer,
    encoding: 'utf8',
    env: { ...process.env, RENDER_GEOMETRY_SPRITES: sprites },
    maxBuffer: 64 * 1024 * 1024,
  });

  process.stdout.write(
    execFileSync(process.execPath, [bundle('spriteKeys'), sprites], {
      cwd: webRenderer,
      encoding: 'utf8',
    })
  );
} catch (error) {
  process.stdout.write(error.stdout || '');
  process.stderr.write(error.stderr || '');
  process.exit(1);
}
