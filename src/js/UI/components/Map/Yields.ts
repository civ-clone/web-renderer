import Map from '../Map';
import { Reach } from '../../lib/projection';
import { Tile } from '../../types';
import { tileYieldIcons } from '../../lib/yieldMap';

export class Yields extends Map {
  // Six columns at most, the last starting five sixths of the way across, and an icon no wider than half the box, as
  //  two rows of them have to fit down it.
  protected reach(): Reach {
    const reach = super.reach(),
      { width } = this.projection().footprint();

    return {
      ...reach,
      right: reach.right + Math.ceil((width * 5) / 6 + width / 2 - width),
    };
  }

  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    const { width, height } = this.projection().footprint();

    // Each icon's place is a fraction of the tile's box.
    tileYieldIcons(tile.yields).forEach(({ _, x, y }) =>
      this.putImage(
        this.getPreloadedImage(`city/${_.toLowerCase()}`),
        offsetX + width * x,
        offsetY + height * y
      )
    );
  }
}
export default Yields;
