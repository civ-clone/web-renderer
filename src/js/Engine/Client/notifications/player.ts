// What the client tells the player about players: research, the game's end drawing near, civilizations defeated and
//  arising, governments, spaceships and declarations (#449), moved out of `DataTransferClient`. What these events
//  change goes out as patches, which the client queues itself, before these.

import Advance from '@civ-clone/core-science/Advance';
import { Anarchy } from '@civ-clone/civ1-government/Governments';
import City from '@civ-clone/core-city/City';
import Declaration from '@civ-clone/core-diplomacy/Declaration';
import { NotificationContext, NotificationTable } from './NotificationContext';
import Notification from '../../Notification';
import Player from '@civ-clone/core-player/Player';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';

export const playerNotifications: NotificationTable = [
  [
    'player:research-complete',
    (
      ctx: NotificationContext,
      playerResearch: PlayerResearch,
      advance: Advance
    ) =>
      playerResearch.player() !== ctx.player()
        ? null
        : new Notification('Player.research-complete', {
            playerResearch,
            advance,
            // Which one this is, for an advance a player can hold more than one of (Future Technology 1, 2, …).
            number: playerResearch
              .complete()
              .filter(
                (known: Advance) => known instanceof advance.sourceClass()
              ).length,
          }),
  ],

  [
    'game:retirement-warning',
    (ctx: NotificationContext) =>
      new Notification('Game.retirement-warning', {
        player: ctx.player(),
      }),
  ],

  // Another civilization destroyed: our own destruction is the game's end, which the client sends itself. A
  //  civilization we have not met is neither named nor sent (#59).
  [
    'player:defeated',
    (
      ctx: NotificationContext,
      defeatedPlayer: Player,
      player: Player | null
    ) => {
      if (defeatedPlayer === ctx.player()) {
        return null;
      }

      const victor = player !== null && ctx.hasMet(player) ? player : null;

      return ctx.hasMet(defeatedPlayer)
        ? new Notification(
            victor === null ? 'Player.defeated.unknown' : 'Player.defeated.by',
            {
              defeatedPlayer,
              player: victor,
            }
          )
        : new Notification(
            victor === null
              ? 'Player.defeated.unmet'
              : 'Player.defeated.unmet-by',
            {
              player: victor,
            }
          );
    },
  ],

  // With the Pyramids there's no Anarchy, and the new government is chosen straight away.
  [
    'player:government:collapsed',
    (ctx: NotificationContext, player: Player, city: City) =>
      player !== ctx.player()
        ? null
        : new Notification(
            ctx.government(player).is(Anarchy)
              ? 'Player.government-collapsed'
              : 'Player.government-collapsed.pyramids',
            {
              city,
            }
          ),
  ],

  // A destroyed civilization comes back as a new one (#178). We haven't met the new one, so it isn't named (#59); the
  //  one it replaces is, if we knew it.
  [
    'player:respawned',
    (ctx: NotificationContext, player: Player, defeatedPlayer: Player) =>
      ctx.hasMet(defeatedPlayer)
        ? new Notification('Player.respawned', { defeatedPlayer }, true)
        : new Notification('Player.respawned.unmet', {}, true),
  ],

  [
    'player:spaceship:part-built',
    (ctx: NotificationContext, player: Player) =>
      ctx.player() === player
        ? null
        : ctx.hasMet(player)
        ? new Notification('Spaceship.part-built', {
            player,
          })
        : new Notification('Spaceship.part-built.unmet', {}),
  ],

  // A ship is lost when its civilization loses its capital or is destroyed (#177): one in flight returns to Earth, one
  //  being built is cancelled. News of a civilization we haven't met doesn't reach us.
  [
    'player:spaceship:lost',
    (ctx: NotificationContext, player: Player, launched: boolean) =>
      ctx.player() !== player && !ctx.hasMet(player)
        ? null
        : new Notification(
            launched ? 'Spaceship.returned' : 'Spaceship.cancelled',
            {
              player,
            }
          ),
  ],

  [
    'player:spaceship:landed',
    (ctx: NotificationContext, player: Player) =>
      ctx.player() !== player
        ? null
        : new Notification('Player.spaceship-landed', {
            player,
          }),
  ],

  [
    'player:declaration-expired',
    (ctx: NotificationContext, player: Player, declaration: Declaration) =>
      player !== ctx.player()
        ? null
        : new Notification('Player.declaration-expired', {
            player,
            declaration,
            enemy: declaration
              .players()
              .filter((declarationPlayer) => declarationPlayer !== player)[0],
          }),
  ],
];

export default playerNotifications;
