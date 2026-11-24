// Which units idle (plan 2.2): those near the camera, with it close in, on the screen or nearly. Further off, or with
//  it drawn back, the motion's too small to see, and each stack idling costs a frame's time (its figures drawn one by
//  one, with skeletons of their own), so they stand as their models do. Those idling go on a little further, and a
//  little further off the screen, so one at an edge doesn't swap back and forth.

import { Orbit } from './camera/orbit';

/**
 * Units idle with the camera this close or closer, and stand still again once it's drawn back past the second, so a
 *  zoom at the edge doesn't swap them back and forth.
 */
export const IDLE_DISTANCE = 12,
  IDLE_DISTANCE_OUT = 14;

/** How far from the camera's focus units idle, in the camera's distances, and how much further those idling go on. */
export const IDLE_REACH = 1.6,
  IDLE_REACH_OUT = 2;

/**
 * How far in from the screen's edges a square's middle is to start idling, in squares, and to go on, as the view
 *  says what's on the screen: a little off it, so one coming into sight is already idling.
 */
export const IDLE_MARGIN = -1,
  IDLE_MARGIN_OUT = -2;

/**
 * The frames drawn only for units idling are this far apart, at least, in ms: about 30 a second, not every one the
 *  screen shows, with a little to spare, so they don't fall to 20 on a 60 Hz screen.
 */
export const IDLE_FRAME = 1000 / 30 - 4;

/**
 * Of the squares (`x,y`) marked with a unit, those whose units idle with the camera at `orbit`: within its reach of its
 *  focus, the short way round a world that repeats every `period`, each square's middle where `centre` says, and on
 *  the screen as `seen` says, `margin` squares in from its edges. Those in `was` idle now, and go on further.
 */
export const idleSquares = (
  squares: Iterable<string>,
  { distance, focus }: Pick<Orbit, 'distance' | 'focus'>,
  centre: (x: number, y: number) => readonly [number, number],
  period: { u: number; v: number | null },
  was: ReadonlySet<string>,
  seen: (x: number, y: number, margin: number) => boolean
): Set<string> => {
  const idling = new Set<string>();

  if (distance > (was.size > 0 ? IDLE_DISTANCE_OUT : IDLE_DISTANCE)) {
    return idling;
  }

  const apart = (value: number, from: number, span: number | null): number =>
    span === null
      ? value - from
      : value - from - span * Math.round((value - from) / span);

  for (const key of squares) {
    const [x, y] = key.split(',').map(Number) as [number, number],
      [u, v] = centre(x, y),
      on = was.has(key);

    if (
      Math.hypot(apart(u, focus[0], period.u), apart(v, focus[1], period.v)) <=
        distance * (on ? IDLE_REACH_OUT : IDLE_REACH) &&
      seen(x, y, on ? IDLE_MARGIN_OUT : IDLE_MARGIN)
    ) {
      idling.add(key);
    }
  }

  return idling;
};

/** How many stacks start idling at once, at most: each is drawn afresh, with skeletons of its own. */
export const IDLE_SWAPS = 4;

/**
 * What changes as the stacks on the squares `keys` are asked to idle, with those on `idling` idling now: those to
 *  `stand`, no longer asked; and those to `start`, of those asked that `can` idle, `IDLE_SWAPS` at most, and whether
 *  any are `waiting` to, next time. One `fading` is left as it is, either way: its own materials are on what's drawn.
 */
export const idleChanges = (
  keys: ReadonlySet<string>,
  idling: ReadonlySet<string>,
  can: (key: string) => boolean,
  fading: (key: string) => boolean
): { stand: string[]; start: string[]; waiting: boolean } => {
  const stand = [...idling].filter((key) => !keys.has(key) && !fading(key)),
    ready = [...keys].filter(
      (key) => !idling.has(key) && !fading(key) && can(key)
    );

  return {
    stand,
    start: ready.slice(0, IDLE_SWAPS),
    waiting: ready.length > IDLE_SWAPS,
  };
};

export default idleSquares;
