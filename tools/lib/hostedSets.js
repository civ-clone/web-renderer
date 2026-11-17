// The hosted sets' sheets (#1063): each set that ships with civ.one is served as one sprite sheet and an index of where
//  each sprite is in it, named by a hash of what they hold (`dist/sets/<id>.<hash>.png` and `.json`), so the browser
//  keeps a sheet until it changes. The package that registers a set declares it in its `package.json`
//  (`civ-clone.hostedSets`: the descriptor of each, whose sprites are the PNGs beside it), and is told the names in a
//  module written beside it (`sheets.js`, git-ignored, typed by the `sheets.d.ts` it keeps).
//
// Run before anything is built or bundled: by `esbuild.js` (the build, the dev build and `watch`), by the suites'
//  runners (`tools/lib/suite.js`, `npm test`), and by `npm run build:generate-hosted-sets`. It fails when a sprite a
//  descriptor requires has no PNG, as the pack's own CI does.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { readPng, writePng } = require('./png');
const { webRenderer } = require('./paths');

/** Where the sheets go, and the path the page fetches them by: beside the bundle. */
const OUTPUT = path.join('dist', 'sets');

/** The module each declaring package is told its sheets' names in. */
const GENERATED = 'sheets.js';

/**
 * Lays out `sprites` (`{ name, width, height }`) in rows, tallest first and then by name, in a sheet as wide as the
 *  widest sprite or the square root of their area, whichever is more. The same sprites always give the same layout.
 *  Returns the sheet's size and each sprite's rectangle by name.
 */
const layOut = (sprites) => {
  const area = sprites.reduce(
      (sum, { width, height }) => sum + width * height,
      0
    ),
    width = Math.max(
      Math.ceil(Math.sqrt(area)),
      ...sprites.map(({ width }) => width)
    ),
    sorted = [...sprites].sort(
      (a, b) =>
        b.height - a.height || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    ),
    rectangles = {};
  let x = 0,
    y = 0,
    rowHeight = 0;

  sorted.forEach(({ name, width: spriteWidth, height }) => {
    if (x + spriteWidth > width) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }

    rectangles[name] = { x, y, width: spriteWidth, height };
    x += spriteWidth;
    rowHeight = Math.max(rowHeight, height);
  });

  return { width, height: y + rowHeight, rectangles };
};

/**
 * The sheet and index for `descriptor`, each sprite it lists read by `readSprite(name)` as `{ width, height, data }`
 *  (RGBA), or null for one that isn't there. Throws naming every sprite the descriptor requires that isn't there; an
 *  optional one is left out. The index lists the sprites by the descriptor's names, sorted, each with its rectangle in
 *  the sheet; the hash is of the sheet's pixels and the index, not of the PNG's bytes, which change with the zlib Node
 *  ships.
 */
const buildSheet = (descriptor, readSprite) => {
  const { required = [], optional = [] } = descriptor.assets ?? {},
    read = [...required, ...optional].map((name) => ({
      name,
      image: readSprite(name),
    })),
    missing = read
      .filter(({ name, image }) => image === null && required.includes(name))
      .map(({ name }) => name);

  if (missing.length > 0) {
    throw new Error(
      `The ${descriptor.id} set has no sprite for ${
        missing.length
      } it requires: ${missing.join(', ')}.`
    );
  }

  const present = read.filter(({ image }) => image !== null),
    { width, height, rectangles } = layOut(
      present.map(({ name, image }) => ({
        name,
        width: image.width,
        height: image.height,
      }))
    ),
    data = Buffer.alloc(width * height * 4);

  present.forEach(({ name, image }) => {
    const { x, y } = rectangles[name];

    for (let row = 0; row < image.height; row++) {
      image.data.copy(
        data,
        ((y + row) * width + x) * 4,
        row * image.width * 4,
        (row + 1) * image.width * 4
      );
    }
  });

  const index = {
      id: descriptor.id,
      width,
      height,
      sprites: Object.fromEntries(
        Object.keys(rectangles)
          .sort()
          .map((name) => [name, rectangles[name]])
      ),
    },
    json = `${JSON.stringify(index)}\n`,
    hash = crypto
      .createHash('sha256')
      .update(`${width}x${height}\n`)
      .update(data)
      .update(json)
      .digest('hex')
      .slice(0, 12);

  return { png: writePng({ width, height, data }), json, index, hash };
};

