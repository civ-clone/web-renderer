// What's under a point on the 3D map's screen (docs/3d-renderer.md §9.2, plan 1.3), over a known height function, at
//  every yaw and pitch: the ray meets the land first where it rises in the way, the water's surface where the land is
//  below it, and nothing at or above the horizon.

import {
  FIELD_OF_VIEW,
  Orbit,
  groundAt,
  rayThrough,
} from '@civ-clone/ui-map-3d/camera/orbit';
import pickGround from '@civ-clone/ui-map-3d/camera/pick';

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

const degrees = (value: number): number => (value * Math.PI) / 180,
  // Hills and valleys, some below the water: as high as 0.45 and as low as -0.25.
  hills = (u: number, v: number): number =>
    0.1 + 0.35 * Math.sin(u * 1.3) * Math.cos(v * 0.9),
  orbits: Orbit[] = Array.from({ length: 8 }, (_, n) =>
    degrees(n * 45 + 10)
  ).flatMap((yaw) =>
    [25, 35, 50, 65, 80].map((pitch) => ({
      focus: [20.3, 14.7] as const,
      yaw,
      pitch: degrees(pitch),
      distance: 18,
    }))
  ),
  aspect = 4 / 3,
  points: [number, number][] = [
    [0, 0],
    [-0.7, -0.6],
    [0.6, -0.2],
    [0.3, 0.25],
    [-0.4, 0.4],
  ],
  lookHeight = 0.2;

// The first place along the ray, walked in tiny steps, where it's at or under what's shown: the long way.
const firstMeeting = (
  orbit: Orbit,
  point: [number, number],
  heightAt: (u: number, v: number) => number
): [number, number] | null => {
  const { from, direction } = rayThrough(orbit, lookHeight, point, aspect),
    across = Math.hypot(direction[0], direction[2]);

  for (let t = 0; t < 400; t += 0.0005 / across) {
    const u = from[0] + direction[0] * t,
      height = from[1] + direction[1] * t,
      v = from[2] + direction[2] * t;

    if (height <= Math.max(0, heightAt(u, v))) {
      return [u, v];
    }
  }

  return null;
};

const misses = orbits.flatMap((orbit) =>
  points.flatMap((point) => {
    const picked = pickGround(orbit, lookHeight, point, aspect, hills),
      wanted = firstMeeting(orbit, point, hills);

    if (picked === null || wanted === null) {
      return picked === wanted ? [] : [{ orbit, point, picked, wanted }];
    }

    return Math.hypot(picked[0] - wanted[0], picked[1] - wanted[1]) < 0.01
      ? []
      : [{ orbit, point, picked, wanted }];
  })
);

expect(
  'at every yaw and pitch, the ray picks where it first meets the land, or the water over land below it',
  misses.slice(0, 3),
  []
);

// All sea: the water's surface, as the level ground at 0 is met.
const sea = (): number => -0.15;

expect(
  'over the sea, at every yaw and pitch, the water’s surface is picked, however deep the floor',
  orbits.every((orbit) =>
    points.every((point) => {
      const picked = pickGround(orbit, lookHeight, point, aspect, sea),
        level = groundAt(orbit, lookHeight, point, aspect, 0);

      return (
        picked !== null &&
        level !== null &&
        Math.hypot(picked[0] - level[0], picked[1] - level[1]) < 1e-6
      );
    })
  ),
  true
);

// A ridge across the view, low down the screen: a ray that would meet the plain beyond it meets the ridge first.
const ridge = (u: number, v: number): number =>
    Math.abs(v - 20) < 0.3 ? 0.6 : 0.05,
  facingNorth: Orbit = {
    focus: [10, 17],
    yaw: 0,
    pitch: degrees(30),
    distance: 12,
  },
  overRidge = pickGround(facingNorth, 0, [0, -0.3], aspect, ridge),
  plain = groundAt(facingNorth, 0, [0, -0.3], aspect, 0.05);

expect(
  'a ridge in the way is picked, not the plain behind it',
  [
    overRidge !== null && Math.abs(overRidge[1] - 20) <= 0.3 + 1e-3,
    plain !== null && plain[1] < 19.7,
  ],
  [true, true]
);

expect(
  'a point at or above the horizon picks nothing',
  orbits.every(
    (orbit) =>
      pickGround(
        orbit,
        lookHeight,
        [0, (Math.tan(orbit.pitch) / Math.tan(FIELD_OF_VIEW / 2)) * 1.001],
        aspect,
        hills
      ) === null
  ),
  true
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL pick: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS pick (${checks} checks)\n`);
