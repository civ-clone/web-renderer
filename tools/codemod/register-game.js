#!/usr/bin/env node

// Stage 3 of docs/engine-serialisation/05-engine-plan.md: a package's
// `registerRules.ts` stops registering into module singletons on import and
// becomes `register(game)`.
//
//   node tools/codemod/register-game.js <package-dir> [--dry-run]
//
// Each rule factory's parameters are already fully typed with the registry
// classes they want, so which `Game` slot each one takes is not a judgement —
// it is a lookup. That is the whole reason this is mechanical: 86 factories
// across the seventeen packages take 25 distinct parameter types, and every one
// of them is a slot.
//
// The module still registers into `defaultGame` when imported. The plugin
// loader works by importing each package for that side effect, and until it
// passes a `Game` explicitly, removing it would produce a game with silently
// absent rules — no error, just wrong behaviour.

const fs = require('fs');
const path = require('path');

const { Project, SyntaxKind } = require('ts-morph');

// Type name → `Game` slot, read from the `Game` classes themselves rather than
// hand-maintained here. A hand-written copy drifts, and the failure mode is
// passing the wrong registry positionally — silent and wrong.
//
// A package needing a slot that only the ruleset's `Game` has takes that one:
// `core-` packages depend only on other `core-` packages, so the civ1
// registries live in `civ1-game`.
const slotsFrom = (gameFile) => {
  const slots = {};

  if (!fs.existsSync(gameFile)) {
    return slots;
  }

  fs.readFileSync(gameFile, 'utf8')
    .split('\n')
    .forEach((line) => {
      const match = line.match(/^\s*readonly (\w+): (\w+);/);

      if (match) {
        slots[match[2]] = match[1];
      }
    });

  return slots;
};

const workspace = path.resolve(__dirname, '..', '..', '..');
const SLOTS = slotsFrom(path.join(workspace, 'core-game', 'Game.ts'));
const CIV1_SLOTS = slotsFrom(path.join(workspace, 'civ1-game', 'Game.ts'));

// The generator is passed as a bare `() => number`, not a class.
const RNG_TYPE = /^\(\)\s*=>\s*number$/;

const signatureOf = (sourceFile) => {
  const declaration = sourceFile.getVariableDeclaration('getRules');

  if (!declaration) {
    return null;
  }

  // Prefer the declared type annotation over the implementation's parameters.
  // The annotation is always fully typed; an implementation parameter can be
  // left to inference — `engine = engineInstance` in `civ1-city-happiness` —
  // and reading that one would silently drop a parameter from the call.
  const typeNode = declaration.getTypeNode();
  const parameters =
    typeNode && typeNode.getParameters
      ? typeNode.getParameters()
      : (declaration.getInitializer() || {}).getParameters
        ? declaration.getInitializer().getParameters()
        : null;

  if (!parameters) {
    return null;
  }

  return parameters.map((parameter) => {
    const type = (parameter.getTypeNode() || { getText: () => '' })
      .getText()
      .trim();

    if (RNG_TYPE.test(type)) {
      return { type, slot: 'rng' };
    }

    if (SLOTS[type]) {
      return { type, slot: SLOTS[type] };
    }

    if (CIV1_SLOTS[type]) {
      return { type, slot: CIV1_SLOTS[type], civ1: true };
    }

    return { type, slot: null };
  });
};

