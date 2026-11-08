// Find City (#346): the cities on the squares the player holds, their own and rivals', by name with the owner under
//  each. Typing narrows the list whatever its accents, the best matches first and the first of them chosen; Enter takes
//  it, and goes no further; arrow keys choose another; Escape leaves things as they were.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/classicInterface';

import { City, Tile } from '@civ-clone/ui-client/types';
import {
  findCityRows,
  openFindCity,
} from '@civ-clone/ui-windows/components/FindCity';
import eyebrowFor from '@civ-clone/ui-widgets/lib/windowEyebrows';
import { matchRank } from '@civ-clone/ui-widgets/lib/filterRows';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

const failures: string[] = [];
let checks = 0;

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

const tile = (x: number, name: string | null, owner = 'Egyptian'): Tile =>
  ({
    id: `Tile-${x}`,
    x,
    y: 0,
    city:
      name === null
        ? null
        : ({
            growth: { size: x + 1 },
            name,
            originalPlayer: { civilization: { _: owner } },
            player: { civilization: { _: owner } },
          } as unknown as City),
  } as unknown as Tile);

const tiles = [
  tile(0, null),
  tile(1, 'Zürich', 'German'),
  tile(2, 'Aberdeen', 'English'),
  tile(3, 'Berlin', 'German'),
  tile(4, 'Orléans', 'French'),
  tile(5, 'New Bern', 'American'),
  tile(6, 'Bern', 'German'),
];

