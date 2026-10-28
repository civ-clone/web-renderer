// The scores in the sidebar (#701): every civilization still in the game ranked by its Civilization Score (#149),
//  worked out in the worker so the UI only ever sees the finished rows.

import { GameResultRegistry } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import Player from '@civ-clone/core-player/Player';
import { PlayerWorldRegistry } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { PlayerRegistry } from '@civ-clone/core-player/PlayerRegistry';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import conquestBonusFor from '@civ-clone/civ1-game-end/lib/conquestBonusFor';
import { score } from '@civ-clone/core-score/lib/score';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

// One row as the UI gets it. Nothing in it identifies an unmet civilization: no id, and no name or colours, only its
//  place and its score.
export type CivilizationScoresRow = {
  rank: number;
  score: number;
  // A row of the view's own: the player's, a watched group's members (#607), nobody's when watching the whole map.
  own: boolean;
  // Only for the player's own civilization and those it has met.
  civilization: string | null;
  colors: [string, string] | null;
};

export type CivilizationScoresDependencies = {
  // A defeated player is unregistered, so these are the civilizations still in the game.
  players: Pick<PlayerRegistry, 'entries'>;
  rules: RuleRegistry;
  hasMet: (player: Player) => boolean;
  // Whose rows are the view's own. The reader's alone, unless the view says otherwise (`ClientView.owns`).
  owns?: (player: Player) => boolean;
  // For the conquest bonus (#176), which the score shows when it's the higher, as the Civilization Score report does.
  gameResults: GameResultRegistry;
  playerWorlds: PlayerWorldRegistry;
};

// The total `civilizationScore` reports: the terms' sum, or the conquest bonus when that's higher.
const totalFor = (
  player: Player,
  { rules, gameResults, playerWorlds }: CivilizationScoresDependencies
): number => {
  const bonus = conquestBonusFor(player, gameResults, playerWorlds),
    total = score(player, rules);

  return bonus === null ? total : Math.max(total, bonus);
};

// Highest first. The sort is stable, so on a tie the civilization that joined the game first stays ahead.
export const civilizationScoresRows = (
  reader: Player,
  dependencies: CivilizationScoresDependencies
): CivilizationScoresRow[] =>
  dependencies.players
    .entries()
    // Never the barbarians (#169), as the intelligence report leaves them out.
    .filter((player) => !isBarbarian(player))
    .map((player) => ({ player, score: totalFor(player, dependencies) }))
    .sort((a, b) => b.score - a.score)
    .map(({ player, score }, index) => {
      const own = dependencies.owns
          ? dependencies.owns(player)
          : player === reader,
        known = own || dependencies.hasMet(player),
        colors = known
          ? player
              .civilization()
              .attributes()
              .find((attribute) => attribute.name() === 'colors')
          : undefined;

      return {
        rank: index + 1,
        score,
        own,
        civilization: known
          ? typeNameOf(player.civilization().sourceClass())
          : null,
        colors: colors ? (colors.value() as [string, string]) : null,
      };
    });

export default civilizationScoresRows;
