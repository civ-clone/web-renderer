import { Tile, Unit, UnitAction } from '@civ-clone-ui/client/types';
import { hasUnitActions, unitActions } from '@civ-clone-ui/client/lib/unitActions';
import distantActions from '@civ-clone-ui/client/lib/distantActions';
import { nameOf, performWithPrompts } from './unitActionPrompts';
import Transport from '@civ-clone-ui/client/Transport';
import { t } from 'i18next';

/** An order the long press menu offers, named as the player reads it, and what giving it does. */
export interface UnitMenuAction {
  action: UnitAction;
  label: string;
  run: () => void;
}

/**
 * The orders the long press menu offers `unit` for `tile` (#808): its own when it's the unit's square, what it can do
 *  that way when it's a neighbour (and which way that is), and otherwise Go to and the route orders. Nothing, not even
 *  Go to, until the unit's actions have arrived (#323): the menu doesn't open, and the next long press finds them.
 */
export const unitMenuActions = (
  tile: Tile,
  unit: Unit,
  transport: Transport
): { actions: UnitMenuAction[]; direction: string | null } => {
  if (!hasUnitActions(unit)) {
    return { actions: [], direction: null };
  }

  let actions: UnitAction[] = tile === unit.tile ? unitActions(unit) : [],
    direction: string | null = null;

  const [neighbour] = Object.entries(unit.actionsForNeighbours ?? {}).filter(
    ([, actions]) => actions[0]?.to === tile
  );

  if (neighbour) {
    [direction, actions] = neighbour;
  }

  if (tile !== unit.tile && !neighbour?.[1].length) {
    actions = distantActions(unit, tile);
  }

  // Calling off a move onto a treaty partner's land is the Cancel of the window its move opens (#287), and an action a
  //  Senate overrules is listed as what was asked for (#133).
  return {
    direction,
    actions: actions
      .filter((action) => action._ !== 'AbortMove')
      .map((action) => ({
        action,
        label: t(`Action.${nameOf(action)}.name`, {
          defaultValue: nameOf(action),
          ns: 'unit',
        }),
        // Through the same windows as the arrow keys: a confirmation that would break a treaty, a Diplomat's incite
        //  and bribe windows (#58).
        run: () =>
          performWithPrompts(unit, action, actions, (chosen) =>
            transport.send('action', {
              name: 'ActiveUnit',
              id: unit.id,
              unitAction: chosen._,
              target: chosen.to.id,
            })
          ),
      })),
  };
};

export default unitMenuActions;
