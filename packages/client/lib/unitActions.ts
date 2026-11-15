import { Tile, Unit, UnitAction } from '@civ-clone/ui-protocol/types';

// A unit's actions arrive only for the unit the UI has made active (#323): the worker leaves them out of every other
//  unit, as working them out for all of a late game's units made each move's patch megabytes. These read them for the
//  keys and the action menu, and come back empty until the answer is in.
export const unitActions = (unit: Unit): UnitAction[] => unit.actions ?? [];

/**
 * The long-range orders the rules give the unit now (`actionTargets`: Civ2's Paradrop and Airlift, M2b), by name. The
 *  engine offers them for the squares next to the unit as well as for distant ones, so they are left out of its
 *  neighbours' actions (an arrow key moves, it doesn't paradrop one square) and offered for the squares they reach.
 */
export const distantOrders = (unit: Unit): string[] =>
  Object.keys(unit.actionTargets ?? {});

/** `actions` towards a neighbouring square, less the long-range orders (`distantOrders`). */
export const withoutDistantOrders = (
  unit: Unit,
  actions: UnitAction[]
): UnitAction[] => {
  const distant = distantOrders(unit);

  return distant.length === 0
    ? actions
    : actions.filter((action) => !distant.includes(action._));
};

export const neighbourActions = (unit: Unit, direction: string): UnitAction[] =>
  withoutDistantOrders(unit, unit.actionsForNeighbours?.[direction] ?? []);

/** The long-range orders that reach `tile`, as actions aimed at it, as the engine would offer them. */
export const targetedActions = (unit: Unit, tile: Tile): UnitAction[] =>
  Object.entries(unit.actionTargets ?? {})
    .filter(([, tiles]) => tiles.some((target) => target.id === tile.id))
    .map(
      ([name]): UnitAction => ({
        _: name,
        __: [],
        id: '',
        from: unit.tile,
        to: tile,
      })
    );

export const hasUnitActions = (unit: Unit): boolean =>
  unit.actionsForNeighbours !== undefined;

// Asks for a unit's actions once it is active and doesn't have them. The answer is an ordinary patch, so the unit asked
//  about is remembered until the next one: a request still in flight isn't sent again, and one that went unanswered is
//  sent again when the data next changes.
export class UnitActionsRequest {
  #requested: string | null = null;
  #send: (unitId: string) => void;

  constructor(send: (unitId: string) => void) {
    this.#send = send;
  }

  activate(unit: Unit | null): void {
    if (unit === null || hasUnitActions(unit) || this.#requested === unit.id) {
      return;
    }

    this.#requested = unit.id;

    this.#send(unit.id);
  }

  dataReceived(): void {
    this.#requested = null;
  }
}

export default UnitActionsRequest;
