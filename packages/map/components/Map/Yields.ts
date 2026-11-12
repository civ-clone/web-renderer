import {
  TileArea,
  expandName,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import {
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

    // The interface's icons, as Civ1's map has always had them: each icon's place a fraction of the tile's box.
    if (own === undefined) {
      tileYieldIcons(tile.yields).forEach(({ _, x, y }) =>
        this.putImage(
          this.getInterfaceImage(`city/${_.toLowerCase()}`),
          offsetX + width * x,
          offsetY + height * y
        )
      );

      return;
    }

    // The map's pack has icons of its own (#999): each one it has, the interface's for the rest, laid out in a block
    //  centred in the part of the tile it gives, a diamond's middle, closer together the more there are, so they stay
    //  within it rather than reaching into the neighbours' tiles.
    const { columns, icons } = tileYieldGrid(tile.yields);

    if (icons.length === 0) {
      return;
    }

    const images = icons.map(({ _ }) => this.#icon(_)),
      sizes = images.map((image) => imageSize(image)),
      scale = this.scale(),
      iconWidth = Math.max(...sizes.map(([w]) => w)) * scale,
      iconHeight = Math.max(...sizes.map(([, h]) => h)) * scale,
      area = own.area ?? wholeTile,
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
