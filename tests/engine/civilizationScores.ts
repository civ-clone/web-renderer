// The sidebar's scores (#701) are worked out in the worker and sent as finished rows. This checks, with plain players
//  and `Score` rules, that every civilization still in the game is ranked by its score (a tie keeps the order they
//  joined in), that the player's own row is marked and named, that a civilization met is named with its colours, that
//  one not met is sent with neither, so nothing in its row says who it is, and that the barbarians are left out (#169).
//  Then that the client answers `civilizationScores` on the transport with the same rows.

import Player from '@civ-clone/core-player/Player';
import PlayerRegistry from '@civ-clone/core-player/PlayerRegistry';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Effect from '@civ-clone/core-rule/Effect';
import Score, { IScoreTerm } from '@civ-clone/core-score/Rules/Score';
import Attribute from '@civ-clone/core-civilization/Attribute';
import AttributeRegistry from '@civ-clone/core-civilization/AttributeRegistry';
import Barbarian from '@civ-clone/base-civilization-barbarian/Barbarian';
import {
  Babylonian,
  Egyptian,
  Greek,
  Roman,
} from '@civ-clone/civ1-civilization/Civilizations';
import {
  CivilizationScoresDependencies,
  CivilizationScoresRow,
  civilizationScoresRows,
} from '../../src/js/Engine/lib/civilizationScores';
import {
  RequestsContext,
  registerRequests,
} from '../../src/js/Engine/Client/requests';

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

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL civilizationScores: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

const rules = new RuleRegistry(),
  attributes = new AttributeRegistry(),
  players = new PlayerRegistry(),
  scores = new Map<Player, number>(),
  player = (
    Civilization: typeof Roman | typeof Barbarian,
    value: number
  ): Player => {
    const player = new Player(rules);

    player.setCivilization(new Civilization(attributes));
    players.register(player);
    scores.set(player, value);

    return player;
  };

attributes.register(
  new Attribute(Roman, 'colors', ['#ffffff', '#000000']),
  new Attribute(Greek, 'colors', ['#00ffff', '#0000ff']),
  new Attribute(Egyptian, 'colors', ['#ffff00', '#000000'])
);

// One term a player, its score as set above.
rules.register(
  new Score(
    new Effect(
      (scored: Player): IScoreTerm => ({
        term: 'test',
        value: scores.get(scored) ?? 0,
      })
    )
  )
);

// In the order they joined: us, a rival met, the barbarians (with the top score), a rival not met, and one met tied
//  with the one before it.
const reader = player(Roman, 30),
  met = player(Greek, 50),
  barbarians = player(Barbarian, 999),
  unmet = player(Egyptian, 40),
  tied = player(Babylonian, 40),
  hasMet = (other: Player): boolean => other === met || other === tied;

// No game result unless a check sets one: the conquest bonus (#176) applies only to the conqueror of a finished game.
let gameResult: unknown = null;

const dependencies = {
    players,
    rules,
    hasMet,
    gameResults: { get: () => gameResult },
    // Every player the game started with has a world, kept when they are destroyed (`conquestBonusFor`).
    playerWorlds: {
      entries: () =>
        players.entries().map((owner) => ({ player: () => owner })),
    },
  } as unknown as CivilizationScoresDependencies,
  rows = civilizationScoresRows(reader, dependencies);

expect(
  'ranked by score, highest first, a tie in the order they joined, and never the barbarians',
  rows.map(({ rank, score }) => [rank, score]),
  [
    [1, 50],
    [2, 40],
    [3, 40],
    [4, 30],
  ]
);
expect('a civilization met is named, with its colours', rows[0], {
  rank: 1,
  score: 50,
  own: false,
  civilization: 'Greek',
  colors: ['#00ffff', '#0000ff'],
} as CivilizationScoresRow);
expect(
  'one not met is sent with no name and no colours, though it has some',
  rows[1],
  {
    rank: 2,
    score: 40,
    own: false,
    civilization: null,
    colors: null,
  } as CivilizationScoresRow
);
expect('one met with no colours is named, with none', rows[2], {
  rank: 3,
  score: 40,
  own: false,
  civilization: 'Babylonian',
  colors: null,
} as CivilizationScoresRow);
expect('our own row is marked and named, met or not', rows[3], {
  rank: 4,
  score: 30,
  own: true,
  civilization: 'Roman',
  colors: ['#ffffff', '#000000'],
} as CivilizationScoresRow);
expect('only our own row is marked', rows.filter(({ own }) => own).length, 1);
expect(
  'no row carries anything else',
  rows.every(
    (row) =>
      JSON.stringify(Object.keys(row).sort()) ===
      JSON.stringify(['civilization', 'colors', 'own', 'rank', 'score'])
  ),
  true
);
expect(
  'the barbarians are still in the game, just not listed',
  players.entries().includes(barbarians),
  true
);

