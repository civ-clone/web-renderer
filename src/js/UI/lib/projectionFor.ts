import { Projection, WorldDimensions } from './projection';
import { TilesetDescriptor } from '../tilesets/TilesetDescriptor';
import { TopologyId } from './topologyFor';

// Where the map's tiles go comes from the tileset (#92): the grid it is drawn for picks the projection, and its
//  geometry says how far apart the tiles are. The rest of the renderer asks the projection, so a tileset on another
//  grid needs a projection registered here and nothing else to change.
//
// Each grid's own code registers its projection (#825): the square grid's is `map-square`, and hexagonal and isometric
//  grids register theirs beside it (#94, #97). The map knows none of them by name, so the page chooses which grids it
//  draws by which it loads.

/**
 * Makes the projection for `tileset` on one grid, or throws (through `refuse`) for geometry that grid's projection
 * cannot draw.
 */
export type GridProjection = (
  tileset: TilesetDescriptor,
  world: WorldDimensions,
  tileSize: number,
  wrapVertical: boolean
) => Projection;

const grids = new Map<TopologyId, GridProjection>();

/** Makes `grid` drawable, with `projection` making its projections. A grid registered again is replaced. */
export const registerGrid = (
  grid: TopologyId,
  projection: GridProjection
): void => {
  grids.set(grid, projection);
};

/** The grids there is a projection for: a tileset drawn for any other is not offered (`supportedTopologies`). */
export const drawableGrids = (): TopologyId[] => [...grids.keys()];

/** Refuses `tileset`, saying why, rather than drawing it wrong. */
export const refuse = (tileset: TilesetDescriptor, problem: string): never => {
  throw new Error(`Tileset "${tileset.id}": ${problem}`);
};

/**
 * The projection the map draws `tileset` with, over `world`, each tile `tileSize` px across on screen: the tileset's
 * native tile, scaled up. `wrapVertical` is whether the world's copies go on above and below it, as over the poles.
 *
 * Throws for a grid there is no projection for, and for geometry its grid's projection cannot draw, so a tileset that
 * would be drawn wrong is refused instead.
 */
export const projectionFor = (
  tileset: TilesetDescriptor,
  world: WorldDimensions,
  tileSize: number,
  wrapVertical: boolean = true
): Projection => {
  const projection = grids.get(tileset.grid);

  if (projection === undefined) {
    // Isometric with #97, hex with #94.
    return refuse(
      tileset,
      `there is no projection for the ${tileset.grid} grid yet (#94/#97).`
    );
  }

  return projection(tileset, world, tileSize, wrapVertical);
};

export default projectionFor;
