// The frontend's packages (#825): each is a workspace package under `packages/`, and what it may use is what its own
//  `package.json` depends on. A file reaches another package only by name, never by a relative path out of its own,
//  and only one it depends on; every dependency it declares is one it uses, and no two packages depend on each other,
//  however far round. Each interface is a package of its own: nothing depends on one, it depends on nothing that puts
//  the page together (`game`), and only civ.one's own list of them (`src/js/interfaces.ts`) imports them.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import {
  packageOf,
  importsOf,
  sourcesUnder,
  specifiersOf,
} from './lib/imports';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}
    expected: ${JSON.stringify(expected, null, 2)}
    actual:   ${JSON.stringify(actual, null, 2)}`
    );
  }
};

type Manifest = {
  name: string;
  description?: string;
  private?: boolean;
  dependencies?: { [name: string]: string };
};

const root = process.cwd(),
  packagesRoot = join(root, 'packages'),
  scope = '@civ-clone/ui-',
  names = readdirSync(packagesRoot)
    .filter((name) => existsSync(join(packagesRoot, name, 'package.json')))
    .sort(),
  manifests: { [name: string]: Manifest } = Object.fromEntries(
    names.map((name) => [
      name,
      JSON.parse(
        readFileSync(join(packagesRoot, name, 'package.json'), 'utf8')
      ) as Manifest,
    ])
  ),
  isInterface = (name: string) => name.startsWith('interface-'),
  dependsOn = (name: string): string[] =>
    Object.keys(manifests[name].dependencies ?? {})
      .filter((dependency) => dependency.startsWith(scope))
      .map((dependency) => dependency.slice(scope.length))
      .sort();

expect(
  'every folder in packages/ is a package',
  readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .map(({ name }) => name)
    .filter((name) => !names.includes(name)),
  []
);

expect(
  'every package is named for its folder, private, says what it holds, and depends on its siblings as they are here',
  names.flatMap((name) => {
    const { name: named, description, private: isPrivate } = manifests[name],
      problems: string[] = [];

    if (named !== `${scope}${name}`) {
      problems.push(`${name}: named ${named}`);
    }

    if (isPrivate !== true) {
      problems.push(`${name}: not private`);
    }

    if (!description) {
      problems.push(`${name}: no description`);
    }

    Object.entries(manifests[name].dependencies ?? {}).forEach(
      ([dependency, range]) => {
        if (!dependency.startsWith(scope)) {
          problems.push(
            `${name}: ${dependency} (its npm dependencies stay in the root package.json, so the engine checkouts \`civ sync\` links are the ones it gets)`
          );
        } else if (range !== 'workspace:*') {
          problems.push(`${name}: ${dependency}@${range}`);
        } else if (!names.includes(dependency.slice(scope.length))) {
          problems.push(`${name}: ${dependency} is not one of the packages`);
        }
      }
    );

    return problems;
  }),
  []
);

expect(
  'the scan reads imports however they are written, and only those',
  specifiersOf(
    [
      "// import A from './a';",
      'const s = "import \'./b\'";',
      "import C from './c';",
      "export { d } from './d';",
      "import './e';",
      "const f = import ('./f');",
      "const g = require ('./g');",
      "import type { H } from './h';",
      "import I from '@civ-clone/ui-client/i';",
    ].join('\n')
  ),
  ['./c', './d', './e', './f', './g', './h', '@civ-clone/ui-client/i']
);

// Every engine package the UI packages import is in the root `package.json`, which is where their npm dependencies stay
//  for now (#862): one that isn't resolves only through another package's install and the hoisting, and goes the day
//  that one stops needing it.
const rootManifest = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8')
  ) as Manifest & { devDependencies?: { [name: string]: string } },
  rootDependencies = {
    ...rootManifest.dependencies,
    ...rootManifest.devDependencies,
  };

expect(
  'every engine package the UI packages import is a dependency in the root package.json',
  Array.from(
    new Set(
      names.flatMap((name) =>
        sourcesUnder(join(packagesRoot, name)).flatMap((path) =>
          specifiersOf(readFileSync(path, 'utf8'))
            .filter(
              (specifier) =>
                specifier.startsWith('@civ-clone/') &&
                !specifier.startsWith(scope)
            )
            .map((specifier) => specifier.split('/').slice(0, 2).join('/'))
        )
      )
    )
  )
    .filter((dependency) => !(dependency in rootDependencies))
    .sort(),
  []
);

