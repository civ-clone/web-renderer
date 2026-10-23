// A client's view of a player (#613) for a test that builds a context from plain data: the player's own, with the
//  world it is given (nothing known by default), and nobody met.

import Player from '@civ-clone/core-player/Player';
import { playerView, View } from '../../../src/js/Engine/Client/View';

export const stubView = (
  player: () => Player,
  playerWorld: {
    getByTile: (tile: any) => any;
    [method: string]: any;
  } = { getByTile: () => null }
): View =>
  playerView(player, {
    cities: { entries: () => [] },
    interactions: { getByPlayers: () => [] },
    playerWorlds: { getByPlayer: () => playerWorld as any },
  });

export default stubView;
