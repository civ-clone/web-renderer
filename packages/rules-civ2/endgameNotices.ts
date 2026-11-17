// What Civ2's rules tell a person of the barbarians, the endgame and the world (M2e, #1008): a barbarian ship sighted,
//  an uprising near one of their cities (in place of the shared notice, whose fourth argument means something else in
//  Civ1), one that came to nothing (civ2-enhanced), global warming's warning and a warming, a civil war, and a
//  spaceship's launch. Raiders landing, a ransom, a ship lost or landed and a civilization coming back are told by the
//  shared notices, as Civ1's are. A civilization the person hasn't met isn't named (#59), and nothing is told of a
//  square the person can't see.

import {
  CityRegistry,
  instance as cityRegistryInstance,
} from '@civ-clone/core-city/CityRegistry';
import {
  Notification,
  NotificationContext,
  NotificationTable,
} from '@civ-clone/ui-worker-client/workerRules';
import {
  UnitRegistry,
  instance as unitRegistryInstance,
} from '@civ-clone/core-unit/UnitRegistry';
import City from '@civ-clone/core-city/City';
import Player from '@civ-clone/core-player/Player';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';

// How far from one of our cities an uprising is told as near it.
const NEAR_CITY = 8;

export type EndgameNoticesDependencies = {
  cityRegistry: CityRegistry;
  unitRegistry: UnitRegistry;
};

// Our cities, nearest `tile` first.
const ourCitiesNear = (
  ctx: NotificationContext,
  tile: Tile,
  within: number,
  cityRegistry: CityRegistry
): City[] =>
  cityRegistry
    .entries()
    .filter(
      (city: City) =>
        ctx.view.owns(city.player()) &&
        !city.destroyed() &&
        city.tile().distanceFrom(tile) <= within
    )
    .sort(
      (a: City, b: City) =>
        a.tile().distanceFrom(tile) - b.tile().distanceFrom(tile)
    );

// Whether `tile` is in sight of one of our cities or units now, as the engine says each sees (a square only explored
//  once isn't): a city its own squares (`tiles()`, its radius), and a unit the squares within its Visibility, as its
//  moves reveal them (`Unit.applyVisibility`; 2 for a unit that sees two spaces), as the battle sounds hear (#126).
const inSight = (
  ctx: NotificationContext,
  tile: Tile,
  { cityRegistry, unitRegistry }: EndgameNoticesDependencies
): boolean =>
  cityRegistry
    .entries()
    .some(
      (city: City) =>
        ctx.view.owns(city.player()) &&
        !city.destroyed() &&
        city.tiles().entries().includes(tile)
    ) ||
  unitRegistry
    .entries()
    .some(
      (unit: Unit) =>
        ctx.view.owns(unit.player()) &&
        !unit.destroyed() &&
        unit.tile().getSurroundingArea(unit.visibility().value()).includes(tile)
    );

export const endgameNotices = (
  dependencies: EndgameNoticesDependencies = {
    cityRegistry: cityRegistryInstance,
    unitRegistry: unitRegistryInstance,
  }
): NotificationTable => {
  const { cityRegistry } = dependencies;

  return [
    // A barbarian ship appears at sea (civ2-barbarians' raid): told only where one of our cities or units can see it.
    [
      'barbarians:raiders-at-sea',
      (ctx: NotificationContext, player: Player, ship: Unit, tile: Tile) =>
        inSight(ctx, tile, dependencies)
          ? new Notification('Barbarians.raiders-at-sea', {})
          : null,
    ],

    // An uprising (civ2-barbarians): only ever near a person's city, though the city the original sizes it by may be a
    //  computer player's, so it's told as near our nearest city, where we have seen the square. Its fourth argument is
    //  whether anyone knows Industrialization (rifles and cannon rather than chariots), not Civ1's guerrillas.
    [
      'barbarians:uprising',
      (
        ctx: NotificationContext,
        player: Player,
        sizedBy: City,
        tile: Tile,
        industrial: boolean
      ) => {
        const [city] = ourCitiesNear(ctx, tile, NEAR_CITY, cityRegistry);

        return city === undefined || !ctx.hasSeen(tile)
          ? null
          : new Notification(
              industrial
                ? 'Barbarians.uprising-armed'
                : 'Barbarians.uprising-tribal',
              { city }
            );
      },
    ],

    // An uprising drawn for one of our cities that found nowhere to rise (civ2-enhanced's uprisings; the original drops
    //  it without a word).
    [
      'barbarians:uprising-failed',
      (ctx: NotificationContext, player: Player, city: City) =>
        ctx.view.owns(city.player())
          ? new Notification('Barbarians.uprising-failed', { city })
          : null,
    ],

    // Global warming (civ2-city-improvement, on base-global-warming): news for every civilization. A warming says how
    //  many of the squares we know have changed, not how many there are.
    [
      'world:global-warming-warning',
      () => new Notification('World.global-warming-warning', {}, true),
    ],
    [
      'world:global-warming',
      (ctx: NotificationContext, warmings: number, changed: Tile[]) => {
        const seen = changed.filter((tile: Tile) => ctx.hasSeen(tile)).length;

        return new Notification(
          seen === 0 ? 'World.global-warming.unseen' : 'World.global-warming',
          { count: seen },
          true
        );
      },
    ],

    // A civil war (civ2-player, on base-civil-war): told to the civilization that split, which hears how many cities
    //  left, and to everyone who has met it, who hear only that it split.
    [
      'player:civil-war',
      (
        ctx: NotificationContext,
        loser: Player,
        rebels: Player,
        cities: City[]
      ) => {
        // The rebels go in the notice only once met: a player sent is sent with its civilization, named or not.
        const met = ctx.hasMet(rebels);

        if (ctx.view.owns(loser)) {
          return new Notification(
            met ? 'Player.civil-war-ours' : 'Player.civil-war-ours.unmet',
            met ? { rebels, count: cities.length } : { count: cities.length },
            true
          );
        }

        if (ctx.view.owns(rebels) || !ctx.hasMet(loser)) {
          return null;
        }

        return new Notification(
          met ? 'Player.civil-war' : 'Player.civil-war.unmet',
          met ? { loser, rebels } : { loser },
          true
        );
      },
    ],

    // A spaceship launched (civ2-spaceship), with the year it arrives: news for every civilization, the launcher named
    //  once met.
    [
      'player:spaceship:launched',
      (ctx: NotificationContext, player: Player, arrivalYear: number) =>
        new Notification(
          ctx.view.owns(player)
            ? 'Spaceship.launched-by-us'
            : ctx.hasMet(player)
            ? 'Spaceship.launched'
            : 'Spaceship.launched.unmet',
          ctx.view.owns(player) || ctx.hasMet(player)
            ? { player, year: arrivalYear }
            : { year: arrivalYear },
          true
        ),
    ],
  ];
};

export default endgameNotices;
