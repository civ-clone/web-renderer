import {
  PlayerRegistry,
  instance as playerRegistryInstance,
} from '@civ-clone/core-player/PlayerRegistry';
import {
  RuleRegistry,
  instance as ruleRegistryInstance,
} from '@civ-clone/core-rule/RuleRegistry';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import Civilization from '@civ-clone/core-civilization/Civilization';
import Player from '@civ-clone/core-player/Player';
import { leaderTitle as leaderTitleOf } from '../lib/relations';

/**
 * What a civilization's leader is called under its player's government (civ2-civilization's `LeaderTitle` rules), as a
 *  translation key, wherever its civilization is sent: with the player's own data and with every other player, as the
 *  original names a leader by title in the talks and the foreign minister's list without an embassy. `null` for a
 *  civilization no player has.
 */
export const leaderTitle = (
  players: PlayerRegistry = playerRegistryInstance,
  rules: RuleRegistry = ruleRegistryInstance
): AdditionalData =>
  new AdditionalData(
    Civilization,
    'leaderTitle',
    (civilization: Civilization): string | null => {
      const player = players
        .entries()
        .find((candidate: Player) => candidate.civilization() === civilization);

      return player === undefined ? null : leaderTitleOf(player, rules);
    }
  );

export default leaderTitle;
