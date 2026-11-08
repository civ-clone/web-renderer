// The new interface's game setup (#750), the real `GameSetupForm` built under linkedom and answered by a fake worker:
//  the seats' Human / Computer toggle and its one-human rule, a game with no human seat said to be watched, the
//  civilization's swatch and a lone leader filled in, Remove and Add a seat at their limits, a smaller map trimming the
//  seats, Earth holding the Advanced fields, the difficulty's line, the keys, and what Start sends, which is what the
//  classic `GameSetupWindow` sends for the same choices.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/grids';

import GameSetupForm from '@civ-clone/ui-windows/components/GameSetupForm';
import GameSetupWindow from '@civ-clone/ui-windows/components/GameSetupWindow';
import Request from '../../src/js/Engine/Request';
import Transport from '@civ-clone/ui-client/Transport';
import { applyInterface } from '@civ-clone/ui-client/lib/interfaceMode';
import i18next from 'i18next';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL gameSetupForm: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

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

// linkedom's select only reads `value` (the selected option's), where a browser also selects the option with that
//  value, as the form does for the grid on choosing Earth.
const selectPrototype = Object.getPrototypeOf(document.createElement('select'));

Object.defineProperty(selectPrototype, 'value', {
  configurable: true,
  get(this: HTMLSelectElement): string | undefined {
    return (this.querySelector('option[selected]') as HTMLOptionElement | null)
      ?.value;
  },
  set(this: HTMLSelectElement, value: string) {
    const option = Array.from(this.querySelectorAll('option')).find(
      (option) => (option as HTMLOptionElement).value === value
    ) as HTMLOptionElement | undefined;

    if (option) {
      option.selected = true;
    }
  },
});

// linkedom has no focus: what has it is kept by hand, and a disabled control, as in a browser, doesn't take it.
let focused: Element | null = document.body;

Object.defineProperty(document, 'activeElement', {
  configurable: true,
  get: () => focused,
});
Object.getPrototypeOf(
  Object.getPrototypeOf(document.createElement('button'))
).focus = function (this: HTMLElement & { disabled?: boolean }): void {
  if (!this.disabled) {
    focused = this;
  }
};

// linkedom has no constraint validation: the fields reported are kept to look at.
const reported: string[] = [],
  inputPrototype = Object.getPrototypeOf(document.createElement('input'));

inputPrototype.setCustomValidity = function (
  this: { validationMessage: string },
  message: string
): void {
  this.validationMessage = message;
};
inputPrototype.reportValidity = function (this: {
  name: string;
  validationMessage: string;
}): boolean {
  reported.push(`${this.name}: ${this.validationMessage}`);

  return false;
};

const civilizations = [
    {
      name: 'Babylonian',
      leaders: ['Hammurabi'],
      colours: ['#C9A86A', '#1D3B6E'],
    },
    { name: 'Roman', leaders: ['JuliusCaesar', 'Augustus'], colours: ['#FFF'] },
    { name: 'Zulu', leaders: ['Shaka'], colours: [] },
    { name: 'Egyptian', leaders: ['Ramesses'] },
    { name: 'American', leaders: ['Lincoln'] },
    { name: 'Greek', leaders: ['Alexander'] },
    { name: 'Mongol', leaders: ['GenghisKhan'] },
    { name: 'English', leaders: ['Elizabeth'] },
  ],
  difficulties = [
    { name: 'Chieftain', level: 0 },
    { name: 'Prince', level: 2 },
  ];

type Sent = { channel: string; args: unknown[] };

// The worker's answers, and everything the form sent or requested, in order.
const fakeWorker = (aiClients: string[] = ['SimpleAIClient']) => {
  const log: Sent[] = [],
    transport = {
      send: (channel: string, ...args: unknown[]) =>
        log.push({ channel, args }),
      request: async (request: Request): Promise<unknown> => {
        log.push({ channel: request.channel(), args: request.args() });

        switch (request.channel()) {
          case 'civilizations':
            return civilizations;
          case 'aiClients':
            return aiClients;
          case 'difficulties':
            return difficulties;
          case 'getOptions':
            return {};
          default:
            return undefined;
        }
      },
    } as unknown as Transport;

  return { log, transport };
};

