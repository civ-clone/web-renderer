import { TopologyId } from './topologyFor';

/**
 * The grids a game can be played on here: the ones a new game offers (#89), and the only ones a save can be loaded on.
 * Square first, as the one every tileset draws.
 *
 * Only square for now. #92 will read the installed tilesets instead, offering the grids they say they draw (that the
 * renderer has a `Projection` for), which is why this is a function rather than a list.
 */
export const supportedTopologies = (): TopologyId[] => ['square'];

/** Whether a world on `topologyId`'s grid can be drawn: a world that does not say is square. */
export const isSupportedTopology = (topologyId: string = 'square'): boolean =>
  (supportedTopologies() as string[]).includes(topologyId);

export default supportedTopologies;
