import { City, Tile } from '../../types';
import Map from '../Map';

export class Unworkable extends Map {
  #city: City | null = null;

  setCity(city: City): void {
    this.#city = city;
  }

  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    const size = this.tileSize();

    if (
      tile.workedBy !== null &&
      this.#city !== null &&
      tile.workedBy.id !== this.#city.id
    ) {
      this.context().fillStyle = 'rgba(200, 64, 64, 0.5)';
      this.context().fillRect(offsetX, offsetY, size, size);
    }
  }
}

export default Unworkable;
