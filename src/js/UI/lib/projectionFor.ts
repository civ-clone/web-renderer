import { Projection, SquareProjection, WorldDimensions } from './projection';
import { TilesetDescriptor } from '../tilesets/TilesetDescriptor';
import { TopologyId } from './topologyFor';

// Where the map's tiles go comes from the tileset (#92): the grid it is drawn for picks the projection, and its
//  geometry says how far apart the tiles are. The rest of the renderer asks the projection, so a tileset on another
//  grid needs a projection here and nothing else to change.

/**
 * The grids there is a projection for: a tileset drawn for any other is not offered (`supportedTopologies`). Isometric
 * arrives with #97, hex with #94.
 */
export const drawableGrids = (): TopologyId[] => ['square'];

/**
 * The projection the map draws `tileset` with, over `world`, each tile `tileSize` px across on screen: the tileset's
 * native tile, scaled up. `wrapVertical` is whether the world's copies go on above and below it, as over the poles.
 *
 * Throws for a grid there is no projection for yet, and for geometry its grid's projection cannot draw, so a tileset
 * that would be drawn wrong is refused instead.
 */
export const projectionFor = (
  tileset: TilesetDescriptor,
  world: WorldDimensions,
  tileSize: number,
  wrapVertical: boolean = true
): Projection => {
  const {
      id,
      grid,
      tile: { width, height },
      geometry: { columnStep, rowStep, oddRowShift, anchor, overhang },
    } = tileset,
    refuse = (problem: string): never => {
      throw new Error(`Tileset "${id}": ${problem}`);
    };

  if (grid !== 'square') {
    // Isometric with #97, hex with #94.
    return refuse(`there is no projection for the ${grid} grid yet (#94/#97).`);
  }

  // A square grid is one size of square, side by side: each tile is its own box, as far across and down as the next.
  if (
    width !== height ||
    columnStep !== width ||
    rowStep !== height ||
    oddRowShift !== 0
  ) {
    refuse(
      `a square grid's tiles are as far apart as they are wide and tall, and no row is shifted, not ${width} × ${height} tiles ${columnStep} × ${rowStep} apart with odd rows ${oddRowShift} across.`
    );
  }

  // `SquareProjection` takes no anchor or overhang, so a square tileset with either would have its sprites put in the
  //  wrong place or clipped: refused until it does (#91).
  if (
    anchor.x !== 0 ||
    anchor.y !== 0 ||
    Object.values(overhang).some((side) => side !== 0)
  ) {
    refuse(
      "a square grid's sprites sit in their own tile, with no anchor or overhang, for now."
    );
  }

  // `tileSize` is the native tile scaled, so the steps scale with it. On a square grid the step is the tile, so this is
  //  `tileSize` exactly (multiplied first, so no rounding creeps in); it is written as a step for the grids to come.
  return new SquareProjection(
    (columnStep * tileSize) / width,
    world,
    wrapVertical
  );
};

export default projectionFor;
