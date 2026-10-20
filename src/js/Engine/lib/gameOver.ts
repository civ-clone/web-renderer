import {
  FAMOUS_LEADERS,
  famousLeader,
  rating,
} from '@civ-clone/civ1-game-end/lib/scoring';
import { CivilizationScore } from './civilizationScore';
import GameResult from '@civ-clone/core-turn-based-game/GameResult';
import Player from '@civ-clone/core-player/Player';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

// How the game ended, for the player's ending window (#176): worked out in the worker, so the UI only draws it.

// A civilization as the window names it: its civilization and leader, by type name, for the UI to translate.
export type GameOverCivilization = {
  civilization: string;
  leader: string | null;
};

export type GameOverDetails = {
  // The result's, so the Hall of Fame records each game once however often the window opens (#179).
  id: string;
  reason: string;
  you: GameOverCivilization;
  // `null` when no one won: the date, retiring, your civilization destroyed. `known` is false for a civilization
  //  you never met, which the window doesn't name.
  winner: (GameOverCivilization & { you: boolean; known: boolean }) | null;
  turn: number;
  year: number;
  difficulty: string | null;
  // None when your civilization was destroyed: there is no score, rating or Hall of Fame then.
  score: CivilizationScore | null;
  rating: number | null;
  // Which famous leader the rating exceeds (`FAMOUS_LEADERS`), or `null` for a rating of 0.
  famousLeader: string | null;
  // Your latest discovery, which the archeologists name when your civilization is destroyed.
  discovery: string | null;
  scoringComplete: boolean;
  // Every ending but your own destruction can be played on from.
  keepPlaying: boolean;
};

const civilizationOf = (player: Player): GameOverCivilization => {
  const leader = player.civilization().leader();

  return {
    civilization: typeNameOf(player.civilization().sourceClass()),
    leader: leader === null ? null : typeNameOf(leader.sourceClass()),
  };
};

export const gameOverDetails = (
  gameResult: GameResult,
  player: Player,
  {
    difficulty,
    discovery,
    hasMet,
    level,
    score,
    year,
  }: {
    difficulty: string | null;
    discovery: string | null;
    hasMet: (player: Player) => boolean;
    level: number;
    score: CivilizationScore;
    year: number;
  }
): GameOverDetails => {
  const destroyed = gameResult.reason() === 'destroyed',
    winner = gameResult.winner(),
    ratingValue = destroyed ? null : rating(score.total, level),
    leaderIndex = ratingValue === null ? null : famousLeader(ratingValue);

  return {
    id: gameResult.id(),
    reason: gameResult.reason(),
    you: civilizationOf(player),
    winner:
      winner === null
        ? null
        : {
            ...civilizationOf(winner),
            you: winner === player,
            known: winner === player || hasMet(winner),
          },
    turn: gameResult.turn(),
    year,
    difficulty,
    score: destroyed ? null : score,
    rating: ratingValue,
    famousLeader: leaderIndex === null ? null : FAMOUS_LEADERS[leaderIndex],
    discovery: destroyed ? discovery : null,
    scoringComplete: gameResult.scoringComplete(),
    keepPlaying: !destroyed,
  };
};

export default gameOverDetails;
