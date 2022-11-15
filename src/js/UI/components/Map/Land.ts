import TerrainAbstract from './TerrainAbstract';
import { Tile } from '../../types';
import { e } from '../../lib/html';

export class Land extends TerrainAbstract {
  renderTile(tile: Tile): void {
    super.renderTile(tile);

    const { x, y } = tile,
      size = this.tileSize(),
      offsetX = x * size,
      offsetY = y * size;

    if (tile.terrain._ === 'Unknown') {
      return;
    }

    if (tile.isLand) {
      this.drawImage('terrain/land', x, y);
    } else if (tile.isWater) {
      this.drawImage('terrain/ocean', x, y);

      if (tile.isCoast) {
        const sprite = this.getPreloadedImage(
            'terrain/coast_sprite'
          ) as HTMLImageElement,
          // formula from: http://forums.civfanatics.com/showpost.php?p=13507808&postcount=40
          // Build a bit mask of all 8 surrounding tiles, setting the bit if the tile is not an
          // ocean tile. Starting with the tile to the left as the least significant bit and
          // going clockwise
          bitmask =
            (this.world().getNeighbour(tile, 'w').isLand ? 1 : 0) |
            (this.world().getNeighbour(tile, 'nw').isLand ? 2 : 0) |
            (this.world().getNeighbour(tile, 'n').isLand ? 4 : 0) |
            (this.world().getNeighbour(tile, 'ne').isLand ? 8 : 0) |
            (this.world().getNeighbour(tile, 'e').isLand ? 16 : 0) |
            (this.world().getNeighbour(tile, 'se').isLand ? 32 : 0) |
            (this.world().getNeighbour(tile, 's').isLand ? 64 : 0) |
            (this.world().getNeighbour(tile, 'sw').isLand ? 128 : 0);

        if (bitmask > 0) {
          // There are at least one surrounding tile that is not ocean, so we need to render
          // coast. We divide the tile into four 8x8 subtiles and for each of these we want
          // a 3 bit bitmask of the surrounding tiles. We do this by looking at the 3 least
          // significant bits for the top left subtile and shift the mask to the right as we
          // are going around the tile. This way we are "rotating" our bitmask. The result
          // are our x offsets into ter257.pic
          let topLeftSubtileOffset = bitmask & 7,
            topRightSubtileOffset = (bitmask >> 2) & 7,
            bottomRightSubtileOffset = (bitmask >> 4) & 7,
            bottomLeftSubtileOffset =
              ((bitmask >> 6) & 7) | ((bitmask & 1) << 2);

          const image = e(
              'canvas[height="16"][width="16"]'
            ) as HTMLCanvasElement,
            imageContext = image.getContext('2d') as CanvasRenderingContext2D;

          imageContext.drawImage(
            sprite,
            topLeftSubtileOffset << 4,
            0,
            8,
            8,
            0,
            0,
            8,
            8
          );
          imageContext.drawImage(
            sprite,
            (topRightSubtileOffset << 4) + 8,
            0,
            8,
            8,
            8,
            0,
            8,
            8
          );
          imageContext.drawImage(
            sprite,
            (bottomRightSubtileOffset << 4) + 8,
            8,
            8,
            8,
            8,
            8,
            8,
            8
          );
          imageContext.drawImage(
            sprite,
            bottomLeftSubtileOffset << 4,
            8,
            8,
            8,
            0,
            8,
            8,
            8
          );

          this.putImage(image, offsetX, offsetY);
        }

        this.filterNeighbours(
          tile,
          (tile: Tile): boolean => tile.terrain._ === 'River'
        ).forEach((direction) =>
          this.drawImage(`terrain/river_mouth_${direction}`, x, y)
        );
      }
    }
  }
}

export default Land;
