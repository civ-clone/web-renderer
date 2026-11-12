import { Projection, Size, WorldDimensions } from './projection';
import type { Map as MapLayer } from '../components/Map';
import type { Portal } from '../components/Portal';
import type World from '../components/World';
import type { Coordinate } from '@civ-clone/ui-protocol/types';
import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import { TopologyId } from '@civ-clone/ui-client/lib/topologyFor';

// Where the map's tiles go comes from the tileset (#92): the grid it is drawn for picks the projection, and its
//  geometry says how far apart the tiles are. The rest of the renderer asks the projection, so a tileset on another
//  grid needs a projection registered here and nothing else to change.
//
// Each grid's own code registers its projection (#825): the square grid's is `map-square`, the staggered isometric
//  grid's `map-isometric` (#97), and a hexagonal grid will register its own beside them (#94). The map knows none of
//  them by name, so the page chooses which grids it draws by which it loads.
//
// A grid brings its own minimap too (#867): the overview layer the whole world is drawn into, a few pixels a tile, and
//  the minimap that shows it, so the game asks for them here and names neither.

/**
 * Makes the projection for `tileset` on one grid, or throws (through `refuse`) for geometry that grid's projection
 * cannot draw.
 *
 * `tileSize` is one tile on screen, across and down: the tileset's native `tile` scaled, usually by the map's scale,
 * though a caller can ask for any size (the overview's are its own). The descriptor's geometry is in native px, so a
 * grid scales it by the same factors, each by its own axis: `columnStep`, `oddRowShift`, `anchor.x` and the left and
 * right overhang by `tileSize.width / tile.width`; `rowStep`, `anchor.y` and the top and bottom overhang by
 * `tileSize.height / tile.height`. Tiles need not be square: a staggered isometric tile is twice as wide as it is tall.
 */
export type GridProjection = (
  tileset: TilesetDescriptor,
  world: WorldDimensions,
  tileSize: Size,
  wrapVertical: boolean
) => Projection;

/** Which square of the world the minimap marks as the active unit's, or `null` for none. */
export type ActiveUnitMarker = () => Coordinate | null;

/** The minimap: what the game asks of it. */
export interface GridMinimap {
  /** Draws the overview again, with the viewport's box and the active unit's marker over it. */
  update(): void;
}

/**
 * A grid's overview of the whole world: `layer`, which the portal feeds tile updates like any other layer but never
 * composites onto the map, and `minimap`, which shows it on `element` and centres the map where it is clicked.
 */
export type GridOverview = {
  layer: typeof MapLayer;
  minimap: new (
    element: HTMLCanvasElement,
    world: World,
    portal: Portal,
    layer: MapLayer,
    activeUnitMarker?: ActiveUnitMarker
  ) => GridMinimap;
};

const grids = new Map<
  TopologyId,
  { projection: GridProjection; overview: GridOverview }
>();

/**
 * Makes `grid` drawable, with `projection` making its projections and `overview` its minimap. A grid registered again
 * is replaced.
 */
export const registerGrid = (
  grid: TopologyId,
  projection: GridProjection,
  overview: GridOverview
): void => {
  grids.set(grid, { projection, overview });
};

/** The grids there is a projection for: a tileset drawn for any other is not offered (`supportedTopologies`). */
export const drawableGrids = (): TopologyId[] => [...grids.keys()];

/** Refuses `tileset`, saying why, rather than drawing it wrong. */
export const refuse = (tileset: TilesetDescriptor, problem: string): never => {
  throw new Error(`Tileset "${tileset.id}": ${problem}`);
};

/**
 * The projection the map draws `tileset` with, over `world`, each tile `tileSize` px across and down on screen: the
 * tileset's native tile, scaled up. `wrapVertical` is whether the world's copies go on above and below it, as over the poles.
 *
 * Throws for a grid there is no projection for, and for geometry its grid's projection cannot draw, so a tileset that
 * would be drawn wrong is refused instead.
 */
export const projectionFor = (
  tileset: TilesetDescriptor,
  world: WorldDimensions,
  tileSize: Size,
  wrapVertical: boolean = true
): Projection => {
  return registered(tileset).projection(tileset, world, tileSize, wrapVertical);
};

/** The overview layer and minimap `tileset`'s grid draws the whole world with. Throws for a grid as `projectionFor` does. */
export const overviewFor = (tileset: TilesetDescriptor): GridOverview =>
  registered(tileset).overview;

const registered = (tileset: TilesetDescriptor) => {
  const grid = grids.get(tileset.grid);

  // A grid nothing has registered: one there is no code for yet (hex comes with #94), or one whose code the page, or a
  //  suite, has not loaded.
  if (grid === undefined) {
    return refuse(
      tileset,
      `no projection is loaded for the ${tileset.grid} grid (hex comes with #94).`
    );
  }

  return grid;
};

export default projectionFor;
