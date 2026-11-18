import { MapArt, ensureMapArt } from '@civ-clone/ui-assets/lib/installPacks';
import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import { gameFailed } from './pluginSets';
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

export default prepareMapArt;
