import { Unit, UnitAction } from '../types';

// A unit's actions arrive only for the unit the UI has made active (#323): the worker leaves them out of every other
//  unit, as working them out for all of a late game's units made each move's patch megabytes. These read them for the
//  keys and the action menu, and come back empty until the answer is in.
export const unitActions = (unit: Unit): UnitAction[] => unit.actions ?? [];

export const neighbourActions = (unit: Unit, direction: string): UnitAction[] =>
  unit.actionsForNeighbours?.[direction] ?? [];

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
