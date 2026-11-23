// The hosted sets' sheets (#1063): each set that ships with civ.one is served as one sprite sheet and an index of where
//  each sprite is in it, named by a hash of what they hold (`dist/sets/<id>.<hash>.png` and `.json`), so the browser
//  keeps a sheet until it changes. The package that registers a set declares it in its `package.json`
//  (`civ-clone.hostedSets`: the descriptor of each, whose sprites are the PNGs beside it), and is told the names in a
//  module written beside it (`sheets.js`, git-ignored, typed by the `sheets.d.ts` it keeps).
//
// A set of models for the 3D map (docs/3d-renderer.md §10) ships the same way: declared in `civ-clone.hostedModels` (its
//  manifest), its models copied beside the page under names with its manifest's hash in them, and its manifest naming
//  them so, the package told where it is in `modelSets.js` (git-ignored, typed by the `modelSets.d.ts` it keeps).
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

/** The module each declaring package is told its sheets' names in, and its sets of models'. */
const GENERATED = 'sheets.js',
  GENERATED_MODELS = 'modelSets.js';

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

  buildHostedModels(root);

  return Object.assign({}, ...byPackage.values());
};

/**
 * Every hosted set of models the workspace packages declare (`civ-clone.hostedModels` in their `package.json`, the 3D
 *  map's units, docs/3d-renderer.md §10), as `{ directory, manifest }`: the declaring package's directory, and the path
 *  of each set's manifest, resolved from that package as an import would be.
 */
const declaredModelSets = (root = webRenderer) => {
  const packages = path.join(root, 'packages');

  return fs
    .readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packages, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, 'package.json')))
    .sort()
    .flatMap((directory) => {
      const declared = JSON.parse(
        fs.readFileSync(path.join(directory, 'package.json'), 'utf8')
      );

      return ((declared['civ-clone'] ?? {}).hostedModels ?? []).map(
        ({ manifest }) => {
          try {
            return {
              directory,
              manifest: require.resolve(manifest, { paths: [directory] }),
            };
          } catch {
            throw new Error(
              `${path.basename(
                directory
              )} declares ${manifest}, which isn't installed: run pnpm install`
            );
          }
        }
      );
    });
};

// A set's id, or a model's name, as it's written into a file's name: letters, digits and dashes.
const NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Builds the set of models whose manifest is at `manifestPath` into `output`: each model copied beside the page as
 *  `<id>.<hash>.<name>.glb`, as its SHA-256 in the manifest says it is, and the manifest, naming them so, as
 *  `<id>.<hash>.json`, the hash the manifest's as it ships, so the browser keeps them until they change. The set's
 *  files from before are removed, by name: nothing else under `output`. Returns where the manifest is, as the page
 *  fetches it, and what the library shows of the set. Fails, saying why, for a model that's missing, isn't beside the
 *  manifest, or isn't the file the manifest says.
 */
const buildModelSet = (manifestPath, output) => {
  const text = fs.readFileSync(manifestPath),
    manifest = JSON.parse(text),
    // Where the set is, as it is on disk: a model's file must be in it, however it's reached.
    directory = fs.realpathSync(path.dirname(manifestPath)),
    hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12),
    base = `${manifest.id}.${hash}`,
    models = {};

  if (typeof manifest.id !== 'string' || !NAME.test(manifest.id)) {
    throw new Error(`${manifestPath}: no id to name its files by`);
  }

  // A file of model `name`'s, as the manifest says it: beside it, however it's reached, and the file its SHA-256 says,
  //  its name beside the page changing only as the manifest does, so a file the manifest doesn't pin can't change
  //  under a name the browser keeps. Its bytes.
  const bytesOf = (name, file, sha256, what) => {
    const named = path.resolve(directory, String(file));

    if (!NAME.test(name) || !named.startsWith(directory + path.sep)) {
      throw new Error(
        `${manifest.id}: model ${name}${what} isn't beside its manifest`
      );
    }

    if (!fs.existsSync(named) || !fs.statSync(named).isFile()) {
      throw new Error(`${manifest.id}: model ${name}${what} has no ${file}`);
    }

    // As it is on disk, a link followed: still beside its manifest.
    const source = fs.realpathSync(named);

    if (!source.startsWith(directory + path.sep)) {
      throw new Error(
        `${manifest.id}: model ${name}${what} isn't beside its manifest`
      );
    }

    if (typeof sha256 !== 'string') {
      throw new Error(`${manifest.id}: model ${name}${what} has no SHA-256`);
    }

    const bytes = fs.readFileSync(source);

    if (crypto.createHash('sha256').update(bytes).digest('hex') !== sha256) {
      throw new Error(
        `${manifest.id}: ${file} isn't the file its manifest says`
      );
    }

    return bytes;
  };

  Object.entries(manifest.models ?? {}).forEach(([name, model]) => {
    write(
      path.join(output, `${base}.${name}.glb`),
      bytesOf(name, model.file, model.sha256, '')
    );
    models[name] = { ...model, file: `${base}.${name}.glb` };

    // Its rigged copy (plan 2.2), where it has one: beside it as `<id>.<hash>.<name>.rigged.glb`, which no model's
    //  name can make, as a model's name has no dot.
    if (model.rigged !== undefined && model.rigged !== null) {
      write(
        path.join(output, `${base}.${name}.rigged.glb`),
        bytesOf(name, model.rigged.file, model.rigged.sha256, "'s rigged copy")
      );
      models[name].rigged = {
        ...model.rigged,
        file: `${base}.${name}.rigged.glb`,
      };
    }
  });

  write(
    path.join(output, `${base}.json`),
    Buffer.from(`${JSON.stringify({ ...manifest, models }, null, 2)}\n`)
  );

  // The set's files from before this one, by name: nothing else under `output`.
  fs.readdirSync(output)
    .filter(
      (file) =>
        file.startsWith(`${manifest.id}.`) &&
        /^[0-9a-f]{12}\.(json|[a-z0-9][a-z0-9-]*(\.rigged)?\.glb)$/.test(
          file.slice(manifest.id.length + 1)
        ) &&
        !file.startsWith(`${base}.`)
    )
    .forEach((file) => fs.unlinkSync(path.join(output, file)));

  return {
    manifest: `${OUTPUT.split(path.sep).join('/')}/${base}.json`,
    name: manifest.name,
    licence: manifest.licence,
    credits: manifest.credits,
  };
};

