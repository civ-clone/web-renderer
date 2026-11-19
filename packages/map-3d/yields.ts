// What each square yields, over the 3D map (docs/3d-renderer.md §11, the `y` key): the interface's icons, laid out over
//  the square's middle on the screen as the 2D map lays them in its tile (`tileYieldGrid`: two rows, more columns the
//  more there are). They fit in the square as it looks there, across the screen and up it, so further squares, and
//  squares seen at a low angle, have smaller icons, up to the icons' own size; a square too small on the screen to read
//  them has none.

import { Yield } from '@civ-clone/ui-protocol/types';
import { tileYieldGrid } from '@civ-clone/ui-client/lib/yieldMap';

/** An icon to draw: the yield's name, the top left of its box on the screen in px, and how big the box is, square. */
export type YieldIcon = { _: string; x: number; y: number; size: number };

// The smallest an icon's worth drawing, in px; and how much of a square's box, across and up the screen, its icons
//  take.
const SMALLEST = 5,
  FILL = 0.9;

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
 * Where a square's `yields` go on the screen, over its middle at (`x`, `y`) in px, its box looking `across` px wide and
 *  `down` px tall there: two rows of icons in it, no bigger than `biggest`. None where it yields nothing, or looks too
 *  small for them to be read.
 */
export const yieldIconsAt = (
  yields: Pick<Yield<string>, '_' | 'value'>[],
  [x, y]: readonly [number, number],
  [across, down]: readonly [number, number],
  biggest: number
): YieldIcon[] => {
  const { columns, icons } = tileYieldGrid(yields),
    width = across * FILL,
    height = down * FILL,
    size = Math.min(biggest, Math.floor(height / 2), Math.floor(width / 2));

  if (icons.length === 0 || size < SMALLEST) {
    return [];
  }

  const along = centred(
      x - width / 2,
      width,
      Math.min(columns, icons.length),
      size
    ),
    upward = centred(
      y - height / 2,
      height,
      Math.ceil(icons.length / columns),
      size
    );

  return icons.map(({ _, column, row }) => ({
    _,
    x: along(column),
    y: upward(row),
    size,
  }));
};

/** How big an image is, in its own px. */
export const sizeOf = (image: CanvasImageSource): [number, number] => {
  const { naturalWidth, naturalHeight, width, height } = image as {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number | { baseVal: { value: number } };
    height?: number | { baseVal: { value: number } };
  };

  return [
    naturalWidth ?? (typeof width === 'number' ? width : 0),
    naturalHeight ?? (typeof height === 'number' ? height : 0),
  ];
};

/**
 * Draws `icons` on a canvas `width` × `height` in the page's px, `ratio` device px to each: cleared first, each icon the
 *  image `iconFor` gives, keeping its shape, centred in its box. At its own size it's drawn crisp, as the 2D map draws
 *  pixel art; shrunk, it's smoothed, so its pixels don't come out uneven.
 */
export const drawYields = (
  context: Pick<
    CanvasRenderingContext2D,
    'setTransform' | 'clearRect' | 'drawImage' | 'imageSmoothingEnabled'
  >,
  icons: readonly YieldIcon[],
  iconFor: (name: string) => CanvasImageSource | null,
  { width, height, ratio }: { width: number; height: number; ratio: number }
): void => {
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  icons.forEach(({ _, x, y, size }) => {
    const image = iconFor(_);

    if (image === null) {
      return;
    }

    const [imageWidth, imageHeight] = sizeOf(image),
      scale = size / Math.max(1, imageWidth, imageHeight),
      drawnWidth = imageWidth * scale,
      drawnHeight = imageHeight * scale;

    context.imageSmoothingEnabled = scale < 1;
    context.drawImage(
      image,
      x + (size - drawnWidth) / 2,
      y + (size - drawnHeight) / 2,
      drawnWidth,
      drawnHeight
    );
  });
};

export default yieldIconsAt;
