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
