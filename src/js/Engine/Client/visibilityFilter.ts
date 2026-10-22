// What the player may see of the game, as the client sends it (#449), moved out of `DataTransferClient`: the
//  visibility filter every payload goes through, and the serialisers for the player's own tiles, units, cities and
//  parts of the player.

import Busy from '@civ-clone/core-unit/Rules/Busy';
import City from '@civ-clone/core-city/City';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import DataObject, { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import ActionsState from './ActionsState';
import {
  isUnitWithoutActions,
  unitWithoutActions,
} from '../lib/unitWithoutActions';
import { filterToReference, referenceObject } from './refs';
import {
  standsInForCityBuild,
  unknownCityOf,
  unknownPlayerOf,
  unknownUnitOf,
  withoutAvailable,
} from './standIns';

export type LocalFilter = (object: any) => any;

// `Busy` as well as `DataObject`, because that is what `toPlainObject`
// actually hands a filter: it walks every field, and `Unit._busy` holds a
// rule. Typed as `DataObject` alone, the `instanceof Busy` branch below
// narrows to `DataObject & Busy` — and since `core-rule@0.1.5` gave `Rule`
// a `private _id` for rule identity, alongside `DataObject`'s own, that
// intersection is `never` and the renderer stops compiling.
export type DataFilter = (
  localFilter?: LocalFilter,
  options?: { tilesInFull?: boolean }
) => (object: DataObject | Busy) => any;

// A caller's filter can still send a tile as something else, a notification's stand-in say, and that stands.
//  Otherwise a tile is a ref unless the caller asked for tiles in full (#138).
export const filterPlayerTile = (
  playerTile: PlayerTile,
  localFilter: LocalFilter,
  tilesInFull: boolean
): any => {
  const filtered = localFilter(playerTile);

  return filtered !== playerTile || tilesInFull
    ? filtered
    : referenceObject(playerTile);
};

// Tiles go as refs unless asked for in full (#138). A `PlayerTile` goes in full in a tile patch (`serialiseTile`), and
//  in the payloads that cannot hold refs, or that bring the frontend tiles it has never had: the initial game data and
//  an investigated city. Everywhere else the frontend already holds every tile the player knows, and a tile that
//  changes is sent on its own, so a tile in full there is only payload.
//
// `player` is asked for on every object, as the client's player is read wherever it is used, and `actions` is the
//  client's own, which serialising a `PlayerAction` outside `serialising` forgets.
export const makeDataFilter =
  (player: () => Player, actions: ActionsState): DataFilter =>
  (localFilter = (object: any) => object, { tilesInFull = false } = {}) =>
  (object: DataObject | Busy) => {
    // The player's actions are going out some other way, made afresh, and the frontend will hold those instead.
    if (object instanceof PlayerAction && !actions.serialising) {
      actions.forget();
    }

    if (object instanceof Player && object !== player()) {
      return unknownPlayerOf(object);
    }

    if (object instanceof Unit && object.player() !== player()) {
      return unknownUnitOf(object);
    }

    // The player's units go out without their actions, but for the one the UI has them for (#323).
    if (
      object instanceof Unit &&
      object.player() === player() &&
      !isUnitWithoutActions(object) &&
      !actions.sendsUnitActions(object)
    ) {
      return localFilter(unitWithoutActions(object));
    }

    if (object instanceof City && object.player() !== player()) {
      return unknownCityOf(object);
    }

    if (object instanceof Tile) {
      const playerWorld = playerWorldRegistryInstance.getByPlayer(player()),
        playerTile = playerWorld.get(object.x(), object.y());

      // The caller's filter applies to the tile that is actually sent (#130). Only a tile the player knows can be a
      //  ref: an undiscovered one is made up afresh, with a new id, on every call, so it goes inline.
      return playerTile instanceof PlayerTile
        ? filterPlayerTile(playerTile, localFilter, tilesInFull)
        : playerTile;
    }

    if (object instanceof PlayerTile) {
      return filterPlayerTile(object, localFilter, tilesInFull);
    }

    if (object instanceof Busy) {
      return {
        _: object.constructor.name,
      };
    }

    // Not `available`, which the picker fetches itself (#324). The filter sees the stand-in again when it is the thing
    //  being walked, so it is not wrapped twice. A rival's build, which only an investigated city sends, goes without it
    //  as well: what it could build would show the rival's advances (#493).
    if (object instanceof CityBuildItem && !standsInForCityBuild.has(object)) {
      return localFilter(withoutAvailable(object));
    }

    return localFilter(object);
  };

/**
 * One of the player's tiles in full, as a tile patch sends it (#138). `toPlainObject` puts the tile it's called on
 *  through the filter as well, which would make it a ref to itself, so the tile is kept and only what it holds is
 *  filtered: the player's own units and cities as refs, as the frontend holds them, and anyone else's as the stand-ins
 *  the map has for them, inline, as the frontend may never have had them (#46).
 */
export const serialiseTile = (
  dataFilter: DataFilter,
  playerTile: PlayerTile
): ObjectMap => {
  const filter = dataFilter(filterToReference(Player, Unit, City));

  return playerTile.toPlainObject((object: any) =>
    object === playerTile ? object : filter(object)
  ) as ObjectMap;
};

/**
 * One of the player's own objects in full, with what it refers to that the frontend already holds as refs (#411).
 *  `toPlainObject` puts the object it's called on through the filter as well, which would make it a ref to itself,
 *  so the object itself only goes through the visibility filter: a unit still goes without its actions, unless it's
 *  the one the UI has them for.
 */
export const serialiseOwn = (
  dataFilter: DataFilter,
  object: City | CityBuildItem | Unit,
  localFilter: LocalFilter
): ObjectMap => {
  const root = dataFilter()(object as unknown as DataObject),
    filter = dataFilter(localFilter);

  return object.toPlainObject((value: any) =>
    value === object ? root : filter(value)
  );
};

/**
 * One of the player's units, as a patch of the unit sends it (#411). Its tiles, its home city and the player are refs,
 *  as the frontend holds them all.
 */
export const serialiseUnit = (dataFilter: DataFilter, unit: Unit): ObjectMap =>
  serialiseOwn(dataFilter, unit, filterToReference(Player, City, Unit));

/**
 * One of the player's cities, as a patch of the city sends it (#411): its build, growth, improvements, specialists and
 *  yields in full, and its tiles, the units it supports and the player as refs, as the frontend holds them all.
 */
export const serialiseCity = (dataFilter: DataFilter, city: City): ObjectMap =>
  serialiseOwn(dataFilter, city, filterToReference(Player, City, Unit));

// A value that is part of the player, serialised on its own. `toPlainObject` is a method on `DataObject`, and the
//  filter is applied to what it is called on first, so handing it the value in place of the player gets the value
//  serialised, as the `hierarchy` (as `cityBuildAvailable` does).
export const serialisePlayerPart = (
  dataFilter: DataFilter,
  player: Player,
  value: any,
  localFilter: LocalFilter
): ObjectMap => {
  const filter = dataFilter(localFilter);

  return player.toPlainObject((object: any) =>
    object === player ? value : filter(object)
  );
};

/**
 * The whole player as the frontend should hold it now, for a test to compare with what it does hold (#411): every
 *  unit and city in full, and the map as refs, as the turn's hand-over sends it, with the player's actions. What the
 *  frontend is known to hold of those is left alone, as nothing is sent.
 */
export const serialisePlayer = (
  dataFilter: DataFilter,
  player: Player,
  actions: ActionsState
): ObjectMap => {
  actions.serialising = true;

  try {
    return player.toPlainObject(
      dataFilter(filterToReference(PlayerWorld, PlayerTile, Tile))
    );
  } finally {
    actions.serialising = false;
  }
};
