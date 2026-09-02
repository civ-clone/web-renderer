#!/usr/bin/env node

// Stage 1 of docs/engine-serialisation/05-engine-plan.md: `#private` instance
// fields become `private _`-prefixed TypeScript ones, so that
// `Object.assign(Object.create(City.prototype), state)` produces a working
// instance and the save layer can be a single generic hydrator.
//
//   node tools/codemod/private-fields.js <package-dir> [--dry-run]
//
// Deliberately narrow: no renames beyond the prefix, no reordering, no cleanup.
// Anything else belongs in a separate commit.

const fs = require('fs');
const path = require('path');

const { Project, Scope, SyntaxKind } = require('ts-morph');

const SKIP_DIRS = ['node_modules', '.git', '.dist'];

const sourceGlobs = (dir) => [
  path.join(dir, '**/*.ts'),
  `!${path.join(dir, '**/*.d.ts')}`,
  ...SKIP_DIRS.map((name) => `!${path.join(dir, '**', name, '**')}`),
];

const apply = (dir, { dryRun = false, includeTests = false } = {}) => {
  const tsConfigFilePath = path.join(dir, 'tsconfig.json');
  const project = new Project({
    tsConfigFilePath: fs.existsSync(tsConfigFilePath)
      ? tsConfigFilePath
      : undefined,
    skipAddingFilesFromTsConfig: true,
  });

  project.addSourceFilesAtPaths(sourceGlobs(dir));

  const report = {
    fields: [],
    methods: [],
    brandChecks: [],
    collisions: [],
    files: new Set(),
  };

  project.getSourceFiles().forEach((sourceFile) => {
    const filePath = sourceFile.getFilePath();

    if (!includeTests && /[\\/]tests?[\\/]/.test(filePath)) {
      project.removeSourceFile(sourceFile);

      return;
    }

    // `#x in obj` is the ergonomic brand check and has no `private` equivalent.
    // None exist today; if one appears it must be rewritten by hand.
    sourceFile
      .getDescendantsOfKind(SyntaxKind.BinaryExpression)
      .forEach((expression) => {
        if (
          expression.getOperatorToken().getKind() === SyntaxKind.InKeyword &&
          expression.getLeft().getKind() === SyntaxKind.PrivateIdentifier
        ) {
          report.brandChecks.push(
            `${path.relative(dir, filePath)}: ${expression.getText()}`
          );
        }
      });

    // `getClasses()` returns declarations only. `core-unit-transport` builds its
    // `Transport` as a mixin — `(Base) => class Transport extends Base {…}` —
    // and its fields are just as private, so walk expressions too.
    const classes = [
      ...sourceFile.getClasses(),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.ClassExpression),
    ];

    classes.forEach((declaration) => {
      const existing = new Set(
        declaration.getMembers().flatMap((member) => {
          const name = member.getName ? member.getName() : null;

          return name && !name.startsWith('#') ? [name] : [];
        })
      );

      declaration.getProperties().forEach((property) => {
        const nameNode = property.getNameNode();

        if (nameNode.getKind() !== SyntaxKind.PrivateIdentifier) {
          return;
        }

        const name = nameNode.getText();

        // Static fields and module-level `#` are out of scope for this stage.
        if (property.isStatic()) {
          return;
        }

        const renamed = `_${name.slice(1)}`;

        if (existing.has(renamed)) {
          report.collisions.push(
            `${path.relative(dir, filePath)}: ${declaration.getName() || '<anonymous class>'}.${name} → ${renamed} already exists`
          );

          return;
        }

        // Rename before setting the scope: an accessibility modifier on a
        // private identifier is a syntax error, and ts-morph reparses in
        // between.
        property.rename(renamed);

        // TS4094: a member of an exported class expression may not be private
        // or protected, because the inferred type cannot express it.
        // `core-unit-transport`'s `Transport` mixin is one, so its fields take
        // the `_` prefix and no modifier. They already appeared in the emitted
        // declaration as `'__#30@#ruleRegistry'`; this makes them legible
        // rather than newly public.
        if (declaration.getKind() !== SyntaxKind.ClassExpression) {
          property.setScope(Scope.Private);
        }

        report.fields.push(
          `${path.relative(dir, filePath)}: ${declaration.getName() || '<anonymous class>'}.${name} → ${renamed}`
        );
        report.files.add(filePath);
      });

      declaration.getMethods().forEach((method) => {
        if (method.getNameNode().getKind() === SyntaxKind.PrivateIdentifier) {
          report.methods.push(
            `${path.relative(dir, filePath)}: ${declaration.getName() || '<anonymous class>'}.${method.getName()}`
          );
        }
      });
    });
  });

  if (!dryRun && report.collisions.length === 0 && report.brandChecks.length === 0) {
    project.saveSync();
  }

  return report;
};

const main = () => {
  const args = process.argv.slice(2);
  const dirs = args.filter((arg) => !arg.startsWith('--'));
  const dryRun = args.includes('--dry-run');

  if (dirs.length === 0) {
    console.error('usage: private-fields.js <package-dir>... [--dry-run]');
    process.exit(1);
  }

  let failed = false;

  dirs.forEach((dir) => {
    const resolved = path.resolve(dir);
    const report = apply(resolved, { dryRun });
    const name = path.basename(resolved);

    console.log(
      `${name.padEnd(42)} ${String(report.fields.length).padStart(3)} field(s) in ${report.files.size} file(s)${dryRun ? ' (dry run)' : ''}`
    );

    if (process.env.VERBOSE) {
      report.fields.forEach((line) => console.log(`    ${line}`));
    }

    [
      ['brand check', report.brandChecks],
      ['name collision', report.collisions],
      ['private method (out of scope, left alone)', report.methods],
    ].forEach(([label, lines]) => {
      if (lines.length === 0) {
        return;
      }

      console.log(`  ${label}:`);
      lines.forEach((line) => console.log(`    ${line}`));

      if (label !== 'private method (out of scope, left alone)') {
        failed = true;
      }
    });
  });

  if (failed) {
    console.log('\nNothing was written. Resolve the above by hand first.');
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

module.exports = { apply };
