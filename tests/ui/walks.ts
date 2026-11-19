// How units walk on the 3D map (docs/3d-renderer.md §6.4, §8.2, `walks.ts`), by the clock:
//  - a walk gets up to pace from standing, goes on at it, and stops at its end, where it's bound;
//  - a step joined mid-walk goes on from where it is, at the pace it's going, with no jump or jolt;
//  - however many steps, what's left takes no longer than its most;
//  - a GoTo's steps, all at once, are one walk through each square's middle;
//  - units stepping together walk as one, and part where they step apart: one stepping on goes on along the way it
//    came; a unit standing a square from a walk doesn't join it; a walk left empty is given up;
//  - over the world's seam, the short way; facing the way between squares' middles, turning at one, and from the way
//    it faced when a step's joined late.

import Walks, {
  Pace,
  RIDE,
  WalkPoint,
  motionAt,
  motionEnds,
  plan,
} from '@civ-clone/ui-map-3d/walks';

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

const pace: Pace = { step: 300, ramp: 120, most: 2000 };

// A motion sampled every ms from `from` to its end: whether it never goes back, and the biggest change in speed from
//  one ms to the next, as a share of full pace.
const sampled = (
  motion: ReturnType<typeof plan>,
  from: number
): { forward: boolean; jolt: number; last: number } => {
  let forward = true,
    jolt = 0,
    { along, speed } = motionAt(motion, from);

  for (let now = from + 1; now <= motionEnds(motion) + 2; now++) {
    const next = motionAt(motion, now);

    forward &&= next.along >= along - 1e-9;
    jolt = Math.max(jolt, Math.abs(next.speed - speed) * pace.step);
    ({ along, speed } = next);
  }

  return { forward, jolt, last: along };
};

// From standing, three steps: up to pace in a ramp, on at a step a `step`, stopping in a ramp, at its end on time.
{
  const motion = plan(1000, 0, 0, 3, pace),
    { forward, jolt, last } = sampled(motion, 1000);

  expect(
    'from standing: still at first, up to full pace, never back, no jolt, and stopped where it’s bound, a ramp more than its steps’ time',
    [
      motionAt(motion, 1000),
      round(motionAt(motion, 1000 + pace.ramp).speed * pace.step),
      forward,
      jolt < 0.02,
      round(last),
      motionEnds(motion) - 1000,
      motionAt(motion, motionEnds(motion) + 50),
    ],
    [
      { along: 0, speed: 0 },
      1,
      true,
      true,
      3,
      3 * pace.step + pace.ramp,
      { along: 3, speed: 0 },
    ]
  );
}

// Joined mid-walk, while going at full pace, and while stopping: on from where it is, at the pace it's going.
{
  const first = plan(0, 0, 0, 1, pace),
    joinedAt = [200, 380],
    joins = joinedAt.map((at) => {
      const { along, speed } = motionAt(first, at),
        next = plan(at, along, speed, 2, pace),
        { forward, jolt, last } = sampled(next, at);

      return [
        round(motionAt(next, at).along - along, 9),
        round(motionAt(next, at).speed - speed, 9),
        forward,
        jolt < 0.02,
        round(last),
      ];
    });

  expect(
    'a step joined mid-walk, at full pace or stopping: on from where it is at the pace it’s going, never back, no jolt, to its new end',
    joins,
    joinedAt.map(() => [0, 0, true, true, 2])
  );
}

// A short step from standing never gets to full pace, and stops on time; a hundred steps hurry to fit the most.
{
  const short = plan(0, 0, 0, 0.2, pace),
    long = plan(0, 0, 0, 100, pace),
    { last } = sampled(short, 0);

  expect(
    'a short step stops where it’s bound without reaching full pace; a hundred steps take no longer than the most',
    [
      short.top * pace.step < 1,
      round(last),
      motionEnds(long) <= pace.most + 1,
      motionAt(long, motionEnds(long)).along,
    ],
    [true, 0.2, true, 100]
  );
}

