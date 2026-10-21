// Acting on what the UI sends on `action` (#449), moved out of `DataTransferClient`: Reassign Workers and End Turn,
//  then the player's action it names, found by name and value id and handed to the first handler in `actionHandlers`
//  it is an instance of, in the order the client's `if` chain tested them. Says whether the turn is over.

import { ActiveUnit, InactiveUnit } from '@civ-clone/civ1-unit/PlayerActions';
import {
  ChangeProduction,
  CityBuild,
} from '@civ-clone/core-city-build/PlayerActions';
import {
  ChooseGovernment,
  Revolution,
} from '@civ-clone/civ1-government/PlayerActions';
import {
  CompleteProduction,
  SellImprovement,
} from '@civ-clone/civ1-treasury/PlayerActions';
import { handleActiveUnit, handleInactiveUnit } from './actions/unit';
import {
  handleAdjustTradeRates,
  handleChooseGovernment,
  handleChooseResearch,
  handleLaunchSpaceship,
  handleRevolution,
} from './actions/player';
import {
  handleChangeSpecialist,
  handleChangeWorkedTile,
  handleCityBuild,
  handleCompleteProduction,
  handleReassignWorkers,
  handleSellImprovement,
} from './actions/city';
import { ActionContext, ActionHandler } from './actions/ActionContext';
import { AdjustTradeRates } from '@civ-clone/civ1-trade-rate/PlayerActions';
import ChangeSpecialist from '@civ-clone/core-city/PlayerActions/ChangeSpecialist';
import ChangeWorkedTile from '@civ-clone/core-city/PlayerActions/ChangeWorkedTile';
import ChooseResearch from '@civ-clone/civ1-science/PlayerActions/ChooseResearch';
import { EndTurn } from '@civ-clone/civ1-player/PlayerActions';
import { LaunchSpaceship } from '@civ-clone/civ1-spaceship/PlayerActions';
import MandatoryPlayerAction from '@civ-clone/core-player/MandatoryPlayerAction';
import PlayerAction from '@civ-clone/core-player/PlayerAction';

export type PlayerActionType = new (...args: any[]) => PlayerAction;

// Each of the player's actions the UI may send, and what acts on it.
export const actionHandlers: [PlayerActionType, ActionHandler<any>][] = [
  [ActiveUnit, handleActiveUnit],
  [InactiveUnit, handleInactiveUnit],
  [CityBuild, handleCityBuild],
  [ChangeProduction, handleCityBuild],
  [ChooseResearch, handleChooseResearch],
  [CompleteProduction, handleCompleteProduction],
  [SellImprovement, handleSellImprovement],
  [Revolution, handleRevolution],
  [ChooseGovernment, handleChooseGovernment],
  [AdjustTradeRates, handleAdjustTradeRates],
  [ChangeWorkedTile, handleChangeWorkedTile],
  [ChangeSpecialist, handleChangeSpecialist],
  [LaunchSpaceship, handleLaunchSpaceship],
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

  if (name === 'EndTurn') {
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
    actionHandlers.find(([ActionType]) => playerAction instanceof ActionType) ??
    [];

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
