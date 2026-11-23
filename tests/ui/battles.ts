// How battles play out on the 3D map (docs/3d-renderer.md §6.4, §8.2, `battles.ts`), by the clock:
//  - the attacker gathers pace to the edge between the squares, where the blow falls; won, it goes back to where it
//    stood, and the loser fades where it stood; lost, it fades at the edge;
//  - each blow is told once, and each battle's end once, the fighters drawn till then;
//  - a battle waits for those whose attacker is one of its units to be over, and starts no sooner than those before it
//    at its square whose blow is still to fall; others are fought at once, several at a square together;
//  - a unit's battles go on till the last it attacks in is over; an attacker's drawn once, in each battle in turn; one
//    walking there is fought once it's there; those waiting for one ended at once start as soon as they can;
//  - the square attacked awaits the first blow still to fall there;
//  - battles ended at once have their blows told, those not told already, and are over;
//  - paced for its fighters' clips (`clipPace`), the attacker that shoots stands, the blow falling as its first shot
//    lands, and is drawn till its clip's over; the loser falls, solid, then fades; each plays its clip, by the clock.

import Battles, {
  BATTLE_PACE,
  BattleOf,
  BattlePace,
  SHOT_FLIGHT,
  battleAt,
  battleEnds,
  battleLength,
  blowAt,
  clipPace,
  quickerBattle,
} from '@civ-clone/ui-map-3d/battles';
import { RigFacts } from '@civ-clone/ui-map-3d/markers/clips';

const failures: string[] = [];
let checks = 0;

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

const round = (value: number, places = 3): number =>
  Math.round(value * 10 ** places) / 10 ** places;

const pace: BattlePace = { reach: 200, back: 300, fade: 600 };

// A battle from the square (0, 0) to (1, 0), its attacker standing at (0, 0) a little raised, as in front of a city.
const battleOf = (
  attacker: string,
  defender: string,
  won: boolean,
  from: [number, number] = [0, 0],
  to: [number, number] = [1, 0]
): BattleOf => ({
  attacker,
  defender,
  attackerSquare: { x: from[0], y: from[1] },
  defenderSquare: { x: to[0], y: to[1] },
  won,
  from: { at: [from[0], from[1]], lift: 0.1 },
  edge: [
    from[0] + (to[0] - from[0]) * 0.45,
    from[1] + (to[1] - from[1]) * 0.45,
  ],
  fallsAt: { at: [to[0], to[1]], lift: 0 },
  facing: Math.PI / 2,
  defenderFacing: -Math.PI / 2,
});

{
  const battles = new Battles(),
    won = battles.add(battleOf('a', 'd', true), 1000, pace),
    // How far it's reached, how solid it and the loser are, at each time.
    sample = (at: number) => {
      const { reach, attacker, fallen } = battleAt(won, at);

      return [round(reach), round(attacker), round(fallen)];
    };

  expect(
    'won: it gathers pace to the edge, the blow falls a reach in, then it goes back while the loser fades',
    [
      blowAt(won),
      battleEnds(won),
      sample(1000),
      sample(1100),
      sample(1200),
      sample(1350),
      sample(1500),
      sample(1500 + 300 - 1),
      sample(1800),
    ],
    [
      1200,
      1800,
      [0, 1, 1],
      // Slower to start than at the blow: a quarter of the way at half the time.
      [0.25, 1, 1],
      [1, 1, 1],
      [0.5, 1, 0.75],
      [0, 1, 0.5],
      [0, 1, 0.002],
      [0, 1, 0],
    ]
  );

  const lost = battles.add(battleOf('b', 'e', false, [2, 2], [3, 2]), 1000, {
    ...pace,
  });

  expect(
    'lost: the blow falls as it would, and the attacker fades at the edge, no loser to fade where it stood',
    [
      battleEnds(lost),
      battleAt(lost, 1200),
      battleAt(lost, 1500),
      battleAt(lost, 1800),
    ],
    [
      1800,
      { reach: 1, attacker: 1, fallen: 0 },
      { reach: 1, attacker: 0.5, fallen: 0 },
      { reach: 1, attacker: 0, fallen: 0 },
    ]
  );
}

