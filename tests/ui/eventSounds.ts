// The game's moments as Civ1's tunes (packages/audio/eventSounds.ts, #126): each notice as its tune, from the player's
// civilization, the rival's or none, with the main theme or nothing for a civilization without a national theme; the
// battles' tunes, won and lost; the talks' themes, the rival's, short as their emissary arrives and long at the table, faded as the player leaves or
// once no step follows; the new game's theme over the welcome; notices added together heard as one; and the ending.

import EventSounds, {
  battleTune,
  gameOverTune,
  longTheme,
  loudest,
  nationalTheme,
  notificationTune,
  rivalOf,
  rivalStarted,
  shortTheme,
  tunes,
} from '@civ-clone/ui-audio/eventSounds';
import {
  Civilization,
  Negotiation,
  Player,
} from '@civ-clone/ui-protocol/types';

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
    process.stderr.write(`FAIL event-sounds: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// Civilizations and players as the page receives them: the theme is an attribute, as `civ1-civilization` registers it.
const civilization = (
  name: string,
  theme: { long: number; short: number } | null
): Civilization =>
  ({
    _: name,
    __: [name, 'Civilization'],
    id: name,
    attributes:
      theme === null
        ? [{ name: 'other', value: 1 }]
        : [{ name: 'nationalTheme', value: theme }],
  } as unknown as Civilization);

const player = (id: string, civ: Civilization): Player =>
  ({ _: 'Player', __: ['Player'], id, civilization: civ } as unknown as Player);

const roman = civilization('Roman', { long: 10, short: 24 }),
  german = civilization('German', { long: 18, short: 32 }),
  barbarian = civilization('Barbarian', null),
  us = player('p1', roman),
  them = player('p2', german),
  barbarians = player('p3', barbarian);

const interaction = (type: string, by: Player | null, extra = {}): any => ({
  _: type,
  __: [type, 'Interaction'],
  id: `${type}-${Math.random()}`,
  by,
  ...extra,
});

const negotiation = (
  id: string,
  players: Player[],
  interactions: any[]
): Negotiation =>
  ({
    _: 'Negotiation',
    __: ['Negotiation', 'Interaction'],
    id,
    players,
    interactions,
    lastInteraction: interactions[interactions.length - 1],
    terminated: false,
  } as unknown as Negotiation);

// A stand-in for the music: what was asked of it, in order.
const jukebox = () => {
  const calls: (string | number)[][] = [];

  return {
    calls,
    play(id: number, level = 3, { once = false } = {}) {
      calls.push(once ? ['once', id] : ['play', id]);
    },
    stop() {
      calls.push(['stop']);
    },
  };
};

// Timers run by hand.
const timers = () => {
  const pending = new Map<number, () => void>();
  let next = 0;

  return {
    setTimeout: (callback: () => void): number => {
      pending.set(++next, callback);

      return next;
    },
    clearTimeout: (handle: number): void => void pending.delete(handle),
    run: (): void => {
      const callbacks = Array.from(pending.values());

      pending.clear();
      callbacks.forEach((callback) => callback());
    },
    get size(): number {
      return pending.size;
    },
  };
};

const sounds = () => {
  const box = jukebox(),
    clock = timers(),
    time = { now: 0 },
    eventSounds = new EventSounds({
      jukebox: box,
      now: () => time.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });

  eventSounds.attach(() => us);

  return { box, clock, time, eventSounds };
};

const tune = (key: string, data: any = {}, to: Player | null = us) =>
  notificationTune({ key, data }, to);

// The themes, and the fallbacks for a civilization without one.
expect('a national theme, from the attribute', nationalTheme(roman), {
  long: 10,
  short: 24,
});
expect(
  'no theme: none, for no civilization, or one without attributes',
  [
    nationalTheme(barbarian),
    nationalTheme(null),
    nationalTheme({ _: 'X' } as unknown as Civilization),
  ],
  [null, null, null]
);
expect(
  'a long moment without a theme plays the main theme; a short one nothing',
  [
    longTheme(roman),
    longTheme(barbarian),
    shortTheme(german),
    shortTheme(barbarian),
  ],
  [10, tunes.mainTheme, 32, null]
);

// Each notice as its tune.
expect(
  'ours: a capture, a Wonder, an advance play our short theme',
  [
    tune('City.captured-by-us'),
    tune('City.building-complete.wonder', { build: { _: 'Pyramids' } }),
    tune('Player.research-complete'),
  ],
  [24, 24, 24]
);
expect(
  'a city lost plays the capturer’s short theme, or nothing for one without',
  [
    tune('City.captured-from-us', { capturingPlayer: them }),
    tune('City.captured-from-us', { capturingPlayer: barbarians }),
  ],
  [32, null]
);
expect(
  'a rival’s Wonder: their short theme with the city known, nothing without',
  [
    tune('Wonder.building-complete.other-player.known', {
      city: { player: them },
      build: { _: 'Colossus' },
    }),
    tune('Wonder.building-complete.other-player.unknown', {
      build: { _: 'Colossus' },
    }),
  ],
  [32, null]
);
expect(
  'Manhattan Project, by anyone, is the disaster tune',
  [
    tune('City.building-complete.wonder', { build: { _: 'ManhattanProject' } }),
    tune('Wonder.building-complete.other-player.known', {
      city: { player: them },
      build: { _: 'ManhattanProject' },
    }),
    tune('Wonder.building-complete.other-player.unknown', {
      build: { _: 'ManhattanProject' },
    }),
  ],
  [36, 36, 36]
);
expect(
  'a treaty ended: Prepare for war',
  [tune('Player.declaration-expired'), tune('Player.declaration-broken')],
  [33, 33]
);
expect(
  'We Love the King Day, begun and ended',
  [tune('City.leader-celebration'), tune('City.leader-celebration-ended')],
  [34, 35]
);
expect(
  'civil disorder and famine',
  [tune('City.civil-disorder'), tune('City.food-storage-exhausted')],
  [36, 36]
);
expect(
  'a unit, an improvement, a spaceship part built',
  [
    tune('City.building-complete.unit'),
    tune('City.building-complete.city-improvement'),
    tune('City.building-complete.spaceship-part'),
  ],
  [44, 44, 44]
);
expect('a nuclear attack', tune('Unit.nuclear-attack'), 42);
expect(
  'anything else, and ours with no player to read the theme from: nothing',
  [
    tune('City.order-restored'),
    tune('City.polluted'),
    tune('Player.research-complete', {}, null),
  ],
  [null, null, null]
);
expect(
  'together, the gravest is heard',
  [
    loudest([44, 24, 44]),
    loudest([44, 36, 34]),
    loudest([33, 42]),
    loudest([null, 44]),
    loudest([]),
  ],
  [24, 36, 42, 44, null]
);
expect(
  'the ending: a win celebrates, anything else laments',
  [
    gameOverTune({ winner: { you: true } as any }),
    gameOverTune({ winner: { you: false } as any }),
    gameOverTune({ winner: null }),
  ],
  [34, 35, 35]
);

// The talks' players.
{
  const asked = negotiation('n', [them, us], [interaction('Initiate', them)]),
    asking = negotiation('n', [us, them], [interaction('Initiate', us)]);

  expect('the rival is whoever isn’t us', rivalOf(asked, us)?.id, 'p2');
  expect(
    'who asked for the talks',
    [rivalStarted(asked, us), rivalStarted(asking, us)],
    [true, false]
  );
}

// A new game: our long theme over the welcome, faded as it closes; one for a civilization without a theme is the main
//  theme.
{
  const { box, eventSounds } = sounds();

  eventSounds.newGame();
  eventSounds.welcomeClosed();
  eventSounds.welcomeClosed();

  expect('the welcome: our long theme, then its fade, once', box.calls, [
    ['play', 10],
    ['stop'],
  ]);

  const other = sounds();

  other.eventSounds.attach(() => barbarians);
  other.eventSounds.newGame();

  expect('without a theme: the main theme', other.box.calls, [['play', 3]]);
}

// A jingle over the welcome's theme replaces it, and closing the welcome then leaves it to play out.
{
  const { box, eventSounds } = sounds();

  eventSounds.newGame();
  eventSounds.notificationShown({ key: 'Player.research-complete', data: {} });
  eventSounds.welcomeClosed();
  eventSounds.notificationShown({ key: 'City.polluted', data: {} });

  expect(
    'a jingle over the welcome plays out; a notice without a tune plays nothing',
    box.calls,
    [
      ['play', 10],
      ['once', 24],
    ]
  );
}

// Notices added together are heard as one: the gravest.
{
  const { box, clock, eventSounds } = sounds();

  eventSounds.noticeAdded({ key: 'City.building-complete.unit', data: {} });
  eventSounds.noticeAdded({ key: 'City.civil-disorder', data: {} });
  eventSounds.noticeAdded({ key: 'City.building-complete.unit', data: {} });
  eventSounds.noticeAdded({ key: 'City.polluted', data: {} });

  expect('nothing until the batch is in', box.calls, []);

  clock.run();

  expect('then the gravest, once', box.calls, [['once', 36]]);

  eventSounds.noticeAdded({ key: 'City.polluted', data: {} });

  expect('a notice without a tune waits for nothing', clock.size, 0);
}

// An audience the rival asked for: their short theme as the emissary arrives, their long theme at the table, faded as
//  we leave.
{
  const { box, clock, eventSounds } = sounds(),
    initiate = interaction('Initiate', them),
    accept = interaction('Accept', us),
    offer = interaction('OfferPeace', them),
    terminate = interaction('Terminate', us);

  eventSounds.negotiationStep(negotiation('a', [them, us], [initiate]));
  eventSounds.negotiationReplied(accept);
  eventSounds.negotiationStep(
    negotiation('a', [them, us], [initiate, accept, offer])
  );
  eventSounds.negotiationReplied(interaction('Accept', us));
  eventSounds.negotiationStep(
    negotiation('a', [them, us], [initiate, accept, offer, accept])
  );

  expect(
    'the rival’s short theme, then their long one once, from the next step',
    box.calls,
    [
      ['once', 32],
      ['play', 18],
    ]
  );
  expect('a step cancels the wait for the talks’ end', clock.size, 0);

  eventSounds.negotiationReplied(terminate);

  expect('leaving fades it at once', box.calls.slice(2), [['stop']]);
}

// The rival ends the talks: no step follows our reply, and the theme fades once the wait is over.
{
  const { box, clock, eventSounds } = sounds(),
    initiate = interaction('Initiate', them),
    accept = interaction('Accept', us);

  eventSounds.negotiationStep(negotiation('b', [them, us], [initiate]));
  eventSounds.negotiationReplied(accept);
  eventSounds.negotiationStep(negotiation('b', [them, us], [initiate, accept]));
  eventSounds.negotiationReplied(interaction('Accept', us));
  clock.run();

  expect('no step after a reply: faded', box.calls, [
    ['once', 32],
    ['play', 18],
    ['stop'],
  ]);

  // Leaving at the emissary's arrival leaves the short theme to play out.
  box.calls.length = 0;
  eventSounds.negotiationStep(negotiation('c', [them, us], [initiate]));
  eventSounds.negotiationReplied(interaction('Terminate', us));

  expect('leaving at once: the short theme plays out', box.calls, [
    ['once', 32],
  ]);
}

// A choice within the talks (the advance to take in an exchange) holds the theme however long it takes; and a step of
//  the same talks after the wait ran out takes the long theme up again, without the emissary's jingle.
{
  const { box, clock, eventSounds } = sounds(),
    initiate = interaction('Initiate', them),
    accept = interaction('Accept', us);

  eventSounds.negotiationStep(negotiation('d', [them, us], [initiate]));
  eventSounds.negotiationReplied(accept);
  eventSounds.negotiationStep(negotiation('d', [them, us], [initiate, accept]));
  eventSounds.negotiationReplied(interaction('Accept', us));
  eventSounds.talksContinued();

  expect('choosing the advance: no wait for the end', clock.size, 0);
  expect('and the theme held', box.calls, [
    ['once', 32],
    ['play', 18],
  ]);

  eventSounds.negotiationReplied(null);
  clock.run();
  eventSounds.negotiationStep(
    negotiation('d', [them, us], [initiate, accept, accept])
  );

  expect('the same talks after the wait: the long theme again', box.calls, [
    ['once', 32],
    ['play', 18],
    ['stop'],
    ['play', 18],
  ]);
}

// War declared in the talks: Prepare for war, and the long theme isn't taken up again.
{
  const { box, eventSounds } = sounds(),
    initiate = interaction('Initiate', them),
    accept = interaction('Accept', us),
    war = interaction('Dialogue', them, { key: 'declare-war.rejected' });

  eventSounds.negotiationStep(negotiation('d', [them, us], [initiate]));
  eventSounds.negotiationReplied(accept);
  eventSounds.negotiationStep(
    negotiation('d', [them, us], [initiate, accept, war])
  );
  eventSounds.negotiationReplied(interaction('Acknowledge', us));
  eventSounds.negotiationStep(
    negotiation('d', [them, us], [initiate, accept, war, accept])
  );
  eventSounds.negotiationReplied(interaction('Terminate', us));

  expect('war: Prepare for war, played out', box.calls, [
    ['once', 32],
    ['once', 33],
  ]);
}

// War declared in the talks ends the treaty too: its notice doesn't play Prepare for war again straight after, but a
//  later war does.
{
  const { box, time, eventSounds } = sounds(),
    war = interaction('Dialogue', them, { key: 'declare-war.mobilize' }),
    ended = { key: 'Player.declaration-expired', data: {} };

  eventSounds.negotiationStep(
    negotiation('w', [them, us], [interaction('Initiate', them), war])
  );
  time.now = 5000;
  eventSounds.notificationShown(ended);
  time.now = 60000;
  eventSounds.notificationShown(ended);

  expect(
    'war in the talks and its treaty’s end: one Prepare for war, then another later',
    box.calls,
    [
      ['once', 33],
      ['once', 33],
    ]
  );
}

// Talks we asked for, and with a civilization without a theme: no audience jingle, the long theme (or the main theme)
//  from the first step.
{
  const { box, eventSounds } = sounds();

  eventSounds.negotiationStep(
    negotiation('e', [us, them], [interaction('Initiate', us)])
  );
  eventSounds.negotiationReplied(interaction('Terminate', us));
  eventSounds.negotiationStep(
    negotiation('f', [barbarians, us], [interaction('Initiate', barbarians)])
  );
  eventSounds.negotiationReplied(interaction('Accept', us));
  eventSounds.negotiationStep(
    negotiation('f', [barbarians, us], [interaction('Initiate', barbarians)])
  );

  expect(
    'our talks: the long theme at once; a rival without a theme: nothing, then the main theme',
    box.calls,
    [['play', 18], ['stop'], ['play', 3]]
  );
}

// The ending.
{
  const { box, eventSounds } = sounds();

  eventSounds.gameOver({ winner: { you: true } as any });
  eventSounds.gameOver({ winner: null });

  expect('the ending: a jingle each', box.calls, [
    ['once', 34],
    ['once', 35],
  ]);
}

// The ending is heard out: not over a notice gathered just before it, nor one shown with its window open, but the
//  game's moments are heard again once it's closed, playing on.
{
  const { box, clock, eventSounds } = sounds();

  eventSounds.noticeAdded({
    key: 'City.captured-from-us',
    data: { capturingPlayer: them },
  });
  eventSounds.gameOver({ winner: null });
  clock.run();
  eventSounds.notificationShown({ key: 'Player.research-complete', data: {} });
  eventSounds.gameOverClosed();
  eventSounds.notificationShown({ key: 'Player.research-complete', data: {} });

  expect('the ending over the notices around it', box.calls, [
    ['once', 35],
    ['once', 24],
  ]);
}

// Battles: the first sound there's a tune for, in the version the battle went for whoever's heard.
expect(
  'battles: each sound, won and lost',
  [
    battleTune({ sound: ['melee'], won: true }),
    battleTune({ sound: ['melee'], won: false }),
    battleTune({ sound: ['gunfire'], won: true }),
    battleTune({ sound: ['gunfire'], won: false }),
  ],
  [38, 39, 40, 41]
);
expect(
  "battles: the Bomber's run, won or lost",
  [
    battleTune({ sound: ['bombing', 'gunfire'], won: true }),
    battleTune({ sound: ['bombing', 'gunfire'], won: false }),
  ],
  [43, 43]
);
expect(
  'battles: a sound without a tune is passed over for the next',
  battleTune({ sound: ['catapult', 'gunfire'], won: true }),
  40
);
expect(
  'battles: nothing for sounds without tunes',
  [
    battleTune({ sound: ['catapult'], won: true }),
    battleTune({ sound: ['toString'], won: true }),
    battleTune({ sound: [], won: true }),
  ],
  [null, null, null]
);

{
  const { box, eventSounds } = sounds();

  eventSounds.battle({ sound: ['gunfire'], won: false });
  eventSounds.battle({ sound: ['catapult'], won: false });
  eventSounds.gameOver({ winner: null });
  eventSounds.battle({ sound: ['melee'], won: true });

  expect('battles: a jingle each, none over the ending', box.calls, [
    ['once', 41],
    ['once', 35],
  ]);
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL event-sounds: ${
      failures.length
    } of ${checks} checks\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS event-sounds: ${checks} checks\n`);
