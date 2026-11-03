// The new interface's game setup (#750), the real `GameSetupForm` built under linkedom and answered by a fake worker:
//  the seats' Human / Computer toggle and its one-human rule, a game with no human seat said to be watched, the
//  civilization's swatch and a lone leader filled in, Remove and Add a seat at their limits, a smaller map trimming the
//  seats, Earth holding the Advanced fields, the difficulty's line, the keys, and what Start sends, which is what the
//  classic `GameSetupWindow` sends for the same choices.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import GameSetupForm from '../../src/js/UI/components/GameSetupForm';
import GameSetupWindow from '../../src/js/UI/components/GameSetupWindow';
import Request from '../../src/js/Engine/Request';
import Transport from '../../src/js/UI/Transport';
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
const fakeWorker = () => {
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
            return ['SimpleAIClient'];
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

const open = async () => {
  const worker = fakeWorker(),
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

  view = await open();

  choose(view.map(), 'size:large');
  choose(view.difficulty(), 'Chieftain');
  choose(view.civilization(view.rows()[1]), 'Roman');
  type(view.input('name'), ' Dom ');
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
  const classicWorker = fakeWorker(),
    classic = (await GameSetupWindow.ask(classicWorker.transport)).element();

  choose(classic.querySelector('select[name=map]')!, 'size:large');
  choose(classic.querySelector('select[name=difficulty]')!, 'Chieftain');
  choose(classic.querySelectorAll('select[name=civilization]')[1], 'Roman');
  type(classic.querySelector('input[name=name]')!, ' Dom ');
  click(classic.querySelector('button.start')!);
  await settle();

  expect(
    'and sends what the classic window sends for the same choices',
    sent,
    classicWorker.log.find(({ channel }) => channel === 'setOptions')?.args[0]
  );

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
