// The lists on the choice window under the new interface (#745), past the build list: research, with each advance's
//  cost in bulbs and turns, named in the primary and described from the Civilopedia; government; the lists the engine
//  asks (`chooseFromList`), each primary saying what choosing does, Random first among the civilizations (#15), the
//  difficulty preselected (#173), and nothing to cancel; and New Game's questions, over everything, Cancel backing
//  out, the last one starting the game. The steps of the talks stay the classic list for now, and the classic interface keeps its
//  lists, the research labels with their turns.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import ChoiceHandler from '../../src/js/UI/app/ChoiceHandler';
import ChooseGovernment from '../../src/js/UI/components/Actions/ChooseGovernment';
import ChooseResearch from '../../src/js/UI/components/Actions/ChooseResearch';
import { CivilopediaEntry } from '../../src/js/Engine/lib/civilopedia';
import DebugFlags from '../../src/js/UI/debug/DebugFlags';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';
import { askNewGame } from '../../src/js/UI/components/newGame';
import { assetStore } from '../../src/js/UI/AssetStore';
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
    process.stderr.write(`FAIL choice-lists: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// No tileset here: the icons are drawn from nothing.
(assetStore as any).spriteURL = () => Promise.resolve('data:,');
(assetStore as any).shownAtURL = () => Promise.resolve('data:,');

// The level chosen last, as the browser keeps it.
(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const top = (): HTMLElement =>
    Array.from(
      document.querySelectorAll<HTMLElement>('dialog.window[open]')
    ).pop()!,
  names = (): string[] =>
    Array.from(top().querySelectorAll('.ui-choice-name')).map(
      (name) => name.textContent ?? ''
    ),
  facts = (): string[][] =>
    Array.from(top().querySelectorAll('.ui-choice-row')).map((row) =>
      Array.from(row.querySelectorAll('.ui-choice-fact')).map(
        (fact) => fact.textContent ?? ''
      )
    ),
  chosen = (): string | null =>
    top().querySelector('.ui-choice-row[aria-selected="true"] .ui-choice-name')
      ?.textContent ?? null,
  primary = (): HTMLButtonElement =>
    top().querySelector('.btn-primary') as HTMLButtonElement,
  footer = (): string[] =>
    Array.from(top().querySelectorAll('.ui-window-footer button')).map(
      (button) => button.textContent ?? ''
    ),
  eyebrow = (): string | null =>
    top().querySelector('.ui-window-eyebrow')?.textContent ?? null,
  key = (key: string): void => {
    top()
      .querySelector('.ui-choice-list')!
      .dispatchEvent(
        new (globalThis as any).KeyboardEvent('keydown', {
          key,
          bubbles: true,
        })
      );
  };

const entries: CivilopediaEntry[] = [
    {
      key: 'Alphabet',
      name: 'Alphabet',
      kind: 'advance',
      requires: [],
      leadsTo: [],
      cost: null,
      stats: null,
    },
    {
      key: 'Monarchy',
      name: 'Monarchy',
      kind: 'government',
      requires: [],
      leadsTo: [],
      cost: null,
      stats: null,
    },
  ],
  sent: unknown[] = [],
  transport = {
    receive: (name: string, handler: (message: any) => void) => {
      if (name === 'chooseFromList') {
        receiver = handler;
      }

      return () => {
        receiver = null;
      };
    },
    send: (channel: string, data: unknown) => sent.push([channel, data]),
    request: async (request: { channel(): string }) => {
      const channel = request.channel();

      if (channel === 'getCivilopedia') {
        return entries;
      }

      if (channel === 'getRequirements') {
        return [];
      }

      if (channel === 'difficulties') {
        return ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor'].map(
          (name, level) => ({ name, level })
        );
      }

      if (channel === 'setOptions') {
        options.push((request as any).args()[0]);

        return {};
      }

      throw new Error(`unexpected request ${channel}`);
    },
  } as any;

let receiver: ((message: any) => void) | null = null;

const options: unknown[] = [];

const research = {
    _: 'PlayerResearch',
    id: 'research-1',
    available: [{ _: 'Alphabet' }, { _: 'BronzeWorking' }],
    complete: [],
    cost: { _: 'Research', value: 0 },
    costs: { Alphabet: 40, BronzeWorking: 1000 },
    progress: { _: 'Research', value: 0 },
    researching: null,
  },
  player = {
    cities: [
      { yields: [{ _: 'Research', __: ['Research', 'Yield'], value: 10 }] },
    ],
  },
  government = {
    _: 'PlayerGovernment',
    id: 'government-1',
    anarchyTurns: null,
    available: [{ _: 'Despotism' }, { _: 'Monarchy' }],
    current: { _: 'Anarchy' },
  },
  action = (name: string, value: unknown) =>
    ({ _: name, id: `${name}-action`, value } as any);

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-difficulty/en');
  await import('../../translations/civ1-diplomacy/en');

  applyInterface('new', null);

  // Research.
  new ChooseResearch(
    action('ChooseResearch', research),
    transport,
    player as any
  ).activate();

  expect(
    'research: each advance with its cost in bulbs and its turns',
    [names(), facts()],
    [
      ['Alphabet', 'BronzeWorking'],
      [
        ['Cost in bulbs: 40', 'Turns: 4 turns'],
        ['Cost in bulbs: 1,000', 'Turns: 100 turns'],
      ],
    ]
  );
  expect(
    'research: the cost beside the bulb, the eyebrow, and the primary naming the advance',
    [
      top().querySelector('.ui-choice-fact')?.firstElementChild?.className,
      eyebrow(),
      chosen(),
      primary().textContent,
    ],
    ['yield-icon', 'Science', 'Alphabet', 'Research Alphabet']
  );

  await settle();
  await settle();

  expect(
    "research: the pane shows the advance's Civilopedia entry",
    top().querySelector('.ui-choice-details .entry-name')?.textContent,
    'Alphabet'
  );

  key('ArrowDown');
  key('Enter');

  expect('research: choosing sends the advance', sent, [
    [
      'action',
      { name: 'ChooseResearch', id: 'research-1', chosen: 'BronzeWorking' },
    ],
  ]);

  sent.length = 0;

  // Government.
  new ChooseGovernment(
    action('ChooseGovernment', government),
    transport
  ).activate();

  expect(
    'government: its intro, eyebrow and named primary',
    [
      names(),
      top().querySelector('.ui-choice > p')?.textContent,
      eyebrow(),
      primary().textContent,
    ],
    [
      ['Despotism', 'Monarchy'],
      'Your revolution is over. Which government would you like?',
      'Government',
      'Adopt Despotism',
    ]
  );

  key('ArrowDown');
  primary().click();

  expect('government: choosing sends it', sent, [
    [
      'action',
      { name: 'ChooseGovernment', id: 'government-1', chosen: 'Monarchy' },
    ],
  ]);

  sent.length = 0;

  // The engine's lists.
  const debugFlags = new DebugFlags(false),
    dispose = ChoiceHandler.listen(transport, {
      clearKeys: () => {},
      debugFlags,
    }),
    ask = (key: string, choices: unknown[], data: unknown = null) =>
      receiver!({ key, choices, data });

  ask(
    'choose-civilization',
    ['Babylonian', 'Roman'].map((name) => ({
      id: `civilization-${name}`,
      value: { _: name },
    }))
  );

  expect(
    'civilizations: Random first, and nothing to cancel',
    [names(), footer()],
    [['Random', 'Babylonian', 'Roman'], ['Play as a random civilization']]
  );

  key('End');

  expect(
    'civilizations: the primary says who you play as',
    primary().textContent,
    'Play as the Romans'
  );

  key('Enter');

  expect('civilizations: the one chosen is sent', sent, [
    ['chooseFromList', 'civilization-Roman'],
  ]);

  sent.length = 0;

  ask(
    'choose-difficulty',
    ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor'].map((name) => ({
      id: `difficulty-${name}`,
      value: { _: name },
    }))
  );

  expect(
    'difficulty: Prince preselected, and the primary says so',
    [chosen(), primary().textContent],
    ['Prince', 'Play at Prince level']
  );

  key('Enter');

  expect('difficulty: the level chosen is sent', sent, [
    ['chooseFromList', 'difficulty-Prince'],
  ]);

  sent.length = 0;

  ask(
    'capture-city.steal-advance',
    ['Alphabet', 'Pottery'].map((name) => ({
      id: `advance-${name}`,
      value: { _: name },
    })),
    { name: 'Rome', originalPlayer: { civilization: { _: 'Roman' } } }
  );

  await settle();
  await settle();

  expect(
    'an advance to take: named in the primary, described in the pane',
    [
      primary().textContent,
      top().querySelector('.ui-choice-details .entry-name')?.textContent,
    ],
    ['Acquire Alphabet', 'Alphabet']
  );

  key('Enter');
  sent.length = 0;

  // The talks stay the classic list.
  const civilization = (_: string) => ({ _, __: [_, 'Civilization'] }),
    resolution = (_: string) => ({
      _,
      __: [_, 'Resolution', 'Interaction'],
      proposal: {
        _: 'DemandTribute',
        __: ['DemandTribute', 'Proposal', 'Interaction'],
        kind: 'gold',
      },
    });

  ask(
    'negotiation.next-step',
    [
      { id: 'accept', value: resolution('Accept') },
      { id: 'decline', value: resolution('Decline') },
    ],
    {
      _: 'Negotiation',
      __: ['Negotiation', 'Interaction'],
      lastInteraction: {
        _: 'Terminate',
        __: ['Terminate', 'Action', 'Interaction'],
      },
      players: [
        { civilization: civilization('Babylonian') },
        { civilization: civilization('Roman') },
      ],
    }
  );

  expect(
    'the steps of the talks are still the classic list',
    [
      Boolean(top().querySelector('select')),
      Boolean(top().querySelector('.ui-choice')),
    ],
    [true, false]
  );

  top()
    .querySelector('select')!
    .dispatchEvent(
      new (globalThis as any).KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      })
    );
  sent.length = 0;

  // New Game's questions: over everything else, Cancel backing out, and the last one starts the game.
  askNewGame(transport, () => {});
  await settle();

  const sizes = top();

  (
    Array.from(sizes.querySelectorAll('.ui-window-footer button')).find(
      (button) => button.textContent === 'Cancel'
    ) as HTMLButtonElement
  ).click();
  await settle();

  expect(
    'new game: Cancel backs out, asking nothing more',
    [sizes.hasAttribute('open'), options.length, sent],
    [false, 0, []]
  );

  askNewGame(transport, () => {});
  await settle();

  expect(
    'new game: the world sizes, Normal chosen, over everything, and Cancel backs out',
    [
      top().querySelector('header h3, .ui-window-title')?.textContent,
      chosen(),
      top().classList.contains('modal'),
      footer(),
    ],
    ['How big a world?', 'Normal (80 × 50)', true, ['Cancel', 'Choose']]
  );

  key('Enter');
  await settle();
  await settle();

  expect(
    'new game: then the difficulty, Prince chosen, saying so',
    [chosen(), primary().textContent],
    ['Prince', 'Play at Prince level']
  );

  key('Enter');
  await settle();

  expect(
    'new game: then the players, the primary starting the game',
    primary().textContent,
    `Start with ${chosen()}`
  );

  key('Enter');
  await settle();
  await settle();

  expect(
    'new game: the answers sent, then the game started',
    [options.length, (options[0] as any)?.difficulty, sent],
    [1, 'Prince', [['start', null]]]
  );

  sent.length = 0;

  // The classic interface: the classic list, with the turns in the label.
  applyInterface('classic', null);

  new ChooseResearch(
    action('ChooseResearch', research),
    transport,
    player as any
  ).activate();

  expect(
    'classic research: the old list, each advance with its turns',
    Array.from(top().querySelectorAll('option')).map(
      (option) => option.textContent
    ),
    ['Alphabet (4 turns)', 'BronzeWorking (100 turns)']
  );

  dispose();

  await settle();

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL choice-lists (${failures.length} of ${checks})\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS choice-lists (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL choice-lists: ${error?.stack ?? error}\n`);
  process.exit(1);
});