{
  // What's drawn, frame by frame: the attacker, from where it stands to the edge, coming down off what it stood on; the
  //  loser from the blow, fading where it stood; each blow told once, and each end once.
  const battles = new Battles(),
    battle = battles.add(battleOf('a', 'd', true), 0, pace),
    drawn = (now: number) => {
      const { going, struck, ended } = battles.at(now);

      return {
        going: going.map(({ id, unit, fallen, at, lift, facing, opacity }) => [
          id,
          unit,
          fallen,
          at.map((n) => round(n)),
          round(lift),
          round(facing),
          round(opacity),
        ]),
        struck: struck.map(({ id }) => id),
        ended: ended.map(({ id }) => id),
      };
    };

  expect(
    'the attacker drawn from where it stands to the edge, the loser where it stood from the blow; each blow and end told once',
    [
      [
        battle.id,
        battles.size(),
        battles.attacking('a'),
        battles.attacking('d'),
      ],
      [battles.fighting('a'), battles.fighting('d'), battles.fighting('x')],
      drawn(0),
      drawn(200),
      drawn(500),
      drawn(800),
      drawn(900),
      battles.size(),
      battles.attacking('a'),
    ],
    [
      ['battle-1', 1, true, false],
      [true, true, false],
      {
        going: [['battle-1', 'a', false, [0, 0], 0.1, 1.571, 1]],
        struck: [],
        ended: [],
      },
      {
        going: [
          ['battle-1', 'a', false, [0.45, 0], 0, 1.571, 1],
          ['battle-1-fallen', 'd', true, [1, 0], 0, -1.571, 1],
        ],
        struck: ['battle-1'],
        ended: [],
      },
      {
        going: [
          ['battle-1', 'a', false, [0, 0], 0.1, 1.571, 1],
          ['battle-1-fallen', 'd', true, [1, 0], 0, -1.571, 0.5],
        ],
        struck: [],
        ended: [],
      },
      { going: [], struck: [], ended: ['battle-1'] },
      { going: [], struck: [], ended: [] },
      0,
      false,
    ]
  );

  // Gone too far at once, as in a tab out of sight: its blow and its end told together, nothing drawn.
  battles.add(battleOf('a', 'd', false), 1000, pace);

  expect(
    'a battle long over by the next frame has its blow and its end told together, nothing drawn',
    drawn(5000),
    { going: [], struck: ['battle-2'], ended: ['battle-2'] }
  );
}

