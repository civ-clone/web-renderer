// What the 3D map is asked for with, and its options that the Options window shows (docs/3d-renderer.md §6.2), for the
//  page and its menus alike. Imports nothing with state of its own.

import parseBooleanParam from './parseBooleanParam';

/** Whether the page asked for the 3D map (`?3d=1`). */
export const map3dAsked = (search: string): boolean =>
  parseBooleanParam(new URLSearchParams(search).get('3d'), false);

/** The option the size of the 3D map's units is kept in: 1 is life size, as cities are drawn. */
export const MAP3D_UNIT_SIZE_OPTION = 'map3dUnitSize';

/** The sizes a player can choose for the 3D map's units, from half life size to half as big again, in quarters. */
export const UNIT_SIZES = { min: 0.5, max: 1.5, step: 0.25 } as const;

/** The size `value` stands for: the nearest the player could choose, or life size for anything that isn't a number. */
export const unitSizeFor = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(
        UNIT_SIZES.max,
        Math.max(
          UNIT_SIZES.min,
          Math.round(value / UNIT_SIZES.step) * UNIT_SIZES.step
        )
      )
    : 1;

/**
 * The option how the 3D map's units move from square to square is kept in (docs/3d-renderer.md §8.2): walking, walking
 *  quickly, or there at once.
 */
export const MAP3D_WALKS_OPTION = 'map3dWalks';

/** How the 3D map's units can move from square to square, the first as it comes. */
export const WALK_SPEEDS = ['normal', 'fast', 'off'] as const;

export type WalkSpeed = (typeof WALK_SPEEDS)[number];

/** The way `value` stands for: walking, for anything else. */
export const walkSpeedFor = (value: unknown): WalkSpeed =>
  WALK_SPEEDS.find((speed) => speed === value) ?? 'normal';

/** The option whether other players' units are shown walking on the 3D map is kept in: they are, as it comes. */
export const MAP3D_RIVALS_WALK_OPTION = 'map3dRivalsWalk';
