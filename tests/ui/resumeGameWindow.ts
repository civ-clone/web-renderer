// The resume window (#608), the real `ResumeGameWindow` built under linkedom from a save's seats: what it asks the
//  worker for, the rows it shows (each civilization and leader by name, who plays it, a person's name, and the AI
//  when there is a choice), the one-human rule as seats are changed, an AI the build lacks kept as the file names it,
//  and what Resume hands back (only the seats changed, the default AI as nothing) or Close (nothing: no load).
// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import ResumeGameWindow from '../../src/js/UI/components/ResumeGameWindow';
import { SeatChanges } from '../../src/js/Engine/lib/savedSeats';
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
      `FAIL resumeGameWindow: stopped after ${checks} checks, before the end\n`
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
//  value.
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

// A save as the page reads one: three players, the first a person's, with civilizations and leaders as entities.
const save = (clients: any[]) => ({
  clients,
  registries: { players: ['Player-1', 'Player-2', 'Player-3'] },
  entities: [
    {
      id: 'Player-1',
      type: 'Player',
      state: { _civilization: { $ref: 'Roman-1' } },
    },
    {
      id: 'Player-2',
      type: 'Player',
      state: { _civilization: { $ref: 'Zulu-1' } },
    },
    {
      id: 'Player-3',
      type: 'Player',
      state: { _civilization: { $ref: 'Greek-1' } },
    },
    {
      id: 'Roman-1',
      type: 'Roman',
      state: { _leader: { $ref: 'JuliusCaesar-1' } },
    },
    { id: 'Zulu-1', type: 'Zulu', state: { _leader: { $ref: 'Shaka-1' } } },
    {
      id: 'Greek-1',
      type: 'Greek',
      state: { _leader: { $ref: 'Alexander-1' } },
    },
    { id: 'JuliusCaesar-1', type: 'JuliusCaesar', state: {} },
    { id: 'Shaka-1', type: 'Shaka', state: {} },
    { id: 'Alexander-1', type: 'Alexander', state: {} },
    { id: 'Player-9', type: 'Player', state: {} },
  ],
});

const SAVED = [
  {
    playerId: 'Player-1',
    kind: 'human',
    module: 'DataTransferClient',
    name: 'Dom',
  },
  { playerId: 'Player-2', kind: 'ai', module: 'SimpleAIClient' },
  { playerId: 'Player-3', kind: 'ai', module: 'OtherAIClient' },
  // The barbarians' (#169), and a player the game no longer has: neither is a seat.
  { playerId: 'Player-8', kind: 'ai', module: 'BarbarianClient' },
  { playerId: 'Player-9', kind: 'ai', module: 'SimpleAIClient' },
];

type Sent = { channel: string; args: unknown[] };

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

    option.selected = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  },
  type = (element: Element, value: string): void => {
    (element as HTMLInputElement).value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };

const open = async ({
  aiClients = ['SimpleAIClient'],
  clients = SAVED,
}: { aiClients?: string[]; clients?: any[] } = {}) => {
  const log: Sent[] = [],
    transport = {
      request: async (request: Request): Promise<unknown> => {
        log.push({ channel: request.channel(), args: request.args() });

        return request.channel() === 'aiClients' ? aiClients : undefined;
      },
    } as unknown as Transport,
    settled: { result: SeatChanges | null | 'pending' } = {
      result: 'pending',
    },
    asked = ResumeGameWindow.ask(transport, save(clients)).then(
      (result) => (settled.result = result)
    );

  await settle();

  const element = document.querySelector('.resume-game-window') as HTMLElement;

  return {
    asked,
    element,
    log,
    settled,
    rows: () =>
      Array.from(
        element.querySelectorAll('table.seats tbody tr')
      ) as HTMLElement[],
    cell: (row: HTMLElement, name: string) =>
      row.querySelector(`[name=${name}]`) as HTMLSelectElement &
        HTMLInputElement,
    text: (row: HTMLElement) =>
      Array.from(row.querySelectorAll('td'))
        .slice(0, 3)
        .map((cell) => cell.textContent),
    disabled: (select: Element): string[] =>
      Array.from(select.querySelectorAll('option'))
        .filter((option) => (option as HTMLOptionElement).disabled)
        .map((option) => (option as HTMLOptionElement).value),
    values: (select: Element): string[] =>
      Array.from(select.querySelectorAll('option')).map(
        (option) => (option as HTMLOptionElement).value
      ),
    resume: () => element.querySelector('button.resume') as HTMLButtonElement,
    closeBox: () => element.querySelector('.close') as HTMLElement,
  };
};

