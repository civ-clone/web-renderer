import { Coordinate, Tile, Unit } from '@civ-clone/ui-protocol/types';
import { Map, IMap } from '../Map';
import renderUnit, {
  drawUnitStatus,
} from '@civ-clone/ui-assets/lib/renderUnit';
import { Reach } from '../../lib/projection';

export class Units extends Map implements IMap {
  #activeUnit: Unit | null = null;
  // Where the active unit has been moved to before the engine has answered (#326). Its data still puts it on the
  //  tile it left.
  #pendingTile: Coordinate | null = null;

  protected override drawTile(
    tile: Tile,
    offsetX: number,
    offsetY: number
  ): void {
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

    const unit = [...units].sort(
        (a: Unit, b: Unit): number => b.defence?.value - a.defence?.value
      )[0]!,
      stacked = units.length > 1,
      image = this.renderUnit(unit, stacked),
      [anchorX, anchorY] = this.anchor();

    if (stacked && this.showsStackByCopy()) {
      const [stackX, stackY] = this.stackOffset();

      this.putImage(
        image,
        offsetX + anchorX + stackX,
        offsetY + anchorY + stackY
      );
    }

    this.putImage(image, offsetX + anchorX, offsetY + anchorY);

    this.drawStatus(unit, offsetX, offsetY);
  }

  /**
   * Where a unit's sprite has its top-left corner from the tile's, in px at this scale, as the tileset says: above it
   *  for a sprite taller than the tile (Civ2's 64 × 48 on 64 × 32).
   */
  protected anchor(): [number, number] {
    const { x, y } = this.tileset().units.anchor ?? { x: 0, y: 0 },
      scale = this.scale();

    return [x * scale, y * scale];
  }

  /** Whether a stack is shown by a copy of its unit behind it (Civ1's), rather than by the unit's colouring alone. */
  protected showsStackByCopy(): boolean {
    return this.tileset().units.stackOffset !== undefined;
  }

  /** Writes `unit`'s busy letter over it, drawn at `offsetX`/`offsetY`. */
  protected drawStatus(unit: Unit, offsetX: number, offsetY: number): void {
    drawUnitStatus(
      this.context(),
      unit,
      offsetX,
      offsetY,
      this.scale(),
      this.nativeTileSize(),
      this.tileset()
    );
  }

  // The copy behind a stack reaches past the tile on the sides the tileset moves it to (Civ1's, a scale step up and
  //  left). A sprite taller than the tile reaches above it as far as its anchor puts it, which the projection's own
  //  reach already leaves room for (`validateDescriptor` holds the anchor to the geometry's overhang).
  protected override reach(): Reach {
    const reach = super.reach(),
      [anchorX, anchorY] = this.anchor(),
      [stackX, stackY] = this.stackOffset(),
      left = anchorX + stackX,
      top = anchorY + stackY;

    // The unit reaches as far up and left as its anchor or the projection's sprites do, whichever is further, and the
    //  copy behind a stack as far again as it is moved from the unit. Right and down, a sprite the size of the tile
    //  reaches past it as far as the unit or the copy is moved that way, whichever is further.
    return {
      top: Math.max(reach.top, -anchorY) + Math.max(0, -stackY),
      right: reach.right + Math.max(0, anchorX, left),
      bottom: reach.bottom + Math.max(0, anchorY, top),
      left: Math.max(reach.left, -anchorX) + Math.max(0, -stackX),
    };
  }

  /** `unit` as the tileset draws it, `stacked` when it is one of several on its square. */
  protected renderUnit(
    unit: Unit,
    stacked: boolean = false
  ): CanvasImageSource {
    return renderUnit(unit, this.tileset(), stacked);
  }

  /**
   * Where the copy behind a stack is drawn from the unit, in px at this scale, as the tileset says: nowhere, for a
   *  tileset that shows a stack by the unit's colouring alone (Civ2's back-shield).
   */
  protected stackOffset(): [number, number] {
    const { x, y } = this.tileset().units.stackOffset ?? { x: 0, y: 0 },
      scale = this.scale();

    return [x * scale, y * scale];
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
