#!/usr/bin/env node

// Stage 4 of docs/engine-serialisation/05-engine-plan.md: each stateful class
// declares the fields it does not want saved.
//
//   node tools/codemod/transient-fields.js <package-dir>... [--dry-run]
//
// The set is derived from field types, not hand-written. Stages 2 and 3 were
// mechanical for the same reason and this is the same shape of problem: a field
// typed with a registry class, `Engine`, or a generator is something the loading
// `Game` supplies, so it is transient by construction.
//
// Caches are the other category and they cannot be inferred from a type, so
// they are matched by name and listed here rather than guessed at.

const fs = require('fs');
const path = require('path');

const { Project, Scope, SyntaxKind } = require('ts-morph');

const scope = path.resolve(__dirname, '..', '..', 'node_modules', '@civ-clone');

// Anything a `Game` holds. Read from `core-game`'s own slots so the two cannot
// drift — the same source the Stage 3 codemod used.
const gameTypes = () => {
  const gameFile = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'core-game',
    'Game.ts'
  );
  const types = new Set();

  if (!fs.existsSync(gameFile)) {
    throw new Error(`cannot read ${gameFile}`);
  }

  fs.readFileSync(gameFile, 'utf8')
    .split('\n')
    .forEach((line) => {
      const match = line.match(/^\s*readonly \w+: (\w+);/);

      if (match) {
        types.add(match[1]);
      }
    });

  return types;
};

// Derived values, which must not be restored because restoring one restores a
// stale answer. Matched by name because a cache has no distinguishing type.
//
// `_cache` needs the `?`: the first spelling of this pattern was
// `_(.*Cache|cached.*|neighbours)`, which wants a character before a capital
// `Cache` and so matched `_yieldCache` and `_valueCache` but not a bare
// `_cache`. `core-game-year`'s `Year._cache` — a `Map<number, number>` filled
// by `if (!this._cache.has(turn))` — was therefore classified as state, and a
// restored memo of turn-to-year is wrong the moment the rules that computed it
// differ.
const CACHE_NAMES = /^_(.*cache|cached.*|neighbours)$/i;

// Types the loading `Game` supplies that are *not* `DataObject`s, so they can
// be neither saved as an entity reference nor rebuilt from one.
//
// This cannot come from the type alone, and the obvious generalisation is
// wrong. `Generator` is a member of `GeneratorRegistry`, which is a `Game`
// slot — but so is `City` a member of `CityRegistry`, and `CityGrowth._city`
// must certainly be saved. The difference is that `City` is a `DataObject` and
// `Generator` only `implements IGenerator`, so "member of a Game registry" is
// not the test; "supplied by the Game and not itself saveable" is, and that is
// a judgement per type rather than a rule.
//
// `Rule` descendants are deliberately absent. `Unit._busy` holds a `Busy` rule
// and is equally unsaveable, but it is real state — a fortified unit must load
// fortified — so it wants a rule *identity*, which is Stage 6's named rules.
// Listing it here would silently drop it instead.
const GAME_SUPPLIED = new Set(['Generator']);

// A generator arrives as a bare function rather than a class.
const FUNCTION_TYPE = /^\(\s*\)\s*=>\s*number$/;

// Only `DataObject`s are saved. Computed from the tree rather than assumed,
// because the chain crosses packages — `Unit extends Buildable extends
// DataObject` spans three of them. Without this, `SimpleAIClient` (a client,
// not an entity) was being given a declaration for its arrow-function fields.
const dataObjectDescendants = (scope) => {
  const bases = new Map();

  fs.readdirSync(scope).forEach((pkg) => {
    let dir;

    try {
      dir = fs.realpathSync(path.join(scope, pkg));
    } catch (e) {
      return;
    }

    const walk = (current) => {
      let entries;

      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch (e) {
        return;
      }

      entries.forEach((entry) => {
        const full = path.join(current, entry.name);

        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'tests'].includes(entry.name)) {
            walk(full);
          }

          return;
        }

        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) {
          return;
        }

        [
          ...fs
            .readFileSync(full, 'utf8')
            .matchAll(
              /^export (?:abstract )?class (\w+)[\s\S]{0,80}?extends\s+(\w+)/gm
            ),
        ].forEach(([, name, base]) => bases.set(name, base));
      });
    };

    walk(dir);
  });

  const descendants = new Set(['DataObject']);
  let changed = true;

  while (changed) {
    changed = false;

    bases.forEach((base, name) => {
      if (descendants.has(base) && !descendants.has(name)) {
        descendants.add(name);
        changed = true;
      }
    });
  }

  return descendants;
};

