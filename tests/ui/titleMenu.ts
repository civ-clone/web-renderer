// The main menu under the new interface (#749): Continue leads when the browser holds a save, named for its
//  civilization and year when the save says them and by its name when it's older, with when it was kept beneath; the
//  items for a game only once the assets are imported, and Import assets only until then; each item's key, but not
//  while a window is open or with a modifier, and none once the menu has gone; the version and release notes under
//  them. New Game offers Customise… first, and Options opens with no game, with the Assets row.
//
// Run over the fake store (`tools/saved-game.js`), for the saves Continue reads.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/grids';

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

  // No save: the items for a game, and no Continue or Import assets.
  {
    const { menu, element } = await openMenu();

    expect('with no save, the menu starts at New game', items(element), [
      'new-game',
      'earth',
      'load-game',
      'hall-of-fame',
      'options',
    ]);
    expect(
      'each item shows its key',
      Array.from(element.querySelectorAll('.ui-title-menu-item .key')).map(
        (key) => key.textContent
      ),
      ['N', 'E', 'L', 'H', 'O']
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
      'and has Import assets',
      options?.querySelector('.assets button')?.textContent,
      'Import assets'
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

  // No assets: only what works without them, and Import assets.
  {
    hasAssets = false;

    await keepSave('kept', new Blob(['']), 'autosave', () => {});

    const { element } = await openMenu();

    expect(
      'without the assets, no game items, Continue included, and Import assets',
      items(element),
      ['hall-of-fame', 'options', 'import-assets']
    );

    key('o');
    await settle();

    expect(
      'Options says nothing is imported',
      document.querySelector('dialog.game-options .assets .status')
        ?.textContent,
      'Not imported'
    );

    closeWindows();
    hasAssets = true;
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
      [['new-game', 'earth', 'load-game', 'hall-of-fame', 'options'], 0]
    );

    resetStore();
  }

  // In a game, Options has no Assets row: the import reloads the page, and the game with it.
  {
    const options = new GameOptions({
      scale: () => 2,
      lockVerticalEdges: () => false,
    } as unknown as IPortal);

    expect(
      'Options in a game has no Assets row',
      options.element().querySelector('.assets'),
      null
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
