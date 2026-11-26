// What's under a point on the screen (docs/3d-renderer.md §9.2): where a ray from the camera first meets what's shown,
//  the land, or the water's surface where the land is below it. Pure, as the camera's maths is: the view hands it the
//  land's height, and turns the point into a square with the layout.
//
// The ray is stepped only through the band of heights the land can be in, from `ceiling` down to the water: above that
//  band it can't meet anything, and below it, it has met the water. Where a step goes below the surface, the meeting
//  is found between the two by halving.

import { GroundPoint, Orbit, rayThrough } from './orbit';

/**
 * How high the land can be anywhere, in world units: higher than any terrain's relief, with room for its noise. A
 *  massif of mountains tops out about 1.07 (#1391), which the relief's tests hold under this.
 */
export const CEILING = 1.5;

// How far apart, along the ray, the land is looked at, and how many times the meeting is halved.
const STEP = 0.04,
  HALVINGS = 12;

/**
 * Where the ray through `point` on the screen (as `groundAt` takes it) first meets the land, at `heightAt`, or the
 *  water's surface at `water` where the land is below it. Nothing for a point at or above the horizon.
 */
export const pickGround = (
  orbit: Orbit,
  lookHeight: number,
  point: readonly [number, number],
  aspect: number,
  heightAt: (u: number, v: number) => number,
  { water = 0, ceiling = CEILING }: { water?: number; ceiling?: number } = {}
): GroundPoint | null => {
  const { from, direction } = rayThrough(orbit, lookHeight, point, aspect),
    [fromU, fromHeight, fromV] = from,
    [alongU, down, alongV] = direction;

  if (down > -1e-6) {
    return null;
  }

  // The ray's place `t` along it, and how far above what's shown there it is.
  const at = (t: number): [number, number, number] => [
      fromU + alongU * t,
      fromHeight + down * t,
      fromV + alongV * t,
    ],
    above = (t: number): number => {
      const [u, height, v] = at(t);

      return height - Math.max(water, heightAt(u, v));
    },
    // Where the ray comes down to the ceiling, and to the water.
    start = Math.max(0, (fromHeight - ceiling) / -down),
    end = (fromHeight - water) / -down,
    // The steps along the ray, so a step is about `STEP` across the ground.
    step = STEP / Math.max(1e-6, Math.hypot(alongU, alongV));

  let previous = start;

  for (let t = start; ; t = Math.min(end, t + step)) {
    if (above(t) <= 0) {
      // Met between the last step and this one: halved down to the meeting.
      let low = previous,
        high = t;

      for (let n = 0; n < HALVINGS; n++) {
        const middle = (low + high) / 2;

        if (above(middle) > 0) {
          low = middle;
        } else {
          high = middle;
        }
      }

      const [u, , v] = at(high);

      return [u, v];
    }

    if (t >= end) {
      break;
    }

    previous = t;
  }

  // At the water's level, the ray is at or under the surface: it meets it there.
  const [u, , v] = at(end);

  return [u, v];
};

export default pickGround;
