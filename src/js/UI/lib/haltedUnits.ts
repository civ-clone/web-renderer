import { Unit, UnitAction } from '../types';
import { hasUnitActions } from './unitActions';

export type Halt = { target: string; unit: string };

export type HaltedUnit = {
  unit: Unit;
  // What the unit can do on the tile it stopped next to, or `null` until its actions have arrived (#323).
  actions: UnitAction[] | null;
};

// Units whose GoTo stopped next to their destination because it offers more than a move (#357): a Caravan reaching a
//  city building a Wonder, a Diplomat reaching a rival's city, an attack. Each is made the active unit in turn, and
//  offered the window the arrow keys would open there, if there is one. An attack or a capture opens none, so the
//  unit is only made active: the player decides, nothing is done for them.
export class HaltedUnits {
  #halts: Halt[] = [];
  // While a halted unit's window is open, the next one waits, so windows don't stack.
  #prompting: boolean = false;

  add(halt: Halt): void {
    this.#halts = this.#halts.filter((existing) => existing.unit !== halt.unit);

    this.#halts.push(halt);
  }

  /**
   * The first halted unit still among `units` (those that can act), dropping any that aren't. Its halt is used up
   * once its actions have arrived, so the choice is offered once.
   */
  next(units: Unit[]): HaltedUnit | null {
    if (this.#prompting) {
      return null;
    }

    while (this.#halts.length > 0) {
      const [halt] = this.#halts,
        unit = units.find((unit) => unit.id === halt.unit);

      if (!unit) {
        this.#halts.shift();

        continue;
      }

      if (!hasUnitActions(unit)) {
        return { unit, actions: null };
      }

      this.#halts.shift();

      const actions =
        Object.values(unit.actionsForNeighbours ?? {}).find(
          ([action]) => action?.to.id === halt.target
        ) ?? [];

      return { unit, actions };
    }

    return null;
  }

  // A halted unit's window has opened: the next halt waits until `closed`.
  opened(): void {
    this.#prompting = true;
  }

  // The window has closed, whether a choice was made or it was dismissed: the next halt can go.
  closed(): void {
    this.#prompting = false;
  }
}

export default HaltedUnits;
