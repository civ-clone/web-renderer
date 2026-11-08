// Interface manifests (#824): `modern` and `classic` each say what fills every slot, a manifest that swaps one slot changes
//  that part and nothing that uses it, features follow the manifest, an interface brings its theme unless the player or
//  the visit has chosen one, and only Options knows which interface is in use.

// Must stay first: modules read `document` as they load.
import { document } from './lib/dom';
import './lib/interfaces';

import { choiceList, openChoice } from '../../src/js/UI/components/choiceList';
import ChoiceWindow from '../../src/js/UI/components/ChoiceWindow';
import { readFileSync, readdirSync, statSync } from 'fs';
import {
  DEFAULT_INTERFACE,
  applyInterface,
  currentInterface,
  defineSlot,
  hasFeature,
  interfaces,
  registerInterface,
} from '../../src/js/UI/lib/interfaceMode';
import { dirname, join } from 'path';
import { uiThemeFrom } from '../../src/js/UI/lib/theme';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}
    expected: ${JSON.stringify(expected)}
    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const root = (document as unknown as Document).documentElement,
  use = (id: string) => applyInterface(id, null, root);

expect(
  'new and classic are manifests',
  interfaces().map(({ id }) => id),
  ['modern', 'classic']
);

expect(
  'the default is one of them',
  interfaces().some(({ id }) => id === DEFAULT_INTERFACE),
  true
);

const [modern, classic] = interfaces();

expect(
  'both fill the same slots',
  Object.keys(classic.slots).sort(),
  Object.keys(modern.slots).sort()
);

// A slot, and an interface that differs from `modern` only there.
const slot = defineSlot<string>('cityScreen');

slot.provide('window', 'the window');
slot.provide('page', 'the page');
slot.provide('scroll', 'the scroll');

registerInterface({
  ...modern,
  id: 'test',
  slots: { ...modern.slots, cityScreen: 'scroll' },
  features: ['nextTurn'],
  theme: 'civ1-classic',
});

use('modern');
expect('modern fills the slot', slot.current(), 'the window');

use('classic');
expect('classic fills it differently', slot.current(), 'the page');

use('test');
expect('a manifest swaps one slot', slot.current(), 'the scroll');
expect(
  'and is the interface in use',
  [currentInterface().id, root.getAttribute('data-interface')],
  ['test', 'test']
);
expect(
  'with its own features',
  [hasFeature('nextTurn'), hasFeature('windowChrome')],
  [true, false]
);

// A replacement for the interface in use waits for the next load, as a choice does: what is on screen was built from
//  the one the page loaded with.
registerInterface({ ...currentInterface(), features: [] });
expect(
  'replacing the interface in use changes nothing yet',
  hasFeature('nextTurn'),
  true
);
use('test');
expect('and does when it next loads', hasFeature('nextTurn'), false);

// And what uses a real slot follows it, unchanged.
{
  const opened: string[] = [];

  choiceList.provide('test', (title) => {
    opened.push(title);

    return null as unknown as ChoiceWindow;
  });

  registerInterface({
    ...modern,
    id: 'testChoices',
    slots: { ...modern.slots, choiceList: 'test' },
  });

  use('testChoices');
  openChoice('Which one?', [], () => {});
  expect('a real slot opens what the manifest names', opened, ['Which one?']);
}

const broken = defineSlot<string>('nothingProvides');

registerInterface({ ...modern, id: 'broken', slots: { nothingProvides: 'x' } });
use('broken');

let message = '';

try {
  broken.current();
} catch (e) {
  message = (e as Error).message;
}

expect(
  'an implementation nobody provides says which',
  message,
  "Interface 'broken' fills slot 'nothingProvides' with 'x', which nothing provides."
);

[
  null,
  'modern',
  { ...modern, schema: 2 },
  { ...modern, id: 7 },
  { ...modern, slots: { reports: 7 } },
  { ...modern, slots: [] },
  { ...modern, features: 'nextTurn' },
].forEach((manifest) => {
  let threw = false;

  try {
    registerInterface(manifest);
  } catch {
    threw = true;
  }

  expect(`${JSON.stringify(manifest)?.slice(0, 40)} is refused`, threw, true);
});

expect(
  'an interface brings its theme',
  [uiThemeFrom(null, '', modern.theme), uiThemeFrom(null, '', classic.theme)],
  ['slate', 'civ1-classic']
);
expect(
  "the player's theme outranks it",
  uiThemeFrom(null, 'slate', classic.theme),
  'slate'
);
expect(
  'and the visit outranks that',
  uiThemeFrom('civ1-classic', 'slate', modern.theme),
  'civ1-classic'
);

// Nothing but Options, which offers the choice, asks which interface is in use.
const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);

      return statSync(path).isDirectory()
        ? sources(path)
        : path.endsWith('.ts')
        ? [path]
        : [];
    }),
  srcRoot = join(process.cwd(), 'src/js/UI');

expect(
  'only Options reads interfaceMode()',
  sources(srcRoot)
    .filter((path) => readFileSync(path, 'utf8').includes('interfaceMode()'))
    .map((path) => path.slice(srcRoot.length + 1))
    .sort(),
  ['components/GameOptions.ts']
);

// Each interface is a package of its own (#825): what's shared never imports one, one never imports another, and only
//  civ.one's own entry (`frontend.ts`) imports `interfaces/`, which says which it offers.
const jsRoot = join(process.cwd(), 'src/js'),
  interfacesRoot = join(srcRoot, 'interfaces'),
  importsOf = (path: string): string[] =>
    [
      ...readFileSync(path, 'utf8').matchAll(
        /(?:^|\n)\s*(?:import|export)\b[^;]*?['"](\.[^'"]+)['"]/g
      ),
    ].map(([, spec]) => join(dirname(path), spec)),
  packageOf = (path: string): string | null =>
    path.startsWith(interfacesRoot + '/')
      ? path.slice(interfacesRoot.length + 1).split('/')[0]
      : null,
  crossings = sources(jsRoot)
    .filter((path) => path !== join(interfacesRoot, 'index.ts'))
    .flatMap((path) =>
      importsOf(path)
        .filter((target) => {
          const to = packageOf(target);

          if (target === interfacesRoot) {
            return path !== join(jsRoot, 'frontend.ts');
          }

          return to !== null && !/\.\w+$/.test(to) && packageOf(path) !== to;
        })
        .map(
          (target) =>
            `${path.slice(jsRoot.length + 1)} -> ${target.slice(
              jsRoot.length + 1
            )}`
        )
    );

expect(
  'civ.one is what chooses the interfaces',
  importsOf(join(jsRoot, 'frontend.ts')).includes(interfacesRoot),
  true
);
expect('nothing else reaches into one', crossings, []);

if (failures.length) {
  process.stderr.write(`FAIL interfaceManifests\n${failures.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`PASS interfaceManifests (${checks} checks)\n`);
