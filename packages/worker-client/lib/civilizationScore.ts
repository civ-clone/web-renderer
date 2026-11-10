// The Civilization Score (#149), worked out in the worker by the engine's `Score` rules, so the UI only draws it.

import { score, scoreTerms } from '@civ-clone/core-score/lib/score';
import { GameResultRegistry } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import Player from '@civ-clone/core-player/Player';
import { PlayerWorldRegistry } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import { CivilizationScore } from '@civ-clone/ui-protocol/reports';
import { workerRules } from '../workerRules';

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
    bonus = workerRules().conquestBonus(player, gameResults, playerWorlds),
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
