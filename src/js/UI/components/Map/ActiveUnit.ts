import { IMap } from '../Map';
import { Rect } from '../../lib/viewport';
import Units from './Units';
import { drawUnitStatus } from '../../lib/renderUnit';

export class ActiveUnit extends Units implements IMap {
  // This layer only ever holds the one unit, so it can clear just what it drew
  // last rather than the whole viewport, and tell the portal to recomposite
  // only that much when the blink turns it on and off.
  #drawn: Rect[] = [];

  render(): void {
    this.#drawn.forEach(({ x, y, width, height }) => {
      this.context().clearRect(x, y, width, height);

      this.markDirty(x, y, width, height);
    });

    this.#drawn = [];

    const activeUnit = this.activeUnit(),
      activeTile = this.activeTile();

    if (activeUnit === null || activeTile === null) {
      return;
    }

    // On the tile it is moving to, while the engine answers the move (#326).
    const tile = this.world().get(activeTile.x, activeTile.y),
      { width, height } = this.projection().footprint(),
      scale = this.scale(),
      image = this.renderUnit(activeUnit),
      // Not yet listed on a tile it is moving to, and still listed on its own.
      stacked = this.otherUnits(tile).length > 0;

    this.placements(tile).forEach(([offsetX, offsetY]) => {
      if (stacked) {
        this.putImage(image, offsetX - scale, offsetY - scale);
      }

      this.putImage(image, offsetX, offsetY);

      drawUnitStatus(
        this.context(),
        activeUnit,
        offsetX,
        offsetY,
        scale,
        this.tileSize() / scale
      );

      // The stacked copy sits one scale step up and left of the tile, and a
      // unit sprite is never bigger than a tile's box, so this covers both
      // draws.
      const drawn = {
        x: offsetX - scale,
        y: offsetY - scale,
        width: width + scale,
        height: height + scale,
      };

      this.#drawn.push(drawn);

      this.markDirty(drawn.x, drawn.y, drawn.width, drawn.height);
    });
  }

  update(): void {
    this.render();
  }

  // The blink flips this layer on and off twice a second; all the portal has to
  // put back is the tile the unit is on.
  protected markContentDirty(): void {
    this.#drawn.forEach(({ x, y, width, height }) =>
      this.markDirty(x, y, width, height)
    );
  }

  // One tile is cheaper to draw again than to blit and patch up, and it saves
  // having to move `#drawn` along with the rest of the canvas.
  protected scrollTo(originX: number, originY: number): void {
    this.setOrigin(originX, originY);

    this.clear();

    this.#drawn = [];

    this.render();
  }
}

export default ActiveUnit;
