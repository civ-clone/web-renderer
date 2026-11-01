// The report table under the new interface (#744): headings that sort, and keep their sort across a redraw, numbers
//  in the locale's format, warnings as a class on the cell, rows that open their item and keep the focus, a totals row,
//  and the filter over its rows. Then City Status and Trade drawn with it, and the flag choosing them.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { City, Player } from '../../src/js/UI/types';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';
import CityStatus from '../../src/js/UI/components/CityStatus';
import CityStatusTable from '../../src/js/UI/components/CityStatusTable';
import Portal from '../../src/js/UI/components/Portal';
import ReportTable from '../../src/js/UI/components/lib/ReportTable';
import TradeReport from '../../src/js/UI/components/TradeReport';
import TradeTable from '../../src/js/UI/components/TradeTable';
import Transport from '../../src/js/UI/Transport';
import { assetStore } from '../../src/js/UI/AssetStore';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
import {
  openCityStatus,
  openTradeReport,
} from '../../src/js/UI/components/reports';

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
    process.stderr.write(`FAIL report-table: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// No IndexedDB under node: every picture is its path.
(assetStore as any).get = (path: string) =>
  Promise.resolve({ name: path, uri: path });
(assetStore as any).shownAtURL = () => Promise.resolve('icon.png');
(assetStore as any).firstImported = (paths: string[]) =>
  Promise.resolve(paths[0]);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

type Row = { id: string; name: string; gold: number };

const texts = (table: HTMLTableElement, selector: string): string[] =>
  Array.from(table.querySelectorAll(selector)).map(
    (cell) => cell.textContent ?? ''
  );

const yieldOf = (_: string, group: string, value: number) => ({
  _,
  __: [_, group, 'Yield'],
  value,
});

const city = (
  id: string,
  name: string,
  {
    size = 1,
    food = 2,
    shields = 1,
    trade = 0,
    corruption = 0,
    gold = 0,
    upkeep = [] as string[],
    moods = [] as string[],
    civilDisorder = false,
  } = {}
): City =>
  ({
    id,
    name,
    build: {
      id: `CityBuild-${id}`,
      building: null,
      cost: { value: Infinity },
      progress: { value: 0 },
    },
    civilDisorder,
    citizens: { moods, causes: [] },
    growth: {
      id: `CityGrowth-${id}`,
      size,
      cost: { value: 20 },
      progress: { value: 5 },
    },
    originalPlayer: { civilization: { _: 'Mongol' } },
    player: { civilization: { _: 'Mongol' } },
    specialists: [],
    yields: [
      yieldOf('Food', 'Food', food),
      yieldOf('Production', 'Production', shields),
      yieldOf('Trade', 'Trade', trade),
      yieldOf('Corruption', 'Trade', -corruption),
      yieldOf('Gold', 'Gold', gold),
      ...upkeep.map((improvement) => ({
        ...yieldOf('CityImprovementMaintenanceGold', 'Gold', -1),
        cityImprovement: { _: improvement },
      })),
    ],
  } as unknown as City);

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-city/en');
  await import('../../translations/civ1-city-improvement/en');

  // The component on its own.
  const opened: string[] = [],
    table = new ReportTable<Row>({
      columns: [
        {
          key: 'name',
          heading: 'Name',
          header: true,
          cell: ({ name }) => name,
          sortValue: ({ name }) => name,
        },
        {
          key: 'gold',
          heading: 'Gold',
          kind: 'number',
          cell: ({ gold }) => gold,
          sortValue: ({ gold }) => gold,
          tone: ({ gold }) => (gold < 0 ? 'negative' : null),
        },
        { key: 'note', heading: 'Note', cell: () => '' },
      ],
      rowKey: ({ id }) => id,
      open: ({ name }) => opened.push(name),
      totals: (rows) => ({
        gold: rows.reduce((total, { gold }) => total + gold, 0),
      }),
    }),
    rows: Row[] = [
      { id: 'a', name: 'Zürich', gold: 1200 },
      { id: 'b', name: 'Athens', gold: -3 },
      { id: 'c', name: 'Memphis', gold: 40 },
    ];

  document.body.append(table.element());
  table.update(rows);

  const names = () => texts(table.element(), 'tbody th');

  expect('rows come in the order given', names(), [
    'Zürich',
    'Athens',
    'Memphis',
  ]);
  expect(
    'numbers in the locale format',
    texts(table.element(), 'tbody td[data-column="gold"]'),
    ['1,200', '-3', '40']
  );
  expect(
    'a sortable heading is a button, the other is not',
    Array.from(table.element().querySelectorAll('thead th')).map(
      (cell) => cell.querySelector('button') !== null
    ),
    [true, true, false]
  );
  expect(
    'a negative figure is coloured, not worded',
    Array.from(
      table.element().querySelectorAll('tbody td[data-column="gold"]')
    ).map((cell) => cell.classList.contains('ui-report-table-negative')),
    [false, true, false]
  );
  expect(
    'the totals row adds the column and says what it is',
    texts(table.element(), 'tfoot th, tfoot td'),
    ['Total', '1,237', '']
  );

  const goldHeading = table
    .element()
    .querySelector<HTMLButtonElement>('thead th:nth-child(2) button')!;

  goldHeading.click();

  expect('a number sorts most first', names(), ['Zürich', 'Memphis', 'Athens']);
  expect(
    'and its heading is marked',
    table
      .element()
      .querySelector('thead th:nth-child(2)')
      ?.getAttribute('aria-sort'),
    'descending'
  );

  goldHeading.click();

  expect('a second click turns it round', names(), [
    'Athens',
    'Memphis',
    'Zürich',
  ]);

  table
    .element()
    .querySelector<HTMLButtonElement>('thead th:nth-child(1) button')!
    .click();

  expect('words sort A to Z, accents and all', names(), [
    'Athens',
    'Memphis',
    'Zürich',
  ]);
  expect(
    'only the sorted heading is marked',
    Array.from(table.element().querySelectorAll('thead th')).map((cell) =>
      cell.getAttribute('aria-sort')
    ),
    ['ascending', null, null]
  );

  // linkedom has no focus, so it's tracked by hand.
  let focused: HTMLElement | null = null;

  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => focused,
  });

  HTMLElement.prototype.focus = function (this: HTMLElement) {
    focused = this;
  };

  table.sortBy('gold', 'descending');

  const before = table.element().querySelectorAll('tbody tr')[1] as HTMLElement;

  before.focus();

  table.update([
    { id: 'a', name: 'Zürich', gold: 1 },
    { id: 'b', name: 'Athens', gold: 500 },
    { id: 'c', name: 'Memphis', gold: 40 },
    { id: 'd', name: 'Babylon', gold: 90 },
  ]);

  expect('the sort survives an update', names(), [
    'Athens',
    'Babylon',
    'Memphis',
    'Zürich',
  ]);
  expect(
    'and the row keeps its element, so the focus stays on it, wherever it went',
    [
      (document.activeElement as HTMLElement | null) === before,
      before.isConnected,
      before.querySelector('th')?.textContent,
      before.querySelector('[data-column="gold"]')?.textContent,
    ],
    [true, true, 'Memphis', '40']
  );

  const memphis = table
    .element()
    .querySelectorAll('tbody tr')[2] as HTMLElement;

  memphis.click();
  memphis.dispatchEvent(
    new (globalThis as any).KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
    })
  );

  expect('a row opens on a click and on Enter', opened, ['Memphis', 'Memphis']);
  expect('and can take the focus', memphis.getAttribute('tabindex'), '0');

  table.element().remove();

  // City Status.
  const portal = {
      openCity: (city: City) => opened.push(`city:${city.name}`),
    } as unknown as Portal,
    player = {
      id: 'Player-1',
      cities: [
        city('City-1', 'Karakorum', {
          size: 6,
          food: -2,
          shields: 3,
          trade: 12,
          corruption: 4,
          moods: ['happy', 'content', 'unhappy', 'unhappy', 'unhappy'],
          civilDisorder: true,
        }),
        city('City-2', 'Samarkand', {
          size: 3,
          food: 2,
          shields: -1,
          trade: 5,
          moods: ['content', 'content', 'content'],
        }),
      ],
      government: { _: 'Despotism' },
    } as unknown as Player;

  const status = new CityStatusTable(player, portal);

  await settle();

  const statusTable = status.table().element();

  expect(
    'City Status has a heading for each column',
    Array.from(statusTable.querySelectorAll('thead th')).map(
      (cell) => cell.textContent
    ),
    [
      'City',
      'Size',
      'Building',
      'Food',
      'Shields',
      'Trade',
      'Corruption',
      'Happy',
      'Content',
      'Unhappy',
    ]
  );
  expect(
    'a row for each city, with its figures',
    Array.from(statusTable.querySelectorAll('tbody tr')).map((row) =>
      [
        'food',
        'shields',
        'trade',
        'corruption',
        'happy',
        'content',
        'unhappy',
      ].map(
        (column) => row.querySelector(`[data-column="${column}"]`)?.textContent
      )
    ),
    [
      ['-2', '3', '12', '4', '1', '1', '3'],
      ['2', '-1', '5', '0', '0', '3', '0'],
    ]
  );
  expect(
    'starving is a warning on food, a shortfall of shields a loss',
    Array.from(statusTable.querySelectorAll('tbody tr')).map((row) =>
      ['food', 'shields'].map(
        (column) =>
          row.querySelector(`[data-column="${column}"]`)?.className ?? ''
      )
    ),
    [
      ['ui-report-table-number ui-report-table-warn', 'ui-report-table-number'],
      [
        'ui-report-table-number',
        'ui-report-table-number ui-report-table-negative',
      ],
    ]
  );
  expect(
    'a city in disorder has the flag, said in words, and its unhappy are coloured',
    [
      statusTable.querySelectorAll('tbody tr:first-child .glyph-flag').length,
      statusTable.querySelector('tbody tr:first-child th')?.textContent,
      statusTable
        .querySelector('tbody tr:first-child [data-column="unhappy"]')
        ?.classList.contains('ui-report-table-negative'),
      statusTable.querySelectorAll('tbody tr:last-child .glyph-flag').length,
    ],
    [1, 'Civil disorder: Karakorum', true, 0]
  );
  expect(
    'size and the bar, and the turns to grow',
    statusTable.querySelector('tbody tr:last-child [data-column="size"]')
      ?.textContent,
    '38 turns'
  );

  status.table().sortBy('size', 'ascending');
  player.cities[0].growth.size = 7;
  status.update();

  expect(
    'City Status keeps its sort when the game changes',
    texts(statusTable, 'tbody th'),
    ['Samarkand', 'Civil disorder: Karakorum']
  );

  (statusTable.querySelector('tbody tr:last-child') as HTMLElement).click();

  expect('a city opens its city screen', opened.at(-1), 'city:Karakorum');

  // A window opened from a row gives the focus back to it when it closes, so a change made there (a new build, a new
  //  name) redraws the row in place rather than replacing it, and the row then opens the city as it is now.
  const opener = statusTable.querySelector(
    'tbody tr:last-child'
  ) as HTMLElement;

  player.cities[0].name = 'Ulaanbaatar';
  status.update();

  expect(
    'a redrawn city keeps its row, which shows and opens the city as it is now',
    [
      statusTable.querySelector('tbody tr:last-child') === opener,
      opener.querySelector('th')?.textContent,
    ],
    [true, 'Civil disorder: Ulaanbaatar']
  );

  opener.click();

  expect('and opens it', opened.at(-1), 'city:Ulaanbaatar');
  expect(
    'its bars say what is stored, for a screen reader',
    Array.from(opener.querySelectorAll('[role="progressbar"]')).map((bar) =>
      bar.getAttribute('aria-label')
    ),
    ['Food 5 / 20']
  );

  // The filter reads a row redrawn in place afresh: the city's new name finds it.
  ['u', 'l', 'b'].forEach((key) =>
    status
      .element()
      .dispatchEvent(
        new (globalThis as any).KeyboardEvent('keydown', { key, bubbles: true })
      )
  );

  expect(
    'the filter reads a redrawn row afresh',
    Array.from(statusTable.querySelectorAll('tbody tr')).map((row) =>
      row.classList.contains('filtered-out')
    ),
    [true, false]
  );

  (
    status.element().querySelector('input[type=search]') as HTMLInputElement
  ).value = '';

  // The filter over the table's rows, not its headings or totals.
  ['s', 'm', 'k'].forEach((key) =>
    status
      .element()
      .dispatchEvent(
        new (globalThis as any).KeyboardEvent('keydown', { key, bubbles: true })
      )
  );

  expect(
    'the filter hides the rows that do not match',
    Array.from(statusTable.querySelectorAll('tbody tr')).map((row) =>
      row.classList.contains('filtered-out')
    ),
    [false, true]
  );

  status.close();

  // Trade.
  const tradePlayer = {
      id: 'Player-1',
      cities: [
        city('City-1', 'Karakorum', {
          gold: 6,
          upkeep: ['CityWalls', 'Temple'],
        }),
        city('City-2', 'Samarkand', { gold: 1, upkeep: ['CityWalls'] }),
      ],
      government: { _: 'Despotism' },
    } as unknown as Player,
    trade = new TradeTable(tradePlayer, portal);

  await settle();

  expect(
    'Trade: each city’s gold, upkeep and what’s left, and their totals',
    [
      ...Array.from(trade.table().element().querySelectorAll('tbody tr')).map(
        (row) => Array.from(row.children).map((cell) => cell.textContent)
      ),
      Array.from(
        trade.table().element().querySelectorAll('tfoot th, tfoot td')
      ).map((cell) => cell.textContent),
    ],
    [
      ['Karakorum', '6', '2', '4'],
      ['Samarkand', '1', '1', '0'],
      ['Total', '7', '3', '4'],
    ]
  );
  expect(
    'Trade: each improvement’s upkeep, by name (#472)',
    [
      ...Array.from(
        trade.improvements().element().querySelectorAll('tbody tr')
      ).map((row) => Array.from(row.children).map((cell) => cell.textContent)),
      Array.from(
        trade.improvements().element().querySelectorAll('tfoot th, tfoot td')
      ).map((cell) => cell.textContent),
    ],
    [
      ['City Walls', '2', '1', '2'],
      ['Temple', '1', '1', '1'],
      ['Total', '3', '', '3'],
    ]
  );
  expect(
    'Trade: no anarchy note outside Anarchy',
    (trade.element().querySelector('.ui-report-note') as HTMLElement).hidden,
    true
  );

  ['s', 'a', 'm'].forEach((key) =>
    trade
      .element()
      .dispatchEvent(
        new (globalThis as any).KeyboardEvent('keydown', { key, bubbles: true })
      )
  );

  expect(
    'Trade: the filter finds a city, and leaves the upkeep as it is',
    [
      Array.from(trade.table().element().querySelectorAll('tbody tr')).map(
        (row) => row.classList.contains('filtered-out')
      ),
      Array.from(
        trade.improvements().element().querySelectorAll('tbody tr')
      ).map((row) => row.classList.contains('filtered-out')),
    ],
    [
      [true, false],
      [false, false],
    ]
  );

  trade.close();

  // The flag picks which.
  applyInterface('classic', null);

  const classic = [
    openCityStatus(player, portal, {} as Transport),
    openTradeReport(player, portal, {} as Transport),
  ];

  applyInterface('new', null);

  const modern = [
    openCityStatus(player, portal, {} as Transport),
    openTradeReport(player, portal, {} as Transport),
  ];

  await settle();

  expect(
    'the classic interface opens the classic reports, the new one the tables',
    [...classic, ...modern].map((report) =>
      report instanceof CityStatus ||
      report instanceof TradeReport ||
      report instanceof CityStatusTable ||
      report instanceof TradeTable
        ? report.constructor.name
        : null
    ),
    ['CityStatus', 'TradeReport', 'CityStatusTable', 'TradeTable']
  );

  [...classic, ...modern].forEach((report) => report.close());

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL report-table (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS report-table (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL report-table: ${error.stack ?? error}\n`);
  process.exit(1);
});
