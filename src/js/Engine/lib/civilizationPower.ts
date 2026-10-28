// The sidebar's Power list (#701, #708): every civilization still in the game ranked by v474.05's ranking score, the
//  one the AI's diplomacy weighs rivals by (`civ1-power`: gold, citizens, advances and units), worked out in the
//  worker so the UI only ever sees the finished rows. Not the Civilization Score: its pollution term takes the same
//  off everyone, which leaves most rivals at 0 once one civilization pollutes.

import Player from '@civ-clone/core-player/Player';
import { PlayerRegistry } from '@civ-clone/core-player/PlayerRegistry';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import { rank } from '@civ-clone/core-power/lib/rank';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

// One row as the UI gets it. Nothing in it identifies an unmet civilization: no id, and no name or colours, only its
//  place and its power.
export type CivilizationPowerRow = {
  rank: number;
  power: number;
  // A row of the view's own: the player's, a watched group's members (#607), nobody's when watching the whole map.
  own: boolean;
  // Only for the player's own civilization and those it has met.
  civilization: string | null;
  colors: [string, string] | null;
};

export type CivilizationPowerDependencies = {
  // A defeated player is unregistered, so these are the civilizations still in the game.
  players: Pick<PlayerRegistry, 'entries'>;
  rules: RuleRegistry;
  hasMet: (player: Player) => boolean;
  // Whose rows are the view's own. The reader's alone, unless the view says otherwise (`ClientView.owns`).
  owns?: (player: Player) => boolean;
};

// Highest first. The sort is stable, so on a tie the civilization that joined the game first stays ahead.
export const civilizationPowerRows = (
  reader: Player,
  dependencies: CivilizationPowerDependencies
): CivilizationPowerRow[] =>
  dependencies.players
    .entries()
    // Never the barbarians (#169), as the intelligence report leaves them out.
    .filter((player) => !isBarbarian(player))
    .map((player) => ({ player, power: rank(player, dependencies.rules) }))
    .sort((a, b) => b.power - a.power)
    .map(({ player, power }, index) => {
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
        power,
        own,
        civilization: known
          ? typeNameOf(player.civilization().sourceClass())
          : null,
        colors: colors ? (colors.value() as [string, string]) : null,
      };
    });

export default civilizationPowerRows;
