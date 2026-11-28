// The sun's shadows drawn only over what the camera sees (docs/3d-renderer.md §9.3, plan 6.1, #1424): its shadow
//  map's box, from the sun, was as wide either way as the camera's twice and a bit its distance from its focus, far
//  more than it sees, so it drew the land, its plants, units and towns far off the screen into the map, a frame's
//  most draw calls and triangles. Its sides are now fitted round what the camera sees of the land and what stands on
//  it; its depth, along the sun's light, stays as it was, so what's between the sun and the land still casts its
//  shadow, and the map's bias, a share of that depth, means what it did. One box, the first step to 6.1's cascades.
//
// Pure, given three.js's cameras as they're placed: the scene's, and the sun's shadow camera, aimed as three.js aims it
//  (`LightShadow#updateMatrices`).

import { BufferGeometry, Camera, PerspectiveCamera, Vector3 } from 'three';

// The narrowest a box is drawn, across or up: past it, what's seen is all outside the box it was.
const MINIMUM = 1e-3;

/** A shadow box's sides, in its camera's own frame: across (`left`, `right`) and up (`bottom`, `top`). */
export type ShadowSides = {
  left: number;
  right: number;
  bottom: number;
  top: number;
};

// The corners of what the camera sees, at its near plane and `depth` from it, in the world: in the order of a box's
//  corners, the near four and then the far four, each four bottom left, bottom right, top right, top left.
const cornersOf = (camera: PerspectiveCamera, depth: number): Vector3[] => {
  const tan = Math.tan(((camera.fov * Math.PI) / 180) * 0.5) / camera.zoom;

  return [camera.near, depth].flatMap((away) => {
    const up = away * tan,
      across = up * camera.aspect;

    return [
      [-across, -up],
      [across, -up],
      [across, up],
      [-across, up],
    ].map(([x, y]) =>
      new Vector3(x, y, -away).applyMatrix4(camera.matrixWorld)
    );
  });
};

// A box's twelve edges, by its corners (`cornersOf`).
const EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/**
 * The points round what `camera` sees as far as `depth` from it (the haze, past which nothing shows) between the
 *  heights `low` and `high` (the land, and what stands on it): where the edges of what it sees cross them, and those of
 *  its corners between them. All it sees between them is inside them.
 */
export const seenBetween = (
  camera: PerspectiveCamera,
  depth: number,
  low: number,
  high: number
): Vector3[] => {
  const corners = cornersOf(camera, depth),
    within = (point: Vector3): boolean =>
      point.y >= low - 1e-9 && point.y <= high + 1e-9;

  return [
    ...corners.filter(within),
    ...EDGES.flatMap(([a, b]) => {
      const from = corners[a]!,
        to = corners[b]!,
        rise = to.y - from.y;

      if (Math.abs(rise) < 1e-12) {
        return [];
      }

      return [low, high].flatMap((level) => {
        const along = (level - from.y) / rise;

        return along > 0 && along < 1 ? [from.clone().lerp(to, along)] : [];
      });
    }),
  ];
};

/**
 * The sides of the sun's shadow box, `shadow` (its camera, aimed at the sun's target, its matrices worked out),
 *  fitted round what `camera` sees as far as `depth` between the heights `low` and `high` (`seenBetween`): but never
 *  wider than `reach` either way, as it was.
 */
export const shadowSides = (
  camera: PerspectiveCamera,
  shadow: Camera,
  depth: number,
  low: number,
  high: number,
  reach: number
): ShadowSides => {
  const seen = seenBetween(camera, depth, low, high).map((point) =>
    point.applyMatrix4(shadow.matrixWorldInverse)
  );

  const clamp = (value: number): number =>
      Math.max(-reach, Math.min(reach, value)),
    sides = {
      left: clamp(Math.min(...seen.map(({ x }) => x))),
      right: clamp(Math.max(...seen.map(({ x }) => x))),
      bottom: clamp(Math.min(...seen.map(({ y }) => y))),
      top: clamp(Math.max(...seen.map(({ y }) => y))),
    };

  // Seeing nothing between them, or nothing within `reach`: as it was.
  return !(sides.right - sides.left > MINIMUM) ||
    !(sides.top - sides.bottom > MINIMUM)
    ? { left: -reach, right: reach, bottom: -reach, top: reach }
    : sides;
};

/**
 * How low and how high the land in `geometries` goes, its chunks' bounds worked out where they haven't been: sea
 *  level both, with none.
 */
export const heightsOf = (
  geometries: Iterable<BufferGeometry>
): [number, number] => {
  let low = 0,
    high = 0;

  for (const geometry of geometries) {
    if (geometry.boundingBox === null) {
      geometry.computeBoundingBox();
    }

    const box = geometry.boundingBox;

    if (box !== null && !box.isEmpty()) {
      low = Math.min(low, box.min.y);
      high = Math.max(high, box.max.y);
    }
  }

  return [low, high];
};

export default shadowSides;
