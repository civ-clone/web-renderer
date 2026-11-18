import {
  TileArea,
  expandName,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import {
  squareCity,
  squareYields,
  tileYieldGrid,
  tileYieldIcons,
} from '@civ-clone/ui-client/lib/yieldMap';
import Map from '../Map';
import { Reach } from '../../lib/projection';
import { Tile } from '@civ-clone/ui-protocol/types';
import { hasPreloadedImage } from '@civ-clone/ui-assets/lib/getPreloadedImage';
import { imageSize } from '@civ-clone/ui-assets/lib/imageSize';

// The whole tile, where a pack's own icons go when it says nothing of where.
const wholeTile: TileArea = { x: 0, y: 0, width: 1, height: 1 };

/**
 * The box inside `outline` (a convex shape, as fractions of the tile, `Projection.outline`), centred on it down, whose
 *  shorter side is longest in px on a tile `size`: where the interface's icons go on a grid whose tiles aren't their
 *  boxes (#1122), as a box's fractions would put them partly on the neighbours. Its icons are in two rows, as on a
 *  square, so a box nearer square holds them better than the widest one: 22 × 23 px of a 32 × 36 pointy-topped
 *  hexagon, rather than its 32 × 18 middle. Sought in steps of a twentieth of the tile down; a convex shape is narrowest
 *  at a box's top or bottom edge, so those are all it measures.
 */
export const innerArea = (
  outline: readonly (readonly [number, number])[],
  size: { width: number; height: number }
): TileArea => {
  // Where the shape's edges cross the row `y` down, left and right.
  const across = (y: number): [number, number] => {
    const crossings = outline.flatMap(([x1, y1], index) => {
      const [x2, y2] = outline[(index + 1) % outline.length]!;

      if (y < Math.min(y1, y2) || y > Math.max(y1, y2)) {
        return [];
      }

      return y1 === y2 ? [x1, x2] : [x1 + ((y - y1) / (y2 - y1)) * (x2 - x1)];
    });

    return crossings.length === 0
      ? [0.5, 0.5]
      : [Math.min(...crossings), Math.max(...crossings)];
  };

  let best: TileArea = { x: 0.5, y: 0.5, width: 0, height: 0 },
    bestSide = 0;

  for (let step = 1; step <= 20; step++) {
    const height = step / 20,
      top = 0.5 - height / 2,
      [topLeft, topRight] = across(top),
      [bottomLeft, bottomRight] = across(top + height),
      left = Math.max(topLeft, bottomLeft),
      width = Math.min(topRight, bottomRight) - left;

    const side = Math.min(width * size.width, height * size.height);

    if (side > bestSide) {
      best = { x: left, y: top, width, height };
      bestSide = side;
    }
  }

  return best;
};

/**
 * Where `count` icons `size` px across (or down) go along a stretch `length` px long from `start`, as a block centred on
 *  it: each `size` apart, or closer, so that the block fits in the stretch while an icon does.
 */
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

export class Yields extends Map {
  #area: {
    outline: readonly (readonly [number, number])[];
    width: number;
    height: number;
    area: TileArea;
  } | null = null;

  // Six columns at most, the last starting five sixths of the way across, and an icon no wider than half the box, as
  //  two rows of them have to fit down it. A pack's own icons, laid out in a part of the tile, stay within it.
  protected override reach(): Reach {
    const reach = super.reach(),
      { width } = this.projection().footprint();

    return {
      ...reach,
      right: reach.right + Math.ceil((width * 5) / 6 + width / 2 - width),
    };
  }

  protected override drawTile(
    tile: Tile,
    offsetX: number,
    offsetY: number
  ): void {
    const { width, height } = this.projection().footprint(),
      own = this.tileset().yields;

    const outline = this.projection().outline?.();

    // The interface's icons, as Civ1's map has always had them: each icon's place a fraction of the tile's box. Only
    //  where the tile is its box: on a grid whose tiles have a shape of their own, they're laid out inside it, below.
    if (own === undefined && outline === undefined) {
      tileYieldIcons(squareYields(tile, squareCity(tile))).forEach(
        ({ _, x, y }) =>
          this.putImage(
            this.getInterfaceImage(`city/${_.toLowerCase()}`),
            offsetX + width * x,
            offsetY + height * y
          )
      );

      return;
    }

    // The map's pack has icons of its own (#999), each one it has and the interface's for the rest, or the tile has a
    //  shape of its own: laid out in a block centred in the part of the tile the pack gives, a diamond's middle, or else
    //  the largest box inside the tile's shape (`innerArea`), closer together the more there are, so they stay within
    //  it rather than reaching into the neighbours' tiles.
    const { columns, icons } = tileYieldGrid(
      squareYields(tile, squareCity(tile))
    );

    if (icons.length === 0) {
      return;
    }

    const images = icons.map(({ _ }) => this.#icon(_)),
      sizes = images.map((image) => imageSize(image)),
      scale = this.scale(),
      iconWidth = Math.max(...sizes.map(([w]) => w)) * scale,
      iconHeight = Math.max(...sizes.map(([, h]) => h)) * scale,
      // A pack's own icons where it says, or the whole tile where it doesn't; the interface's inside the tile's shape.
      area =
        own !== undefined || outline === undefined
          ? own?.area ?? wholeTile
          : this.#innerArea(outline, width, height),
      across = centred(
        width * area.x,
        width * area.width,
        Math.min(columns, icons.length),
        iconWidth
      ),
      down = centred(
        height * area.y,
        height * area.height,
        Math.ceil(icons.length / columns),
        iconHeight
      );

    // An icon smaller than the largest (the interface's beside the pack's own) is centred in its place.
    icons.forEach(({ column, row }, index) => {
      const [w, h] = sizes[index]!;

      this.putImage(
        images[index]!,
        offsetX + across(column) + Math.round((iconWidth - w * scale) / 2),
        offsetY + down(row) + Math.round((iconHeight - h * scale) / 2)
      );
    });
  }

  // `innerArea` for the tile's shape at this size, worked out once: every tile with yields asks for it.
  #innerArea(
    outline: readonly (readonly [number, number])[],
    width: number,
    height: number
  ): TileArea {
    const cached = this.#area;

    if (
      cached?.outline === outline &&
      cached.width === width &&
      cached.height === height
    ) {
      return cached.area;
    }

    const area = innerArea(outline, { width, height });

    this.#area = { outline, width, height, area };

    return area;
  }

  /** The map's pack's own icon for `yieldName` when it has one and it is imported, the interface's otherwise. */
  #icon(yieldName: string): CanvasImageSource {
    const tileset = this.tileset(),
      word = tileset.yields?.names[yieldName];

    if (word !== undefined) {
      const path = expandName(tileset.yields!.sprite, { yield: word });

      if (hasPreloadedImage(path, tileset)) {
        return this.getPreloadedImage(path);
      }
    }

    return this.getInterfaceImage(`city/${yieldName.toLowerCase()}`);
  }
}
export default Yields;
