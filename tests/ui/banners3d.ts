// Where the cities' banners hang on the 3D map (docs/3d-renderer.md §7.5, `banners.ts`): below each city's square as
//  the camera sees it, under its middle, from the lowest corner of its outline on the screen however the camera's
//  turned; at every copy of the world the stage marks; none for a square behind the camera, past the haze, or too far
//  off the screen to reach on to it; and the lowest on the screen last, to be drawn over the rest.

import {
  BannerSite,
  BannerView,
  bannerPlaces,
} from '@civ-clone/ui-map-3d/banners';
import {
  Orbit,
  PITCH_MIN,
  ScenePoint,
  defaultOrbit,
  eye,
  sightFor,
  toScreen,
} from '@civ-clone/ui-map-3d/camera/orbit';
import { copiesNear, markerSight } from '@civ-clone/ui-map-3d/stage';

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

const width = 800,
  height = 600,
  // A square a unit across, its middle at (`u`, `v`) on flat ground at `up`.
  site = (key: string, u: number, v: number, up = 0): BannerSite => ({
    key,
    centre: [u, up, v],
    outline: [
      [u - 0.5, up, v - 0.5],
      [u + 0.5, up, v - 0.5],
      [u + 0.5, up, v + 0.5],
      [u - 0.5, up, v + 0.5],
    ],
  }),
  view = (orbit: Orbit, extra: Partial<BannerView> = {}): BannerView => ({
    orbit,
    look: 0,
    width,
    height,
    period: { u: 100, v: null },
    reach: 200,
    ...extra,
  }),
  // Where a point is on the screen, in px, as worked out here from the camera.
  screen = (orbit: Orbit, point: ScenePoint): [number, number] => {
    const [x, y] = toScreen(orbit, 0, point, width / height)!;

    return [((x + 1) / 2) * width, ((1 - y) / 2) * height];
  },
  round = (value: number) => Math.round(value * 1000) / 1000,
  rounded = (places: { key: string; x: number; y: number }[]) =>
    places.map(({ key, x, y }) => [key, round(x), round(y)]),
  // How far along the way the camera looks a point on the ground is, as the haze measures it.
  depth = (orbit: Orbit, [u, v]: [number, number]) => {
    const from = eye(orbit, 0),
      along = [
        orbit.focus[0] - from[0],
        -from[1],
        orbit.focus[1] - from[2],
      ].map((part) => part / orbit.distance);

    return (
      (u - from[0]) * along[0]! -
      from[1] * along[1]! +
      (v - from[2]) * along[2]!
    );
  };

// Looking north at a square from the south, and turned an eighth: under its middle, from its outline's lowest corner.
{
  const ahead = defaultOrbit([10, 10]),
    turned = { ...ahead, yaw: Math.PI / 4 },
    square = site('10,10', 10, 10),
    lowest = (orbit: Orbit) =>
      Math.max(...square.outline.map((corner) => screen(orbit, corner)[1]));

  expect(
    'below its square, under its middle, from the lowest corner of its outline on the screen, however the camera’s turned',
    [
      rounded(bannerPlaces([square], view(ahead))),
      rounded(bannerPlaces([square], view(turned))),
    ],
    [
      [['10,10', round(screen(ahead, [10, 0, 10])[0]), round(lowest(ahead))]],
      [['10,10', round(screen(turned, [10, 0, 10])[0]), round(lowest(turned))]],
    ]
  );
  expect(
    'turned an eighth, its lowest corner is lower on the screen than its near edge was square on',
    lowest(turned) > lowest(ahead),
    true
  );
}

// Several squares: the lowest on the screen last, as the nearer to the camera.
{
  const orbit = defaultOrbit([10, 10]),
    places = bannerPlaces(
      [site('near', 10, 11.5), site('far', 10, 8.5), site('middle', 10.5, 10)],
      view(orbit)
    );

  expect(
    'the lowest on the screen last, to be drawn over the rest',
    places.map(({ key }) => key),
    ['far', 'middle', 'near']
  );
}

// A world that wraps: each square at every copy the stage draws markers at, as far as the screen and the haze go.
{
  const close = { ...defaultOrbit([0.2, 10]), distance: 5 },
    wide = { ...defaultOrbit([2, 10]), distance: 30 },
    across = bannerPlaces(
      [site('3.5,10', 3.5, 10)],
      view(close, { period: { u: 4, v: null }, reach: 50 })
    ),
    seen = bannerPlaces(
      [site('2,10', 2, 10)],
      view(wide, { period: { u: 4, v: null } })
    );

  expect(
    'over the seam, at the copy beside where the camera looks',
    rounded(across),
    [['3.5,10', round(screen(close, [-0.5, 0, 10])[0]), round(across[0]!.y)]]
  );
  // Every copy the stage marks, on the screen and short of the haze, as worked out here.
  const marked = copiesNear(wide.focus, markerSight(wide), { u: 4, v: null })
      .map(([du]) => 2 + du)
      .filter((u) => depth(wide, [u, 10]) <= sightFor(wide.distance).far)
      .map((u) => round(screen(wide, [u, 0, 10])[0]))
      .filter((x) => x >= 0 && x <= width),
    placed = rounded(seen).map(([, x]) => x);

  expect(
    'and, drawn out to see the world round several times, at every copy the stage marks on the screen, and no further than the screen’s reach',
    [
      marked.length > 3,
      marked.filter((x) => !placed.includes(x)),
      placed.filter((x) => (x as number) < -200 || (x as number) > width + 200),
    ],
    [true, [], []]
  );
}

