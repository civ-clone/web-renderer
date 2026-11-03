// The lists the engine asks the player to choose from (`chooseFromList`), through `ChoiceHandler.listen` as the page
//  registers it (#344, #512), with the real windows under linkedom. Every list first forgets the keys kept for a unit.
//  A step of the talks with one answer is an `ActionWindow` that answers once it closes, Enter closing it; any other
//  list is a `SelectionWindow`, the choice sent back on the same channel: the talks' answers labelled as the player's
//  own, Random offered among the civilizations (#15) and answered with one of those offered, and the difficulty
//  levels of a save from before there were any labelled easiest first, the last one chosen preselected, and the one
//  chosen remembered (#173). With the `?debug=1` stress runner on and its windows off, a choice it is automating is
//  answered at once, with no window; with its windows on, it is handed the window to answer. A step of the talks lists
//  Good bye first, so Enter leaves them (#502).
// The engine's side of the same lists, `ChoicePrompt`, is `tests/engine/choosePrompts.ts`.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import ChoiceHandler from '../../src/js/UI/app/ChoiceHandler';
import DebugFlags, {
  StressRunnerHandle,
} from '../../src/js/UI/debug/DebugFlags';
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
    process.stderr.write(
      `FAIL choiceHandler: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

// linkedom's `select.value` is read-only and only follows an option with `selected`: as a browser's, it is the first
//  option until one is chosen, and setting it chooses one.
Object.defineProperty(
  (globalThis as any).HTMLSelectElement.prototype,
  'value',
  {
    configurable: true,
    get(this: HTMLSelectElement): string | undefined {
      const options = Array.from(this.querySelectorAll('option'));

      return (
        options.find((option) => option.hasAttribute('selected')) ?? options[0]
      )?.getAttribute('value') as string | undefined;
    },
    set(this: HTMLSelectElement, value: string) {
      this.querySelectorAll('option').forEach((option) =>
        option.toggleAttribute(
          'selected',
          option.getAttribute('value') === value
        )
      );
    },
  }
);

// The level chosen last, as the browser keeps it.
const stored = new Map<string, string>();

(globalThis as any).localStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
};

// The worker, by hand: the receiver, and what is sent back.
let receiver: ((message: any) => void) | null = null;

const sent: unknown[] = [],
  transport = {
    receive: (name: string, handler: (message: any) => void) => {
      if (name === 'chooseFromList') {
        receiver = handler;
      }

      return () => {
        receiver = null;
      };
    },
    send: (name: string, data: unknown) => sent.push([name, data]),
  } as unknown as Transport;

let keysCleared = 0;

const debugFlags = new DebugFlags(false),
  dispose = ChoiceHandler.listen(transport, {
    clearKeys: () => keysCleared++,
    debugFlags,
  });

const ask = (
    key: string,
    choices: Array<{ id: string; value: unknown }>,
    data: unknown = null
  ): void => receiver!({ key, choices, data }),
  // The windows open now, the last on top.
  open = (): HTMLElement[] =>
    Array.from(document.querySelectorAll('dialog.window[open]')),
  top = (): HTMLElement => open().pop()!,
  labels = (): string[] =>
    Array.from(top().querySelectorAll('option')).map(
      (option) => option.textContent ?? ''
    ),
  enter = (element: Element): void => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
      })
    );
  },
  // Chooses `value` in the window on top, or the option already selected, as Enter in the list does.
  choose = (value?: string): void => {
    const select = top().querySelector('select') as HTMLSelectElement;

    if (value !== undefined) {
      select.value = value;
    }

    enter(select);
  },
  reset = (): void => {
    sent.length = 0;
    keysCleared = 0;
  };

const civilization = (_: string) => ({ _, __: [_, 'Civilization'] }),
  players = [
    { civilization: civilization('Babylonian') },
    { civilization: civilization('Roman') },
  ],
  terminate = { _: 'Terminate', __: ['Terminate', 'Action', 'Interaction'] },
  resolution = (_: string) => ({
    _,
    __: [_, 'Resolution', 'Interaction'],
    proposal: {
      _: 'DemandTribute',
      __: ['DemandTribute', 'Proposal', 'Interaction'],
      kind: 'gold',
    },
  }),
  negotiation = {
    _: 'Negotiation',
    __: ['Negotiation', 'Interaction'],
    lastInteraction: terminate,
    players,
  };

const run = async (): Promise<void> => {
  await i18next.init(i18nOptions);
  await import('../../translations/local/en');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-difficulty/en');
  await import('../../translations/civ1-diplomacy/en');

  // A step of the talks with one answer.
  ask(
    'negotiation.next-step',
    [{ id: 'choice-1', value: terminate }],
    negotiation
  );

  expect('every list forgets the keys kept for a unit', keysCleared, 1);
  expect(
    'a step of the talks with one answer opens an action window',
    [open().length, top().querySelectorAll('select').length],
    [1, 0]
  );
  expect(
    'titled with who is talking, its button Continue (#751)',
    [
      top().querySelector('header h3')?.textContent,
      top().querySelector('button:not(.close)')?.textContent,
    ],
    ['Negotiation between Babylon and Rome', 'Continue']
  );
  expect('nothing is sent while it is open', sent, []);

  enter(top());

  expect(
    'Enter closes it, which sends the answer on the same channel',
    [open().length, sent],
    [0, [['chooseFromList', 'choice-1']]]
  );

  // A meeting the player starts (#751), as the engine runs one: whoever initiates also greets, and the other side
  //  accepts. The step after the acceptance: the last thing said and the player's one answer, each with who said it,
  //  the player as You.
  {
    const mongols = {
        id: 'Player-1',
        civilization: {
          ...civilization('Mongol'),
          leader: { _: 'GenghisKhan' },
        },
      },
      germans = {
        id: 'Player-2',
        civilization: {
          ...civilization('German'),
          leader: { _: 'FrederickTheGreat' },
        },
      },
      initiate = {
        _: 'Initiate',
        __: ['Initiate', 'Proposal', 'Interaction'],
        by: mongols,
        for: [germans],
      },
      accept = {
        _: 'Accept',
        __: ['Accept', 'Resolution', 'Interaction'],
        by: germans,
        for: [mongols],
        proposal: initiate,
      },
      welcome = (by: typeof mongols, to: typeof mongols) => ({
        _: 'Dialogue',
        __: ['Dialogue', 'Proposal', 'Interaction'],
        key: 'welcome.no-peace',
        by,
        for: [to],
      }),
      lines = (): string[] =>
        Array.from(top().querySelectorAll('.negotiation-line')).map((line) =>
          (line.textContent ?? '').trim()
        );

    reset();
    ask(
      'negotiation.next-step',
      [{ id: 'greet', value: welcome(mongols, germans) }],
      { ...negotiation, lastInteraction: accept, players: [mongols, germans] }
    );

    expect(
      "the body is who said what: the other side's Yes, then the greeting the player is about to give",
      lines(),
      [
        'Frederick the Great: Yes',
        'You: Greetings from Genghis Khan, leader of the powerful Mongols.',
      ]
    );
    expect(
      'and the button is Continue, not the greeting',
      top().querySelector('button:not(.close)')?.textContent,
      'Continue'
    );

    enter(top());

    expect('Continue sends the one answer', sent, [
      ['chooseFromList', 'greet'],
    ]);

    // A meeting a rival starts, the more usual way, the player second (`Talks`): the emissary is the scene, said by
    //  nobody, over the player's Accept or Decline.
    const theirs = {
        ...initiate,
        by: germans,
        for: [mongols],
      },
      resolve = (_: string) => ({
        _,
        __: [_, 'Resolution', 'Interaction'],
        by: mongols,
        for: [germans],
        proposal: theirs,
      });

    reset();
    ask(
      'negotiation.next-step',
      [
        { id: 'accept', value: resolve('Accept') },
        { id: 'decline', value: resolve('Decline') },
      ],
      { ...negotiation, lastInteraction: theirs, players: [germans, mongols] }
    );

    expect("the emissary's arrival is said by nobody", lines(), [
      'An emissary from Germany wishes to speak with you. Will you receive them?',
    ]);

    choose('accept');

    // Their greeting, and the player's one answer to it: OK.
    reset();
    ask(
      'negotiation.next-step',
      [
        {
          id: 'ok',
          value: {
            _: 'Acknowledge',
            __: ['Acknowledge', 'Resolution', 'Interaction'],
            by: mongols,
            for: [germans],
            proposal: welcome(germans, mongols),
          },
        },
      ],
      {
        ...negotiation,
        lastInteraction: welcome(germans, mongols),
        players: [germans, mongols],
      }
    );

    expect(
      'their greeting is said by their leader, and the OK about to be given by You',
      lines(),
      [
        'Frederick the Great: Greetings from Frederick the Great, leader of the powerful Germans.',
        'You: OK',
      ]
    );

    enter(top());

    // What an exchange took is the scene too, over the player's OK.
    const taken = {
      _: 'AdvanceTaken',
      __: ['AdvanceTaken', 'Dialogue', 'Proposal', 'Interaction'],
      key: 'exchange-knowledge.taken',
      by: germans,
      for: [mongols],
      advance: { _: 'BronzeWorking' },
    };

    reset();
    ask(
      'negotiation.next-step',
      [
        {
          id: 'ok',
          value: {
            _: 'Acknowledge',
            __: ['Acknowledge', 'Resolution', 'Interaction'],
            by: mongols,
            for: [germans],
            proposal: taken,
          },
        },
      ],
      { ...negotiation, lastInteraction: taken, players: [germans, mongols] }
    );

    expect(
      'what an exchange took is said by nobody',
      lines().map((line) => line.startsWith('In exchange, the Germans take')),
      [true, false]
    );

    enter(top());

    // The hand-over at peace (#450), the scene again, with Good bye the one answer left.
    reset();
    ask(
      'negotiation.next-step',
      [{ id: 'goodbye', value: { ...terminate, by: mongols } }],
      {
        ...negotiation,
        lastInteraction: {
          _: 'Dialogue',
          __: ['Dialogue', 'Proposal', 'Interaction'],
          key: 'handover',
          by: germans,
          for: [mongols],
        },
        players: [germans, mongols],
      }
    );

    expect('"You respond..." is said by nobody', lines(), [
      'You respond...',
      'You: Good bye!',
    ]);

    enter(top());

    // Answers by two players can't say which is the player's: every line is named, none You. A player sent without
    //  an id isn't taken for the player either.
    reset();
    ask(
      'negotiation.next-step',
      [
        { id: 'goodbye', value: { ...terminate, by: mongols } },
        { id: 'theirs', value: { ...terminate, by: germans } },
      ],
      {
        ...negotiation,
        lastInteraction: welcome(mongols, germans),
        players: [mongols, germans],
      }
    );

    expect('answers by two players: the line is named, not You', lines(), [
      'Genghis Khan: Greetings from Genghis Khan, leader of the powerful Mongols.',
    ]);

    choose('goodbye');

    // As a player with no id would arrive.
    const nameless = { ...mongols, id: undefined } as unknown as typeof mongols;

    reset();
    ask(
      'negotiation.next-step',
      [{ id: 'goodbye', value: { ...terminate, by: nameless } }],
      {
        ...negotiation,
        lastInteraction: welcome(nameless, germans),
        players: [nameless, germans],
      }
    );

    expect('a player without an id is named, not You', lines(), [
      'Genghis Khan: Greetings from Genghis Khan, leader of the powerful Mongols.',
      'Genghis Khan: Good bye!',
    ]);

    enter(top());
  }

  // A step of the talks with several answers: the player's own, labelled as theirs.
  reset();
  ask(
    'negotiation.next-step',
    [
      { id: 'accept', value: resolution('Accept') },
      { id: 'decline', value: resolution('Decline') },
    ],
    negotiation
  );

  expect(
    "a step with several answers is a list of the player's own",
    [keysCleared, labels()],
    [1, ['Pay the tribute.', 'We will not pay.']]
  );

  choose('decline');

  expect(
    'and sends the one chosen',
    [open().length, sent],
    [0, [['chooseFromList', 'decline']]]
  );

  // After a hand-over the engine offers the demand first: Good bye is listed first, so Enter leaves the talks (#502).
  reset();
  ask(
    'negotiation.next-step',
    [
      {
        id: 'demand',
        value: {
          _: 'DemandTribute',
          __: ['DemandTribute', 'Proposal', 'Interaction'],
          kind: 'gold',
        },
      },
      { id: 'goodbye', value: terminate },
    ],
    negotiation
  );

  expect('Good bye is listed before the demand', labels(), [
    'Good bye!',
    'Demand tribute.',
  ]);

  choose();

  expect(
    'and Enter with nothing moved sends it',
    [open().length, sent],
    [0, [['chooseFromList', 'goodbye']]]
  );

  // Any other list, Random among the civilizations.
  reset();

  const civilizations = ['Babylonian', 'Roman', 'Zulu'].map((name) => ({
      id: `civilization-${name}`,
      value: civilization(name),
    })),
    random = Math.random;

  ask('choose-civilization', civilizations);

  expect('Random is offered first among the civilizations', labels(), [
    'Random',
    'Babylonian',
    'Roman',
    'Zulu',
  ]);

  Math.random = () => 0.99;
  choose('@random');
  Math.random = random;

  expect('and is answered with one of those offered, not with Random', sent, [
    ['chooseFromList', 'civilization-Zulu'],
  ]);

  reset();
  ask('choose-civilization', civilizations);
  choose('civilization-Roman');

  expect('a civilization chosen is sent as itself', sent, [
    ['chooseFromList', 'civilization-Roman'],
  ]);

  reset();
  ask('choose-leader', [
    { id: 'leader-1', value: { _: 'Hammurabi' } },
    { id: 'leader-2', value: { _: 'Nebuchadnezzar' } },
  ]);

  expect(
    'Random is for the civilizations alone',
    labels().includes('Random'),
    false
  );

  choose('leader-2');

  // A save from before there were difficulty levels, the levels sent easiest first.
  reset();
  stored.set('civ.difficulty', 'King');

  const levels = ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor'].map(
    (name) => ({ id: `level-${name}`, value: { _: name } })
  );

  ask('choose-difficulty', levels);

  expect('the difficulty levels are labelled, easiest first', labels(), [
    'Chieftain (easiest)',
    'Warlord',
    'Prince',
    'King',
    'Emperor (toughest)',
  ]);
  expect(
    'the one chosen last is preselected',
    (top().querySelector('select') as HTMLSelectElement).value,
    'level-King'
  );

  choose('level-Warlord');

  expect(
    'the one chosen is sent, and remembered for the next',
    [sent, stored.get('civ.difficulty')],
    [[['chooseFromList', 'level-Warlord']], 'Warlord']
  );

  // The stress runner, with its windows off: what it is automating is answered at once.
  reset();

  const handed: string[] = [],
    automating = new Set(['automated-1']);

  debugFlags.uiStressRunner = {
    automateChoice: (_window, choiceId, onChoose) => {
      handed.push(choiceId);
      onChoose(choiceId);
    },
    isAutomatingChoice: (choiceId: string) => automating.has(choiceId),
  } as StressRunnerHandle;
  debugFlags.stressUiWindowsEnabled = false;

  ask('choose-leader', [
    { id: 'automated-1', value: { _: 'Hammurabi' } },
    { id: 'automated-2', value: { _: 'Nebuchadnezzar' } },
  ]);

  expect(
    'with its windows off, a choice the stress runner automates is answered at once, with no window',
    [keysCleared, open().length, handed, sent],
    [1, 0, [], [['chooseFromList', 'automated-1']]]
  );

  // With them on, it is handed each window, the first choice selected.
  reset();
  debugFlags.stressUiWindowsEnabled = true;

  ask('choose-leader', [
    { id: 'automated-1', value: { _: 'Hammurabi' } },
    { id: 'automated-2', value: { _: 'Nebuchadnezzar' } },
  ]);

  expect(
    'with them on, it is handed the list, the first choice selected',
    [open().length, handed, sent],
    [1, ['automated-1'], [['chooseFromList', 'automated-1']]]
  );

  open().forEach((window) => window.remove());
  reset();
  ask(
    'negotiation.next-step',
    [{ id: 'choice-2', value: terminate }],
    negotiation
  );

  expect(
    'and a step of the talks with one answer',
    [handed, sent],
    [['automated-1', 'choice-2'], [['chooseFromList', 'choice-2']]]
  );

  debugFlags.uiStressRunner = null;
  open().forEach((window) => window.remove());

  dispose();

  expect('the disposer stops listening', receiver, null);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL choiceHandler: ${
        failures.length
      } of ${checks} checks\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS choiceHandler: ${checks} checks\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL choiceHandler: ${error.stack ?? error}\n`);
  process.exit(1);
});
