// The plugin sets a game can be played with (#668): each a list of plugins it names, `civ-clone.sets` in the root
//  `package.json`, and everything they depend on. Worked out here, when the plugin list is written, and nowhere in the
//  browser.
//
//   sets: { [id]: { plugins: string[], extends?: string, rules?: string, hidden?: boolean, tileset?: string } }
//   plugins: [{ name, dependencies: string[], conflicts: string[], importsOnly?: string[] }], every plugin installed
//   dependenciesOf: (name) => string[] | null, any other installed package's, or null for one that isn't installed
//   conflicts: { [name]: string[] }, conflicts declared for plugins beside their own (`civ-clone.conflicts` in the root
//    `package.json`): for plugins that don't declare them themselves yet, such as Civ2's against their Civ1 twins
//
// A set's plugins are those it names, the ones the set it `extends` names, and every installed plugin any of them
//  depends on (`dependencies` and `peerDependencies`), however indirectly: through a library too (a package with no
//  entry point, such as `library-civilization`, which brings in the civilizations), but never through a package left
//  out by `excludes`. They load in package name order (#474): rules at the same
//  priority run in the order they were registered, so the order is part of how the game plays.
//
// A package's `civ-clone.importsOnly` lists dependencies it only imports modules from, and doesn't need loaded as
//  plugins: the walk doesn't follow them from that package. That keeps a plugin shared between sets, such as an AI
//  that imports one rule set's units to reason about them, from bringing that rule set into every set it's in. Only
//  that one step is skipped: a package listed there is still in a set that names it, or reaches it some other way.
//
// Anything wrong is a problem, and the plugin list isn't written: a set naming a plugin that isn't installed, two
//  plugins in one set where one says it conflicts with the other (`civ-clone.conflicts` in its `package.json`, or the
//  root's for it), a set that extends one that isn't there or extends itself, a set with no worker rules, and a plugin
//  installed that no set loads, which would otherwise be left out of every game without a word.