const apply = (dir, { dryRun = false } = {}) => {
  const registerRules = path.join(dir, 'registerRules.ts');

  if (!fs.existsSync(registerRules)) {
    throw new Error(`${path.basename(dir)}: no registerRules.ts`);
  }

  const project = new Project({ skipAddingFilesFromTsConfig: true });

  project.addSourceFilesAtPaths([
    path.join(dir, '**/*.ts'),
    `!${path.join(dir, '**/*.d.ts')}`,
    `!${path.join(dir, '**/node_modules/**')}`,
  ]);

  const source = project.getSourceFileOrThrow(registerRules);
  const report = {
    calls: [],
    unmapped: [],
    factories: 0,
    civ1: false,
    already: false,
  };

  // Re-running found the `game.rules.register(...)` call of an already-migrated
  // file and rewrote its parent again, producing `export const register =
  // export const register = ...`. Idempotence matters here because a rollout
  // across seventeen packages will be re-run after any one of them fails.
  if (source.getVariableDeclaration('register')) {
    report.already = true;

    return report;
  }

  // Which local module each imported factory came from, so its signature can
  // be read rather than guessed.
  const factories = new Map();

  source.getImportDeclarations().forEach((declaration) => {
    const specifier = declaration.getModuleSpecifierValue();
    const defaultImport = declaration.getDefaultImport();

    if (!defaultImport || !specifier.startsWith('.')) {
      return;
    }

    const resolved = project.getSourceFile(
      path.resolve(dir, specifier + '.ts')
    );

    if (resolved) {
      factories.set(defaultImport.getText(), resolved);
    }
  });

  const registerCall = source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => /\.register$/.test(call.getExpression().getText()));

  if (!registerCall) {
    throw new Error(`${path.basename(dir)}: no \`.register(...)\` call found`);
  }

  const args = registerCall.getArguments().map((argument) => {
    const text = argument.getText();
    const name = (text.match(/^\.\.\.(\w+)\(\)$/) || [])[1];

    if (!name || !factories.has(name)) {
      return text;
    }

    report.factories += 1;

    const signature = signatureOf(factories.get(name));

    if (!signature || signature.length === 0) {
      report.calls.push(`${name}()`);

      return `...${name}()`;
    }

    const missing = signature.filter((parameter) => !parameter.slot);

    if (missing.length > 0) {
      report.unmapped.push(
        `${name}: ${missing.map((parameter) => parameter.type).join(', ')}`
      );

      return text;
    }

    if (signature.some((parameter) => parameter.civ1)) {
      report.civ1 = true;
    }

    const passed = signature.map((parameter) => `game.${parameter.slot}`);

    report.calls.push(`${name}(${passed.join(', ')})`);

    return `...${name}(${passed.join(', ')})`;
  });

  if (report.unmapped.length > 0) {
    return report;
  }

  const rest = args.filter((text) => !text.startsWith('...'));
  const spread = args.filter((text) => text.startsWith('...'));

  source.addImportDeclaration({
    moduleSpecifier: report.civ1 ? '@civ-clone/civ1-game' : '@civ-clone/core-game',
    namedImports: [{ name: 'Game' }, { name: 'defaultGame' }],
  });

  registerCall.getParent().replaceWithText(
    `export const register = (game: Game): void =>
  game.rules.register(
    ${[...spread, ...rest].join(',\n    ')}
  );

// The plugin loader imports each package for this side effect. Until it passes
// a \`Game\` of its own, dropping it would produce a game with silently absent
// rules — no error, just wrong behaviour.
register(defaultGame);

export default register`
  );

  // The singleton `RuleRegistry` import is what the old top-level call used;
  // nothing references it once the call becomes `game.rules.register`.
  source.getImportDeclarations().forEach((declaration) => {
    const named = declaration.getNamedImports();

    if (named.length === 0) {
      return;
    }

    const unused = named.filter((namedImport) => {
      const name = (namedImport.getAliasNode() || namedImport.getNameNode())
        .getText();

      return (
        source
          .getDescendantsOfKind(SyntaxKind.Identifier)
          .filter((identifier) => identifier.getText() === name).length <= 1
      );
    });

    unused.forEach((namedImport) => namedImport.remove());

    if (
      declaration.getNamedImports().length === 0 &&
      !declaration.getDefaultImport() &&
      !declaration.getNamespaceImport()
    ) {
      declaration.remove();
    }
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
  let failed = false;

  dirs.forEach((dir) => {
    const resolved = path.resolve(dir);
    const report = apply(resolved, { dryRun });

    console.log(
      `${path.basename(resolved).padEnd(24)} ${String(report.factories).padStart(2)} factories, ${report.civ1 ? 'civ1-game' : 'core-game'}${dryRun ? ' (dry run)' : ''}`
    );

    if (process.env.VERBOSE) {
      report.calls.forEach((line) => console.log(`    ${line}`));
    }

    report.unmapped.forEach((line) => {
      console.log(`  ! no Game slot for: ${line}`);
      failed = true;
    });
  });

  if (failed) {
    console.log('\nNothing written. Add the missing slots to SLOTS first.');
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

module.exports = { SLOTS, apply };
