// The meeting window under the new interface (#752), through `ChoiceHandler.listen` as the page registers it, with the
//  real window under linkedom: the strip names who the player is meeting and fills in what they know of them once the
//  intelligence answers; the talks so far are a conversation, each line said by its speaker, the scene by nobody;
//  the replies are buttons in the engine's order, numbered, the first the default (#674), with Escape for Good bye.
//  A greeting, a demand for tribute, an exchange of advances and a peace offer each read as they should, and a step
//  with one reply is the same window with one button (#751).

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';

import ChoiceHandler from '@civ-clone/ui-game/app/ChoiceHandler';
import DebugFlags, {
  StressRunnerHandle,
} from '@civ-clone/ui-client/debug/DebugFlags';
import { IntelligenceRow } from '@civ-clone/ui-protocol/reports';
import Transport from '@civ-clone/ui-client/Transport';
import { PendingMeeting } from '@civ-clone/ui-hud/components/turnControls';
import { applyInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

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
      `FAIL meetingWindow: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

const civilization = (_: string, leader: string) => ({
    _,
    __: [_, 'Civilization'],
    leader: { _: leader },
  }),
  // The player, and the rival who came to talk: first in the negotiation, as `Talks` makes it.
  mongols = {
    id: 'Player-1',
    civilization: civilization('Mongol', 'GenghisKhan'),
  },
  germans = {
    id: 'Player-2',
    civilization: civilization('German', 'FrederickTheGreat'),
  },
  rows: IntelligenceRow[] = [
    {
      civilization: 'German',
      colors: ['#ff0000', '#ffffff'],
      leader: 'FrederickTheGreat',
      atPeace: false,
      theirEmbassy: false,
      firstMet: -3000,
      details: {
        traits: [],
        capital: null,
        government: 'Monarchy',
        gold: 250,
        cities: 4,
        units: 9,
        foreignAffairs: [],
        advances: [],
      },
    },
  ];

// The worker, by hand: the receiver, the intelligence asked for, and what is sent back.
let receiver: ((message: any) => void) | null = null,
  intelligence: Promise<IntelligenceRow[]> = Promise.resolve(rows);

const sent: unknown[] = [],
  requests: string[] = [],
  transport = {
    receive: (name: string, handler: (message: any) => void) => {
      if (name === 'chooseFromList') {
        receiver = handler;
      }

      return () => {
        receiver = null;
      };
    },
    request: (request: { channel(): string }) => {
      requests.push(request.channel());

      return intelligence;
    },
    send: (name: string, data: unknown) => sent.push([name, data]),
  } as unknown as Transport;

const debugFlags = new DebugFlags(false);
// What the Next Turn button is told of the talks waiting on an answer (#702).
const meetings: (PendingMeeting | null)[] = [];

const dispose = ChoiceHandler.listen(transport, {
  clearKeys: () => {},
  debugFlags,
  meeting: (meeting) => meetings.push(meeting),
});

const action = (_: string, kinds: string[], fields: object) => ({
    _,
    __: [_, ...kinds, 'Interaction'],
    ...fields,
  }),
  initiate = action('Initiate', ['Proposal'], { by: germans, for: [mongols] }),
  // The player's answer to `proposal`.
  answer = (_: string, proposal: object) =>
    action(_, ['Resolution'], { by: mongols, for: [germans], proposal }),
  said = (key: string) =>
    action('Dialogue', ['Proposal'], { key, by: germans, for: [mongols] }),
  terminate = action('Terminate', ['Action'], { by: mongols, for: [germans] }),
  demandTribute = (by: object, tribute: object, kind: string) =>
    action('DemandTribute', ['Proposal'], {
      by,
      for: [by === germans ? mongols : germans],
      kind,
      tribute,
    }),
  // A step of the talks: the talks so far, the last of them the one answered, and the replies in the engine's order.
  step = (interactions: object[], replies: [string, object][]): void =>
    receiver!({
      key: 'negotiation.next-step',
      choices: replies.map(([id, value]) => ({ id, value })),
      data: {
        _: 'Negotiation',
        __: ['Negotiation', 'Interaction'],
        interactions,
        lastInteraction: interactions[interactions.length - 1],
        players: [germans, mongols],
      },
    }),
  open = (): HTMLElement[] =>
    Array.from(document.querySelectorAll('dialog.window[open]')),
  top = (): HTMLElement => open().pop()!,
  text = (element: Element | null): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  // Each line as `speaker: text`, the scene as `(text)`.
  conversation = (): string[] =>
    Array.from(
      top().querySelectorAll(
        '.ui-meeting-conversation > .ui-meeting-speech, .ui-meeting-conversation > .ui-meeting-narration'
      )
    ).map((line) =>
      line.classList.contains('ui-meeting-narration')
        ? `(${text(line)})`
        : `${text(line.querySelector('figcaption'))}: ${text(
            line.querySelector('blockquote')
          )}`
    ),
  replies = (): string[] =>
    Array.from(top().querySelectorAll('.ui-meeting-reply')).map((reply) =>
      text(reply)
    ),
  key = (name: string, target: Element = top()): void => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: name,
      })
    );
  },
  settle = () => new Promise((resolve) => setTimeout(resolve, 0)),
  reset = (): void => {
    sent.length = 0;
    open().forEach((window) => window.remove());
  };

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-diplomacy/en');
  await import('../../translations/civ1-government/en');
  await import('../../translations/civ1-science/en');

  applyInterface('modern', null);

  // The emissary arrives: the scene, and the player's Yes or No.
  step(
    [initiate],
    [
      ['accept', answer('Accept', initiate)],
      ['decline', answer('Decline', initiate)],
    ]
  );

  const window = top();

  expect(
    'the meeting window, titled with the leader met, under the Diplomacy eyebrow',
    [
      window.classList.contains('ui-meeting-window'),
      text(window.querySelector('header h3')),
      text(window.querySelector('.ui-window-eyebrow')),
    ],
    [true, 'Meeting with Frederick the Great', 'Diplomacy']
  );
  expect(
    'the strip names them at once',
    [
      text(window.querySelector('.ui-meeting-leader')),
      text(window.querySelector('.ui-meeting-nation')),
    ],
    ['Frederick the Great', 'Germans']
  );
  expect(
    'the Next Turn button is told the talks wait on an answer',
    meetings.map((meeting) => meeting?.leader ?? null),
    ['Frederick the Great']
  );
  expect('and asks for what the player knows of them', requests, [
    'intelligence',
  ]);

  await settle();

  expect(
    'which fills it in: their colours, and peace or war, when they met, and from an embassy their government, cities and gold',
    [
      (
        window.querySelector('.ui-meeting-swatch') as HTMLElement
      ).style.getPropertyValue('--owner-primary'),
      Array.from(window.querySelectorAll('.ui-meeting-fact')).map(
        (fact) =>
          `${text(fact.querySelector('dt'))}=${text(fact.querySelector('dd'))}`
      ),
      window.querySelector('.ui-meeting-fact dd')?.getAttribute('data-tone'),
    ],
    [
      '#ff0000',
      [
        'Relations=War',
        'First met=3000 BCE',
        'Government=Monarchy',
        'Cities=4',
        'Treasury=250 gold',
      ],
      'negative',
    ]
  );
  expect('the arrival is the scene, said by nobody', conversation(), [
    '(An emissary from Germany wishes to speak with you. Will you receive them?)',
  ]);
  expect(
    'the replies numbered, in the engine order, the first the default',
    [
      replies(),
      Array.from(window.querySelectorAll('.ui-meeting-reply')).map(
        (reply) =>
          reply.className
            .split(' ')
            .filter((name) => name.startsWith('btn-'))[0]
      ),
    ],
    [
      ['1Yes', '2No'],
      ['btn-primary', 'btn-secondary'],
    ]
  );

  key('Escape');

  expect(
    'Escape does nothing where leaving is no reply',
    [open().length, sent],
    [1, []]
  );

  key('Enter');

  expect(
    'Enter takes the default and closes the window',
    [open().length, sent],
    [0, [['chooseFromList', 'accept']]]
  );

  // Their greeting, said by their leader; the player's OK the one reply, the same window with one button (#751).
  const greeting = said('welcome.no-peace'),
    greeted = [initiate, answer('Accept', initiate), greeting];

  reset();
  step(greeted, [['ok', answer('Acknowledge', greeting)]]);

  expect('the talks so far stay in view, the player as You', conversation(), [
    '(An emissary from Germany wishes to speak with you. Will you receive them?)',
    'You: Yes',
    'Frederick the Great: Greetings from Frederick the Great, leader of the powerful Germans.',
  ]);
  expect(
    'the line being answered is the latest',
    top().querySelector('.ui-meeting-latest figcaption')?.textContent,
    'Frederick the Great'
  );
  expect('one reply, one button', replies(), ['1OK']);

  key('1');

  expect('its number takes it', sent, [['chooseFromList', 'ok']]);
  expect('and that they no longer do once answered', meetings.slice(-1), [
    null,
  ]);

  // A demand for tribute: the refusal first, as the engine offers it (#674).
  const demand = demandTribute(germans, { _: 'Gold', value: 100 }, 'gold'),
    demanded = [...greeted, answer('Acknowledge', greeting), demand];

  reset();
  step(demanded, [
    ['refuse', answer('Decline', demand)],
    ['pay', answer('Accept', demand)],
  ]);

  expect(
    'a demand reads as said, and the replies in the engine order',
    [conversation().pop(), replies()],
    [
      'Frederick the Great: Our armies grow restless. A tribute of 100 Gold would keep them at home.',
      ['1We will not pay.', '2Pay the tribute.'],
    ]
  );

  key('Enter');

  expect('Enter refuses: the default is the first', sent, [
    ['chooseFromList', 'refuse'],
  ]);

  // An exchange of advances.
  const exchange = action('ExchangeKnowledge', ['Proposal'], {
    by: germans,
    for: [mongols],
    advances: [{ _: 'BronzeWorking' }],
  });

  reset();
  step(
    [...greeted, answer('Acknowledge', greeting), exchange],
    [
      ['no', answer('Decline', exchange)],
      ['yes', answer('Accept', exchange)],
    ]
  );

  expect(
    'an exchange reads as said, the refusal first',
    [conversation().pop(), replies()],
    [
      'Frederick the Great: We notice that your primitive civilization has not even discovered Bronze Working. Do you care to exchange knowledge with us?',
      ['1No, we do not need Bronze Working.', "2OK, let's exchange knowledge."],
    ]
  );

  key('2');

  expect('2 takes the second', sent, [['chooseFromList', 'yes']]);

  // A peace offer: accepting first.
  const peace = action('OfferPeace', ['Proposal'], {
    by: germans,
    for: [mongols],
  });

  reset();
  step(
    [...greeted, answer('Acknowledge', greeting), peace],
    [
      ['accept', answer('Accept', peace)],
      ['reject', answer('Decline', peace)],
    ]
  );

  expect(
    'a peace offer reads as said, accepting first',
    [conversation().pop(), replies()],
    [
      'Frederick the Great: You may be worthy to make peace with us. We have prepared a treaty for your signature.',
      ['1Accept', '2Reject'],
    ]
  );

  key('Enter');

  expect('Enter accepts', sent, [['chooseFromList', 'accept']]);

  // The hand-over at peace: Good bye first, as the engine offers it, then a demand of the player's own. Escape says
  //  Good bye.
  const handover = said('handover');

  reset();
  step(
    [...greeted, answer('Acknowledge', greeting), handover],
    [
      ['goodbye', terminate],
      ['demand', demandTribute(mongols, { _: 'Gold', value: 50 }, 'gold')],
    ]
  );

  expect(
    'the hand-over is the scene, Good bye first and Escape its key',
    [
      conversation().pop(),
      replies(),
      (top().querySelector('.ui-meeting-reply') as HTMLElement).dataset.hotkey,
      top()
        .querySelector('.ui-meeting-reply')
        ?.getAttribute('aria-keyshortcuts'),
    ],
    ['(You respond...)', ['1Good bye!', '2Demand tribute.'], 'Esc', '1 Escape']
  );

  key('Escape');

  expect(
    'Escape leaves',
    [open().length, sent],
    [0, [['chooseFromList', 'goodbye']]]
  );

  // Enter on a reply is that reply's own, as the browser clicks it: not the default as well.
  reset();
  step(demanded, [
    ['refuse', answer('Decline', demand)],
    ['pay', answer('Accept', demand)],
  ]);

  key('Enter', top().querySelectorAll('.ui-meeting-reply')[1]);

  expect('Enter on another reply leaves the default to it', sent, []);

  const [refuse, pay] = Array.from(
    top().querySelectorAll('.ui-meeting-reply')
  ) as HTMLButtonElement[];

  pay.click();
  refuse.click();

  expect('a click sends that reply, and only once', sent, [
    ['chooseFromList', 'pay'],
  ]);

  // A key held down answers one step, not the next one too: Escape included, where Good bye is offered.
  reset();
  step(demanded, [
    ['refuse', answer('Decline', demand)],
    ['goodbye', terminate],
  ]);

  for (const name of ['Enter', '2', 'Escape']) {
    const held = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: name,
    });

    // linkedom's events don't take `repeat` from their options.
    Object.defineProperty(held, 'repeat', { value: true });
    top().dispatchEvent(held);
  }

  expect(
    'a held key repeating chooses nothing',
    [open().length, sent],
    [1, []]
  );

  // With the `?debug=1` stress runner on, it answers: a reply chosen meanwhile doesn't send a second answer.
  const handed: string[] = [];

  debugFlags.uiStressRunner = {
    automateChoice: (
      _window: { close(): void },
      choiceId: string,
      onChoose: (choiceId: string) => void
    ) => {
      handed.push(choiceId);
      onChoose(choiceId);
    },
    isAutomatingChoice: () => false,
  } as unknown as StressRunnerHandle;
  debugFlags.stressUiWindowsEnabled = true;

  reset();
  step(demanded, [
    ['refuse', answer('Decline', demand)],
    ['pay', answer('Accept', demand)],
  ]);
  key('2');

  expect(
    'the stress runner sends the one answer, the engine first',
    [handed, sent],
    [['refuse'], [['chooseFromList', 'refuse']]]
  );

  debugFlags.uiStressRunner = null;

  // Intelligence that isn't answered leaves the strip with the names alone, and the talks go on.
  const { RequestFailed } = await import(
    '@civ-clone/core-data-client/AbstractTransport'
  );

  intelligence = Promise.reject(
    new RequestFailed('intelligence', 'not answered')
  );
  reset();
  step([initiate], [['accept', answer('Accept', initiate)]]);
  await settle();

  expect(
    'no intelligence: the names alone',
    [
      text(top().querySelector('.ui-meeting-leader')),
      top().querySelectorAll('.ui-meeting-fact').length,
      open().length,
    ],
    ['Frederick the Great', 0, 1]
  );

  // Two talks waiting at once: answering one leaves the other on the Next Turn button (#702).
  top().querySelector<HTMLButtonElement>('.ui-meeting-reply')!.click();
  reset();

  // Earlier windows here were taken out of the page unanswered: what the button had before these two.
  const before = meetings[meetings.length - 1] ?? null;

  intelligence = Promise.resolve(rows);
  step([initiate], [['first', answer('Accept', initiate)]]);

  const first = top();

  step([initiate], [['second', answer('Accept', initiate)]]);
  top().querySelector<HTMLButtonElement>('.ui-meeting-reply')!.click();

  expect(
    'answering one of two talks leaves the other waiting',
    [sent, meetings[meetings.length - 1]?.leader ?? null],
    [[['chooseFromList', 'second']], 'Frederick the Great']
  );

  first.querySelector<HTMLButtonElement>('.ui-meeting-reply')!.click();

  expect(
    'and answering both leaves none',
    [sent.length, meetings[meetings.length - 1] ?? null],
    [2, before]
  );

  reset();
  dispose();

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL meetingWindow: ${
        failures.length
      } of ${checks} checks\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS meetingWindow: ${checks} checks\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL meetingWindow: ${error.stack ?? error}\n`);
  process.exit(1);
});
