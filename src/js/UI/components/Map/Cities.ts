import { Map } from '../Map';
import { Tile } from '../../types';

export class Cities extends Map {
  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    if (!tile.city) {
      return;
    }

    const size = this.tileSize(),
      city = tile.city,
      player = city.player,
      civilization = player.civilization,
      [colors] = civilization.attributes.filter(
        (attribute) => attribute.name === 'colors'
      );

    if (tile.units.length > 0) {
      this.context().fillStyle = '#000';
      this.context().fillRect(offsetX, offsetY, size, size);
    }

    this.context().fillStyle = colors.value[0];
    this.context().fillRect(
      offsetX + this.scale(),
      offsetY + this.scale(),
      size - this.scale() * 2,
      size - this.scale() * 2
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
