// Rivers' water on the 3D map (docs/3d-renderer.md §5.3, plan 3.3): a strip along each course, laid on its channel's
//  bed (`rivers.ts`) as the land's mesh draws it, a little over it, so it's never under the land nor left standing over
//  it, wherever another course's channel has cut it lower. The bed's flat across the water, so the water is too. Pure:
//  the land's chunks carry it (`chunks.ts`), and the stage draws it.

import { Course, STEPS, alongOf, pointAlong } from './rivers';

/** A river's water, as three.js takes it: its points, three numbers each, and its triangles, three points each. */
export type RibbonMesh = { positions: number[]; indices: number[] };

/** How far over the land, as its mesh draws it, a river's water lies. */
export const RIVER_LIFT = 0.004;

// How many triangles round a pool, and round each end of a course where it joins others; and how many of its strip's
//  sections to each of its points, so the water follows the land's mesh closely, its points 8 a unit.
const ROUND = 12,
  SECTIONS = 2;

// The triangle between points `a`, `b` and `c`, wound to face up: anticlockwise seen from above, with `v` south as
//  three.js's `z`, as the land's are.
const triangle = (into: RibbonMesh, a: number, b: number, c: number): void => {
  const { positions } = into,
    cross =
      ((positions[b * 3] ?? 0) - (positions[a * 3] ?? 0)) *
        ((positions[c * 3 + 2] ?? 0) - (positions[a * 3 + 2] ?? 0)) -
      ((positions[b * 3 + 2] ?? 0) - (positions[a * 3 + 2] ?? 0)) *
        ((positions[c * 3] ?? 0) - (positions[a * 3] ?? 0));

  into.indices.push(...(cross < 0 ? [a, b, c] : [a, c, b]));
};

// A point of the water at (`u`, `v`), `RIVER_LIFT` over the land there (`groundAt`), but never under the sea's level,
//  where the sea's surface is: its index.
const pointAt = (
  into: RibbonMesh,
  u: number,
  v: number,
  groundAt: (u: number, v: number) => number
): number => {
  into.positions.push(u, Math.max(0, groundAt(u, v) + RIVER_LIFT), v);

  return into.positions.length / 3 - 1;
};

// A disc of water `radius` across at (`u`, `v`), laid on the land, facing up.
const disc = (
  into: RibbonMesh,
  u: number,
  v: number,
  radius: number,
  groundAt: (u: number, v: number) => number
): void => {
  const middle = pointAt(into, u, v, groundAt),
    rim = Array.from({ length: ROUND }, (_, way) => {
      const angle = (way / ROUND) * Math.PI * 2;

      return pointAt(
        into,
        u + Math.cos(angle) * radius,
        v + Math.sin(angle) * radius,
        groundAt
      );
    });

  rim.forEach((point, way) =>
    triangle(into, middle, point, rim[(way + 1) % ROUND]!)
  );
};

/**
 * `course`'s water, its square's middle at (`u`, `v`), laid on the land as `groundAt` says the land's mesh draws it, at
 *  (`u`, `v`) as given: a strip along it, as wide as its water, and a disc at each end, so where courses meet, or bend,
 *  they join. Only where its level's over the sea's, and on to where it meets it: where it's at the sea's or under,
 *  the sea's its water.
 */
export const ribbonOf = (
  course: Course,
  u: number,
  v: number,
  into: RibbonMesh,
  groundAt: (u: number, v: number) => number
): void => {
  const { points, widths, levels } = course,
    above = (along: number): boolean => alongOf(levels, along) > 0,
    // A section's end drawn where it's over the sea, or one next to it is: the strip runs on to the sea either way.
    step = 1 / SECTIONS,
    drawn = (along: number): boolean =>
      above(along) ||
      (along > 0 && above(along - step)) ||
      (along < STEPS && above(along + step));

  // A pool's all one disc.
  if ((points[STEPS * 2] ?? 0) === 0 && (points[STEPS * 2 + 1] ?? 0) === 0) {
    if (above(0)) {
      disc(into, u, v, widths[0] ?? 0, groundAt);
    }

    return;
  }

  // Its ends, where they're over the sea: not a mouth's in the sea.
  [0, STEPS].forEach((end) => {
    if (above(end) && (end === 0 || !course.mouth)) {
      const [pu, pv] = pointAlong(course, end);

      disc(into, u + pu, v + pv, widths[end] ?? 0, groundAt);
    }
  });

  let previous: number[] | null = null;

  for (let section = 0; section <= STEPS * SECTIONS; section++) {
    const along = section * step;

    if (!drawn(along)) {
      previous = null;

      continue;
    }

    // Which way it runs: from half a point before to half a point after, so it turns smoothly at each point.
    const [pu, pv] = pointAlong(course, along),
      [bu, bv] = pointAlong(course, Math.max(0, along - 0.5)),
      [au, av] = pointAlong(course, Math.min(STEPS, along + 0.5)),
      length = Math.hypot(au - bu, av - bv) || 1,
      width = alongOf(widths, along),
      // Across, to its left as it runs.
      [lu, lv] = [((av - bv) / length) * width, (-(au - bu) / length) * width],
      // Its left edge, its middle and its right.
      row = [1, 0, -1].map((side) =>
        pointAt(into, u + pu + lu * side, v + pv + lv * side, groundAt)
      );

    if (previous !== null) {
      const [l0, c0, r0] = previous as [number, number, number],
        [l1, c1, r1] = row as [number, number, number];

      triangle(into, l0, l1, c0);
      triangle(into, c0, l1, c1);
      triangle(into, c0, c1, r0);
      triangle(into, r0, c1, r1);
    }

    previous = row;
  }
};
