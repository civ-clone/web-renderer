const fs = require('fs');
const path = require('path');

const { checkoutPath, webRenderer } = require('./paths');

const ts = require(path.join(webRenderer, 'node_modules', 'typescript'));

// Engine-specific checks a general linter cannot express, because they are
// about what a *save* can carry rather than what the code says.
//
// **No rule registered inside an `Effect`.** A rule is a closure, so one
// registered while the game runs exists only in memory: nothing in a save
// records it, and a game loaded from that save silently lacks it. Darwin's
// Voyage did exactly this — a `Started` rule registered from inside the
// wonder's completion effect, which registered another from inside its own —
// and a save taken between building the wonder and the next research lost the
// two free advances with no symptom. The fix was a `PendingEffect`: record the
// debt as state, and register the rule that discharges it once, at import.
//
// Rules may still be *enabled and disabled* inside an effect. `civ1-player`'s
// `Defeated` disables its siblings for the duration of one call and restores
// them before returning, so nothing about that outlives the call — `01-
// constraints.md` §4.
//
// Found by walking the AST rather than by regex, and scoped to what an effect
// body actually contains, because two different spellings reach the same bug:
//
//   ruleRegistry.register(new Started(…))        — a rule constructed inline
//   const onStarted = new Started(…);
//   ruleRegistry.register(onStarted);            — Darwin's, bound first
//
// A `.register()` inside an effect is flagged when its receiver names a rule
// registry (`ruleRegistry`, `this.ruleRegistry()`, `game.rules`), or when an
// argument is a rule — constructed inline, or bound to one earlier in the same
// effect. A rule class is anything imported from a `/Rules/` module or from
// `core-rule/Rule`, which is how every rule in the estate is declared.
const RULE_RECEIVER = /\brules?\b|ruleRegistry/i;

const sourcesIn = (dir) => {
  const found = [];
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

      if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        found.push(full);
      }
    });
  };

  walk(dir);

  return found;
};

const ruleClassesIn = (source) => {
  const names = new Set();

  source.statements.forEach((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause ||
      !/\/Rules\/|core-rule\/Rule$/.test(statement.moduleSpecifier.text)
    ) {
      return;
    }

    if (statement.importClause.name) {
      names.add(statement.importClause.name.text);
    }

    const bindings = statement.importClause.namedBindings;

    if (bindings && ts.isNamedImports(bindings)) {
      bindings.elements.forEach((element) => names.add(element.name.text));
    }
  });

  return names;
};

const findings = (file) => {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const ruleClasses = ruleClassesIn(source);
  const out = [];

  const constructsRule = (node) =>
    ts.isNewExpression(node) && ruleClasses.has(node.expression.getText());

  const visitEffect = (effect) => {
    // Identifiers bound to a rule anywhere in this effect, so the bound-first
    // spelling is caught as well as the inline one.
    const boundRules = new Set();

    const collect = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        constructsRule(node.initializer)
      ) {
        boundRules.add(node.name.text);
      }

      ts.forEachChild(node, collect);
    };

    collect(effect);

    const check = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'register'
      ) {
        const receiver = node.expression.expression.getText();
        const ruleArgument = node.arguments.find(
          (argument) =>
            constructsRule(argument) ||
            (ts.isIdentifier(argument) && boundRules.has(argument.text))
        );

        if (RULE_RECEIVER.test(receiver) || ruleArgument) {
          out.push({
            line:
              source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            text: node.getText().replace(/\s+/g, ' ').slice(0, 80),
          });
        }
      }

      ts.forEachChild(node, check);
    };

    effect.arguments?.forEach(check);
  };

  const visit = (node) => {
    if (ts.isNewExpression(node) && node.expression.getText() === 'Effect') {
      visitEffect(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return out;
};

const everyCheckout = () => {
  const root = path.dirname(checkoutPath('x'));

  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'web-renderer')
      .map((entry) => entry.name)
      .filter((name) =>
        fs.existsSync(path.join(checkoutPath(name), 'package.json'))
      );
  } catch (e) {
    return [];
  }
};

// Arguments ending in `.ts` are files, which is how the check is inverted
// against source that no longer exists in any checkout — `git show` the old
// Darwin's Voyage into a file and lint that.
const run = (args) => {
  const named = args.filter((arg) => !arg.startsWith('--'));
  const files = named.filter((arg) => arg.endsWith('.ts'));
  const packages = named.filter((arg) => !arg.endsWith('.ts'));
  const targets = [
    ...files.map((file) => [file, path.resolve(file)]),
    ...(packages.length > 0 || files.length === 0
      ? (packages.length > 0 ? packages : everyCheckout()).flatMap((name) =>
          sourcesIn(checkoutPath(name)).map((file) => [
            `${name}/${path.relative(checkoutPath(name), file)}`,
            file,
          ])
        )
      : []),
  ];

  const hits = targets.flatMap(([label, file]) =>
    findings(file).map((finding) => ({ label, ...finding }))
  );

  console.log(
    `${targets.length} file(s) checked, ${hits.length} rule(s) registered inside an Effect`
  );

  if (hits.length === 0) {
    return;
  }

  hits.forEach(({ label, line, text }) =>
    console.log(`  ! ${label}:${line}  ${text}`)
  );

  console.log(
    '\nA rule registered while the game runs exists only in memory, so a save\n' +
      'cannot carry it and a loaded game silently lacks it. Record what is owed\n' +
      'as a `PendingEffect` and register the rule that discharges it once, at\n' +
      "import — see civ1-wonder's `Rules/PlayerResearch/started.ts`."
  );

  process.exitCode = 1;
};

module.exports = { findings, run, sourcesIn };