const point = (u: number, v: number, lift = 0): WalkPoint => ({
  at: [u, v],
  lift,
});

// A GoTo of three steps, all at once, east then south: one walk, through each square's middle.
{
  const walks = new Walks({ u: 10, v: null }),
    ids = [
      walks.step(
        'goer',
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        point(1, 1),
        point(2, 1),
        0,
        pace
      ),
      walks.step(
        'goer',
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        point(9, 9),
        point(3, 1),
        1,
        pace
      ),
      walks.step(
        'goer',
        { x: 3, y: 1 },
        { x: 3, y: 2 },
        point(9, 9),
        point(3, 2),
        2,
        pace
      ),
    ],
    ends = walks.nextEnd() ?? 0,
    // Where it is each ms: those it passes through the squares' middles.
    passed = new Set<string>(),
    facings = new Set<number>();
  let longestTurn = 0,
    lastFacing: number | null = null;

  for (let now = 2; now < ends; now++) {
    const [walker] = walks.at(now).going;

    if (walker === undefined) {
      break;
    }

    [
      [2, 1],
      [3, 1],
    ].forEach(([u, v]) => {
      if (Math.hypot(walker.at[0] - u!, walker.at[1] - v!) < 0.01) {
        passed.add(`${u},${v}`);
      }
    });
    facings.add(round(walker.facing, 2));
    longestTurn = Math.max(
      longestTurn,
      Math.abs(walker.facing - (lastFacing ?? walker.facing))
    );
    lastFacing = walker.facing;
  }

  const { going, ended } = walks.at(ends);

  expect(
    'a GoTo’s steps, all at once, are one walk through each square’s middle, facing east then turning south a little at a time, over in three steps’ time and a ramp from the first',
    [
      new Set(ids).size,
      [...passed],
      facings.has(round(Math.PI / 2, 2)) && facings.has(0),
      longestTurn < 0.1,
      Math.round(ends) - 2 <= 3 * pace.step + pace.ramp,
      going.length,
      ended.map(({ units, at, from, to }) => [units, at, from, to]),
      walks.walking('goer'),
      walks.nextEnd(),
    ],
    [
      1,
      ['2,1', '3,1'],
      true,
      true,
      true,
      0,
      [[['goer'], [3, 2], { x: 1, y: 1 }, { x: 3, y: 2 }]],
      false,
      null,
    ]
  );
}

// Moved again before it's there: on from where it's drawn, no jump.
{
  const walks = new Walks({ u: 10, v: null });

  walks.step(
    'goer',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    point(1, 1),
    point(2, 1),
    0,
    pace
  );

  const [before] = walks.at(200).going;

  walks.step(
    'goer',
    { x: 2, y: 1 },
    { x: 2, y: 2 },
    point(9, 9),
    point(2, 2),
    200,
    pace
  );

  const [after] = walks.at(200).going;

  expect(
    'moved again before it’s there: on from where it’s drawn, no jump',
    [round(before!.at[0]), round(before!.at[1])],
    [round(after!.at[0]), round(after!.at[1])]
  );
}

