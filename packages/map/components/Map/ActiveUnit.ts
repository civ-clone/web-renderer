import { IMap } from '../Map';
import { Rect } from '../../lib/viewport';
import Units from './Units';
import { imageSize } from '@civ-clone/ui-assets/lib/imageSize';

/** The colours of the ring drawn under the unit on a grid whose tiles have a shape of their own (#97). */
export interface RingColours {
  colour: string;
  halo: string;
}

export class ActiveUnit extends Units implements IMap {
  // This layer only ever holds the one unit, so it can clear just what it drew
  // last rather than the whole viewport, and tell the portal to recomposite
  // only that much when the blink turns it on and off.
  #drawn: Rect[] = [];
  // Where the unit was drawn last, for the ring round it (#753): its sprite, which a tileset may draw smaller than the
  //  square (Civ1's are a pixel short of it), so the ring is round the unit rather than off to one side of it.
  #squares: Rect[] = [];
  // The ring drawn under the unit, the tile's own shape, on a grid whose tiles have one (#97), or none.
  #ring: RingColours | null = null;

  /**
   * Draws `ring` under the unit from now on, round the tile's own shape (`outline`), or none for null: on the
   *  isometric grid, where a ring over the map would cut through a unit taller than its tile, as Civ2 draws its marker
   *  under the unit. Steady, or blinking with the unit when it blinks. Whether that changed what is drawn.
   */
  setRing(ring: RingColours | null): boolean {
    if (
      ring?.colour === this.#ring?.colour &&
      ring?.halo === this.#ring?.halo
    ) {
      return false;
    }

    this.#ring = ring;

    this.render();

    return true;
  }

  override render(): void {
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
      // Not yet listed on a tile it is moving to, and still listed on its own.
      stacked = this.otherUnits(tile).length > 0,
      // A stack shown by a copy of the unit behind it, or by the unit's colouring alone.
      byCopy = stacked && this.showsStackByCopy(),
      [stackX, stackY] = this.stackOffset(),
      [anchorX, anchorY] = this.anchor(),
      image = this.renderUnit(activeUnit, stacked),
      [imageWidth, imageHeight] = imageSize(image),
      // A missing sprite has no size: the square, then.
      [ringWidth, ringHeight] =
        imageWidth > 0 && imageHeight > 0
          ? [imageWidth * this.scale(), imageHeight * this.scale()]
          : [width, height];

    this.placements(tile).forEach(([offsetX, offsetY]) => {
      // Where the sprite goes: the tile's corner, or above it for a sprite taller than the tile.
      const unitX = offsetX + anchorX,
        unitY = offsetY + anchorY;

      this.#drawRing(offsetX, offsetY, width, height);

      if (byCopy) {
        this.putImage(image, unitX + stackX, unitY + stackY);
      }

      this.putImage(image, unitX, unitY);

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
      const [backX, backY] = byCopy ? [stackX, stackY] : [0, 0],
        left = unitX + Math.min(0, backX),
        top = unitY + Math.min(0, backY);

      // On a grid whose tiles aren't their boxes (the isometric grid's diamonds, #97), the ring is the tile's own
      //  shape round its box (`outline`), as a ring round a tall sprite would cover its neighbours.
      this.#squares.push(
        this.outline() !== null
          ? { x: offsetX, y: offsetY, width, height }
          : {
              x: left,
              y: top,
              width: unitX + Math.max(0, backX) + ringWidth - left,
              height: unitY + Math.max(0, backY) + ringHeight - top,
            }
      );

      this.markDirty(drawn.x, drawn.y, drawn.width, drawn.height);
    });
  }

  override update(): void {
    this.render();
  }

  // The ring round the tile's own shape in its box at `x`, `y`, under the unit: a halo, then the line over it, each as
  //  wide as the map's scale makes it and kept inside the box.
  #drawRing(x: number, y: number, width: number, height: number): void {
    const outline = this.outline(),
      ring = this.#ring;

    if (outline === null || ring === null) {
      return;
    }

    const context = this.context(),
      line = 2 * this.scale(),
      halo = line + 2 * this.scale(),
      inset = halo / 2;

    context.save();
    context.beginPath();
    outline.forEach(([fractionX, fractionY], index) => {
      // Each corner pulled in by the halo's half-width on every side, so its round joins stay in the box, which is what
      //  the layer clears and invalidates when the ring moves.
      const pointX = x + inset + fractionX * (width - inset * 2),
        pointY = y + inset + fractionY * (height - inset * 2);

      if (index === 0) {
        context.moveTo(pointX, pointY);
      } else {
        context.lineTo(pointX, pointY);
      }
    });
    context.closePath();
    context.lineJoin = 'round';
    context.strokeStyle = ring.halo;
    context.lineWidth = halo;
    context.stroke();
    context.strokeStyle = ring.colour;
    context.lineWidth = line;
    context.stroke();
    context.restore();
  }

  /**
   * The shape of the ring round each of `squares`, as fractions of it (`Projection.outline`): the tile's diamond on the
   *  isometric grid, or null for the square itself.
   */
  outline(): readonly (readonly [number, number])[] | null {
    return this.projection().outline?.() ?? null;
  }

  /** The unit's square on the canvas, once for each copy of it in view: none with no unit active. */
  squares(): Rect[] {
    return this.#squares.map((square) => ({ ...square }));
  }

  // The blink flips this layer on and off twice a second; all the portal has to
  // put back is the tile the unit is on.
  protected override markContentDirty(): void {
    this.#drawn.forEach(({ x, y, width, height }) =>
      this.markDirty(x, y, width, height)
    );
  }

  // One tile is cheaper to draw again than to blit and patch up, and it saves
  // having to move `#drawn` along with the rest of the canvas.
  protected override scrollTo(originX: number, originY: number): void {
    this.setOrigin(originX, originY);

    this.clear();

    this.#drawn = [];
    this.#squares = [];

    this.render();
  }
}

export default ActiveUnit;
