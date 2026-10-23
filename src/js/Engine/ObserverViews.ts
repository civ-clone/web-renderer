import Player from '@civ-clone/core-player/Player';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Tile from '@civ-clone/core-world/Tile';
import World from '@civ-clone/core-world/World';
import { View, ViewDependencies } from './Client/View';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import hasMet from './lib/hasMet';
import playerStandIn from './lib/playerStandIn';
import { omittedActions } from './lib/playerWithoutActions';

/** What the observer is asked to show (#613): some civilisations' worlds together, or the whole map. */
export type ObserverChoice =
  | { kind: 'players'; playerIds: string[] }
  | { kind: 'world' };

/** A view the observer built, and what undoes it. */
export type ObserverView = {
  view: View;
  dispose: () => void;
};

// A `PlayerWorld` of the view's own, never registered, so it reaches no save and no rule: its rules are none, and its
//  squares' yields are the primary player's.
const privateWorld = (
  primary: Player,
  world: World,
  tiles: Tile[]
): PlayerWorld => {
  const playerWorld = new PlayerWorld(primary, world, new RuleRegistry());

  playerWorld.register(...tiles);

  return playerWorld;
};

const knownAt = (playerWorld: PlayerWorld, tile: Tile): PlayerTile | null => {
  const known = playerWorld.get(tile.x(), tile.y());

  return known instanceof PlayerTile ? known : null;
};

// The payload's player: the primary with the view's world in place of its own, once with its actions and once without.
const payloads = (
  primary: Player,
  playerWorld: PlayerWorld,
  more: { [key: string]: () => unknown } = {}
) => {
  const data = { world: () => playerWorld, ...more },
    full = playerStandIn(primary, { data }),
    withoutActions = playerStandIn(primary, { data, omit: omittedActions });

  return (omitActions: boolean): Player =>
    omitActions ? withoutActions : full;
};

// The other members, each with the view's world in place of its own, so that no member's world goes out twice
//  (#328); made once each.
const memberStandIns = (members: Player[], playerWorld: PlayerWorld) => {
  const standIns = new Map<Player, Player>(
    members.map((member) => [
      member,
      playerStandIn(member, { data: { world: () => playerWorld } }),
    ])
  );

  return (member: Player): Player => standIns.get(member) ?? member;
};

/**
 * Several civilisations' worlds as one (#613): every square any of them knows, their units and cities in full, and
 * the first of them as the primary whose research, treasury and government the page shows. Kept up as each of them
 * sees more, ahead of the client's own listener, which is registered after this one and looks the square up here.
 */
export const unionView = (
  members: Player[],
  dependencies: ViewDependencies
): ObserverView => {
  const [primary] = members,
    registered = members.map((member) =>
      dependencies.playerWorlds.getByPlayer(member)
    ),
    world = registered[0].entries()[0].tile().map(),
    playerWorld = privateWorld(
      primary,
      world,
      registered.flatMap((memberWorld) =>
        memberWorld.entries().map((playerTile) => playerTile.tile())
      )
    ),
    payload = payloads(primary, playerWorld),
    member = memberStandIns(members.slice(1), playerWorld),
    seen = (tile: Tile, player: Player): void => {
      if (members.includes(player) && !playerWorld.includes(tile)) {
        playerWorld.register(tile);
      }
    };

  engine.on('player:visibility-changed', seen);

  return {
    view: {
      owners: () => members,
      owns: (player) => members.includes(player),
      primary: () => primary,
      tile: (tile) => knownAt(playerWorld, tile),
      world: () => playerWorld,
      payload,
      member,
      hasSeen: (tile) => playerWorld.includes(tile),
      hasMet: (other) =>
        members.some((member) => hasMet(member, other, dependencies)),
    },
    dispose: () => engine.off('player:visibility-changed', seen),
  };
};

/**
 * The whole map (#613): every square known, nobody's units or cities in full (they show as the stand-ins any seen
 * foreign unit or city does), everyone met. The primary is only what shapes the payload.
 */
export const worldView = (
  primary: Player,
  dependencies: ViewDependencies
): ObserverView => {
  const world = dependencies.playerWorlds
      .getByPlayer(primary)
      .entries()[0]
      .tile()
      .map(),
    playerWorld = privateWorld(primary, world, world.entries()),
    // Nobody's own: the primary's units and cities go as everyone else's do, on their squares, and not as its own.
    payload = payloads(primary, playerWorld, {
      units: () => [],
      cities: () => [],
    });

  return {
    view: {
      owners: () => [],
      owns: () => false,
      primary: () => primary,
      tile: (tile) => knownAt(playerWorld, tile),
      world: () => playerWorld,
      payload,
      member: (player) => player,
      hasSeen: () => true,
      hasMet: () => true,
    },
    dispose: () => {},
  };
};