// A ship and what it carries: the ship steps, then its cargo, the same step, a moment later; on again, the same; then
//  the ship goes on and one unit doesn't, and another steps ashore.
{
  const walks = new Walks({ u: 10, v: null }),
    sail = (unit: string, from: number, to: number, now: number) =>
      walks.step(
        unit,
        { x: from, y: 1 },
        { x: to, y: 1 },
        point(from, 1),
        point(to, 1),
        now,
        pace
      ),
    together = [
      sail('ship', 1, 2, 0),
      sail('musketeers', 1, 2, 1),
      sail('settlers', 1, 2, 2),
    ],
    onAgain = [
      sail('ship', 2, 3, 400),
      sail('musketeers', 2, 3, 401),
      sail('settlers', 2, 3, 402),
    ],
    walking = walks.at(403).going.map(({ units }) => units);

  // On again, before it's there: the musketeers stay aboard but the settlers don't step, and the musketeers step ashore
  //  later, after the settlers have stopped.
  sail('ship', 3, 4, 600);
  sail('musketeers', 3, 4, 601);

  const parted = walks
      .at(603)
      .going.map(({ units, to }) => [units, to.x])
      .sort(),
    ashoreFrom = walks
      .at(1000)
      .going.find(({ units }) => units.includes('musketeers'))!.at;

  walks.step(
    'musketeers',
    { x: 4, y: 1 },
    { x: 4, y: 2 },
    point(9, 9),
    point(4, 2),
    1000,
    pace
  );

  const ashore = walks.at(1000).going,
    ashoreAt = ashore.find(({ units }) => units.includes('musketeers'))!.at;

  expect(
    'a ship and what it carries walk as one, stepping on together; one not stepping on stays bound where it was, and stops there; one stepping ashore leaves from where it’s drawn',
    [
      new Set(together).size,
      new Set(onAgain).size,
      walking,
      parted,
      ashore.map(({ units }) => units).sort(),
      ashoreAt.map((n) => round(n)),
    ],
    [
      1,
      1,
      [['ship', 'musketeers', 'settlers']],
      [
        [['settlers'], 3],
        [['ship', 'musketeers'], 4],
      ].sort(),
      [['musketeers'], ['ship']],
      ashoreFrom.map((n) => round(n)),
    ]
  );
}

// The same step, later than a moment after: its own walk.
{
  const walks = new Walks({ u: 10, v: null }),
    a = walks.step(
      'a',
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      point(1, 1),
      point(2, 1),
      0,
      pace
    ),
    b = walks.step(
      'b',
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      point(1, 1),
      point(2, 1),
      RIDE + 1,
      pace
    );

  expect(
    'the same step made later than a moment after: its own walk',
    a === b,
    false
  );
}

// Over the world's seam: from the last column to the first, the short way, a copy round; and its lift between.
{
  const walks = new Walks({ u: 10, v: 8 });

  walks.step(
    'goer',
    { x: 9, y: 7 },
    { x: 0, y: 0 },
    point(9.5, 7.5, 0.1),
    point(0.5, 0.5, 0.3),
    0,
    pace
  );

  const ends = walks.nextEnd() ?? 0,
    [half] = walks.at(ends / 2).going,
    { ended } = walks.at(ends);

  expect(
    'over the seam, both ways a world wraps: the short way, to the copy beside it, its lift between',
    [
      half!.at.map((n) => round(n)),
      round(half!.lift),
      round(half!.facing, 3),
      ended[0]!.at,
    ],
    [[10, 8], 0.2, round(Math.atan2(1, 1), 3), [10.5, 8.5]]
  );
}

// Ending them all, as when the world's replaced: each where it is, and none left.
{
  const walks = new Walks({ u: 10, v: null });

  walks.step(
    'goer',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    point(1, 1),
    point(2, 1),
    0,
    pace
  );

  const all = walks.endAll(0);

  expect(
    'all ended at once: each where it is, and none walking',
    [
      all.map(({ units, at }) => [units, at]),
      walks.size(),
      walks.walking('goer'),
    ],
    [[[['goer'], [1, 1]]], 0, false]
  );
}

// A step joined while going at full pace, in `Walks` itself: on at the same pace, not from standing.
{
  const walks = new Walks({ u: 10, v: null }),
    east = (from: number, now: number) =>
      walks.step(
        'goer',
        { x: from, y: 1 },
        { x: from + 1, y: 1 },
        point(from, 1),
        point(from + 1, 1),
        now,
        pace
      ),
    uAt = (now: number): number => walks.at(now).going[0]!.at[0];

  east(1, 0);

  const before = uAt(200) - uAt(199);

  east(2, 200);

  const after = uAt(201) - uAt(200);

  expect(
    'a step joined at full pace goes on at it, in the walks themselves',
    [round(before * pace.step, 2), round(after * pace.step, 2)],
    [1, 1]
  );
}

