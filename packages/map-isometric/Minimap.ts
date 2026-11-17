import StaggeredMinimap from '@civ-clone/ui-map/components/StaggeredMinimap';

/** The isometric grid's minimap: its `Overview`, the map's viewport as a box over it, and the active unit flashing. */
export class Minimap extends StaggeredMinimap {
  // A diamond's box is two rows tall and its brick is the middle one, so the brick is half a row below the box's top.
  protected override brickOffset(rowHeight: number): number {
    return rowHeight / 2;
  }
}

export default Minimap;
