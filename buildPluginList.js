const fsModule = require('fs');
const globModule = require('glob');
const path = require('path');
const {
  byName,
  followedDependencies,
  resolvePluginSets,
} = require('./tools/lib/pluginSets');

// Each package's plugin entry point, sorted by package directory name.
//
// The order matters: rules at the same priority run in the order they were
// registered, and a plugin registers its rules when it is imported, so the
// import order is part of how the game plays. `glob` returns whatever order
// the filesystem lists a directory in — reverse-alphabetical on APFS, hash
// order on ext4 — so without the sort a game played on another machine, or on
// CI, plays differently from the same seed here (#474).
//
// A package with no entry point at all is a library, not a plugin, and is left
// out quietly. One that declares a `main` that is not there, or whose
// `package.json` cannot be read, is left out with a warning.
const getScriptEntrypoints = (glob = globModule, fs = fsModule) => {
  const config = require('./package.json')['civ-clone'] ?? {},
    excludes = config.excludes ?? [],
    paths = config.paths ?? ['node_modules/@civ-clone/*'],
    entrypoints = [];

  paths.forEach((pattern) => {
    (glob.sync(pattern, { cwd: __dirname, absolute: true }) || []).forEach(
      (pathName) => {
        // The frontend's own packages, `@civ-clone/ui-*` (#825), are this repository's, never plugins.
        if (
          excludes.includes(path.basename(pathName)) ||
          path.basename(pathName).startsWith('ui-')
        ) {
          return;
        }

        let packageDetails;

        try {
          packageDetails = JSON.parse(
            fs.readFileSync(path.resolve(pathName, 'package.json'), 'utf8')
          );
        } catch (e) {
          console.warn(`skipped ${pathName}: ${e.message}`);

          return;
        }

        const record = (entrypoint) =>
          entrypoints.push({
            directory: path.basename(pathName),
            entrypoint,
            name: packageDetails.name,
            version: packageDetails.version,
            // What it needs loaded with it, and what it can't be loaded with (#668): only the plugins among them
            //  count, which `resolvePluginSets` sorts out.
            dependencies: Object.keys({
              ...(packageDetails.dependencies ?? {}),
              ...(packageDetails.peerDependencies ?? {}),
            }),
            conflicts: (packageDetails['civ-clone'] ?? {}).conflicts ?? [],
            // Those of them it only imports modules from, which a set doesn't load for it.
            importsOnly: (packageDetails['civ-clone'] ?? {}).importsOnly ?? [],
          });

        if (typeof packageDetails.main === 'string') {
          const main = path.resolve(pathName, packageDetails.main);

          if (!fs.existsSync(main)) {
            console.warn(
              `skipped ${packageDetails.name}: its main, ${packageDetails.main}, does not exist`
            );

            return;
          }

          record(main);

          return;
        }

        const index = path.resolve(pathName, 'index.js');

        if (fs.existsSync(index)) {
          record(index);
        }
      }
    );
  });

  return entrypoints.sort((a, b) =>
    a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0
  );
};

const entrypoints = getScriptEntrypoints();

if (entrypoints.length === 0) {
  console.error(
    'buildPluginList: no plugins found under ' +
      path.join(__dirname, 'node_modules', '@civ-clone') +
      ' — is node_modules installed?'
  );

  process.exit(1);
}

// The sets a game can be played with (#668), `civ-clone.sets`: each the plugins it names and everything they depend
//  on, and the worker rules it is played with (#865), what the worker client needs that only those rules have.
// Engine packages a set reaches whose `package.json` can't be read from the root `node_modules`.
const unreadable = new Set();

