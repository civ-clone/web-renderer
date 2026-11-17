import { OVERVIEW_WIDTH } from '@civ-clone/ui-map/lib/overview';
import { Size } from '@civ-clone/ui-map/lib/projection';
import StaggeredOverview from '@civ-clone/ui-map/components/StaggeredOverview';

/**
 * The size of one brick of the hexagonal overview over a world `width` tiles across: the widest that fits the
 *  minimap's slot, a multiple of 4 px, and three quarters as tall as it is wide, near enough a hex row's step (a regular
 *  hex's is 0.87 of its width), so the overview has the map's shape. Both, and the odd rows' half-brick shift, are
 *  whole pixels.
 */
export const overviewCell = (width: number): Size => {
  const across = 4 * Math.max(1, Math.trunc(OVERVIEW_WIDTH / (4 * width)));

  return { width: across, height: (across * 3) / 4 };
};

/**
 * The whole hexagonal world at a few pixels a tile, for the minimap. Hexes, like diamonds, sit in staggered rows, so
 *  this is the staggered overview, one flat brick a tile in rows with every odd one shifted half a brick across, with
 *  bricks the shape of a hex's row.
 */
export class Overview extends StaggeredOverview {
  override tileSize(): Size {
    return overviewCell(this.world().width());
  }
}

export default Overview;
