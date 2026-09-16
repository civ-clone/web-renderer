const fsModule = require('fs');
const globModule = require('glob');
const path = require('path');

const getScriptEntrypoints = (glob = globModule, fs = fsModule) => {
  const config = require('./package.json')['civ-clone'] ?? {},
    excludes = config.excludes ?? [],
    paths = config.paths ?? ['node_modules/@civ-clone/*'],
    entrypoints = [];

  paths.forEach((pathName) => {
    (glob.sync(pathName) || []).forEach((pathName) => {
      if (excludes.includes(path.basename(pathName))) {
        return;
      }

      try {
        fs.accessSync(pathName);

        const packagePath = path.resolve(pathName, 'package.json');

        fs.accessSync(packagePath);

        const packageDetails = require(packagePath);

        const record = (entrypoint) =>
          entrypoints.push({
            entrypoint,
            name: packageDetails.name,
            version: packageDetails.version,
          });

        if (typeof packageDetails.main === 'string') {
          const main = path.resolve(pathName, packageDetails.main);

          fs.accessSync(main);

          record(main);

          return;
        }

        const index = path.resolve(pathName, 'index.js');

        fs.accessSync(index);

        record(index);
      } catch (e) {}
    });
  });

  return entrypoints;
};

// The imports load the plugins; the manifest says which ones, at which
// version. `core-save-game` refuses to write a save without it — an empty
// manifest means "cannot check compatibility", not "nothing loaded" — and
// `hydrate` compares it with the manifest in the file, refusing a save that
// needs a plugin this build does not have and reporting drift where versions
// differ.
const entrypoints = getScriptEntrypoints(),
  manifest = entrypoints
    .filter(({ name, version }) => name && version)
    .sort((a, b) => a.name.localeCompare(b.name))
    .reduce((names, { name, version }) => ({ ...names, [name]: version }), {});

fsModule.writeFileSync(
  __dirname + '/src/js/plugins.ts',
  entrypoints.map(({ entrypoint }) => `import '${entrypoint}';`).join('\n') +
    `\n\nexport const plugins: { [name: string]: string } = ${JSON.stringify(
      manifest,
      null,
      2
    )};\n`
);