// A ship and its cargo sail two squares east; the cargo then steps ashore, south, before the ship's there: on from
//  where it is, along the way the ship came, through the square's middle, not straight across the sea.
{
  const walks = new Walks({ u: 10, v: null }),
    sail = (unit: string, from: number, now: number) =>
      walks.step(
        unit,
        { x: from, y: 1 },
        { x: from + 1, y: 1 },
        point(from, 1),
        point(from + 1, 1),
        now,
        pace
      );

  sail('ship', 0, 0);
  sail('cargo', 0, 1);
  sail('ship', 1, 2);
  sail('cargo', 1, 3);

  const shipThen = walks.at(100).going[0]!.at;

  walks.step(
    'cargo',
    { x: 2, y: 1 },
    { x: 2, y: 2 },
    point(9, 9),
    point(2, 2),
    100,
    pace
  );

  const cargoAt = (now: number) =>
      walks.at(now).going.find(({ units }) => units.includes('cargo'))?.at,
    straightOn: boolean[] = [],
    cargoThen = cargoAt(100)!;

  for (let now = 100; now < 2000; now += 5) {
    const at = cargoAt(now);

    if (at === undefined) {
      break;
    }

    // Along the row till it's at the square's middle, then south.
    straightOn.push(at[0] < 1.999 ? Math.abs(at[1] - 1) < 1e-9 : true);
  }

  expect(
    'cargo stepping ashore from a ship under way goes on from where it is, along the way the ship came, through the square’s middle, then ashore',
    [
      cargoThen.map((n) => round(n)),
      shipThen.map((n) => round(n)),
      straightOn.length > 10 && straightOn.every(Boolean),
    ],
    [shipThen.map((n) => round(n)), shipThen.map((n) => round(n)), true]
  );
}

// A unit standing on a square a walk's left behind makes the same step just after: its own walk, not the one drawn a
//  square away.
{
  const walks = new Walks({ u: 10, v: null }),
    a = [
      walks.step(
        'a',
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        point(0, 1),
        point(1, 1),
        0,
        pace
      ),
      walks.step(
        'a',
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        point(9, 9),
        point(2, 1),
        1,
        pace
      ),
    ],
    b = walks.step(
      'b',
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      point(1, 1),
      point(2, 1),
      3,
      pace
    ),
    bAt = walks.at(3).going.find(({ units }) => units.includes('b'))!.at;

  expect(
    'a unit standing a square from a walk that’s just made its step walks on its own, from where it stands',
    [a[0] === a[1], b === a[0], bAt.map((n) => round(n))],
    [true, false, [1, 1]]
  );
}

// A walk its last unit leaves, stepping from elsewhere, is given up, and said so once.
{
  const walks = new Walks({ u: 10, v: null }),
    first = walks.step(
      'goer',
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      point(0, 1),
      point(1, 1),
      0,
      pace
    );

  walks.at(16);

  const second = walks.step(
    'goer',
    { x: 4, y: 1 },
    { x: 5, y: 1 },
    point(4, 1),
    point(5, 1),
    20,
    pace
  );

  expect(
    'a walk its last unit leaves for another is given up, and said so once',
    [first === second, walks.dropped(), walks.dropped(), walks.size()],
    [false, [first], [], 1]
  );
}

// Too fast to stop in time at its pace's rate, as a hurried walk joined near its end is: it slows as it must, never
//  past where it's bound or back, and stops there.
{
  const motion = plan(0, 0.95, 2 / pace.step, 1, pace),
    { forward, last } = sampled(motion, 0);
  let past = false;

  for (let now = 0; now <= motionEnds(motion) + 2; now++) {
    past ||= motionAt(motion, now).along > 1 + 1e-9;
  }

  expect(
    'too fast to stop at its rate, it slows as it must and stops where it’s bound, never past it or back',
    [forward, past, round(last)],
    [true, false, 1]
  );
}

