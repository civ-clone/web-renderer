import { Colouring } from '../../tilesets/TilesetDescriptor';
import { Map } from '../Map';
import { Reach } from '../../lib/projection';
import { Tile } from '../../types';
import { playerColours, replacementColours } from '../../lib/renderUnit';

export class Cities extends Map {
  // The city glyph is drawn the tileset's inset right of and below the tile's corner (Civ1's, a scale step).
  protected reach(): Reach {
    const reach = super.reach(),
      inset = this.inset();

    return {
      ...reach,
      right: reach.right + inset,
      bottom: reach.bottom + inset,
    };
  }

  /** How far in from the tile the player's box and the city's sprite go, in px at this scale. */
  protected inset(): number {
    return this.tileset().cities.inset * this.scale();
  }

  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    if (!tile.city) {
      return;
    }

    // A city in a box of the player's first colour, on one of the tileset's colour when it has units in it. Only
    //  `box` cities and colour keys can be drawn yet: `validateDescriptor` refuses the others (#152).
    const { width, height } = this.projection().footprint(),
      { sprite, occupied, colouring } = this.tileset().cities,
      replaceKeys = colouring as Extract<Colouring, { mode: 'replaceColours' }>,
      playerColour = playerColours(tile.city.player),
      inset = this.inset();

    if (tile.units.length > 0) {
      this.context().fillStyle = occupied;
      this.context().fillRect(offsetX, offsetY, width, height);
    }

    this.context().fillStyle = playerColour[0];
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
}

export default Cities;
