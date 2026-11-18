// The main menu under the new interface (#749): Continue leads when the browser holds a save, named for its
//  civilization and year when the save says them and by its name when it's older, with when it was kept beneath; the
//  items for a game whenever there's art to draw it with, civ.one's own without an import (#1063), and why not when
//  there's none; Art and sound always; each item's key, but not
//  while a window is open or with a modifier, and none once the menu has gone; the version and release notes under
//  them. New Game offers Customise… first, and Options opens with no game, with the Assets row.
//
// Run over the fake store (`tools/saved-game.js`), for the saves Continue reads.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/grids';
import './lib/artPacks';

import MainMenu from '@civ-clone/ui-interface-classic/components/MainMenu';
import TitleMenu, {
  continueDetail,
  continueLabel,
  newestSave,
} from '@civ-clone/ui-interface-modern/components/TitleMenu';
import {
  BrowserSave,
  deleteSave,
  keepSave,
  listSaves,
} from '@civ-clone/ui-client/lib/browserSaves';
import Transport from '@civ-clone/ui-client/Transport';
import addFormatters from '@civ-clone/ui-game/app/i18nFormatters';
import { applyInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
import { askNewGame } from '@civ-clone/ui-menus/components/newGame';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import GameOptions from '@civ-clone/ui-menus/components/GameOptions';
import { IPortal } from '@civ-clone/ui-map/components/Portal';
import { resetStore } from './lib/FakeStore';
import { setBuild } from '@civ-clone/ui-client/lib/build';
import interfaceArt, {
  provideInterfaceArt,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import { installTilesets, mapTileset } from '@civ-clone/ui-assets/lib/tilesets';
import { missingArt } from '@civ-clone/ui-menus/lib/playable';
import supportedTopologies from '@civ-clone/ui-map/lib/supportedTopologies';

// The build the entry would name (#866).
setBuild({ version: '0.0.0@test', musicWorkletUrl: 'dist/musicWorklet.js' });

const failures: string[] = [];
let checks = 0,
  finished = false;

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

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL titleMenu: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    storage: {
      persisted: async (): Promise<boolean> => false,
      persist: async (): Promise<boolean> => true,
    },
  },
});

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const transport = {
  send: (): void => {},
  receive: (): (() => void) => () => {},
  request: async (): Promise<never> => new Promise<never>(() => {}),
} as unknown as Transport;

let hasAssets = true;

assetStore.hasAllAssets = async (): Promise<boolean> => hasAssets;
// Civ1's sprites: none of Civ2's (#97).
assetStore.importedCount = async (pack?: { id: string }): Promise<number> =>
  hasAssets && (pack === undefined || pack.id === 'civ1') ? 289 : 0;

// The shim's `KeyboardEvent` takes only `key` (`lib/dom.ts`): the modifiers are set on it.
const key = (
  key: string,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}
): KeyboardEvent => {
  const event = new (globalThis as any).KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });

  Object.assign(event, modifiers);
  document.body.dispatchEvent(event);

  return event;
};

const closeWindows = (): void =>
  document
    .querySelectorAll('dialog')
    .forEach((dialog: Element) => dialog.remove());

const openMenu = async (): Promise<{
  menu: TitleMenu;
  element: HTMLElement;
}> => {
  document.body.innerHTML = '';

  const element = document.createElement('div');

  element.id = 'mainmenu';
  document.body.append(element);

  const menu = new TitleMenu(element, transport);

  await settle();

  return { menu, element };
};

const items = (element: HTMLElement): string[] =>
  Array.from(element.querySelectorAll('.ui-title-menu-item')).map(
    (item) => (item as HTMLElement).dataset.item ?? ''
  );

const save = (
  savedAt: number,
  kind: BrowserSave['kind'],
  details?: BrowserSave['details']
): BrowserSave => ({
  name: `save ${savedAt}`,
  savedAt,
  kind,
  data: new Blob(['']),
  ...(details === undefined ? {} : { details }),
});

