import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import { TopologyId } from '@civ-clone/ui-client/lib/topologyFor';
import { drawableGrids } from './projectionFor';
import {
  bundledTilesets,
  hiddenGrids,
  installedTilesets,
  isHosted,
} from '@civ-clone/ui-assets/lib/tilesets';
import { topologyIds } from '@civ-clone/core-world/topologies';

/**
 * The grids a game can be drawn on here, so the only ones a save can be loaded on: the grids the installed `tilesets`
 *  are drawn for (#92) that there is a projection for (`drawable`). Civ1's square, Civ2's isometric once its sprites
 *  have been imported (#97), and hex, whose pixel art ships with civ.one (#1063). In the engine's order, which puts
 *  square first.
 */
export const drawnTopologies = (
  tilesets: TilesetDescriptor[] = installedTilesets(),
  drawable: TopologyId[] = drawableGrids()
): TopologyId[] =>
  topologyIds.filter(
    (grid) =>
      drawable.includes(grid) &&
      tilesets.some((tileset) => tileset.grid === grid)
  );

// The grids a new game leaves out until they're finished, hex without `?hex=1`: kept beside the tilesets, as the
//  interface's art leaves their sets out too (`interfaceArt`).
export {
  hiddenGrids,
  offerUnfinishedGrids,
} from '@civ-clone/ui-assets/lib/tilesets';

/**
 * The grids a new game offers (#89): those it can be drawn on (`drawnTopologies`) but the ones it leaves out
 *  (`hidden`, hex until it's finished). In the engine's order, which puts square first, as the grid New Game picks
 *  before the player chooses another.
 */
export const supportedTopologies = (
  tilesets: TilesetDescriptor[] = installedTilesets(),
  drawable: TopologyId[] = drawableGrids(),
  hidden: string[] = hiddenGrids()
): TopologyId[] =>
  drawnTopologies(tilesets, drawable).filter((grid) => !hidden.includes(grid));

/**
 * Whether a world on `topologyId`'s grid can be drawn, and so loaded: a world that does not say is square. A grid new
 *  games don't offer yet still loads (`drawnTopologies`).
 */
export const isSupportedTopology = (topologyId: string = 'square'): boolean =>
  (drawnTopologies() as string[]).includes(topologyId);

/**
 * The bundled tileset a world on `topologyId`'s grid would be drawn with once its sprites were imported (#97): one
 *  there is a projection for (`drawable`) that isn't installed, such as Civ2's for the isometric grid. Null when the
 *  grid is supported already, as the square grid is by civ.one's own art (#1063) whether or not Civ1's is imported,
 *  or no pack bundled here could draw it. Only a set that's imported is named: one that ships with civ.one has
 *  nothing to import.
 */
export const tilesetToImport = (
  topologyId: string = 'square',
  tilesets: TilesetDescriptor[] = installedTilesets(),
  drawable: TopologyId[] = drawableGrids(),
  bundled: TilesetDescriptor[] = bundledTilesets()
): TilesetDescriptor | null =>
  (drawable as string[]).includes(topologyId) &&
  !tilesets.some(({ grid }) => grid === topologyId)
    ? bundled.find(
        (tileset) => tileset.grid === topologyId && !isHosted(tileset)
      ) ?? null
    : null;

export default supportedTopologies;