/** Each sprite of a set as its PNG beside its descriptor: `<directory>/<name>.png`, or null where there's none. */
const spritesIn = (directory) => (name) => {
  const file = path.join(directory, `${name}.png`);

  return fs.existsSync(file)
    ? readPng(fs.readFileSync(file), path.relative(webRenderer, file))
    : null;
};

/**
 * Every hosted set the workspace packages declare (`civ-clone.hostedSets` in their `package.json`), as
 *  `{ directory, descriptor }`: the declaring package's directory, and the path of each set's descriptor, which is
 *  resolved from that package as an import would be.
 */
const declaredSets = (root = webRenderer) => {
  const packages = path.join(root, 'packages');

  return fs
    .readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packages, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, 'package.json')))
    .sort()
    .flatMap((directory) => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(directory, 'package.json'), 'utf8')
      );

      return ((manifest['civ-clone'] ?? {}).hostedSets ?? []).map(
        ({ descriptor }) => ({
          directory,
          descriptor: require.resolve(descriptor, { paths: [directory] }),
        })
      );
    });
};

// Written only when it would change, and then put in place whole, as `buildPluginList.js` writes: the suites may build
//  several at once, and one must never read a file another is halfway through writing.
const write = (target, contents) => {
  if (fs.existsSync(target) && fs.readFileSync(target).equals(contents)) {
    return;
  }

  const partial = `${target}.${process.pid}.tmp`;

  fs.writeFileSync(partial, contents);
  fs.renameSync(partial, target);
};

/**
 * Builds every declared set's sheet and index into `dist/sets` under `root`, removes that set's sheets from before,
 *  and tells each declaring package the names (`sheets.js`). Returns the names, by set id.
 */
const buildHostedSets = (root = webRenderer) => {
  const output = path.join(root, OUTPUT),
    byPackage = new Map();

  fs.mkdirSync(output, { recursive: true });

  declaredSets(root).forEach(({ directory, descriptor: descriptorPath }) => {
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8')),
      { png, json, hash } = buildSheet(
        descriptor,
        spritesIn(path.dirname(descriptorPath))
      ),
      base = `${descriptor.id}.${hash}`,
      // As the page fetches them, beside it.
      names = {
        sheet: `${OUTPUT.split(path.sep).join('/')}/${base}.png`,
        index: `${OUTPUT.split(path.sep).join('/')}/${base}.json`,
      };

    write(path.join(output, `${base}.png`), png);
    write(path.join(output, `${base}.json`), Buffer.from(json));

    // The set's sheets from before this one, by name: nothing else under `dist/sets`.
    fs.readdirSync(output)
      .filter(
        (file) =>
          file.startsWith(`${descriptor.id}.`) &&
          /^[0-9a-f]{12}\.(png|json)$/.test(
            file.slice(descriptor.id.length + 1)
          ) &&
          !file.startsWith(`${base}.`)
      )
      .forEach((file) => fs.unlinkSync(path.join(output, file)));

    byPackage.set(directory, {
      ...(byPackage.get(directory) ?? {}),
      [descriptor.id]: names,
    });
  });

  byPackage.forEach((sheets, directory) =>
    write(
      path.join(directory, GENERATED),
      Buffer.from(
        `// Written by \`tools/lib/hostedSets.js\` (#1063): where each hosted set's sheet and index are, by set id.\n` +
          `export const sheets = ${JSON.stringify(sheets, null, 2)};\n\n` +
          `export default sheets;\n`
      )
    )
  );

  return Object.assign({}, ...byPackage.values());
};

module.exports = { buildHostedSets, buildSheet, declaredSets, layOut };
