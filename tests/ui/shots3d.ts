// Shots on the 3D map (plan 2.2, `shots.ts`):
//  - each figure's shots leave as its clip says, each figure a little after the one before, in the order they leave;
//  - a squad's land a little apart, across the way they go, each on its figure's side, the middle one where it's aimed;
//  - each flies from where it leaves to where it lands in an arc, rising most at its middle, the further it goes;
//  - each kind as it goes: a bottle as the first did, a bullet straight and quick, a shell slow, a stone lobbed high;
//    each pointing the way it's going; what isn't said a bottle.

import {
  HIT_PUFF,
  MUZZLE_PUFF,
  SHOT_ARC,
  SHOT_LOOKS,
  SHOT_SPREAD,
  acrossSquad,
  kindOf,
  landsAt,
  shotAt,
  shotHeading,
  shotOver,
  shotTimes,
  shotsFired,
} from '@civ-clone/ui-map-3d/shots';
import { seedOf } from '@civ-clone/ui-map-3d/stage';
import { SHOT_KINDS } from '@civ-clone/ui-map-3d/models/modelSet';

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

const round = (value: number): number => Math.round(value * 1000) / 1000,
  rounded = (point: readonly number[]) => point.map(round);

expect(
  'a squad of three, two shots each: each figure’s a little after the one before, in the order they leave; with no figures said, one',
  [
    shotTimes(
      [
        { at: 0.5, joint: 'prop' },
        { at: 0.2, joint: 'muzzle' },
      ],
      3,
      0.13
    ).map(({ figure, shot, joint, leaves }) => [
      figure,
      shot,
      joint,
      round(leaves),
    ]),
    shotTimes([{ at: 0.5, joint: 'prop' }], 0, 0.13).length,
  ],
  [
    [
      [0, 1, 'muzzle', 0.2],
      [1, 1, 'muzzle', 0.33],
      [2, 1, 'muzzle', 0.46],
      [0, 0, 'prop', 0.5],
      [1, 0, 'prop', 0.63],
      [2, 0, 'prop', 0.76],
    ],
    1,
  ]
);

// A squad of three stands back-middle, then at its right and its left (`formation`, unturned, facing south, its right
//  -`u`). Facing east (+`u`), its right is +`v`: so the second, at its right, leaves on that side of the middle, and
//  its shot lands there, as the third's lands at its left, none crossing (#1405).
expect(
  'a squad’s shots land a little apart, across the way they go, each on the side its figure stands, the middle one where it’s aimed, none crossing; two on their own sides; more than a squad in order; one going nowhere lands where it’s aimed',
  [
    [0, 1, 2].map((figure) =>
      rounded(landsAt([0, 0.2, 0], [1, 0.05, 0], figure, 3))
    ),
    [0, 1, 2].map((figure) => acrossSquad(figure, 3)),
    rounded(landsAt([0, 0, 0], [0, 0, 2], 0, 2)),
    [0, 1, 2, 3].map((figure) => acrossSquad(figure, 4)),
    rounded(landsAt([1, 0, 1], [1, 0.1, 1], 0, 3)),
  ],
  [
    [
      [1, 0.05, 0],
      [1, 0.05, SHOT_SPREAD],
      [1, 0.05, -SHOT_SPREAD],
    ],
    // Left to right: the third, the middle, the second.
    [1, 2, 0],
    // Going south (+`v`), the first of two, at its right, lands west, at the right of the way it goes.
    [-SHOT_SPREAD / 2, 0, 2],
    [0, 1, 2, 3],
    [1, 0.1, 1],
  ]
);

expect(
  'a shot flies from where it leaves to where it lands, rising over the line between them most at its middle, the further it goes, and no further either side',
  [
    rounded(shotAt([0, 0.2, 0], [2, 0, 0], 0)),
    rounded(shotAt([0, 0.2, 0], [2, 0, 0], 0.5)),
    rounded(shotAt([0, 0.2, 0], [2, 0, 0], 1)),
    rounded(shotAt([0, 0.2, 0], [2, 0, 0], 1.5)),
    rounded(shotAt([0, 0, 0], [0, 0, 1], 0.25)),
  ],
  [
    [0, 0.2, 0],
    [1, round(0.1 + SHOT_ARC * 2), 0],
    [2, 0, 0],
    [2, 0, 0],
    [0, round(SHOT_ARC * 0.75), 0.25],
  ]
);

