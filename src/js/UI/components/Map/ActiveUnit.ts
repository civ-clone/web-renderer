import { IMap } from '../Map';
import Units from './Units';

export class ActiveUnit extends Units implements IMap {
  // This layer only ever holds the one unit, so it can clear just what it drew
  // last rather than the whole world canvas — 2560x1600 at 80x50 scale 2, wiped
  // twice a second by the blink tick to redraw a single tile.
  #lastDrawn: [number, number, number, number] | null = null;

  render(): void {
    if (this.#lastDrawn !== null) {
      this.context().clearRect(...this.#lastDrawn);

      this.#lastDrawn = null;
    }

    const activeUnit = this.activeUnit();

    if (activeUnit === null) {
      return;
    }

    const { x, y } = activeUnit.tile,
      tile = this.world().get(x, y),
      size = this.tileSize(),
      offsetX = x * size,
      offsetY = y * size,
      image = this.renderUnit(activeUnit);

    if (tile.units.length > 1) {
      this.putImage(image, offsetX - this.scale(), offsetY - this.scale());
    }

    this.putImage(image, offsetX, offsetY);

    // The stacked copy sits one scale step up and left of the tile, and a unit
    // sprite is never wider than a tile, so this covers both draws.
    this.#lastDrawn = [
      offsetX - this.scale(),
      offsetY - this.scale(),
      size + this.scale(),
      size + this.scale(),
    ];
  }

  update(): void {
    this.render();
  }
}

export default ActiveUnit;
