// What each square yields, over the 3D map (docs/3d-renderer.md §11, the `y` key): the interface's icons, laid out over
//  the square's middle on the screen as the 2D map lays them in its tile (`tileYieldGrid`: two rows, more columns the
//  more there are). They're as big as the square looks, up to the size the 2D map draws them, so further squares have
//  smaller icons, and a square too small on the screen to read them has none.

import { Yield } from '@civ-clone/ui-protocol/types';
import { tileYieldGrid } from '@civ-clone/ui-client/lib/yieldMap';

/** An icon to draw: the yield's name, its top left on the screen in px, and how big it is, square. */
export type YieldIcon = { _: string; x: number; y: number; size: number };

// The biggest an icon's drawn, as the 2D map draws the interface's, and the smallest that's worth drawing, in px. How
//  much of a square's width the icons take across, and down for their two rows.
const BIGGEST = 16,
  SMALLEST = 5,
  ACROSS = 0.8,
  DOWN = 0.55;

// Where `count` icons `size` across go along a stretch `length` long from `start`: a block centred on it, each `size`
//  apart or closer, so the block fits where an icon does.
const centred = (
  start: number,
  length: number,
  count: number,
  size: number
): ((index: number) => number) => {
  const step =
      count > 1
        ? Math.max(0, Math.min(size, (length - size) / (count - 1)))
        : 0,
    first = start + (length - ((count - 1) * step + size)) / 2;

  return (index) => Math.round(first + index * step);
};

/**
 * Where a square's `yields` go on the screen, over its middle at (`x`, `y`) in px, the square looking `side` px wide
 *  there: none where it yields nothing, or looks too small for them to be read.
 */
export const yieldIconsAt = (
  yields: Pick<Yield<string>, '_' | 'value'>[],
  [x, y]: readonly [number, number],
  side: number
): YieldIcon[] => {
  const { columns, icons } = tileYieldGrid(yields),
    size = Math.min(BIGGEST, Math.floor((side * DOWN) / 2));

  if (icons.length === 0 || size < SMALLEST) {
    return [];
  }

  const width = side * ACROSS,
    height = side * DOWN,
    across = centred(
      x - width / 2,
      width,
      Math.min(columns, icons.length),
      size
    ),
    down = centred(
      y - height / 2,
      height,
      Math.ceil(icons.length / columns),
      size
    );

  return icons.map(({ _, column, row }) => ({
    _,
    x: across(column),
    y: down(row),
    size,
  }));
};

export default yieldIconsAt;
