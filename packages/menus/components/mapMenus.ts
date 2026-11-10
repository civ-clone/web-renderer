import { Tile, Unit } from '@civ-clone/ui-protocol/types';
import Transport from '@civ-clone/ui-client/Transport';
import { defineSlot } from '@civ-clone/ui-client/lib/interfaceMode';

// The interface's `mapMenus` slot (#860): the menus over the game, the Game menu its button opens and the unit's menu a
//  long press on the map opens. The classic interface has popups; the modern one its own menu for both (#808), which a
//  right-click on the map opens too.

/** A row of the Game menu: what it says, what choosing it does, and for a menu that shows them, its key and warning. */
export interface GameMenuItem {
  label: string;
  action: () => void;
  /** The key that does the same, as the player presses it (`F1`, `Shift+S`), or nothing. */
  key?: string | null;
  /** One that ends the game. */
  danger?: boolean;
}

/** What the Game menu offers, worked out as it opens, as the cheats can be turned on mid-game. */
export type GameMenuRows = {
  game: GameMenuItem[];
  reports: GameMenuItem[];
  reference: GameMenuItem[];
  cheats: GameMenuItem[];
  // The rows that end the game.
  end: GameMenuItem[];
};

export interface MapMenus {
  /** Makes `button` open the Game menu of `rows`, which belongs to `owner`. */
  gameMenuButton(
    button: HTMLButtonElement,
    owner: object,
    rows: () => GameMenuRows
  ): void;
  /**
   * Opens the menu of what `unit` can do to `tile` at `x`, `y` in the viewport, for `launcher` (the map). `pressed` when
   *  the press that opened it is still held.
   */
  unitMenu(
    launcher: object,
    x: number,
    y: number,
    unit: Unit,
    tile: Tile,
    transport: Transport,
    pressed: boolean
  ): void;
  /** Whether a right-click on the map opens the unit's menu at once, in place of the browser's own. */
  unitMenuOnRightClick: boolean;
  /** Whether one of its menus is open over the map, which then shows no tooltip. */
  isOpen(): boolean;
}

export const mapMenus = defineSlot<MapMenus>('mapMenus');

export default mapMenus;
