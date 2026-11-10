// A city's actions (#449), moved out of `DataTransferClient#handleAction`: what it builds, buying it, selling an
//  improvement, and who works where.

import {
  ChangeProduction,
  CityBuild,
} from '@civ-clone/core-city-build/PlayerActions';
import {
  changeSpecialist,
  changeWorkedTile,
  reassignWorkers,
} from '@civ-clone/library-city/lib/assignWorkers';
import BuildItem from '@civ-clone/core-city-build/BuildItem';
import ChangeSpecialist from '@civ-clone/core-city/PlayerActions/ChangeSpecialist';
import ChangeWorkedTile from '@civ-clone/core-city/PlayerActions/ChangeWorkedTile';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import { ActionContext, ActionHandler } from './ActionContext';
import City from '@civ-clone/core-city/City';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import { workerRules } from '../../workerRules';
import type { QueueEdit } from '@civ-clone/ui-protocol/cityBuild';

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
//  city, an empty name or one too long changes nothing. The rules take the new name out of the name pools (#712,
//  #876), as they would however the city came to be renamed.
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

// Applies an edit to what the city builds after its current item (#774). An item added while the city builds nothing
//  is started instead, taking it off Auto as choosing does. One the city can't build, a position that isn't a whole
//  number, or a `queued` that isn't the queue as it is now (even on one of two of the same item) changes nothing.
export const editQueue = (cityBuild: CityBuildItem, edit: QueueEdit): void => {
  const isIndex = (value: unknown): value is number =>
      Number.isInteger(value) && (value as number) >= 0,
    isAt = (index: unknown, queued: unknown): index is number =>
      isIndex(index) &&
      index < cityBuild.queued().length &&
      Array.isArray(queued) &&
      queued.length === cityBuild.queued().length &&
      cityBuild
        .queued()
        .every((Item, position) => Item.name === queued[position]);

  if (edit.op === 'add') {
    if (edit.index !== undefined && !isIndex(edit.index)) {
      return;
    }

    const [buildItem] = cityBuild
      .available()
      .filter((buildItem: BuildItem) => buildItem.item().name === edit.chosen);

    if (!buildItem) {
      return;
    }

    if (cityBuild.building() === null) {
      cityBuild.choose(buildItem.item());
      cityBuild.setAuto(false);

      return;
    }

    cityBuild.enqueue(buildItem.item(), edit.index);

    return;
  }

  if (edit.op === 'remove' && isAt(edit.index, edit.queued)) {
    cityBuild.dequeue(edit.index);

    return;
  }

  if (edit.op === 'move' && isAt(edit.index, edit.queued) && isIndex(edit.to)) {
    cityBuild.requeue(edit.index, edit.to);

    return;
  }

  if (edit.op === 'clear') {
    cityBuild.clearQueue();
  }
};

export const handleCityBuild: ActionHandler<
  CityBuild | ChangeProduction
> = async (ctx, action, playerAction) => {
  const cityBuild = playerAction.value() as CityBuildItem,
    { auto, chosen, queue } = action;

  // What the city is building, which is all a choice changes (#411).
  ctx.patches.cityBuild(cityBuild);

  if (queue && typeof queue === 'object') {
    editQueue(cityBuild, queue as QueueEdit);

    return false;
  }

  // Auto: the city chooses its improvements itself, starting now if it's building nothing (#194).
  if (typeof auto === 'boolean') {
    cityBuild.setAuto(auto);

    if (auto) {
      workerRules().autoBuild(cityBuild, ctx.rules);
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

  // The player's choice: the first queued item, if it's that, leaves the queue (#774).
  cityBuild.choose(buildItem.item());
  // Choosing a build by hand takes the city off Auto.
  cityBuild.setAuto(false);

  return false;
};

// Buying what a city is building, and selling one of its improvements, are a rule set's own actions (Civ1's are in
//  civ1-treasury), which its worker rules hand these (#865).
export const handleCompleteProduction: ActionHandler<
  PlayerAction<CityBuildItem>
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
export const handleSellImprovement: ActionHandler<PlayerAction<City>> = async (
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
  // And the units in it, as an improvement can be part of their defence (City Walls, #743).
  ctx.patches.onTiles(city.tile());

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