// Facing: a step south joined late in a step east turns from where it faced, not snapping; and a walk faces the way
//  between the squares' middles, though it ends in front of a city.
{
  const walks = new Walks({ u: 10, v: null });

  walks.step(
    'goer',
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    point(0, 1),
    point(1, 1),
    0,
    pace
  );

  const late = 0.9 * (pace.step + pace.ramp),
    facedBefore = walks.at(late).going[0]!.facing;

  walks.step(
    'goer',
    { x: 1, y: 1 },
    { x: 1, y: 2 },
    point(9, 9),
    point(1, 2),
    late,
    pace
  );

  const facedAfter = walks.at(late).going[0]!.facing,
    city = new Walks({ u: 10, v: null });

  city.step(
    'goer',
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { at: [0, 1], lift: 0, middle: [0, 1] },
    { at: [1, 1.26], lift: 0, middle: [1, 1] },
    0,
    pace
  );

  const cityFacings = [50, 150, 300].map((now) =>
    round(city.at(now).going[0]!.facing)
  );

  expect(
    'a step joined late turns from where it faced, not snapping; a walk faces the way between squares’ middles, though it ends in front of a city',
    [round(facedAfter - facedBefore, 2), cityFacings],
    [0, [round(Math.PI / 2), round(Math.PI / 2), round(Math.PI / 2)]]
  );
}

// A GoTo's steps through a city, all at once: through the city square's middle, not in front of its buildings, and
//  ending in front of the last one's.
{
  const walks = new Walks({ u: 10, v: null }),
    city = (x: number): WalkPoint => ({
      at: [x, 1.26],
      lift: 0,
      middle: [x, 1],
    });

  walks.step(
    'goer',
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    point(0, 1),
    city(1),
    0,
    pace
  );
  walks.step('goer', { x: 1, y: 1 }, { x: 2, y: 1 }, city(1), city(2), 1, pace);

  const ends = walks.nextEnd() ?? 0;
  let throughMiddle = false,
    inFront = false,
    last: readonly number[] = [];

  for (let now = 1; now < ends; now++) {
    const [walker] = walks.at(now).going;

    if (walker === undefined) {
      break;
    }

    throughMiddle ||= Math.hypot(walker.at[0] - 1, walker.at[1] - 1) < 0.01;
    inFront ||= Math.hypot(walker.at[0] - 1, walker.at[1] - 1.26) < 0.01;
    last = walker.at;
  }

  expect(
    'a GoTo through a city goes through its square’s middle, not in front of its buildings, and ends in front of the last one’s',
    [throughMiddle, inFront, last.map((n) => round(n, 1))],
    [true, false, [2, 1.3]]
  );
}

// A rival's ship and its cargo: the cargo's step comes 40 ms after the ship's, at others' quicker pace, the ship well on
//  its way: it rides along, as it was where the ship was as the ship stepped.
{
  const walks = new Walks({ u: 10, v: null }),
    quick: Pace = { step: 125, ramp: 50, most: 1000 },
    ship = walks.step(
      'ship',
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      point(0, 1),
      point(1, 1),
      0,
      quick
    ),
    cargo = walks.step(
      'cargo',
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      point(0, 1),
      point(1, 1),
      40,
      quick
    );

  expect(
    'a rival’s cargo stepping 40 ms after its ship, the ship on its way, rides along',
    cargo === ship,
    true
  );
}

// A step joined while walking into a city, before it's there: it goes on from where it is, with no jump, though the
//  city's square is then one it passes.
{
  const walks = new Walks({ u: 10, v: null });

  walks.step(
    'goer',
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    point(0, 1),
    { at: [1, 1.26], lift: 0, middle: [1, 1] },
    0,
    pace
  );

  const before = walks.at(150).going[0]!.at;

  walks.step(
    'goer',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    point(9, 9),
    point(2, 1),
    150,
    pace
  );

  const after = walks.at(150).going[0]!.at;

  expect(
    'a step joined while walking into a city, before it’s there, goes on from where it is, with no jump',
    Math.hypot(after[0] - before[0], after[1] - before[1]) < 1e-9,
    true
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL walks: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS walks (${checks} checks)\n`);
