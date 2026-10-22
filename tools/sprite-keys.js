#!/usr/bin/env node

// Runs tests/ui/spriteKeys.ts — the map finds each sprite by its whole key, as it found it before (#56). It first runs
// tests/ui/renderGeometry.ts to learn which sprites the map layers ask for there, and hands the list over. Each run
// passes as lib/suite.js says: exit 0 and a PASS line, in time.

const fs = require('fs');
const path = require('path');

const { bundle, runOnce } = require('./lib/suite');

(async () => {
  const geometry = await bundle('ui', 'renderGeometry'),
    keys = await bundle('ui', 'spriteKeys'),
    sprites = path.join(keys.directory, 'sprites.json');

  let passed = false;

  try {
    passed =
      runOnce(geometry.outfile, {
        env: { ...process.env, RENDER_GEOMETRY_SPRITES: sprites },
        label: 'renderGeometry, listing the sprites',
      }) && runOnce(keys.outfile, { args: [sprites] });
  } finally {
    [geometry, keys].forEach(({ directory }) =>
      fs.rmSync(directory, { recursive: true, force: true })
    );
  }

  process.exit(passed ? 0 : 1);
})().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
