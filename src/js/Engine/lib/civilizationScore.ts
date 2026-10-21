// The Civilization Score (#149), worked out in the worker by the engine's `Score` rules, so the UI only draws it.

import { score, scoreTerms } from '@civ-clone/core-score/lib/score';
import { GameResultRegistry } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import Player from '@civ-clone/core-player/Player';
import { PlayerWorldRegistry } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import conquestBonusFor from '@civ-clone/civ1-game-end/lib/conquestBonusFor';

// One line of the score: a stable term name, such as `citizens`, and its points.
export type CivilizationScoreTerm = {
  term: string;
  value: number;
};

export type CivilizationScore = {
  terms: CivilizationScoreTerm[];
  // The conquest bonus, when you conquered the world (#176). It replaces the terms' sum when it's higher, as the
  //  total shows.
  bonus: number | null;
  total: number;
  // Once you keep playing after the game has ended, the score is final: Civ1 shows "SCORING COMPLETED".
  scoringComplete: boolean;
};

export type CivilizationScoreDependencies = {
  gameResults: GameResultRegistry;
  playerWorlds: PlayerWorldRegistry;
  rules: RuleRegistry;
};

export const civilizationScore = (
  player: Player,
  { gameResults, playerWorlds, rules }: CivilizationScoreDependencies
): CivilizationScore => {
  const gameResult = gameResults.get(),
    bonus = conquestBonusFor(player, gameResults, playerWorlds),
    total = score(player, rules);

  return {
    terms: scoreTerms(player, rules).map(({ term, value }) => ({
      term,
      value,
    })),
    bonus,
    // v474.05 shows the conquest bonus as the score when it's the higher.
    total: bonus === null ? total : Math.max(total, bonus),
    scoringComplete: gameResult?.scoringComplete() ?? false,
  };
};
