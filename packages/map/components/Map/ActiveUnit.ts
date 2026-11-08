import { IMap } from '../Map';
import { Rect } from '../../lib/viewport';
import Units from './Units';
import { imageSize } from '@civ-clone/ui-assets/lib/imageSize';

export class ActiveUnit extends Units implements IMap {
  // This layer only ever holds the one unit, so it can clear just what it drew
  // last rather than the whole viewport, and tell the portal to recomposite
  // only that much when the blink turns it on and off.
  #drawn: Rect[] = [];
  // Where the unit was drawn last, for the ring round it (#753): its sprite, which a tileset may draw smaller than the
  //  square (Civ1's are a pixel short of it), so the ring is round the unit rather than off to one side of it.
  #squares: Rect[] = [];

  render(): void {
    this.#drawn.forEach(({ x, y, width, height }) => {
      this.context().clearRect(x, y, width, height);

      this.markDirty(x, y, width, height);
    });

    this.#drawn = [];
    this.#squares = [];

    const activeUnit = this.activeUnit(),
      activeTile = this.activeTile();

    if (activeUnit === null || activeTile === null) {
      return;
    }

    // On the tile it is moving to, while the engine answers the move (#326).
    const tile = this.world().get(activeTile.x, activeTile.y),
      { width, height } = this.projection().footprint(),
      reach = this.reach(),
      [stackX, stackY] = this.stackOffset(),
      image = this.renderUnit(activeUnit),
      [imageWidth, imageHeight] = imageSize(image),
      // A missing sprite has no size: the square, then.
      [ringWidth, ringHeight] =
        imageWidth > 0 && imageHeight > 0
          ? [imageWidth * this.scale(), imageHeight * this.scale()]
          : [width, height],
      // Not yet listed on a tile it is moving to, and still listed on its own.
      stacked = this.otherUnits(tile).length > 0;

    this.placements(tile).forEach(([offsetX, offsetY]) => {
      if (stacked) {
        this.putImage(image, offsetX + stackX, offsetY + stackY);
      }

      this.putImage(image, offsetX, offsetY);

      this.drawStatus(activeUnit, offsetX, offsetY);

      // The tile's box and as far past it as a unit is drawn: the stacked
      // copy where the tileset moves it, and whatever the projection's
      // sprites reach.
      const drawn = {
        x: offsetX - reach.left,
        y: offsetY - reach.top,
        width: width + reach.left + reach.right,
        height: height + reach.top + reach.bottom,
      };

      this.#drawn.push(drawn);
      // Round the stacked copy behind it too, where the tileset moves it out from under the unit.
      const [backX, backY] = stacked ? [stackX, stackY] : [0, 0],
        left = offsetX + Math.min(0, backX),
        top = offsetY + Math.min(0, backY);

      this.#squares.push({
        x: left,
        y: top,
        width: offsetX + Math.max(0, backX) + ringWidth - left,
        height: offsetY + Math.max(0, backY) + ringHeight - top,
      });

      this.markDirty(drawn.x, drawn.y, drawn.width, drawn.height);
    });
  }

  update(): void {
    this.render();
  }

  /** The unit's square on the canvas, once for each copy of it in view: none with no unit active. */
  squares(): Rect[] {
    return this.#squares.map((square) => ({ ...square }));
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
    this.#squares = [];

    this.render();
  }
}

export default ActiveUnit;
