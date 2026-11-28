// The sun's shadows drawn only over what the camera sees (`shadowFit.ts`, #1424, plan 6.1), without a GPU, with
//  three.js's own cameras placed and aimed as the stage places them (`aimCameras`):
//  - the box lies inside the one the shadows were drawn over before, and everything the camera can see of the land and
//    what stands on it that that box covered, this one covers too, looking every way the camera can, near and far, on
//    pages of every shape;
//  - its depth along the sun's light is as it was;
//  - at the default view it's a small part of the box it was;
//  - seeing nothing of the land, it's the box it was.

import {
  DirectionalLight,
  Frustum,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { STANDS_OVER, aimCameras } from '@civ-clone/ui-map-3d/stage';
import { seenBetween, shadowSides } from '@civ-clone/ui-map-3d/shadowFit';
import { SUN_FROM } from '@civ-clone/ui-map-3d/overlay/overlayMesh';
import {
  DISTANCE_MAX,
  DISTANCE_MIN,
  FIELD_OF_VIEW,
  PITCH_MAX,
  lowestPitch,
  sightFor,
} from '@civ-clone/ui-map-3d/camera/orbit';

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

// A world as wide as a big one, stopped at its poles, its land from the deep sea's floor to over a summit.
const period = { u: 120, v: null },
  land: [number, number] = [-0.15, 1.1],
  low = land[0],
  high = land[1] + STANDS_OVER;

const frustumOf = (camera: OrthographicCamera | PerspectiveCamera): Frustum =>
  new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    )
  );

// Inside, or on its edge, give or take what the sums round off.
const within = (frustum: Frustum, point: Vector3): boolean =>
  frustum.planes.every((plane) => plane.distanceToPoint(point) >= -1e-6);

// What the camera sees between the heights the land and what stands on it reach, as far as the haze: where rays
//  through the page, at its edges and across it, cross heights from the lowest to the highest.
const seenPoints = (camera: PerspectiveCamera, depth: number): Vector3[] => {
  const steps = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1],
    levels = Array.from(
      { length: 7 },
      (_, index) => low + ((high - low) * index) / 6
    ),
    toView = camera.matrixWorldInverse;

  return steps.flatMap((across) =>
    steps.flatMap((up) => {
      const direction = new Vector3(across, up, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize();

      return levels.flatMap((level) => {
        const along = (level - camera.position.y) / direction.y;

        if (!(along > 0)) {
          return [];
        }

        const point = camera.position.clone().addScaledVector(direction, along),
          away = -point.clone().applyMatrix4(toView).z;

        return away >= camera.near && away <= depth ? [point] : [];
      });
    })
  );
};

type Case = {
  yaw: number;
  pitch: number;
  distance: number;
  aspect: number;
  height: number;
};

const degrees = (value: number): number => (value * Math.PI) / 180,
  cases: Case[] = [];

for (const distance of [DISTANCE_MIN, 12, 24, 50, DISTANCE_MAX]) {
  for (const pitch of [
    lowestPitch(distance, period),
    degrees(40),
    degrees(55),
    degrees(70),
    PITCH_MAX,
  ]) {
    for (let yaw = 0; yaw < 360; yaw += 30) {
      for (const aspect of [0.5, 1, 1.43, 2.5]) {
        for (const height of [0, 0.9]) {
          cases.push({ yaw: degrees(yaw), pitch, distance, aspect, height });
        }
      }
    }
  }
}

const fit = (
  { yaw, pitch, distance, aspect, height }: Case,
  heights: readonly [number, number] = land
) => {
  const camera = new PerspectiveCamera(
      (FIELD_OF_VIEW * 180) / Math.PI,
      aspect,
      0.1,
      400
    ),
    sun = new DirectionalLight(),
    orbit = { focus: [3, 7] as [number, number], yaw, pitch, distance },
    { far } = aimCameras(camera, sun, orbit, height, period, heights),
    shadow = sun.shadow.camera,
    reach = distance * 2.2,
    // The box it was: as wide either way of the focus as the camera's twice and a bit its distance from it.
    before = shadow.clone();

  before.left = -reach;
  before.right = reach;
  before.bottom = -reach;
  before.top = reach;
  // As deep along the sun's light, round the focus, as it was wide, the sun as far from it as its offset is long.
  before.near = Math.max(0.5, Math.hypot(...SUN_FROM) - reach * 1.6);
  before.far = Math.hypot(...SUN_FROM) + reach * 1.6;
  before.updateProjectionMatrix();
  before.updateMatrixWorld();

  return { camera, shadow, before, reach, far };
};

let missed = 0,
  outside = 0,
  deeper = 0,
  points = 0,
  example = '';

cases.forEach((one) => {
  const { camera, shadow, before, reach, far } = fit(one),
    now = frustumOf(shadow),
    was = frustumOf(before);

  if (
    shadow.left < -reach - 1e-9 ||
    shadow.right > reach + 1e-9 ||
    shadow.bottom < -reach - 1e-9 ||
    shadow.top > reach + 1e-9 ||
    !(shadow.right > shadow.left && shadow.top > shadow.bottom)
  ) {
    outside++;
  }

  if (shadow.near !== before.near || shadow.far !== before.far) {
    deeper++;
  }

  seenPoints(camera, far).forEach((point) => {
    if (within(was, point)) {
      points++;

      if (!within(now, point)) {
        missed++;
        example ||= JSON.stringify({ ...one, point: point.toArray() });
      }
    }
  });
});

expect(
  'the box lies inside the one the shadows were drawn over before, as deep along the sun’s light, and everything the camera sees of the land and what stands on it that that one covered, this one covers too: looking every way, near and far, on pages of every shape',
  [cases.length, points > 100000, outside, deeper, missed, example],
  [2400, true, 0, 0, 0, '']
);

// The default view, on a page a little wider than it's tall.
const standard = fit({
    yaw: 0,
    pitch: degrees(55),
    distance: 24,
    aspect: 1.43,
    height: 0,
  }),
  share =
    ((standard.shadow.right - standard.shadow.left) *
      (standard.shadow.top - standard.shadow.bottom)) /
    (2 * standard.reach) ** 2;

expect(
  'at the default view, the box is a small part of the one it was',
  share < 0.25,
  true
);

// Looking at the sky over land below it: nothing seen between its heights.
const skyward = new PerspectiveCamera(40, 1, 0.1, 400),
  sunCamera = new OrthographicCamera();

skyward.position.set(0, 10, 0);
skyward.lookAt(0, 20, -1);
skyward.updateMatrixWorld();
sunCamera.position.set(30, 40, 20);
sunCamera.lookAt(0, 0, 0);
sunCamera.updateMatrixWorld();

expect(
  'seeing nothing of the land, the box is the one it was',
  [
    seenBetween(skyward, sightFor(24).far, low, high).length,
    shadowSides(skyward, sunCamera, sightFor(24).far, low, high, 52.8),
  ],
  [0, { left: -52.8, right: 52.8, bottom: -52.8, top: 52.8 }]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL shadowFit3d: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS shadowFit3d (${checks} checks)\n`);
