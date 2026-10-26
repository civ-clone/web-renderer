// A window's list narrowed by typing (#661): fuzzy, on each whole row, folding case and accents, kept when the list is
//  redrawn, and cleared by Escape before Escape does anything else.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import { fold, matches } from '../../src/js/UI/lib/filterRows';
import FilterableWindow from '../../src/js/UI/components/FilterableWindow';
import i18next from 'i18next';

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
    process.stderr.write(
      `FAIL window-filter: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

const press = (target: HTMLElement, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
  });

  target.dispatchEvent(event);

  return event;
};

const list = (...cities: [string, string][]): HTMLElement => {
  const table = document.createElement('table');

  cities.forEach(([name, building]) => {
    const row = document.createElement('tr');

    row.innerHTML = `<th>${name}</th><td>${building}</td>`;
    table.append(row);
  });

  return table as unknown as HTMLElement;
};

const run = async (): Promise<void> => {
  await i18next.init({ lng: 'en', resources: {} });

  // The matching.
  expect('folds case and accents', fold('Zürich ÉCOLE'), 'zurich ecole');
  expect(
    'a substring matches',
    matches('musk', fold('Moscow Musketmen')),
    true
  );
  expect(
    'and so do the characters in order, apart',
    matches('musk', fold('Murmansk Warriors')),
    true
  );
  expect(
    'but not out of order',
    matches('musk', fold('Kursk Settlers')),
    false
  );
  expect('an empty query matches anything', matches('', 'anything'), true);

  // A window.
  const window = new FilterableWindow(
      'Cities',
      list(
        ['Moscow', 'Musketmen'],
        ['Kursk', 'Settlers'],
        ['Murmansk', 'Warriors'],
        ['Zürich', 'Granary']
      ),
      { rowSelector: 'tr' }
    ),
    dialog = window.element(),
    input = (): HTMLInputElement =>
      dialog.querySelector('.window-filter input') as HTMLInputElement,
    empty = (): boolean =>
      (dialog.querySelector('.filter-empty') as HTMLElement).hidden,
    shown = (): string[] =>
      Array.from(dialog.querySelectorAll('.body tr'))
        .filter((row) => !row.classList.contains('filtered-out'))
        .map((row) => row.querySelector('th')!.textContent!),
    type = (text: string): void => {
      input().value = text;
      input().dispatchEvent(new Event('input', { bubbles: true }));
    };

  expect(
    'the box sits between the title bar and the body',
    Array.from(dialog.children).map(
      (child) => child.className || child.tagName
    ),
    ['HEADER', 'window-filter', 'body']
  );
  expect('every row is shown to start with', shown(), [
    'Moscow',
    'Kursk',
    'Murmansk',
    'Zürich',
  ]);

  type('musk');

  expect('typing keeps the rows that match, in their order', shown(), [
    'Moscow',
    'Murmansk',
  ]);
  expect('and says nothing about an empty list', empty(), true);

  type('zurich');

  expect('accents fold', shown(), ['Zürich']);

  type('GRAN');

  expect('every column counts, whatever its case', shown(), ['Zürich']);

  type('xyz');

  expect('nothing matching hides every row', shown(), []);
  expect('and says so', empty(), false);

  // Redrawn, as City Status is when the game changes: the filter applies to the new rows.
  type('musk');

  window.update(list(['Murmansk', 'Musketmen'], ['Kyiv', 'Granary']));

  expect(
    'the box keeps its text when the list is redrawn',
    input().value,
    'musk'
  );
  expect('and filters the new rows', shown(), ['Murmansk']);

  // Escape with text clears the filter, and does nothing else.
  const cleared = press(input(), 'Escape');

  expect(
    'Escape with text clears the filter',
    [input().value, shown(), cleared.defaultPrevented],
    ['', ['Murmansk', 'Kyiv'], true]
  );
  expect('and leaves the window open', dialog.isConnected, true);

  // Typing anywhere else in the window goes to the box; `/` only focuses it, and Space is left to the buttons.
  const button = document.createElement('button');

  dialog.querySelector('.body')!.append(button);

  const slash = press(button as unknown as HTMLElement, '/');

  expect(
    '`/` is taken for the box, and typed nowhere',
    [slash.defaultPrevented, input().value],
    [true, '']
  );

  press(button as unknown as HTMLElement, 'k');
  press(button as unknown as HTMLElement, 'y');

  expect('typing in the window fills the box', input().value, 'ky');
  expect('and filters', shown(), ['Kyiv']);

  const space = press(button as unknown as HTMLElement, ' ');

  expect(
    'Space is left alone',
    [space.defaultPrevented, input().value],
    [false, 'ky']
  );

  press(input(), 'Escape');

  // Escape on an empty box is the window's again.
  press(input(), 'Escape');

  expect(
    'Escape with an empty box closes the window',
    dialog.isConnected,
    false
  );

  // Groups.
  const sections = document.createElement('div');

  sections.innerHTML =
    '<section><h4>Units</h4><ul><li>Musketmen</li><li>Settlers</li></ul></section>' +
    '<section><h4>Advances</h4><ul><li>Bronze Working</li></ul></section>';

  const grouped = new FilterableWindow('Index', sections as unknown as Node, {
      groupSelector: 'section',
      rowSelector: 'li',
    }),
    groups = (): boolean[] =>
      Array.from(grouped.element().querySelectorAll('section')).map((section) =>
        section.classList.contains('filtered-out')
      ),
    groupedInput = grouped
      .element()
      .querySelector('.window-filter input') as HTMLInputElement;

  groupedInput.value = 'brnz';
  groupedInput.dispatchEvent(new Event('input', { bubbles: true }));

  expect('a group with no matching rows is hidden', groups(), [true, false]);

  groupedInput.value = '';
  groupedInput.dispatchEvent(new Event('input', { bubbles: true }));

  expect('and shown again once the filter is cleared', groups(), [
    false,
    false,
  ]);

  grouped.close();

  finished = true;

  if (failures.length) {
    console.error(`FAIL window-filter\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(`PASS window-filter (${checks} checks)`);
};

run();
