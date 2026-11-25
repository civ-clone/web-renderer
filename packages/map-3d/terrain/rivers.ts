// Rivers' courses on the land (docs/3d-renderer.md §5.3, plan 3.3): their shape, and how they cut into it. Pure maths,
//  for `relief.ts`, which lays them out on the world and gives them their levels.
//
// - **Course:** a river runs from each river square's middle to each neighbour across an edge with a river, as the 2D
//   map joins them (both tilesets' `River` joins `River` and water, by edges). It bends a little on the way (`MEANDER`),
//   each its own way, so a river isn't a row of straight lines, but its ends stay at the squares' middles, so where
//   several meet they join. It's a curve, sampled at `STEPS` points.
// - **Into the sea:** to a neighbour across an edge that's water, it runs on into the sea, widening (`MOUTH`).
// - **Alone:** a river square with neither is a pool.
// - **Level:** what its channel's cut under, at each point along it: under the land round it as it would be with no
//   rivers (`underLand`), so the channel's always a channel. Where courses meet, they're at one level at the square's
//   middle; away from it, each at its own. So near where they meet, one falling faster than another (a mouth to the
//   sea, say) can cut the land beside the other's channel lower than the other's level: the water (the next part)
//   lies on the land as it's drawn, not at the level, so that's never water standing over the ground.
// - **Channel:** across its water and `FLOOR` past it, the land is cut flat across to the channel's bed, under the
//   level. That's wider than the water by about the land's mesh's diagonal (`chunks.ts`, 8 points a unit), so the
//   mesh under the water is the flat bed, wherever its points fall. Past that, the bank rises back to
//   the land over `BANK`. Its level and width are taken by where a point falls along the course's line
//   (`chordAlong`), so the land has no step anywhere.
// - **The sea:** where a river's level is at the sea's or under, its bed's under the sea's surface, which shows in its
//   channel: there, the sea is its water. Elsewhere its bed stays above the sea's, so the sea never shows inland.

/** How many lines each course's curve is sampled into. */
export const STEPS = 8;

/** How far either way a course's middle bends off the line between its ends, at most, in world units. */
export const MEANDER = 0.14;

/** Half a river's width, in world units: its water's. */
export const RIVER_WIDTH = 0.08;

/** Half a pool's width. */
export const POOL_WIDTH = 0.12;

/** How much wider than its water a river's mouth is at the coast, and beyond it. */
export const MOUTH = 2.5;

/**
 * How far past its water the channel's bed runs, flat across, either side: about the diagonal of the land's mesh, so
 *  every triangle under the water has its points on the bed.
 */
export const FLOOR = 0.18;

/** How far past the bed the bank rises back to the land. */
export const BANK = 0.14;

/** How far a river's level lies under the lowest of the land round it, at most (`underLand`). */
export const MARGIN = 0.003;

/** How far the bed lies under a river's level, where there's room above the sea. */
export const DEPTH = 0.004;

/**
 * A course: its points, from the middle of the square that makes it, (`u`, `v`) by turns, from one end to the other;
 *  and at each point, how wide its water is either side, and its level, once it's given one. Where it's a mouth, its
 *  far end is in the sea. A circle round all it reaches, past which it's nothing: (`cu`, `cv`), and the radius,
 *  squared.
 */
export type Course = {
  points: number[];
  widths: number[];
  levels: number[];
  mouth: boolean;
  cu: number;
  cv: number;
  reach: number;
};

// A square's own fraction from 0 to 1, from its co-ordinates, the seed and what it's for.
const chance = (x: number, y: number, seed: number, salt: number): number => {
  let h =
    (Math.imul(x, 461845907) +
      Math.imul(y, 1597334677) +
      Math.imul(seed, 2654435761) +
      Math.imul(salt, 2246822519)) |
    0;

  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h ^= h >>> 13;

  return (h >>> 0) / 4294967296;
};

/**
 * The course from the middle of the square at (`x`, `y`), to (`tu`, `tv`) from it: a neighbour's middle. Bent its own
 *  way, by the square, the way it runs and `seed`. A mouth widens from a quarter of the way to the coast, which is
 *  halfway, and is as wide on into the sea. `tu` and `tv` both 0 make a pool.
 */
export const courseFrom = (
  x: number,
  y: number,
  tu: number,
  tv: number,
  {
    mouth = false,
    salt = 0,
    seed = 1,
  }: { mouth?: boolean; salt?: number; seed?: number } = {}
): Course => {
  const length = Math.hypot(tu, tv),
    pool = length === 0,
    bend = pool ? 0 : (chance(x, y, seed, salt) * 2 - 1) * MEANDER,
    // The curve's middle control point: halfway, pushed sideways, so its middle is `bend` off the line.
    mu = tu / 2 - (pool ? 0 : (tv / length) * bend * 2),
    mv = tv / 2 + (pool ? 0 : (tu / length) * bend * 2),
    points: number[] = [],
    widths: number[] = [];

  for (let step = 0; step <= STEPS; step++) {
    // A quadratic Bézier from the square's middle, (0, 0), so its first term's always 0.
    const t = step / STEPS,
      b = 2 * (1 - t) * t,
      c = t * t;

    points.push(b * mu + c * tu, b * mv + c * tv);
    widths.push(
      pool
        ? POOL_WIDTH
        : mouth
        ? RIVER_WIDTH *
          (1 + (MOUTH - 1) * Math.max(0, Math.min(1, (t - 0.25) / 0.25)))
        : RIVER_WIDTH
    );
  }

  const cu = tu / 2,
    cv = tv / 2,
    furthest = Math.max(
      ...widths.map(
        (width, at) =>
          Math.hypot(
            (points[at * 2] ?? 0) - cu,
            (points[at * 2 + 1] ?? 0) - cv
          ) + width
      )
    ),
    reach = furthest + FLOOR + BANK;

  return {
    points,
    widths,
    levels: widths.map(() => 0),
    mouth,
    cu,
    cv,
    reach: reach * reach,
  };
};

