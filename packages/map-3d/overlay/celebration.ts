// A city celebrating, its people's "We Love the King Day", on the 3D map (docs/3d-renderer.md §7.4, plan 4.3): flags on
//  the roofs of some of its houses, each a pole rising from a roof's peak with a pennant at its top, all blowing the
//  same way, more as it grows. Laid with the land, as its buildings are (`overlay/overlayMesh.ts`), so a flag stays on
//  its roof however the city's lots are laid out. Still, as smog is: they don't flap.
//
// Pure: what's laid and where, on the ground (`u` east, `v` south), from a city's roofs.

import { DISORDER_ROOM, Roof } from './disorder';

/**
 * One piece of a city's celebration: a pole or a pennant, its middle (`u`, height, `v`), its size each way, and how
 *  far it's turned about the upright.
 */
export type CelebrationPiece = {
  kind: 'pole' | 'pennant';
  at: [number, number, number];
  size: [number, number, number];
  turn: number;
  colour: string;
};

/** The numbers a city's celebration is laid by. */
export const CELEBRATION = {
  // A pole's height over its roof's peak, and how thick it is. Big enough to tell at play's zoom.
  pole: 0.16,
  poleWidth: 0.008,
  // A pennant's length out from its pole, how tall it is at the pole, and how thin.
  pennant: 0.085,
  pennantHeight: 0.05,
  pennantDepth: 0.004,
  // How many flags a city of size 1 has, and how many more for every size over it, up to the most.
  fewest: 2,
  perSize: 0.5,
  most: 8,
} as const;

/** Its colours: its poles', and its pennants', each flag's seeded. */
export const POLE = '#5a4a3a',
  PENNANTS = ['#c8102e', '#f2c230', '#1f5fbf', '#f4f1e8', '#2e8b57'] as const;

// A share, 0 to 1, from a city's seed and which of its numbers it is: the same each time.
const share = (seed: number, which: number): number => {
  let hash = Math.imul(seed ^ 0x85ebca6b, 2654435761) ^ which;

  hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);

  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
};

/** How many flags a city `size` big has when it celebrates. */
export const flagsFor = (size: number): number =>
  Math.min(
    CELEBRATION.most,
    CELEBRATION.fewest + Math.floor((size - 1) * CELEBRATION.perSize)
  );

// Where a roof stands, from the city's middle, as a number: the same for the same spot in the city wherever it stands.
const spotOf = (
  [u, v]: readonly [number, number],
  centre: readonly [number, number]
): number =>
  Math.round((u - centre[0]) * 4096) * 65537 +
  Math.round((v - centre[1]) * 4096);

/**
 * What a city celebrating is laid with, `flags` flags of it (`flagsFor`): on the middle at `centre`, its buildings'
 *  `roofs`, seeded `seed`. Flags on roofs chosen by where each stands and the seed, so a house keeps its flag as the
 *  city grows, unless a lot it takes ranks ahead; each a pole rising from the peak, and a pennant from its top, all
 *  pointing the way the city's wind blows, on roofs whose pennant would be clear of every other roof, past its
 *  corners or over its peak, and keep the room the buildings leave its units, standing at `units`. Outer houses stand
 *  lower than those near the middle, so their flags mostly fly from those. Fewer where there aren't as many such
 *  roofs; none with none.
 */
export const celebrationPieces = ({
  centre,
  units,
  roofs,
  seed,
  flags,
}: {
  centre: readonly [number, number];
  units: readonly [number, number];
  roofs: readonly Roof[];
  seed: number;
  flags: number;
}): CelebrationPiece[] => {
  const wind = share(seed, -1) * Math.PI * 2,
    alongU = Math.cos(wind),
    alongV = Math.sin(wind),
    // Whether the pennant on `roof` is clear of every other roof, at its pole, halfway and at its tip, its lowest edge,
    //  and of its units' room.
    clear = (roof: Roof): boolean =>
      [0, 0.5, 1].every((along) => {
        const pu = roof.at[0] + alongU * CELEBRATION.pennant * along,
          pv = roof.at[1] + alongV * CELEBRATION.pennant * along,
          low = roof.peak + CELEBRATION.pole - CELEBRATION.pennantHeight;

        return (
          Math.hypot(pu - units[0], pv - units[1]) >= DISORDER_ROOM &&
          roofs.every(
            (other) =>
              other === roof ||
              Math.hypot(pu - other.at[0], pv - other.at[1]) >=
                other.width * Math.SQRT1_2 + CELEBRATION.pennantDepth ||
              low >= other.peak
          )
        );
      });

  return roofs
    .map((roof) => {
      const spot = spotOf(roof.at, centre);

      return { roof, spot, order: share(seed, spot) };
    })
    .filter(({ roof }) => clear(roof))
    .sort((a, b) => a.order - b.order)
    .slice(0, flags)
    .flatMap(
      ({
        roof: {
          at: [u, v],
          peak,
        },
        spot,
      }) => {
        const top = peak + CELEBRATION.pole,
          colour =
            PENNANTS[Math.floor(share(seed + 1, spot) * PENNANTS.length)]!;

        return [
          {
            kind: 'pole' as const,
            at: [u, peak + CELEBRATION.pole / 2, v] as [number, number, number],
            size: [
              CELEBRATION.poleWidth,
              CELEBRATION.pole,
              CELEBRATION.poleWidth,
            ] as [number, number, number],
            turn: 0,
            colour: POLE,
          },
          {
            kind: 'pennant' as const,
            at: [
              u + (alongU * CELEBRATION.pennant) / 2,
              top - CELEBRATION.pennantHeight / 2,
              v + (alongV * CELEBRATION.pennant) / 2,
            ] as [number, number, number],
            size: [
              CELEBRATION.pennant,
              CELEBRATION.pennantHeight,
              CELEBRATION.pennantDepth,
            ] as [number, number, number],
            // Its length along the wind: a box's length is along `u`, turned about the upright by this, `v` south.
            turn: -wind,
            colour,
          },
        ];
      }
    );
};

export default celebrationPieces;
