import { EntityInstance, Tile } from '../../types';
import { Map } from '../Map';

// The width the minimap is given in the sidebar. The layer picks the largest
// whole number of pixels per tile that fits, so tiles always land on whole
// pixels and the canvas is displayed without a fractional downscale.
export const OVERVIEW_WIDTH = 190;

const landColour = '#58a038',
  waterColour = '#2848a0',
  // One flat colour per terrain, rather than a downscale of the tile sprites:
  // at two or three pixels a tile there is nothing legible in a sprite to keep.
  // These belong in a theme manifest once there is one (#39/#56).
  terrainColours: { [terrain: string]: string } = {
    Arctic: '#f0f0f0',
    Desert: '#e0c070',
    Forest: '#286028',
    Grassland: landColour,
    Hills: '#889040',
    Jungle: '#386828',
    Mountains: '#888078',
    Ocean: waterColour,
    Plains: '#b0a048',
    River: '#4878b0',
    Swamp: '#4c6040',
    Tundra: '#c0c0a0',
  };

/**
 * The whole world at a few pixels a tile, for the minimap.
 *
 * The minimap used to be three full-world layer canvases scaled down on every
 * update — 14.7 megapixels thrown into a 190px-wide target, on every patch and
 * every recentre. This draws the same information directly at the size it is
 * wanted, so an update is one small blit and a tile change repaints one tile.
 *
 * It is never composited onto the map, so it stays invisible to `Portal`; it
 * lives in the portal's layer list only so `build()` feeds it tile updates
 * alongside every other layer.
 */
export class Overview extends Map {
  constructor(...args: ConstructorParameters<typeof Map>) {
    super(...args);

    this.setVisible(false);
  }

  // Deliberately ignores the portal's scale and tile size: the minimap is an
  // overview at its own fixed size, not a scaled view of the map.
  tileSize(): number {
    return Math.max(1, Math.trunc(OVERVIEW_WIDTH / this.world().width()));
  }

  renderTile(tile: Tile): void {
    const size = this.tileSize(),
      offsetX = tile.x * size,
      offsetY = tile.y * size,
      context = this.context();

    context.clearRect(offsetX, offsetY, size, size);

    // Unexplored draws nothing rather than a default colour, so how much of the
    // world is still dark reads at a glance — which is most of what a minimap
    // is for early on.
    if (tile.terrain._ === 'Unknown') {
      return;
    }

    context.fillStyle = this.terrainColour(tile);
    context.fillRect(offsetX, offsetY, size, size);

    if (tile.city === null) {
      return;
    }

    // Cities take the owner's colour, so whose territory is where can be read
    // without opening anything.
    const [colours] = tile.city.player.civilization.attributes.filter(
      (attribute: EntityInstance) => attribute.name === 'colors'
    ) as { value: string[] }[];

    if (!colours) {
      return;
    }

    context.fillStyle = colours.value[0];
    context.fillRect(offsetX, offsetY, size, size);
  }

  protected terrainColour(tile: Tile): string {
    return (
      terrainColours[tile.terrain._] ??
      // Terrains come from a registry that plugins extend, so anything the
      // table does not know still gets land or water rather than a hole.
      (tile.isWater ? waterColour : landColour)
    );
  }
}

export default Overview;
