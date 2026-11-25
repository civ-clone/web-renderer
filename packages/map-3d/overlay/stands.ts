// Woods' stands (docs/3d-renderer.md §5.1, #1363): a forest's or a jungle's trees grow in patches of a kind or two, as
//  woods do, rather than every kind mixed tree by tree. Each stand is round a centre on a lattice about `STAND_SPACING`
//  apart over the whole ground, each centre jittered about its cell, the lattice repeating with the world's period, as
//  the woods' own does, so it has no seam. A tree is in the stand of the nearest centre, a little nearer or further by a
//  number of its own, so stands' edges mingle rather than meeting in a line. Which stand a centre has is chosen by a
//  number of its own, as often as each stand's weight at the centre's latitude says. Everything comes from where things
//  are on the world, so a stand is the same whichever square's trees are in it, and the same laid again.

/** How far apart stands' centres are, about, and how much a tree's own number moves the edge between two. */
export const STAND_SPACING = 1.4,
  STAND_MINGLE = 0.3;

// A lattice point's own fraction, the `n`th, from where it is round the world: as the overlay's `pointFraction`, apart.
const fractionOf = (i: number, j: number, n: number): number => {
  let h =
    (Math.imul(i, 0x27d4eb2d) ^
      Math.imul(j, 0x165667b1) ^
      Math.imul(n + 1, 0x9e3779b1)) |
    0;

  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);

  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Which of `weights.length` stands the point (`u`, `v`) is in, on a world whose period is `period` (`v` null where it
 *  doesn't wrap down), the tree there having `own` as its number for the edges (0 to 1); `weights(latitude)` saying each
 *  stand's weight at a centre's latitude, and `latitudeAt(v)` the latitude at `v`.
 */
export const standAt = ({
  u,
  v,
  own,
  period,
  latitudeAt,
  weights,
}: {
  u: number;
  v: number;
  own: number;
  period: { u: number; v: number | null };
  latitudeAt: (v: number) => number;
  weights: (latitude: number) => readonly number[];
}): number => {
  const cellsU = Math.max(1, Math.round(period.u / STAND_SPACING)),
    stepU = period.u / cellsU,
    cellsV =
      period.v === null
        ? null
        : Math.max(1, Math.round(period.v / STAND_SPACING)),
    stepV =
      period.v === null || cellsV === null ? STAND_SPACING : period.v / cellsV,
    i0 = Math.floor(u / stepU),
    j0 = Math.floor(v / stepV);
  let nearest = Infinity,
    found: [number, number, number] = [0, 0, v];

  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = i0 + di,
        j = j0 + dj,
        // The same centre at every copy of the world.
        ci = ((i % cellsU) + cellsU) % cellsU,
        cj = cellsV === null ? j : ((j % cellsV) + cellsV) % cellsV,
        cu = (i + 0.5 + (fractionOf(ci, cj, 0) - 0.5) * 0.8) * stepU,
        cv = (j + 0.5 + (fractionOf(ci, cj, 1) - 0.5) * 0.8) * stepV,
        // A little nearer or further, by the tree's number and the centre's, so edges mingle.
        distance =
          Math.hypot(u - cu, v - cv) *
          (1 +
            STAND_MINGLE *
              (fractionOf(ci, cj, 2 + Math.floor(own * 997)) - 0.5));

      if (distance < nearest) {
        nearest = distance;
        found = [ci, cj, cv];
      }
    }
  }

  const [ci, cj, cv] = found,
    each = weights(latitudeAt(cv)),
    total = each.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  let pick = fractionOf(ci, cj, 3) * total;

  for (let stand = 0; stand < each.length; stand++) {
    pick -= Math.max(0, each[stand]!);

    if (pick < 0) {
      return stand;
    }
  }

  return Math.max(0, each.length - 1);
};
