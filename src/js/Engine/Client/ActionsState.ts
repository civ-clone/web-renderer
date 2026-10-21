// What the client knows of the player's actions on the frontend (#449), moved out of `DataTransferClient`: the action
//  lists it was last sent (#411), and the one unit it has the actions of (#323). Both the visibility filter and the
//  patches that send the actions read and write it, which is why it is on its own.

import PlayerAction from '@civ-clone/core-player/PlayerAction';
import Unit from '@civ-clone/core-unit/Unit';
import { actionKey } from './refs';

// The action lists the frontend was last sent, as `ActionsState` holds them.
export interface HeldActions {
  held: Map<string, PlayerAction> | null;
  heldKeys: string[] | undefined;
  heldMandatory: string[] | undefined;
}

export interface ActionsDiff {
  // Each list when it is not as the frontend was last sent it, to be sent again, or `undefined` when it is.
  actions?: PlayerAction[];
  mandatory?: PlayerAction[];
  // What the frontend holds once these are sent.
  nextHeld: HeldActions;
}

const unchanged = (list: PlayerAction[], heldList: string[] | undefined) =>
  heldList !== undefined &&
  list.length === heldList.length &&
  list.every((action, index) => actionKey(action) === heldList[index]);

// Which of the player's action lists have changed since they were last sent (#411), by what each action is rather
//  than by the object, as `actions()` makes every one afresh. Nothing goes when a list is as it was, as after most moves.
export const diffActions = (
  actions: PlayerAction[],
  mandatory: PlayerAction[],
  held: Pick<HeldActions, 'heldKeys' | 'heldMandatory'>
): ActionsDiff => ({
  actions: unchanged(actions, held.heldKeys) ? undefined : actions,
  mandatory: unchanged(mandatory, held.heldMandatory) ? undefined : mandatory,
  nextHeld: {
    held: new Map(
      actions.map((action): [string, PlayerAction] => [
        actionKey(action),
        action,
      ])
    ),
    heldKeys: actions.map(actionKey),
    heldMandatory: mandatory.map(actionKey),
  },
});

export class ActionsState implements HeldActions {
  // The player's actions as the frontend was last sent them by `PlayerPatches#actions`, by what each is (#411), and
  //  what each list was. `null` once they have gone some other way, in the whole player, as fresh objects the
  //  frontend holds in place of these.
  held: Map<string, PlayerAction> | null = null;
  heldKeys: string[] | undefined = undefined;
  heldMandatory: string[] | undefined = undefined;
  // Set while `PlayerPatches#actions` serialises them, or `serialisePlayer` serialises the player for a test to compare
  //  with, which leave the actions held alone.
  serialising = false;
  // The unit sent with its actions (#323): the one that last acted, or the one the UI last asked about. It is the UI's
  //  active unit, so its actions go out while it can use them, and the next unit's are asked for when it moves on.
  unitWithActions: Unit | null = null;
  // While a `unitActions` request is answered: the unit asked about goes out with its actions whatever its state, so
  //  the UI is never left asking again.
  answering: Unit | null = null;

  // The lists as `diffActions` says the frontend holds them once they are sent.
  hold({ held, heldKeys, heldMandatory }: HeldActions): void {
    this.held = held;
    this.heldKeys = heldKeys;
    this.heldMandatory = heldMandatory;
  }

  forget(): void {
    this.held = null;
    this.heldKeys = undefined;
    this.heldMandatory = undefined;
  }

  // Only for a unit that can act: one with nothing left to do this turn is listed as an `InactiveUnit`, which the UI
  //  doesn't read actions from.
  sendsUnitActions(unit: Unit): boolean {
    return (
      unit === this.answering ||
      (unit === this.unitWithActions &&
        unit.active() &&
        unit.moves().value() > 0)
    );
  }

  // The UI has actions for one unit (#323). When that changes, the unit that had them goes again without them, so the
  //  UI asks again when it comes back to it rather than using actions from before whatever has happened since: that
  //  is `onPrevious`, given the unit that had them.
  setUnitWithActions(
    unit: Unit | null,
    onPrevious: (previous: Unit) => void
  ): void {
    const previous = this.unitWithActions;

    this.unitWithActions = unit;

    if (previous !== null && previous !== unit) {
      onPrevious(previous);
    }
  }
}

export default ActionsState;
