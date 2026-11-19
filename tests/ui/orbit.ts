// The 3D map's camera (docs/3d-renderer.md §9.1, plan 1.2), as numbers, at every yaw and pitch:
//  - it looks at its focus from its distance, and a ray through the middle of the screen meets the ground there;
//  - a ray from above the horizon never meets the ground;
//  - dragging keeps the ground under the pointer;
//  - its pitch and distance stay in range, its focus on the world, and a glide goes the short way round;
//  - the presets, and the copies of the world it sees.

import {
  DISTANCE_MAX,
  DISTANCE_MIN,
  FIELD_OF_VIEW,
  Orbit,
  PITCH_MAX,
  PITCH_MIN,
  ZOOM_STEP,
  between,
  clampOrbit,
  defaultOrbit,
  eye,
  groundAt,
  panned,
  presetFor,
  settled,
  toScreen,
  zoomed,
} from '@civ-clone/ui-map-3d/camera/orbit';
import { copiesNear } from '@civ-clone/ui-map-3d/stage';

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

const near = (a: number, b: number, within = 1e-6): boolean =>
    Math.abs(a - b) < within,
  degrees = (value: number): number => (value * Math.PI) / 180,
  yaws = Array.from({ length: 12 }, (_, n) => degrees(n * 30 + 7)),
  pitches = Array.from({ length: 12 }, (_, n) => degrees(25 + n * 5)),
  orbits: Orbit[] = yaws.flatMap((yaw) =>
    pitches.map((pitch) => ({
      focus: [12.5, 30.25] as const,
      yaw,
      pitch,
      distance: 20,
    }))
  ),
  height = 0.3,
  aspect = 16 / 9,
  // A seeded spread of points on the screen, low enough to see the ground at the lowest pitch.
  screenPoints: [number, number][] = Array.from({ length: 9 }, (_, n) => [
    ((n * 0.37) % 1.6) - 0.8,
    -0.9 + ((n * 0.23) % 0.9),
  ]);

expect(
  'at every yaw and pitch, it is its distance from its focus, which the middle of the screen looks at',
  orbits.filter((orbit) => {
    const [x, y, z] = eye(orbit, height),
      middle = groundAt(orbit, height, [0, 0], aspect);

    return !(
      near(
        Math.hypot(x - orbit.focus[0], y - height, z - orbit.focus[1]),
        20
      ) &&
      y > height &&
      middle !== null &&
      near(middle[0], orbit.focus[0]) &&
      near(middle[1], orbit.focus[1])
    );
  }).length,
  0
);

expect(
  'at a yaw of 0 it looks north, from the south; a quarter turn on, east, from the west',
  [
    eye({ ...orbits[0]!, yaw: 0 }, 0).map((value) => Math.round(value * 100)),
    eye({ ...orbits[0]!, yaw: Math.PI / 2 }, 0)[0] < 12.5,
  ],
  [
    [
      1250,
      Math.round(Math.sin(orbits[0]!.pitch) * 2000),
      Math.round((30.25 + Math.cos(orbits[0]!.pitch) * 20) * 100),
    ],
    true,
  ]
);

expect(
  'the ground under the right of the screen is to the right of the focus, and under the top further away',
  orbits.filter((orbit) => {
    const right = groundAt(orbit, height, [0.5, 0], aspect)!,
      top = groundAt(orbit, height, [0, 0.3], aspect)!,
      [ex, , ez] = eye(orbit, height),
      // Along the screen's right, on the ground: the yaw's bearing turned a quarter clockwise.
      across =
        (right[0] - orbit.focus[0]) * Math.cos(orbit.yaw) +
        (right[1] - orbit.focus[1]) * Math.sin(orbit.yaw);

    return !(
      across > 0 &&
      Math.hypot(top[0] - ex, top[1] - ez) >
        Math.hypot(orbit.focus[0] - ex, orbit.focus[1] - ez)
    );
  }).length,
  0
);