const isTransient = (name, type, types) =>
  types.has(type) ||
  GAME_SUPPLIED.has(type) ||
  /Registry$/.test(type) ||
  /^I\w+Registry$/.test(type) ||
  FUNCTION_TYPE.test(type) ||
  CACHE_NAMES.test(name);

const apply = (dir, { dryRun = false } = {}) => {
  if (!fs.existsSync(dir)) {
    throw new Error(`${path.basename(dir)}: no checkout at ${dir}`);
  }

  const types = gameTypes();
  const saved = dataObjectDescendants(scope);
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  project.addSourceFilesAtPaths([
    path.join(dir, '**/*.ts'),
    `!${path.join(dir, '**/*.d.ts')}`,
    `!${path.join(dir, '**/node_modules/**')}`,
  ]);

  const report = { classes: [], skipped: [], unknown: [] };

  project.getSourceFiles().forEach((sourceFile) => {
    const relative = path.relative(dir, sourceFile.getFilePath());

    if (/(^|[\\/])tests?[\\/]/.test(relative)) {
      return;
    }

    sourceFile.getClasses().forEach((declaration) => {
      // Only entities are saved, so only they need the declaration.
      // Registries are containers: their membership is saved as id lists
      // against the save's entity table, not as fields of the registry.
      const extended = declaration.getExtends();

      if (!extended) {
        return;
      }

      const base = extended.getText();
      const name = declaration.getName() || '';

      if (/Registry$/.test(name) || /Registry\b/.test(base)) {
        report.skipped.push(`${relative}: ${name} is a registry`);

        return;
      }

      if (!saved.has(name)) {
        report.skipped.push(`${relative}: ${name} is not a DataObject`);

        return;
      }

      if (declaration.getStaticProperty('transient')) {
        report.skipped.push(
          `${relative}: ${declaration.getName()} already declares`
        );

        return;
      }

      const transient = [];
      let fields = 0;

      declaration.getProperties().forEach((property) => {
        if (property.isStatic()) {
          return;
        }

        const field = property.getName();

        if (!field.startsWith('_')) {
          return;
        }

        fields += 1;

        // Fall back to the initialiser when there is no annotation:
        // `private _attributes = new AttributeRegistry()` says what it holds
        // just as clearly as a type would.
        const annotated = (property.getTypeNode() || { getText: () => '' })
          .getText()
          .trim();
        const initializer = property.getInitializer();
        const constructed =
          !annotated &&
          initializer &&
          initializer.getKind() === SyntaxKind.NewExpression
            ? initializer.getExpression().getText()
            : '';
        const type = annotated || constructed;

        // A cache is recognised by name, so it can be classified even when the
        // field has no type annotation — `Layout._cachedSearch` has none.
        if (!type && !CACHE_NAMES.test(field)) {
          report.unknown.push(`${relative}: ${name}.${field}`);

          return;
        }

        if (isTransient(field, type, types)) {
          transient.push(field);
        }
      });

      if (fields === 0 || transient.length === 0) {
        return;
      }

      declaration.insertProperty(0, {
        isStatic: true,
        isReadonly: true,
        name: 'transient',
        initializer: `[${transient.map((name) => `'${name}'`).join(', ')}]`,
      });

      report.classes.push(`${relative}: ${name} — ${transient.join(', ')}`);
    });
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
    console.error('usage: transient-fields.js <package-dir>... [--dry-run]');
    process.exit(1);
  }

  dirs.forEach((dir) => {
    const resolved = path.resolve(dir);
    const report = apply(resolved, { dryRun });

    console.log(
      `${path.basename(resolved).padEnd(26)} ${String(
        report.classes.length
      ).padStart(2)} class(es)${dryRun ? ' (dry run)' : ''}`
    );

    if (process.env.VERBOSE) {
      report.classes.forEach((line) => console.log(`    ${line}`));
    }

    report.unknown.forEach((line) =>
      console.log(`  ! untyped field, cannot classify: ${line}`)
    );
  });
};

if (require.main === module) {
  main();
}

module.exports = { apply, isTransient };