const edges = names.flatMap((name) =>
  sourcesUnder(join(packagesRoot, name)).flatMap((path) =>
    importsOf(path).map((target) => ({
      from: name,
      path,
      target,
      to: packageOf(target),
    }))
  )
);

expect(
  'the scan finds the imports, by path and by name',
  [
    edges.length > 1000,
    edges.some(
      ({ path, target }) =>
        relative(packagesRoot, path) === 'city/components/openCity.ts' &&
        relative(packagesRoot, target) === 'city/components/City.ts'
    ),
    edges.some(({ from, to }) => from === 'menus' && to === 'client'),
  ],
  [true, true, true]
);

// What the packages still reach outside themselves for, by path (#825): the list only shrinks: the generated list of
//  translations. The build's version and its files' URLs are the entry's to tell them (#866).
const reachesOut: { [path: string]: string[] } = {
  'src/js/translations.ts': ['game'],
};

const reaching = edges.filter(
    ({ from, target }) =>
      packageOf(target) === null &&
      target.startsWith(root + '/') &&
      !target.includes('/node_modules/') &&
      !target.startsWith(join(packagesRoot, from) + '/')
  ),
  reachedFor = (path: string): string | null =>
    Object.keys(reachesOut).find((allowed) =>
      allowed.endsWith('/') ? path.startsWith(allowed) : path === allowed
    ) ?? null;

expect(
  'no file reaches out of its package by a relative path, but for what is still to be made a package',
  reaching
    .filter(({ from, target }) => {
      const allowed = reachedFor(relative(root, target));

      return allowed === null || !reachesOut[allowed].includes(from);
    })
    .map(
      ({ path, target }) =>
        `${relative(root, path)} -> ${relative(root, target)}`
    ),
  []
);
expect(
  'and everything on that list is still reached, by each package it names',
  Object.entries(reachesOut).flatMap(([allowed, from]) =>
    from
      .filter(
        (name) =>
          !reaching.some(
            (edge) =>
              edge.from === name &&
              reachedFor(relative(root, edge.target)) === allowed
          )
      )
      .map((name) => `${name} -> ${allowed}`)
  ),
  []
);

expect(
  'a file reaches another package by its name, never by a path',
  edges
    .filter(
      ({ from, path, target, to }) =>
        to !== null &&
        to !== from &&
        specifiersOf(readFileSync(path, 'utf8')).some(
          (spec) =>
            spec.startsWith('.') &&
            join(path, '..', spec).startsWith(join(packagesRoot, to) + '/')
        )
    )
    .map(
      ({ path, target }) =>
        `${relative(root, path)} -> ${relative(root, target)}`
    ),
  []
);

expect(
  'every package it uses is one it depends on',
  [
    ...new Set(
      edges
        .filter(
          ({ from, to }) =>
            to !== null && to !== from && !dependsOn(from).includes(to)
        )
        .map(({ from, to }) => `${from} -> ${to}`)
    ),
  ].sort(),
  []
);

expect(
  'no package names itself: inside one, its files use relative paths',
  edges
    .filter(
      ({ from, path, to }) =>
        to === from &&
        specifiersOf(readFileSync(path, 'utf8')).some(
          (spec) =>
            spec === `${scope}${from}` || spec.startsWith(`${scope}${from}/`)
        )
    )
    .map(({ path }) => relative(root, path))
    .filter((path, index, all) => all.indexOf(path) === index),
  []
);

expect(
  'every package it depends on is one it uses',
  names.flatMap((name) =>
    dependsOn(name)
      .filter(
        (dependency) =>
          !edges.some(({ from, to }) => from === name && to === dependency)
      )
      .map((dependency) => `${name} -> ${dependency}`)
  ),
  []
);

const cycles: string[] = [],
  visit = (name: string, trail: string[]) => {
    if (trail.includes(name)) {
      cycles.push([...trail.slice(trail.indexOf(name)), name].join(' -> '));

      return;
    }

    dependsOn(name).forEach((dependency) =>
      visit(dependency, [...trail, name])
    );
  };

names.forEach((name) => visit(name, []));