/**
 * Where on `course` is nearest the point (`pu`, `pv`), from the middle of the square that made it: how far away it is,
 *  and how far along, as a point's place in its list (from 0 to `STEPS`, between points between them).
 */
export const nearestOn = (
  course: Course,
  pu: number,
  pv: number
): [distance: number, along: number] => {
  const { points } = course;
  let best = Infinity,
    along = 0;

  for (let step = 0; step < STEPS; step++) {
    const su = points[step * 2] ?? 0,
      sv = points[step * 2 + 1] ?? 0,
      du = (points[step * 2 + 2] ?? 0) - su,
      dv = (points[step * 2 + 3] ?? 0) - sv,
      length = du * du + dv * dv,
      t =
        length === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((pu - su) * du + (pv - sv) * dv) / length)
            ),
      distance = Math.hypot(pu - su - du * t, pv - sv - dv * t);

    if (distance < best) {
      best = distance;
      along = step + t;
    }
  }

  return [best, along];
};

/** A value kept at each of a course's points, between them where `along` is (`nearestOn`). */
export const alongOf = (values: readonly number[], along: number): number => {
  const step = Math.min(STEPS - 1, Math.floor(along)),
    t = along - step;

  return (values[step] ?? 0) * (1 - t) + (values[step + 1] ?? 0) * t;
};

/**
 * A river's level under land as low as `low`: `MARGIN` under it, or, nearer the sea's level than twice that, under it
 *  by half as far as it is from the sea's level, so land over the sea's level keeps its river over it (at half its
 *  height), and land under it its river under it (at half as far again). Smoothly either side of the sea's level.
 */
export const underLand = (low: number): number =>
  low - Math.min(MARGIN, Math.abs(low) / 2);

/**
 * The bed of a river at `level`: `DEPTH` under it where there's room over the sea, and over the sea where its level is;
 *  at the sea's level, at it; under the sea's, as far under its level as its level is under the sea's, to `DEPTH`. Each
 *  smoothly into the next, so there's no step in the land where a river comes down to the sea.
 */
export const bedOf = (level: number): number =>
  level >= 0
    ? Math.max(level - DEPTH, level * 0.2)
    : level - Math.min(DEPTH, -level);

// Smoothly from 0 to 1 as `t` goes from 0 to 1.
const smooth = (t: number): number => {
  const clamped = Math.max(0, Math.min(1, t));

  return clamped * clamped * (3 - 2 * clamped);
};

/**
 * How far along `course` the point (`pu`, `pv`) is, from the middle of the square that made it, as a point's place in
 *  its list (from 0 to `STEPS`), by where it falls on the straight line between its ends. A course's curve is drawn
 *  so each of its points falls on that line as far along as it is along the curve, so on the curve this is how far
 *  along it is; off it, unlike the nearest point on the curve, which jumps from one side of a bend to the other, it
 *  changes smoothly, so the level and width taken by it leave no step in the land.
 */
export const chordAlong = (course: Course, pu: number, pv: number): number => {
  const tu = course.points[STEPS * 2] ?? 0,
    tv = course.points[STEPS * 2 + 1] ?? 0,
    length = tu * tu + tv * tv;

  return length === 0
    ? 0
    : Math.max(0, Math.min(1, (pu * tu + pv * tv) / length)) * STEPS;
};

/**
 * The land at (`pu`, `pv`), `height` high, as `course` cuts it, from the middle of the square that made it: down to
 *  its bed across its water and `FLOOR` past, then rising back over `BANK`. And how wet it is there, from 1 at the
 *  water's edge to 0 as the bank's halfway up. Never higher than it was.
 */
export const cutBy = (
  course: Course,
  pu: number,
  pv: number,
  height: number
): [height: number, wet: number] => {
  if ((pu - course.cu) ** 2 + (pv - course.cv) ** 2 >= course.reach) {
    return [height, 0];
  }

  const [distance] = nearestOn(course, pu, pv),
    along = chordAlong(course, pu, pv),
    width = alongOf(course.widths, along),
    floor = width + FLOOR,
    wet = 1 - smooth((distance - width) / (FLOOR + BANK / 2));

  if (distance >= floor + BANK) {
    return [height, 0];
  }

  const bed = bedOf(alongOf(course.levels, along));

  if (bed >= height) {
    return [height, wet];
  }

  return [
    distance <= floor
      ? bed
      : bed + (height - bed) * smooth((distance - floor) / BANK),
    wet,
  ];
};

/**
 * Where on `course` it is `along` (from 0 to `STEPS`), from the middle of the square that made it, and which way it runs
 *  there, not a unit long: (`u`, `v`, `du`, `dv`). A pool runs no way.
 */
export const pointAlong = (
  course: Course,
  along: number
): [u: number, v: number, du: number, dv: number] => {
  const { points } = course,
    step = Math.max(0, Math.min(STEPS - 1, Math.floor(along))),
    t = along - step,
    su = points[step * 2] ?? 0,
    sv = points[step * 2 + 1] ?? 0,
    eu = points[step * 2 + 2] ?? 0,
    ev = points[step * 2 + 3] ?? 0;

  return [su + (eu - su) * t, sv + (ev - sv) * t, eu - su, ev - sv];
};
