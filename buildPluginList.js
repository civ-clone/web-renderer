const fsModule = require('fs');
const globModule = require('glob');
const path = require('path');

const getScriptEntrypoints = (glob = globModule, fs = fsModule) => {
  const config = require('./package.json')['civ-clone'] ?? {},
    excludes = config.excludes ?? [],
    paths = config.paths ?? ['node_modules/@civ-clone/*'],
    entrypoints = [];

  paths
    .forEach((pathName) => {
      (glob.sync(pathName) || []).forEach((pathName) => {
        if (excludes.includes(path.basename(pathName))) {
          return;
        }

        try {
          fs.accessSync(pathName);

          const packagePath = path.resolve(pathName, 'package.json');

          fs.accessSync(packagePath);

          const packageDetails = require(
            packagePath
          );

          if (typeof packageDetails.main === 'string') {
            const main = path.resolve(pathName, packageDetails.main);

            fs.accessSync(main);

            entrypoints.push(main);

            return;
          }

          const index = path.resolve(pathName, 'index.js');

          fs.accessSync(index);

          entrypoints.push(index);
        } catch (e) {
        }
      });
  });

  return entrypoints;
}

fsModule.writeFileSync(
  __dirname + '/src/js/plugins.ts',
  getScriptEntrypoints().map((fullPath) => `import '${fullPath}';`).join('\n')
);
