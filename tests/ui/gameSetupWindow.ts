// The game setup window (#605), the real `GameSetupWindow` built under linkedom and answered by a fake worker: what it
//  asks for before it opens, the seats it starts with and the rules the table keeps as seats are changed (one human,
//  each civilization once, a leader only once a civilization is chosen, never fewer than one seat or more than the map
//  or the civilizations allow), how the map choice, Earth and a typed size hold or change the world's inputs, and what
//  Start sends: `setOptions` with the world and the seats, then `onFinished`, then `start`.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import GameSetupWindow, {
  GameSetupPreset,
} from '../../src/js/UI/components/GameSetupWindow';
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
      `FAIL gameSetupWindow: stopped after ${checks} checks, before the end\n`
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
//  value, as the window does for the grid on choosing Earth.
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

// linkedom has no constraint validation: the message set, and the fields reported, are kept to look at.
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
    { name: 'Babylonian', leaders: ['Hammurabi'] },
    { name: 'Roman', leaders: ['JuliusCaesar', 'Augustus'] },
    { name: 'Zulu', leaders: ['Shaka'] },
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

// The worker's answers, and everything the window sent or requested, in order.
const fakeWorker = ({
  aiClients = ['SimpleAIClient'],
  civilizationList = civilizations,
  finishedHandler,
}: {
  aiClients?: string[];
  civilizationList?: typeof civilizations;
  finishedHandler?: () => void;
} = {}) => {
  const log: Sent[] = [],
    transport = {
      send: (channel: string, ...args: unknown[]) =>
        log.push({ channel, args }),
      request: async (request: Request): Promise<unknown> => {
        log.push({ channel: request.channel(), args: request.args() });

        switch (request.channel()) {
          case 'civilizations':
            return civilizationList;
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

  return { finishedHandler, log, transport };
};

const settle = (): Promise<void> =>
    new Promise((resolve) => setImmediate(resolve)),
  click = (element: Element): void => {
    element.dispatchEvent(new Event('click', { bubbles: true }));
  },
  // linkedom's select has no setter for `value`: it reads the selected option, so the option is selected.
  choose = (element: Element, value: string): void => {
    const option = Array.from(element.querySelectorAll('option')).find(
      (option) => (option as HTMLOptionElement).value === value
    ) as HTMLOptionElement | undefined;

    if (!option) {
      throw new Error(`no option ${value} to choose`);
    }

    option.selected = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  },
  type = (element: Element, value: string): void => {
    (element as HTMLInputElement).value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };

const open = async (
  options: {
    aiClients?: string[];
    civilizationList?: typeof civilizations;
    onFinished?: () => void | Promise<void>;
    preset?: GameSetupPreset;
  } = {}
) => {
  const worker = fakeWorker(options),
    window = await GameSetupWindow.ask(
      worker.transport,
      options.onFinished,
      options.preset
    ),
    element = window.element();

  const view = {
    ...worker,
    window,
    element,
    q: <E extends Element = HTMLElement>(selector: string): E =>
      element.querySelector(selector) as E,
    map: () => element.querySelector('select[name=map]') as HTMLSelectElement,
    difficulty: () =>
      element.querySelector('select[name=difficulty]') as HTMLSelectElement,
    input: (name: string) =>
      element.querySelector(`input[name=${name}]`) as HTMLInputElement,
    rows: () =>
      Array.from(
        element.querySelectorAll('table.seats tbody tr')
      ) as HTMLElement[],
    cell: (row: HTMLElement, name: string) =>
      row.querySelector(`[name=${name}]`) as HTMLSelectElement &
        HTMLInputElement,
    remove: (row: HTMLElement) =>
      row.querySelector('button.remove') as HTMLButtonElement,
    add: () => element.querySelector('.actions button') as HTMLButtonElement,
    start: () => element.querySelector('button.start') as HTMLButtonElement,
    // Option values, and the ones disabled.
    values: (select: Element): string[] =>
      Array.from(select.querySelectorAll('option')).map(
        (option) => (option as HTMLOptionElement).value
      ),
    disabled: (select: Element): string[] =>
      Array.from(select.querySelectorAll('option'))
        .filter((option) => (option as HTMLOptionElement).disabled)
        .map((option) => (option as HTMLOptionElement).value),
    // What `Start` sends as `setOptions`' arguments, if it has.
    options: (): any =>
      worker.log.find(({ channel }) => channel === 'setOptions')?.args[0],
  };

  return view;
};

type View = Awaited<ReturnType<typeof open>>;

// The seats as the table shows them: kind, civilization and, when it is shown, the leader.
const table = (view: View) =>
  view.rows().map((row) => ({
    kind: view.cell(row, 'kind').value,
    civilization: view.cell(row, 'civilization').value,
    leader: view.cell(row, 'leader').value,
  }));

const run = async (): Promise<void> => {
  await i18next.init({ lng: 'cimode' });

  // What it asks for, and what it opens with.

  let view = await open();

  expect(
    'it asks the worker for the civilizations, AI clients, difficulties and options, and nothing else',
    view.log.map(({ channel }) => channel).sort(),
    ['aiClients', 'civilizations', 'difficulties', 'getOptions']
  );
  expect(
    'the options asked for are the ones the Advanced section shows',
    view.log.find(({ channel }) => channel === 'getOptions')?.args,
    [['width', 'height', 'landCoverage', 'landSize', 'maxIterations']]
  );
  expect(
    'the window is on the page, open',
    [
      view.element.isConnected,
      document.querySelectorAll('dialog.game-setup-window[open]').length,
    ],
    [true, 1]
  );
  expect(
    "a map select, with the sizes, Earth's sizes and no custom size",
    view.values(view.map()),
    [
      'size:tiny',
      'size:small',
      'size:normal',
      'size:large',
      'size:huge',
      'earth:normal',
      'earth:large',
      'earth:huge',
    ]
  );
  expect('the map starts on Normal', view.map().value, 'size:normal');
  expect(
    'there is no grid select while only the square grid is supported',
    view.q('select[name=topologyId]'),
    null
  );
  expect(
    'the difficulties are offered, easiest first',
    view.values(view.difficulty()),
    ['Chieftain', 'Prince']
  );
  expect('Prince is preselected', view.difficulty().value, 'Prince');
  expect(
    'the Advanced section is closed',
    view.q('details.advanced').hasAttribute('open'),
    false
  );
  expect(
    'its inputs: width, height, land coverage, land size, iterations',
    Array.from(view.q('details.advanced').querySelectorAll('input')).map(
      (input) => [
        (input as HTMLInputElement).name,
        (input as HTMLInputElement).value,
      ]
    ),
    [
      ['width', '80'],
      ['height', '50'],
      ['landCoverage', '0.4'],
      ['landSize', '0.2'],
      ['maxIterations', '20'],
    ]
  );
  expect(
    'its inputs are enabled',
    Array.from(view.q('details.advanced').querySelectorAll('input')).map(
      (input) => (input as HTMLInputElement).disabled
    ),
    [false, false, false, false, false]
  );

  // The seats it starts with.

  expect(
    "the default seats are the default size's players: the first human, the rest computer, all random",
    table(view),
    [
      { kind: 'human', civilization: 'random', leader: 'random' },
      ...new Array(6).fill({
        kind: 'computer',
        civilization: 'random',
        leader: 'random',
      }),
    ]
  );
  expect(
    "a seat's first cell is its number",
    view.rows().map((row) => row.querySelector('td')!.textContent),
    ['1', '2', '3', '4', '5', '6', '7']
  );
  expect(
    'the name is shown for the human seat only',
    view.rows().map((row) => view.cell(row, 'name').hasAttribute('hidden')),
    [false, true, true, true, true, true, true]
  );
  expect(
    'the leader is hidden until a civilization is chosen',
    view.rows().map((row) => view.cell(row, 'leader').hidden),
    new Array(7).fill(true)
  );
  expect(
    'there is no AI column with one AI',
    view.rows().map((row) => view.cell(row, 'ai')),
    new Array(7).fill(null)
  );
  expect(
    'every seat can be removed while there are several',
    view.rows().map((row) => view.remove(row).disabled),
    new Array(7).fill(false)
  );
  expect(
    'a civilization select is random and then the civilizations',
    view.values(view.cell(view.rows()[0], 'civilization')),
    ['random', ...civilizations.map(({ name }) => name)]
  );

  // One human.

  expect(
    'the first seat can be human or computer',
    view.disabled(view.cell(view.rows()[0], 'kind')),
    []
  );
  expect(
    'Human is disabled on the other rows while a human seat exists',
    view.rows().map((row) => view.disabled(view.cell(row, 'kind'))),
    [[], ...new Array(6).fill(['human'])]
  );

  choose(view.cell(view.rows()[0], 'kind'), 'computer');

  expect(
    'with no human seat left, Human is available on every row',
    view.rows().map((row) => view.disabled(view.cell(row, 'kind'))),
    new Array(7).fill([])
  );
  expect('the first seat is now a computer', table(view)[0].kind, 'computer');
  expect(
    "a computer seat's name is hidden",
    view.cell(view.rows()[0], 'name').hasAttribute('hidden'),
    true
  );

  choose(view.cell(view.rows()[3], 'kind'), 'human');

  expect(
    'another seat can be made the human',
    table(view).map(({ kind }) => kind),
    [
      'computer',
      'computer',
      'computer',
      'human',
      'computer',
      'computer',
      'computer',
    ]
  );
  expect(
    'and then it has the name field, and the others do not',
    view.rows().map((row) => view.cell(row, 'name').hasAttribute('hidden')),
    [true, true, true, false, true, true, true]
  );
  expect(
    'and Human is disabled on the others again',
    view.rows().map((row) => view.disabled(view.cell(row, 'kind'))),
    [['human'], ['human'], ['human'], [], ['human'], ['human'], ['human']]
  );

  // Civilizations and leaders.

  view = await open();

  choose(view.cell(view.rows()[1], 'civilization'), 'Roman');

  expect(
    'choosing a civilization shows the leader select, random and then its leaders',
    [
      view.cell(view.rows()[1], 'leader').hidden,
      view.values(view.cell(view.rows()[1], 'leader')),
    ],
    [false, ['random', 'JuliusCaesar', 'Augustus']]
  );
  expect(
    'and keeps the civilization chosen',
    view.cell(view.rows()[1], 'civilization').value,
    'Roman'
  );
  expect(
    'the other rows still have no leader select',
    view.rows().map((row) => view.cell(row, 'leader').hidden),
    [true, false, true, true, true, true, true]
  );
  expect(
    'the civilization chosen is disabled on the other rows, and not on its own',
    view.rows().map((row) => view.disabled(view.cell(row, 'civilization'))),
    view.rows().map((row, index) => (index === 1 ? [] : ['Roman']))
  );

  choose(view.cell(view.rows()[1], 'leader'), 'Augustus');

  expect(
    'a leader can be chosen',
    view.cell(view.rows()[1], 'leader').value,
    'Augustus'
  );

  choose(view.cell(view.rows()[1], 'civilization'), 'Zulu');

  expect(
    'changing the civilization resets the leader to random',
    [
      view.cell(view.rows()[1], 'leader').value,
      view.values(view.cell(view.rows()[1], 'leader')),
    ],
    ['random', ['random', 'Shaka']]
  );
  expect(
    'and frees the one it left',
    view.rows().map((row) => view.disabled(view.cell(row, 'civilization'))),
    view.rows().map((row, index) => (index === 1 ? [] : ['Zulu']))
  );

  choose(view.cell(view.rows()[0], 'civilization'), 'Greek');

  expect(
    'two seats choosing: each is disabled on the other rows',
    view.rows().map((row) => view.disabled(view.cell(row, 'civilization'))),
    view
      .rows()
      .map((row, index) =>
        index === 0 ? ['Zulu'] : index === 1 ? ['Greek'] : ['Zulu', 'Greek']
      )
  );

  choose(view.cell(view.rows()[1], 'civilization'), 'random');

  expect(
    'choosing random again hides the leader select and frees the civilization',
    [
      view.cell(view.rows()[1], 'leader').hidden,
      view.rows().map((row) => view.disabled(view.cell(row, 'civilization'))),
    ],
    [true, view.rows().map((row, index) => (index === 0 ? [] : ['Greek']))]
  );

  // Adding and removing seats.

  view = await open();

  expect(
    'remove is enabled with several seats',
    view.remove(view.rows()[0]).disabled,
    false
  );
  expect(
    "add is disabled at the size's maximum, 7 on Normal",
    view.add().disabled,
    true
  );

  click(view.remove(view.rows()[6]));

  expect('removing a seat takes its row away', view.rows().length, 6);
  expect(
    'and numbers the rest',
    view.rows().map((row) => row.querySelector('td')!.textContent),
    ['1', '2', '3', '4', '5', '6']
  );
  expect('and add is enabled again', view.add().disabled, false);

  click(view.add());

  expect(
    'add appends a computer seat with a random civilization',
    [view.rows().length, table(view)[6]],
    [7, { kind: 'computer', civilization: 'random', leader: 'random' }]
  );
  expect('and disables add again at the maximum', view.add().disabled, true);

  choose(view.cell(view.rows()[2], 'civilization'), 'Roman');
  click(view.remove(view.rows()[1]));

  expect(
    "removing a row keeps the others' choices with them",
    table(view).map(({ civilization }) => civilization),
    ['random', 'Roman', 'random', 'random', 'random', 'random']
  );
  expect(
    'and the human seat is still the first',
    table(view).map(({ kind }) => kind),
    ['human', 'computer', 'computer', 'computer', 'computer', 'computer']
  );

  // The last seat stays.

  view = await open();

  for (let i = 0; i < 6; i++) {
    click(view.remove(view.rows()[view.rows().length - 1]));
  }

  expect('every seat but one can be removed', view.rows().length, 1);
  expect(
    'the last one cannot be removed',
    view.remove(view.rows()[0]).disabled,
    true
  );

  expect('the last seat is the first, the human', table(view)[0].kind, 'human');

  // Fewer civilizations than the map has room for.

  view = await open({ civilizationList: civilizations.slice(0, 3) });

  expect(
    'with three civilizations there are three seats, however many players Normal has',
    view.rows().length,
    3
  );
  expect('and no room to add another', view.add().disabled, true);

  click(view.remove(view.rows()[2]));

  expect('removing one makes room', view.add().disabled, false);

  // The map.

  view = await open();

  choose(view.map(), 'size:tiny');

  expect(
    'a smaller size trims the seats to its maximum, 4 on Tiny',
    view.rows().length,
    4
  );
  expect(
    'the first seat is kept, and is still the human',
    table(view)[0].kind,
    'human'
  );
  expect('and add is disabled', view.add().disabled, true);
  expect(
    "the size's width and height fill the inputs",
    [view.input('width').value, view.input('height').value],
    ['40', '25']
  );
  expect('Tiny is selected in the map select', view.map().value, 'size:tiny');

  choose(view.map(), 'size:huge');

  expect('a bigger size keeps the seats it has', view.rows().length, 4);
  expect('and has room for more: add is enabled', view.add().disabled, false);
  expect(
    "the size's width and height fill the inputs",
    [view.input('width').value, view.input('height').value],
    ['128', '80']
  );

  for (let i = 0; i < 4; i++) {
    click(view.add());
  }

  expect(
    'add goes on up to the civilizations there are (8 here), though Huge has room for 14',
    view.rows().length,
    8
  );
  expect('and then is disabled', view.add().disabled, true);

  // Earth.

  view = await open();

  choose(view.map(), 'earth:normal');

  expect('Earth is selected', view.map().value, 'earth:normal');
  expect(
    'Earth disables the width, height and land inputs',
    Array.from(view.q('details.advanced').querySelectorAll('input')).map(
      (input) => (input as HTMLInputElement).disabled
    ),
    [true, true, true, true, true]
  );
  expect(
    'Earth Normal is 80 by 50',
    [view.input('width').value, view.input('height').value],
    ['80', '50']
  );
  expect('Earth Normal keeps its 7 seats', view.rows().length, 7);

  choose(view.map(), 'size:normal');

  expect(
    'choosing a plain size again enables the inputs',
    Array.from(view.q('details.advanced').querySelectorAll('input')).map(
      (input) => (input as HTMLInputElement).disabled
    ),
    [false, false, false, false, false]
  );

  choose(view.map(), 'earth:large');

  expect(
    'Earth Large is 104 by 65',
    [view.input('width').value, view.input('height').value],
    ['104', '65']
  );

  // A size typed in.

  view = await open();

  type(view.input('width'), '90');

  expect(
    'typing a width switches the map to custom',
    view.map().value,
    'custom'
  );
  expect(
    'a custom option is added to the list',
    view.values(view.map()).slice(-1),
    ['custom']
  );
  expect(
    'and the typed width is kept',
    [view.input('width').value, view.input('height').value],
    ['90', '50']
  );
  expect('a custom size keeps the seats', view.rows().length, 7);

  choose(view.map(), 'size:small');

  expect(
    'choosing a size again takes the custom option out',
    view.values(view.map()).includes('custom'),
    false
  );
  expect("and trims the seats to Small's 6", view.rows().length, 6);
  expect(
    'and puts its dimensions back',
    [view.input('width').value, view.input('height').value],
    ['64', '40']
  );

  view = await open();
  choose(view.map(), 'earth:normal');
  type(view.input('height'), '60');

  expect(
    'typing after Earth is chosen makes the world custom and not Earth',
    view.map().value,
    'custom'
  );

  // The AI column.

  view = await open({ aiClients: ['SimpleAIClient', 'OtherAIClient'] });

  expect(
    'with two AIs each seat has an AI select',
    view.rows().map((row) => view.values(view.cell(row, 'ai'))),
    new Array(7).fill(['SimpleAIClient', 'OtherAIClient'])
  );
  expect(
    'and the first is chosen',
    view.rows().map((row) => view.cell(row, 'ai').value),
    new Array(7).fill('SimpleAIClient')
  );
  expect(
    'and the header has a column for it',
    view.q('table.seats thead tr').children.length,
    view.rows()[0].children.length
  );
  expect(
    'the AI is hidden on the human seat only',
    view.rows().map((row) => view.cell(row, 'ai').hidden),
    [true, false, false, false, false, false, false]
  );

  // Presets.

  view = await open({ preset: { advanced: true } });

  expect(
    'the Advanced preset opens the details',
    view.q('details.advanced').hasAttribute('open'),
    true
  );
  expect('and does not choose Earth', view.map().value, 'size:normal');

  view = await open({ preset: { earth: true } });

  expect('the Earth preset starts on Earth', view.map().value, 'earth:normal');
  expect('with the inputs held', view.input('width').disabled, true);
  expect(
    'and the details closed',
    view.q('details.advanced').hasAttribute('open'),
    false
  );

  // Start.

  const order: string[] = [];

  view = await open({
    onFinished: async () => {
      order.push('finished');
      await settle();
      order.push('finished-done');
    },
  });

  const original = view.transport.send;

  (view.transport as any).send = (channel: string, ...args: unknown[]) => {
    order.push(`send:${channel}`);

    return (original as any)(channel, ...args);
  };

  click(view.start());
  await settle();
  await settle();

  expect(
    'Start sends setOptions with the world and, per seat, only what was chosen',
    view.options(),
    {
      topologyId: 'square',
      earth: false,
      width: 80,
      height: 50,
      landCoverage: '0.4',
      landSize: '0.2',
      maxIterations: '20',
      difficulty: 'Prince',
      seats: [{ kind: 'human' }, ...new Array(6).fill({ kind: 'computer' })],
    }
  );
  expect('it then waits for onFinished, and sends start with nothing', order, [
    'finished',
    'finished-done',
    'send:start',
  ]);
  expect(
    'start is sent with null',
    view.log
      .filter(({ channel }) => channel === 'start')
      .map(({ args }) => args),
    [[null]]
  );
  expect(
    'setOptions is requested before start is sent',
    view.log.map(({ channel }) => channel).slice(-2),
    ['setOptions', 'start']
  );
  expect('the window is closed', view.element.hasAttribute('open'), false);

  // What Start sends for chosen seats.

  view = await open({ aiClients: ['SimpleAIClient', 'OtherAIClient'] });

  type(view.cell(view.rows()[0], 'name'), '  Ada  ');
  choose(view.cell(view.rows()[0], 'civilization'), 'Roman');
  choose(view.cell(view.rows()[0], 'leader'), 'Augustus');
  choose(view.cell(view.rows()[1], 'civilization'), 'Zulu');
  choose(view.cell(view.rows()[2], 'civilization'), 'Greek');
  choose(view.cell(view.rows()[2], 'ai'), 'OtherAIClient');
  choose(view.cell(view.rows()[3], 'ai'), 'OtherAIClient');
  choose(view.cell(view.rows()[4], 'ai'), 'OtherAIClient');
  choose(view.cell(view.rows()[4], 'civilization'), 'Mongol');
  choose(view.cell(view.rows()[4], 'leader'), 'GenghisKhan');
  choose(view.difficulty(), 'Chieftain');
  click(view.remove(view.rows()[6]));
  click(view.remove(view.rows()[5]));

  click(view.start());
  await settle();

  expect(
    'a chosen civilization, leader and non-default AI are sent; random and the first AI are not; the name is trimmed',
    view.options().seats,
    [
      { kind: 'human', name: 'Ada', civilization: 'Roman', leader: 'Augustus' },
      { kind: 'computer', civilization: 'Zulu' },
      { kind: 'computer', civilization: 'Greek', ai: 'OtherAIClient' },
      { kind: 'computer', ai: 'OtherAIClient' },
      {
        kind: 'computer',
        civilization: 'Mongol',
        leader: 'GenghisKhan',
        ai: 'OtherAIClient',
      },
    ]
  );
  expect(
    'the chosen difficulty is sent',
    view.options().difficulty,
    'Chieftain'
  );

  // A blank name is not sent; a typed name is dropped if the seat is no longer human.

  view = await open();

  type(view.cell(view.rows()[0], 'name'), '   ');
  click(view.start());
  await settle();

  expect('a blank name is not sent', view.options().seats[0], {
    kind: 'human',
  });

  view = await open();

  type(view.cell(view.rows()[0], 'name'), 'Ada');
  choose(view.cell(view.rows()[0], 'kind'), 'computer');
  choose(view.cell(view.rows()[1], 'kind'), 'human');
  click(view.start());
  await settle();

  expect(
    'a name typed on a seat that is no longer human is not sent, and the new human has none',
    view.options().seats.slice(0, 2),
    [{ kind: 'computer' }, { kind: 'human' }]
  );

  view = await open();

  choose(view.cell(view.rows()[2], 'civilization'), 'Roman');
  choose(view.cell(view.rows()[2], 'leader'), 'Augustus');
  choose(view.cell(view.rows()[2], 'civilization'), 'random');
  click(view.start());
  await settle();

  expect(
    'a leader left behind by going back to a random civilization is not sent',
    view.options().seats[2],
    { kind: 'computer' }
  );

  // The world options sent with Start.

  view = await open();

  choose(view.map(), 'earth:large');
  click(view.start());
  await settle();

  expect(
    'Earth is sent as earth, with its size',
    [view.options().earth, view.options().width, view.options().height],
    [true, 104, 65]
  );

  view = await open({ preset: { advanced: true } });

  type(view.input('width'), '100');
  type(view.input('height'), '60');
  type(view.input('landCoverage'), '0.5');
  type(view.input('landSize'), '0.3');
  type(view.input('maxIterations'), '15');
  click(view.start());
  await settle();

  expect(
    'a typed size and land are sent',
    [
      view.options().earth,
      view.options().width,
      view.options().height,
      view.options().landCoverage,
      view.options().landSize,
      view.options().maxIterations,
    ],
    [false, 100, 60, '0.5', '0.3', '15']
  );

  view = await open({ preset: { advanced: true } });

  type(view.input('width'), '2.5');
  click(view.start());
  await settle();

  expect(
    'a size the world cannot be is not sent, and the window stays open',
    [view.options(), view.element.hasAttribute('open')],
    [undefined, true]
  );
  expect(
    'and the width is reported with why',
    reported.length > 0 && reported[reported.length - 1].startsWith('width: '),
    true
  );

  view = await open();

  choose(view.map(), 'size:tiny');
  click(view.start());
  await settle();

  expect('the seats sent are the trimmed ones', view.options().seats.length, 4);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL gameSetupWindow (${
        failures.length
      } of ${checks} checks)\n  ${failures.slice(0, 20).join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS gameSetupWindow (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL gameSetupWindow: ${error.stack ?? error}\n`);
  process.exit(1);
});