{
  // A battle waits for those whose attacker is one of its units: the same attacker again, or one attacking it as it
  //  lunges. Others are fought at once, several at one square together. The square attacked awaits the first blow still
  //  to fall there.
  const battles = new Battles(),
    first = battles.add(battleOf('a', 'd', true, [0, 0], [1, 0]), 0, pace),
    // Another attacker, at the same square and the same defender: together.
    second = battles.add(battleOf('b', 'd', false, [2, 0], [1, 0]), 10, pace),
    // The first's attacker again, at another square: after the first.
    third = battles.add(battleOf('a', 'e', true, [0, 0], [0, 1]), 20, pace),
    // The first's attacker attacked as it lunges: after it's lunged in both its battles.
    counter = battles.add(battleOf('g', 'a', true, [0, 1], [0, 0]), 25, pace),
    // The first's defender attacking: it isn't drawn lunging there, so at once.
    defenderAttacks = battles.add(
      battleOf('d', 'h', true, [1, 0], [2, 1]),
      27,
      pace
    ),
    // Nothing shared: at once.
    apart = battles.add(battleOf('c', 'f', true, [3, 3], [2, 3]), 30, pace);

  expect(
    'a battle waits for those whose attacker is one of its units, and no others: several at a square are fought together',
    [
      first.start,
      second.start,
      third.start,
      counter.start,
      defenderAttacks.start,
      apart.start,
    ],
    [0, 10, battleEnds(first), battleEnds(third), 27, 30]
  );

  // Blows at a square fall in the order the battles came: one that came after another there whose attacker's still
  //  walking to it starts no sooner than that one; once a square's blows have fallen, the next there is fought at once.
  const ordered = new Battles(),
    walkingFirst = ordered.add(battleOf('a', 'd', true), 0, pace, 300),
    straightAfter = ordered.add(
      battleOf('b', 'e', true, [2, 0], [1, 0]),
      10,
      pace
    );

  ordered.at(blowAt(walkingFirst));

  const afterBlows = ordered.add(
    battleOf('c', 'f', true, [1, 1], [1, 0]),
    blowAt(walkingFirst) + 10,
    pace
  );

  expect(
    'blows at a square fall in the order the battles came; once they have, the next there is fought at once',
    [walkingFirst.start, straightAfter.start, afterBlows.start],
    [300, 300, blowAt(walkingFirst) + 10]
  );

  // Whatever their paces, as when the player chooses to walk quickly between two attacks: the blow of one at a quicker
  //  pace falls no sooner than one before it there.
  const paces = new Battles(),
    atNormal = paces.add(battleOf('a', 'd', true), 0, pace),
    atQuick = paces.add(
      battleOf('b', 'e', true, [2, 0], [1, 0]),
      50,
      quickerBattle(pace)
    );

  expect(
    'a battle at a quicker pace at a square strikes no sooner than one before it there',
    [blowAt(atNormal), blowAt(atQuick)],
    [200, 200]
  );

  // Ended at once, a battle takes those before it at its square with it, their blows first, as blows there fall in the
  //  order the battles came; those before it at other squares, and those whose blow's fallen, go on.
  const cutting = new Battles(),
    struckThere = cutting.add(
      battleOf('h', 'i', true, [1, 1], [1, 0]),
      -250,
      pace
    ),
    walkingThere = cutting.add(battleOf('a', 'd', true), 0, pace, 1000),
    elsewhere = cutting.add(
      battleOf('c', 'g', true, [3, 3], [2, 3]),
      0,
      pace,
      1000
    ),
    besideIt = cutting.add(battleOf('b', 'e', true, [2, 0], [1, 0]), 0, pace),
    afterIt = cutting.add(battleOf('f', 'j', true, [1, 1], [1, 0]), 0, pace),
    afterItBefore = afterIt.start;

  cutting.at(5);

  const cut = cutting.endWhere(({ id }) => id === besideIt.id, 10);

  expect(
    'ended at once, a battle takes those before it at its square with it, their blows first; those elsewhere, and one there whose blow’s fallen, go on; one after it there starts at once',
    [
      cut.struck.map(({ id }) => id),
      cut.ended.map(({ id }) => id),
      cutting.size(),
      cutting.attacking(elsewhere.attacker),
      cutting.attacking(struckThere.attacker),
      walkingThere.id,
      [afterItBefore, afterIt.start, elsewhere.start],
    ],
    [
      ['battle-2', 'battle-4'],
      ['battle-2', 'battle-4'],
      3,
      true,
      true,
      'battle-2',
      [1000, 10, 1000],
    ]
  );

  // How long the battles a unit attacks in go on, for the view to bound them.
  expect(
    'a unit’s battles are over when the last it attacks in is; one attacking in none has none',
    [
      battles.busyUntil(['a']),
      battles.busyUntil(['x', 'c']),
      battles.busyUntil(['x']),
    ],
    [battleEnds(third), battleEnds(apart), null]
  );

  const awaiting = (now: number) => {
    battles.at(now);

    return battles.awaitingBlow({ x: 1, y: 0 })?.id ?? null;
  };

  expect(
    'the square attacked awaits the first blow still to fall there, then the next, then none',
    [
      awaiting(0),
      awaiting(blowAt(first)),
      awaiting(blowAt(second)),
      battles.awaitingBlow({ x: 3, y: 3 }),
    ],
    [first.id, second.id, null, null]
  );

  // A second's before its start: its attacker stands where it is, solid.
  const waiting = new Battles();

  waiting.add(battleOf('a', 'd', true), 0, pace);
  waiting.add(battleOf('b', 'a', true, [2, 0], [0, 0]), 0, pace);

  const { going } = waiting.at(100);

  expect(
    'one waiting for its turn is drawn standing where it is',
    going.map(({ unit, at, opacity }) => [
      unit,
      at.map((n) => round(n)),
      opacity,
    ]),
    [
      ['a', [0.113, 0], 1],
      ['b', [2, 0], 1],
    ]
  );

  // One attacker attacking again before its first battle's over: drawn once, lunging in the first; standing in the
  //  second only once the first's over.
  const twice = new Battles(),
    firstOfTwo = twice.add(battleOf('a', 'd', true), 0, pace);

  twice.add(battleOf('a', 'e', true, [0, 0], [0, 1]), 50, pace);

  const drawnTwice = (now: number) =>
    twice
      .at(now)
      .going.filter(({ fallen }) => !fallen)
      .map(({ battle, unit }) => [battle, unit]);

  expect(
    'an attacker attacking again is drawn once, in the battle it’s fighting, then in the next',
    [drawnTwice(100), drawnTwice(battleEnds(firstOfTwo) + 10)],
    [[['battle-1', 'a']], [['battle-2', 'a']]]
  );

  // Walking there: fought no sooner than it's there.
  const walking = new Battles(),
    walkedTo = walking.add(battleOf('a', 'd', true), 0, pace, 300);

  expect(
    'a battle whose attacker’s walking there starts once it’s there',
    [walkedTo.start, walkedTo.notBefore, battleAt(walkedTo, 200).reach],
    [300, 300, 0]
  );
}

