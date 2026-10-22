import { TilesetDescriptor } from '../tilesets/TilesetDescriptor';
import { TopologyId } from './topologyFor';
import { drawableGrids } from './projectionFor';
import { installedTilesets } from './tilesets';
import { topologyIds } from '@civ-clone/core-world/topologies';

/**
 * The grids a game can be played on here: the ones a new game offers (#89), and the only ones a save can be loaded on.
 * They are the grids the installed `tilesets` are drawn for (#92) that there is a projection for (`drawable`), so only
 * Civ1's square for now. In the engine's order, which puts square first, as the grid New Game picks before the player
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

export default supportedTopologies;
