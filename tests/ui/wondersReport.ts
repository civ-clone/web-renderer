// The Wonders of the World (F7, #992), drawn from the rows the worker sends: the classic report's sentences as Civ1
//  words them ("The Pyramids of Thebes. (Egyptian)", "The Colossus (Destroyed)"), in boxes of the owner's colours, and
//  the modern table's Wonder, city and civilization columns, with a lost Wonder's state, yours marked with View, and
//  each saying so in words when nothing has been built. Names with an apostrophe show as typed in both.

// Must stay first: the components read `document` as they load.
import './lib/dom';
import './lib/interfaces';

import { City, Player } from '@civ-clone/ui-protocol/types';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import WondersReport, {
  wondersRowText,
} from '@civ-clone/ui-interface-classic/components/WondersReport';
import WondersTable from '@civ-clone/ui-interface-modern/components/WondersTable';
import { WondersRow } from '@civ-clone/ui-protocol/reports';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

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
      `FAIL wondersReport: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

// No IndexedDB under node: only the Pyramids have a picture, shown before, so it's drawn at once; the rest have none.
(assetStore as any).has = () => Promise.resolve(false);
(assetStore as any).cachedURL = (key: string) =>
  String(key).includes('wonders/pyramids') ? 'pyramids.png' : null;

const pending = {
    request: () => new Promise(() => {}),
  } as unknown as Transport,
  opened: string[] = [],
  portal = {
    openCity: (city: City) => opened.push(`city:${city.name}`),
    tileSize: () => ({ width: 16, height: 16 }),
    nativeTileSize: () => ({ width: 16, height: 16 }),
  } as unknown as Portal,
  player = {
    id: 'Player-1',
    civilization: { _: 'Mongol' },
    cities: [
      {
        id: 'City-1',
        name: "Xi'an",
        originalPlayer: { civilization: { _: 'Chinese' } },
        growth: { size: 4 },
      },
    ],
  } as unknown as Player;

const rows: WondersRow[] = [
  {
    wonder: 'Pyramids',
    destroyed: false,
    own: false,
    city: { name: 'Thebes', civilization: 'Egyptian' },
    owner: { civilization: 'Egyptian', colors: ['#ffff00', '#000000'] },
  },
  {
    wonder: 'Colossus',
    destroyed: true,
    own: false,
    city: null,
    owner: null,
  },
  {
    wonder: 'GreatWall',
    destroyed: false,
    own: false,
    city: null,
    owner: null,
  },
  {
    wonder: 'DarwinsVoyage',
    destroyed: false,
    own: true,
    // Founded by the Chinese, taken by us.
    city: { name: "Xi'an", civilization: 'Chinese' },
    owner: { civilization: 'Mongol', colors: ['#00ff00', '#ffffff'] },
  },
  {
    wonder: 'HooverDam',
    destroyed: true,
    own: false,
    city: null,
    owner: null,
  },
  {
    wonder: 'UnitedNations',
    destroyed: false,
    own: false,
    city: null,
    owner: { civilization: 'Roman', colors: null },
  },
];

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-wonder/en');

  // The classic report: Civ1's sentences, in the Wonders' order as sent.
  const classic = new WondersReport(pending);

  classic.show(rows);

  const boxes = Array.from(
    classic.element().querySelectorAll('.wonders-report .wonder')
  ) as HTMLElement[];

  expect(
    'classic: one sentence for each Wonder, as Civ1 words it',
    boxes.map((box) => box.querySelector('.name')?.textContent),
    [
      'The Pyramids of Thebes. (Egyptian)',
      'The Colossus (Destroyed)',
      'The Great Wall. (an unknown civilization)',
      "Darwin's Voyage in Xi'an. (Mongol)",
      'Hoover Dam (Destroyed)',
      'United Nations. (Roman)',
    ]
  );
  expect(
    "classic: each in its owner's colours, a lost one plain, an unknown owner's marked",
    boxes.map((box) => [
      box.style.getPropertyValue('--owner-primary'),
      box.classList.contains('destroyed'),
      box.classList.contains('unknown-owner'),
    ]),
    [
      ['#ffff00', false, false],
      ['', true, false],
      ['', false, true],
      ['#00ff00', false, false],
      ['', true, false],
      ['', false, false],
    ]
  );
  expect(
    'classic: a Wonder with a picture shows it before its sentence; one without takes no room',
    boxes.map((box) => box.querySelectorAll('.building-icon img').length),
    [1, 0, 0, 0, 0, 0]
  );
  expect(
    'classic: the sentence is the same text on its own',
    wondersRowText(rows[0]!),
    'The Pyramids of Thebes. (Egyptian)'
  );

  classic.show([]);

  expect(
    'classic: none built says so',
    classic.element().querySelector('.wonder') === null &&
      classic
        .element()
        .textContent?.includes('No Wonders of the World have been built yet.'),
    true
  );

  classic.close();

  // The modern table.
  const modern = new WondersTable(player, portal, pending);

  modern.show(rows);

  const tableRows = () =>
    Array.from(
      modern.table().element().querySelectorAll('tbody tr')
    ) as HTMLElement[];

  expect(
    'modern: Wonder, city and civilization; a lost Wonder says so in place of its city',
    tableRows().map((row) =>
      ['wonder', 'city', 'civilization'].map(
        (column) => row.querySelector(`[data-column="${column}"]`)?.textContent
      )
    ),
    [
      ['Pyramids', 'Thebes', 'Egyptians'],
      ['Colossus', 'Destroyed', ''],
      ['Great Wall', 'Unknown city', 'an unknown civilization'],
      ["Darwin's Voyage", "Xi'an", 'Mongols (you)'],
      ['Hoover Dam', 'Destroyed', ''],
      ['United Nations', 'Unknown city', 'Romans'],
    ]
  );
  expect(
    'modern: a lost Wonder is marked, yours is the current row with View',
    tableRows().map((row) => [
      row
        .querySelector('[data-column="city"]')
        ?.classList.contains('ui-report-table-negative'),
      row.getAttribute('aria-current'),
      row.querySelectorAll('[data-column="view"] button').length,
    ]),
    [
      [false, null, 0],
      [true, null, 0],
      [false, null, 0],
      [false, 'true', 1],
      [true, null, 0],
      [false, null, 0],
    ]
  );

  expect(
    'modern: the Wonder cell shows its picture where there is one',
    tableRows().map(
      (row) =>
        row.querySelectorAll('[data-column="wonder"] .building-icon img').length
    ),
    [1, 0, 0, 0, 0, 0]
  );

  const view = tableRows()[3]!.querySelector(
    '[data-column="view"] button'
  ) as HTMLElement;

  view.click();

  expect(
    'modern: View opens your city, named as typed',
    [view.getAttribute('aria-label'), opened.at(-1)],
    ["View Xi'an", "city:Xi'an"]
  );

  modern.table().sortBy('wonder');

  expect(
    'modern: sorts by the Wonder',
    tableRows().map(
      (row) => row.querySelector('[data-column="wonder"]')?.textContent
    ),
    [
      'Colossus',
      "Darwin's Voyage",
      'Great Wall',
      'Hoover Dam',
      'Pyramids',
      'United Nations',
    ]
  );

  modern.show([]);

  expect(
    'modern: none built says so, with no table',
    [
      (modern.element().querySelector('.ui-report-note') as HTMLElement).hidden,
      modern.table().element().hidden,
      modern.element().querySelector('.ui-report-note')?.textContent,
    ],
    [false, true, 'No Wonders of the World have been built yet.']
  );

  modern.close();

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL wondersReport (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS wondersReport (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL wondersReport: ${error.stack ?? error}\n`);
  process.exit(1);
});
