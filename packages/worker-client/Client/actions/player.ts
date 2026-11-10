// The player's own actions (#449), moved out of `DataTransferClient#handleAction`: research, the trade rates and
//  launching the spaceship. Government is a rule set's own (#865).

import Advance from '@civ-clone/core-science/Advance';
import AdjustTradeRates from '@civ-clone/base-player-action-adjust-trade-rates/AdjustTradeRates';
import ChooseResearch from '@civ-clone/library-science/PlayerActions/ChooseResearch';
import LaunchSpaceship from '@civ-clone/base-player-action-launch-spaceship/LaunchSpaceship';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import PlayerTradeRates from '@civ-clone/core-trade-rate/PlayerTradeRates';
import TradeRate from '@civ-clone/core-trade-rate/TradeRate';
import { ActionHandler } from './ActionContext';

export const handleChooseResearch: ActionHandler<ChooseResearch> = async (
  ctx,
  action,
  playerAction
) => {
  const playerResearch = playerAction.value() as PlayerResearch,
    { chosen } = action;

  if (!chosen) {
    console.warn(`no advance specified`);

    return false;
  }

  const [ChosenAdvance] = playerResearch
    .available()
    .filter((AdvanceType: typeof Advance) => AdvanceType.name === chosen);

  if (!ChosenAdvance) {
    console.log(`build item not available: ${chosen}`);

    return false;
  }

  playerResearch.research(ChosenAdvance);

  ctx.patches.playerObject(playerResearch);

  return false;
};

export const handleAdjustTradeRates: ActionHandler<AdjustTradeRates> = async (
  ctx,
  action,
  playerAction
) => {
  const playerTradeRates = playerAction.value() as PlayerTradeRates,
    { value } = action;

  playerTradeRates.setAll(
    value.map(([name, value]: [string, string]) => {
      const [rate] = playerTradeRates
        .all()
        .filter((rate) => rate.constructor.name === name);

      return [rate.constructor as typeof TradeRate, value];
    })
  );

  // Every city's trade is split by the rates (#411).
  ctx.patches.playerObject(playerTradeRates);

  ctx.cities
    .getByPlayer(ctx.player())
    .forEach((city) => ctx.patches.city(city));

  return false;
};

export const handleLaunchSpaceship: ActionHandler<LaunchSpaceship> = async (
  ctx,
  action,
  playerAction
) => {
  playerAction.value().launch();

  ctx.patches.player();

  return false;
};
