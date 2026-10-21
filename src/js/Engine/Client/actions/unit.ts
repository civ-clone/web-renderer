// A unit's actions (#449), moved out of `DataTransferClient#handleAction`: the active unit acting, and an inactive
//  (asleep or fortified) unit woken.

import { ActiveUnit, InactiveUnit } from '@civ-clone/civ1-unit/PlayerActions';
import Unit from '@civ-clone/core-unit/Unit';
import UnitAction from '@civ-clone/core-unit/Action';
import { ActionHandler } from './ActionContext';

export const handleActiveUnit: ActionHandler<ActiveUnit> = async (
  ctx,
  action,
  playerAction
) => {
  const { unitAction, target } = action,
    unit: Unit = playerAction.value(),
    [playerTile] = ctx.playerWorlds
      .getByPlayer(ctx.player())
      .filter((tile) => tile.id() === target);

  if (!playerTile) {
    console.log(`tile not found: ${target}`);

    return false;
  }

  const actions = unit.actions(playerTile.tile()),
    filteredActions = actions.filter(
      (action: UnitAction): boolean => action.sourceClass().name === unitAction
    );

  if (filteredActions.length === 0) {
    console.log(`action not found: ${unitAction}`);

    return false;
  }

  const [actionToPerform] = filteredActions,
    // Where the unit was, and the city that supported it, before it acted: a move leaves the one, and setting a new
    //  home city leaves the other (#411).
    fromTile = unit.tile(),
    homeCity = unit.city();

  // The patch this action sends keeps the unit's actions while it has moves left to use them (#323).
  ctx.actions.setUnitWithActions(unit, (previous) =>
    ctx.patches.unit(previous)
  );

  actionToPerform.perform();

  await ctx.talks.pending;

  await ctx.talks.talkToPlayersMet();

  // What the action changed (#411): the unit, the cities that support it before and after, and what of ours is on
  //  the square it acted from, the square it acted on, and the square it is on now. A Caravan that helped build a
  //  wonder, or a Settlers that joined a city, is gone into the city on the square it acted on. Anything else is
  //  sent by the events the action raises.
  ctx.patches.unit(unit);
  ctx.patches.city(homeCity);
  ctx.patches.city(unit.city());
  ctx.patches.onTiles(fromTile, playerTile.tile(), unit.tile());

  return false;
};

export const handleInactiveUnit: ActionHandler<InactiveUnit> = async (
  ctx,
  action,
  playerAction
) => {
  const unit: Unit = playerAction.value();

  unit.activate();

  // Built when the patch is sent, so as it is now it is active (#411).
  ctx.patches.unit(unit);

  return false;
};
