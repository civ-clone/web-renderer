import {
  CivilizationScore,
  GameOverCivilization,
  GameOverDetails,
} from '@civ-clone/ui-protocol/reports';
import GameResult from '@civ-clone/core-turn-based-game/GameResult';
import Player from '@civ-clone/core-player/Player';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import { workerRules } from '../workerRules';

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
    rated = destroyed ? null : workerRules().rating(score.total, level);

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
    rating: rated?.rating ?? null,
    famousLeader: rated?.famousLeader ?? null,
    discovery: destroyed ? discovery : null,
    scoringComplete: gameResult.scoringComplete(),
    keepPlaying: !destroyed,
  };
};

export default gameOverDetails;
