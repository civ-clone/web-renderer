import {
  RuleRegistry,
  instance as ruleRegistryInstance,
} from '@civ-clone/core-rule/RuleRegistry';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import { playerAge } from '@civ-clone/base-science-age/lib/ageOf';

/**
 * The age a player is in (#1076), by name, from the rule set's `AgeOf` rules, or `null` under rules with no ages (or
 *  with them switched off). Sent with the player's own research, for the empire block.
 */
export const age = (
  ruleRegistry: RuleRegistry = ruleRegistryInstance
): AdditionalData =>
  new AdditionalData(
    PlayerResearch,
    'age',
    (playerResearch: PlayerResearch): string | null =>
      playerAge(playerResearch, ruleRegistry)?.name ?? null
  );

export default age;
