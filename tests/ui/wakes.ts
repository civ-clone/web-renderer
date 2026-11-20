// The wakes ships leave on the 3D map (docs/3d-renderer.md §6.4, §8.2, `wakes.ts`), by the clock:
//  - a ship sailing lays a point every little way along its way, however few the frames, and the newest follows it,
//    so the wake reaches it;
//  - a ship stopped, or no longer drawn sailing, isn't followed, and its wake thins away, told gone once, with its
//    last point;
//  - its foam is two lines, one each side of its path, spreading out in a V behind it and thinning to nothing, lying
//    just over the sea.

import Wakes, {
  WAKE_EVERY,
  WAKE_LIFE,
  WAKE_LIFT,
  WAKE_SPREAD,
  WAKE_WIDTH,
  wakeShape,
} from '@civ-clone/ui-map-3d/wakes';

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

// A ship sailing east a hundredth of a square every 10 ms, for 400 ms: a point laid every `WAKE_EVERY`, the newest
//  where the ship is, the oldest where it set off, each older the further back.
{
  const wakes = new Wakes();

  for (let now = 0; now <= 400; now += 10) {
    wakes.trail('ship', [1 + now / 1000, 2], now);
  }

  const {
      going: [wake],
    } = wakes.at(400),
    points = wake?.points ?? [];

  expect(
    'a ship sailing lays a point each time it’s gone a little way, the newest where it is, the oldest where it set off, each older the further back',
    [
      wake?.id,
      points.length,
      points[0]?.at,
      points[0]?.age,
      points.at(-1)?.at,
      points.at(-1)?.age,
      points.every(
        ({ age }, index) => index === 0 || age > points[index - 1]!.age
      ),
      points
        .slice(1, -1)
        .every(
          ({ at }, index) =>
            round(Math.hypot(at[0] - points[index + 2]!.at[0], 0), 3) >=
            WAKE_EVERY - 0.0001
        ),
    ],
    ['ship', 11, [1.4, 2], 0, [1, 2], 400, true, true]
  );
}

// Told where the ship is every 10 ms, or every 100 ms, as when frames are few: the same points laid, every
//  `WAKE_EVERY` along its way, each as old as when the ship passed it.
{
  const laid = (every: number) => {
    const wakes = new Wakes();

    for (let now = 0; now <= 400; now += every) {
      wakes.trail('ship', [1 + now / 1000, 2], now);
    }

    return (wakes.at(400).going[0]?.points ?? []).map(({ at, age }) => [
      round(at[0], 6),
      round(at[1], 6),
      round(age, 3),
    ]);
  };

  const fine = laid(10),
    coarse = laid(100);

  expect(
    'told every 10 ms or every 100 ms, the same points laid, each as old as when the ship passed it',
    [coarse.length, JSON.stringify(coarse) === JSON.stringify(fine)],
    [fine.length, true]
  );
}

// Stopped, no longer followed: it thins away, the oldest first; told gone once, with its last point, and nothing left.
//  One still sailing, its newest point always new, stays. All of them gone at once, as with less motion asked for.
{
  const wakes = new Wakes();

  for (let now = 0; now <= 200; now += 10) {
    wakes.trail('stops', [now / 1000, 0], now);
    wakes.trail('sails', [now / 1000, 5], now);
  }

  const heldOn: number[] = [],
    // Where its oldest point left still is, as the ship was: further on each time one's gone.
    oldestAt: number[] = [],
    told: string[][] = [];

  for (let now = 210; now <= 200 + WAKE_LIFE + 50; now += 10) {
    wakes.trail('sails', [now / 1000, 5], now);

    const { going, gone } = wakes.at(now),
      stops = going.find(({ id }) => id === 'stops');

    heldOn.push(stops?.points.length ?? 0);
    oldestAt.push(stops?.points.at(-1)?.at[0] ?? Infinity);
    told.push(gone);
  }

  const sailing = wakes.at(200 + WAKE_LIFE + 60).going.map(({ id }) => id),
    ended = wakes.endAll();

  expect(
    'stopped, a wake lays no more and thins away, oldest first; told gone once, with its last point; one still sailing stays; all gone at once',
    [
      heldOn.every(
        (count, index) => index === 0 || count <= heldOn[index - 1]!
      ),
      heldOn.at(-1),
      // Where the oldest point left is, while any is: further on each time one's gone.
      (() => {
        const finite = oldestAt.filter(Number.isFinite);

        return (
          finite.every(
            (at, index) => index === 0 || at >= finite[index - 1]!
          ) && finite[0]! < finite.at(-1)!
        );
      })(),
      told.flat(),
      sailing,
      ended,
      wakes.size(),
    ],
    [true, 0, true, ['stops'], ['sails'], ['sails'], 0]
  );
}

