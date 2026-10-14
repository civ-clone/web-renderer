import { Coordinate, Tile, Unit } from '../../types';
import { Map, IMap } from '../Map';
import renderUnit, { drawUnitStatus } from '../../lib/renderUnit';

export class Units extends Map implements IMap {
  #activeUnit: Unit | null = null;
  // Where the active unit has been moved to before the engine has answered (#326). Its data still puts it on the
  //  tile it left.
  #pendingTile: Coordinate | null = null;

  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    const activeTile = this.activeTile();

    // The active unit's own layer draws that tile.
    if (
      activeTile !== null &&
      activeTile.x === tile.x &&
      activeTile.y === tile.y
    ) {
      return;
    }

    const units = this.otherUnits(tile);

    if (units.length === 0) {
      return;
    }

    const [unit] = [...units].sort(
        (a: Unit, b: Unit): number => b.defence?.value - a.defence?.value
      ),
      image = this.renderUnit(unit);

    if (units.length > 1) {
      this.putImage(image, offsetX - this.scale(), offsetY - this.scale());
    }

    this.putImage(image, offsetX, offsetY);

    drawUnitStatus(this.context(), unit, offsetX, offsetY, this.scale());
  }

  protected renderUnit(unit: Unit): CanvasImageSource {
    return renderUnit(unit);
  }

  hasActiveUnit(): boolean {
    return this.#activeUnit !== null;
  }

  setActiveUnit(
    unit: Unit | null,
    pendingTile: Coordinate | null = null
  ): void {
    this.#activeUnit = unit;
    this.#pendingTile = unit === null ? null : pendingTile;
  }

  protected activeUnit(): Unit | null {
    return this.#activeUnit;
  }

  /** Where the active unit is drawn: the tile it is moving to, while that move is answered, or its own. */
  protected activeTile(): Coordinate | null {
    return this.#pendingTile ?? this.#activeUnit?.tile ?? null;
  }

  /**
   * The units on `tile` other than the active unit, which is drawn on its own layer: while a move is answered, the
   * tile it left still lists it.
   */
  protected otherUnits(tile: Tile): Unit[] {
    const activeUnit = this.#activeUnit;

    // Every tile is drawn through here, so the list is only copied for the one that holds the active unit.
    if (
      activeUnit === null ||
      !tile.units.some((unit) => unit.id === activeUnit.id)
    ) {
      return tile.units;
    }

    return tile.units.filter((unit) => unit.id !== activeUnit.id);
  }
}

export default Units;
