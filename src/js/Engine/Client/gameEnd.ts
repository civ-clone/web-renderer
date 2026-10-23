// How the game ends for the player (#449), moved out of `DataTransferClient`: Game → Retire and keeping playing, the
//  ending window sent whenever the game ends (or a saved game that had ended loads), our own destruction as an ending,
//  and the details the window shows. Another civilization's destruction is told in `notifications/player.ts`.

import Advance from '@civ-clone/core-science/Advance';
import Engine from '@civ-clone/core-engine/Engine';
import GameResult from '@civ-clone/core-turn-based-game/GameResult';
import Player from '@civ-clone/core-player/Player';
import endGame from '@civ-clone/core-turn-based-game/lib/endGame';
import { levelOf } from '@civ-clone/civ1-difficulty/level';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import { ClientContext, Disposer, Registries } from './ClientContext';
import { TransportDisposer } from '../Transport';
import { GameOverDetails, gameOverDetails } from '../lib/gameOver';

export type GameEndContext = Pick<
  ClientContext,
  | 'player'
  // Which players are our own.
  | 'view'
  // What the ending window is sent on.
  | 'transport'
  // Whether we have met a player, which says whether the window names the winner.
  | 'hasMet'
  // Our Civilization Score, as `civilizationScore` sends it.
  | 'civilizationScore'
  // Each handed whole to the difficulty's level or to `endGame`.
  | 'difficulties'
  | 'gameResults'
  | 'rules'
  | 'turn'
> &
  Registries<{ playerResearches: 'getByPlayer'; year: 'value' }>;

// How the game ended, for the ending window (#176).
export const gameOver = (
  ctx: GameEndContext,
  gameResult: GameResult
): GameOverDetails => {
  const difficulty = ctx.difficulties.get();

  let discoveries: Advance[] = [];

  try {
    discoveries = ctx.playerResearches.getByPlayer(ctx.player()).complete();
  } catch (e) {
    // A player with no research (yet) has discovered nothing.
  }

  return gameOverDetails(gameResult, ctx.player(), {
    difficulty: difficulty === null ? null : typeNameOf(difficulty),
    discovery:
      discoveries.length === 0
        ? null
        : typeNameOf(discoveries[discoveries.length - 1].sourceClass()),
    hasMet: (player: Player) => ctx.hasMet(player),
    level: levelOf(ctx.difficulties),
    score: ctx.civilizationScore(),
    year: ctx.year.value(gameResult.turn()),
  });
};

// The `retire` and `gameContinue` receivers, then the `game:over`, `game:loaded` and `player:defeated` listeners, in
//  that order.
export const registerGameEnd = (
  engine: Pick<Engine, 'on' | 'off' | 'emit'>,
  ctx: GameEndContext,
  // An observer's client (#607) is told how the game ended, but can neither retire nor keep playing.
  { readOnly = false }: { readOnly?: boolean } = {}
): Disposer => {
  const { transport } = ctx,
    disposers: TransportDisposer[] = [],
    listeners: [string, (...args: any[]) => void][] = [],
    on = (event: string, listener: (...args: any[]) => void): void => {
      engine.on(event, listener);

      listeners.push([event, listener]);
    };

  // Game → Retire: the game ends now, with your score (#176, #362).
  //  Once the game has ended, the ending shows again instead.
  if (!readOnly) {
    disposers.push(
      transport.receive('retire', () => {
        const gameResult =
          endGame('retired', null, ctx.gameResults, ctx.rules, ctx.turn) ??
          ctx.gameResults.get();

        // A new result has already been sent, by `game:over`.
        if (gameResult !== null && gameResult.scoringComplete()) {
          transport.send('gameOver', gameOver(ctx, gameResult));
        }
      })
    );

    // Keep playing after the game has ended: the score is final, and a turn loop waiting at the end of the turn goes
    //  on (#176).
    disposers.push(
      transport.receive('gameContinue', () => {
        const gameResult = ctx.gameResults.get();

        if (gameResult === null || gameResult.reason() === 'destroyed') {
          return;
        }

        gameResult.completeScoring();

        engine.emit('game:continue');
      })
    );
  }

  // However the game ends, the ending window says so (#176). Our own destruction is one of the endings.
  on('game:over', (gameResult: GameResult) =>
    transport.send('gameOver', gameOver(ctx, gameResult))
  );

  // A game saved after it ended, and before the players chose to keep playing, ends again as it loads.
  on('game:loaded', () => {
    const gameResult = ctx.gameResults.get();

    if (gameResult !== null && !gameResult.scoringComplete()) {
      transport.send('gameOver', gameOver(ctx, gameResult));
    }
  });

  // Our destruction is the game's end. Another civilization's is told in `notifications/player.ts`.
  on('player:defeated', (defeatedPlayer: Player) => {
    // The ending window tells us (`game:over`). After you've kept playing from an earlier ending the game can't end
    //  again, so the destruction is sent as an ending of its own.
    if (ctx.view.owns(defeatedPlayer)) {
      const gameResult = ctx.gameResults.get();

      if (gameResult !== null && gameResult.scoringComplete()) {
        transport.send(
          'gameOver',
          gameOver(ctx, new GameResult('destroyed', null, ctx.turn.value()))
        );
      }
    }
  });

  return () => {
    disposers.forEach((dispose) => dispose());
    listeners.forEach(([event, listener]) => engine.off(event, listener));
  };
};

export default registerGameEnd;
