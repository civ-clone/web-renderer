#!/usr/bin/env node

// No rule is registered from inside an `Effect`, in anything the game is built from (#869): `tools/lib/lint.js`
// says why (a save can't carry such a rule, so a loaded game silently lacks it) and how it is found. `civ publish`
// runs the same check on a checkout before it is published; this runs it on what is installed, which is what
// civ.one is built with, and on the frontend's own packages.
//
// The check is first shown to work: a rule registered inside an effect, in both of the spellings it knows, is
// found, and one registered at import is not. A check that found nothing in anything would pass as well.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { findings, sourcesIn } = require('./lib/lint');
const { isUiPackage, scope, webRenderer } = require('./lib/paths');

const failures = [];

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-lint-'));

const found = (name, source) => {
  const file = path.join(directory, name);

  fs.writeFileSync(file, source);

  return findings(file).length;
};

const header = `
import Effect from '@civ-clone/core-rule/Effect';
import Started from '@civ-clone/core-science/Rules/Started';
`;

try {
  [
    [
      'a rule constructed inside an effect',
      'inline.ts',
      `${header}
export const rule = new Started(
  new Effect(() => ruleRegistry.register(new Started(new Effect(() => {}))))
);`,
      1,
    ],
    [
      'a rule bound first, then registered',
      'bound.ts',
      `${header}
export const rule = new Started(
  new Effect(() => {
    const onStarted = new Started(new Effect(() => {}));

    registry.register(onStarted);
  })
);`,
      1,
    ],
    [
      'a rule registered at import',
      'atImport.ts',
      `${header}
ruleRegistry.register(new Started(new Effect(() => {})));`,
      0,
    ],
  ].forEach(([what, name, source, expected]) => {
    const actual = found(name, source);

    if (actual !== expected) {
      failures.push(
        `the check itself: ${what} was found ${actual} time(s), not ${expected}`
      );
    }
  });
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

// Each engine package as it is installed (or linked in by `civ sync`), and the frontend's own.
const roots = [
  ...fs
    .readdirSync(scope)
    .filter((name) => !isUiPackage(name))
    .map((name) => [
      `@civ-clone/${name}`,
      fs.realpathSync(path.join(scope, name)),
    ]),
  ['packages', path.join(webRenderer, 'packages')],
];

let files = 0;

roots.forEach(([label, root]) =>
  sourcesIn(root).forEach((file) => {
    files++;

    findings(file).forEach(({ line, text }) =>
      failures.push(`${label}/${path.relative(root, file)}:${line}  ${text}`)
    );
  })
);

if (files === 0) {
  failures.push('no TypeScript was found to check');
}

if (failures.length > 0) {
  console.error(
    `FAIL rule-lint: a rule registered inside an Effect exists only in memory, so a save cannot carry it\n  ${failures.join(
      '\n  '
    )}`
  );

  process.exit(1);
}

console.log(
  `PASS rule-lint (${files} files in ${
    roots.length - 1
  } engine packages and the frontend's own: no rule is registered inside an Effect)`
);
