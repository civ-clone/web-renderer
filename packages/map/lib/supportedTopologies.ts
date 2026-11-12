import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import { TopologyId } from '@civ-clone/ui-client/lib/topologyFor';
import { drawableGrids } from './projectionFor';
import {
  bundledTilesets,
  installedTilesets,
} from '@civ-clone/ui-assets/lib/tilesets';
import { topologyIds } from '@civ-clone/core-world/topologies';

/**
 * The grids a game can be played on here: the ones a new game offers (#89), and the only ones a save can be loaded on.
 * They are the grids the installed `tilesets` are drawn for (#92) that there is a projection for (`drawable`): Civ1's
 * square, and Civ2's isometric once its sprites have been imported (#97). In the engine's order, which puts square first, as the grid New Game picks before the player
 * chooses another.
 */
export const supportedTopologies = (
  tilesets: TilesetDescriptor[] = installedTilesets(),
  drawable: TopologyId[] = drawableGrids()
): TopologyId[] =>
  topologyIds.filter(
    (grid) =>
      drawable.includes(grid) &&
      tilesets.some((tileset) => tileset.grid === grid)
  );

/** Whether a world on `topologyId`'s grid can be drawn: a world that does not say is square. */
export const isSupportedTopology = (topologyId: string = 'square'): boolean =>
  (supportedTopologies() as string[]).includes(topologyId);

/**
 * The bundled tileset a world on `topologyId`'s grid would be drawn with once its sprites were imported (#97): one
 *  there is a projection for (`drawable`) that isn't installed, such as Civ2's for the isometric grid. Null when the
 *  grid is supported already, or no pack bundled here could draw it.
 */
export const tilesetToImport = (
  topologyId: string = 'square',
  tilesets: TilesetDescriptor[] = installedTilesets(),
  drawable: TopologyId[] = drawableGrids(),
  bundled: TilesetDescriptor[] = bundledTilesets()
): TilesetDescriptor | null =>
  (drawable as string[]).includes(topologyId) &&
  !tilesets.some(({ grid }) => grid === topologyId)
    ? bundled.find(({ grid }) => grid === topologyId) ?? null
    : null;

export default supportedTopologies;
