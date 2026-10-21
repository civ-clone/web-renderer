// What a Diplomat's missions open for the player (#449), moved out of `DataTransferClient`: the intelligence report
//  for an embassy established, and the city a Diplomat investigated. What the player is told of a mission is in
//  `notifications/diplomat.ts`, and the talks a Meet with King starts are in `Talks.ts`.

import City from '@civ-clone/core-city/City';
import Engine from '@civ-clone/core-engine/Engine';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import UnknownCity from '../UnknownObjects/City';
import UnknownUnit from '../UnknownObjects/Unit';
import { ClientContext, Disposer } from './ClientContext';

export type DiplomatEventsContext = Pick<
  ClientContext,
  | 'player'
  | 'transport'
  // What the player may see, which an investigated city's tiles go through.
  | 'dataFilter'
  | 'playerWorlds'
>;

export const registerDiplomatEvents = (
  engine: Pick<Engine, 'on' | 'off'>,
  ctx: DiplomatEventsContext
): Disposer => {
  const listeners: [string, (...args: any[]) => void][] = [],
    on = (event: string, listener: (...args: any[]) => void): void => {
      engine.on(event, listener);

      listeners.push([event, listener]);
    };

  // The report opens on the civilization the embassy is with, as v474.05 opens it.
  on('player:embassy-established', (holder: Player, host: Player) => {
    if (holder !== ctx.player()) {
      return;
    }

    ctx.transport.send(
      'embassyEstablished',
      typeNameOf(host.civilization().sourceClass())
    );
  });

  // The city is sent once, in full, as its owner would see it. Nothing else of its owner's goes with it: players are
  //  sent as their civilization, and other cities and every unit as the wrappers the map has for them.
  on('city:investigated', (city: City, player: Player) => {
    if (player !== ctx.player()) {
      return;
    }

    const playerWorld = ctx.playerWorlds.getByPlayer(ctx.player()),
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

    ctx.transport.send(
      'investigateCity',
      city.toPlainObject((object: any) => {
        if (object === city) {
          return object;
        }

        if (object instanceof Player) {
          return {
            _: 'Player',
            id: object.id(),
            civilization: object.civilization(),
            // The city screen's map is laid out in the world's dimensions.
            world: {
              height: playerWorld.height(),
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
      }) as never
    );
  });

  return (): void =>
    listeners.forEach(([event, listener]) => engine.off(event, listener));
};

export default registerDiplomatEvents;