expect(
  'no two packages depend on each other, however far round',
  [...new Set(cycles)].sort(),
  []
);

expect(
  'nothing depends on an interface, and no interface on the game that puts them together',
  names.flatMap((name) =>
    dependsOn(name)
      .filter(
        (dependency) =>
          isInterface(dependency) ||
          (isInterface(name) && dependency === 'game')
      )
      .map((dependency) => `${name} -> ${dependency}`)
  ),
  []
);

const outside = [
  ...sourcesUnder(join(root, 'src')),
  ...sourcesUnder(join(root, 'tests')),
].filter((path) => path !== join(root, 'tests/ui/packages.ts'));

// The worker (`worker-client`, which `backend.ts` starts) and the page share only the protocol, what one sends the
//  other (#825), over `@civ-clone/worker-transport`. The worker never runs the page's code, nor the page the
//  worker's.
const backend = join(root, 'src/js/backend.ts'),
  // civ.one's choice of rules, which the entry hands the worker client: every installed plugin.
  backendMayUse = ['worker-client', 'protocol', 'src/js/plugins.ts'];

expect(
  'the worker client depends on the protocol, and on nothing of the page',
  [
    dependsOn('worker-client').includes('protocol'),
    dependsOn('worker-client').filter((name) => name !== 'protocol'),
  ],
  [true, []]
);
expect(
  'and no package depends on the worker client',
  names.filter((name) => dependsOn(name).includes('worker-client')),
  []
);
expect(
  'the worker starts from `backend.ts`, which uses only the worker client, the protocol and civ.one’s plugins',
  [
    importsOf(backend).some((target) => packageOf(target) === 'worker-client'),
    importsOf(backend)
      .map((target) => packageOf(target) ?? relative(root, target))
      .filter((to) => !backendMayUse.includes(to))
      .filter((to) => !to.startsWith('node_modules/')),
  ],
  [true, []]
);
expect(
  'and nothing else in civ.one’s own code imports the worker client',
  sourcesUnder(join(root, 'src'))
    .filter((path) => path !== backend)
    .filter((path) =>
      importsOf(path).some((target) => packageOf(target) === 'worker-client')
    )
    .map((path) => relative(root, path)),
  []
);
expect(
  'and the protocol depends on no other package',
  dependsOn('protocol'),
  []
);

expect(
  'in civ.one’s own code, only its list of interfaces imports one (a suite may test an interface’s pieces)',
  outside
    .filter((path) => path.startsWith(join(root, 'src') + '/'))
    .filter((path) =>
      importsOf(path).some((target) => {
        const to = packageOf(target);

        return to !== null && isInterface(to);
      })
    )
    .map((path) => relative(root, path)),
  ['src/js/interfaces.ts']
);

expect(
  'and that list imports nothing else',
  importsOf(join(root, 'src/js/interfaces.ts'))
    .map((target) => packageOf(target))
    .filter((to) => to === null || !isInterface(to)),
  []
);

// What only one interface uses is that interface's own (#825): a window or a map layer that civ.one's shared code never
//  reaches, and the other interfaces don't either, belongs in the interface's package. The building blocks (`client`,
//  `assets`, `widgets`) stay shared however many use them, as any interface can build on them. A piece a second
//  interface wants moves back to a shared package.
const reachedFrom = (starts: string[], enter: (path: string) => boolean) => {
    const seen = new Set<string>(),
      stack = [...starts];

    while (stack.length > 0) {
      const path = stack.pop()!;

      if (seen.has(path) || !enter(path) || !existsSync(path)) {
        continue;
      }

      seen.add(path);
      stack.push(...importsOf(path).filter((target) => target.endsWith('.ts')));
    }

    return seen;
  },
  interfaces = names.filter(isInterface),
  // Everything civ.one's own entries reach, but through an interface: the page's, the worker's and their generated lists.
  sharedReach = reachedFrom(
    sourcesUnder(join(root, 'src/js')).filter(
      (path) => path !== join(root, 'src/js/interfaces.ts')
    ),
    (path) => {
      const name = packageOf(path);

      return name === null || !isInterface(name);
    }
  ),
  interfaceReach = Object.fromEntries(
    interfaces.map((name) => [
      name,
      reachedFrom([join(packagesRoot, name, 'index.ts')], () => true),
    ])
  );

