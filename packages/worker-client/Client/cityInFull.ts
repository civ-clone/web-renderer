// A city sent once, in full, as its owner sees it: what a Diplomat's investigation opens (#58), and what a watcher
//  opens by clicking a city of a civilisation they watch (#613). Nothing else of its owner's goes with it: players are
//  sent as their civilization, and other cities and every unit as the wrappers the map has for them.

import City from '@civ-clone/core-city/City';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import UnknownCity from '../UnknownObjects/City';
import UnknownUnit from '../UnknownObjects/Unit';
import { ClientContext } from './ClientContext';

export type CityInFullContext = Pick<
  ClientContext,
  // What is known of each square.
  | 'view'
  // What the player may see, which the city's tiles go through.
  | 'dataFilter'
>;

export const cityInFull = (city: City, ctx: CityInFullContext): ObjectMap => {
  const playerWorld = ctx.view.world(),
    // Tiles as the player knows them, in full, as nothing else is sent with it, and `Busy` by name.
    otherwise = ctx.dataFilter(undefined, { tilesInFull: true }),
    // One wrapper per unit and city, so each is the same object wherever it appears.
    wrappers = new Map<Unit | City, UnknownUnit | UnknownCity>(),
    wrap = (object: Unit | City, make: () => UnknownUnit | UnknownCity) => {
      if (!wrappers.has(object)) {
        wrappers.set(object, make());
      }

      return wrappers.get(object)!;
    };

  return city.toPlainObject((object: any) => {
    if (object === city) {
      return object;
    }

    if (object instanceof Player) {
      return {
        _: 'Player',
        id: object.id(),
        civilization: object.civilization(),
        // The city screen's map is laid out in the world's dimensions, on its grid.
        world: {
          height: playerWorld.height(),
          topologyId: playerWorld.topologyId(),
          width: playerWorld.width(),
        },
      };
    }

    if (object instanceof Unit) {
      return wrap(object, () => UnknownUnit.fromUnit(object));
    }

    if (object instanceof City) {
      return wrap(object, () => UnknownCity.fromCity(object));
    }

    return otherwise(object);
  });
};

export default cityInFull;
