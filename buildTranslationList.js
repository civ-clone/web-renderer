const fsModule = require('fs'),
  globModule = require('glob'),
  path = require('path');

// TODO: have this in separate modules
const paths = [
  path.join(__dirname, 'translations', '*', '*.ts')
];

const getTranslations = (glob = globModule, fs = fsModule) =>
  paths
    .flatMap((pathName) =>
      (glob.sync(pathName) || []).map((pathName) => pathName)
    );

fsModule.writeFileSync(
  __dirname + '/src/js/translations.ts',
  getTranslations().map((fullPath) => `import '${fullPath}';`).join('\n')
);
