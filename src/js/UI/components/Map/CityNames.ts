import { Tile } from '../../types';
import { Map } from '../Map';
import { instance as localeProvider } from '../../LocaleProvider';
import { t } from 'i18next';
import { cityName } from '../lib/city';

export class CityNames extends Map {
  renderTile(tile: Tile): void {
    if (!tile.city) {
      return;
    }

    super.renderTile(tile);

    const { x, y } = tile,
      size = this.tileSize(),
      offsetX = x * size,
      offsetY = y * size,
      city = tile.city,
      sizeOffsetX = this.tileSize() / 2,
      sizeOffsetY = this.tileSize() * 0.75,
      textOffsetX = this.tileSize() / 2,
      textOffsetY = this.tileSize() * 1.6;

    this.context().font = `bold ${8 * this.scale()}px sans-serif`;
    this.context().fillStyle = 'black';
    this.context().textAlign = 'center';
    this.context().fillText(
      localeProvider.number(city.growth.size),
      offsetX + sizeOffsetX + this.scale(),
      offsetY + sizeOffsetY
    );
    this.context().fillText(
      cityName(city),
      offsetX + textOffsetX + this.scale(),
      offsetY + textOffsetY
    );
    this.context().fillStyle = 'white';
    this.context().fillText(
      localeProvider.number(city.growth.size),
      offsetX + sizeOffsetX,
      offsetY + sizeOffsetY - this.scale()
    );
    this.context().fillText(
      cityName(city),
      offsetX + textOffsetX,
      offsetY + textOffsetY - this.scale()
    );
  }

  update(): void {
    this.clear();

    // TODO: Could be a little smarter about this...
    this.world()
      .tiles()
      .filter((tile) => !!tile.city)
      .forEach((tile) => this.renderTile(tile));
  }
}

export default CityNames;
