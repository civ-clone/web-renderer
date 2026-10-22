const fsModule = require('fs');
const globModule = require('glob');
const path = require('path');

// Each package's plugin entry point, sorted by package directory name.
//
// The order matters: rules at the same priority run in the order they were
// registered, and a plugin registers its rules when it is imported, so the
// import order is part of how the game plays. `glob` returns whatever order
// the filesystem lists a directory in — reverse-alphabetical on APFS, hash
// order on ext4 — so without the sort a game played on another machine, or on
// CI, plays differently from the same seed here (#474).
//
// A package with no entry point at all is a library, not a plugin, and is left
// out quietly. One that declares a `main` that is not there, or whose
// `package.json` cannot be read, is left out with a warning.
const getScriptEntrypoints = (glob = globModule, fs = fsModule) => {
  const config = require('./package.json')['civ-clone'] ?? {},
    excludes = config.excludes ?? [],
    paths = config.paths ?? ['node_modules/@civ-clone/*'],
    entrypoints = [];

  paths.forEach((pattern) => {
    (glob.sync(pattern, { cwd: __dirname, absolute: true }) || []).forEach(
      (pathName) => {
        if (excludes.includes(path.basename(pathName))) {
          return;
        }

        let packageDetails;

        try {
          packageDetails = JSON.parse(
            fs.readFileSync(path.resolve(pathName, 'package.json'), 'utf8')
          );
        } catch (e) {
          console.warn(`skipped ${pathName}: ${e.message}`);

          return;
        }

        const record = (entrypoint) =>
          entrypoints.push({
            directory: path.basename(pathName),
            entrypoint,
            name: packageDetails.name,
            version: packageDetails.version,
          });

        if (typeof packageDetails.main === 'string') {
          const main = path.resolve(pathName, packageDetails.main);

          if (!fs.existsSync(main)) {
            console.warn(
              `skipped ${packageDetails.name}: its main, ${packageDetails.main}, does not exist`
            );

            return;
          }

          record(main);

          return;
        }

        const index = path.resolve(pathName, 'index.js');

        if (fs.existsSync(index)) {
          record(index);
        }
      }
    );
  });

  return entrypoints.sort((a, b) =>
    a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0
  );
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

if (entrypoints.length === 0) {
  console.error(
    'buildPluginList: no plugins found under ' +
      path.join(__dirname, 'node_modules', '@civ-clone') +
      ' — is node_modules installed?'
  );

  process.exit(1);
}

fsModule.writeFileSync(
  __dirname + '/src/js/plugins.ts',
  entrypoints.map(({ entrypoint }) => `import '${entrypoint}';`).join('\n') +
    `\n\nexport const plugins: { [name: string]: string } = ${JSON.stringify(
      manifest,
      null,
      2
    )};\n`
);
