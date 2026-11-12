import { City, Tile } from '@civ-clone/ui-protocol/types';
import Map from '../Map';

export class Unworkable extends Map {
  #city: City | null = null;

  setCity(city: City): void {
    this.#city = city;
  }

  protected override drawTile(
    tile: Tile,
    offsetX: number,
    offsetY: number
  ): void {
    const projection = this.projection(),
      { width, height } = projection.footprint();

    if (
      tile.workedBy !== null &&
      this.#city !== null &&
      tile.workedBy.id !== this.#city.id
    ) {
      const context = this.context(),
        // The tile's own shape where it is not its box, as fractions of the box: a diamond on the isometric grid, which
        //  a box would spill out of on to the four neighbours whose corners are in it.
        outline = projection.outline?.();

      context.fillStyle = 'rgba(200, 64, 64, 0.5)';

      if (outline === undefined) {
        context.fillRect(offsetX, offsetY, width, height);

        return;
      }

      context.beginPath();
      outline.forEach(([x, y], index) =>
        index === 0
          ? context.moveTo(offsetX + x * width, offsetY + y * height)
          : context.lineTo(offsetX + x * width, offsetY + y * height)
      );
      context.closePath();
      context.fill();
    }
  }
}

export default Unworkable;
