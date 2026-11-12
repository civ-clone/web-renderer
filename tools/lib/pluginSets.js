// The plugin sets a game can be played with (#668): each a list of plugins it names, `civ-clone.sets` in the root
//  `package.json`, and everything they depend on. Worked out here, when the plugin list is written, and nowhere in the
//  browser.
//
//   sets: { [id]: { plugins: string[], extends?: string, rules?: string } }
//   plugins: [{ name, dependencies: string[], conflicts: string[] }], every plugin installed
//   dependenciesOf: (name) => string[] | null, any other installed package's, or null for one that isn't installed
//
// A set's plugins are those it names, the ones the set it `extends` names, and every installed plugin any of them
//  depends on (`dependencies` and `peerDependencies`), however indirectly: through a library too (a package with no
//  entry point, such as `library-civilization`, which brings in the civilizations), but never through a package left
//  out by `excludes`. They load in package name order (#474): rules at the same
//  priority run in the order they were registered, so the order is part of how the game plays.
//
// Anything wrong is a problem, and the plugin list isn't written: a set naming a plugin that isn't installed, two
//  plugins in one set where one says it conflicts with the other (`civ-clone.conflicts` in its `package.json`), a set
//  that extends one that isn't there or extends itself, a set with no worker rules, and a plugin installed that no set
//  loads, which would otherwise be left out of every game without a word.

// Plugins are ordered and looked up by package name (#474), which today is always the package's folder name too: an
//  aliased install whose name differs from its folder would sort differently from main's directory order.
const byName = (a, b) => {
  const [x, y] = [a, b].map((name) => name.replace(/^@[^/]+\//, ''));

  return x < y ? -1 : x > y ? 1 : 0;
};

const resolvePluginSets = (sets, plugins, dependenciesOf = () => null) => {
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
        queue.push(...installed.get(name).dependencies);

        continue;
      }

      queue.push(...(dependenciesOf(name) ?? []));
    }

    members.forEach((name) =>
      installed
        .get(name)
        .conflicts.filter((other) => members.has(other))
        .forEach((other) =>
          problems.push(`set ${id} has ${name}, which conflicts with ${other}`)
        )
    );

    if (typeof rules !== 'string') {
      problems.push(`set ${id} has no worker rules (\`rules\`)`);
    }

    members.forEach((name) => loaded.add(name));
    resolved.push({ id, plugins: [...members].sort(byName), rules });
  });

  plugins
    .filter(({ name }) => !loaded.has(name))
    .forEach(({ name }) =>
      problems.push(
        `${name} is installed, but no set loads it: add it to a set, or to \`excludes\``
      )
    );

  return { sets: resolved, problems };
};

module.exports = { byName, resolvePluginSets };
