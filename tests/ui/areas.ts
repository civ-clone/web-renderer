// The frontend's areas (#825), on the way to packages: every file is in one, each uses only the areas
//  `src/js/UI/areas.json` lets it, and the imports still to be untangled are listed there, so the list only shrinks.
//  Each interface is an area of its own: nothing shared imports one, one never imports another, and only civ.one's
//  entry (`frontend.ts`) imports `interfaces/`, which says which it offers.

import { importsOf, sourcesUnder } from './lib/imports';
import { join, relative } from 'path';
import areas from '../../src/js/UI/areas.json';

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

type Area = { uses: string[]; paths: string[] };

const jsRoot = join(process.cwd(), 'src/js'),
  uiRoot = join(jsRoot, 'UI'),
  defined = areas.areas as { [name: string]: Area },
  names = Object.keys(defined),
  // The UI's own path for a file, or `null` for one outside it.
  uiPath = (path: string): string | null =>
    path.startsWith(uiRoot + '/') ? relative(uiRoot, path) : null,
  areaOf = (path: string): string | null => {
    const own = uiPath(path);

    if (own === null) {
      return null;
    }

    if (own.startsWith('interfaces/')) {
      const [, name] = own.split('/');

      return own === 'interfaces/index.ts'
        ? 'interfaces'
        : `interfaces/${name}`;
    }

    let found: string | null = null,
      longest = -1;

    names.forEach((name) =>
      defined[name].paths.forEach((prefix) => {
        const matches = prefix.endsWith('/')
          ? own.startsWith(prefix)
          : own === prefix;

        if (matches && prefix.length > longest) {
          found = name;
          longest = prefix.length;
        }
      })
    );

    return found;
  },
  // What an area may import: an interface any shared area, but not the game that puts them together.
  mayUse = (from: string, to: string): boolean =>
    from === to ||
    (from.startsWith('interfaces/')
      ? names.includes(to) && to !== 'game'
      : !to.startsWith('interfaces') && defined[from].uses.includes(to)),
  edge = (from: string, to: string) =>
    `${relative(uiRoot, from)} -> ${relative(uiRoot, to)}`,
  ui = sourcesUnder(uiRoot);

expect(
  'every file is in an area',
  ui.filter((path) => areaOf(path) === null).map((path) => uiPath(path)),
  []
);
expect(
  'every area it may use is one',
  names.flatMap((name) =>
    defined[name].uses
      .filter((use) => !names.includes(use))
      .map((use) => `${name}: ${use}`)
  ),
  []
);

const edges = ui.flatMap((path) =>
    importsOf(path).map((target) => ({ path, target }))
  ),
  crossings = edges
    .filter(({ path, target }) => {
      const from = areaOf(path) as string,
        to = areaOf(target);

      return to !== null && from !== 'interfaces' && !mayUse(from, to);
    })
    .map(({ path, target }) => edge(path, target))
    .sort(),
  exceptions = Object.keys(areas.exceptions).sort(),
  untangle = [...(areas.untangle as string[])].sort();

expect(
  'the scan finds the imports',
  edges.length > 1000 &&
    edges.some(
      ({ path, target }) =>
        edge(path, target) === 'components/openCity.ts -> components/City.ts'
    ),
  true
);
expect(
  'nothing crosses an area it may not, but for the exceptions and the list to untangle',
  crossings.filter(
    (crossing) => !exceptions.includes(crossing) && !untangle.includes(crossing)
  ),
  []
);
expect(
  'every exception is still an import that needs one',
  exceptions.filter((exception) => !crossings.includes(exception)),
  []
);
expect(
  'what has been untangled is off the list',
  untangle.filter((crossing) => !crossings.includes(crossing)),
  []
);

const reachingInterfaces = sourcesUnder(jsRoot).flatMap((path) =>
  importsOf(path)
    .filter((target) => uiPath(target)?.startsWith('interfaces/'))
    .filter((target) => {
      const from = areaOf(path),
        to = areaOf(target);

      return to === 'interfaces'
        ? path !== join(jsRoot, 'frontend.ts')
        : from !== to && from !== 'interfaces';
    })
    .map((target) => `${relative(jsRoot, path)} -> ${relative(jsRoot, target)}`)
);

expect(
  'civ.one is what chooses the interfaces',
  importsOf(join(jsRoot, 'frontend.ts')).includes(
    join(uiRoot, 'interfaces/index.ts')
  ),
  true
);
expect('nothing else reaches into one', reachingInterfaces, []);

if (failures.length) {
  process.stderr.write(`FAIL areas\n${failures.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`PASS areas (${checks} checks)\n`);
