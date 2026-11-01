// The active unit's card under the new interface (#743): the portrait with a veteran's mark, the name over its state
//  and home city, attack, defence, moves and visibility as pills, the moves as pips eight to a row, the square, the
//  actions grouped under Orders, Terrain and Special, and the other units on the square at full size, one row of them
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
  await import('../../translations/civ1-city-improvement/en');

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

    details.update({
      ...active,
      city: { ...rome, name: "Smith's & Sons" },
    } as unknown as Unit);

    expect(
      'a name with & or an apostrophe is shown as it is',
      text(element, 'button.ui-unit-card-home'),
      "Smith's & Sons"
    );

    details.update(active);
    expect(
      'the square: its terrain, features, improvements and where it is',
      text(element, '.ui-unit-card-tile'),
      'Grassland, Shield, Road (12, 34)'
    );
    expect(
      'no defence bonus, so none shown',
      element.querySelector('.ui-unit-card-defence-bonus'),
      null
    );

    details.update({
      ...active,
      defenceBonus: {
        multiplier: 3,
        sources: [
          { name: 'Hills', multiplier: 2 },
          { name: 'Fortified', multiplier: 1.5 },
        ],
      },
    } as unknown as Unit);

    const bonus = element.querySelector(
      '.ui-unit-card-defence-bonus'
    ) as HTMLElement;

    expect(
      'the defence bonus the engine sends, after the square',
      [
        text(element, '.ui-unit-card-tile'),
        bonus?.parentElement?.classList.contains('ui-unit-card-tile'),
      ],
      ['Grassland, Shield, Road (12, 34)+200% defense', true]
    );

    bonus.dispatchEvent(new Event('focus'));

    const panel = document.getElementById('tooltip')!;

    expect(
      'what gives it, in its tooltip',
      [
        panel.hidden,
        panel.querySelector('h4')?.textContent,
        Array.from(panel.querySelectorAll('dt, dd')).map(
          (cell) => cell.textContent
        ),
      ],
      [false, 'Defense bonus', ['Hills', '×2', 'Fortified', '×1.5']]
    );

    bonus.dispatchEvent(new Event('blur'));

    details.update({
      ...active,
      defenceBonus: {
        multiplier: 3,
        sources: [{ name: 'CityWalls', multiplier: 3 }],
      },
    } as unknown as Unit);

    (
      element.querySelector('.ui-unit-card-defence-bonus') as HTMLElement
    ).dispatchEvent(new Event('focus'));

    expect(
      'City Walls by name, and the card redrawn when only the bonus changed',
      Array.from(panel.querySelectorAll('dt')).map((cell) => cell.textContent),
      ['City Walls']
    );

    (
      element.querySelector('.ui-unit-card-defence-bonus') as HTMLElement
    ).dispatchEvent(new Event('blur'));

    details.update(active);

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
      'fifteen others: a row of six, the last a "+N" for the rest',
      [
        strip.querySelectorAll('canvas').length,
        text(strip as HTMLElement, '.ui-unit-card-more'),
        text(strip as HTMLElement, '.visually-hidden'),
      ],
      [5, '+10', '15 other units here (choose a unit)']
    );

    tile.units = stack.slice(0, 7);
    details.update(stack[0]);

    expect(
      'six others fill the row: no "+N"',
      [
        element.querySelectorAll('.ui-unit-card-others canvas').length,
        element.querySelector('.ui-unit-card-more'),
      ],
      [6, null]
    );

    tile.units = stack.slice(0, 8);
    details.update(stack[0]);

    expect(
      'seven others: five, then "+2"',
      [
        element.querySelectorAll('.ui-unit-card-others canvas').length,
        text(element, '.ui-unit-card-more'),
      ],
      [5, '+2']
    );
  }

  {
    // The card's width (#743): a stub ResizeObserver and a frame that runs at once, and a width the test sets.
    const observers: (() => void)[] = [],
      disconnected: number[] = [];

    (globalThis as any).ResizeObserver = class {
      #index: number;

      constructor(callback: () => void) {
        this.#index = observers.push(callback) - 1;
      }

      observe(): void {}

      disconnect(): void {
        disconnected.push(this.#index);
      }
    };
    (globalThis as any).requestAnimationFrame = (callback: () => void) =>
      callback();

    const { element, details } = card(),
      stack = Array.from({ length: 16 }, (_, index) =>
        unit(`Unit-${30 + index}`)
      );
    let width = 0;

    Object.defineProperty(element, 'clientWidth', { get: () => width });

    tile.units = stack;

    // Drawn while hidden: the fallback of six to a row.
    details.update(stack[0]);

    const header = element.querySelector('.ui-unit-card-header'),
      portraits = () =>
        element.querySelectorAll('.ui-unit-card-others canvas').length;

    expect('drawn hidden: six to a row', portraits(), 5);

    // Four portraits of 32px with 2px gaps.
    width = 4 * 32 + 3 * 2;
    observers[observers.length - 1]();

    expect(
      'shown narrower: four to a row, only the other units redrawn',
      [
        portraits(),
        text(element, '.ui-unit-card-more'),
        element.querySelector('.ui-unit-card-header') === header,
      ],
      [3, '+12', true]
    );

    const strip = element.querySelector('.ui-unit-card-others');

    observers[observers.length - 1]();

    expect(
      'the same width again: nothing redrawn',
      element.querySelector('.ui-unit-card-others') === strip,
      true
    );

    details.dispose();

    expect('disposed, it stops watching', disconnected.length, 1);

    const next = card();

    Object.defineProperty(next.element, 'clientWidth', { get: () => width });
    next.details.update(stack[0]);

    expect(
      'a unit that cannot move has no row of pips',
      (() => {
        next.details.update({
          ...stack[0],
          movement: value(0),
          moves: value(0),
        } as Unit);

        return next.element.querySelector('.ui-unit-card-pips');
      })(),
      null
    );

    delete (globalThis as any).ResizeObserver;
    delete (globalThis as any).requestAnimationFrame;
  }

  {
    // A keyboard player keeps their place when the actions change (linkedom has no focus, so it's tracked by hand).
    const { element, actions } = card();
    let focused: HTMLElement | null = null;

    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => focused,
    });

    const focus = HTMLElement.prototype.focus;

    HTMLElement.prototype.focus = function (this: HTMLElement) {
      focused = this;
    };

    actions.build(
      unit('Unit-1', {
        actions: [action('Fortify'), action('Sleep'), action('BuildRoad')],
      }),
      null
    );

    (
      element.querySelector('.ui-unit-card-action.Sleep') as HTMLElement
    ).focus();

    actions.build(
      unit('Unit-1', { actions: [action('Sleep'), action('Disband')] }),
      null
    );

    expect(
      'the same action keeps the focus after the actions change',
      (document.activeElement as HTMLElement | null)?.dataset.action,
      'Sleep'
    );

    actions.build(unit('Unit-1', { actions: [action('Disband')] }), null);

    expect(
      'or the first, when it has gone',
      (document.activeElement as HTMLElement | null)?.dataset.action,
      'Disband'
    );

    actions.build(
      unit('Unit-2', { actions: [action('Disband'), action('Sleep')] }),
      null
    );

    expect(
      "but not on to another unit's actions",
      element.contains(document.activeElement),
      false
    );

    // The defence bonus: its tooltip closes when the card is redrawn under it, and the focus stays on it.
    const { element: bonusCard, details: bonusDetails } = card(),
      fortified = (moves: number) =>
        unit('Unit-1', {
          moves: value(moves),
          defenceBonus: {
            multiplier: 2,
            sources: [{ name: 'Hills', multiplier: 2 }],
          },
        }),
      panel = () => document.getElementById('tooltip');

    bonusDetails.update(fortified(1));

    const bonusAnchor = bonusCard.querySelector(
      '.ui-unit-card-defence-bonus'
    ) as HTMLElement;

    bonusAnchor.focus();
    bonusAnchor.dispatchEvent(new Event('focus'));

    expect('the bonus tooltip is open', panel()?.hidden, false);

    bonusDetails.update(fortified(0));

    expect(
      'a redraw closes it, and the focus moves to the new bonus',
      [
        panel()?.hidden ?? true,
        (document.activeElement as HTMLElement | null)?.classList.contains(
          'ui-unit-card-defence-bonus'
        ),
        bonusCard.contains(document.activeElement),
      ],
      [true, true, true]
    );

    HTMLElement.prototype.focus = focus;
    delete (document as any).activeElement;
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
