// Acting on what the UI sends on `action` (#449), moved out of `DataTransferClient`: Reassign Workers and End Turn,
//  then the player's action it names, found by name and value id and handed to the first handler in `actionHandlers()`
//  it is an instance of: the ones every rule set shares, then the rule set's own (#865). Says whether the turn is over.

import {
  ActiveUnit,
  InactiveUnit,
} from '@civ-clone/library-unit/PlayerActions';
import {
  ChangeProduction,
  CityBuild,
} from '@civ-clone/core-city-build/PlayerActions';
import { PlayerActionType, workerRules } from '../workerRules';
import { handleActiveUnit, handleInactiveUnit } from './actions/unit';
import {
  handleAdjustTradeRates,
  handleChooseResearch,
  handleLaunchSpaceship,
} from './actions/player';
import {
  handleChangeSpecialist,
  handleChangeWorkedTile,
  handleCityBuild,
  handleReassignWorkers,
  handleRenameCity,
} from './actions/city';
import { ActionContext, ActionHandler } from './actions/ActionContext';
import AdjustTradeRates from '@civ-clone/base-player-action-adjust-trade-rates/AdjustTradeRates';
import ChangeSpecialist from '@civ-clone/core-city/PlayerActions/ChangeSpecialist';
import ChangeWorkedTile from '@civ-clone/core-city/PlayerActions/ChangeWorkedTile';
import ChooseResearch from '@civ-clone/library-science/PlayerActions/ChooseResearch';
import EndTurn from '@civ-clone/base-player-action-end-turn/EndTurn';
import LaunchSpaceship from '@civ-clone/base-player-action-launch-spaceship/LaunchSpaceship';
import MandatoryPlayerAction from '@civ-clone/core-player/MandatoryPlayerAction';
import PlayerAction from '@civ-clone/core-player/PlayerAction';

export type { PlayerActionType };

// Each of the player's actions the UI may send that every rule set shares, and what acts on it.
export const sharedActionHandlers: [PlayerActionType, ActionHandler<any>][] = [
  [ActiveUnit, handleActiveUnit],
  [InactiveUnit, handleInactiveUnit],
  [CityBuild, handleCityBuild],
  [ChangeProduction, handleCityBuild],
  [ChooseResearch, handleChooseResearch],
  [AdjustTradeRates, handleAdjustTradeRates],
  [ChangeWorkedTile, handleChangeWorkedTile],
  [ChangeSpecialist, handleChangeSpecialist],
  [LaunchSpaceship, handleLaunchSpaceship],
];

// Those, then the rule set's own (#865), which its worker rules hand in.
export const actionHandlers = (): [PlayerActionType, ActionHandler<any>][] => [
  ...sharedActionHandlers,
  ...workerRules().actionHandlers,
];

// The player's action the UI means: the one of that name whose value has that id (none, for an action with no value).
export const findPlayerAction = (
  actions: PlayerAction[],
  { name, id }: { name?: string; id?: string }
): PlayerAction | undefined => {
  const [playerAction] = actions.filter(
    (action: PlayerAction): boolean =>
      action.constructor.name === name &&
      id === (action.value() ? action.value().id() : undefined)
  );

  return playerAction;
};

const dispatchAction = (
  ctx: ActionContext,
  ...args: any[]
): boolean | Promise<boolean> => {
  const [action] = args,
    player = ctx.player(),
    actions = player.actions(),
    mandatoryActions = actions.filter(
      (action: PlayerAction): boolean => action instanceof MandatoryPlayerAction
    );

  const { name, id } = action;

  if (name === 'ReassignWorkers') {
    return handleReassignWorkers(ctx, action);
  }

  if (name === 'RenameCity') {
    return handleRenameCity(ctx, action);
  }

  if (name === 'EndTurn') {
    // Not while the talks at the start of the turn, or a Meet with Leader's, are open (#491): the player is still
    //  answering them. The turn goes on, and the UI is told so once they are over, not before: the patch that goes
    //  with the answer makes the UI's auto end of turn send `EndTurn` again, which would come straight back while they
    //  were still open.
    if (ctx.talks.underWay) {
      return ctx.talks.pending.then(
        () => false,
        () => false
      );
    }

    return (
      mandatoryActions.length === 1 &&
      mandatoryActions.every((action) => action instanceof EndTurn)
    );
  }

  if (!name) {
    console.log(`action not specified: `, action);

    return false;
  }

  const playerAction = findPlayerAction(actions, { name, id });

  if (!playerAction) {
    console.log('action not specified');

    return false;
  }

  // TODO: other actions
  // TODO: make this better...
  const [, handler] =
    actionHandlers().find(
      ([ActionType]) => playerAction instanceof ActionType
    ) ?? [];

  if (handler) {
    return handler(ctx, action, playerAction);
  }

  console.log(`unhandled action: ${JSON.stringify(action)}`);
  return false;
};

// Not `async`: it hands back the handler's own promise, as the client's `async` method settled when its branch
//  returned. An `async` function returning that promise would settle two microtasks later, and the action listener's
//  hold on flushes with it (#503). Anything thrown on the way rejects, as it did.
export const handleAction = (
  ctx: ActionContext,
  ...args: any[]
): Promise<boolean> => {
  try {
    return Promise.resolve(dispatchAction(ctx, ...args));
  } catch (error) {
    return Promise.reject(error);
  }
};

export default handleAction;
