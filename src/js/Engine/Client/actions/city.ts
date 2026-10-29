// A city's actions (#449), moved out of `DataTransferClient#handleAction`: what it builds, buying it, selling an
//  improvement, and who works where.

import {
  ChangeProduction,
  CityBuild,
} from '@civ-clone/core-city-build/PlayerActions';
import {
  CompleteProduction,
  SellImprovement,
} from '@civ-clone/civ1-treasury/PlayerActions';
import {
  changeSpecialist,
  changeWorkedTile,
  reassignWorkers,
} from '@civ-clone/civ1-city/lib/assignWorkers';
import BuildItem from '@civ-clone/core-city-build/BuildItem';
import ChangeSpecialist from '@civ-clone/core-city/PlayerActions/ChangeSpecialist';
import ChangeWorkedTile from '@civ-clone/core-city/PlayerActions/ChangeWorkedTile';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import autoBuild from '@civ-clone/civ1-city/lib/autoBuild';
import { ActionContext, ActionHandler } from './ActionContext';

// Not one of the player's actions, so looked for by name alone, before them.
// TODO: a proper action for this probably...
export const handleReassignWorkers = async (
  ctx: ActionContext,
  action: any
): Promise<boolean> => {
  const [city] = ctx.cities.getBy('id', action.city);

  if (!city) {
    return false;
  }

  reassignWorkers(city);

  ctx.patches.city(city);

  return false;
};

// The longest name a city can be given, as Civ1's "City name" box allows (#676).
export const cityNameMaxLength = 12;

// Renaming one of the player's cities (#676). Not one of the player's actions either, so looked for by name. A rival's
//  city, an empty name or one too long changes nothing.
export const handleRenameCity = async (
  ctx: ActionContext,
  action: any
): Promise<boolean> => {
  const [city] = ctx.cities.getBy('id', action.id),
    name = typeof action.cityName === 'string' ? action.cityName.trim() : '';

  if (
    !city ||
    city.player() !== ctx.player() ||
    name === '' ||
    name.length > cityNameMaxLength
  ) {
    return false;
  }

  city.setName(name);

  // Every city of the player's, for the trade routes that name it.
  ctx.cities
    .getByPlayer(ctx.player())
    .forEach((city) => ctx.patches.city(city));

  return false;
};

export const handleCityBuild: ActionHandler<
  CityBuild | ChangeProduction
> = async (ctx, action, playerAction) => {
  const cityBuild = playerAction.value() as CityBuildItem,
    { auto, chosen } = action;

  // What the city is building, which is all a choice changes (#411).
  ctx.patches.cityBuild(cityBuild);

  // Auto: the city chooses its improvements itself, starting now if it's building nothing (#194).
  if (typeof auto === 'boolean') {
    cityBuild.setAuto(auto);

    if (auto) {
      autoBuild(cityBuild, ctx.rules);
    }

    return false;
  }

  if (!chosen) {
    console.warn(`no build item specified`);

    return false;
  }

  const [buildItem] = cityBuild
    .available()
    .filter((buildItem: BuildItem) => buildItem.item().name === chosen);

  if (!buildItem) {
    console.log(`build item not available: ${chosen}`);

    return false;
  }

  cityBuild.build(buildItem.item());
  // Choosing a build by hand takes the city off Auto.
  cityBuild.setAuto(false);

  return false;
};

export const handleCompleteProduction: ActionHandler<
  CompleteProduction
> = async (ctx, action, playerAction) => {
  const cityBuild = playerAction.value(),
    [playerTreasury] = ctx.playerTreasuries.getBy('id', action.treasury);

  if (!playerTreasury) {
    console.warn(`No playerTreasury found for id: ${action.treasury}.`);

    return false;
  }

  playerTreasury.buy(cityBuild.city());

  ctx.patches.playerObject(playerTreasury);
  ctx.patches.cityBuild(cityBuild);

  return false;
};

// Selling one of the city's improvements (#31): the rules decide whether it can be sold, and for what.
export const handleSellImprovement: ActionHandler<SellImprovement> = async (
  ctx,
  action,
  playerAction
) => {
  const city = playerAction.value(),
    [playerTreasury] = ctx.playerTreasuries.getBy('id', action.treasury),
    [cityImprovement] = ctx.cityImprovements
      .getByCity(city)
      .filter((cityImprovement) => cityImprovement.id() === action.improvement);

  if (!playerTreasury || !cityImprovement) {
    console.warn(
      `No playerTreasury (${action.treasury}) or improvement (${action.improvement}) found.`
    );

    return false;
  }

  playerTreasury.sell(cityImprovement);

  // Selling the Palace changes every city's corruption, so every city goes again (#460 would say when).
  ctx.patches.playerObject(playerTreasury);
  ctx.cities
    .getByPlayer(ctx.player())
    .forEach((city) => ctx.patches.city(city));

  return false;
};

export const handleChangeWorkedTile: ActionHandler<ChangeWorkedTile> = async (
  ctx,
  action,
  playerAction
) => {
  const city = playerAction.value(),
    [playerTile] = ctx.view.world().filter((tile) => tile.id() === action.tile);

  if (!playerTile) {
    console.log(`tile not found: ${action.tile}`);

    return false;
  }

  if (changeWorkedTile(city, playerTile.tile()) === 'none') {
    return false;
  }

  ctx.patches.city(city);

  return false;
};

export const handleChangeSpecialist: ActionHandler<ChangeSpecialist> = async (
  ctx,
  action,
  playerAction
) => {
  const city = playerAction.value().city();

  changeSpecialist(playerAction.value());

  ctx.patches.city(city);

  return false;
};
