import { PlayerAction, Unit } from '../types';

// The units the player can move this turn, and those deferred with `w` (wait). `ActiveUnitController#next` calls
//  `update` after every rebuild, its `apply` calls `activated` for each unit made active, and the `w` key calls
//  `wait`. Which of the selectable units becomes active (`chooseActiveUnit`) is not decided here: it depends on the
//  last active unit and on what is on screen, and a halted unit (#357) goes before it.

export class UnitQueue {
  // The player's `ActiveUnit` actions, in the order they came; none while waiting for the turn.
  #active: PlayerAction[] = [];
  // Ids of units deferred with `w` (wait), oldest first: held out of auto-selection until every other active unit has
  //  had its turn. Ids, not objects, because a full rebuild (a loaded game) makes every object afresh.
  #waited = new Set<string>();

  /**
   * Takes the player's actions after a rebuild. While `waiting` for the turn there is no unit to blink as if it could
   * move, and none for the keys to move.
   */
  update(actions: PlayerAction[], waiting: boolean): void {
    const playerActions = actions.filter(
      (action): action is PlayerAction => !!action
    );

    this.#active = waiting
      ? []
      : playerActions.filter(
          (action: PlayerAction): boolean => action._ === 'ActiveUnit'
        );

    this.#waited.forEach((id) => {
      if (!this.#active.some((action) => (action.value as Unit).id === id)) {
        this.#waited.delete(id);
      }
    });

    // Only waited units left: the longest-waiting one is up next.
    if (
      this.#active.length > 0 &&
      this.#active.every((action) =>
        this.#waited.has((action.value as Unit).id)
      )
    ) {
      const [oldestId] = this.#waited;

      this.#waited.delete(oldestId);
    }
  }

  /** Every unit that can act, waited or not, in the actions' order. */
  units(): Unit[] {
    return this.#active.map((action) => action.value as Unit);
  }

  /** The units that can act and are not waiting, in the actions' order. */
  selectable(): Unit[] {
    return this.#active
      .filter((action) => !this.#waited.has((action.value as Unit).id))
      .map((action) => action.value as Unit);
  }

  /**
   * Defers `current` and returns the unit to make active instead, or `null` when there is no other unit, and nothing
   * is deferred. The unit returned stays waited, if it was, until `activated` is called with it.
   */
  wait(current: Unit): Unit | null {
    const others = this.#active
      .map((unitAction) => unitAction.value as Unit)
      .filter((unit) => unit.id !== current.id);

    if (others.length === 0) {
      return null;
    }

    this.#waited.add(current.id);

    // When everything else is waiting too, the queue wraps round to whichever unit has waited longest.
    const [oldestId] = this.#waited;

    return (
      others.find((unit) => !this.#waited.has(unit.id)) ??
      others.find((unit) => unit.id === oldestId) ??
      others[0]
    );
  }

  /** A unit made active is no longer waiting. */
  activated(id: string): void {
    this.#waited.delete(id);
  }
}

export default UnitQueue;
