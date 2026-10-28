// The sidebar's Power list (#701, #708) draws the rows the worker ranks (`tests/engine/civilizationPower.ts`): the
//  rank, the civilization (or "Unknown" for one not met, with no colours), and the power, with the player's own row
//  marked. They're asked for once a turn, only while the section is open, and opening it asks for the turn's.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { CivilizationPowerRow } from '../../src/js/Engine/lib/civilizationPower';
import GameOptionsRegistry from '../../src/js/UI/GameOptionsRegistry';
import PowerList, { powerWindow } from '../../src/js/UI/components/PowerList';
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
    process.stderr.write(`FAIL power-list: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const rows: CivilizationPowerRow[] = [
    {
      rank: 1,
      power: 1250,
      own: false,
      civilization: 'Greek',
      colors: ['#00ffff', '#0000ff'],
    },
    { rank: 2, power: 40, own: false, civilization: null, colors: null },
    {
      rank: 3,
      power: 30,
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
  } as unknown as Transport;

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-civilization/en');

  const options = new GameOptionsRegistry(() => null);

  options.defaults({ sidebarCollapsed: [], sidebarExpanded: [] });

  const element = document.createElement('div'),
    section = new SidebarSection('power', 'Power', [element], options, {
      collapsedByDefault: true,
    }),
    power = new PowerList(element, transport);

  document.body.append(section.element());

  power.turn(1);
  await settle();

  expect('collapsed, nothing is asked for', requests, []);

  section.setCollapsed(false);
  await settle();

  expect('opening it asks for the rows', requests, ['civilizationPower']);

  const shown = Array.from(element.querySelectorAll('li')).map((item) => [
    item.querySelector('.rank')?.textContent,
    item.querySelector('.name')?.textContent,
    item.querySelector('.value')?.textContent,
  ]);

  expect('a row each, ranked: rank, civilization and power', shown, [
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
  // Not a way into the Civilization Score report (F9): it shows a different number.
  expect('no row is a button', element.querySelectorAll('button').length, 0);

  power.turn(1);
  power.turn(1);
  await settle();

  expect('every render of the same turn asks nothing more', requests.length, 1);

  power.turn(2);
  await settle();

  expect('a new turn asks again', requests.length, 2);

  section.setCollapsed(true);
  power.turn(3);
  await settle();

  expect('collapsed again, a new turn asks nothing', requests.length, 2);

  section.setCollapsed(false);
  await settle();

  expect('until it is opened', requests.length, 3);

  // A watcher switching whom they watch mid-turn sees someone else's rows (#607): the same turn asks again.
  power.turn(3, 'Player-2');
  await settle();

  expect('a new view in the same turn asks again', requests.length, 4);

  // Not answered: asked again the next time the section is opened, rather than waiting for the next turn.
  answers.push(() =>
    Promise.reject(new RequestFailed('civilizationPower', 'not answered'))
  );
  power.turn(4, 'Player-2');
  await settle();
  section.setCollapsed(true);
  section.setCollapsed(false);
  await settle();

  expect('a request that failed is asked again on opening', requests.length, 6);

  // An answer that arrives after a newer question was asked is the old one's, and isn't shown.
  let late: (value: unknown) => void = () => {};

  answers.push(() => new Promise((resolve) => (late = resolve)));
  power.turn(5, 'Player-2');
  power.turn(6, 'Player-2');
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

  // A big game shows five rows around the player's own (two either side), or the top or the foot five near either end,
  //  with a link to the rest. Six or fewer are all shown.
  const ranked = (count: number, own: number): CivilizationPowerRow[] =>
      Array.from({ length: count }, (_, index) => ({
        rank: index + 1,
        power: 100 - index,
        own: index + 1 === own,
        civilization: 'Roman',
        colors: null,
      })),
    window = (count: number, own: number) =>
      powerWindow(ranked(count, own)).map(({ rank }) => rank);

  expect('six or fewer: all of them', window(6, 6), [1, 2, 3, 4, 5, 6]);
  expect('first: the top five', window(8, 1), [1, 2, 3, 4, 5]);
  expect('second: the top five', window(8, 2), [1, 2, 3, 4, 5]);
  expect('in the middle: two either side', window(8, 4), [2, 3, 4, 5, 6]);
  expect('second to last: the foot five', window(8, 7), [4, 5, 6, 7, 8]);
  expect('last: the foot five', window(8, 8), [4, 5, 6, 7, 8]);
  expect('no row of our own: the top five', window(8, 0), [1, 2, 3, 4, 5]);

  const ranks = () =>
      Array.from(element.querySelectorAll('.rank')).map(
        (rank) => rank.textContent
      ),
    link = () => element.querySelector('.show-all') as HTMLButtonElement | null;

  power.build(ranked(8, 6));

  expect('a big game shows five', ranks(), ['4.', '5.', '6.', '7.', '8.']);
  expect('and links to the rest', link()?.textContent, 'Show all (8)');

  link()?.click();

  expect('which shows them all', ranks().length, 8);
  expect('and then fewer', link()?.textContent, 'Show fewer');

  power.build(ranked(8, 6));

  expect('a new turn keeps them all shown', ranks().length, 8);

  link()?.click();
  power.build(rows);

  expect('a small game has no link', link(), null);

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL power-list (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS power-list (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL power-list: ${error.stack ?? error}\n`);
  process.exit(1);
});
