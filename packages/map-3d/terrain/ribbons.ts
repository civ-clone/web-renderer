// Rivers' water on the 3D map (docs/3d-renderer.md §5.3, plan 3.3): a strip along each course, laid on its channel's
//  bed (`rivers.ts`) as the land's mesh draws it, a little over it, so it's never under the land nor left standing over
//  it, wherever another course's channel has cut it lower. Its shapes are cut along the land's cells and their
//  diagonals, so each piece lies over one of the land's triangles, and both are flat there: the water's exactly its
//  lift over the land everywhere. Pure: the land's chunks carry it (`chunks.ts`), and the stage draws it.

import { Course, STEPS, alongOf, pointAlong } from './rivers';

/** A river's water, as three.js takes it: its points, three numbers each, and its triangles, three points each. */
export type RibbonMesh = { positions: number[]; indices: number[] };

/**
 * The land the water's laid on: how high its mesh draws it at (`u`, `v`), and how far apart its points are, across and
 *  down, each cell split from its bottom left to its top right (`chunks.ts`), a point of it at (0, 0).
 */
export type Ground = {
  at(u: number, v: number): number;
  spacingU: number;
  spacingV: number;
};

/** How far over the land, as its mesh draws it, a river's water lies. */
export const RIVER_LIFT = 0.004;

// How many sides a pool has, and the disc at each end of a course where it joins others.
const ROUND = 12;

type Point = readonly [u: number, v: number];

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

// Twice the area of the polygon `points`, either way round.
const area = (points: readonly Point[]): number =>
  Math.abs(
    points.reduce((sum, [u, v], at) => {
      const [nu, nv] = points[(at + 1) % points.length]!;

      return sum + u * nv - nu * v;
    }, 0)
  );

// The convex polygon `points` cut by the line where `f` is `k`, into the part on each side, where it crosses it.
const cut = (
  points: readonly Point[],
  f: (point: Point) => number,
  k: number
): Point[][] => {
  const under: Point[] = [],
    over: Point[] = [];

  points.forEach((point, at) => {
    const next = points[(at + 1) % points.length]!,
      here = f(point) - k,
      there = f(next) - k;

    if (here <= 0) {
      under.push(point);
    }

    if (here >= 0) {
      over.push(point);
    }

    if ((here < 0 && there > 0) || (here > 0 && there < 0)) {
      const t = here / (here - there),
        crossing: Point = [
          point[0] + (next[0] - point[0]) * t,
          point[1] + (next[1] - point[1]) * t,
        ];

      under.push(crossing);
      over.push(crossing);
    }
  });

  return [under, over].filter((part) => part.length >= 3 && area(part) > 1e-12);
};

// The convex polygon `points` cut along every line of the land's that crosses it, as `f` gives the lines (where it's a
//  whole number).
const cutAll = (
  points: readonly Point[],
  f: (point: Point) => number
): Point[][] => {
  const values = points.map(f);
  let parts: Point[][] = [[...points]];

  for (
    let k = Math.floor(Math.min(...values)) + 1;
    k < Math.max(...values);
    k++
  ) {
    parts = parts.flatMap((part) => cut(part, f, k));
  }

  return parts;
};

/**
 * Lays `shapes`, flat and each convex, on `ground`: each cut along the land's cells (across and down) and their
 *  diagonals, so each piece is over one of the land's triangles, then each point of each piece `RIVER_LIFT` over the
 *  land there, but never under the sea's level, where the sea's surface is. Points in the same place are one point.
 */
