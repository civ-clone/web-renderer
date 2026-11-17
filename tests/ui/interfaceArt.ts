// The interface's art (#1063): a theme names the sets it draws its interface art with, in order, and the first that is
//  registered, installed and has interface art (`assets.ui`) is used, or Civ1's when none is, as the game can't start
//  without it. The interface asks for each sprite by civ.one's name, which began as Civ1's, and a set maps it to its own
//  (`names.ui`). Whether choosing a theme changes the page's art (`themeChangesArt`) decides whether it needs a new
//  page.

// Must stay first: `AssetStore` opens its database as it loads, and `Window` reads `document.body`.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/artPacks';

import interfaceArt, {
  hasInterfaceArt,
  interfaceNames,
  interfaceSpriteKey,
  interfaceSpriteName,
  optionalInterfaceNames,
  provideInterfaceArt,
  requiredInterfaceNames,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import {
  installTilesets,
  interfaceTileset,
  registerTileset,
} from '@civ-clone/ui-assets/lib/tilesets';
import validateDescriptor, {
  TilesetDescriptor,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import { registerTheme, uiThemeArt } from '@civ-clone/ui-widgets/lib/theme';
import civ1Json from '@civ-clone/ui-tileset-civ1/civ1.json';
import civ2Json from '@civ-clone/ui-tileset-civ2/civ2.json';
import { setTilesetSizes } from '@civ-clone/ui-game/app/assets';
import { citizenSpriteChoices } from '@civ-clone/ui-client/lib/citizens';
import { themeChangesArt } from '@civ-clone/ui-menus/components/GameOptions';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL interfaceArt: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// The message `fn` throws, or `null` when it does not.
const thrown = (fn: () => unknown): string | null => {
  try {
    fn();

    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

// Civ1's descriptor as another set's, kept under its own prefix, with `changes` made to it.
const civ1As = (
  id: string,
  changes: { [key: string]: unknown } = {}
): TilesetDescriptor =>
  validateDescriptor({
    ...JSON.parse(JSON.stringify(civ1Json)),
    id,
    storage: { prefix: `./assets/${id}/`, ext: '.png' },
    ...changes,
  });

const id = ({ id }: TilesetDescriptor): string => id;

// Without a theme's list, as in a suite that never starts the page: Civ1's.
expect('with no theme, Civ1', id(interfaceArt()), 'civ1');

// Sets with interface art, two installed and one not, and one installed with none.
const first = registerTileset(civ1As('first')),
  second = registerTileset(civ1As('second')),
  notInstalled = registerTileset(civ1As('not-installed')),
  noUi = registerTileset(
    civ1As('no-ui', {
      assets: { ...civ1Json.assets, ui: [] },
    })
  );

installTilesets({
  first: { complete: true, metadata: null },
  second: { complete: true, metadata: null },
  'not-installed': { complete: false, metadata: null },
  'no-ui': { complete: true, metadata: null },
});

expect(
  'a set without interface art has none',
  [first, noUi, interfaceTileset()].map(hasInterfaceArt),
  [true, false, true]
);

// The list's order.
expect('the first in the list', id(interfaceArt(['first', 'second'])), 'first');
expect(
  'in the order the list gives',
  id(interfaceArt(['second', 'first'])),
  'second'
);
expect(
  "Civ1's when it comes first",
  id(interfaceArt(['civ1', 'second'])),
  'civ1'
);

// What's skipped.
expect(
  "a set that isn't registered is skipped",
  id(interfaceArt(['unregistered', 'second'])),
  'second'
);
expect(
  "and one that isn't installed",
  id(interfaceArt([notInstalled.id, 'second'])),
  'second'
);
expect(
  'and one without interface art',
  id(interfaceArt(['no-ui', 'second'])),
  'second'
);

// The fallback.
expect(
  "with none of them there, Civ1's",
  id(interfaceArt(['unregistered', notInstalled.id, 'no-ui'])),
  'civ1'
);
expect("and with an empty list, Civ1's", id(interfaceArt([])), 'civ1');
expect(
  "the themes' own list is Civ1's, then the pixel art's: Civ1's while it's installed",
  [
    uiThemeArt('slate'),
    uiThemeArt('civ1-classic'),
    id(interfaceArt(uiThemeArt('slate'))),
  ],
  [['civ1', 'civ1-pixelart'], ['civ1', 'civ1-pixelart'], 'civ1']
);

// Without Civ1's sprites (#1063), the pixel art, which ships with civ.one, has interface art and is installed as it's
//  declared; and with neither, Civ1's as before, whose sprites the game can't start without.
{
  installTilesets({ civ1: { complete: false, metadata: null } });

  expect(
    "without Civ1's sprites, the themes draw with the pixel art",
    [
      id(interfaceArt(uiThemeArt('slate'))),
      id(interfaceArt(uiThemeArt('civ1-classic'))),
      interfaceSpriteKey('city/bulb', interfaceArt(uiThemeArt('slate'))),
    ],
    ['civ1-pixelart', 'civ1-pixelart', './assets/civ1-pixelart/city/bulb.png']
  );

  installTilesets({
    civ1: { complete: false, metadata: null },
    'civ1-pixelart': { complete: false, metadata: null },
    // Nor the hexagonal one's, which has interface art too and is tried next (#1063).
    'hex-pixelart': { complete: false, metadata: null },
  });

  expect(
    "and without its sheet either, Civ1's",
    id(interfaceArt(uiThemeArt('slate'))),
    'civ1'
  );

  installTilesets({
    first: { complete: true, metadata: null },
    second: { complete: true, metadata: null },
    'not-installed': { complete: false, metadata: null },
    'no-ui': { complete: true, metadata: null },
  });
}

// Following the theme in use.
let theme: readonly string[] = ['second'];

provideInterfaceArt(() => theme);

expect("it follows the theme's list", id(interfaceArt()), 'second');

theme = ['first'];

expect(
  'and keeps the set it settled on while nothing says the list changed',
  id(interfaceArt()),
  'second'
);

provideInterfaceArt(() => theme);

expect('until something does', id(interfaceArt()), 'first');

provideInterfaceArt(() => []);

// The set is settled once, and again only when the list or the installed sets change.
{
  provideInterfaceArt(() => ['first']);

  const settled = interfaceArt();

  expect('the settled set is kept', interfaceArt() === settled, true);

  installTilesets({
    second: { complete: true, metadata: null },
    'no-ui': { complete: true, metadata: null },
  });

  expect(
    "installing again settles it again: the theme's first set isn't installed now",
    id(interfaceArt()),
    'civ1'
  );

  installTilesets({
    first: { complete: true, metadata: null },
    second: { complete: true, metadata: null },
    'no-ui': { complete: true, metadata: null },
  });

  expect('and back, when it is', id(interfaceArt()), 'first');

  provideInterfaceArt(() => ['second']);

  expect('so does a new list', id(interfaceArt()), 'second');

  provideInterfaceArt(() => []);
}

// The sizes the stylesheets show the interface's art at are the settled set's.
{
  const sized = registerTileset(
    civ1As('sized', {
      ui: { icon: 21, citizen: { width: 24, step: 18 }, cursor: 39 },
    })
  );

  installTilesets({
    first: { complete: true, metadata: null },
    second: { complete: true, metadata: null },
    'no-ui': { complete: true, metadata: null },
    sized: { complete: true, metadata: null },
  });

  const sizes = (): string[] =>
    ['--tileset-icon', '--tileset-citizen-width', '--tileset-citizen-step'].map(
      (property) =>
        (
          document as unknown as Document
        ).documentElement.style.getPropertyValue(property)
    );

  provideInterfaceArt(() => [sized.id]);
  setTilesetSizes();

  expect("the sizes follow the theme's set", sizes(), ['21px', '24px', '18px']);

  provideInterfaceArt(() => []);
  setTilesetSizes();

  expect("and Civ1's without one", sizes(), ['14px', '16px', '12px']);
}

// The names: civ.one's, which begin as Civ1's interface art's, required and optional as Civ1's are, and add the angry
//  citizens the city screen asks for (`citizenSpriteChoices`), which Civ1's art hasn't, as optional.
{
  const { assets } = civ1Json,
    isUi = (name: string): boolean =>
      assets.ui.some((prefix) => name.startsWith(prefix)),
    angry = ['city/people_angry_f', 'city/people_angry_m'];

  expect(
    "the required names are Civ1's required interface art",
    requiredInterfaceNames,
    assets.required.filter(isUi)
  );
  expect(
    "the optional names are Civ1's optional interface art, then the angry citizens",
    optionalInterfaceNames,
    [...assets.optional.filter(isUi), ...angry]
  );
  expect(
    "which Civ1's descriptor doesn't list",
    angry.filter((name) =>
      [...assets.required, ...assets.optional].includes(name)
    ),
    []
  );
  expect(
    'every citizen the city screen asks for is named',
    ['Rome', 'Babylon', 'Thebes']
      .flatMap((seed) =>
        citizenSpriteChoices(
          Array(4).fill(['happy', 'content', 'unhappy', 'angry']).flat(),
          seed
        )
      )
      .flat()
      .filter((name) => !interfaceNames.some((listed) => listed.name === name)),
    []
  );
  expect(
    'and each name is marked so',
    interfaceNames.map(({ name, required }) => [name, required]),
    [
      ...assets.required.filter(isUi).map((name) => [name, true]),
      ...[...assets.optional.filter(isUi), ...angry].map((name) => [
        name,
        false,
      ]),
    ]
  );
}

// `names.ui`: a set's own names for civ.one's.
{
  // Civ1's sprites with `city/bulb` called `icons/science`, and names.ui `ui`.
  const withBulbRenamed = (ui: unknown): { [key: string]: unknown } => ({
      assets: {
        ...civ1Json.assets,
        required: civ1Json.assets.required.map((name) =>
          name === 'city/bulb' ? 'icons/science' : name
        ),
      },
      names: { ...civ1Json.names, ui },
    }),
    civ1 = interfaceTileset(),
    renamed = civ1As(
      'renamed',
      withBulbRenamed({ 'city/bulb': 'icons/science' })
    );

  expect(
    "a set without names.ui calls each by civ.one's name",
    [
      interfaceSpriteName('city/bulb', civ1),
      interfaceSpriteKey('city/bulb', civ1),
    ],
    ['city/bulb', './assets/city/bulb.png']
  );
  expect(
    'one with it calls a name it maps by its own',
    [
      interfaceSpriteName('city/bulb', renamed),
      interfaceSpriteKey('city/bulb', renamed),
    ],
    ['icons/science', './assets/renamed/icons/science.png']
  );
  expect(
    "and one it doesn't map by civ.one's",
    interfaceSpriteName('city/food', renamed),
    'city/food'
  );
  expect(
    'nothing the map inherits is taken for a name',
    interfaceSpriteName('constructor', renamed),
    'constructor'
  );
  expect(
    "the interface's art's by default",
    interfaceSpriteKey('city/bulb'),
    './assets/city/bulb.png'
  );
  expect(
    "names.ui must map civ.one's names to the set's",
    thrown(() =>
      civ1As('bad', {
        names: { ...civ1Json.names, ui: { 'city/bulb': 3 } },
      })
    ),
    'Tileset "bad": names.ui must map the interface\'s names to sprite names.'
  );

  // What a descriptor's names.ui is checked for.
  expect(
    'nor to an empty name',
    thrown(() => civ1As('bad', withBulbRenamed({ 'city/bulb': '' }))),
    'Tileset "bad": names.ui must map the interface\'s names to sprite names.'
  );
  expect(
    "a name that isn't the interface's is refused",
    thrown(() =>
      civ1As(
        'bad',
        withBulbRenamed({
          'city/bulb': 'icons/science',
          'city/bulbs': 'icons/science',
        })
      )
    ),
    'Tileset "bad": names.ui maps "city/bulbs", which is not one of the interface\'s names.'
  );
  expect(
    "and a sprite the set doesn't list",
    thrown(() => civ1As('bad', withBulbRenamed({ 'city/bulb': 'icons/bulb' }))),
    'Tileset "bad": names.ui calls "city/bulb" "icons/bulb", which is not in assets.required or assets.optional.'
  );
  expect(
    'a set with interface art must require every name the interface needs',
    thrown(() => civ1As('bad', withBulbRenamed(undefined))),
    'Tileset "bad": assets.ui says it has interface art, but assets.required doesn\'t list the interface\'s "city/bulb".'
  );
  expect(
    'by its own name for it',
    thrown(() =>
      civ1As('bad', {
        assets: {
          ...civ1Json.assets,
          required: civ1Json.assets.required.filter(
            (name) => name !== 'city/bulb'
          ),
          optional: [...civ1Json.assets.optional, 'icons/science'],
        },
        names: { ...civ1Json.names, ui: { 'city/bulb': 'icons/science' } },
      })
    ),
    'Tileset "bad": assets.ui says it has interface art, but assets.required doesn\'t list the interface\'s "city/bulb" (its "icons/science").'
  );
  expect(
    "a set without interface art needs none of them, and Civ1's and Civ2's are read",
    [
      id(
        civ1As('map-only', {
          assets: { ...civ1Json.assets, required: ['terrain/land'], ui: [] },
        })
      ),
      id(validateDescriptor(civ1Json)),
      id(validateDescriptor(civ2Json)),
    ],
    ['map-only', 'civ1', 'civ2']
  );
}

// Whether choosing a theme changes the art, so needs a new page: against the page's art, Civ1's here.
registerTheme({ id: 'first-theme', name: 'first', art: ['first', 'civ1'] });
registerTheme({ id: 'civ1-only', name: 'civ1', art: ['civ1'] });
registerTheme({ id: 'no-art', name: 'none' });
registerTheme({
  id: 'missing',
  name: 'missing',
  art: ['unregistered', notInstalled.id],
});

expect(
  "the two themes there are draw with the page's art: Civ1's",
  [themeChangesArt('slate'), themeChangesArt('civ1-classic')],
  [false, false]
);
expect(
  'nor do lists that come to the same set',
  [
    themeChangesArt('civ1-only'),
    themeChangesArt('no-art'),
    themeChangesArt('missing'),
  ],
  [false, false, false]
);
expect(
  'one drawing with another set changes it',
  themeChangesArt('first-theme'),
  true
);

// A page started with another theme's art.
provideInterfaceArt(() => uiThemeArt('first-theme'));

expect(
  'against its art, Civ1 changes it, and its own theme does not',
  [
    themeChangesArt('slate'),
    themeChangesArt('civ1-classic'),
    themeChangesArt('first-theme'),
  ],
  [true, true, false]
);

provideInterfaceArt(() => []);

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL interfaceArt\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS interfaceArt (${checks} checks)`);
