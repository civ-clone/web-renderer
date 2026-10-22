import { Map } from '../Map';
import { Reach } from '../../lib/projection';
import { Tile } from '../../types';

export class Cities extends Map {
  // The city glyph is drawn a scale step right of and below the tile's corner.
  protected reach(): Reach {
    const reach = super.reach(),
      scale = this.scale();

    return {
      ...reach,
      right: reach.right + scale,
      bottom: reach.bottom + scale,
    };
  }

  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    if (!tile.city) {
      return;
    }

    const { width, height } = this.projection().footprint(),
      city = tile.city,
      player = city.player,
      civilization = player.civilization,
      [colors] = civilization.attributes.filter(
        (attribute) => attribute.name === 'colors'
      );

    if (tile.units.length > 0) {
      this.context().fillStyle = '#000';
      this.context().fillRect(offsetX, offsetY, width, height);
    }

    this.context().fillStyle = colors.value[0];
    this.context().fillRect(
      offsetX + this.scale(),
      offsetY + this.scale(),
      width - this.scale() * 2,
      height - this.scale() * 2
    );

    this.drawImage(`map/city`, offsetX, offsetY, {
      augment: (image) =>
        this.replaceColours(
          image,
          // To come from theme manifest
          ['#000'],
          [colors.value[1]]
        ),
      offsetX: this.scale(),
      offsetY: this.scale(),
    });
  }
}

export default Cities;