export const lay = (
  into: RibbonMesh,
  shapes: readonly (readonly Point[])[],
  ground: Ground
): void => {
  const { spacingU, spacingV } = ground,
    across = ([u]: Point) => u / spacingU,
    down = ([, v]: Point) => v / spacingV,
    diagonal = ([u, v]: Point) => u / spacingU + v / spacingV,
    // Each point by where it is, to a millionth, so pieces either side of a line share their points there.
    points = new Map<string, number>(),
    pointAt = ([u, v]: Point): number => {
      const key = `${Math.round(u * 1e6)},${Math.round(v * 1e6)}`;
      let index = points.get(key);

      if (index === undefined) {
        index = into.positions.length / 3;
        into.positions.push(u, Math.max(0, ground.at(u, v) + RIVER_LIFT), v);
        points.set(key, index);
      }

      return index;
    };

  shapes.forEach((flat) =>
    cutAll(flat, across)
      .flatMap((part) => cutAll(part, down))
      .flatMap((part) => cutAll(part, diagonal))
      .forEach((piece) => {
        const indices = piece.map(pointAt);

        for (let at = 1; at < indices.length - 1; at++) {
          const [a, b, c] = [indices[0]!, indices[at]!, indices[at + 1]!];

          if (a !== b && b !== c && a !== c) {
            triangle(into, a, b, c);
          }
        }
      })
  );
};

// A disc, flat: `radius` across at (`u`, `v`), as one shape of `ROUND` sides.
const disc = (u: number, v: number, radius: number): Point[] =>
  Array.from({ length: ROUND }, (_, way): Point => {
    const angle = (way / ROUND) * Math.PI * 2;

    return [u + Math.cos(angle) * radius, v + Math.sin(angle) * radius];
  });

// Whether the shape `points` is convex, each turn the same way, none straight on.
const convex = (points: readonly Point[]): boolean => {
  const turns = points.map(([u, v], at) => {
    const [bu, bv] = points[(at + 1) % points.length]!,
      [cu, cv] = points[(at + 2) % points.length]!;

    return (bu - u) * (cv - bv) - (bv - v) * (cu - bu);
  });

  return turns.every((turn) => turn > 0) || turns.every((turn) => turn < 0);
};

/**
 * `course`'s water, its square's middle at (`u`, `v`), laid on `ground` (`lay`): a strip along it, as wide as its
 *  water, and a disc at each end, so where courses meet, or bend, they join. Only where its level's over the sea's, and
 *  on to where it meets it: where it's at the sea's or under, the sea's its water.
 */
export const ribbonOf = (
  course: Course,
  u: number,
  v: number,
  into: RibbonMesh,
  ground: Ground
): void => {
  const { points, widths, levels } = course,
    above = (along: number): boolean => alongOf(levels, along) > 0,
    // A point's drawn where it's over the sea, or one next to it is: the strip runs on to the sea either way.
    drawn = (along: number): boolean =>
      above(along) ||
      (along > 0 && above(along - 1)) ||
      (along < STEPS && above(along + 1)),
    // As few shapes as there can be, as each is cut along the land's cells: the fewer shapes, the fewer triangles.
    shapes: Point[][] = [];

  // A pool's all one disc.
  if ((points[STEPS * 2] ?? 0) === 0 && (points[STEPS * 2 + 1] ?? 0) === 0) {
    if (above(0)) {
      shapes.push(disc(u, v, widths[0] ?? 0));
    }

    lay(into, shapes, ground);

    return;
  }

  // Its ends, where they're over the sea: not a mouth's in the sea.
  [0, STEPS].forEach((end) => {
    if (above(end) && (end === 0 || !course.mouth)) {
      const [pu, pv] = pointAlong(course, end);

      shapes.push(disc(u + pu, v + pv, widths[end] ?? 0));
    }
  });

  let previous: [Point, Point] | null = null;

  for (let along = 0; along <= STEPS; along++) {
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
      lu = ((av - bv) / length) * width,
      lv = (-(au - bu) / length) * width,
      row: [Point, Point] = [
        [u + pu + lu, v + pv + lv],
        [u + pu - lu, v + pv - lv],
      ];

    if (previous !== null) {
      const [l0, r0] = previous,
        [l1, r1] = row;

      // One shape a section, or two triangles where a sharp bend leaves it not convex.
      const section = [l0, r0, r1, l1];

      if (convex(section)) {
        shapes.push(section);
      } else {
        shapes.push([l0, r0, l1], [r0, r1, l1]);
      }
    }

    previous = row;
  }

  lay(into, shapes, ground);
};
