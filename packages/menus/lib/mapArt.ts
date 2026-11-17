import { ensureMapArt } from '@civ-clone/ui-assets/lib/installPacks';
import { gameFailed } from './pluginSets';

/**
 * Has the art a game on the `topologyId` grid is drawn with ready before it starts or loads (#1063): a hosted set's
 *  sheet fetched, if it hasn't been (`ensureMapArt`). Resolves false, once the player has been told why, when it can't
 *  be, and the game isn't started: the menus are still there.
 */
export const prepareMapArt = async (topologyId: string): Promise<boolean> => {
  try {
    await ensureMapArt(topologyId);

    return true;
  } catch (error) {
    console.error(error);
    gameFailed(error);

    return false;
  }
};

export default prepareMapArt;
