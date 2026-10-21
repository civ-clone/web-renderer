// The engine events that change what the player is sent (#449), moved out of `DataTransferClient`: each listener queues
//  the patches for what the event changed, which are built and sent at the next flush. One of them flushes: every
//  `unit:moved`, anyone's, which is how the AI's moves reach the UI.
//
// What the player is told of these events is in `notifications/`, registered after these, so that what an event
//  changes is queued before the player is told of it.

import Advance from '@civ-clone/core-science/Advance';
import City from '@civ-clone/core-city/City';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import Civilization from '@civ-clone/core-civilization/Civilization';
import Engine from '@civ-clone/core-engine/Engine';
import GoodyHut from '@civ-clone/core-goody-hut/GoodyHut';
import JoinCity from '@civ-clone/library-unit/Actions/JoinCity';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import UnitAction from '@civ-clone/core-unit/Action';
import Yield from '@civ-clone/core-yield/Yield';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import Automation from '../Automation';
import { CityNewsCollector } from '../cityNews';
import { ClientContext, Disposer } from '../ClientContext';
import { filterToReference, filterToReferenceAllExcept } from '../refs';
import { knownUnknownCity } from '../standIns';

export type PatchEventsContext = Pick<
  ClientContext,
  | 'player'
  // The patches queued for the player, and the flush that sends them.
  | 'patches'
  // What the player may see, which a rival's city, a build or research goes through when it changes.
  | 'dataFilter'
> & {
  // Whether this is our turn, automated, read as each event happens: automation is turned on and off mid-game.
  automation: Pick<Automation, 'automatedTurn'>;
  // What happened to each city during the engine call under way: a city captured from us, or destroyed.
  cityNews: Pick<CityNewsCollector, 'of'>;
};