// Plugins are ordered and looked up by package name (#474), which today is always the package's folder name too: an
//  aliased install whose name differs from its folder would sort differently from main's directory order.
const byName = (a, b) => {
  const [x, y] = [a, b].map((name) => name.replace(/^@[^/]+\//, ''));

  return x < y ? -1 : x > y ? 1 : 0;
};

// The dependencies a set's walk follows from a package: all of them, but those it only imports.
const followedDependencies = ({ dependencies = [], importsOnly = [] }) =>
  dependencies.filter((name) => !importsOnly.includes(name));

const resolvePluginSets = (
  sets,
  plugins,
  dependenciesOf = () => null,
  conflicts = {}
) => {
  const installed = new Map(plugins.map((plugin) => [plugin.name, plugin])),
    problems = [],
    resolved = [],
    loaded = new Set();

  // What a set names, with what the sets it extends name, and its rules: its own, or the nearest it extends.
  const named = (id, seen = []) => {
    const set = sets[id];

    if (!set) {
      problems.push(
        `set ${seen[seen.length - 1]} extends ${id}, which there isn't`
      );

      return { roots: [], rules: undefined };
    }

    if (seen.includes(id)) {
      problems.push(`set ${id} extends itself`);

      return { roots: [], rules: undefined };
    }

    const parent =
      set.extends === undefined
        ? { roots: [], rules: undefined }
        : named(set.extends, [...seen, id]);

    return {
      roots: [...parent.roots, ...(set.plugins ?? [])],
      rules: set.rules ?? parent.rules,
    };
  };

  Object.keys(sets).forEach((id) => {
    const { roots, rules } = named(id),
      members = new Set(),
      visited = new Set(),
      queue = [...roots];

    roots
      .filter((name) => !installed.has(name))
      .forEach((name) =>
        problems.push(
          `set ${id} names ${name}, which isn't an installed plugin`
        )
      );

    while (queue.length > 0) {
      const name = queue.shift();

      if (visited.has(name)) {
        continue;
      }

      visited.add(name);

      if (installed.has(name)) {
        members.add(name);
        queue.push(...followedDependencies(installed.get(name)));

        continue;
      }

      queue.push(...(dependenciesOf(name) ?? []));
    }

    members.forEach((name) =>
      installed
        .get(name)
        .conflicts.concat(conflicts[name] ?? [])
        .filter((other) => members.has(other))
        .forEach((other) =>
          problems.push(`set ${id} has ${name}, which conflicts with ${other}`)
        )
    );

    if (typeof rules !== 'string') {
      problems.push(`set ${id} has no worker rules (\`rules\`)`);
    }

    // Anything but true or false would otherwise read as "offered".
    if ('hidden' in sets[id] && typeof sets[id].hidden !== 'boolean') {
      problems.push(
        `set ${id} has \`hidden\` ${JSON.stringify(
          sets[id].hidden
        )}, which isn't true or false`
      );
    }

    // The art pack a set's games are drawn with, by its tileset id: a page offers the set only once the player has
    //  imported it. A name, or nothing.
    if (
      'tileset' in sets[id] &&
      (typeof sets[id].tileset !== 'string' || sets[id].tileset === '')
    ) {
      problems.push(
        `set ${id} has \`tileset\` ${JSON.stringify(
          sets[id].tileset
        )}, which isn't a tileset's id`
      );
    }

    // A set built on one drawn with an art pack of its own is drawn with art too, and says which: one that didn't
    //  would be offered to a player without that art.
    if (!('tileset' in sets[id])) {
      const seen = new Set([id]);

      for (
        let ancestor = sets[id].extends;
        typeof ancestor === 'string' &&
        sets[ancestor] !== undefined &&
        !seen.has(ancestor);
        ancestor = sets[ancestor].extends
      ) {
        seen.add(ancestor);

        if (typeof sets[ancestor].tileset === 'string') {
          problems.push(
            `set ${id} extends ${ancestor}, which is drawn with the ${sets[ancestor].tileset} art, but names no \`tileset\` of its own`
          );

          break;
        }
      }
    }

    members.forEach((name) => loaded.add(name));
    // A hidden set is one a game can be played with that the page doesn't offer yet, unless the player has imported
    //  the art pack it names (`tileset`). Both its own settings, not the one it extends', so a set built on a hidden
    //  one is offered unless it says otherwise.
    resolved.push({
      id,
      plugins: [...members].sort(byName),
      rules,
      hidden: sets[id].hidden === true,
      tileset: typeof sets[id].tileset === 'string' ? sets[id].tileset : null,
    });
  });

  // A conflict declared for a name that isn't an installed plugin guards nothing, so a misspelt one is said.
  Object.entries(conflicts).forEach(([name, others]) =>
    [name, ...others]
      .filter((other) => !installed.has(other))
      .forEach((other) =>
        problems.push(
          `\`civ-clone.conflicts\` names ${other}, which isn't an installed plugin`
        )
      )
  );

  plugins
    .filter(({ name }) => !loaded.has(name))
    .forEach(({ name }) =>
      problems.push(
        `${name} is installed, but no set loads it: add it to a set, or to \`excludes\``
      )
    );

  return { sets: resolved, problems };
};

// What's wrong with the sets a game gets without asking (`civ-clone.defaultSet` and `setForSavesWithoutOne`), given the
//  resolved sets: each must be a set, not a hidden one, which the page doesn't offer, and not one that needs art the
//  player may not have imported.
const defaultSetProblems = (config, sets) =>
  [
    ['defaultSet', 'the set a new game is played with'],
    [
      'setForSavesWithoutOne',
      'the set a save made before there were sets loads with',
    ],
  ].flatMap(([key, what]) => {
    const set = sets.find(({ id }) => id === config[key]);

    if (set === undefined) {
      return [
        `\`civ-clone.${key}\`, ${what}, is ${JSON.stringify(
          config[key]
        )}, which isn't a set`,
      ];
    }

    if (set.hidden) {
      return [
        `\`civ-clone.${key}\`, ${what}, is ${JSON.stringify(
          config[key]
        )}, which is hidden`,
      ];
    }

    // A game without the player's art would have nothing to draw it with.
    return typeof set.tileset === 'string'
      ? [
          `\`civ-clone.${key}\`, ${what}, is ${JSON.stringify(
            config[key]
          )}, which needs the ${set.tileset} art imported`,
        ]
      : [];
  });

module.exports = {
  byName,
  defaultSetProblems,
  followedDependencies,
  resolvePluginSets,
};
