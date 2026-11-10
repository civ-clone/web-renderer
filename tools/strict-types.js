#!/usr/bin/env node

// The game's own code, type-checked as `tsconfig.strict.json` asks (#869): `noImplicitOverride`, so a method that
// replaces its parent's says so, and `noUncheckedIndexedAccess`, so what is read from a list or a lookup by key is
// `undefined` until it is shown not to be.
//
// The flags can't go into `tsconfig.json` itself: the type-check reads the engine's packages too, which ship their
// TypeScript, and they don't pass them. Nothing in them can be fixed from here, so their diagnostics are counted and
// left out, and only `packages/` and `src/js/` have to pass. `tests/` isn't checked this way (`tsconfig.tests.json`
// stays as it is): a test that reads `undefined` fails loudly anyway.
//
// EXEMPT are byte-for-byte ports of the original game's music driver and of an OPL2 chip, all typed-array indexing,
// which would only gain a `!` on every line. They still have to pass `noImplicitOverride`: its diagnostics have
// codes of their own (`OVERRIDE`), and those aren't left out. Everything else they'd be told is a type error
// `ts:compile` finds without the flags. A file in the list that is gone, or has nothing left to leave out, fails the
// check, so the list can't outlive what it's for.

const fs = require('fs');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const ts = require(require.resolve('typescript', { paths: [webRenderer] }));

const EXEMPT = [
    'packages/audio/cvl/Driver.ts',
    'packages/audio/cvl/Image.ts',
    'packages/audio/opl/Opl2.ts',
  ],
  // "This member must have an 'override' modifier…" and the rest of `override`'s own diagnostics.
  OVERRIDE = (code) => code >= 4112 && code <= 4123,
  relative = (fileName) => path.relative(webRenderer, fileName),
  // The engine's packages, however they're installed: anything in a `node_modules`, or outside the repository.
  isOurs = (fileName) => {
    const name = relative(fileName);

    return (
      !name.startsWith('..') &&
      !path.isAbsolute(name) &&
      !name.split(path.sep).includes('node_modules')
    );
  },
  where = ({ file, start }) => {
    if (file === undefined) {
      return 'tsconfig.strict.json';
    }

    const { line, character } = file.getLineAndCharacterOfPosition(start ?? 0);

    return `${relative(file.fileName)}:${line + 1}:${character + 1}`;
  },
  describe = (diagnostic) =>
    `${where(diagnostic)} TS${
      diagnostic.code
    } ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`;

const configPath = path.join(webRenderer, 'tsconfig.strict.json'),
  { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);

if (error) {
  console.error(`FAIL strict-types\n  ${describe(error)}`);

  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(config, ts.sys, webRenderer),
  program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  }),
  ours = program.getSourceFiles().filter(({ fileName }) => isOurs(fileName)),
  exempt = new Map(EXEMPT.map((name) => [name, 0])),
  failures = parsed.errors.map(describe);

let ignored = 0;

ts.getPreEmitDiagnostics(program).forEach((diagnostic) => {
  const { file, code } = diagnostic;

  if (file !== undefined && !isOurs(file.fileName)) {
    ignored++;

    return;
  }

  const name = file === undefined ? null : relative(file.fileName);

  if (name !== null && exempt.has(name) && !OVERRIDE(code)) {
    exempt.set(name, exempt.get(name) + 1);
    ignored++;

    return;
  }

  failures.push(describe(diagnostic));
});

// Nothing of our own read would pass as well.
if (ours.length === 0) {
  failures.push('no file of our own was checked');
}

exempt.forEach((count, name) => {
  if (!fs.existsSync(path.join(webRenderer, name))) {
    failures.push(`${name} is exempt, but is gone: take it off the list`);
  } else if (count === 0) {
    failures.push(
      `${name} is exempt, but passes without it: take it off the list`
    );
  }
});

if (failures.length > 0) {
  console.error(`FAIL strict-types\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(
  `PASS strict-types (${ours.length} files of our own checked; ${ignored} diagnostics in engine packages and exempt files ignored)`
);