(async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  addFormatters(i18next);
  await import('./lib/strings');
  await import('../../translations/civ1-civilization/en');
  applyInterface('modern', null);
  resetStore();

  // No save: the items for a game, and no Continue. Art and sound is always there, for the music and other sets
  //  (#1063).
  {
    const { menu, element } = await openMenu();

    expect('with no save, the menu starts at New game', items(element), [
      'new-game',
      'earth',
      'load-game',
      'hall-of-fame',
      'options',
      'library',
    ]);
    expect(
      'each item shows its key',
      Array.from(element.querySelectorAll('.ui-title-menu-item .key')).map(
        (key) => key.textContent
      ),
      ['N', 'E', 'L', 'H', 'O', 'A']
    );
    expect(
      'and has it as its shortcut',
      element
        .querySelector('[data-item="new-game"]')
        ?.getAttribute('aria-keyshortcuts'),
      'N'
    );
    expect(
      'the footer has the version and the release notes',
      [
        element.querySelector('.ui-title-menu-footer span')?.textContent ?? '',
        element.querySelector('.ui-title-menu-link')?.textContent,
      ].map((text) => (text ?? '').replace(/v\d.*/, 'v…')),
      ['civ.one v…', 'Release notes']
    );

    // New Game: Customise… first, then the sizes.
    key('n');
    await settle();

    const rows = Array.from(
      document.querySelectorAll('dialog[open] .ui-choice-name')
    ).map((row) => row.textContent);

    expect('New game offers Customize… first', rows[0], 'Customize…');
    expect('then the sizes', rows.length > 1, true);
    expect(
      'with the usual size chosen, not Customize…',
      Array.from(
        document.querySelectorAll(
          'dialog[open] [aria-selected="true"] .ui-choice-name'
        )
      ).map((row) => row.textContent),
      ['Normal (80 × 50)']
    );

    closeWindows();

    // The classic menu's New Game, which has its own Customize… button, asks only the sizes.
    askNewGame(transport);
    await settle();

    expect(
      'without Customise, only the sizes',
      document
        .querySelector('dialog[open] .ui-choice-name')
        ?.textContent?.startsWith('Tiny'),
      true
    );

    closeWindows();

    // Options, with no game: the Assets row says how many are imported.
    key('o');
    await settle();

    const options = document.querySelector('dialog.game-options');

    expect('O opens Options with no game', options !== null, true);
    expect(
      'whose Assets row says what is imported',
      options?.querySelector('.assets .status')?.textContent,
      'Civilization assets imported · 289 sprites'
    );
    expect(
      'and has Art and sound',
      options?.querySelector('.assets button')?.textContent,
      'Art and sound'
    );

    // A window open over the menu has the keys: H would open the Hall of Fame at once.
    key('h');
    await settle();

    expect(
      'no key works while a window is open',
      document.querySelectorAll('dialog').length,
      1
    );

    closeWindows();

    key('o', { ctrlKey: true });

    expect(
      'nor with a modifier',
      document.querySelectorAll('dialog').length,
      0
    );

    // Shift too: the keys match either case, so Shift+O would otherwise open Options.
    key('O', { shiftKey: true });
    await settle();

    expect('nor with Shift', document.querySelectorAll('dialog').length, 0);
    closeWindows();

    expect(
      'an arrow moves between the items, and the menu takes it',
      key('ArrowDown').defaultPrevented,
      true
    );
    expect(
      'but not with Shift, which is left to the browser',
      key('ArrowDown', { shiftKey: true }).defaultPrevented,
      false
    );

    menu.remove();
    key('o');

    expect(
      'nor once the menu has gone',
      document.querySelectorAll('dialog').length,
      0
    );
  }

  // A save loading as the page opens removes the menu before it has read the saves: nothing is built, and no key it
  //  would have had does anything in the game.
  {
    document.body.innerHTML = '';

    const element = document.createElement('div');

    element.id = 'mainmenu';
    document.body.append(element);

    new TitleMenu(element, transport).remove();
    await settle();

    expect(
      'a menu removed as it opens builds nothing',
      element.querySelectorAll('.ui-title-menu-item').length,
      0
    );

    key('o');
    key('h');
    await settle();

    expect(
      'and has no keys in the game',
      document.querySelectorAll('dialog').length,
      0
    );
  }

  // Civilization's art not imported (#1063): civ.one's own pixel art draws the game, so everything is offered as ever,
  //  Continue included.
  {
    hasAssets = false;
    provideInterfaceArt(() => ['civ1', 'civ1-pixelart']);
    installTilesets({ civ1: { complete: false, metadata: null } });

    await keepSave('kept', new Blob(['']), 'autosave', () => {});

    const { menu, element } = await openMenu();

    expect(
      'without Civilization imported, every item, drawn with the pixel art',
      [items(element), interfaceArt().id, mapTileset('square').id],
      [
        [
          'continue',
          'new-game',
          'earth',
          'load-game',
          'hall-of-fame',
          'options',
          'library',
        ],
        'civ1-pixelart',
        'civ1-pixelart',
      ]
    );
    expect(
      'with no reason given',
      element.querySelector('.ui-title-menu-no-art'),
      null
    );

    key('o');
    await settle();

    expect(
      'Options says Civilization is not imported',
      document.querySelector('dialog.game-options .assets .status')
        ?.textContent,
      'Civilization assets not imported'
    );

    closeWindows();
    menu.remove();
  }

  // Nothing to draw with (#1063): a first visit offline, the pixel art's sheets, square and hexagonal, not loaded and
  //  nothing imported. Only what works without art, Art and sound among it, and why.
  {
    installTilesets({
      civ1: { complete: false, metadata: null },
      'civ1-pixelart': { complete: false, metadata: null },
      'hex-pixelart': { complete: false, metadata: null },
    });

    const { menu, element } = await openMenu();

    expect(
      'with no art at all, no game items, Continue included',
      items(element),
      ['hall-of-fame', 'options', 'library']
    );
    expect(
      'and the menu says why',
      element.querySelector('.ui-title-menu-no-art')?.textContent,
      'There’s no art to draw the game with: civ.one’s own couldn’t be loaded. Check your connection and reload the page, or import Civilization’s art in Art and sound.'
    );
    expect(
      'as an alert, before the items',
      [
        element.querySelector('.ui-title-menu-no-art')?.getAttribute('role'),
        element.querySelector('.ui-title-menu-panel')?.firstElementChild
          ?.className,
      ],
      ['alert', 'ui-title-menu-no-art']
    );

    menu.remove();

    // The classic menu says the same, its game items hidden.
    document.body.innerHTML = '';

    const classic = document.createElement('div');

    classic.id = 'mainmenu';
    document.body.append(classic);
    new MainMenu(classic, transport);
    await settle();

    expect(
      'the classic menu hides the game items and says why',
      [
        Array.from(classic.querySelectorAll('nav button'))
          .filter((button) => !(button as HTMLElement).hidden)
          .map((button) => button.textContent),
        (classic.querySelector('.no-art') as HTMLElement | null)?.hidden,
        classic
          .querySelector('.no-art')
          ?.textContent?.startsWith('There’s no art to draw the game with'),
      ],
      [['Hall of Fame', 'Art and sound'], false, true]
    );

    // Civilization II's art alone: a map, but no interface art, which it has none of.
    installTilesets({
      civ1: { complete: false, metadata: null },
      civ2: {
        complete: true,
        metadata: {
          anchors: {},
          colours: {
            flag: [{ primary: [255, 0, 0], secondary: [128, 0, 0] }],
          },
        },
      },
      'civ1-pixelart': { complete: false, metadata: null },
      'hex-pixelart': { complete: false, metadata: null },
    });

    expect(
      "with Civilization II's art alone, the interface has no art",
      [missingArt(), supportedTopologies()],
      ['interface', ['staggered-iso']]
    );

    // Art for hex alone, drawing the interface too (#1063): hex is offered to every new game (#1122), so there's a new
    //  game as well as a save on hex, and nothing to say why not.
    provideInterfaceArt(() => ['hex-pixelart']);
    installTilesets({
      civ1: { complete: false, metadata: null },
      'civ1-pixelart': { complete: false, metadata: null },
    });
    document.body.innerHTML = '';

    {
      const { menu, element } = await openMenu();

      expect(
        'with art for hex alone, Continue (a save kept above), New game and Load game, with no reason given',
        [items(element), element.querySelector('.ui-title-menu-no-art')],
        [
          [
            'continue',
            'new-game',
            'earth',
            'load-game',
            'hall-of-fame',
            'options',
            'library',
          ],
          null,
        ]
      );

      menu.remove();
    }

    provideInterfaceArt(() => ['civ1', 'civ1-pixelart']);

    // As the page starts, with nothing installed yet but Civilization's.
    hasAssets = true;
    installTilesets({});
    resetStore();
  }

  // A save: Continue leads, named for what the save is of.
  {
    await keepSave(
      'The Mongols, turn 200, 2026-11-03',
      new Blob(['']),
      'autosave',
      () => {},
      () => Date.now() - 3 * 60 * 60 * 1000,
      { civilization: 'Mongol', turn: 200, year: 1945 }
    );

    expect('the save keeps what it is of', (await listSaves())[0].details, {
      civilization: 'Mongol',
      turn: 200,
      year: 1945,
    });

    const { element } = await openMenu(),
      continueItem = element.querySelector('[data-item="continue"]');

    expect('with a save, Continue leads', items(element)[0], 'continue');
    expect(
      'named for its civilization and year',
      continueItem?.querySelector('.label')?.textContent,
      'Continue · Mongols · 1945 CE'
    );
    expect(
      'with when it was kept beneath',
      continueItem?.querySelector('.detail')?.textContent,
      'Autosaved 3 hours ago'
    );
    expect(
      'and C for its key',
      continueItem?.querySelector('.key')?.textContent,
      'C'
    );

    // Deleted from Load game while the menu was up: Continue doesn't load what it showed, and goes.
    await deleteSave((await listSaves())[0].savedAt);
    key('c');
    await settle();

    expect(
      'a Continue whose save was deleted is gone, not loaded',
      [items(element), document.querySelectorAll('dialog').length],
      [
        [
          'new-game',
          'earth',
          'load-game',
          'hall-of-fame',
          'options',
          'library',
        ],
        0,
      ]
    );

    resetStore();
  }

  // In a game, Options has the Assets row too (#1118): its library opens for a game, where nothing is imported, as
  //  an import reloads the page, and the game with it; and it isn't modal, as Options isn't then.
  {
    const options = new GameOptions({
      scale: () => 2,
      zoom: () => 2,
      lockVerticalEdges: () => false,
    } as unknown as IPortal);

    (
      options.element().querySelector('.assets button') as HTMLButtonElement
    ).click();

    const library = document.querySelector(
      'dialog.library-window'
    ) as HTMLElement | null;

    expect(
      'Options in a game opens the library for a game, not modal',
      [
        library !== null,
        library?.classList.contains('modal'),
        (library?.querySelector('.imports-in-game') as HTMLElement | null)
          ?.hidden,
      ],
      [true, false, false]
    );

    closeWindows();
  }

  // What Continue says, for each kind of save and one from before #749.
  expect(
    'a save from before says its name',
    continueLabel(save(1, 'player')),
    'Continue · save 1'
  );
  expect(
    'a BCE year',
    continueLabel(
      save(1, 'player', { civilization: 'Roman', turn: 5, year: -3800 })
    ),
    'Continue · Romans · 3800 BCE'
  );
  expect(
    'the player saved it',
    continueDetail({
      ...save(1, 'player'),
      savedAt: Date.now() - 2 * 86400000,
    }),
    'Saved 2 days ago'
  );
  expect(
    'a game as it started',
    continueDetail({ ...save(1, 'start'), savedAt: Date.now() }),
    'Started just now'
  );

  // The newest save, the autosave or the player's.
  expect(
    'the newest save is the one Continue loads',
    newestSave([save(2, 'autosave'), save(5, 'player'), save(3, 'start')])
      ?.savedAt,
    5
  );
  expect('with none, nothing', newestSave([]), null);

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL titleMenu\n${failures
        .map((failure) => `  ${failure}`)
        .join('\n')}\n`
    );
    process.exit(1);
  }

  console.log(`PASS titleMenu (${checks} checks)`);
})();