// Each kind as it goes.
{
  const from: [number, number, number] = [0, 0.3, 0],
    to: [number, number, number] = [3, 0.1, 4],
    // Where it is a little either side of `through`, to see which way it's going there.
    tangent = (through: number, arc: number): number[] => {
      const a = shotAt(from, to, through - 1e-4, arc),
        b = shotAt(from, to, through + 1e-4, arc),
        d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
        length = Math.hypot(d[0]!, d[1]!, d[2]!);

      return d.map((n) => round(n / length));
    };

  expect(
    'a bottle goes as the first did; a bullet straight, and quickest, with smoke where it leaves; a shell slowest, with smoke, its burst flashing; a stone lobbed highest, with neither; an arrow neither; every kind the map reads has a look',
    [
      SHOT_LOOKS.bottle.flight === 350 && SHOT_LOOKS.bottle.arc === SHOT_ARC,
      SHOT_LOOKS.bottle.hit === 1 &&
        SHOT_LOOKS.bottle.muzzle === 0 &&
        !SHOT_LOOKS.bottle.burst,
      rounded(shotAt(from, to, 0.5, SHOT_LOOKS.bullet.arc)),
      Object.entries(SHOT_LOOKS)
        .sort(([, a], [, b]) => a.flight - b.flight)
        .map(([kind]) => kind),
      SHOT_LOOKS.bullet.muzzle > 0 && SHOT_LOOKS.shell.muzzle > 0,
      SHOT_LOOKS.arrow.muzzle,
      SHOT_LOOKS.shell.burst && !SHOT_LOOKS.bullet.burst,
      Math.max(...Object.values(SHOT_LOOKS).map(({ arc }) => arc)) ===
        SHOT_LOOKS.stone.arc &&
        SHOT_LOOKS.stone.muzzle === 0 &&
        !SHOT_LOOKS.stone.burst,
      SHOT_KINDS.every((kind) => SHOT_LOOKS[kind] !== undefined),
    ],
    [
      true,
      true,
      [1.5, 0.2, 2],
      ['bullet', 'bottle', 'arrow', 'stone', 'shell'],
      true,
      0,
      true,
      true,
      true,
    ]
  );

  expect(
    'each points the way it’s going, one long: rising as it leaves, level at its middle, falling as it lands, or along the line, straight',
    [
      [0.1, 0.5, 0.9].map((through) =>
        rounded(shotHeading(from, to, through, SHOT_ARC))
      ),
      [0.1, 0.9].map((through) =>
        Math.sign(shotHeading(from, to, through, SHOT_ARC)[1])
      ),
      round(Math.hypot(...shotHeading(from, to, 0.3, 0.35))),
      rounded(shotHeading(from, to, 0.5, 0)),
      round(shotHeading([0, 0, 0], [2, 0, 0], 0.5, SHOT_ARC)[1]),
    ],
    [
      [0.1, 0.5, 0.9].map((through) => tangent(through, SHOT_ARC)),
      [1, -1],
      1,
      tangent(0.5, 0),
      0,
    ]
  );

  expect(
    'what a shot doesn’t say it is, a bottle; each figure’s shot what its clip says; the last of a shot’s own over, its puff, its smoke over first',
    [
      kindOf({}),
      kindOf({ kind: 'shell' }),
      shotTimes(
        [
          { at: 0.5, joint: 'muzzle', kind: 'bullet' },
          { at: 0.2, joint: 'prop' },
        ],
        2,
        0.1
      ).map(({ figure, kind }) => [figure, kind]),
      shotOver('bullet'),
      shotOver('bottle'),
      // The smoke where one leaves is over before the puff where it lands.
      MUZZLE_PUFF <= HIT_PUFF,
    ],
    [
      'bottle',
      'shell',
      [
        [0, 'bottle'],
        [1, 'bottle'],
        [0, 'bullet'],
        [1, 'bullet'],
      ],
      80 + HIT_PUFF,
      350 + HIT_PUFF,
      true,
    ]
  );
}

// Lost, falling at the blow: only the shots each figure fires before it falls, each figure falling as far behind the
//  one before as it fires. Won, every one.
{
  const volleys = shotTimes(
      [
        { at: 0.4, joint: 'muzzle', kind: 'bullet' },
        { at: 1, joint: 'muzzle', kind: 'bullet' },
      ],
      3,
      0.13
    ),
    fired = (falls: number | null) =>
      shotsFired(volleys, falls).map(({ figure, shot }) => [figure, shot]);

  expect(
    'won, every shot’s fired; lost, falling at the blow, each figure’s first volley, before it, and none of its second, after',
    [fired(null).length, fired(0.48)],
    [
      6,
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    ]
  );
}

// What's laid by an id: the same each time, and different for a shot's smoke where it left and its puff where it
//  landed, a word apart.
expect(
  'seeds by the whole id: the same each time, a shot’s smoke and its puff apart',
  [
    seedOf('battle-1-shot-0-muzzle') === seedOf('battle-1-shot-0-muzzle'),
    seedOf('battle-1-shot-0-muzzle') !== seedOf('battle-1-shot-0-hit'),
    seedOf('battle-10-puff') !== seedOf('battle-1-shot-0-hit'),
    [seedOf('a'), seedOf('battle-7')].every(
      (seed) => Number.isInteger(seed) && seed >= 0 && seed < 100000
    ),
  ],
  [true, true, true, true]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL shots3d: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS shots3d (${checks} checks)\n`);
