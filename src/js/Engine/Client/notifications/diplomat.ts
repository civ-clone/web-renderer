// What the client tells the player about Diplomats (#449).

import Advance from '@civ-clone/core-science/Advance';
import City from '@civ-clone/core-city/City';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import { NotificationContext, NotificationTable } from './NotificationContext';
import Notification from '../../Notification';
import Part from '@civ-clone/core-spaceship/Part';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import Wonder from '@civ-clone/core-wonder/Wonder';

// What kind of thing a sabotaged city was building, which says where its name is translated, as `City.building-complete`
//  notices do (#58). `target` is the class being built, or nothing.
export const sabotagedBuildKind = (target: unknown): string => {
  const is = (Type: Function): boolean =>
    typeof target === 'function' &&
    Object.prototype.isPrototypeOf.call(Type, target);

  return is(Unit)
    ? '.unit'
    : is(Wonder)
    ? '.wonder'
    : is(CityImprovement)
    ? '.city-improvement'
    : is(Part)
    ? '.spaceship-part'
    : '';
};

// A Diplomat's work (#58): the player who sent it and the player it was done to are both told, as v474.05 tells them.
export const diplomatNotifications: NotificationTable = [
  [
    'player:advance-stolen',
    (
      ctx: NotificationContext,
      thief: Player,
      victim: Player,
      AdvanceType: typeof Advance
    ) =>
      ![thief, victim].some((candidate) => ctx.view.owns(candidate))
        ? null
        : new Notification('Diplomat.advance-stolen', {
            advance: AdvanceType.name,
            thief,
          }),
  ],

  [
    'city:sabotaged',
    (ctx: NotificationContext, city: City, saboteur: Player, target: unknown) =>
      ![saboteur, city.player()].some((candidate) => ctx.view.owns(candidate))
        ? null
        : target instanceof CityImprovement
        ? new Notification('Diplomat.sabotaged.improvement', {
            city,
            improvement: target.sourceClass().name,
          })
        : new Notification(
            'Diplomat.sabotaged.production' + sabotagedBuildKind(target),
            {
              city,
              build: {
                _:
                  typeof target === 'function' ? (target as Function).name : '',
              },
            }
          ),
  ],

  [
    'city:incited',
    (
      ctx: NotificationContext,
      city: City,
      inciter: Player,
      originalPlayer: Player
    ) =>
      ![inciter, originalPlayer].some((candidate) => ctx.view.owns(candidate))
        ? null
        : new Notification('Diplomat.incited', {
            city,
            inciter,
            originalPlayer,
          }),
  ],

  // Only the side that lost the unit is told, as in v474.05: the briber has seen the price paid.
  [
    'unit:bribed',
    (
      ctx: NotificationContext,
      unit: Unit,
      briber: Player,
      previousOwner: Player
    ) =>
      !ctx.view.owns(previousOwner)
        ? null
        : new Notification('Diplomat.unit-bribed', {
            briber,
            previousOwner,
            unit: unit.sourceClass().name,
          }),
  ],
];

export default diplomatNotifications;