expect(
  'the scan reaches the shared code and each interface',
  [
    sharedReach.size > 100,
    ...interfaces.map((name) => interfaceReach[name].size > 10),
  ],
  [true, ...interfaces.map(() => true)]
);
expect(
  'a window or map piece only one interface uses is in that interface’s package',
  ['city', 'hud', 'menus', 'reports', 'map', 'map-square'].flatMap((name) =>
    sourcesUnder(join(packagesRoot, name))
      .filter((path) => !sharedReach.has(path))
      .filter(
        (path) =>
          interfaces.filter((name) => interfaceReach[name].has(path)).length ===
          1
      )
      .map((path) => relative(root, path))
  ),
  []
);

// Each package brings its own text (`translations/en.ts`, and `en-GB.ts` where British English differs), which the
//  page loads with the rest (`buildTranslationList.js`), and which suites load through `tests/ui/lib/strings*.ts`.
const stringsListed = (helper: string) =>
  specifiersOf(readFileSync(join(root, helper), 'utf8')).sort();

expect(
  'the suites’ strings helpers load every package’s text, and nothing else',
  [
    stringsListed('tests/ui/lib/strings.ts'),
    stringsListed('tests/ui/lib/strings-en-GB.ts'),
  ],
  ['en', 'en-GB'].map((language) =>
    names
      .filter((name) =>
        existsSync(join(packagesRoot, name, 'translations', `${language}.ts`))
      )
      .map((name) => `${scope}${name}/translations/${language}`)
      .sort()
  )
);
expect(
  'and a package’s en-GB has an en beside it',
  names.filter(
    (name) =>
      existsSync(join(packagesRoot, name, 'translations', 'en-GB.ts')) &&
      !existsSync(join(packagesRoot, name, 'translations', 'en.ts'))
  ),
  []
);

// A string that names another (`$t(Key)`) can only count on one its own package brings, or one a package it depends on
//  does: a package swapped out takes its strings with it.
const dependsOnAll = (name: string): Set<string> => {
    const all = new Set<string>([name]),
      stack = [name];

    while (stack.length > 0) {
      dependsOn(stack.pop()!).forEach((dependency) => {
        if (!all.has(dependency)) {
          all.add(dependency);
          stack.push(dependency);
        }
      });
    }

    return all;
  },
  stringFiles = names.flatMap((name) =>
    ['en', 'en-GB']
      .map((language) =>
        join(packagesRoot, name, 'translations', `${language}.ts`)
      )
      .filter((path) => existsSync(path))
      .map((path) => ({ name, text: readFileSync(path, 'utf8') }))
  ),
  stringOwner = new Map<string, string>();

stringFiles.forEach(({ name, text }) =>
  [...text.matchAll(/^ {2}'?([A-Za-z0-9_.-]+)'?:/gm)].forEach(([, key]) =>
    stringOwner.set(key, name)
  )
);

// The keys a nested `$t(…)` names: itself, its plural and context forms (`_one`, `_other`, …), or for an interpolated
//  one (`TradeRoute.goods.{{goods}}`) every key with its literal prefix.
const namedBy = (reference: string): string[] => {
    const at = reference.indexOf('{{'),
      prefix = at === -1 ? null : reference.slice(0, at);

    return [...stringOwner.keys()].filter((key) =>
      prefix === null
        ? key === reference || key.startsWith(`${reference}_`)
        : prefix !== '' && key.startsWith(prefix)
    );
  },
  nested = stringFiles.flatMap(({ name, text }) =>
    [...text.matchAll(/\$t\(([^,)]+)[,)]/g)]
      .flatMap(([, reference]) => namedBy(reference.trim()))
      .map((key) => ({ name, key, owner: stringOwner.get(key)! }))
  );

expect(
  'a string names only strings its own package or one it depends on brings',
  [
    stringOwner.size > 900 && nested.length > 50,
    nested
      .filter(({ name, owner }) => !dependsOnAll(name).has(owner))
      .map(({ name, key, owner }) => `${name}: ${key} (in ${owner})`),
  ],
  [true, []]
);

