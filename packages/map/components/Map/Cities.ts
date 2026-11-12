import { City, Tile } from '@civ-clone/ui-protocol/types';
import { Colouring } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import { Map } from '../Map';
import { Reach } from '../../lib/projection';
import citySprite from '@civ-clone/ui-assets/lib/citySprite';
import { imageSize } from '@civ-clone/ui-assets/lib/imageSize';
import {
  playerColours,
  replacementColours,
} from '@civ-clone/ui-assets/lib/renderUnit';
import { resolveAnchor } from '@civ-clone/ui-assets/lib/spriteAnchors';

export class Cities extends Map {
  // The city glyph is drawn the tileset's inset right of and below the tile's corner (Civ1's, a scale step). A sprite
  //  taller than the tile reaches above it as far as its anchor puts it (Civ2's), which the projection's own reach
  //  already leaves room for (`validateDescriptor` holds the anchor to the geometry's overhang).
  protected override reach(): Reach {
    const reach = super.reach(),
      inset = this.inset(),
      [anchorX, anchorY] = this.anchor();

    return {
      top: Math.max(reach.top, -anchorY),
      right: reach.right + inset + Math.max(0, anchorX),
      bottom: reach.bottom + inset + Math.max(0, anchorY),
      left: Math.max(reach.left, -anchorX),
    };
  }

  /**
   * Where a city's sprite has its top-left corner from the tile's, in px at this scale, as the tileset says: above it
   *  for a sprite taller than the tile.
   */
  protected anchor(): [number, number] {
    const { x, y } = this.tileset().cities.anchor ?? { x: 0, y: 0 },
      scale = this.scale();

    return [x * scale, y * scale];
  }

  /** How far in from the tile the player's box and the city's sprite go, in px at this scale: none but a box city's. */
  protected inset(): number {
    return (this.tileset().cities.inset ?? 0) * this.scale();
  }

  protected override drawTile(
    tile: Tile,
    offsetX: number,
    offsetY: number
  ): void {
    if (!tile.city) {
      return;
    }

    if (this.tileset().cities.mode === 'styles') {
      this.#drawStyled(tile.city, offsetX, offsetY);

      return;
    }

    // A city in a box of the player's first colour, on one of the tileset's colour when it has units in it. A box
    //  city's colouring swaps colour keys: `validateDescriptor` refuses an overlay for one.
    const { width, height } = this.projection().footprint(),
      { sprite, occupied, colouring } = this.tileset().cities,
      replaceKeys = colouring as Extract<Colouring, { mode: 'replaceColours' }>,
      playerColour = playerColours(tile.city.player),
      inset = this.inset();

    if (tile.units.length > 0) {
      // A box city has one: `validateDescriptor` refuses it without.
      this.context().fillStyle = occupied!;
      this.context().fillRect(offsetX, offsetY, width, height);
    }

    // Every civilization has at least one colour.
    this.context().fillStyle = playerColour[0]!;
    this.context().fillRect(
      offsetX + inset,
      offsetY + inset,
      width - inset * 2,
      height - inset * 2
    );

    this.drawImage(sprite, offsetX, offsetY, {
      augment: (image) =>
        this.replaceColours(
          image,
          replaceKeys.keys,
          replacementColours(replaceKeys, playerColour)
        ),
      offsetX: inset,
      offsetY: inset,
    });
  }

  // A `styles` city (Civ2's): the sprite for its style, size and walls, with no box round it, and its player's flag over
  //  it, the flag's keys swapped for the player's colours, at the sprite's own anchor for it. A sprite with no such
  //  anchor has no flag drawn rather than one in the wrong place.
  #drawStyled(city: City, offsetX: number, offsetY: number): void {
    const tileset = this.tileset(),
      // A styles city's colouring is the flag's overlay: `validateDescriptor` refuses anything else for one.
      flag = tileset.cities.colouring as Extract<
        Colouring,
        { mode: 'overlay' }
      >,
      sprite = citySprite(tileset, city),
      [anchorX, anchorY] = this.anchor(),
      cityX = offsetX + anchorX,
      cityY = offsetY + anchorY,
      flagAt = resolveAnchor(tileset, sprite, flag.anchor),
      scale = this.scale();

    this.drawImage(sprite, cityX, cityY);

    if (flagAt === null) {
      return;
    }

    // Within the city's sprite, which is as far as `reach()` leaves room for: a flag whose anchor puts it partly past
    //  the sprite's edge is cut off there.
    const [spriteWidth, spriteHeight] = imageSize(
        this.getPreloadedImage(sprite)
      ),
      [flagWidth, flagHeight] = imageSize(this.getPreloadedImage(flag.sprite)),
      clipped =
        flagAt.x < 0 ||
        flagAt.y < 0 ||
        flagAt.x + flagWidth > spriteWidth ||
        flagAt.y + flagHeight > spriteHeight,
      context = this.context();

    if (clipped) {
      context.save();
      context.beginPath();
      context.rect(cityX, cityY, spriteWidth * scale, spriteHeight * scale);
      context.clip();
    }

    this.drawImage(flag.sprite, cityX, cityY, {
      augment: (image) =>
        this.replaceColours(
          image,
          flag.keys,
          replacementColours(flag, playerColours(city.player))
        ),
      offsetX: flagAt.x * scale,
      offsetY: flagAt.y * scale,
    });

    if (clipped) {
      context.restore();
    }
  }
}

export default Cities;
