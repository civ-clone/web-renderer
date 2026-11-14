import Request from '@civ-clone/core-data-client/Request';

/** A set of plugins a new game can be played with (#668), as the worker offers it. */
export type PluginSetOption = {
  id: string;
  /**
   * The art pack (tileset id) its games are drawn with, which the player imports from their own copy of that game: a
   *  game with it is on that pack's grid. Null for a set drawn with whatever the player picks.
   */
  tileset: string | null;
};

export type PluginSetsAnswer = {
  /** The sets the page may offer, given the art packs it says are imported, in their order. */
  sets: PluginSetOption[];
  /** The set a new game is played with unless another is chosen. */
  default: string;
  /**
   * The set this worker has loaded, or is loading, which nothing else can be loaded beside: null until something
   *  needed one.
   */
  chosen: string | null;
};

// The sets of plugins a new game can be played with (#668), for the art packs the player has imported (their ids):
//  answered without loading any, so asking fixes nothing.
export class PluginSets extends Request<[string[]], PluginSetsAnswer> {
  constructor(tilesets: string[]) {
    super('pluginSets', tilesets);
  }
}

export default PluginSets;
