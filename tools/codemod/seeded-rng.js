#!/usr/bin/env node

// Stage 2 of docs/engine-serialisation/05-engine-plan.md: every default of
// `() => Math.random()` becomes the shared seeded generator from
// `@civ-clone/core-random`.
//
//   node tools/codemod/seeded-rng.js <package-dir>... [--dry-run]
//
// Most call sites already take the generator as an injectable parameter with a
// `Math.random` default — that pattern is `core-spaceship`'s, and the plan
// adopts it — so for those this only replaces the default and adds the import.
// The handful that call `Math.random()` inline have no parameter to change and
// are reported for conversion by hand, because deciding where the parameter
// goes is a judgement about that class's constructor signature.

const fs = require('fs');
const path = require('path');

const { Project, SyntaxKind } = require('ts-morph');

const SKIP_DIRS = ['node_modules', '.git', '.dist'];
const IMPORT = '@civ-clone/core-random';

const sourceGlobs = (dir) => [
  path.join(dir, '**/*.ts'),
  `!${path.join(dir, '**/*.d.ts')}`,
  ...SKIP_DIRS.map((name) => `!${path.join(dir, '**', name, '**')}`),
];

// `() => Math.random()` and `(): number => Math.random()`, which are the two
// spellings in the tree.
const isMathRandomThunk = (node) => {
  if (!node || node.getKind() !== SyntaxKind.ArrowFunction) {
    return false;
  }

  const body = node.getBody();

  return (
    node.getParameters().length === 0 &&
    body.getKind() === SyntaxKind.CallExpression &&
    body.getExpression().getText() === 'Math.random' &&
    body.getArguments().length === 0
  );
};

const ensureImport = (sourceFile) => {
  const existing = sourceFile.getImportDeclaration(
    (declaration) => declaration.getModuleSpecifierValue() === IMPORT
  );

  if (existing) {
    if (
      !existing
        .getNamedImports()
        .some((named) => named.getName() === 'instance')
    ) {
      existing.addNamedImport({ name: 'instance', alias: 'rngInstance' });
    }

    return;
  }

  sourceFile.addImportDeclaration({
    moduleSpecifier: IMPORT,
    namedImports: [{ name: 'instance', alias: 'rngInstance' }],
  });
};

const apply = (dir, { dryRun = false } = {}) => {
  // `addSourceFilesAtPaths` on a directory that does not exist finds nothing and
  // reports nothing, which reads identically to "this package needed no
  // changes". Five packages were missing from the workspace on the first run
  // and looked converted.
  if (!fs.existsSync(dir)) {
    throw new Error(`${path.basename(dir)}: no checkout at ${dir}`);
  }

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const added = project.addSourceFilesAtPaths(sourceGlobs(dir));

  if (added.length === 0) {
    throw new Error(`${path.basename(dir)}: no .ts sources found in ${dir}`);
  }

  const report = { defaults: [], inline: [], files: new Set() };

  project.getSourceFiles().forEach((sourceFile) => {
    const filePath = sourceFile.getFilePath();
    const relative = path.relative(dir, filePath);

    if (/(^|[\\/])tests?[\\/]/.test(relative)) {
      return;
    }

    let changed = false;

    // Parameters whose default is a `Math.random` thunk.
    sourceFile
      .getDescendantsOfKind(SyntaxKind.Parameter)
      .forEach((parameter) => {
        if (!isMathRandomThunk(parameter.getInitializer())) {
          return;
        }

        parameter.setInitializer('rngInstance');
        report.defaults.push(`${relative}: ${parameter.getName()}`);
        changed = true;
      });

    // Anything left is an inline call with no parameter to redirect.
    sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .forEach((call) => {
        if (call.getExpression().getText() !== 'Math.random') {
          return;
        }

        report.inline.push(
          `${relative}:${call.getStartLineNumber()}: ${call.getParent().getText().replace(/\s+/g, ' ').slice(0, 72)}`
        );
      });

    if (!changed) {
      return;
    }

    ensureImport(sourceFile);
    report.files.add(filePath);
  });

  if (!dryRun) {
    project.saveSync();
  }

  return report;
};

const main = () => {
  const args = process.argv.slice(2);
  const dirs = args.filter((arg) => !arg.startsWith('--'));
  const dryRun = args.includes('--dry-run');

  if (dirs.length === 0) {
    console.error('usage: seeded-rng.js <package-dir>... [--dry-run]');
    process.exit(1);
  }

  dirs.forEach((dir) => {
    const resolved = path.resolve(dir);
    const report = apply(resolved, { dryRun });

    console.log(
      `${path.basename(resolved).padEnd(30)} ${String(report.defaults.length).padStart(2)} default(s) in ${report.files.size} file(s)${dryRun ? ' (dry run)' : ''}`
    );

    if (process.env.VERBOSE) {
      report.defaults.forEach((line) => console.log(`    ${line}`));
    }

    report.inline.forEach((line) =>
      console.log(`  ! inline Math.random, convert by hand: ${line}`)
    );
  });
};

if (require.main === module) {
  main();
}

module.exports = { apply };