// The horizon is as far up the screen as the camera looks down: just above it, a ray never meets the ground; just
//  below, it does.
const horizon = (orbit: Orbit): number =>
  Math.tan(orbit.pitch) / Math.tan(FIELD_OF_VIEW / 2);

expect(
  'a ray from just above the horizon never meets the ground, and one from just below does',
  orbits.filter(
    (orbit) =>
      groundAt(orbit, height, [0, horizon(orbit) * 1.001], aspect) !== null ||
      groundAt(orbit, height, [0, horizon(orbit) * 0.999], aspect) === null
  ).length,
  0
);

expect(
  'a point on the ground goes back to where it was on the screen, at every yaw and pitch; one behind the camera has no place there',
  [
    orbits.flatMap((orbit) =>
      screenPoints.flatMap((point) => {
        const ground = groundAt(orbit, height, point, aspect, 0.05),
          back =
            ground === null
              ? null
              : toScreen(orbit, height, [ground[0], 0.05, ground[1]], aspect);

        return back !== null &&
          Math.abs(back[0] - point[0]) < 1e-9 &&
          Math.abs(back[1] - point[1]) < 1e-9
          ? []
          : [[orbit.yaw, orbit.pitch, point]];
      })
    ).length,
    orbits.every((orbit) => {
      const [x, y, z] = eye(orbit, height),
        [u, , v] = [orbit.focus[0], 0, orbit.focus[1]];

      // Past the camera, the other way from its focus.
      return (
        toScreen(orbit, height, [2 * x - u, y, 2 * z - v], aspect) === null
      );
    }),
  ],
  [0, true]
);

expect(
  'dragging keeps the ground under the pointer, at every yaw and pitch',
  orbits.flatMap((orbit) =>
    screenPoints.slice(1).flatMap((to, n) => {
      const from = screenPoints[n]!,
        under = groundAt(orbit, height, from, aspect),
        moved = panned(orbit, height, from, to, aspect),
        after = groundAt(moved, height, to, aspect);

      return under !== null &&
        after !== null &&
        near(under[0], after[0], 1e-6) &&
        near(under[1], after[1], 1e-6)
        ? []
        : [[orbit.yaw, orbit.pitch, from, to]];
    })
  ).length,
  0
);

const skyward = panned(orbits[0]!, height, [0, 0.99], [0, 0.5], aspect);

expect(
  'dragging from above the horizon still moves the map, by as much as the middle of the screen would',
  [
    Number.isFinite(skyward.focus[0]) && Number.isFinite(skyward.focus[1]),
    skyward.focus[0] !== orbits[0]!.focus[0] ||
      skyward.focus[1] !== orbits[0]!.focus[1],
  ],
  [true, true]
);

expect(
  'its pitch and distance stay in range, and its yaw within a turn',
  [
    clampOrbit({ ...orbits[0]!, pitch: 0, distance: 1, yaw: -Math.PI / 2 }),
    clampOrbit({ ...orbits[0]!, pitch: 2, distance: 1000, yaw: 7 }),
  ].map(({ pitch, distance, yaw }) => [
    near(pitch, PITCH_MIN) || near(pitch, PITCH_MAX),
    distance,
    yaw >= 0 && yaw < Math.PI * 2,
  ]),
  [
    [true, DISTANCE_MIN, true],
    [true, DISTANCE_MAX, true],
  ]
);

expect(
  'a step of zoom brings it nearer by the step, and out again, until it can go no further',
  [
    near(zoomed(orbits[0]!, 1).distance, 20 / ZOOM_STEP),
    near(zoomed(zoomed(orbits[0]!, 3), -3).distance, 20),
    zoomed(orbits[0]!, 100).distance,
    zoomed(orbits[0]!, -100).distance,
  ],
  [true, true, DISTANCE_MIN, DISTANCE_MAX]
);

const wraps = { u: 80, v: 50 },
  stops = { u: 80, v: null };

