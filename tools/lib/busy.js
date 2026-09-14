const fs = require('fs');
const path = require('path');

const { checkoutPath } = require('./paths');

// Every `Busy` subclass needs a way to be rebuilt after a load, and nothing at
// runtime says when one does not.
//
// `Unit._busy` is the only field in the engine that holds a `Rule`, and a rule
// is a closure, so a save records the busy state's *identity* and the ruleset
// says how to rebuild it. A subclass with no registration therefore loads as
// `UnknownBusyError` — which is the right answer, but only ever discovered by
// loading a save that happens to contain one. Three were missed that way:
//
// - `Fortifying`, found by a runtime `UnknownHandlerError` naming a
//   stringified closure.
// - `Pillaging`, found when `civ typecheck` reported four consumers failing to
//   compile against `core-unit@0.1.20`.
// - `Sleeping` and `Stowed`, found by reading `BusyRegistry`'s own doc comment
//   and checking its claims — it listed both as covered and neither was.
//
// All three were meant to be found by one grep, and the grep is why they were
// not: `node_modules/@civ-clone/*` are symlinks into pnpm's store, and
// `grep -r` does not follow symlinks. Searching there for `extends Busy`
// returns nothing whatsoever, which reads exactly like "none left to fix".
// This walks the checkouts instead, where there are no symlinks to miss.
const BUSY_SUBCLASS = /^\s*export class (\w+) extends Busy\b/m;

// Known and not a mistake, listed separately so the gate can be green. A gate
// that is permanently red gets ignored exactly like one with a false positive.
const KNOWN_MISSING = {};

// `import BusyFortified from './Rules/Fortified'` — the local name at the
// registration is not always the class name, and cannot be. `Fortified` is
// both a `Busy` rule and a `UnitImprovement`, so `base-unit-action-fortify`
// imports the rule under an alias and registers it under that. Matching on the
// local name alone reports it as unregistered, and a gate with a false positive
// is a gate that gets ignored.
//
// So local names are resolved back through the file's own imports to the module
// that declares the class. Both spellings matter:
// `import X from './path'` and `import { X as Y } from './path'`.
// Comments are stripped before anything is matched, and both directions need
// it. `registerDelayedAction`'s own doc comment contains
// `BusyRule: BuildingIrrigation` as an example, which would register an
// identity from prose; and commenting a registration out would leave the gate
// green, which is exactly what an inversion test caught it doing.
const uncommented = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const IMPORTS = [
  /import\s+(\w+)\s+from\s+'([^']+)'/g,
  /import\s+\{([^}]+)\}\s+from\s+'([^']+)'/g,
];

const importsIn = (source) => {
  const local = new Map();
  let match;

  while ((match = IMPORTS[0].exec(source)) !== null) {
    local.set(match[1], match[2]);
  }

  while ((match = IMPORTS[1].exec(source)) !== null) {
    const specifier = match[2];

    match[1].split(',').forEach((clause) => {
      const [, name = '', alias = ''] =
        clause.trim().match(/^(\w+)(?:\s+as\s+(\w+))?$/) ?? [];

      if (name) {
        local.set(alias || name, specifier);
      }
    });
  }

  IMPORTS.forEach((pattern) => (pattern.lastIndex = 0));

  return local;
};

// `registerDelayedAction({ BusyRule: X, … })` for a delayed action, or
// `busyRegistry.register(X, …)` for a stateless one. Either satisfies this; a
// delayed action registered as stateless would be a different bug, and
// `registerDelayedAction` is what prevents it by pairing the two halves.
const registrationsIn = (source) => {
  const found = new Set();

  [
    /BusyRule:\s*(\w+)/g,
    /busyRegistry(?:Instance)?\.register\(\s*(\w+)/g,
  ].forEach((pattern) => {
    let match;

    while ((match = pattern.exec(source)) !== null) {
      found.add(match[1]);
    }
  });

  return found;
};

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
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
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

const everyCheckout = () => {
  const root = path.dirname(checkoutPath('x'));

  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) =>
        fs.existsSync(path.join(checkoutPath(name), 'package.json'))
      );
  } catch (e) {
    return [];
  }
};

