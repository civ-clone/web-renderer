import Map from '../Map';
import { Tile } from '../../types';
import { tileYieldIcons } from '../../lib/yieldMap';

export class Yields extends Map {
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
