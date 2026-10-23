// What the client tells the player about the barbarians (#169): raiders landing near one of our cities, and an
//  uprising near one, when we can see where. The raiders themselves arrive as patches, like any unit we can see.

import { NotificationContext, NotificationTable } from './NotificationContext';
import City from '@civ-clone/core-city/City';
import Notification from '../../Notification';
import Player from '@civ-clone/core-player/Player';
import Tile from '@civ-clone/core-world/Tile';

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
];

export default barbarianNotifications;