// Still sailing, though no point's been laid for longer than a wake lasts, as with a tab out of sight: from where the
//  ship is now, afresh, not from where it was.
{
  const wakes = new Wakes();

  wakes.trail('ship', [0, 0], 0);
  wakes.trail('ship', [0.01, 0], WAKE_LIFE + 300);

  const left = wakes.at(WAKE_LIFE + 300).going[0]?.points.length;

  wakes.trail('ship', [0.02, 0], WAKE_LIFE + 310);

  expect(
    'still sailing after longer than a wake lasts: afresh from where the ship is',
    [left, wakes.at(WAKE_LIFE + 310).going[0]?.points],
    [
      1,
      [
        { at: [0.02, 0], age: 0 },
        { at: [0.02, 0], age: 0 },
      ],
    ]
  );
}

// Its foam: from a straight wake east, two lines, one each side of the path, as far either side of it, lying just over
//  the sea; spreading out the further back, and thinning to nothing at its end. Nothing with only one place in it.
{
  const points = [0, 1, 2, 3, 4].map((index) => ({
      at: [5 - index * 0.1, 3] as const,
      age: (index * WAKE_LIFE) / 4,
    })),
    shape = wakeShape(points),
    corners = Array.from({ length: shape.length / 3 }, (_, index) => [
      shape[index * 3]!,
      shape[index * 3 + 1]!,
      shape[index * 3 + 2]!,
    ]),
    // Each side's corners, apart from the path (`z`), by how far back (`x`).
    side = (sign: number) => corners.filter(([, , z]) => Math.sign(z) === sign),
    spreadAt = (sign: number, x: number) =>
      side(sign)
        .filter(([cx]) => Math.abs(cx - x) < 1e-9)
        .map(([, , z]) => Math.abs(z)),
    widthAt = (x: number) => {
      const zs = spreadAt(1, x);

      return round(Math.max(...zs) - Math.min(...zs), 4);
    };

  expect(
    'a wake’s foam: two lines either side of the path, as far either side, just over the sea; spreading further back and thinning to nothing at its end; nothing with only one place in it',
    [
      corners.length,
      corners.every(([, y]) => y === WAKE_LIFT),
      side(1).length === side(-1).length,
      round(Math.min(...spreadAt(1, 0)) + widthAt(0) / 2, 4),
      round(Math.min(...spreadAt(1, -0.4)) + widthAt(-0.4) / 2, 4),
      widthAt(0),
      widthAt(-0.4),
      wakeShape([
        { at: [1, 1], age: 0 },
        { at: [1, 1], age: 10 },
      ]).length,
      wakeShape([]).length,
    ],
    [
      // Two sides, four segments, two triangles each.
      2 * 4 * 6,
      true,
      true,
      round(WAKE_SPREAD.start, 4),
      round(
        WAKE_SPREAD.start +
          WAKE_SPREAD.by * Math.min(1, 0.4 / WAKE_SPREAD.over),
        4
      ),
      round(WAKE_WIDTH, 4),
      0,
      0,
      0,
    ]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL wakes: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS wakes (${checks} checks)\n`);
