import { OVERVIEW_WIDTH } from '@civ-clone/ui-map/lib/overview';
import { Size } from '@civ-clone/ui-map/lib/projection';
import StaggeredOverview from '@civ-clone/ui-map/components/StaggeredOverview';

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

/** The whole isometric world at a few pixels a tile, for the minimap: a brick the shape of a diamond's row a tile. */
export class Overview extends StaggeredOverview {
  override tileSize(): Size {
    return overviewCell(this.world().width());
  }
}

export default Overview;