// Each package brings its own styles too (`styles/_*.scss`), which civ.one's stylesheet, `src/css/app.scss`, puts
//  together in cascade order: every partial a package has is in it, once.
const imported = [
    ...readFileSync(join(root, 'src/css/app.scss'), 'utf8').matchAll(
      /^@import '\.\.\/\.\.\/packages\/([^/]+)\/styles\/([^']+)';$/gm
    ),
  ].map(([, name, partial]) => `${name}/${partial}`),
  partials = names.flatMap((name) =>
    existsSync(join(packagesRoot, name, 'styles'))
      ? readdirSync(join(packagesRoot, name, 'styles'))
          .filter((file) => /^_.+\.scss$/.test(file))
          .map((file) => `${name}/${file.slice(1, -5)}`)
      : []
  );

const definesMixins = (partial: string): boolean => {
    const [name, file] = partial.split('/');

    return /^@mixin /m.test(
      readFileSync(join(packagesRoot, name, 'styles', `_${file}.scss`), 'utf8')
    );
  },
  usedByPartials = new Set([
    ...partials.flatMap((partial) => {
      const [name, file] = partial.split('/');

      return [
        ...readFileSync(
          join(packagesRoot, name, 'styles', `_${file}.scss`),
          'utf8'
        ).matchAll(/^@use '(?:\.\.\/\.\.\/([^/]+)\/styles\/)?([^'/]+)'/gm),
      ].map(([, other, used]) => `${other ?? name}/${used}`);
    }),
    // The stylesheet's own: the themes' tokens, which the interfaces that bring them keep (#861).
    ...[
      ...readFileSync(join(root, 'src/css/app.scss'), 'utf8').matchAll(
        /^@use '\.\.\/\.\.\/packages\/([^/]+)\/styles\/([^']+)';$/gm
      ),
    ].map(([, name, used]) => `${name}/${used}`),
  ]);

expect(
  'civ.one’s stylesheet imports every package’s partials, each once, and no other',
  [
    imported.length > 40,
    // A partial of mixins that others `@use`, or the stylesheet does, is in through them.
    partials.filter(
      (partial) =>
        !imported.includes(partial) &&
        !(usedByPartials.has(partial) && definesMixins(partial))
    ),
    imported.filter(
      (partial, index) =>
        !partials.includes(partial) || imported.indexOf(partial) !== index
    ),
  ],
  [true, [], []]
);

// esbuild compiles each file with the nearest tsconfig.json, but none at all for a file it reaches through
//  node_modules, which is where the workspace links the packages. So each tsconfig.json a build or a suite starts from
//  maps the packages to their folders, and the packages' own extends the one they were built with under src/js, which
//  lowers their class fields as before.
const tsconfig = (path: string) =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as {
    extends?: string;
    compilerOptions?: { baseUrl?: string; paths?: { [key: string]: string[] } };
  };

expect(
  'every tsconfig.json a build or a suite starts from finds the packages by path, not through node_modules',
  ['tsconfig.json', 'src/js/tsconfig.json', 'packages/tsconfig.json'].map(
    (path) => {
      const { compilerOptions: { baseUrl = '.', paths = {} } = {} } =
        tsconfig(path);

      return [
        path,
        (paths['@civ-clone/ui-*'] ?? []).map((target) =>
          relative(root, join(root, path, '..', baseUrl, target))
        ),
      ];
    }
  ),
  [
    ['tsconfig.json', ['packages/*']],
    ['src/js/tsconfig.json', ['packages/*']],
    ['packages/tsconfig.json', ['packages/*']],
  ]
);
expect(
  'and the packages are compiled as src/js is',
  tsconfig('packages/tsconfig.json').extends,
  '../src/js/tsconfig.json'
);

expect(
  'and no tsconfig.json nearer a suite or a package file takes its place',
  [
    'tests/tsconfig.json',
    'tests/ui/tsconfig.json',
    'tests/engine/tsconfig.json',
    ...names.map((name) => `packages/${name}/tsconfig.json`),
  ].filter((path) => existsSync(join(root, path))),
  []
);

expect(
  'the frontend is all in packages',
  existsSync(join(root, 'src/js/UI')),
  false
);

if (failures.length > 0) {
  console.error(
    `FAIL packages (${failures.length} of ${checks})\n\n${failures.join(
      '\n\n'
    )}`
  );
  process.exit(1);
}

console.log(`PASS packages (${checks} checks)`);
