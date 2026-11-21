// What the 3D map is asked for with, and its options that the Options window shows (docs/3d-renderer.md §6.2), for the
//  page and its menus alike. Imports nothing with state of its own.

import parseBooleanParam from './parseBooleanParam';

/** Whether the page asked for the 3D map (`?3d=1`). */
export const map3dAsked = (search: string): boolean =>
  parseBooleanParam(new URLSearchParams(search).get('3d'), false);

/**
 * The set of models the page asked the 3D map to draw units with (`?models=`, its manifest's path on this site, to try
 *  one out), or none. Only a path on this site, read as the browser reads it: a link can't have the map fetch another
 *  site's, however it spells it.
 */
export const map3dModelsAsked = (
  search: string
): { url: string } | undefined => {
  const asked = new URLSearchParams(search).get('models'),
    // Somewhere that isn't anywhere, to read the path against.
    here = 'https://here.invalid';

  if (
    asked === null ||
    !asked.startsWith('/') ||
    /[\u0000-\u0020\\]/.test(asked)
  ) {
    return undefined;
  }

  const url = new URL(asked, here);

  // Its dots taken out, it may start `//`, which the browser reads as another site's.
  return url.origin === here && !url.pathname.startsWith('//')
    ? { url: `${url.pathname}${url.search}` }
    : undefined;
};

/** The option the size of the 3D map's units is kept in: 1 is as the map draws them, twice life size (`UNIT_SCALE`). */
export const MAP3D_UNIT_SIZE_OPTION = 'map3dUnitSize';

/** The sizes a player can choose for the 3D map's units, from half as big as it draws them to half as big again. */
export const UNIT_SIZES = { min: 0.5, max: 1.5, step: 0.25 } as const;

/** The size `value` stands for: the nearest the player could choose, or 1 for anything that isn't a number. */
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
