// What the client tells the player about cities, their builds and their improvements (#449), moved out of
//  `DataTransferClient`. What these events change goes out as patches, which the client queues itself, before these.

import Advance from '@civ-clone/core-science/Advance';
import City from '@civ-clone/core-city/City';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import { NotificationContext, NotificationTable } from './NotificationContext';
import Notification from '@civ-clone/ui-protocol/Notification';
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

// A rival's wonder, or anything we build.
const buildingComplete = (
  ctx: NotificationContext,
  cityBuild: CityBuildItem,
  build: unknown
): Notification | null => {
  if (!ctx.view.owns(cityBuild.city().player()) && build instanceof Wonder) {
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

  // Already building another, as the player who keeps building military units asked (#690): told every few turns,
  //  it would only be noise. The rule that starts it runs before the completion is announced.
  if (
    build instanceof Unit &&
    cityBuild.building()?.item() === build.constructor
  ) {
    return null;
  }

  return new Notification(
    'City.building-complete.' + buildingCompleteKind(build),
    {
      cityBuild,
      build,
    }
  );
};

// What our queue dropped on its way to the next item, as the city could no longer build it (#774): the first, by kind,
//  and how many more, which is rare.
const queueDropped = (
  ctx: NotificationContext,
  cityBuild: CityBuildItem
): Notification | null => {
  const [first, ...more] = cityBuild.queueDropped();

  if (!ctx.view.owns(cityBuild.city().player()) || first === undefined) {
    return null;
  }

  return new Notification(
    'City.queue-dropped.' + buildingCompleteKind(first.prototype),
    {
      city: cityBuild.city(),
      item: { _: first.name },
      more: more.length,
    }
  );
};

// The waits each client has seen (#970): for each city build, the item it last waited on and the turn it last did. The
//  engine says a paid-for build is waiting on every turn's check while it waits, so a wait is a run of consecutive turns
//  with the event for the same build and item: told on the first, and not while it goes on, however the item is chosen
//  again in the meantime. A turn without the event ends it, whatever the reason (completed, cancelled, changed, or its
//  shields lost to sabotage), and the next wait is told afresh. Nothing is saved: after loading a game the builds are
//  new and none has been seen, so a build still waiting is told once more.
const waitsSeen: WeakMap<
  NotificationContext,
  WeakMap<CityBuildItem, { Item: Function; turn: number }>
> = new WeakMap();

// Our build, paid for and waiting, as `Hold` rules hold it (#970): what it is and the ids of the rules, which the page
//  words as the city screen does. A bubble, as it asks nothing, opening the city; the page withdraws it once the city's
//  build is no longer waiting.
const buildingHeld = (
  ctx: NotificationContext,
  cityBuild: CityBuildItem,
  Item: Function,
  held: (string | null)[]
): Notification | null => {
  if (!ctx.view.owns(cityBuild.city().player())) {
    return null;
  }

  if (!waitsSeen.has(ctx)) {
    waitsSeen.set(ctx, new WeakMap());
  }

  const seen = waitsSeen.get(ctx)!,
    last = seen.get(cityBuild),
    turn = ctx.turn.value();

  seen.set(cityBuild, { Item, turn });

  // The same wait, seen this turn or the one before.
  if (last !== undefined && last.Item === Item && last.turn >= turn - 1) {
    return null;
  }

  return new Notification(
    'City.building-held.' + buildingCompleteKind(Item.prototype),
    {
      city: cityBuild.city(),
      item: { _: Item.name },
      held,
    },
    true
  );
};

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

  // A rival's wonder, or anything we build, and what our queue dropped on its way to the next item (#774).
  [
    'city:building-complete',
    (ctx: NotificationContext, cityBuild: CityBuildItem, build: unknown) => {
      const notifications = [
        buildingComplete(ctx, cityBuild, build),
        queueDropped(ctx, cityBuild),
      ].filter(
        (notification): notification is Notification => notification !== null
      );

      return notifications.length === 0
        ? null
        : notifications.length === 1
        ? notifications[0]!
        : notifications;
    },
  ],

  // Told once while it waits (#970).
  ['city:building-held', buildingHeld],

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
