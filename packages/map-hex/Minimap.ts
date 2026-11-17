import StaggeredMinimap from '@civ-clone/ui-map/components/StaggeredMinimap';

/**
 * The hexagonal grid's minimap: the staggered one, over the hexagonal overview's bricks.
 *
 * A hex's box is four quarters tall and a row three, so its middle, which the brick is, is two thirds of a row below the
 *  top of its box. A brick's own middle is half a row below its top, so the brick is a sixth of a row lower than the
 *  box's top lands on the overview.
 */
export class Minimap extends StaggeredMinimap {
  protected override brickOffset(rowHeight: number): number {
    return rowHeight / 6;
  }
}

export default Minimap;