const labels = (): string[] =>
    Array.from(
      document.querySelectorAll('.ui-choice-row:not(.filtered-out)')
    ).map((row) => (row as HTMLElement).textContent ?? ''),
  input = (): HTMLInputElement =>
    document.querySelector('.window-filter input') as HTMLInputElement,
  type = (text: string): void => {
    input().value = text;
    input().dispatchEvent(new Event('input', { bubbles: true }));
  },
  press = (target: EventTarget, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
    });

    target.dispatchEvent(event);

    return event;
  };

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');

  expect(
    'a name that starts with what is typed comes first, then a later word, then inside, then its letters in order',
    ['ber', 'bern', 'erl', 'brn'].map((query, index) =>
      matchRank(query, ['berlin', 'new bern', 'berlin', 'bern'][index])
    ),
    [0, 1, 2, 3]
  );

  const rows = findCityRows(tiles);

  expect(
    'only the squares with a city, by name',
    rows.map(({ label }) => label),
    ['Aberdeen', 'Berlin', 'Bern', 'New Bern', 'Orléans', 'Zürich']
  );
  expect(
    'each with its size, and what the button says',
    [rows[1].facts?.[0].value, rows[1].primary],
    ['4', 'Show on map']
  );

  const opened: string[] = [],
    window = openFindCity(tiles, ({ id }) => opened.push(id)),
    first = (): string => labels()[0];

  expect('every city is listed', labels().length, 6);
  expect('the first chosen', window.chosen(), 'Tile-2');
  expect(
    'the window says what it is, and its key, unescaped',
    eyebrowFor(['find-city']),
    'Reference · /'
  );

  type('ber');

  expect(
    'names that start with it first, though the list was by name',
    labels()
      .slice(0, 2)
      .map((label) => label.slice(0, 4)),
    ['Berl', 'Bern']
  );
  expect('and the best is chosen', window.chosen(), 'Tile-3');

  type('bern');

  expect('a closer match takes over', window.chosen(), 'Tile-6');
  expect('with a later word next', labels()[1].startsWith('New Bern'), true);

  type('zurich');

  expect('without its accent', first().startsWith('Zürich'), true);

  type('ORLÉANS');

  expect('with one, in any case', first().startsWith('Orléans'), true);

  type('');

  expect(
    'cleared, the list is by name again',
    labels().map((label) => label.slice(0, 4)),
    ['Aber', 'Berl', 'Bern', 'New ', 'Orlé', 'Züri']
  );

  type('bern');

  const enter = press(input(), 'Enter');

  expect('Enter in the box takes the best match', opened, ['Tile-6']);
  expect('and stops there', enter.defaultPrevented, true);
  expect(
    'the window closes',
    document.querySelector('dialog.find-city[open]'),
    null
  );

  // Moved with the arrows, the player's choice stays.
  const again = openFindCity(tiles, ({ id }) => opened.push(id));

  press(document.querySelector('.ui-choice-list') as Element, 'ArrowDown');

  expect('the arrows choose the next row', again.chosen(), 'Tile-3');

  expect(
    'asked again while open, it is the same list',
    openFindCity(tiles, () => {}) === again,
    true
  );
  expect(
    'and only one',
    document.querySelectorAll('dialog.find-city[open]').length,
    1
  );

  type('bern');

  expect(
    'what is typed next outranks the row the arrows chose, though it still matches',
    again.chosen(),
    'Tile-6'
  );

  // A row with the focus, moved as the filter clears: it would leave the focus on the page, and the keys to the game.
  const focused: string[] = [],
    list = document.querySelector('.ui-choice-list') as HTMLElement,
    row = list.querySelector('.ui-choice-row') as HTMLElement,
    activeElement = Object.getOwnPropertyDescriptor(document, 'activeElement');

  list.querySelectorAll('.ui-choice-row').forEach((element) =>
    Object.assign(element, {
      focus: () => focused.push(element.textContent?.slice(0, 4) ?? ''),
    })
  );
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => row,
  });

  press(row, 'Escape');

  if (activeElement) {
    Object.defineProperty(document, 'activeElement', activeElement);
  } else {
    delete (document as any).activeElement;
  }

  expect('Escape clears the filter', input().value, '');
  expect('the focus stays on the list, on the first row', focused, ['Aber']);
  expect(
    'the list is over everything, so a click on the page leaves the keys with it',
    document.querySelector('dialog.find-city')?.classList.contains('modal'),
    true
  );
  expect('and the window stays open', again.chosen(), 'Tile-2');

  const held = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: '/',
  });

  Object.defineProperty(held, 'repeat', { value: true });
  input().dispatchEvent(held);

  expect('/ held down does not type itself', held.defaultPrevented, true);

  const composing = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
  });

  Object.defineProperty(composing, 'isComposing', { value: true });
  type('bern');

  const before = opened.length;

  input().dispatchEvent(composing);

  expect(
    'Enter finishing an input method chooses nothing',
    opened.length,
    before
  );
  expect('and goes on to the input method', composing.defaultPrevented, false);

  again.close();

  // The order unchanged as the filter clears: the choice goes back to the first row, and the focus has to go with it,
  //  or Enter would take a row other than the one focused.
  const short = openFindCity(
      [tile(3, 'Berlin', 'German'), tile(6, 'Bern', 'German')],
      () => {}
    ),
    shortList = document.querySelector('.ui-choice-list') as HTMLElement,
    shortRows = Array.from(
      shortList.querySelectorAll('.ui-choice-row')
    ) as HTMLElement[],
    refocused: string[] = [];

  type('ber');
  press(shortList, 'ArrowDown');

  expect('the arrows chose the second row', short.chosen(), 'Tile-6');

  shortRows.forEach((element) =>
    Object.assign(element, {
      focus: () => refocused.push(element.textContent?.slice(0, 4) ?? ''),
    })
  );
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => shortRows[1],
  });

  press(shortRows[1], 'Escape');

  if (activeElement) {
    Object.defineProperty(document, 'activeElement', activeElement);
  } else {
    delete (document as any).activeElement;
  }

  expect('the first row is chosen again', short.chosen(), 'Tile-3');
  expect('and has the focus, though no row moved', refocused, ['Berl']);

  short.close();

  // Nothing known yet.
  const none = openFindCity([tile(0, null)], () => {});

  expect(
    'with no cities, it says so',
    document.querySelector('.find-city .ui-choice > p')?.textContent,
    "You don't know of any cities yet."
  );
  expect(
    'and there is no box to type in',
    input()?.closest('[hidden]') !== null || input().parentElement?.hidden,
    true
  );

  none.close();

  // One city is still a list to look at, not a jump.
  const one = openFindCity([tile(1, 'Memphis')], ({ id }) => opened.push(id));

  await Promise.resolve();

  expect('a lone city is not chosen for the player', opened.length, 1);

  one.close();
};

run()
  .catch((error) => {
    failures.push(String(error?.stack ?? error));
  })
  .finally(() => {
    if (failures.length > 0) {
      process.stderr.write(
        `FAIL find-city: ${
          failures.length
        } of ${checks} checks\n  ${failures.join('\n  ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write(`PASS find-city: ${checks} checks\n`);
    process.exit(0);
  });