const config = require('./package.json')['civ-clone'] ?? {},
  excluded = new Set(config.excludes ?? []),
  // A library's dependencies, followed to the plugins beyond it, but not those it only imports; never an excluded
  //  package's.
  dependenciesOf = (name) => {
    const directory = name.replace(/^@civ-clone\//, '');

    if (!name.startsWith('@civ-clone/') || excluded.has(directory)) {
      return null;
    }

    try {
      const details = JSON.parse(
        fsModule.readFileSync(
          path.join(
            __dirname,
            'node_modules',
            '@civ-clone',
            directory,
            'package.json'
          ),
          'utf8'
        )
      );

      return followedDependencies({
        dependencies: Object.keys({
          ...(details.dependencies ?? {}),
          ...(details.peerDependencies ?? {}),
        }),
        importsOnly: (details['civ-clone'] ?? {}).importsOnly ?? [],
      });
    } catch (e) {
      // An engine package a set reaches but that isn't installed at the root (pnpm hoists every `@civ-clone/*` there)
      //  would otherwise end the walk without a word, leaving whatever it brings in out of that set.
      unreadable.add(name);

      return null;
    }
  },
  { sets, problems } = resolvePluginSets(
    config.sets ?? {},
    entrypoints,
    dependenciesOf,
    config.conflicts ?? {}
  ),
  setIds = sets.map(({ id }) => id);

unreadable.forEach((name) =>
  problems.push(
    `${name} is reached through a set's dependencies, but isn't installed in node_modules/@civ-clone, so whatever it brings in would be left out`
  )
);

[
  ['defaultSet', 'the set a new game is played with'],
  [
    'setForSavesWithoutOne',
    'the set a save made before there were sets loads with',
  ],
].forEach(([key, what]) => {
  if (!setIds.includes(config[key])) {
    problems.push(
      `\`civ-clone.${key}\`, ${what}, is ${JSON.stringify(
        config[key]
      )}, which isn't a set`
    );

    return;
  }

  // A hidden set isn't offered, so it can't be what a game gets without asking either.
  if (sets.find(({ id }) => id === config[key]).hidden) {
    problems.push(
      `\`civ-clone.${key}\`, ${what}, is ${JSON.stringify(
        config[key]
      )}, which is hidden`
    );
  }
});

if (problems.length > 0) {
  console.error(
    `buildPluginList: the plugin sets in package.json's \`civ-clone\` can't be used:\n${problems
      .map((problem) => `  - ${problem}`)
      .join('\n')}`
  );

  process.exit(1);
}

const byPackage = new Map(entrypoints.map((entry) => [entry.name, entry])),
  // Each plugin package and its version, as a save records them and a load checks them against: `core-save-game`
  //  refuses to write a save without it — an empty manifest means "cannot check compatibility", not "nothing loaded" —
  //  and `hydrate` compares it with the manifest in the file, refusing a save that needs a plugin this set does not
  //  have and reporting drift where versions differ. Sorted by name, as it always has been.
  manifestOf = (names) =>
    names
      .map((name) => byPackage.get(name))
      .filter(({ name, version }) => name && version)
      .sort((a, b) => a.name.localeCompare(b.name))
      .reduce(
        (names, { name, version }) => ({ ...names, [name]: version }),
        {}
      ),
  defaultSet = sets.find(({ id }) => id === config.defaultSet);

// Written only when it would change, and then put in place whole: the engine suites each ask for it before they run,
//  several at a time under `npm test` (#879), and one must never read a list another is halfway through writing.
const write = (target, contents) => {
  if (
    !fsModule.existsSync(target) ||
    fsModule.readFileSync(target, 'utf8') !== contents
  ) {
    const partial = `${target}.${process.pid}.tmp`;

    fsModule.writeFileSync(partial, contents);
    fsModule.renameSync(partial, target);
  }
};

// The default set, imported: what the engine suites and the arena play, as civ.one did before a game could choose
//  (#668). Importing it runs every plugin in it, so the worker's entry never does.
write(
  __dirname + '/src/js/plugins.ts',
  defaultSet.plugins
    .map((name) => `import '${byPackage.get(name).entrypoint}';`)
    .join('\n') +
    `\nimport '${defaultSet.rules}';` +
    `\n\nexport const plugins: { [name: string]: string } = ${JSON.stringify(
      manifestOf(defaultSet.plugins),
      null,
      2
    )};\n`
);

// Every set, for the worker to load one of (#668). Nothing here runs a plugin: each is behind a loader of its own, so
//  one no set chosen loads stays in the bundle unrun.
write(
  __dirname + '/src/js/pluginSets.ts',
  `// Written by \`buildPluginList.js\` (#668): civ.one's plugin sets, which \`backend.ts\` hands the worker client. Typed
//  where it is used, as \`PluginSetData\`, so that this imports nothing.
const loaders: { [name: string]: () => Promise<unknown> } = {
${[
  ...[...new Set(sets.flatMap(({ plugins }) => plugins))]
    .sort(byName)
    .map((name) => [name, byPackage.get(name).entrypoint]),
  ...[...new Set(sets.map(({ rules }) => rules))].map((rules) => [
    rules,
    rules,
  ]),
]
  .map(
    ([name, entrypoint]) =>
      `  ${JSON.stringify(name)}: () => import('${entrypoint}'),`
  )
  .join('\n')}
};

const sets: {
  id: string;
  plugins: string[];
  rules: string;
  hidden: boolean;
  manifest: { [name: string]: string };
}[] = ${JSON.stringify(
    sets.map(({ id, plugins, rules, hidden }) => ({
      id,
      plugins,
      rules,
      hidden,
      manifest: manifestOf(plugins),
    })),
    null,
    2
  )};

export const pluginSets = {
  loaders,
  sets,
  default: ${JSON.stringify(config.defaultSet)},
  withoutOne: ${JSON.stringify(config.setForSavesWithoutOne)},
};

export default pluginSets;
`
);