const settle = (): Promise<void> =>
    new Promise((resolve) => setImmediate(resolve)),
  click = (element: Element): void => {
    element.dispatchEvent(new Event('click', { bubbles: true }));
  },
  choose = (element: Element, value: string): void => {
    const option = Array.from(element.querySelectorAll('option')).find(
      (option) => (option as HTMLOptionElement).value === value
    ) as HTMLOptionElement | undefined;

    if (!option) {
      throw new Error(`no option ${value} to choose`);
    }

    // As a browser does, and linkedom doesn't across `<optgroup>`s: one option selected.
    element
      .querySelectorAll('option')
      .forEach((other) => ((other as HTMLOptionElement).selected = false));
    option.selected = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  },
  check = (input: HTMLInputElement): void => {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },
  press = (target: Element, key: string): void => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
    );
  },
  type = (element: Element, value: string): void => {
    (element as HTMLInputElement).value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };

const open = async (aiClients?: string[]) => {
  const worker = fakeWorker(aiClients),
    form = await GameSetupForm.ask(worker.transport),
    element = form.element();

  return {
    ...worker,
    form,
    element,
    q: <E extends Element = HTMLElement>(selector: string): E =>
      element.querySelector(selector) as E,
    map: () => element.querySelector('select[name=map]') as HTMLSelectElement,
    difficulty: () =>
      element.querySelector('select[name=difficulty]') as HTMLSelectElement,
    input: (name: string) =>
      element.querySelector(`input[name=${name}]`) as HTMLInputElement,
    rows: () =>
      Array.from(element.querySelectorAll('tbody tr')) as HTMLElement[],
    kinds: (row: HTMLElement) =>
      Array.from(
        row.querySelectorAll('input[type=radio]')
      ) as HTMLInputElement[],
    civilization: (row: HTMLElement) =>
      row.querySelector('select[name=civilization]') as HTMLSelectElement,
    remove: (row: HTMLElement) =>
      row.querySelector('.ui-game-setup-remove') as HTMLButtonElement,
    add: () => element.querySelector('.ui-game-setup-add') as HTMLButtonElement,
    start: () => element.querySelector('button.start') as HTMLButtonElement,
    note: () => element.querySelector('.ui-game-setup-note') as HTMLElement,
    options: (): any =>
      worker.log.find(({ channel }) => channel === 'setOptions')?.args[0],
  };
};

type View = Awaited<ReturnType<typeof open>>;

// Each seat's toggle: what's checked, and what can't be.
const toggles = (view: View) =>
  view.rows().map((row) =>
    view
      .kinds(row)
      .map(
        (input) =>
          `${input.value}${input.checked ? '*' : ''}${
            input.disabled ? ' (held)' : ''
          }`
      )
      .join(' ')
  );