(async (): Promise<void> => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          GameSetup: {
            ai: 'AI',
            civilization: 'Civilization',
            computer: 'Computer',
            human: 'Human',
            kind: 'Played by',
            leader: 'Leader',
            name: 'Name',
            seat: '#',
          },
          ResumeGame: {
            intro: 'Who plays each civilization?',
            resume: 'Resume',
            title: 'Resume game',
          },
        },
        civilization: {
          Roman: { name: 'Romans' },
          Zulu: { name: 'Zulus' },
          Leader: { JuliusCaesar: { name: 'Julius Caesar' } },
        },
      },
    },
  });

  // As the file has it.
  {
    const view = await open();

    expect(
      'the window asks the worker which AI clients there are',
      view.log.map(({ channel }) => channel),
      ['aiClients']
    );
    expect(
      'a row per seat, the barbarians and a player the game no longer has aside, naming civilization and leader',
      view.rows().map(view.text),
      [
        ['1', 'Romans', 'Julius Caesar'],
        ['2', 'Zulus', 'Shaka'],
        ['3', 'Greek', 'Alexander'],
      ]
    );
    expect(
      'who plays each, with the name the person gave',
      view
        .rows()
        .map((row) => [
          view.cell(row, 'kind').value,
          view.cell(row, 'name').value,
          view.cell(row, 'name').hidden,
        ]),
      [
        ['human', 'Dom', false],
        ['computer', '', true],
        ['computer', '', true],
      ]
    );
    expect(
      'with one AI in this build, the AI column is still shown, as a seat names one the build lacks',
      view.rows().map((row) => view.values(view.cell(row, 'ai'))),
      [
        ['SimpleAIClient'],
        ['SimpleAIClient'],
        ['SimpleAIClient', 'OtherAIClient'],
      ]
    );
    expect(
      'and that seat keeps the AI the file names',
      view.cell(view.rows()[2], 'ai').value,
      'OtherAIClient'
    );
    expect(
      'the other seats cannot be made human while one is',
      view.rows().map((row) => view.disabled(view.cell(row, 'kind'))),
      [[], ['human'], ['human']]
    );

    // Nothing changed: Resume hands back nothing to change.
    click(view.resume());
    await settle();

    expect(
      'Resume with nothing changed hands back no changes',
      view.settled.result,
      {}
    );
    expect(
      'and closes the window',
      document.querySelector('.resume-game-window'),
      null
    );
  }

  // The person hands their seat to the computer and takes another, with a name.
  {
    const view = await open({ aiClients: ['SimpleAIClient', 'OtherAIClient'] });

    choose(view.cell(view.rows()[0], 'kind'), 'computer');

    expect(
      'once no seat is human, any may be made so',
      view.rows().map((row) => view.disabled(view.cell(row, 'kind'))),
      [[], [], []]
    );
    expect(
      "and the computer's seat shows its AI, not a name",
      [
        view.cell(view.rows()[0], 'ai').hidden,
        view.cell(view.rows()[0], 'name').hidden,
      ],
      [false, true]
    );

    choose(view.cell(view.rows()[1], 'kind'), 'human');
    type(view.cell(view.rows()[1], 'name'), ' Pat ');
    choose(view.cell(view.rows()[2], 'ai'), 'SimpleAIClient');

    expect(
      'the others are held again',
      view.rows().map((row) => view.disabled(view.cell(row, 'kind'))),
      [['human'], [], ['human']]
    );

    click(view.resume());
    await settle();

    expect(
      'Resume hands back the seats changed: the computer with the default AI as nothing, the person with their name, an AI changed',
      view.settled.result,
      {
        'Player-1': { kind: 'computer' },
        'Player-2': { kind: 'human', name: 'Pat' },
        'Player-3': { kind: 'computer' },
      }
    );
  }

  // Closed instead: no load.
  {
    const view = await open();

    click(view.closeBox());
    await settle();

    expect('closing the window hands back nothing', view.settled.result, null);
    expect(
      'and the window is gone',
      document.querySelector('.resume-game-window'),
      null
    );
  }

  // A name untouched is no change, however it was saved; the file's ids are the keys, whatever they are.
  {
    const view = await open({
      clients: [
        {
          playerId: 'Player-1',
          kind: 'human',
          module: 'DataTransferClient',
          name: ' Bob ',
        },
        { playerId: 'Player-2', kind: 'ai', module: 'SimpleAIClient' },
      ],
    });

    click(view.resume());
    await settle();

    expect(
      'a saved name with spaces around it is not a change',
      view.settled.result,
      {}
    );
  }

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL resumeGameWindow: ${
        failures.length
      } of ${checks} checks\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS resumeGameWindow (${checks} checks)\n`);
})().catch((error) => {
  process.stderr.write(`FAIL resumeGameWindow: ${error.stack ?? error}\n`);
  process.exit(1);
});
