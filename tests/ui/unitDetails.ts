// The active unit's card in the sidebar (#699): the unit's name and state, its moves as pips (a road's third of a move
//  lighting a third of a pip), its attack, defence and visibility, its home city as a button that opens the city, no
//  city row for a free unit, the square it's on, and the other units there as a strip that opens the stack window and
//  makes the unit chosen the active one. A render that changes nothing on the card leaves it as it is.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { City, Unit } from '../../src/js/UI/types';
import Transport from '../../src/js/UI/Transport';
import UnitDetails from '../../src/js/UI/components/UnitDetails';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
import { setPreloadContainer } from '../../src/js/UI/lib/getPreloadedImage';

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
    process.stderr.write(`FAIL unit-details: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// The unit sprites aren't loaded, which is logged.
console.error = () => {};

// linkedom has no canvas context: one that draws nothing, and reads back no pixels.
(globalThis as any).HTMLCanvasElement.prototype.getContext = () =>
  new Proxy(
    { getImageData: () => ({ data: [] }) } as { [key: string]: unknown },
    {
      get: (target, key: string) => (key in target ? target[key] : () => {}),
      set: (target, key: string, value) => {
        target[key] = value;

        return true;
      },
    }
  );

setPreloadContainer(document.querySelector('#preload') as HTMLElement);

const player = {
    id: 'Player-1',
    civilization: {
      _: 'Roman',
      attributes: [{ name: 'colors', value: ['#ffffff', '#000000'] }],
    },
  },
  rome = {
    id: 'City-1',
    name: 'Roma',
    originalPlayer: { civilization: { _: 'Roman' } },
  } as unknown as City,
  value = (value: number) => ({ value }),
  tile = {
    x: 12,
    y: 34,
    terrain: { _: 'Grassland', features: [{ _: 'Shield' }] },
    improvements: [{ _: 'Road' }],
    units: [] as Unit[],
  },
  unit = (id: string, fields: { [key: string]: unknown } = {}): Unit =>
    ({
      _: 'Musketman',
      id,
      active: false,
      attack: value(1),
      busy: null,
      city: rome,
      defence: value(3),
      improvements: [{ _: 'Veteran' }],
      movement: value(1),
      moves: value(1),
      player,
      tile,
      visibility: value(1),
      ...fields,
    } as unknown as Unit);

const opened: string[] = [],
  activated: string[] = [],
  sent: unknown[] = [],
  card = () => {
    const element = document.createElement('div'),
      details = new UnitDetails(element, {
        portal: {
          openCity: (city) => {
            opened.push(city.name);

            return true;
          },
        },
        transport: {
          send: (...args: unknown[]) => sent.push(args),
        } as unknown as Transport,
        setActiveUnit: (chosen) => activated.push(chosen.id),
      });

    return { element, details };
  },
  text = (element: HTMLElement, selector: string) =>
    element.querySelector(selector)?.textContent ?? null,
  pips = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('.moves .fill')).map(
      (fill) => (fill as HTMLElement).style.width
    );

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-city/en');
  await import('../../translations/civ1-world/en');

  const active = unit('Unit-1', {
      busy: { _: 'Fortifying' },
      movement: value(3),
      moves: value(4 / 3),
    }),
    other = unit('Unit-2', { _: 'Settlers', improvements: [] });

  tile.units = [active, other];

  {
    const { element, details } = card();

    details.update(active);

    expect(
      'the header is the name and state',
      text(element, '.unit-header .label'),
      'Musketman (Fortifying, Veteran)'
    );
    expect(
      'with its icon',
      element.querySelectorAll('.unit-header canvas').length,
      1
    );
    expect(
      'a pip a move, the moves left lit, a third of a move a third of a pip',
      pips(element),
      ['100%', '33.3%', '0%']
    );
    expect(
      'and the moves in words',
      element.querySelector('.moves')?.getAttribute('aria-label'),
      '1.33 / 3 moves'
    );
    expect(
      'attack, defence and visibility, each a letter and its value',
      Array.from(element.querySelectorAll('.stats .stat')).map((stat) => [
        stat.querySelector('abbr')?.textContent,
        stat.querySelector('.value')?.textContent,
        stat.getAttribute('title'),
      ]),
      [
        ['A', '1', 'Attack'],
        ['D', '3', 'Defense'],
        ['V', '1', 'Visibility'],
      ]
    );
    expect(
      'named in full for a screen reader',
      text(element, '.stats .visually-hidden'),
      'Attack: '
    );
    expect('the home city', text(element, 'button.home-city'), 'Roma');

    (element.querySelector('button.home-city') as HTMLButtonElement).click();

    expect('which opens the city', opened, ['Roma']);
    expect(
      'the square: its terrain, features, improvements and where it is',
      text(element, '.tile'),
      'Grassland, Shield, Road (12, 34)'
    );

    const strip = element.querySelector(
      'button.tile-units'
    ) as HTMLButtonElement;

    expect(
      'the other units on the square, as a strip of icons',
      strip.querySelectorAll('canvas').length,
      1
    );
    expect(
      'said in words',
      text(strip, '.visually-hidden'),
      '1 other unit here (choose a unit)'
    );

    strip.click();

    const window = document.querySelector(
      'dialog.unit-selection-window'
    ) as HTMLElement;

    expect(
      'the strip opens the stack window, with every unit on the square',
      Array.from(window?.querySelectorAll('.unit-row .label') ?? []).map(
        (label) => label.textContent
      ),
      ['Musketman (Fortifying, Veteran)', 'Settlers']
    );

    (window.querySelectorAll('.unit-row')[1] as HTMLElement).click();

    expect(
      'and the unit chosen there, woken, is made the active one',
      [activated, sent],
      [['Unit-2'], [['action', { name: 'InactiveUnit', id: 'Unit-2' }]]]
    );

    window.remove();

    const header = element.querySelector('.unit-header');

    details.update({ ...active } as Unit);

    expect(
      'a render that changes nothing on the card leaves it alone',
      element.querySelector('.unit-header') === header,
      true
    );

    details.update({ ...active, moves: value(1) } as Unit);

    expect(
      'a move spent redraws it',
      [element.querySelector('.unit-header') === header, pips(element)],
      [false, ['100%', '0%', '0%']]
    );

    details.update(null);

    expect('with no unit, the card is empty', element.children.length, 0);
  }

  {
    tile.units = [];

    const { element, details } = card(),
      free = unit('Unit-3', {
        _: 'Warrior',
        city: null,
        improvements: [],
        moves: value(0),
      });

    tile.units = [free];

    details.update(free);

    expect(
      'a free unit: no home city row',
      element.querySelector('.home-city'),
      null
    );
    expect(
      'a unit alone on its square: no strip',
      element.querySelector('.tile-units'),
      null
    );
    expect('and no brackets with no state', text(element, '.label'), 'Warrior');
    expect('no moves left: no pip lit', pips(element), ['0%']);
  }

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL unit-details (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS unit-details (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL unit-details: ${error.stack ?? error}\n`);
  process.exit(1);
});
