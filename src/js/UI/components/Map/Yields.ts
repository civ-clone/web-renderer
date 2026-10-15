import Map from '../Map';
import { Tile } from '../../types';
import { tileYieldIcons } from '../../lib/yieldMap';

export class Yields extends Map {
  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    const size = this.tileSize();

    tileYieldIcons(tile.yields).forEach(({ _, x, y }) =>
      this.putImage(
        this.getPreloadedImage(`city/${_.toLowerCase()}`),
        offsetX + size * x,
        offsetY + size * y
      )
    );
  }
}
export default Yields;
