// How units walk on the 3D map (docs/3d-renderer.md §6.4, §8.2, `walks.ts`), by the clock:
//  - a walk gets up to pace from standing, goes on at it, and stops at its end, where it's bound;
//  - a step joined mid-walk goes on from where it is, at the pace it's going, with no jump or jolt;
//  - however many steps, what's left takes no longer than its most;
//  - a GoTo's steps, all at once, are one walk through each square's middle;
//  - units stepping together walk as one, and part where they step apart: one stepping on goes on along the way it
//    came; a unit standing a square from a walk doesn't join it; a walk left empty is given up;
//  - over the world's seam, the short way; facing the way between squares' middles, turning at one, and from the way
//    it faced when a step's joined late;
//  - aircraft fly an arc: up from where they'd stand and down to land, higher the further they go, with no jump when a
//    step's joined or they set off again mid-air; nothing on the ground rides into the air, and what a ship carries
//    takes off from it.

import Walks, {
  CRUISE,
  Pace,
  RIDE,
  WalkPoint,
  Walker,
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

// Ending them all, as when less motion's asked for mid-walk: each there at once, at its end, and none left.
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
    'all ended at once: each there at once, at its end, and none walking',
    [
      all.map(({ units, at }) => [units, at]),
      walks.size(),
      walks.walking('goer'),
    ],
    [[[['goer'], [2, 1]]], 0, false]
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

  // A GoTo's second step together, then a third step taken while the ship's under way at full pace, the cargo 40 ms
  //  behind it again.
  walks.step(
    'ship',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    point(9, 9),
    point(2, 1),
    41,
    quick
  );
  walks.step(
    'cargo',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    point(9, 9),
    point(2, 1),
    42,
    quick
  );

  const shipOn = walks.step(
      'ship',
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      point(9, 9),
      point(3, 1),
      150,
      quick
    ),
    cargoOn = walks.step(
      'cargo',
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      point(9, 9),
      point(3, 1),
      190,
      quick
    );

  expect(
    'a rival’s cargo stepping 40 ms after its ship, the ship on its way, rides along; and again on the next step',
    [cargo === ship, cargoOn === shipOn],
    [true, true]
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

// Ending those whose units are picked: only those, each there at once, at its end; the rest walk on.
{
  const walks = new Walks({ u: 10, v: null });

  walks.step(
    'a',
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    point(0, 1),
    point(1, 1),
    0,
    pace
  );
  walks.step(
    'b',
    { x: 4, y: 1 },
    { x: 5, y: 1 },
    point(4, 1),
    point(5, 1),
    0,
    pace
  );

  const ended = walks.endWhere((units) => units.includes('a'), 50);

  expect(
    'ending the walks whose units are picked ends those alone, there at once, at their ends',
    [
      ended.map(({ units, at }) => [units, at]),
      walks.walking('a'),
      walks.walking('b'),
    ],
    [[[['a'], [1, 1]]], false, true]
  );
}

// How high each of `walks`' walkers is flown, every ms from `from` to `to`, by its units: the first and last, the
//  highest, and the most it changes from one ms to the next. What's ended is taken from `walks`, as frames take it.
const flown = (
  walks: Walks,
  from: number,
  to: number
): Map<
  string,
  { first: number; last: number; highest: number; jump: number }
> => {
  const seen = new Map<
    string,
    { first: number; last: number; highest: number; jump: number }
  >();

  for (let now = from; now <= to; now++) {
    const { going, ended } = walks.at(now);

    [...going, ...ended].forEach(({ units, aloft }: Walker) => {
      const key = units.join('+'),
        was = seen.get(key);

      seen.set(
        key,
        was === undefined
          ? { first: aloft, last: aloft, highest: aloft, jump: 0 }
          : {
              first: was.first,
              last: aloft,
              highest: Math.max(was.highest, aloft),
              jump: Math.max(was.jump, Math.abs(aloft - was.last)),
            }
      );
    });
  }

  return seen;
};

// Flying one square, and two: up from where it would stand and down to land, half as high for the one, the most for
//  the two, with no jump; a unit that doesn't fly, the same steps, stays on the ground.
{
  const walks = new Walks({ u: 10, v: null });

  walks.step(
    'hop',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    point(1, 1),
    point(2, 1),
    0,
    pace,
    true
  );
  walks.step(
    'flight',
    { x: 1, y: 3 },
    { x: 2, y: 3 },
    point(1, 3),
    point(2, 3),
    0,
    pace,
    true
  );
  walks.step(
    'flight',
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    point(9, 9),
    point(3, 3),
    0,
    pace,
    true
  );
  walks.step(
    'foot',
    { x: 1, y: 5 },
    { x: 2, y: 5 },
    point(1, 5),
    point(2, 5),
    0,
    pace
  );

  // A quarter of the way along the hop: eased off the ground, not climbing as steeply as it can at once.
  let quarter: number | null = null;

  for (let now = 0; quarter === null && now < 2000; now++) {
    const hopping = walks.at(now).going.find(({ units }) => units[0] === 'hop');

    if (hopping !== undefined && hopping.at[0] >= 1.25) {
      quarter = hopping.aloft;
    }
  }

  const seen = flown(walks, 0, 2000),
    hop = seen.get('hop')!,
    flight = seen.get('flight')!,
    foot = seen.get('foot')!;

  expect(
    'flying a square: from where it stands, up to half as high as it goes, and down to land; two squares, the most; no jump; on foot, on the ground',
    [
      [hop.first, round(hop.highest, 2), hop.last, hop.jump < CRUISE / 50],
      [
        flight.first,
        round(flight.highest, 2),
        flight.last,
        flight.jump < CRUISE / 50,
      ],
      [foot.first, foot.highest, foot.last],
      walks.size(),
      // Eased: a share of its climb's height at a quarter of its height's share (`3t² − 2t³`).
      round(quarter ?? 0, 2),
    ],
    [
      [0, round(CRUISE / 2, 2), 0, true],
      [0, round(CRUISE, 2), 0, true],
      [0, 0, 0],
      0,
      round(CRUISE * (3 / 16 - 2 / 64), 2),
    ]
  );
}

// A long flight, its steps joined as it goes, so it lets go of the squares it's passed: on at the height it's flown,
//  with no jump, landing at the end.
{
  const walks = new Walks({ u: 20, v: null }),
    slow = { ...pace, most: 100000 };

  [1, 2, 3].forEach((x) =>
    walks.step(
      'long',
      { x, y: 1 },
      { x: x + 1, y: 1 },
      point(x, 1),
      point(x + 1, 1),
      0,
      slow,
      true
    )
  );

  // Two and a half squares along: past the square it set off from, which it's let go of.
  let joinAt = 0;

  for (let now = 0; joinAt === 0 && now < 5000; now++) {
    const [walker] = walks.at(now).going;

    if (walker !== undefined && walker.at[0] >= 3.5) {
      joinAt = now;
    }
  }

  const before = flown(walks, joinAt, joinAt).get('long')!;

  walks.step(
    'long',
    { x: 4, y: 1 },
    { x: 5, y: 1 },
    point(9, 9),
    point(5, 1),
    joinAt,
    slow,
    true
  );

  // Coming down again, most of the way to its new end: joined again, once it's let go of a square.
  let againAt = 0;
  const after = flown(walks, joinAt, joinAt).get('long')!;

  for (let now = joinAt + 1; againAt === 0 && now < 9000; now++) {
    const [walker] = walks.at(now).going;

    if (walker === undefined) {
      break;
    }

    after.jump = Math.max(after.jump, Math.abs(walker.aloft - after.last));
    after.last = walker.aloft;

    if (walker.at[0] >= 4.85) {
      againAt = now;
    }
  }

  const descending = after.last;

  walks.step(
    'long',
    { x: 5, y: 1 },
    { x: 6, y: 1 },
    point(9, 9),
    point(6, 1),
    againAt,
    slow,
    true
  );

  const rest = flown(walks, againAt, 9000).get('long')!;

  expect(
    'a long flight joined coming down, past squares it’s let go of, and again: on from the height it’s flown each time, with no jump, landing at the end',
    [
      round(before.last, 2),
      round(after.first - before.last, 6),
      after.jump < CRUISE / 50,
      againAt > 0 && descending < CRUISE / 2,
      round(rest.first - descending, 6),
      rest.jump < CRUISE / 50,
      rest.last,
    ],
    [round(CRUISE / 2, 2), 0, true, true, 0, true, 0]
  );
}

// Coming down to land, a step joined: it climbs on from where it is, with no jump, and lands at the new end. Set off
//  again from elsewhere mid-air, as a step the page missed sends: from as high as it is, with no jump. Ended at once,
//  as with less motion asked for mid-flight: landed.
{
  const walks = new Walks({ u: 10, v: null }),
    one = { ...pace, most: 100000 };

  walks.step(
    'late',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    point(1, 1),
    point(2, 1),
    0,
    one,
    true
  );

  const joinAt = 330,
    before = flown(walks, 0, joinAt).get('late')!,
    // Coming down, about a tenth of a step from landing: less than half a share of its climb.
    landing = before.last;

  walks.step(
    'late',
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    point(9, 9),
    point(3, 1),
    joinAt,
    one,
    true
  );

  const after = flown(walks, joinAt, 3000).get('late')!;

  walks.step(
    'again',
    { x: 1, y: 3 },
    { x: 2, y: 3 },
    point(1, 3),
    point(2, 3),
    0,
    one,
    true
  );
  walks.step(
    'again',
    { x: 1, y: 3 },
    { x: 2, y: 3 },
    point(1, 3),
    point(2, 3),
    0,
    one,
    true
  );

  const midway = flown(walks, 0, 200).get('again')!;

  walks.step(
    'again',
    { x: 5, y: 5 },
    { x: 6, y: 5 },
    point(9, 9),
    point(6, 5),
    200,
    one,
    true
  );

  const [setOffAgain] = walks.at(200).going,
    ended = walks.endAll(260);

  expect(
    'a step joined coming down climbs on from where it is with no jump and lands at its new end; set off again from elsewhere mid-air, as high as it was; ended at once, landed',
    [
      landing > 0 && landing < CRUISE / 2,
      round(after.first - landing, 6),
      after.jump < CRUISE / 50,
      after.highest > landing,
      after.last,
      midway.last > 0,
      round((setOffAgain?.aloft ?? 0) - midway.last, 6),
      ended.map(({ aloft }) => aloft),
    ],
    [true, 0, true, true, 0, true, 0, [0]]
  );
}

// A ship and the aircraft it carries: the ship steps, then the aircraft, the same step: it rides along, on the water.
//  A unit on foot making a flight's step just after doesn't ride into the air: its own walk, on the ground. The
//  aircraft then flies on alone from where the ship's bound: it takes off from the ship, with no jump.
{
  const walks = new Walks({ u: 10, v: null });

  walks.step(
    'ship',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    point(1, 1),
    point(2, 1),
    0,
    pace
  );

  const carried = walks.step(
    'plane',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    point(1, 1),
    point(2, 1),
    RIDE / 2,
    pace,
    true
  );

  walks.step(
    'flier',
    { x: 1, y: 3 },
    { x: 2, y: 3 },
    point(1, 3),
    point(2, 3),
    0,
    pace,
    true
  );

  const footId = walks.step(
      'foot',
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      point(1, 3),
      point(2, 3),
      RIDE / 2,
      pace
    ),
    riding = flown(walks, RIDE / 2, 200),
    { going: atTwoHundred } = walks.at(200),
    shipAt = atTwoHundred.find(({ units }) => units.includes('ship')),
    flierAt = atTwoHundred.find(({ units }) => units.includes('flier'));

  walks.step(
    'plane',
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    point(9, 9),
    point(3, 1),
    200,
    pace,
    true
  );

  const offTheShip = flown(walks, 200, 2000);

  expect(
    'an aircraft a ship carries rides with it on the water; on foot, a flight’s step is its own walk, on the ground; the aircraft flying on from the ship takes off with no jump, and the ship lands nothing',
    [
      shipAt?.units,
      carried === shipAt?.id,
      riding.get('ship+plane')?.highest,
      flierAt !== undefined && footId === flierAt.id,
      riding.get('foot')?.highest,
      (riding.get('flier')?.highest ?? 0) > 0,
      offTheShip.get('plane')?.first,
      (offTheShip.get('plane')?.highest ?? 0) > 0,
      (offTheShip.get('plane')?.jump ?? 1) < CRUISE / 50,
      offTheShip.get('plane')?.last,
      offTheShip.get('ship')?.highest,
    ],
    [['ship', 'plane'], true, 0, false, 0, true, 0, true, true, 0, 0]
  );
}

// Two aircraft flying as one; the first goes on as they come down to land, climbing again, and the second makes the
//  same step a moment later, the first already higher: it flies on with a walk of its own rather than riding along
//  with the first, so it never jumps to the first's height.
{
  const walks = new Walks({ u: 10, v: null }),
    heights: number[] = [],
    heightOf = (now: number) => {
      const { going, ended } = walks.at(now),
        walker = [...going, ...ended].find(({ units }) =>
          units.includes('second')
        );

      if (walker !== undefined) {
        heights.push(walker.aloft);
      }
    };

  ['first', 'second'].forEach((unit, index) =>
    walks.step(
      unit,
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      point(1, 1),
      point(2, 1),
      index * 10,
      pace,
      true
    )
  );

  const together = walks.size();
  let goesOn = 0;

  for (let now = 10; goesOn === 0 && now < 2000; now++) {
    heightOf(now);

    const [walker] = walks.at(now).going;

    if (walker !== undefined && walker.at[0] >= 1.8) {
      goesOn = now;
    }
  }

  const firstGoesOn = walks.step(
    'first',
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    point(9, 9),
    point(3, 1),
    goesOn,
    pace,
    true
  );

  for (let now = goesOn; now < goesOn + 40; now++) {
    heightOf(now);
  }

  const second = walks.step(
    'second',
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    point(9, 9),
    point(3, 1),
    goesOn + 40,
    pace,
    true
  );

  for (let now = goesOn + 40; now < 3000; now++) {
    heightOf(now);
  }

  const jump = heights.reduce(
    (most, height, at) =>
      at === 0 ? most : Math.max(most, Math.abs(height - heights[at - 1]!)),
    0
  );

  expect(
    'an aircraft making a step just after another, at a different height, flies on with its own walk, with no jump',
    [together, jump < CRUISE / 50, second !== firstGoesOn, heights.at(-1)],
    [1, true, true, 0]
  );
}

// Along a road as it bends (`via`): through each point it passes, with no jump or jolt in where it is or which way it
//  faces; joined on mid-bend, on along it; over the world's seam, a copy round with it; ended at once, where it's bound.
{
  // Points between (1, 1) and (2, 1), from (2, 1): a lane bowing south and back.
  const via = [
      [-0.8, 0.06],
      [-0.6, 0.1],
      [-0.5, 0],
      [-0.4, -0.08],
      [-0.2, -0.05],
    ] as const,
    bent = (u: number) => ({
      at: [u, 1] as const,
      lift: 0,
      middle: [u, 1] as const,
    }),
    walks = new Walks({ u: 10, v: null });

  walks.step(
    'lane',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    bent(1),
    { ...bent(2), via },
    0,
    pace
  );

  const seen: Walker[] = [];

  for (let now = 0; now <= 1000; now++) {
    const [walker] = walks.at(now).going;

    if (walker !== undefined) {
      seen.push(walker);
    }
  }

  const passes = via.map(([du, dv]) =>
      seen.some(
        ({ at }) => Math.hypot(at[0] - (2 + du), at[1] - (1 + dv)) < 0.01
      )
    ),
    jump = Math.max(
      ...seen
        .slice(1)
        .map(({ at }, index) =>
          Math.hypot(at[0] - seen[index]!.at[0], at[1] - seen[index]!.at[1])
        )
    ),
    turn = Math.max(
      ...seen.slice(1).map(({ facing }, index) => {
        const delta = facing - seen[index]!.facing;

        return Math.abs(
          delta - Math.PI * 2 * Math.round(delta / (Math.PI * 2))
        );
      })
    ),
    // Turned off due east as it bows, towards the south and the north.
    south = seen.some(({ facing }) => Math.abs(facing - Math.PI / 2) > 0.2);

  // Joined mid-bend: a step on east, as a GoTo's next.
  const joining = new Walks({ u: 10, v: null });

  joining.step(
    'lane',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    bent(1),
    { ...bent(2), via },
    0,
    pace
  );

  const before: Walker[] = [];

  for (let now = 0; now <= 150; now++) {
    before.push(joining.at(now).going[0]!);
  }

  joining.step(
    'lane',
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    bent(9),
    { ...bent(3), via },
    150,
    pace
  );

  const after = joining.at(150).going[0]!,
    joinedOn = [
      Math.hypot(
        after.at[0] - before.at(-1)!.at[0],
        after.at[1] - before.at(-1)!.at[1]
      ) < 0.01,
      Math.abs(after.facing - before.at(-1)!.facing) < 0.1,
    ];

  // Over the seam: from the last column to the first, a world 10 across, its points a copy round with it.
  const seam = new Walks({ u: 10, v: null });

  seam.step(
    'lane',
    { x: 9, y: 1 },
    { x: 0, y: 1 },
    bent(9.5),
    { ...bent(0.5), via },
    0,
    pace
  );

  const overSeam: Walker[] = [];

  for (let now = 0; now <= 1000; now++) {
    const [walker] = seam.at(now).going;

    if (walker !== undefined) {
      overSeam.push(walker);
    }
  }

  const seamPasses = via.every(([du, dv]) =>
    overSeam.some(
      ({ at }) => Math.hypot(at[0] - (10.5 + du), at[1] - (1 + dv)) < 0.01
    )
  );

  // Bound for a city, standing in front of its buildings: the points it passes are from the square's middle, not from
  //  where it stands.
  const toCity = new Walks({ u: 10, v: null });

  toCity.step(
    'lane',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    bent(1),
    { at: [2, 1.26], lift: 0, middle: [2, 1], via },
    0,
    pace
  );

  const intoCity: Walker[] = [];

  for (let now = 0; now <= 1000; now++) {
    const [walker] = toCity.at(now).going;

    if (walker !== undefined) {
      intoCity.push(walker);
    }
  }

  const cityPasses = via.every(([du, dv]) =>
    intoCity.some(
      ({ at }) => Math.hypot(at[0] - (2 + du), at[1] - (1 + dv)) < 0.01
    )
  );

  // Ended at once mid-bend: where it's bound.
  const cut = new Walks({ u: 10, v: null });

  cut.step(
    'lane',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    bent(1),
    { ...bent(2), via },
    0,
    pace
  );

  const [ended] = cut.endAll(100);

  expect(
    'along a road as it bends: through each point it passes, no jump or jolt, facing the way it goes, turning with it as it bows; joined mid-bend, on along it; over the seam, a copy round; into a city, from its middle, not where it stands; ended at once, where it’s bound',
    [
      passes,
      jump < 0.02,
      turn < 0.2,
      south,
      joinedOn,
      seamPasses,
      cityPasses,
      ended?.at.map((n) => round(n, 6)),
    ],
    [via.map(() => true), true, true, true, [true, true], true, true, [2, 1]]
  );
}

// Doubling back along a bending road, its two steps at once, as a GoTo's come, or a unit stepping straight back: it
//  turns round at the square's middle one way, with no snap half way round; and the same round a sharp corner. Joined
//  mid-bend, it turns on smoothly after.
{
  const bowSouth = [
      [-0.8, 0.06],
      [-0.6, 0.1],
      [-0.5, 0],
      [-0.4, -0.08],
      [-0.2, -0.05],
    ] as const,
    // The same lane back west, its points from (1, 1), the square it's going back to, in the order it passes them.
    bowBack = bowSouth.map(([du, dv]) => [1 + du, dv] as const).reverse(),
    // A sharp corner: on south-west from (2, 1) to (1, 2), bowing a little, its points from (1, 2).
    corner = [
      [0.8, -0.85],
      [0.6, -0.62],
      [0.4, -0.38],
      [0.2, -0.18],
    ] as const,
    square = (u: number, v: number) => ({
      at: [u, v] as const,
      lift: 0,
      middle: [u, v] as const,
    }),
    // The biggest turn from one ms to the next, the short way round, across two steps given at once.
    turning = (second: {
      to: { x: number; y: number };
      at: [number, number];
      via: readonly (readonly [number, number])[];
    }) => {
      const walks = new Walks({ u: 10, v: null });

      walks.step(
        'lane',
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        square(1, 1),
        { ...square(2, 1), via: bowSouth },
        0,
        pace
      );
      walks.step(
        'lane',
        { x: 2, y: 1 },
        second.to,
        square(9, 9),
        { ...square(...second.at), via: second.via },
        0,
        pace
      );

      let most = 0,
        was: number | null = null;

      for (let now = 0; now <= 2000; now++) {
        const [walker] = walks.at(now).going;

        if (walker === undefined) {
          break;
        }

        if (was !== null) {
          const delta = walker.facing - was;

          most = Math.max(
            most,
            Math.abs(delta - Math.PI * 2 * Math.round(delta / (Math.PI * 2)))
          );
        }

        was = walker.facing;
      }

      return most;
    };

  // Joined at any time along the first step, as a step back west comes late: the turn from one ms to the next for
  //  300 ms after, the most of any join.
  let afterJoin = 0;

  for (let joinAt = 10; joinAt <= 420; joinAt += 10) {
    const joining = new Walks({ u: 10, v: null });

    joining.step(
      'lane',
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      square(1, 1),
      { ...square(2, 1), via: bowSouth },
      0,
      pace
    );

    let was: number | null = null;

    for (let now = 0; now <= joinAt + 300; now++) {
      if (now === joinAt) {
        joining.step(
          'lane',
          { x: 2, y: 1 },
          { x: 1, y: 1 },
          square(9, 9),
          { ...square(1, 1), via: bowBack },
          joinAt,
          pace
        );
      }

      const [walker] = joining.at(now).going;

      if (walker === undefined) {
        break;
      }

      if (was !== null) {
        const delta = walker.facing - was;

        afterJoin = Math.max(
          afterJoin,
          Math.abs(delta - Math.PI * 2 * Math.round(delta / (Math.PI * 2)))
        );
      }

      was = walker.facing;
    }
  }

  expect(
    'doubling back along a bending road, or round a sharp corner, it turns at the middle with no snap; joined at any time along the step, it turns on smoothly',
    [
      turning({ to: { x: 1, y: 1 }, at: [1, 1], via: bowBack }) < 0.2,
      turning({ to: { x: 1, y: 2 }, at: [1, 2], via: corner }) < 0.2,
      afterJoin < 0.2,
    ],
    [true, true, true]
  );
}

// Along a bending road, a single step: it sets off facing straight for the square it's going to, as it stood, having
//  turned to face it, and stops facing so, as it'll stand, turning to and from the road's way as it goes.
{
  const walks = new Walks({ u: 10, v: null }),
    lane = [
      [-0.8, 0.06],
      [-0.6, 0.1],
      [-0.5, 0],
      [-0.4, -0.08],
      [-0.2, -0.05],
    ] as const,
    square = (u: number) => ({
      at: [u, 1] as const,
      lift: 0,
      middle: [u, 1] as const,
    });

  walks.step(
    'lane',
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    square(1),
    { ...square(2), via: lane },
    0,
    pace
  );

  const facings: number[] = [];
  let ended: Walker | undefined;

  for (let now = 0; now <= 1000 && ended === undefined; now++) {
    const { going, ended: over } = walks.at(now);

    going.forEach(({ facing }) => facings.push(facing));
    [ended] = over;
  }

  const jump = Math.max(
    ...facings
      .slice(1)
      .map((facing, index) => Math.abs(facing - facings[index]!))
  );

  expect(
    'along a bending road, it sets off and stops facing straight for the square it’s going to, as it stands, with no snap',
    [
      round(facings[0]!, 6),
      round(facings.at(-1)!, 2),
      round(ended?.facing ?? 0, 6),
      jump < 0.2,
      facings.some((facing) => Math.abs(facing - Math.PI / 2) > 0.2),
    ],
    [
      round(Math.PI / 2, 6),
      round(Math.PI / 2, 2),
      round(Math.PI / 2, 6),
      true,
      true,
    ]
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