export const registerPatchEvents = (
  engine: Pick<Engine, 'on' | 'off'>,
  ctx: PatchEventsContext
): Disposer => {
  const listeners: [string, (...args: any[]) => void][] = [],
    on = (event: string, listener: (...args: any[]) => void): void => {
      engine.on(event, listener);

      listeners.push([event, listener]);
    };

  on('player:visibility-changed', (tile, player) => {
    if (player !== ctx.player()) {
      return;
    }

    const playerWorld = playerWorldRegistryInstance.getByPlayer(ctx.player()),
      playerTile = playerWorld.getByTile(tile);

    // A square newly seen in one of our cities' areas is one of its `tiles` from now on, where it was undiscovered
    //  (#411).
    if (!ctx.automation.automatedTurn()) {
      ctx.patches.citiesAround(tile);
    }

    // `PlayerWorld.register` adds the square before it says it is seen, so it is never missing here (#478).
    if (playerTile === null) {
      // Never reached today (`PlayerWorld.register` adds the tile before the rule fires); say so if it ever is,
      //  rather than dropping the square silently.
      console.warn(
        `visibility-changed: no PlayerTile yet for ${tile.x()},${tile.y()}`
      );

      return;
    }

    ctx.patches.seenTile(playerWorld, playerTile);
  });

  ['unit:created', 'unit:defeated', 'unit:lost-at-sea'].forEach((event) => {
    on(event, (unit) => {
      const playerWorld = playerWorldRegistryInstance.getByPlayer(ctx.player()),
        playerTile = playerWorld.getByTile(unit.tile());

      if (!playerTile) {
        return;
      }

      ctx.patches.tile(playerTile);

      if (unit.player() !== ctx.player()) {
        return;
      }

      // The unit, the player's list of units, and its home city, which supports it (#411). Each is built when the
      //  patch is sent, so a unit gone by then, a Settlers that founded a city, isn't put back (#138).
      ctx.patches.unit(unit);
      ctx.patches.city(unit.city());

      if (event === 'unit:created') {
        ctx.patches.playerKey('units');
      }
    });
  });

  ['unit:destroyed'].forEach((event) => {
    on(event, (unit: Unit) => {
      // A disbanded or destroyed unit leaves its square, whoever's it was (#138).
      ctx.patches.tile(unit.tile());

      // It goes once more, marked destroyed, and then drops out of the player's list of units, which no longer holds
      //  it or the home city it kept (#459). Its home city no longer supports it (#411).
      ctx.patches.unit(unit);
      ctx.patches.city(unit.city());

      if (unit.player() === ctx.player()) {
        ctx.patches.playerKey('units');
      }
    });
  });

  ['unit:moved'].forEach((event) => {
    on(event, (unit: Unit, action: UnitAction) => {
      const playerWorld = playerWorldRegistryInstance.getByPlayer(ctx.player()),
        fromTile = playerWorld.getByTile(action.from()),
        toTile = playerWorld.getByTile(action.to());

      if (!fromTile && !toTile) {
        return;
      }

      ctx.patches.tile(fromTile);
      ctx.patches.tile(toTile);

      // A Settlers joining a city makes it grow, so the city goes out in full, as `city:grow` sends it. In the tile
      //  patch alone the city is a ref, and would keep the size the UI already has (#243).
      if (action instanceof JoinCity) {
        const city = cityRegistryInstance.getByTile(action.to());

        if (city !== null) {
          ctx.patches.city(city);
        }
      }

      // The unit, and the city that supports it, which may be unhappy about where it is now (#411).
      if (unit.player() === ctx.player() && !ctx.automation.automatedTurn()) {
        ctx.patches.unit(unit);
        ctx.patches.city(unit.city());
        ctx.patches.onTiles(action.from(), action.to());
      }

      ctx.patches.flush();
    });
  });

  [
    'tile-improvement:built',
    'tile-improvement:pillaged',
    'tile-improvement:removed',
  ].forEach((event) => {
    on(event, (tile) => ctx.patches.tile(tile));
  });

  on(
    'city:captured',
    (city: City, capturingPlayer: Player, originalPlayer: Player) => {
      // Our capture of it is told in `Client/notifications/city.ts`.
      if (originalPlayer === ctx.player()) {
        // The city already belongs to the capturing player here, so resend ours: the city is gone from our list,
        //  and losing the capital changes every remaining city's corruption.
        ctx.patches.wholePlayer(
          filterToReferenceAllExcept(Player, PlayerAction, Civilization)
        );

        Object.assign(ctx.cityNews.of(city), {
          capturedBy: capturingPlayer,
          capturedFrom: originalPlayer,
        });
      }
    }
  );

  // The map draws a city from its tile: its size, or an unhappy citizen in civil disorder (#193). Our own city is a
  //  ref in the tile patch, so it goes out in full along with it: a new or captured city the frontend has never had,
  //  or a size or disorder the map draws from it. Not a destroyed one.
  const cityChanged = (
    city: City,
    destroyed: boolean = false,
    listChanged: boolean = false
  ): void => {
    const playerWorld = playerWorldRegistryInstance.getByPlayer(ctx.player()),
      playerTile = playerWorld.getByTile(city.tile());

    if (!playerTile) {
      return;
    }

    const unknownCity = knownUnknownCity(city);

    if (unknownCity) {
      ctx.patches.update(unknownCity.id(), () => {
        unknownCity.update(city);

        return unknownCity.toPlainObject(
          ctx.dataFilter(filterToReference(Tile, Unit, Player))
        );
      });
    }

    ctx.patches.tile(playerTile);

    if (!destroyed) {
      ctx.patches.city(city);
    }

    // A city founded, captured or destroyed is added to or gone from the player's list of cities (#411).
    if (listChanged && city.player() === ctx.player()) {
      ctx.patches.playerKey('cities');
    }
  };

  [
    'city:created',
    'city:captured',
    'city:grow',
    'city:shrink',
    // A rival's city in disorder shows on the map as your own does (#265). The engine raises
    //  `city:civil-disorder` before it records the disorder, which is why the city is only read when the patch is
    //  built.
    'city:civil-disorder',
    'city:order-restored',
  ].forEach((event) =>
    on(event, (city: City) =>
      cityChanged(
        city,
        false,
        ['city:created', 'city:captured'].includes(event)
      )
    )
  );

  on('city:destroyed', (city: City, player: Player | null) => {
    cityChanged(city, true, true);

    Object.assign(ctx.cityNews.of(city), {
      destroyed: true,
      destroyedBy: player ?? null,
    });
  });

  // Which city works a tile is part of the tile (`workedBy`), so it goes out whenever that changes (#138): a city
  //  founded, growing, shrinking or destroyed, a tile the player chose, workers reassigned, an enemy unit in the way.
  //  The city's yields change with it, so ours goes too (#411): a city founded next to it takes a square it worked.
  ['city:tile-worked', 'city:tile-released'].forEach((event) =>
    on(event, (city: City, tile: Tile) => {
      ctx.patches.tile(tile);

      if (!ctx.automation.automatedTurn()) {
        ctx.patches.city(city);
      }
    })
  );

  // A government's yields reach every tile and city, so a change of government resends them all: whatever changed
  //  it, a revolution, a new government chosen, or one that collapsed.
  on('player:government:changed', (player: Player) => {
    if (player === ctx.player()) {
      ctx.patches.allTilesAndCities();
    }
  });

  // A nuclear detonation (#129). The engine announces it before anything changes, and patches are only built when
  //  they're sent, so every square in the 3×3 area and every city in it is queued here and read once the units are
  //  gone and the cities halved. The other players are told of it in `Client/notifications/unit.ts`.
  on('unit:nuclear-detonation', (_unit: Unit, tile: Tile) => {
    const area = [tile, ...tile.getNeighbours()],
      cities = area
        .map((areaTile) => cityRegistryInstance.getByTile(areaTile))
        .filter((city): city is City => city !== null);

    area.forEach((areaTile) => ctx.patches.tile(areaTile));

    cities.forEach((city) => cityChanged(city));

    if (
      cities.some((city) => city.player() === ctx.player()) ||
      area.some((areaTile) =>
        unitRegistryInstance
          .getByTile(areaTile)
          .some((areaUnit) => areaUnit.player() === ctx.player())
      )
    ) {
      ctx.patches.wholePlayer(
        filterToReferenceAllExcept(
          Player,
          PlayerAction,
          Unit,
          UnitAction,
          Yield,
          Civilization
        )
      );
    }
  });

  // Both cities' trade changes (#411). The player is told of it in `Client/notifications/unit.ts`.
  on(
    'unit:trade-route-established',
    (player: Player, home: City, city: City) => {
      if (player !== ctx.player()) {
        return;
      }

      ctx.patches.city(home);
      ctx.patches.city(city);
    }
  );

  // A bribed or defecting unit stays where it is but changes colour, and moves between the two players' lists.
  on(
    'unit:transferred',
    (unit: Unit, player: Player, previousPlayer: Player) => {
      ctx.patches.tile(unit.tile());

      if (![player, previousPlayer].includes(ctx.player())) {
        return;
      }

      ctx.patches.wholePlayer(
        filterToReference(PlayerWorld, PlayerTile, Tile, City)
      );
    }
  );

  // Our build is told of in `Client/notifications/city.ts`, as a rival's wonder is.
  on('city:building-complete', (cityBuild) => {
    if (cityBuild.city().player() !== ctx.player()) {
      return;
    }

    ctx.patches.update(cityBuild.id(), () =>
      cityBuild.toPlainObject(
        ctx.dataFilter(filterToReference(Tile, Unit, Player))
      )
    );
  });

  // The advance is told of in `Client/notifications/player.ts`.
  on('player:research-complete', (playerResearch) => {
    if (playerResearch.player() !== ctx.player()) {
      return;
    }

    ctx.patches.update(playerResearch.id(), () =>
      playerResearch.toPlainObject(ctx.dataFilter(filterToReference(Player)))
    );
  });

  // The cities whose improvements are gone (#184). The player is told in `Client/notifications/city.ts`.
  on(
    'city-improvement:obsolete',
    (
      player: Player,
      _advance: Advance,
      _ImprovementType: typeof CityImprovement,
      cityImprovements: CityImprovement[]
    ) => {
      if (player !== ctx.player()) {
        return;
      }

      cityImprovements.forEach((cityImprovement) =>
        ctx.patches.city(cityImprovement.city())
      );
    }
  );

  // The hut is gone from the square, whoever found it (#138). The finder is told in `Client/notifications/unit.ts`.
  on('goody-hut:action-performed', (goodyHut: GoodyHut) =>
    ctx.patches.tile(goodyHut.tile())
  );

  return () =>
    listeners.forEach(([event, listener]) => engine.off(event, listener));
};

export default registerPatchEvents;
