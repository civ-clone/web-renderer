import {
  MapArt,
  ensureMapArt,
  retryHostedTilesets,
} from '@civ-clone/ui-assets/lib/installPacks';
import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import { followSavedRuleSet, gameFailed } from './pluginSets';
import Transport from '@civ-clone/ui-client/Transport';
import { savedTopologyId } from './savedGame';
import { t } from 'i18next';

/**
 * Tells the player, when a set's sheet couldn't be loaded as a game started or loaded (#1141), which art the map is
 *  drawn with instead, and why. Nothing, when nothing was passed over.
 */
export const sayMapArtFellBack = ({ tileset, failed }: MapArt): void => {
  if (failed.length === 0) {
    return;
  }

  const body = document.createElement('p');

  body.textContent = t('MapArt.fell-back', {
    failed: failed.map(({ tileset }) => tileset.name),
    used: tileset.name,
    reason: failed[0]!.reason,
    interpolation: { escapeValue: false },
  });

  new NotificationWindow(t('MapArt.fell-back-title'), body).display();
};

/**
 * Has the art a game on the `topologyId` grid is drawn with ready before it starts or loads (#1063): a hosted set's
 *  sheet fetched, if it hasn't been (`ensureMapArt`), or, when it can't be, another set ready for the grid, which the
 *  player is told of (#1141). Resolves false, once the player has been told why, when there's none, and the game isn't
 *  started: the menus are still there.
 */
export const prepareMapArt = async (topologyId: string): Promise<boolean> => {
  let art: MapArt;

  try {
    art = await ensureMapArt(topologyId);
  } catch (error) {
    console.error(error);
    gameFailed(error);

    return false;
  }

  sayMapArtFellBack(art);

  return true;
};

/**
 * Has the art a saved game's map is drawn with ready before it loads (#1114, #1141): its rule set's art, when that
 *  names some (`followSavedRuleSet`), or the player's for its grid, fetched if it has to be, or another set ready for
 *  the grid, which the player is told of. Rejects, saying why, when there's none: the load stops. A save whose rules
 *  have none of their art here tries the grid's hosted sets whose sheets failed as the page started again before it's
 *  refused, so one drawn with such a set (Civ2's, with the isometric pixel art) loads once it can be loaded again.
 */
export const prepareSavedMapArt = async (
  transport: Transport,
  save: Parameters<typeof savedTopologyId>[0] & { pluginSet?: unknown }
): Promise<MapArt> => {
  const topologyId = savedTopologyId(save);

  await followSavedRuleSet(transport, save.pluginSet, () =>
    retryHostedTilesets(topologyId)
  );

  const art = await ensureMapArt(topologyId);

  sayMapArtFellBack(art);

  return art;
};

export default prepareMapArt;