expect(
  'its focus is kept on the world: round its period, and within its rows where it does not wrap over the poles',
  [
    settled({ ...orbits[0]!, focus: [-3, 52] }, wraps, 50).focus,
    settled({ ...orbits[0]!, focus: [83, -4] }, stops, 47).focus,
    settled({ ...orbits[0]!, focus: [10, 49] }, stops, 47).focus,
  ],
  [
    [77, 2],
    [3, 0],
    [10, 47],
  ]
);

const across = between(
    { ...orbits[0]!, focus: [78, 10], yaw: degrees(350) },
    { ...orbits[0]!, focus: [2, 10], yaw: degrees(10) },
    0.5,
    wraps
  ),
  ends = [0, 1].map((t) =>
    between(
      { ...orbits[0]!, focus: [78, 10], distance: 10 },
      { ...orbits[0]!, focus: [2, 12], distance: 30 },
      t,
      wraps
    )
  );

expect(
  'a glide goes the short way round the world and round the compass, and starts and ends where it should',
  [
    near(settled(across, wraps, 50).focus[0], 0) ||
      near(settled(across, wraps, 50).focus[0], 80),
    near(Math.cos(across.yaw), 1),
    ends[0]!.focus,
    [settled(ends[1]!, wraps, 50).focus, ends[1]!.distance],
  ],
  [true, true, [78, 10], [[2, 12], 30]]
);

expect(
  'the classic view is the default, and the isometric view turns only the square grid',
  [
    defaultOrbit([0, 0]).pitch === presetFor('classic', 'square').pitch,
    near(presetFor('isometric', 'square').yaw, degrees(45)),
    presetFor('isometric', 'hex-odd-r').yaw,
    presetFor('isometric', 'staggered-iso').yaw,
  ],
  [true, true, 0, 0]
);

// The copies of the world in sight: every copy whose ground comes within sight of the focus, and no other.
const covered = (
  focus: [number, number],
  sight: number,
  period: { u: number; v: number | null }
): boolean => {
  const copies = copiesNear(focus, sight, period);

  // Every point within sight lies on one of the copies drawn.
  return Array.from({ length: 41 }, (_, n) => n / 20 - 1).every((du) =>
    Array.from({ length: 41 }, (_, n) => n / 20 - 1).every((dv) => {
      const u = focus[0] + du * sight,
        v = focus[1] + dv * sight;

      return copies.some(
        ([offsetU, offsetV]) =>
          u >= offsetU &&
          u <= offsetU + period.u &&
          (period.v === null || (v >= offsetV && v <= offsetV + period.v))
      );
    })
  );
};

expect(
  'the copies of the world drawn are every one within sight, however far it sees and wherever it looks from',
  [
    copiesNear([5, 5], 20, stops),
    copiesNear([40, 25], 20, wraps),
    // Seeing 120 from a corner of an 80 by 50 world: 4 copies across, and 6 down.
    copiesNear([79, 49], 120, wraps).length,
    [
      covered([5, 5], 20, stops),
      covered([79, 2], 120, wraps),
      covered([1, 48], 300, { u: 40, v: 30 }),
    ],
  ],
  [
    [
      [-80, 0],
      [0, 0],
    ],
    [[0, 0]],
    24,
    [true, true, true],
  ]
);

// A turn given exactly: halfway along, half of it, however far and whichever way, not the short way round.
const turnedFrom: Orbit = { focus: [0, 0], yaw: 0, pitch: 1, distance: 10 },
  turnedTo: Orbit = { ...turnedFrom, yaw: (Math.PI * 5) / 4 };

expect(
  'a glide given its turn turns by it exactly, the long way if asked; without, the short way',
  [
    Math.round(
      between(turnedFrom, turnedTo, 0.5, { u: 10, v: null }, (Math.PI * 5) / 4)
        .yaw * 1000
    ),
    Math.round(
      between(turnedFrom, turnedTo, 0.5, { u: 10, v: null }).yaw * 1000
    ),
  ],
  [
    Math.round(((Math.PI * 5) / 8) * 1000),
    Math.round((-(Math.PI * 3) / 8) * 1000),
  ]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL orbit: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS orbit (${checks} checks)\n`);
