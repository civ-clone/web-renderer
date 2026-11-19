// What each square yields, over the 3D map (docs/3d-renderer.md §11, the `y` key): the interface's icons, laid out over
//  the square's middle on the screen as the 2D map lays them in its tile (`tileYieldGrid`: two rows, more columns the
//  more there are). They fit in the square as it looks there, across the screen and up it, so further squares, and
//  squares seen at a low angle, have smaller icons, up to the icons' own size; a square too small on the screen to read
//  them has none.

import { Yield } from '@civ-clone/ui-protocol/types';
import { tileYieldGrid } from '@civ-clone/ui-client/lib/yieldMap';

/** An icon to draw: the yield's name, the top left of its box on the screen in px, and how big the box is, square. */
export type YieldIcon = { _: string; x: number; y: number; size: number };

/**
 * The smallest an icon's worth drawing, in px: smaller, it can't be read, and a far-off view would be thousands of them.
 *  And how much of a square's box, across and up the screen, its icons take.
 */
export const SMALLEST_ICON = 8,
  ICONS_FILL = 0.9;

/**
 * Where a square's `yields` go on the screen, over its middle at (`x`, `y`) in px, its box looking there like a
 *  parallelogram with half-sides `across` and `away` in px (from its middle to the middle of its sides): two rows of
 *  icons, upright, as big as fits inside it, no bigger than `biggest`. None where it yields nothing, or looks too small
 *  for them to be read.
 */
export const yieldIconsAt = (
  yields: Pick<Yield<string>, '_' | 'value'>[],
  [x, y]: readonly [number, number],
  [[acrossX, acrossY], [awayX, awayY]]: readonly [
    readonly [number, number],
    readonly [number, number]
  ],
  biggest: number
): YieldIcon[] => {
  const { columns, icons } = tileYieldGrid(yields),
    across = Math.min(columns, icons.length),
    down = Math.ceil(icons.length / columns),
    // A block w by h, centred, fits inside the parallelogram while its corners do: |s|, |t| ≤ 1, where a corner is
    //  s × across + t × away. As big as that allows, with a little room round it.
    area = Math.abs(acrossX * awayY - acrossY * awayX),
    size = Math.floor(
      Math.min(
        biggest,
        (ICONS_FILL * 2 * area) /
          (across * Math.abs(awayY) + down * Math.abs(awayX) || Infinity),
        (ICONS_FILL * 2 * area) /
          (across * Math.abs(acrossY) + down * Math.abs(acrossX) || Infinity)
      )
    );

  if (icons.length === 0 || !(size >= SMALLEST_ICON)) {
    return [];
  }

  const left = Math.round(x - (across * size) / 2),
    top = Math.round(y - (down * size) / 2);

  return icons.map(({ _, column, row }) => ({
    _,
    x: left + column * size,
    y: top + row * size,
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
 *  image `iconFor` gives, keeping its shape, centred in its box. Drawn crisp, as the 2D map draws pixel art, at any
 *  scale of the device's; smoothed only when it's smaller on the device than its own, so its pixels don't drop out.
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
      drawnHeight = imageHeight * scale,
      onDevice = scale * ratio;

    context.imageSmoothingEnabled = onDevice < 1;
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
