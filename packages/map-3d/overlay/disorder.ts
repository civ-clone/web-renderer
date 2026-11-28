// A city in civil disorder on the 3D map (docs/3d-renderer.md §7.4, plan 4.3): fires on the roofs of some of its
//  buildings behind its middle, and a column of smoke rising from each, leaning away from where its units stand. One
//  column for a small city, two from size 4 and three from size 8. Laid with the land, as its buildings are
//  (`overlay/overlayMesh.ts`), so a fire stays on its roof however the city's lots are laid out. With no roof to burn
//  behind its middle, a fire on the ground behind its plaza instead. Still, as smog is: it doesn't drift.
//
// Pure: what's laid and where, on the ground (`u` east, `v` south), from a city's roofs and where its units stand.

import { UNIT_ROOM } from './sprawl';

/** One piece of a city's disorder: a flame or a puff of smoke, its middle (`u`, height, `v`), its size each way. */
export type DisorderPiece = {
  kind: 'fire' | 'smoke';
  at: [number, number, number];
  size: [number, number, number];
  colour: string;
};

/** A roof a fire can burn on: where its building stands, how wide it is, and how high its eaves and its peak are. */
export type Roof = {
  at: readonly [number, number];
  width: number;
  eaves: number;
  peak: number;
};

/** The numbers a city's disorder is laid by. */
export const DISORDER = {
  // A flame's height, rising from its roof's eaves, and how wide it is on the ground behind a city's plaza, where it's
  //  no roof to fit: on a roof, half as wide as the roof, two side by side, so they stay within it.
  fireHeight: 0.1,
  fireWidth: 0.05,
  // A column's puffs: how many, how far over its flames the first is and how far apart they are up, how big across the
  //  first is and how much bigger each is, and how far each leans away from where the city's units stand, further the
  //  higher it is. Big enough to tell close in.
  puffs: 6,
  firstPuff: 0.06,
  puffRise: 0.09,
  firstSize: 0.076,
  puffGrowth: 0.04,
  lean: 0.03,
  // How far each puff's thrown either side of the way it leans, at most, so it billows rather than stacks.
  billow: 0.018,
  // With no roof behind the city's middle: a fire this far behind its middle, on the ground behind its plaza.
  behindPlaza: 0.2,
} as const;

/**
 * How far from where a city's units stand its disorder keeps, along the ground: the room its buildings already leave
 *  them (`UNIT_ROOM`), so smoke and fire are no nearer a unit than a house is.
 */
export const DISORDER_ROOM = UNIT_ROOM;

/** Its colours: its smoke's, from dark to lighter as it rises and thins, and its flames'. */
export const SMOKE = [
    '#3a3733',
    '#4a4743',
    '#5c5954',
    '#6f6b65',
    '#827e77',
    '#94908a',
  ] as const,
  FLAMES = ['#ff7316', '#ffbf33'] as const;

// A share, 0 to 1, from a city's seed and which of its numbers it is: the same each time.
const share = (seed: number, which: number): number => {
  let hash = Math.imul(seed ^ 0x9e3779b9, 2654435761) ^ which;

  hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);

  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
};

/** How many columns of smoke a city `size` big has in disorder. */
export const disorderColumns = (size: number): number =>
  size >= 8 ? 3 : size >= 4 ? 2 : 1;

/** How near a piece comes to `spot` along the ground: from its edge. */
export const nearestTo = (
  piece: DisorderPiece,
  spot: readonly [number, number]
): number =>
  Math.hypot(piece.at[0] - spot[0], piece.at[2] - spot[1]) - piece.size[0] / 2;

// A column from a fire whose flames, each `width` across, rise from (`u`, `base`, `v`), leaning away from `from`.
const column = (
  u: number,
  base: number,
  v: number,
  width: number,
  from: readonly [number, number],
  seed: number,
  which: number
): DisorderPiece[] => {
  const away = Math.hypot(u - from[0], v - from[1]) || 1,
    leanU = (u - from[0]) / away,
    leanV = (v - from[1]) / away,
    pieces: DisorderPiece[] = [];

  // Two flames side by side, across the way the smoke leans, touching at the middle, one a little taller.
  FLAMES.forEach((colour, flame) => {
    const height = DISORDER.fireHeight * (flame === 0 ? 1 : 0.75),
      side = ((flame === 0 ? -1 : 1) * width) / 2;

    pieces.push({
      kind: 'fire',
      at: [u - leanV * side, base + height / 2, v + leanU * side],
      size: [width, height, width],
      colour,
    });
  });

  // Its smoke over them, rising and growing, leaning further away the higher it is, each puff thrown a little to one
  //  side of the way it leans or the other, and a little flatter than round, so it billows.
  for (let puff = 0; puff < DISORDER.puffs; puff++) {
    const width = DISORDER.firstSize + puff * DISORDER.puffGrowth,
      lean = DISORDER.lean * puff ** 1.4,
      thrown = (share(seed, 16 * which + puff) - 0.5) * 2 * DISORDER.billow;

    pieces.push({
      kind: 'smoke',
      at: [
        u + leanU * lean - leanV * thrown,
        base +
          DISORDER.fireHeight +
          DISORDER.firstPuff +
          puff * DISORDER.puffRise,
        v + leanV * lean + leanU * thrown,
      ],
      size: [width, width * 0.85, width],
      colour: SMOKE[puff] ?? SMOKE[SMOKE.length - 1]!,
    });
  }

  return pieces;
};

/**
 * What a city in disorder is laid with, `columns` columns of it (`disorderColumns`): on the middle at `centre`, its
 *  units standing at `units`, its buildings' `roofs`, seeded `seed`, and `ground` the land's height at a point. Fires
 *  only on roofs behind its middle, chosen by its seed, whose whole column keeps `DISORDER_ROOM` from its units and
 *  whose smoke is over every roof it reaches; their flames rising from the eaves, half as wide as the roof each, so
 *  they're within it. With none, one on the ground behind its plaza.
 */
export const disorderPieces = ({
  centre,
  units,
  roofs,
  seed,
  columns,
  ground,
}: {
  centre: readonly [number, number];
  units: readonly [number, number];
  roofs: readonly Roof[];
  seed: number;
  columns: number;
  ground: (u: number, v: number) => number;
}): DisorderPiece[] => {
  if (columns === 0) {
    return [];
  }

  const clear = (pieces: DisorderPiece[]): boolean =>
      pieces.every(
        (piece) =>
          nearestTo(piece, units) >= DISORDER_ROOM &&
          (piece.kind === 'fire' ||
            roofs.every(
              (roof) =>
                Math.hypot(
                  piece.at[0] - roof.at[0],
                  piece.at[2] - roof.at[1]
                ) >=
                  (piece.size[0] + roof.width) / 2 ||
                piece.at[1] - piece.size[1] / 2 >= roof.peak
            ))
      ),
    burning = roofs
      .map((roof, at) => ({ roof, order: share(seed, 1000 + at) }))
      .filter(({ roof }) => roof.at[1] < centre[1])
      .sort((a, b) => a.order - b.order)
      .map(({ roof }, which) =>
        column(
          roof.at[0],
          roof.eaves,
          roof.at[1],
          roof.width / 2,
          units,
          seed,
          which
        )
      )
      .filter(clear)
      .slice(0, columns);

  if (burning.length > 0) {
    return burning.flat();
  }

  const u = centre[0],
    v = centre[1] - DISORDER.behindPlaza;

  return column(u, ground(u, v), v, DISORDER.fireWidth, units, seed, 0);
};

export default disorderPieces;
