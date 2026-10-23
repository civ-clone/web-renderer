// What the client tells the player about cities, their builds and their improvements (#449), moved out of
//  `DataTransferClient`. What these events change goes out as patches, which the client queues itself, before these.

import Advance from '@civ-clone/core-science/Advance';
import City from '@civ-clone/core-city/City';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import { NotificationContext, NotificationTable } from './NotificationContext';
import Notification from '../../Notification';
import Part from '@civ-clone/core-spaceship/Part';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import Wonder from '@civ-clone/core-wonder/Wonder';

// What kind of thing a city has built, which says where its name is translated.
export const buildingCompleteKind = (build: unknown): string =>
  build instanceof Unit
    ? 'unit'
    : build instanceof Wonder
    ? 'wonder'
    : build instanceof CityImprovement
    ? 'city-improvement'
    : build instanceof Part
    ? 'spaceship-part'
    : 'other';

// Told only if the city is ours.
const ours =
  (key: string) =>
  (ctx: NotificationContext, city: City): Notification | null =>
    ctx.view.owns(city.player())
      ? new Notification(key, {
          city,
        })
      : null;

export const cityNotifications: NotificationTable = [
  // Our capture of a city. Losing one is the city's news (`Client/cityNews.ts`).
  [
    'city:captured',
    (
      ctx: NotificationContext,
      city: City,
      capturingPlayer: Player,
      originalPlayer: Player
    ) =>
      !ctx.view.owns(originalPlayer) && ctx.view.owns(capturingPlayer)
        ? new Notification('City.captured-by-us', {
            city,
            capturingPlayer,
            originalPlayer,
          })
        : null,
  ],

  // "Pollution near Rome." (#32).
  ['city:polluted', ours('City.polluted')],

  [
    'city:sdi-protected',
    (ctx: NotificationContext, city: City, unit: Unit) =>
      !ctx.view.owns(city.player()) && !ctx.view.owns(unit.player())
        ? null
        : new Notification('City.sdi-protected', {
            city,
          }),
  ],

  [
    'city:unsupported-improvement',
    (ctx: NotificationContext, city: City, cityImprovement: CityImprovement) =>
      !ctx.view.owns(city.player())
        ? null
        : new Notification('City.improvement-unsupported', {
            city,
            cityImprovement,
          }),
  ],

  // A rival's wonder, or anything we build.
  [
    'city:building-complete',
    (ctx: NotificationContext, cityBuild: CityBuildItem, build: unknown) => {
      if (
        !ctx.view.owns(cityBuild.city().player()) &&
        build instanceof Wonder
      ) {
        // Only the city (sent as an `UnknownCity`) and the wonder: `cityBuild` is the other player's build queue, and
        //  a city we have never seen is not named at all (#43).
        return ctx.hasSeen(cityBuild.city().tile())
          ? new Notification('Wonder.building-complete.other-player.known', {
              city: cityBuild.city(),
              build,
            })
          : new Notification('Wonder.building-complete.other-player.unknown', {
              build,
            });
      }

      if (!ctx.view.owns(cityBuild.city().player())) {
        return null;
      }

      return new Notification(
        'City.building-complete.' + buildingCompleteKind(build),
        {
          cityBuild,
          build,
        }
      );
    },
  ],

  [
    'wonder:obsolete',
    (ctx: NotificationContext, wonder: Wonder, city: City) =>
      !ctx.view.owns(city.player())
        ? null
        : new Notification(
            'Wonder.obsolete',
            {
              city,
              wonder,
            },
            true
          ),
  ],

  // Barracks at Gunpowder and Combustion (#184). As in Civ1, the player is told even when there were none to remove,
  //  because rebuilding them now costs more.
  [
    'city-improvement:obsolete',
    (
      ctx: NotificationContext,
      player: Player,
      advance: Advance,
      ImprovementType: typeof CityImprovement
    ) =>
      !ctx.view.owns(player)
        ? null
        : new Notification(
            'CityImprovement.obsolete',
            {
              advance,
              improvement: ImprovementType.name,
            },
            true
          ),
  ],

  ['city:civil-disorder', ours('City.civil-disorder')],

  ['city:order-restored', ours('City.order-restored')],

  ['city:leader-celebration', ours('City.leader-celebration')],

  ['city:leader-celebration-ended', ours('City.leader-celebration-ended')],
];

export default cityNotifications;