// Looking low, out to where the haze hides the land, by how far along the way the camera looks, as it thickens: none
//  past it, straight ahead or off to the side.
{
  const low = { ...defaultOrbit([10, 10]), pitch: PITCH_MIN, distance: 10 },
    { far } = sightFor(low.distance),
    // The squares straight ahead, a step at a time, and whether each is short of the haze.
    ahead = Array.from({ length: 60 }, (_, step) => 10 - step).map((v) => ({
      v,
      clear: depth(low, [10, v]) <= far,
      hung:
        bannerPlaces(
          [site('ahead', 10, v)],
          view(low, { period: { u: 1000, v: null } })
        ).length > 0,
    })),
    hazed = ahead.filter(({ clear }) => !clear);

  expect(
    'looking low, a city past the haze has no banner, though it’s on the screen, and one short of it has',
    [
      hazed.length > 0,
      hazed.some(
        ({ v }) => (toScreen(low, 0, [10, 0, v], width / height)?.[1] ?? 2) < 1
      ),
      hazed.filter(({ hung }) => hung).length,
      ahead.some(({ clear, hung }) => clear && hung),
    ],
    [true, true, 0, true]
  );

  // Off to the side, a city short of the haze along the way the camera looks, though further from it than the haze
  //  is deep: on the screen, and hung.
  const from = eye(low, 0),
    aside = Array.from({ length: 40 }, (_, step) => 10 - step)
      .flatMap((v) =>
        Array.from({ length: 30 }, (_, across) => [10 + across, v] as const)
      )
      .find(([u, v]) => {
        const point = toScreen(low, 0, [u, 0, v], width / height);

        return (
          depth(low, [u, v]) < far - 0.5 &&
          Math.hypot(u - from[0], from[1], v - from[2]) > far + 0.5 &&
          point !== null &&
          Math.abs(point[0]) < 0.9 &&
          Math.abs(point[1]) < 0.9
        );
      });

  expect(
    'off to the side, a city short of the haze along the way the camera looks, though further off than it’s deep, is hung',
    aside === undefined
      ? 'none found'
      : bannerPlaces(
          [site('aside', aside[0], aside[1])],
          view(low, { period: { u: 1000, v: null } })
        ).length,
    1
  );
}

// Behind the camera, or too far off the screen to reach on to it: none.
{
  const orbit = defaultOrbit([10, 10]),
    // As far off the left of the screen as `reach` says, and a little further.
    edge = (reach: number) =>
      bannerPlaces(
        [site('off', 2, 10)],
        view(orbit, { reach, period: { u: 1000, v: null } })
      ).length;

  expect(
    'none for a square behind the camera',
    bannerPlaces([site('behind', 10, 60)], view(orbit)).length,
    0
  );
  expect(
    'one off the side of the screen is hung only while within reach of it',
    [
      edge(-screen(orbit, [2, 0, 10])[0] + 1),
      edge(-screen(orbit, [2, 0, 10])[0] - 1),
    ],
    [1, 0]
  );
  expect(
    'none below the bottom of the screen, where it would hang off it',
    bannerPlaces([site('below', 10, 20)], view(orbit)).length,
    0
  );

  // Above the top of the screen, short of the haze: hung while within reach of it, as it hangs down on to it.
  const above = (reach: number) =>
      Array.from({ length: 80 }, (_, step) => 10 - step * 0.5)
        .map((v) => ({
          v,
          y: Math.max(
            ...site('', 10, v).outline.map((corner) => screen(orbit, corner)[1])
          ),
        }))
        .filter(({ y }) => y < 0 && y > -2 * reach),
    reach = 40,
    [within] = above(reach).filter(({ y }) => y > -reach),
    [beyond] = above(reach).filter(({ y }) => y < -reach);

  expect(
    'one off the top of the screen is hung only while within reach of it',
    [
      within === undefined || beyond === undefined,
      bannerPlaces([site('within', 10, within?.v ?? 0)], view(orbit, { reach }))
        .length,
      bannerPlaces([site('beyond', 10, beyond?.v ?? 0)], view(orbit, { reach }))
        .length,
    ],
    [false, 1, 0]
  );
}

// Faded as the haze thickens, as three.js thickens it over the land: none short of where it begins, and smoothly to
//  all where it hides the land.
{
  const low = { ...defaultOrbit([10, 10]), pitch: PITCH_MIN, distance: 10 },
    { near, far } = sightFor(low.distance),
    clearAt = (v: number) =>
      bannerPlaces(
        [site('ahead', 10, v)],
        view(low, { period: { u: 1000, v: null } })
      )[0]?.clear,
    // Straight ahead, a square short of where the haze begins, and about half way into it.
    short = Array.from({ length: 60 }, (_, step) => 10 - step).find(
      (v) => depth(low, [10, v]) > near - 2 && depth(low, [10, v]) < near
    )!,
    middle = Array.from({ length: 60 }, (_, step) => 10 - step).find(
      (v) => depth(low, [10, v]) > (near + far) / 2
    )!,
    through = (depth(low, [10, middle]) - near) / (far - near);

  expect(
    'no fading short of the haze, and as much as the haze thickens there in it',
    [clearAt(short), round(clearAt(middle) ?? -1)],
    [1, round(1 - through * through * (3 - 2 * through))]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL banners3d (${failures.length} of ${checks} checks)\n  ${failures.join(
      '\n  '
    )}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS banners3d (${checks} checks)\n`);
