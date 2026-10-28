// The sidebar's scores (#701) draw the rows the worker ranks (`tests/engine/civilizationScores.ts`): the rank, the
//  civilization (or "Unknown" for one not met, with no colours), and the score, with the player's own row
//  marked, which opens the Civilization Score report as F9 does. They're asked for once a turn, only while the section
//  is open, and opening it asks for the turn's.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { CivilizationScoresRow } from '../../src/js/Engine/lib/civilizationScores';
import GameOptionsRegistry from '../../src/js/UI/GameOptionsRegistry';
import ScoresList from '../../src/js/UI/components/ScoresList';
import SidebarSection from '../../src/js/UI/components/SidebarSection';
import { RequestFailed } from '../../src/js/Engine/AbstractTransport';
import Transport from '../../src/js/UI/Transport';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';

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
    process.stderr.write(`FAIL scores-list: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const rows: CivilizationScoresRow[] = [
    {
      rank: 1,
      score: 1250,
      own: false,
      civilization: 'Greek',
      colors: ['#00ffff', '#0000ff'],
    },
    { rank: 2, score: 40, own: false, civilization: null, colors: null },
    {
      rank: 3,
      score: 30,
      own: true,
      civilization: 'Roman',
      colors: ['#ffffff', '#000000'],
    },
  ],
  requests: string[] = [],
  // How the next request is answered: the rows, unless a check says otherwise.
  answers: Array<() => Promise<unknown>> = [],
  transport = {
    request: (request: { channel(): string }) => {
      requests.push(request.channel());

      return (answers.shift() ?? (() => Promise.resolve(rows)))();
    },
  } as unknown as Transport,
  opened: string[] = [];

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-civilization/en');

  const options = new GameOptionsRegistry(() => null);

  options.defaults({ sidebarCollapsed: [], sidebarExpanded: [] });

  const element = document.createElement('div'),
    section = new SidebarSection('scores', 'Scores', [element], options, {
      collapsedByDefault: true,
    }),
    scores = new ScoresList(element, transport, {
      key: 'F9',
      open: () => opened.push('score'),
    });

  document.body.append(section.element());

  scores.turn(1);
  await settle();

  expect('collapsed, nothing is asked for', requests, []);

  section.setCollapsed(false);
  await settle();

  expect('opening it asks for the scores', requests, ['civilizationScores']);

  const shown = Array.from(element.querySelectorAll('li')).map((item) => [
    item.querySelector('.rank')?.textContent,
    item.querySelector('.name')?.textContent,
    item.querySelector('.value')?.textContent,
  ]);

  expect('a row each, ranked: rank, civilization and score', shown, [
    ['1.', 'Greeks', '1,250'],
    ['2.', 'Unknown', '40'],
    ['3.', 'Romans', '30'],
  ]);

  const [greek, unknown, own] = Array.from(
    element.querySelectorAll('li')
  ) as HTMLElement[];

  expect(
    'a civilization met carries its colours',
    (greek.querySelector('.swatch') as HTMLElement).style.getPropertyValue(
      '--civilization-primary'
    ),
    '#00ffff'
  );
  expect(
    'one not met is marked, with no colours',
    [
      unknown.classList.contains('unknown'),
      (unknown.querySelector('.swatch') as HTMLElement).getAttribute('style'),
    ],
    [true, null]
  );
  expect(
    'our own row is marked',
    [
      own.classList.contains('own'),
      own.getAttribute('aria-current'),
      own.querySelector('.visually-hidden')?.textContent,
      element.querySelectorAll('li.own').length,
    ],
    [true, 'true', ' (you)', 1]
  );
  expect(
    'only our own row is a button',
    Array.from(element.querySelectorAll('button')).map((button) =>
      button.getAttribute('title')
    ),
    ['Civilization Score (F9)']
  );

  (own.querySelector('button') as HTMLButtonElement).click();

  expect('which opens the Civilization Score report', opened, ['score']);

  scores.turn(1);
  scores.turn(1);
  await settle();

  expect('every render of the same turn asks nothing more', requests.length, 1);

  scores.turn(2);
  await settle();

  expect('a new turn asks again', requests.length, 2);

  section.setCollapsed(true);
  scores.turn(3);
  await settle();

  expect('collapsed again, a new turn asks nothing', requests.length, 2);

  section.setCollapsed(false);
  await settle();

  expect('until it is opened', requests.length, 3);

  // A watcher switching whom they watch mid-turn sees someone else's rows (#607): the same turn asks again.
  scores.turn(3, 'Player-2');
  await settle();

  expect('a new view in the same turn asks again', requests.length, 4);

  // Not answered: asked again the next time the section is opened, rather than waiting for the next turn.
  answers.push(() =>
    Promise.reject(new RequestFailed('civilizationScores', 'not answered'))
  );
  scores.turn(4, 'Player-2');
  await settle();
  section.setCollapsed(true);
  section.setCollapsed(false);
  await settle();

  expect('a request that failed is asked again on opening', requests.length, 6);

  // An answer that arrives after a newer question was asked is the old one's, and isn't shown.
  let late: (value: unknown) => void = () => {};

  answers.push(() => new Promise((resolve) => (late = resolve)));
  scores.turn(5, 'Player-2');
  scores.turn(6, 'Player-2');
  await settle();
  late([{ ...rows[0], civilization: 'Stale' }]);
  await settle();

  expect(
    'an answer overtaken by a newer one is not shown',
    Array.from(element.querySelectorAll('.name')).some(
      (name) => name.textContent === 'Stale'
    ),
    false
  );

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL scores-list (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS scores-list (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL scores-list: ${error.stack ?? error}\n`);
  process.exit(1);
});
