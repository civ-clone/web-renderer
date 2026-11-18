// What a click on a square of the map does, and the window that asks for a square, on either map (docs/3d-renderer.md
//  §9.2): the 2D map's portal (`GamePortal`) and the 3D map, through `MapView3DDeps['squares']`, so a click opens the
//  same city, the same units and the same windows on both.

import { City, Tile, Unit } from '@civ-clone/ui-protocol/types';
import { MapPortal } from '@civ-clone/ui-map/MapPortal';
import { MapSquares } from '@civ-clone/ui-map/MapView3DFactory';
import { openUnitSelection } from '@civ-clone/ui-city/components/choices';
import ActionWindow from '@civ-clone/ui-component-window/ActionWindow';
import mapMenus from '@civ-clone/ui-menus/components/mapMenus';
import { t } from 'i18next';

/**
 * A click on `tile` (nothing, past a locked pole), or on `bannerCity`'s banner, which hangs past its square over its
 *  neighbours (#747): a city that opens opens; else the square's units of the player's are offered to choose from; else
 *  the map centres on it. A banner's city wins only over a square with no city and none of the player's units.
 */
export const clickSquare = (
  portal: MapPortal,
  tile: Tile | null,
  bannerCity: City | null = null
): void => {
  const playerTileUnits = (tile?.units ?? []).filter(
    (unit: Unit) => unit.player.id === portal.playerId()
  );

  // A click on a banner is for its city, unless the square under it is a city's, or has units of ours, which a click
  //  opens or selects wherever they are: the banner's city opens, or the map centres on it. A banner can hang past a
  //  locked pole.
  if (bannerCity !== null && !tile?.city && playerTileUnits.length === 0) {
    if (!portal.openCity(bannerCity)) {
      portal.setCenter(bannerCity.tile.x, bannerCity.tile.y);
    }

    return;
  }

  // Past a locked pole: nothing there to open or centre on.
  if (tile === null) {
    return;
  }

  // A city that opens, or the square's units; a city that doesn't open (another civilisation's) is a square like any
  //  other.
  const opened = tile.city ? portal.openCity(tile.city) : false;

  if (!opened && playerTileUnits.length) {
    openUnitSelection(playerTileUnits, portal.transport(), (unit: Unit) =>
      portal.emit('activate-unit', unit)
    );

    return;
  }

  portal.setCenter(tile.x, tile.y);
};

/**
 * The window that says what a square is being chosen for (a long-range order's target, M2b), whose Cancel, or Escape,
 *  gives up: `closed` is told when it closes, however it does.
 */
export const pickPrompt = (
  prompt: string,
  closed: () => void
): { close(): void } => {
  const window = new ActionWindow(t('DistantOrder.square.title'), prompt, {
    classes: ['actionWindow', 'pick-tile'],
    actions: {
      primary: {
        label: t('Generic.cancel'),
        cancel: true,
        action: (opened) => opened.close(),
      },
    },
  });

  window.on('close', closed);

  return window;
};

/** What a square does on the 3D map, as on the 2D map: the page's, handed to the 3D map's script. */
export const mapSquares: MapSquares = {
  click: (portal, tile) => clickSquare(portal, tile),
  prompt: pickPrompt,
  // The interface's menu for the active unit over a press held, or a right-click where the interface opens it (#808).
  menu: (launcher, x, y, unit, tile, transport, pressed) =>
    mapMenus.current().unitMenu(launcher, x, y, unit, tile, transport, pressed),
  menuOnRightClick: () => mapMenus.current().unitMenuOnRightClick,
  menuOpen: () => mapMenus.current().isOpen(),
};

export default mapSquares;
