import { Tile, Unit } from '../../types';
import { Map, IMap } from '../Map';
import renderUnit from '../../lib/renderUnit';

export class Units extends Map implements IMap {
  #activeUnit: Unit | null = null;

  renderTile(tile: Tile): void {
    super.renderTile(tile);

    const { x, y } = tile,
      size = this.tileSize(),
      offsetX = x * size,
      offsetY = y * size;

    if (
      tile.units.length > 0 &&
      (this.#activeUnit !== null ? this.#activeUnit.tile.id !== tile.id : true)
    ) {
      const [unit] = tile.units.sort(
          (a: Unit, b: Unit): number => b.defence?.value - a.defence?.value
        ),
        image = this.renderUnit(unit);

      if (tile.units.length > 1) {
        this.putImage(image, offsetX - this.scale(), offsetY - this.scale());
      }

      this.putImage(image, offsetX, offsetY);
    }
  }

  protected renderUnit(unit: Unit): CanvasImageSource {
    return renderUnit(unit);
  }

  setActiveUnit(unit: Unit | null): void {
    this.#activeUnit = unit;
  }

  protected activeUnit(): Unit | null {
    return this.#activeUnit;
  }
}

export default Units;