const run = async (): Promise<void> => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          'GameSetup.difficulty-summary.Prince': 'A fair game.',
          'GameSetup.watched': 'You will watch.',
        },
      },
    },
  });

  let view = await open();

  // The toggle, and one human seat (#161).

  expect(
    'seven seats: the first human, the rest computer, Human held on each of them',
    toggles(view),
    ['human* computer', ...new Array(6).fill('human (held) computer*')]
  );
  expect(
    'each row is its own radio group',
    new Set(view.rows().map((row) => view.kinds(row)[0].name)).size,
    7
  );
  expect('nobody is said to be watching', view.note().hidden, true);

  check(view.kinds(view.rows()[0])[1]);

  expect(
    'the human made a computer: every seat may be human now',
    toggles(view),
    new Array(7).fill('human computer*')
  );
  expect(
    'and the game is said to be watched (#607)',
    [view.note().hidden, view.note().textContent],
    [false, 'You will watch.']
  );

  check(view.kinds(view.rows()[2])[0]);

  expect(
    'another seat made human holds the rest',
    toggles(view)[2] + ' / ' + toggles(view)[0],
    'human* computer / human (held) computer*'
  );

  // The civilization's colours, and a lone leader filled in.

  view = await open();

  const swatch = (row: HTMLElement) =>
    row.querySelector('.ui-civ-swatch') as HTMLElement;

  expect(
    'a random seat has the striped swatch',
    swatch(view.rows()[0]).classList.contains('random'),
    true
  );

  choose(view.civilization(view.rows()[0]), 'Babylonian');

  expect(
    "a chosen civilization's swatch is its two colours",
    [
      swatch(view.rows()[0]).classList.contains('random'),
      swatch(view.rows()[0]).style.getPropertyValue('--swatch-first'),
      swatch(view.rows()[0]).style.getPropertyValue('--swatch-second'),
    ],
    [false, '#C9A86A', '#1D3B6E']
  );
  expect(
    'a civilization with one leader shows that leader, not a choice',
    [
      view.rows()[0].querySelector('select[name=leader]'),
      view.rows()[0].querySelector('.ui-game-setup-leader')?.textContent,
    ],
    [null, 'Hammurabi']
  );

  choose(view.civilization(view.rows()[1]), 'Roman');

  expect(
    'one colour is both halves, and more than one leader is a choice, chance among them',
    [
      swatch(view.rows()[1]).style.getPropertyValue('--swatch-second'),
      Array.from(
        view.rows()[1].querySelectorAll('select[name=leader] option')
      ).map((option) => (option as HTMLOptionElement).value),
    ],
    ['#FFF', ['random', 'JuliusCaesar', 'Augustus']]
  );

  choose(view.civilization(view.rows()[2]), 'Zulu');

  expect(
    'a civilization without colours has the striped swatch',
    swatch(view.rows()[2]).classList.contains('random'),
    true
  );
  expect(
    'a civilization chosen is held in the other seats',
    (
      view
        .civilization(view.rows()[3])
        .querySelector('option[value=Babylonian]') as HTMLOptionElement
    ).disabled,
    true
  );

  // Remove and Add a seat, at their limits; a smaller map trims the seats.

  expect('Normal has room for no more than seven', view.add().disabled, true);

  choose(view.map(), 'size:tiny');

  expect(
    "a tiny map keeps its four, the human's among them",
    [view.rows().length, toggles(view)[0]],
    [4, 'human* computer']
  );

  while (!view.remove(view.rows()[0]).disabled) {
    click(view.remove(view.rows()[view.rows().length - 1]));
  }

  expect(
    'the last seat stays, and another can be added',
    [view.rows().length, view.add().disabled],
    [1, false]
  );

  // Earth holds the grid and the Advanced fields.

  choose(view.map(), 'earth:normal');

  expect(
    "Earth's land is its map's: the Advanced fields are held",
    Array.from(view.q('details').querySelectorAll('input')).map(
      (input) => (input as HTMLInputElement).disabled
    ),
    [true, true, true, true, true]
  );
  expect(
    'each field has a label and, but for land size, a unit',
    Array.from(view.q('details').querySelectorAll('.ui-field-unit')).length,
    4
  );

  // The difficulty's line.

  expect(
    "Prince's line is shown",
    [view.q('.ui-field-hint').hidden, view.q('.ui-field-hint').textContent],
    [false, 'A fair game.']
  );

  choose(view.difficulty(), 'Chieftain');

  expect(
    "a level the translations don't describe has none",
    view.q('.ui-field-hint').hidden,
    true
  );

  // The keys, and what Start sends.

  view = await open();

  press(view.kinds(view.rows()[0])[0], 'Enter');
  await settle();

  expect('Enter on a toggle starts nothing', view.options(), undefined);

  type(view.input('width'), '2.5');
  press(view.input('name'), 'Enter');
  await settle();

  expect(
    "a size that isn't whole is reported, with the Advanced section opened, and nothing is sent",
    [
      reported.length > 0,
      view.q('details').hasAttribute('open'),
      view.options(),
    ],
    [true, true, undefined]
  );

  // Escape cancels, as in every window, and sends nothing.
  view = await open();
  press(view.element, 'Escape');
  await settle();

  expect(
    'Escape closes the form and sends nothing',
    [(view.element as HTMLDialogElement).open === true, view.options()],
    [false, undefined]
  );

  // Removing a seat by keyboard leaves the focus in the table: on the next seat's Remove, rather than its held Human.
  view = await open();
  view.remove(view.rows()[2]).focus();
  click(view.remove(view.rows()[2]));

  expect(
    "after Remove, the focus is on the next seat's Remove",
    [
      view.rows().length,
      document.activeElement === view.remove(view.rows()[2]),
    ],
    [6, true]
  );

  // The toggle's focus follows its checked radio, as the arrow keys move both: not the first of the row's radios.
  view = await open();
  check(view.kinds(view.rows()[0])[1]);
  view.kinds(view.rows()[0])[0].focus();
  check(view.kinds(view.rows()[0])[0]);
  view.kinds(view.rows()[0])[1].focus();
  check(view.kinds(view.rows()[0])[1]);

  expect(
    'after the toggle is moved, its checked radio has the focus',
    document.activeElement === view.kinds(view.rows()[0])[1],
    true
  );

  // Enter on a button is the button's: Remove doesn't start the game.
  press(view.remove(view.rows()[1]), 'Enter');
  await settle();

  expect('Enter on Remove starts nothing', view.options(), undefined);

  // Two AI clients, so the AI column and its payload run.
  const ais = ['SimpleAIClient', 'OtherAIClient'],
    choices = (element: Element): void => {
      const civilizations = element.querySelectorAll(
        'select[name=civilization]'
      );

      choose(element.querySelector('select[name=map]')!, 'size:large');
      choose(element.querySelector('select[name=difficulty]')!, 'Chieftain');
      choose(civilizations[1], 'Roman');
      // One leader: shown, and sent as the classic window sends it.
      choose(civilizations[2], 'Babylonian');
      choose(element.querySelectorAll('select[name=ai]')[3], 'OtherAIClient');
      type(element.querySelector('input[name=name]')!, ' Dom ');
    };

  view = await open(ais);
  choices(view.element);
  press(view.input('name'), 'Enter');
  await settle();

  const sent = view.options();

  expect(
    'Enter in the name starts: setOptions, then start',
    view.log
      .map(({ channel }) => channel)
      .filter((channel) => ['setOptions', 'start'].includes(channel)),
    ['setOptions', 'start']
  );

  // The classic window, given the same choices, sends the same.
  const classicWorker = fakeWorker(ais),
    classic = (await GameSetupWindow.ask(classicWorker.transport)).element();

  choices(classic);
  click(classic.querySelector('button.start')!);
  await settle();

  expect(
    'and sends what the classic window sends for the same choices, a lone leader and a second AI among them',
    [sent?.seats?.[3]?.ai, sent],
    [
      'OtherAIClient',
      classicWorker.log.find(({ channel }) => channel === 'setOptions')
        ?.args[0],
    ]
  );

  // The new interface's chrome (#738): Start moved into its footer as the primary, and Enter on the window itself
  //  starts, through the chrome.
  applyInterface('modern', null, document.documentElement);
  view = await open();
  await settle();

  expect(
    "under the new interface, Start is the window footer's primary",
    view.element.querySelectorAll('.ui-window-footer .btn-primary.start')
      .length,
    1
  );

  press(view.element, 'Enter');
  await settle();

  expect(
    'and Enter on the window starts the game',
    view.log
      .map(({ channel }) => channel)
      .filter((channel) => ['setOptions', 'start'].includes(channel)),
    ['setOptions', 'start']
  );

  applyInterface('classic', null, document.documentElement);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL gameSetupForm (${failures.length} of ${checks} checks)\n  ${failures
        .slice(0, 20)
        .join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS gameSetupForm (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL gameSetupForm: ${error.stack ?? error}\n`);
  process.exit(1);
});