{
  // Ended at once: the blows not yet told are told, and the battles are over; the others go on.
  const battles = new Battles(),
    struckAlready = battles.add(battleOf('a', 'd', true), 0, pace),
    another = battles.add(battleOf('b', 'e', true, [2, 2], [3, 2]), 0, pace),
    left = battles.add(battleOf('c', 'f', true, [0, 3], [1, 3]), 0, pace);

  battles.at(250);
  battles.add(battleOf('g', 'h', true, [3, 0], [3, 1]), 240, pace);

  const ended = battles.endWhere(
    ({ attacker }) => ['a', 'g'].includes(attacker),
    250
  );

  expect(
    'ending the battles picked at once tells the blows not told already, and those battles are over; the rest go on',
    [
      ended.struck.map(({ attacker }) => attacker),
      ended.ended.map(({ attacker }) => attacker),
      battles.size(),
      battles.attacking('a'),
      battles.attacking('b'),
      [struckAlready.id, another.id, left.id],
    ],
    [['g'], ['a', 'g'], 2, false, true, ['battle-1', 'battle-2', 'battle-3']]
  );

  const all = battles.endAll(260);

  expect(
    'ending them all at once ends the rest, their blows told already not told again',
    [all.struck.length, all.ended.length, battles.size()],
    [0, 2, 0]
  );

  // Ended at once, those waiting for them start as soon as they can: now, or once another they wait for is over, or once
  //  their attacker's there.
  const queue = new Battles(),
    cut = queue.add(battleOf('a', 'd', true), 0, pace),
    afterCut = queue.add(battleOf('a', 'e', true, [0, 0], [0, 1]), 0, pace),
    afterBoth = queue.add(battleOf('a', 'f', true, [0, 0], [1, 1]), 0, pace),
    walkingTo = queue.add(
      battleOf('e', 'f', true, [3, 3], [2, 3]),
      0,
      pace,
      2000
    ),
    before = [afterCut.start, afterBoth.start];

  queue.endWhere(({ id }) => id === cut.id, 100);

  expect(
    'ended at once, the battles waiting for it start as soon as they can, one after another; one waiting for its attacker still waits',
    [before, [afterCut.start, afterBoth.start, walkingTo.start]],
    [
      [battleEnds(cut), battleEnds(cut) + 800],
      [100, 900, 2000],
    ]
  );
}

expect(
  'a battle twice as quick takes half as long; the blow falls a fifth of a second in',
  [quickerBattle(BATTLE_PACE), BATTLE_PACE.reach],
  [{ reach: 100, back: 150, fade: 300 }, 200]
);

