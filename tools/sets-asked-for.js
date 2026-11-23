#!/usr/bin/env node

// Prints the hosted sets' files that the build published in the site checked out at the given directory asks for, one
//  path under it to a line: the sheets and manifests its `frontend.js` names, and the models those manifests name. The
//  deploy keeps them for one more deploy (#1114, #1324): see `setsAskedFor` in `lib/hostedSets.js`.

const { setsAskedFor } = require('./lib/hostedSets');

const [site] = process.argv.slice(2);

if (site === undefined) {
  console.error('usage: sets-asked-for.js <site>');

  process.exit(2);
}

setsAskedFor(site).forEach((file) => console.log(file));
