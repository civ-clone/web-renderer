// What the client tells the player about the barbarians (#169): raiders landing near one of our cities, and an
//  uprising near one, when we can see where; and the ransom paid when we kill their leader (#171). The raiders
//  themselves arrive as patches, like any unit we can see. A horde from a goody hut (#172) is told as the hut's
//  outcome, `GoodyHut.action-performed.Barbarians`.

import { NotificationContext, NotificationTable } from './NotificationContext';
import City from '@civ-clone/core-city/City';
import Notification from '../../Notification';
import Player from '@civ-clone/core-player/Player';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';

export const barbarianNotifications: NotificationTable = [
  [
    'barbarians:landed',
    (ctx: NotificationContext, player: Player, city: City, tile: Tile) =>
      ctx.view.owns(city.player()) && ctx.hasSeen(tile)
        ? new Notification('Barbarians.landing', { city })
        : null,
  ],

  [
    'barbarians:uprising',
    (
      ctx: NotificationContext,
      player: Player,
      city: City,
      tile: Tile,
      guerrilla: boolean
    ) =>
      ctx.view.owns(city.player()) && ctx.hasSeen(tile)
        ? new Notification(
            guerrilla ? 'Barbarians.uprising.guerrilla' : 'Barbarians.uprising',
            { city }
          )
        : null,
  ],

  [
    'barbarians:ransom',
    (ctx: NotificationContext, player: Player, leader: Unit, amount: number) =>
      ctx.view.owns(player)
        ? new Notification('Barbarians.ransom', { amount })
        : null,
  ],
];

export default barbarianNotifications;