// Declarations and registrations are collected across the whole workspace
// before being compared, because they are routinely in different packages:
// `base-unit-action-fortify` declares `Fortified` and registers it, but
// `civ1-unit` is where several are wired up.
const survey = (names) => {
  const declared = new Map();
  // Module path (extension dropped, as an import spells it) → class name, so a
  // registration under an alias can be resolved to what it actually names.
  const byModule = new Map();
  const sites = [];

  names.forEach((name) => {
    sourcesIn(checkoutPath(name)).forEach((file) => {
      const source = uncommented(fs.readFileSync(file, 'utf8'));
      const match = source.match(BUSY_SUBCLASS);

      if (match) {
        declared.set(
          match[1],
          `${name}/${path.relative(checkoutPath(name), file)}`
        );
        byModule.set(file.replace(/\.ts$/, ''), match[1]);
      }

      const found = registrationsIn(source);

      if (found.size > 0) {
        sites.push({ file, imports: importsIn(source), found, name });
      }
    });
  });

  const registered = new Map();

  sites.forEach(({ file, imports, found, name }) => {
    found.forEach((local) => {
      const specifier = imports.get(local);
      const resolved = specifier?.startsWith('.')
        ? byModule.get(path.resolve(path.dirname(file), specifier))
        : undefined;
      const identity = resolved ?? local;

      if (!registered.has(identity)) {
        registered.set(identity, name);
      }
    });
  });

  return { declared, registered };
};

const run = (args) => {
  const named = args.filter((arg) => !arg.startsWith('--'));
  const names = named.length > 0 ? named : everyCheckout();
  const { declared, registered } = survey(names);

  if (declared.size === 0) {
    console.log('No `Busy` subclass found. Is the workspace checked out?');

    return;
  }

  const unregistered = [...declared.entries()].filter(
    ([identity]) => !registered.has(identity)
  );
  const missing = unregistered.filter(([identity]) => !KNOWN_MISSING[identity]);
  const known = unregistered.filter(([identity]) => KNOWN_MISSING[identity]);

  console.log(
    `${declared.size} \`Busy\` identit${
      declared.size === 1 ? 'y' : 'ies'
    } declared, ${declared.size - unregistered.length} with a way to rebuild ` +
      `them${known.length > 0 ? `, ${known.length} known-missing` : ''}${
        missing.length > 0 ? `, ${missing.length} unaccounted for` : ''
      }`
  );

  if (known.length > 0) {
    console.log('\nknown, and not a mistake:');

    known.forEach(([identity]) =>
      console.log(`  ! ${identity} — ${KNOWN_MISSING[identity]}`)
    );
  }

  if (missing.length === 0) {
    return;
  }

  console.log('');

  missing.forEach(([identity, where]) =>
    console.log(`  ! ${identity.padEnd(24)} ${where}`)
  );

  console.log(
    '\nA unit saved in one of these states fails to load: `BusyRegistry.rebuild`\n' +
      'throws rather than guess, and guessing would silently un-fortify a unit or\n' +
      'put a stowed one back on the map. Register each one where it is declared:\n\n' +
      '  - a delayed action (it calls `super.perform`) goes through\n' +
      '    `registerDelayedAction`, which pairs the factory with the\n' +
      '    `PendingEffect` carrying its completion turn.\n' +
      '  - a stateless one takes `busyRegistryInstance.register(X, factory)`.\n\n' +
      'If neither fits, the state holds something a save does not carry, and the\n' +
      'fix is to make that saveable rather than to invent it on load — then it\n' +
      'belongs in `KNOWN_MISSING` with the reason, not registered with a guess.'
  );

  process.exitCode = 1;
};

module.exports = { run, survey };
