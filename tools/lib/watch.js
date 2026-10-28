const fs = require('fs');
const path = require('path');

const { checkoutPath } = require('./paths');
const { read } = require('./audit');
const { syncPackage } = require('./sync');

const DEBOUNCE = 50;

const run = (args) => {
  const names = args.filter((arg) => !arg.startsWith('--'));
  const manifest = read();
  const targets = (
    names.length > 0 ? names : Object.keys(manifest ? manifest.packages : {})
  ).filter((name) => fs.existsSync(checkoutPath(name)));

  if (targets.length === 0) {
    throw new Error('Nothing to watch.');
  }

  console.log(`watching ${targets.length} package(s); ctrl-c to stop`);

  targets.forEach((name) => {
    let timer = null;

    fs.watch(checkoutPath(name), { recursive: true }, (event, fileName) => {
      // What sync copies: `.ts` source and JSON data (#140). A checkout's own
      // install writes nothing sync reads.
      if (
        !fileName ||
        !/\.(ts|json)$/.test(fileName) ||
        fileName.endsWith('.d.ts') ||
        fileName.split(path.sep).includes('node_modules')
      ) {
        return;
      }

      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const result = syncPackage(name, { quiet: true });

          if (result.changed.length > 0) {
            console.log(
              `${new Date().toTimeString().slice(0, 8)}  ${name}: ${result.changed.join(', ')}`
            );
          }
        } catch (e) {
          console.error(`${name}: ${e.message}`);
        }
      }, DEBOUNCE);
    });
  });
};

module.exports = { run };
