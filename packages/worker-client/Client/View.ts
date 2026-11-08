// Whose game the client sends (#613): which players are "own", whose units, cities and `Player` go out in full, and what
//  is known of each square. A client is for one player, so its view is `playerView`; an observer's can be of several
//  civilisations at once, or of the whole map.

import Player from '@civ-clone/core-player/Player';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Tile from '@civ-clone/core-world/Tile';
import hasMet, { HasMetDependencies } from '../lib/hasMet';
import playerWithoutActions from '../lib/playerWithoutActions';

export type View = {
  // The players whose units, cities and `Player` go out in full; everyone else's become the `Unknown*` stand-ins.
  owners(): Player[];
  owns(player: Player): boolean;
  // The player the payload is shaped as (its research, treasury, government, actions): the first owner, or the viewed
  //  player today.
  primary(): Player;
  // What the view knows of a square: a `PlayerTile`, or `null` for one undiscovered.
  tile(tile: Tile): PlayerTile | null;
  // The `PlayerWorld` the view's squares come from, for `seenTile`'s index and the payload's `world`.
  world(): PlayerWorld;
  // The object the payload's `player` is serialised from: the primary player itself, or a stand-in for it whose
  //  `world` is the view's. Without its actions when they go on their own (`PlayerPatches.wholePlayer`).
  payload(omitActions: boolean): Player;
  // The object an owner other than the primary is serialised from, where it is reached: itself, or a stand-in whose
  //  `world` is the view's rather than its own (#328).
  member(player: Player): Player;
  hasSeen(tile: Tile): boolean;
  hasMet(other: Player): boolean;
};

export type ViewDependencies = HasMetDependencies;

// The view of a single player, as the client has always had it. The player is asked for on every use, as the client's
//  player is read wherever it is used.
export const playerView = (
  player: () => Player,
  dependencies: ViewDependencies
): View => {
  const { playerWorlds } = dependencies,
    world = (): PlayerWorld => playerWorlds.getByPlayer(player()),
    tile = (tile: Tile): PlayerTile | null => world().getByTile(tile);

  return {
    owners: () => [player()],
    owns: (other) => other === player(),
    primary: () => player(),
    tile,
    world,
    payload: (omitActions) =>
      omitActions ? playerWithoutActions(player()) : player(),
    member: (other) => other,
    hasSeen: (seen) => Boolean(tile(seen)),
    hasMet: (other) => hasMet(player(), other, dependencies),
  };
};

export default playerView;
