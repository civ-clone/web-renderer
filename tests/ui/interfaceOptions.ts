// Interface and Theme in Options (#735). A theme applies as it's chosen and comes back on the next load. An interface
//  loads a new page from the main menu; during a game it waits, with a hint, as reloading would lose the game. Both
//  show what's in use, and choosing drops the visit's `?interface=` or `?theme=`, which would otherwise outrank the
//  choice at the next load, including through the leave guard. Options is modal before a game, so it can't reload one.

// Must stay first: modules read `document` as they load.
import { document } from './lib/dom';

import {
  applyUiTheme,
  currentUiTheme,
  uiThemeFrom,
} from '../../src/js/UI/lib/theme';
import {
  applyInterface,
  chosenInterface,
  interfaceMode,
} from '../../src/js/UI/lib/interfaceMode';
import {
  interfaceRows,
  themeRow,
} from '../../src/js/UI/components/GameOptions';
import addFormatters from '../../src/js/UI/app/i18nFormatters';
import forgetVisitParam, {
  withoutForgottenParams,
} from '../../src/js/UI/lib/forgetVisitParam';
import GameOptions from '../../src/js/UI/components/GameOptions';
import { IPortal } from '../../src/js/UI/components/Portal';
import { allowLeaving, guardLeaving } from '../../src/js/UI/lib/leaveGuard';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
import { instance as options } from '../../src/js/UI/GameOptionsRegistry';
import setOptionDefaults from '../../src/js/UI/app/options';

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

// The page's address, for what `forgetVisitParam` does to it.
const page = {
    location: { href: 'https://civ.one/?interface=new&theme=slate&debug=1' },
    history: {
      state: { leaveGuard: true },
      replaceState: (state: unknown, _title: string, url: URL) => {
        page.location.href = url.toString();
        page.states.push(state);
      },
    },
    states: [] as unknown[],
  },
  visit = (search: string) => {
    page.location.href = `https://civ.one/${search}`;
  },
  choose = (select: HTMLSelectElement, value: string) => {
    select
      .querySelectorAll('option')
      .forEach((option) =>
        option.toggleAttribute('selected', option.value === value)
      );
    select.dispatchEvent(new (globalThis as any).Event('change'));
  },
  root = (document as unknown as Document).documentElement;

Object.assign(globalThis, {
  window: Object.assign(globalThis.window ?? {}, page),
});

(async () => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  addFormatters(i18next);
  await import('../../translations/local/en');
  setOptionDefaults();

  // Which theme a page load uses.
  expect('the option by default', uiThemeFrom(null, 'slate'), 'slate');
  expect(
    'the visit over the option',
    uiThemeFrom('civ1-classic', 'slate'),
    'civ1-classic'
  );
  expect('a bad visit falls to the option', uiThemeFrom('x', 'slate'), 'slate');
  expect('and with neither, classic', uiThemeFrom('x', 7), 'civ1-classic');

  // The Theme row.
  {
    applyUiTheme('slate', root);

    const row = themeRow(),
      select = row.querySelector('select') as HTMLSelectElement;

    expect('it shows the theme in use', select.value, 'slate');
    expect(
      'and offers both, by name',
      [...select.querySelectorAll('option')].map((item) => item.textContent),
      ['Civ1 classic', 'Slate and brass']
    );

    visit('?theme=slate&debug=1');
    choose(select, 'civ1-classic');

    expect('choosing applies at once', currentUiTheme(root), 'civ1-classic');
    expect('and is kept', options.get('uiTheme'), 'civ1-classic');
    expect(
      'and the visit no longer outranks it, leaving the rest',
      page.location.href,
      'https://civ.one/?debug=1'
    );
    expect(
      'the history entry keeps its state',
      page.states.at(-1),
      page.history.state
    );
  }

  // Interface from the main menu: a new page at once.
  {
    applyInterface('new', 'classic', root);
    visit('?interface=new');

    let reloads = 0;

    const [row, hint] = interfaceRows(false, () => reloads++),
      select = row.querySelector('select') as HTMLSelectElement;

    expect('a visit shows what is in use', select.value, 'new');
    expect('with no hint', hint.hidden, true);

    choose(select, 'classic');

    expect(
      'choosing keeps it, drops the visit and loads',
      [options.get('interface'), page.location.href, reloads],
      ['classic', 'https://civ.one/', 1]
    );
  }

  // Interface during a game: the page stays, and says when it changes.
  {
    applyInterface(null, 'classic', root);
    visit('');

    let reloads = 0;

    const [row, hint] = interfaceRows(true, () => reloads++),
      select = row.querySelector('select') as HTMLSelectElement;

    choose(select, 'new');

    expect(
      'choosing keeps it and leaves the game alone',
      [options.get('interface'), reloads, interfaceMode()],
      ['new', 0, 'classic']
    );
    expect('saying when it changes', hint.hidden, false);
    expect('the next load uses it', chosenInterface(), 'new');

    const [againRow, againHint] = interfaceRows(true, () => reloads++);

    expect(
      'Options opened again shows the choice and the hint',
      [
        (againRow.querySelector('select') as HTMLSelectElement).value,
        againHint.hidden,
      ],
      ['new', false]
    );

    choose(select, 'classic');

    expect('going back takes the hint away', hint.hidden, true);
  }

  // With nothing to forget, the address is left alone.
  {
    const before = page.states.length;

    visit('?debug=1');
    forgetVisitParam('theme');

    expect('no change to history', page.states.length, before);
  }

  // Back during a game lands on the entry beneath, which still holds the setting: the guard's new entry must not.
  {
    const pushed: string[] = [];

    expect(
      'a forgotten setting is left off other addresses, leaving the rest',
      withoutForgottenParams('https://civ.one/?theme=slate&debug=1'),
      'https://civ.one/?debug=1'
    );

    Object.assign(globalThis, {
      location: { href: 'https://civ.one/?interface=new&debug=1' },
      history: {
        pushState: (_state: unknown, _title: string, url: string) =>
          pushed.push(url),
      },
    });

    guardLeaving();
    allowLeaving();

    expect('the guard entry leaves it off', pushed, [
      'https://civ.one/?debug=1',
    ]);
  }

  // Interface reloads from the main menu, so Options there must close before a game can start.
  {
    const beforeGame = new GameOptions(null),
      inGame = new GameOptions({
        scale: () => 2,
        lockVerticalEdges: () => false,
      } as unknown as IPortal);

    expect(
      'Options is modal only before a game',
      [
        beforeGame.element().classList.contains('modal'),
        inGame.element().classList.contains('modal'),
      ],
      [true, false]
    );

    beforeGame.close();
    inGame.close();
  }

  if (failures.length) {
    process.stderr.write(
      `FAIL interfaceOptions\n${failures
        .map((failure) => `  ${failure}`)
        .join('\n')}\n`
    );
    process.exit(1);
  }

  console.log(`PASS interfaceOptions (${checks} checks)`);
})();
