import Request from '@civ-clone/core-data-client/Request';

/** A set of plugins a new game can be played with (#668), as the worker offers it. */
export type PluginSetOption = {
  id: string;
  /**
   * The art pack (tileset id) its games are drawn with on this page, the first of its own the page has: Civ2's, which
   *  the player imports from their own copy, or else civ.one's isometric pixel art. A game with it is on that pack's
   *  grid. Null for a set drawn with whatever the player picks.
   */
  tileset: string | null;
  /**
   * Every art pack of its own the page has, in the order it prefers them (#1249): the first of them on a grid is the
   *  one its games on that grid are drawn with, and it is played only on grids one of them is for. Empty for a set
   *  drawn with whatever the player picks; left out by an older worker, which has `tileset` alone.
   */
  tilesets?: string[];
  /**
   * The set offered beside it that plays the same game as the original plays it, when this one is that game with its
   *  fixes (#1248): the setup offers the two as one game, with Original and Enhanced rules. Null, or left out by an
   *  older worker, for a set that is a game of its own.
   */
  original?: string | null;
};

export type PluginSetsAnswer = {
  /** The sets the page may offer, given the art packs it says it has, in their order. */
  sets: PluginSetOption[];
  /** The set a new game is played with unless another is chosen. */
  default: string;
  /**
   * The set this worker has loaded, or is loading, which nothing else can be loaded beside: null until something
   *  needed one.
   */
  chosen: string | null;
};

// The sets of plugins a new game can be played with (#668), for the art packs the page has (their ids): answered
//  without loading any, so asking fixes nothing.
export class PluginSets extends Request<[string[]], PluginSetsAnswer> {
  constructor(tilesets: string[]) {
    super('pluginSets', tilesets);
  }
}

export default PluginSets;
