// The choice window under the new interface (#745): rows under their headings, the row asked for chosen as it opens,
//  the arrows moving through the rows the filter shows, Enter, a double-click or the primary choosing once, Cancel
//  leaving things as they were, the primary naming the row, the pane describing it, and a one-row list chosen without
//  being shown (#148). Then the build list drawn with it, and the flag choosing it.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import ChoiceWindow, {
  ChoiceRow,
} from '../../src/js/UI/components/ChoiceWindow';
import { BuildItem, CityBuild } from '../../src/js/UI/types';
import CityBuildChoice from '../../src/js/UI/components/CityBuildChoice';
import { CivilopediaEntry } from '../../src/js/Engine/lib/civilopedia';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
import { openCityBuild } from '../../src/js/UI/components/choices';

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
      `FAIL choice-window: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const key = (target: Element, key: string) =>
  target.dispatchEvent(
    new (globalThis as any).KeyboardEvent('keydown', { key, bubbles: true })
  );

const names = (window: ChoiceWindow): string[] =>
  window
    .rows()
    .map((row) => row.querySelector('.ui-choice-name')?.textContent ?? '');

const selected = (window: ChoiceWindow): string[] =>
  window
    .rows()
    .filter((row) => row.getAttribute('aria-selected') === 'true')
    .map((row) => row.querySelector('.ui-choice-name')?.textContent ?? '');

const primaryOf = (window: ChoiceWindow): HTMLButtonElement =>
  window.element().querySelector('.btn-primary') as HTMLButtonElement;

const rows: ChoiceRow[] = [
  {
    value: 'Settlers',
    label: 'Settlers',
    group: 'Units',
    primary: 'Build Settlers',
  },
  {
    value: 'Warriors',
    label: 'Warriors',
    group: 'Units',
    primary: 'Build Warriors',
  },
  { value: 'Barracks', label: 'Barracks', group: 'Improvements' },
  {
    value: 'Temple',
    label: 'Temple',
    group: 'Improvements',
    facts: [{ glyph: 'stat-attack', label: 'Cost', value: '40' }],
    meta: 'Makes one citizen content',
  },
];

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/local/en-GB');

  applyInterface('new', null);

  // The shell on its own.
  const chosen: string[] = [],
    asked: string[] = [],
    window = new ChoiceWindow(
      'What to build',
      rows,
      (value) => chosen.push(value),
      {
        chosen: 'Warriors',
        describe: (row) => {
          asked.push(row.value);

          const details = document.createElement('p');

          details.textContent = `About ${row.label}`;

          return details;
        },
      }
    );

  expect('the rows, in order', names(window), [
    'Settlers',
    'Warriors',
    'Barracks',
    'Temple',
  ]);
  expect(
    'under their headings',
    Array.from(window.element().querySelectorAll('.ui-choice-heading')).map(
      (heading) => heading.textContent
    ),
    ['Units', 'Improvements']
  );
  expect(
    'each heading names its group',
    Array.from(window.element().querySelectorAll('.ui-choice-group')).map(
      (group) =>
        window
          .element()
          .querySelector(`#${group.getAttribute('aria-labelledby')}`)
          ?.textContent
    ),
    ['Units', 'Improvements']
  );
  expect('the row asked for is chosen as it opens', selected(window), [
    'Warriors',
  ]);
  expect(
    'only the chosen row is in the tab order',
    window.rows().map((row) => row.getAttribute('tabindex')),
    ['-1', '0', '-1', '-1']
  );
  expect(
    'the primary names the choice',
    primaryOf(window).textContent,
    'Build Warriors'
  );
  expect(
    'a list of options',
    window.element().querySelector('.ui-choice-list')?.getAttribute('role'),
    'listbox'
  );
  expect(
    'named by the title',
    window
      .element()
      .querySelector('.ui-choice-list')
      ?.getAttribute('aria-label'),
    'What to build'
  );

  await settle();

  expect(
    'the pane describes the chosen row',
    window.element().querySelector('.ui-choice-details')?.textContent,
    'About Warriors'
  );

  const list = window.element().querySelector('.ui-choice-list')!;

  key(window.rows()[1], 'ArrowDown');
  await settle();

  expect('Down chooses the next row, over the heading', selected(window), [
    'Barracks',
  ]);
  expect(
    'with "Choose" where the row names nothing',
    primaryOf(window).textContent,
    'Choose'
  );
  expect(
    'and the pane follows',
    window.element().querySelector('.ui-choice-details')?.textContent,
    'About Barracks'
  );

  key(list, 'End');
  expect('End: the last row', selected(window), ['Temple']);
  key(list, 'ArrowDown');
  expect('Down at the end stays there', selected(window), ['Temple']);
  key(list, 'Home');
  expect('Home: the first row', selected(window), ['Settlers']);
  key(list, 'ArrowUp');
  expect('Up at the top stays there', selected(window), ['Settlers']);

  expect(
    "a row's facts and its line under the name",
    [
      window.rows()[3].querySelector('.ui-choice-meta')?.textContent,
      window.rows()[3].querySelector('.ui-choice-fact')?.textContent,
      window.rows()[3].querySelector('.ui-choice-fact')?.getAttribute('title'),
      !!window.rows()[3].querySelector('.ui-choice-fact .glyph'),
    ],
    ['Makes one citizen content', 'Cost: 40', 'Cost', true]
  );

  // Clicking chooses the row; it doesn't choose it for the city.
  window
    .rows()[2]
    .dispatchEvent(new (globalThis as any).Event('click', { bubbles: true }));
  expect(
    'a click chooses the row, and nothing more',
    [selected(window), chosen],
    [['Barracks'], []]
  );

  // Typing filters, and a chosen row filtered out gives way to the first shown.
  key(list, 'W');
  expect(
    'typing filters the rows',
    window.rows().filter((row) => !row.classList.contains('filtered-out'))
      .length,
    1
  );
  expect(
    'the chosen row filtered out: the first shown instead',
    selected(window),
    ['Warriors']
  );
  expect(
    'a group with nothing shown is hidden',
    Array.from(window.element().querySelectorAll('.ui-choice-group')).map(
      (group) => group.classList.contains('filtered-out')
    ),
    [false, true]
  );

  key(window.rows()[1], 'Escape');
  expect(
    'Escape clears the filter first, and the window stays',
    [window.filter(), window.element().isConnected],
    ['', true]
  );

  key(list, 'End');
  key(list, 'Enter');
  expect('Enter chooses the chosen row, once', chosen, ['Temple']);
  expect('and closes the window', window.element().isConnected, false);

  // A double-click, and the primary.
  const clicked: string[] = [],
    second = new ChoiceWindow('Pick', rows, (value) => clicked.push(value));

  expect('by default the first row is chosen', selected(second), ['Settlers']);
  expect(
    'no describer: no pane',
    (second.element().querySelector('.ui-choice-details') as HTMLElement)
      .hidden,
    true
  );

  second
    .rows()[1]
    .dispatchEvent(
      new (globalThis as any).Event('dblclick', { bubbles: true })
    );
  expect('a double-click chooses that row', clicked, ['Warriors']);

  const third = new ChoiceWindow('Pick', rows, (value) => clicked.push(value));

  primaryOf(third).click();
  expect('the primary chooses the chosen row', clicked, [
    'Warriors',
    'Settlers',
  ]);

  // Cancel leaves things as they were.
  const left: string[] = [],
    fourth = new ChoiceWindow('Pick', rows, (value) => left.push(value));

  (fourth.element().querySelector('.btn-quiet') as HTMLButtonElement).click();
  expect(
    'Cancel closes it, choosing nothing',
    [left, fourth.element().isConnected],
    [[], false]
  );

  const fixed = new ChoiceWindow('Pick', rows, () => {}, { canClose: false });

  expect(
    'a list that must be answered has no Cancel',
    fixed.element().querySelector('.btn-quiet'),
    null
  );
  fixed.close();

  // A list of one is chosen without being shown (#148), unless it's still a decision.
  const before = document.body.children.length,
    only: string[] = [],
    single = new ChoiceWindow('Pick', [rows[0]], (value) => only.push(value));

  expect('one row: nothing chosen in the constructor', only, []);

  await Promise.resolve();

  expect(
    'one row: chosen once the constructor has returned, never shown',
    [only, single.autoChosen(), document.body.children.length - before],
    [['Settlers'], true, 0]
  );

  const decision = new ChoiceWindow('Pick', [rows[0]], () => {}, {
    autoChooseSingle: false,
  });

  expect(
    'one row that is still a decision is shown',
    [decision.autoChosen(), decision.element().isConnected],
    [false, true]
  );
  decision.close();

  // A sprite the tileset can't draw: the row, without it.
  const unsprited = new ChoiceWindow(
    'Pick',
    [
      {
        ...rows[0],
        sprite: () => {
          throw new Error('no image');
        },
      },
      { ...rows[1], sprite: () => document.createElement('canvas') },
    ],
    () => {}
  );

  expect(
    'a sprite that fails is left out, the row kept',
    unsprited
      .rows()
      .map((row) => row.querySelector('.ui-choice-sprite')!.children.length),
    [0, 1]
  );
  unsprited.close();

  // The pane: an answer that comes late for a row no longer chosen is dropped, and a failure leaves it empty.
  let release: (node: Node | null) => void = () => {};

  const slow = new ChoiceWindow('Pick', rows, () => {}, {
    describe: (row) =>
      row.value === 'Settlers'
        ? new Promise<Node | null>((resolve) => (release = resolve))
        : row.value === 'Warriors'
        ? Promise.reject(new Error('not answered'))
        : null,
  });
  const slowList = slow.element().querySelector('.ui-choice-list')!;

  key(slowList, 'ArrowDown');
  await settle();

  const late = document.createElement('p');

  late.textContent = 'About Settlers';
  release(late);
  await settle();

  expect(
    'a late answer for another row is dropped; a failed one leaves the pane empty',
    slow.element().querySelector('.ui-choice-details')?.textContent,
    ''
  );
  slow.close();

  // The pane is emptied as the choice moves, and of two answers for the same row, only the later is drawn.
  const pending: ((node: Node | null) => void)[] = [],
    about = (text: string) => {
      const node = document.createElement('p');

      node.textContent = text;

      return node;
    },
    again = new ChoiceWindow('Pick', rows, () => {}, {
      describe: () =>
        new Promise<Node | null>((resolve) => pending.push(resolve)),
    });
  const againList = again.element().querySelector('.ui-choice-list')!,
    againPane = again.element().querySelector('.ui-choice-details')!;

  pending[0](about('First'));
  await settle();
  key(againList, 'ArrowDown');
  await settle();

  const emptied = againPane.textContent;

  key(againList, 'ArrowUp');
  pending[2](about('First, again'));
  await settle();
  pending[1](about('Second'));
  await settle();

  expect(
    'the pane empties as the choice moves; only the latest answer is drawn',
    [emptied, againPane.textContent],
    ['', 'First, again']
  );

  // A numpad key moves the choice and isn't typed into the filter too.
  const numpadRow = again.rows()[0];

  numpadRow.dispatchEvent(
    new (globalThis as any).KeyboardEvent('keydown', {
      key: '2',
      code: 'Numpad2',
      location: 3,
      bubbles: true,
    })
  );
  expect(
    'numpad 2 moves down without filtering',
    [selected(again), again.filter()],
    [['Warriors'], '']
  );
  again.close();

  // The row that takes the focus is the one chosen: Down from the filter box, with the chosen row still shown, moves
  //  the focus to the first row shown, and Enter takes that row, not the one chosen before.
  const taken: string[] = [],
    boxed = new ChoiceWindow('Pick', rows, (value) => taken.push(value), {
      chosen: 'Temple',
    }),
    box = boxed
      .element()
      .querySelector('.window-filter input') as HTMLInputElement;

  box.value = 'e';
  boxed.refilter();
  expect('a filter that still shows the chosen row keeps it', selected(boxed), [
    'Temple',
  ]);

  key(box, 'ArrowDown');
  // The stub DOM doesn't send `focusin` for `focus()`, nor track the focus: sent here to the row the box focuses, the
  //  first shown, as the browser does.
  boxed
    .rows()[0]
    .dispatchEvent(new (globalThis as any).Event('focusin', { bubbles: true }));
  expect('Down from the box chooses the row it focuses', selected(boxed), [
    'Settlers',
  ]);

  key(boxed.rows()[0], 'Enter');
  expect('and Enter takes that row', taken, ['Settlers']);

  // A filter that hides every row, then cleared: the row the player chose comes back.
  const kept = new ChoiceWindow('Pick', rows, () => {}, { chosen: 'Barracks' }),
    keptBox = kept
      .element()
      .querySelector('.window-filter input') as HTMLInputElement;

  keptBox.value = 'zzz';
  kept.refilter();
  expect(
    'a filter that hides every row: nothing chosen, the primary off',
    [selected(kept), primaryOf(kept).disabled],
    [[], true]
  );

  keptBox.value = '';
  kept.refilter();
  expect('cleared: the row the player chose is chosen again', selected(kept), [
    'Barracks',
  ]);

  // The window putting the focus back on its chosen row, as when a window opened from it closes, isn't the player
  //  choosing that row. `focus()` sends `focusin` here as a browser's does.
  kept.rows().forEach((row) => {
    row.focus = () =>
      row.dispatchEvent(
        new (globalThis as any).Event('focusin', { bubbles: true })
      );
  });
  keptBox.value = 'Settl';
  kept.refilter();
  kept.element().dispatchEvent(new (globalThis as any).Event('focus'));
  expect(
    'filtered: the first shown is chosen, and focused by the window',
    selected(kept),
    ['Settlers']
  );

  keptBox.value = '';
  kept.refilter();
  expect('cleared again: still the row the player chose', selected(kept), [
    'Barracks',
  ]);
  kept.close();

  // A describer that throws, rather than rejecting: an empty pane, and the window still made.
  const throwing = new ChoiceWindow('Pick', rows, () => {}, {
    describe: () => {
      throw new Error('no entry');
    },
  });

  await settle();

  expect(
    'a describer that throws leaves the pane empty',
    [
      throwing.element().isConnected,
      throwing.element().querySelector('.ui-choice-details')?.textContent,
    ],
    [true, '']
  );
  throwing.close();

  // The build list.
  const sent: any[] = [],
    entries: CivilopediaEntry[] = [
      {
        key: 'Settlers',
        name: 'Settlers',
        kind: 'unit',
        requires: [],
        leadsTo: [],
        cost: 30,
        stats: { attack: 0, defence: 1, movement: 1, visibility: 1 },
      },
      // Keyed as the build item is named, but not a kind the build list asks for.
      {
        key: 'Temple',
        name: 'Temple of Artemis',
        kind: 'tileImprovement',
        requires: [],
        leadsTo: [],
        cost: null,
        stats: null,
      },
      {
        key: 'TempleImprovement',
        name: 'Temple',
        kind: 'improvement',
        requires: [],
        leadsTo: [],
        cost: 40,
        stats: null,
      },
    ],
    opened: string[] = [],
    transport = {
      send: (channel: string, data: unknown) => sent.push([channel, data]),
      request: async (request: { channel(): string }) => {
        const channel = request.channel();

        if (channel === 'getCivilopedia') {
          return entries;
        }

        if (channel === 'getRequirements') {
          return [];
        }

        throw new Error(`unexpected request ${channel}`);
      },
    } as any,
    city = {
      id: 'City-1',
      name: 'Rome',
      originalPlayer: { civilization: { _: 'Roman' } },
      player: { civilization: { _: 'Roman' } },
      yields: [{ _: 'Production', __: ['Production', 'Yield'], value: 5 }],
    },
    cityBuild = {
      _: 'CityBuild',
      id: 'CityBuild-1',
      auto: false,
      building: {
        _: 'BuildItem',
        id: 'b',
        item: { _: 'Temple' },
        cost: { value: 40 },
      },
      city,
      cleared: null,
      cost: { value: 40 },
      progress: { value: 10 },
    } as unknown as CityBuild,
    available = [
      {
        _: 'BuildItem',
        id: 'b1',
        item: { _: 'Settlers' },
        cost: { value: 30 },
        group: 'unit',
        stats: { attack: 0, defence: 1, movement: 1, visibility: 1 },
      },
      {
        _: 'BuildItem',
        id: 'b2',
        item: { _: 'Temple' },
        cost: { value: 40 },
        group: 'improvement',
        stats: null,
      },
    ] as unknown as BuildItem[],
    build = new CityBuildChoice(
      cityBuild,
      available,
      transport,
      (hasSelected) => opened.push(`complete:${hasSelected}`)
    );

  expect(
    'the build list: what the city can build, under the sections',
    [
      names(build),
      Array.from(build.element().querySelectorAll('.ui-choice-heading')).map(
        (heading) => heading.textContent
      ),
    ],
    [
      ['Settlers', 'Temple'],
      ['Units', 'City Improvements'],
    ]
  );
  expect('what the city builds now is chosen as it opens', selected(build), [
    'Temple',
  ]);
  expect('the primary names it', primaryOf(build).textContent, 'Build Temple');
  expect(
    "a unit's attack, defence and moves, then each item's cost and turns",
    build
      .rows()
      .map((row) =>
        Array.from(row.querySelectorAll('.ui-choice-fact')).map(
          (fact) => fact.textContent
        )
      ),
    [
      [
        'Attack: 0',
        'Defense: 1',
        'Moves: 1',
        'Cost in shields: 30',
        'Turns: 4 turns',
      ],
      ['Cost in shields: 40', 'Turns: 6 turns'],
    ]
  );
  expect(
    'the cost is shown with the production icon, not the word',
    build
      .rows()
      .map(
        (row) =>
          row.querySelectorAll('.ui-choice-fact')[
            row.querySelectorAll('.ui-choice-fact').length - 2
          ].firstElementChild?.className
      ),
    ['yield-icon', 'yield-icon']
  );
  expect(
    'the eyebrow says what kind of window',
    build.element().querySelector('.ui-window-eyebrow')?.textContent,
    'Production'
  );
  expect(
    "Auto and Can't build… beside the primary",
    Array.from(
      build.element().querySelectorAll('.ui-window-footer button')
    ).map((button) => button.textContent),
    ['Cancel', 'Auto', 'Can’t build…', 'Build Temple']
  );

  await settle();
  await settle();

  expect(
    "the pane: the item's Civilopedia entry, found by its class name among the kinds asked for, with a link to it",
    [
      build.element().querySelector('.ui-choice-details .entry-name')
        ?.textContent,
      (
        build
          .element()
          .querySelector(
            '.ui-choice-details .ui-choice-entry-more a'
          ) as HTMLElement
      )?.dataset.key,
    ],
    ['Temple', 'TempleImprovement']
  );

  key(build.element().querySelector('.ui-choice-list')!, 'Home');
  key(build.element().querySelector('.ui-choice-list')!, 'Enter');

  expect(
    'choosing changes what the city builds, and completes the prompt',
    [sent, opened],
    [
      [
        [
          'action',
          { name: 'ChangeProduction', id: 'CityBuild-1', chosen: 'Settlers' },
        ],
      ],
      ['complete:true'],
    ]
  );

  const empty = {
      ...cityBuild,
      building: null,
      cleared: { reason: 'completed', item: { _: 'Temple' } },
    } as unknown as CityBuild,
    fresh = new CityBuildChoice(empty, available, transport);

  expect(
    'building nothing: why it opened, over the list, and the first row chosen',
    [
      fresh.element().querySelector('.build-cleared')?.textContent,
      selected(fresh),
    ],
    ['Production complete: Temple', ['Settlers']]
  );

  sent.length = 0;
  (
    Array.from(
      fresh.element().querySelectorAll('.ui-window-footer button')
    ).find((button) => button.textContent === 'Auto') as HTMLButtonElement
  ).click();
  expect(
    'Auto puts the city on Auto, and closes',
    [sent, fresh.element().isConnected],
    [[['action', { name: 'CityBuild', id: 'CityBuild-1', auto: true }]], false]
  );

  await i18next.changeLanguage('en-GB');
  expect('en-GB: Defence', i18next.t('ChoiceWindow.Build.defence'), 'Defence');
  await i18next.changeLanguage('en');

  // The flag picks which.
  applyInterface('classic', null);
  const classic = openCityBuild(cityBuild, available, transport);
  applyInterface('new', null);
  const modern = openCityBuild(cityBuild, available, transport);

  expect(
    'the classic interface opens the classic list, the new one the choice window',
    [classic.constructor.name, modern.constructor.name],
    ['CityBuildSelectionWindow', 'CityBuildChoice']
  );

  classic.close();
  modern.close();

  await settle();

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL choice-window (${failures.length} of ${checks})\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS choice-window (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL choice-window: ${error?.stack ?? error}\n`);
  process.exit(1);
});
