// What the client sends in place of the game's own objects (#449). The caches are module-level on purpose: every
//  client shares them, as they did when they were part of `DataTransferClient`.

import City from '@civ-clone/core-city/City';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import UnknownCity from '../UnknownObjects/City';
import UnknownPlayer from '../UnknownObjects/Player';
import UnknownUnit from '../UnknownObjects/Unit';

const unknownPlayers: WeakMap<Player, UnknownPlayer> = new WeakMap(),
  unknownUnits: WeakMap<Unit, UnknownUnit> = new WeakMap(),
  unknownCities: WeakMap<City, UnknownCity> = new WeakMap();

// Another player, unit or city as the player may know it, made the first time it is asked for and the same one after.
export const unknownPlayerOf = (player: Player): UnknownPlayer => {
    if (!unknownPlayers.has(player)) {
      unknownPlayers.set(player, UnknownPlayer.fromPlayer(player));
    }

    return unknownPlayers.get(player)!;
  },
  unknownUnitOf = (unit: Unit): UnknownUnit => {
    if (!unknownUnits.has(unit)) {
      unknownUnits.set(unit, UnknownUnit.fromUnit(unit));
    }

    return unknownUnits.get(unit)!;
  },
  unknownCityOf = (city: City): UnknownCity => {
    if (!unknownCities.has(city)) {
      unknownCities.set(city, UnknownCity.fromCity(city));
    }

    return unknownCities.get(city)!;
  },
  // The stand-in for a city, if one has been made: one that has never gone out needs none kept up to date.
  knownUnknownCity = (city: City): UnknownCity | undefined =>
    unknownCities.get(city);

// A `CityBuild` without `available` (#324). Working out what every city could build was most of every player patch (a
//  production change in a large game sent 500 KB of it, all for the one picker that reads it), so the picker asks for
//  it when it opens (`cityBuildAvailable`). `toPlainObject` only reads what `keys()` names, so a stand-in that names
//  fewer is enough; it shares the id, and so the entry in the UI's data, with the build it stands in for. A stand-in is
//  an `instanceof CityBuild` itself, which is why `standsInForCityBuild` is there for the filter to check.
const cityBuildStandIns: WeakMap<CityBuildItem, CityBuildItem> = new WeakMap();

export const standsInForCityBuild: WeakSet<CityBuildItem> = new WeakSet(),
  withoutAvailable = (cityBuild: CityBuildItem): CityBuildItem => {
    if (!cityBuildStandIns.has(cityBuild)) {
      const standIn: CityBuildItem = Object.create(cityBuild, {
        keys: {
          value: () => cityBuild.keys().filter((key) => key !== 'available'),
        },
      });

      standsInForCityBuild.add(standIn);
      cityBuildStandIns.set(cityBuild, standIn);
    }

    return cityBuildStandIns.get(cityBuild)!;
  };
