const fsModule = require('fs'),
  globModule = require('glob'),
  path = require('path');

// The engine packages' text, kept here until each package brings its own, and the frontend packages' own (#825).
const paths = [
  path.join(__dirname, 'translations', '*', '*.ts'),
  path.join(__dirname, 'packages', '*', 'translations', '*.ts'),
];

// Sorted, so the import order does not depend on how the filesystem lists a
//  directory (#474): a later file's key would replace an earlier one's.
const getTranslations = (glob = globModule, fs = fsModule) =>
  paths
    .flatMap((pathName) => glob.sync(pathName) || [])
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

// Written only when it would change, and then put in place whole, as `buildPluginList.js` writes its own: the ui
//  suites read this while others may be asking for it again (#879).
const target = __dirname + '/src/js/translations.ts',
  contents = getTranslations()
    .map((fullPath) => `import '${fullPath}';`)
    .join('\n');

if (
  !fsModule.existsSync(target) ||
  fsModule.readFileSync(target, 'utf8') !== contents
) {
  const partial = `${target}.${process.pid}.tmp`;

  fsModule.writeFileSync(partial, contents);
  fsModule.renameSync(partial, target);
}
