// What the client tells the player about units (#449), moved out of `DataTransferClient`. What these events change
//  goes out as patches, which the client queues itself, before these.

import City from '@civ-clone/core-city/City';
import GoodyHut from '@civ-clone/core-goody-hut/GoodyHut';
import { NotificationContext, NotificationTable } from './NotificationContext';
import Notification from '../../Notification';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import { aircraftRange } from '@civ-clone/civ1-unit/Rules/Player/turnEnd';

export const unitNotifications: NotificationTable = [
  // A nuclear detonation (#129), told to everyone but the player who set it off.
  [
    'unit:nuclear-detonation',
    (ctx: NotificationContext, unit: Unit) =>
      ctx.view.owns(unit.player())
        ? null
        : new Notification('Unit.nuclear-attack', {
            player: unit.player(),
          }),
  ],

  [
    'unit:lost-at-sea',
    (ctx: NotificationContext, unit: Unit) =>
      !ctx.view.owns(unit.player())
        ? null
        : new Notification(
            aircraftRange.some(([UnitType]) => unit instanceof UnitType)
              ? 'Unit.out-of-fuel'
              : 'Unit.lost-at-sea',
            {
              unit,
            }
          ),
  ],

  [
    'unit:unsupported',
    (ctx: NotificationContext, city: City, unit: Unit) =>
      !ctx.view.owns(city.player())
        ? null
        : new Notification('City.unit-unsupported', {
            city,
            unit,
          }),
  ],

  [
    'unit:trade-route-established',
    (
      ctx: NotificationContext,
      player: Player,
      home: City,
      city: City,
      goods: string,
      bonus: number
    ) =>
      !ctx.view.owns(player)
        ? null
        : new Notification('Unit.trade-route-established', {
            bonus,
            city,
            goods,
            home,
          }),
  ],

  // Told to the player whose unit is on the hut's square.
  [
    'goody-hut:action-performed',
    (ctx: NotificationContext, goodyHut: GoodyHut, action: object) =>
      ctx
        .unitsOn(goodyHut.tile())
        .some((unit: Unit) => ctx.view.owns(unit.player()))
        ? new Notification(
            `GoodyHut.action-performed.${action.constructor.name}`,
            {
              goodyHut,
              action,
            }
          )
        : null,
  ],
];

export default unitNotifications;