// A defeated player is unregistered (civ1-player's `Defeated` rules), so it drops out of the list.
players.unregister(unmet);

expect(
  'a civilization defeated is no longer listed',
  civilizationScoresRows(reader, dependencies).map(
    ({ civilization, score }) => [civilization, score]
  ),
  [
    ['Greek', 50],
    ['Babylonian', 40],
    ['Roman', 30],
  ]
);

// A watcher's view (#607) owns its group's members, or nobody watching the whole map, so no row is anyone's own there.
expect(
  "a watched group's members are the view's own rows",
  civilizationScoresRows(reader, {
    ...dependencies,
    owns: (player: Player) => player === reader || player === met,
  })
    .filter(({ own }) => own)
    .map(({ civilization }) => civilization),
  ['Greek', 'Roman']
);
expect(
  "watching the whole map, no row is anyone's own",
  civilizationScoresRows(reader, { ...dependencies, owns: () => false }).some(
    ({ own }) => own
  ),
  false
);

// Two civilizations not met can't be told apart by anything but their place and score.
const unmetRows = civilizationScoresRows(reader, {
  ...dependencies,
  hasMet: () => false,
}).filter(({ own }) => !own);

expect(
  'unmet rows carry nothing but their rank and score',
  unmetRows.map((row) =>
    Object.entries(row).filter(([key]) => !['rank', 'score'].includes(key))
  ),
  unmetRows.map(() => [
    ['own', false],
    ['civilization', null],
    ['colors', null],
  ])
);

// Our own row is the total the Civilization Score report shows: with the conquest bonus once we've conquered the world,
//  which outranks everyone (v474.05 turn 100 against two opponents: 400 + 2 * (550 - 100) + 100 * 2).
gameResult = {
  reason: () => 'conquest',
  winner: () => reader,
  turn: () => 101,
  scoringComplete: () => false,
};

expect(
  'the conqueror scores the conquest bonus, as the Civilization Score report does',
  civilizationScoresRows(reader, dependencies)
    .filter(({ own }) => own)
    .map(({ rank, score }) => [rank, score]),
  [[1, 1500]]
);

gameResult = null;

// The client answers on its own channel, with the same rows, as a reply to the request's id.
const handlers: {
    [channel: string]: (data: unknown, meta: { id?: string }) => unknown;
  } = {},
  replies: Array<[string, unknown, string]> = [],
  transport = {
    receive: (
      channel: string,
      handler: (data: unknown, meta: { id?: string }) => unknown
    ) => {
      handlers[channel] = handler;

      return () => {};
    },
    reply: (channel: string, data: unknown, id: string) =>
      replies.push([channel, data, id]),
    send: () => {},
  },
  ctx = {
    player: () => reader,
    // A player's own view owns only that player.
    view: { owns: (other: Player) => other === reader },
    ...dependencies,
  } as unknown as RequestsContext;

registerRequests(transport as never, ctx);

const answered = async (): Promise<void> => {
  handlers.civilizationScores?.(null, { id: 'request-1' });

  expect('the client answers civilizationScores with the rows', replies, [
    [
      'civilizationScores',
      civilizationScoresRows(reader, dependencies),
      'request-1',
    ],
  ]);
};

answered()
  .then(() => {
    finished = true;

    if (failures.length > 0) {
      process.stderr.write(
        `FAIL civilizationScores (${
          failures.length
        } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write(`PASS civilizationScores (${checks} checks)\n`);
  })
  .catch((error) => {
    process.stderr.write(`FAIL civilizationScores: ${error.stack ?? error}\n`);
    process.exit(1);
  });
