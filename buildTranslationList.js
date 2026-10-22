const fsModule = require('fs'),
  globModule = require('glob'),
  path = require('path');

// TODO: have this in separate modules
const paths = [
  path.join(__dirname, 'translations', '*', '*.ts')
];

// Sorted, so the import order does not depend on how the filesystem lists a
//  directory (#474): a later file's key would replace an earlier one's.
const getTranslations = (glob = globModule, fs = fsModule) =>
  paths
    .flatMap((pathName) => glob.sync(pathName) || [])
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

fsModule.writeFileSync(
  __dirname + '/src/js/translations.ts',
  getTranslations().map((fullPath) => `import '${fullPath}';`).join('\n')
);
