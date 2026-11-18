import { hasInstalledInterfaceArt } from '@civ-clone/ui-assets/lib/interfaceArt';
import supportedTopologies, {
  drawnTopologies,
} from '@civ-clone/ui-map/lib/supportedTopologies';
import { t } from 'i18next';

// Whether a game can be started or loaded here (#1063): not whether Civilization's art has been imported, as it is
//  only an upgrade now, but whether there's art to draw the game with. civ.one's own pixel art is there for the
//  interface and the square map unless its sheet couldn't be fetched, on a first visit offline with nothing imported.
//
// The interface's art, when it's a set that ships, has had its sheet fetched as the page started (`installPacks`), so
//  installed means there to draw with. A map set that ships is installed as it's declared, and fetched as a game on
//  its grid starts or loads (`ensureMapArt`): one that fails then is passed over for another set ready for the grid,
//  saying why, or stops that game when there's none (#1141), and the library says it couldn't be loaded
//  (`loadFailed`).

/** What there's no art for: the interface (`interfaceArt`), or a map on any grid (`supportedTopologies`). */
export type MissingArt = 'interface' | 'map';

/**
 * What there's no art for, so that no game can be started, or loaded when `loading`, or null when one can. A new game
 *  needs a grid it's offered on (`supportedTopologies`); a save, one its art is there for (`drawnTopologies`).
 */
export const missingArt = (loading: boolean = false): MissingArt | null =>
  !hasInstalledInterfaceArt()
    ? 'interface'
    : (loading ? drawnTopologies() : supportedTopologies()).length === 0
    ? 'map'
    : null;

/** Whether a game can be started: New Game and Earth are offered only then. */
export const canPlay = (): boolean => missingArt() === null;

/** Whether a game can be loaded: Load Game and Continue are offered only then. */
export const canLoad = (): boolean => missingArt(true) === null;

/** Why no game can be started, for the menus to say in place of their items, or null when one can. */
export const cantPlayReason = (): string | null => {
  const missing = missingArt();

  return missing === null ? null : t(`Menus.no-art.${missing}`);
};

export default canPlay;
