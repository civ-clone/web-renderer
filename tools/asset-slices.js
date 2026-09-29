#!/usr/bin/env node

// The unit sprites are sliced out of SP257.PIC by the rectangles in
// civ1-asset-extractor's `extract-data.json`. Each cell is 15×15 with a 1px
// separator between cells, so a unit slice of any other size takes in part of
// the separator, which shows as a light-blue line along the sprite's edge
// (#12). A row that leaves out its size falls back to the 16×16 `defaults`.

const path = require('path');

const { webRenderer } = require('./lib/paths');

const extractData = require(path.join(
    webRenderer,
    'node_modules',
    '@civ-clone',
    'civ1-asset-extractor',
    'extract-data.json'
  )),
  unitSize = { width: 15, height: 15 },
  failures = [];

let checked = 0;

Object.entries(extractData.files).forEach(([file, definitions]) =>
  Object.entries(definitions).forEach(([assetPath, rows]) => {
    const sizes = new Map();

    rows.forEach((row) =>
      row.contents.forEach((sprite) => {
        const { width, height } = {
            ...extractData.defaults,
            ...row,
            ...sprite,
          },
          name = `${file} ${assetPath}${sprite.name}`,
          size = `${width}×${height}`;

        checked++;

        if (!sizes.has(size)) {
          sizes.set(size, []);
        }

        sizes.get(size).push(name);

        if (
          assetPath === 'units/' &&
          (width !== unitSize.width || height !== unitSize.height)
        ) {
          failures.push(
            `${name} is sliced ${size}, not ${unitSize.width}×${unitSize.height}`
          );
        }
      })
    );

    if (sizes.size > 1) {
      failures.push(
        `${file} ${assetPath} mixes sizes: ${[...sizes]
          .map(([size, names]) => `${size} (${names.length})`)
          .join(', ')}`
      );
    }
  })
);

if (failures.length) {
  console.error(`FAIL asset-slices\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS asset-slices (${checked} sprites)`);