/**
 * Builds every declared set of models into `dist/sets` under `root` (`buildModelSet`), and tells each declaring
 *  package where each is (`modelSets.js`). Returns them, by set id.
 */
const buildHostedModels = (root = webRenderer) => {
  const output = path.join(root, OUTPUT),
    byPackage = new Map();

  fs.mkdirSync(output, { recursive: true });

  const ids = new Set();

  declaredModelSets(root).forEach(({ directory, manifest }) => {
    const { id } = JSON.parse(fs.readFileSync(manifest, 'utf8'));

    // Two sets under one id would remove each other's files.
    if (ids.has(id)) {
      throw new Error(`two hosted sets of models are ${id}`);
    }

    ids.add(id);

    const built = buildModelSet(manifest, output);

    byPackage.set(directory, {
      ...(byPackage.get(directory) ?? {}),
      [id]: built,
    });
  });

  byPackage.forEach((sets, directory) =>
    write(
      path.join(directory, GENERATED_MODELS),
      Buffer.from(
        `// Written by \`tools/lib/hostedSets.js\` (docs/3d-renderer.md §10): where each hosted set of models' manifest is,\n` +
          `//  and what the library shows of it, by set id.\n` +
          `export const modelSets = ${JSON.stringify(sets, null, 2)};\n\n` +
          `export default modelSets;\n`
      )
    )
  );

  return Object.assign({}, ...byPackage.values());
};

/** A sheet, its index, or a set of models' manifest, as a page's `frontend.js` names it. */
const SET_FILE = /dist\/sets\/[A-Za-z0-9._-]+\.(?:png|json)/g;

/** A model, as `buildModelSet` names it in its manifest: beside it. */
const MODEL_FILE = /^[A-Za-z0-9._-]+\.glb$/;

/**
 * The hosted sets' files that the build published in `site` asks for, as paths under it: the sheets, their indexes and
 *  the manifests its `dist/frontend.js` names (#1114), and the models, and their rigged copies, that each of those
 *  manifests names (#1324), which only the manifest does. The deploy keeps them for one more deploy, so a page cached
 *  from before it still finds them. Nothing, for a site with no build; no models, for a manifest that's missing, or one
 *  that can't be read, which is told to `warn`.
 */
const setsAskedFor = (site, warn = () => {}) => {
  const script = path.join(site, 'dist', 'frontend.js');

  if (!fs.existsSync(script)) {
    return [];
  }

  const named = new Set(fs.readFileSync(script, 'utf8').match(SET_FILE) ?? []);

  [...named]
    .filter((file) => file.endsWith('.json'))
    .forEach((file) => {
      const at = path.join(site, file);
      let manifest;

      // One that's gone is warned of as it's put back.
      if (!fs.existsSync(at)) {
        return;
      }

      try {
        manifest = JSON.parse(fs.readFileSync(at, 'utf8'));
      } catch {
        warn(`${file} can't be read, so the models it names aren't kept`);

        return;
      }

      if (manifest?.kind !== 'models') {
        return;
      }

      // Each model's file, and its rigged copy's (plan 2.2).
      Object.values(manifest.models ?? {}).forEach((model) =>
        [model?.file, model?.rigged?.file].forEach((each) => {
          if (typeof each === 'string' && MODEL_FILE.test(each)) {
            named.add(`${path.posix.dirname(file)}/${each}`);
          }
        })
      );
    });

  return [...named].sort();
};

module.exports = {
  buildHostedModels,
  buildHostedSets,
  buildModelSet,
  buildSheet,
  declaredModelSets,
  declaredSets,
  layOut,
  setsAskedFor,
};
