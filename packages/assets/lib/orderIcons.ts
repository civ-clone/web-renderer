import { Tile, Unit, UnitAction } from '@civ-clone/ui-protocol/types';
import {
  IconLayer,
  drawUnitActionIcon,
  unitActionIconLayers,
} from './unitActionIcon';
import { defineSlot } from '@civ-clone/ui-platform/lib/interfaceMode';

// Where the order buttons' pictures come from (#1053), swappable as a slot an interface's manifest fills: the Active
//  Unit panel's orders, the unit's action menu, and the lost-city notice draw whichever is named. `gameArt` draws them
//  from the game's own art, the unit's own sprite with its order's mark over it (`orderIconArt`): Civ1's in a Civ1 game,
//  Civ2's in a Civ2 game. Another package can provide icons of its own, neutral ones from neither game say, for a
//  manifest to name.

/** What an order's picture is drawn from, and how it's drawn on a button's canvas. */
export interface OrderIcons {
  /**
   * The picture's layers for `action` of `unit` on `tile`, the unit's tile as the world holds it, with `status`, the
   *  short mark the map puts on a busy unit, for an order with no picture of its own.
   */
  layers(
    action: UnitAction,
    unit: Unit,
    tile: Tile | null,
    status: string
  ): IconLayer[];
  /** Paints `layers` on `canvas`, at the size the page shows it. */
  draw(canvas: HTMLCanvasElement, layers: IconLayer[]): void;
}

export const orderIcons = defineSlot<OrderIcons>('orderIcons');

orderIcons.provide('gameArt', {
  layers: (action, unit, tile, status) =>
    unitActionIconLayers(action, unit, tile, status),
  draw: drawUnitActionIcon,
});

/** The order icons the interface in use names. */
export const currentOrderIcons = (): OrderIcons => orderIcons.current();

export default orderIcons;
