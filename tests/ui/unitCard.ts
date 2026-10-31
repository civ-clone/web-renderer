// The active unit's card under the new interface (#743): the portrait with a veteran's mark, the name over its state
//  and home city, attack, defence, moves and visibility as pills, the moves as pips eight to a row, the square, the
//  actions grouped under Orders, Terrain and Special, and the other units on the square at full size, two rows at most
//  and a "+N" for the rest, which open the stack window. The actions survive the card's redraws.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { City, Tile, Unit, UnitAction } from '../../src/js/UI/types';
import Transport from '../../src/js/UI/Transport';
import UnitCard from '../../src/js/UI/components/UnitCard';
import UnitCardActions, {
  actionGroup,
} from '../../src/js/UI/components/UnitCardActions';
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
    process.stderr.write(`FAIL unit-card: stopped after ${checks} checks\n`);
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
    id: 'Tile-1',
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
    } as unknown as Unit),
  action = (_: string): UnitAction =>
    ({
      _,
      __: [],
      id: `${_}-1`,
      from: tile,
      to: tile,
    } as unknown as UnitAction);

const opened: string[] = [],
  activated: string[] = [],
  sent: unknown[] = [],
  acted: string[][] = [],
  card = () => {
    const element = document.createElement('div');

    document.body.append(element);

    const details = new UnitCard(element, {
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
      }),
      actions = new UnitCardActions(
        details.actionArea(),
        (unitId, unitAction) => acted.push([unitId, unitAction]),
        () => {}
      );

    return { element, details, actions };
  },
  text = (element: HTMLElement, selector: string) =>
    element.querySelector(selector)?.textContent ?? null,
  pips = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('.ui-unit-card-pip-fill')).map(
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
    const { element, details, actions } = card();

    details.update(active);

    expect(
      'the card is marked as the new one',
      element.classList.contains('ui-unit-card'),
      true
    );
    expect('the name', text(element, '.ui-unit-card-name'), 'Musketman');
    expect(
      'its state under it',
      text(element, '.ui-unit-card-states'),
      'Fortifying, Veteran'
    );
    expect(
      'the portrait, with the veteran mark on it',
      [
        element.querySelectorAll('.ui-unit-card-portrait canvas').length,
        element.querySelectorAll('.ui-unit-card-portrait .ui-unit-card-veteran')
          .length,
      ],
      [1, 1]
    );
    expect(
      'attack, defence, moves and visibility as pills, named in full',
      Array.from(element.querySelectorAll('.ui-unit-card-stat')).map((stat) => [
        stat.getAttribute('title'),
        stat.querySelector('.value')?.textContent,
        stat.querySelectorAll('svg.glyph').length,
      ]),
      [
        ['Attack', '1', 1],
        ['Defense', '3', 1],
        ['Moves', '1.33/3', 1],
        ['Visibility', '1', 1],
      ]
    );
    expect(
      'a pip a move, the moves left lit, a third of a move a third of a pip',
      pips(element),
      ['100%', '33.3%', '0%']
    );
    expect('the home city', text(element, 'button.ui-unit-card-home'), 'Roma');

    (
      element.querySelector('button.ui-unit-card-home') as HTMLButtonElement
    ).click();

    expect('which opens the city', opened, ['Roma']);
    expect(
      'the square: its terrain, features, improvements and where it is',
      text(element, '.ui-unit-card-tile'),
      'Grassland, Shield, Road (12, 34)'
    );

    const strip = element.querySelector(
      'button.ui-unit-card-others'
    ) as HTMLButtonElement;

    expect(
      'the other units, at the portrait’s size',
      Array.from(strip.querySelectorAll('canvas')).map((canvas) => [
        canvas.width,
        canvas.height,
      ]),
      [
        [
          element.querySelector<HTMLCanvasElement>(
            '.ui-unit-card-portrait canvas'
          )!.width,
          element.querySelector<HTMLCanvasElement>(
            '.ui-unit-card-portrait canvas'
          )!.height,
        ],
      ]
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
      'which open the stack window, with every unit on the square',
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

    // The actions.
    const settlers = unit('Unit-1', {
      _: 'Settlers',
      actions: [
        action('FoundCity'),
        action('BuildRoad'),
        action('Fortify'),
        action('BuildIrrigation'),
        action('Sleep'),
      ],
      actionsForNeighbours: {},
    });

    actions.build(settlers, tile as unknown as Tile);

    const groups = () =>
      Array.from(
        element.querySelectorAll('.ui-unit-card-actions .ui-unit-card-group')
      ).map((group) => [
        group.querySelector('.ui-unit-card-eyebrow')?.textContent,
        Array.from(group.querySelectorAll('button')).map((button) =>
          button.getAttribute('aria-label')
        ),
      ]);

    expect(
      'the actions in the card, grouped, in the order they came in each group',
      groups(),
      [
        ['Orders', ['Fortify', 'Sleep']],
        ['Terrain', ['Build road', 'Build irrigation']],
        ['Special', ['Found a new city']],
      ]
    );
    expect(
      'icon buttons of the button system, with the key as the shortcut',
      Array.from(element.querySelectorAll('.ui-unit-card-action')).map(
        (button) => [
          button.classList.contains('btn-icon'),
          button.getAttribute('aria-keyshortcuts'),
        ]
      ),
      [
        [true, 'f'],
        [true, 's'],
        [true, 'r'],
        [true, 'i'],
        [true, 'b'],
      ]
    );
    expect(
      'the shared tooltip, not a title',
      element.querySelector('.ui-unit-card-action')?.hasAttribute('title'),
      false
    );

    (
      element.querySelector('.ui-unit-card-action.BuildRoad') as HTMLElement
    ).click();

    expect('a click asks for the action', acted, [['Unit-1', 'BuildRoad']]);

    const area = details.actionArea(),
      header = element.querySelector('.ui-unit-card-header');

    details.update({ ...active } as Unit);

    expect(
      'a render that changes nothing on the card leaves it alone',
      element.querySelector('.ui-unit-card-header') === header,
      true
    );

    details.update({ ...active, moves: value(1) } as Unit);

    expect(
      'a move spent redraws the card, but keeps the actions where they were',
      [
        element.querySelector('.ui-unit-card-header') === header,
        pips(element),
        element.contains(area),
        area.querySelectorAll('button').length,
      ],
      [false, ['100%', '0%', '0%'], true, 5]
    );

    actions.build(
      unit('Unit-1', { actions: [action('Sleep'), action('Disband')] }),
      null
    );

    expect('a group with nothing in it is not shown', groups(), [
      ['Orders', ['Sleep', 'Disband']],
    ]);
    expect(
      'a capital key is typed with Shift',
      element
        .querySelector('.ui-unit-card-action.Disband')
        ?.getAttribute('aria-keyshortcuts'),
      'Shift+D'
    );

    actions.build(null, null);
    details.update(null);

    expect(
      'with no unit, the card holds only the empty actions',
      [element.children.length, area.children.length],
      [1, 0]
    );

    element.remove();
  }

  {
    const { element, details } = card(),
      free = unit('Unit-3', {
        _: 'Warrior',
        city: null,
        improvements: [],
        moves: value(0),
        movement: value(9),
      });

    tile.units = [free];

    details.update(free);

    expect(
      'a free unit with no state: no status line',
      element.querySelector('.ui-unit-card-status'),
      null
    );
    expect(
      'not a veteran: no mark',
      element.querySelector('.ui-unit-card-veteran'),
      null
    );
    expect(
      'a unit alone on its square: no strip',
      element.querySelector('.ui-unit-card-others'),
      null
    );
    expect(
      'nine moves: nine pips, none lit',
      pips(element),
      Array(9).fill('0%')
    );

    element.remove();
  }

  {
    // linkedom has no layout, so the card is as wide as six portraits are, the sidebar's.
    const { element, details } = card(),
      stack = Array.from({ length: 16 }, (_, index) =>
        unit(`Unit-${10 + index}`)
      );

    tile.units = stack;

    details.update(stack[0]);

    const strip = element.querySelector('.ui-unit-card-others')!;

    expect(
      'fifteen others: two rows of six, the last a "+N" for the rest',
      [
        strip.querySelectorAll('canvas').length,
        text(strip as HTMLElement, '.ui-unit-card-more'),
        text(strip as HTMLElement, '.visually-hidden'),
      ],
      [11, '+4', '15 other units here (choose a unit)']
    );

    tile.units = stack.slice(0, 13);
    details.update(stack[0]);

    expect(
      'twelve others fit two rows: no "+N"',
      [
        element.querySelectorAll('.ui-unit-card-others canvas').length,
        element.querySelector('.ui-unit-card-more'),
      ],
      [12, null]
    );
  }

  expect(
    'unknown actions are special',
    [
      actionGroup(action('EstablishTradeRoute')),
      actionGroup(action('Pillage')),
      actionGroup(action('Explore')),
    ],
    ['special', 'terrain', 'orders']
  );

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL unit-card (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS unit-card (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL unit-card: ${error.stack ?? error}\n`);
  process.exit(1);
});
