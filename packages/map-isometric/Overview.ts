import { Attribute, Tile } from '@civ-clone/ui-protocol/types';
import { OVERVIEW_WIDTH, terrainColour } from '@civ-clone/ui-map/lib/overview';
import { Projection, Size } from '@civ-clone/ui-map/lib/projection';
import { Map } from '@civ-clone/ui-map/components/Map';
import OverviewProjection from './OverviewProjection';

/**
 * The size of one brick of the isometric overview over a world `width` tiles across: the widest that fits the
 * minimap's slot, a multiple of 4 px so that a brick a quarter as tall as it is wide (a 2:1 diamond's row step) and the
 * odd rows' half-brick shift are both whole pixels. A world too wide for 4 px a tile is drawn wider than the slot, and
 * shown scaled down, as the square overview does with one too wide for 1 px.
 */
export const overviewCell = (width: number): Size => {
  const across = 4 * Math.max(1, Math.trunc(OVERVIEW_WIDTH / (4 * width)));

  return { width: across, height: across / 4 };
};

/**
 * The whole isometric world at a few pixels a tile, for the minimap: one flat brick a tile, in the map's staggered
 * rows (`OverviewProjection`), so the overview has the shape of the map it stands for. Plotting the storage grid as
 * squares, as the square overview does, would draw a 40 × 100 world twice as tall as it looks.
 *
 * The canvas is one world across, `W` bricks, not the half brick more the world's own size has: the last brick of each
 * odd row runs off the right edge and comes back on the left, as the map does across its seam. Down, it is the rows'
 * height, as nothing reaches past a row.
 *
 * Like the square overview, it ignores the portal's viewport, scale and pole lock, is never composited onto the map,
 * and rides in the portal's layer list only so `build()` feeds it tile updates.
 */
export class Overview extends Map {
  #projection: Projection | null = null;

  constructor(...args: ConstructorParameters<typeof Map>) {
    super(...args);

    this.setCanvasSize();

    // It ignores viewports, so it draws the world it was given now, or a loaded game's minimap stays black (#270).
    this.render();
  }

  override composited(): boolean {
    return false;
  }

  protected override projection(): Projection {
    if (this.#projection === null) {
      this.#projection = new OverviewProjection(this.tileSize(), this.world());
    }

    return this.#projection;
  }

  // Bricks stay in their own box, and the canvas is a world across, so nothing reaches past a tile.
  protected override overhang(): number {
    return 0;
  }

  protected override setCanvasSize(): void {
    const projection = this.projection();

    this.canvas().width = projection.wrapPeriod().x;
    this.canvas().height = projection.worldSize().height;
  }

  override setViewport(): void {}

  override setScale(): void {}

  override setWrapVertical(): void {}

  // The overview's own brick, whatever the portal's scale and tile size.
  override tileSize(): Size {
    return overviewCell(this.world().width());
  }

  protected override drawTile(
    tile: Tile,
    offsetX: number,
    offsetY: number
  ): void {
    const { width, height } = this.tileSize(),
      context = this.context();

    // Unexplored draws nothing, so how much of the world is still dark reads at a glance.
    if (tile.terrain._ === 'Unknown') {
      return;
    }

    context.fillStyle = terrainColour(tile);
    context.fillRect(offsetX, offsetY, width, height);

    if (tile.city === null) {
      return;
    }

    // Cities take the owner's colour, as on the square overview.
    const [colours] = tile.city.player.civilization.attributes.filter(
      (attribute: Attribute) => attribute.name === 'colors'
    ) as { value: string[] }[];

    if (!colours) {
      return;
    }

    context.fillStyle = colours.value[0]!;
    context.fillRect(offsetX, offsetY, width, height);
  }
}

export default Overview;