{
  // A squad of three that throws, half a second into its fight, and falls over 1.6 s; and one that fights hand to hand.
  const thrower: RigFacts = {
      figures: 3,
      stagger: 0.13,
      clips: {
        fight: { duration: 1.5, shots: [{ at: 0.5, joint: 'prop' }] },
        die: { duration: 1.6, shots: [] },
      },
    },
    brawler: RigFacts = {
      figures: 1,
      stagger: 0.13,
      clips: { fight: { duration: 1.2, shots: [] } },
    },
    // Rounded, as the stagger's tenths add up in floating point.
    rounded = (paced: BattlePace) =>
      Object.fromEntries(
        Object.entries(paced).map(([key, value]) => [
          key,
          typeof value === 'number' ? round(value) : value,
        ])
      );

  expect(
    'paced for clips: none to play, as it was; a thrower stands, the blow as its throw lands, drawn till its last figure’s throw is over, and a loser that falls is solid till its last figure’s fallen; hand to hand, it lunges, the blow as it would; one that only falls falls',
    [
      clipPace(pace, null, null) === pace,
      clipPace(pace, { ...brawler, clips: {} }, null) === pace,
      rounded(clipPace(pace, thrower, thrower)),
      rounded(clipPace(pace, brawler, null)),
      rounded(clipPace(pace, null, thrower)),
    ],
    [
      true,
      true,
      {
        reach: 500 + SHOT_FLIGHT,
        back: 1760 - 850,
        fade: 600,
        lunge: 0,
        falls: 1860,
        clips: { rate: 1, fight: true, die: true },
      },
      {
        reach: 200,
        back: 1000,
        fade: 600,
        clips: { rate: 1, fight: true, die: false },
      },
      {
        reach: 200,
        back: 300,
        fade: 600,
        falls: 1860,
        clips: { rate: 1, fight: false, die: true },
      },
    ]
  );

  const paced = clipPace(pace, thrower, thrower),
    quick = quickerBattle(paced),
    battles = new Battles(),
    won = battles.add(battleOf('a', 'd', true), 1000, paced),
    lost = battles.add(battleOf('b', 'e', false, [2, 2], [3, 2]), 1000, paced),
    // What's drawn of each battle at a time: who, where along the way, how solid, and what it plays how far in.
    drawn = (at: number) =>
      battles
        .at(at)
        .going.map(({ unit, at: [u], opacity, clip }) => [
          unit,
          round(u, 2),
          round(opacity, 2),
          clip === undefined ? null : [clip.role, round(clip.seconds)],
        ]);

  expect(
    'paced for clips, twice as quick: half as long, falling too, its clips played twice as quick; how long it takes, won or lost',
    [
      rounded(quick),
      round(battleLength(paced)),
      round(battleLength(paced, false)),
      [round(battleEnds(won)), round(battleEnds(lost))],
    ],
    [
      {
        reach: 425,
        back: 455,
        fade: 300,
        lunge: 0,
        falls: 930,
        clips: { rate: 2, fight: true, die: true },
      },
      850 + 1860 + 600,
      850 + 1860 + 600,
      [1000 + 3310, 1000 + 3310],
    ]
  );

  expect(
    'paced for clips: the attacker stands where it is, playing its fight from the start; at the blow, the loser plays its fall, solid till it’s fallen, then fades; lost, the attacker falls where it stands, then fades',
    [drawn(1000), drawn(1849), drawn(1850), drawn(3709), drawn(4010)],
    [
      [
        ['a', 0, 1, ['fight', 0]],
        ['b', 2, 1, ['fight', 0]],
      ],
      [
        ['a', 0, 1, ['fight', 0.849]],
        ['b', 2, 1, ['fight', 0.849]],
      ],
      [
        ['a', 0, 1, ['fight', 0.85]],
        ['d', 1, 1, ['die', 0]],
        ['b', 2, 1, ['die', 0]],
      ],
      [
        ['a', 0, 1, ['fight', 2.709]],
        ['d', 1, 1, ['die', 1.859]],
        ['b', 2, 1, ['die', 1.859]],
      ],
      [
        ['a', 0, 1, ['fight', 3.01]],
        ['d', 1, 0.5, ['die', 2.16]],
        ['b', 2, 0.5, ['die', 2.16]],
      ],
    ]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL battles: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS battles (${checks} checks)\n`);
