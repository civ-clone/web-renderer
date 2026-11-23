// Shots on the 3D map (plan 2.2, `shots.ts`):
//  - each figure's shots leave as its clip says, each figure a little after the one before, in the order they leave;
//  - a squad's land a little apart, across the way they go, the middle one where it's aimed;
//  - each flies from where it leaves to where it lands in an arc, rising most at its middle, the further it goes.

import {
  SHOT_ARC,
  SHOT_SPREAD,
  landsAt,
  shotAt,
  shotTimes,
} from '@civ-clone/ui-map-3d/shots';

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

expect(
  'a squad’s shots land a little apart, across the way they go, the middle one where it’s aimed; one going nowhere lands where it’s aimed',
  [
    [0, 1, 2].map((figure) =>
      rounded(landsAt([0, 0.2, 0], [1, 0.05, 0], figure, 3))
    ),
    rounded(landsAt([0, 0, 0], [0, 0, 2], 0, 2)),
    rounded(landsAt([1, 0, 1], [1, 0.1, 1], 0, 3)),
  ],
  [
    [
      [1, 0.05, -SHOT_SPREAD],
      [1, 0.05, 0],
      [1, 0.05, SHOT_SPREAD],
    ],
    [SHOT_SPREAD / 2, 0, 2],
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

if (failures.length > 0) {
  process.stderr.write(
    `FAIL shots3d: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS shots3d (${checks} checks)\n`);
