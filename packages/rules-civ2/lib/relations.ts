// Where two players stand under Civ2's rules (M2d, #1007), for the reports and the talks: the treaty between them
//  (base-diplomacy's levels, with a ceasefire and an alliance), how a computer player feels toward another as one of
//  civ2-diplomacy's nine bands, a player's reputation as the original's foreign minister words it (0 to 7), and what a
//  leader is called under their government (civ2-civilization's titles).

import {
  attitude as attitudes,
  attitudeLevel,
  reputation as reputations,
} from '@civ-clone/civ2-diplomacy/lib/relations';
import {
  PlayerGovernmentRegistry,
  instance as playerGovernmentRegistryInstance,
} from '@civ-clone/core-government/PlayerGovernmentRegistry';
import {
  treatyLevel,
  treatyName,
} from '@civ-clone/base-diplomacy/lib/treatyLevel';
import Player from '@civ-clone/core-player/Player';
import {
  RelationRegistries,
  Treaty,
} from '@civ-clone/ui-worker-client/workerRules';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import { leaderTitle as leaderTitleOf } from '@civ-clone/core-civilization/leaderTitle';

/** The treaty between `player` and `other`: war, contact (met, with neither), a ceasefire, peace or an alliance. */
export const treaty = (
  player: Player,
  other: Player,
  { interactionRegistry }: RelationRegistries
): Treaty =>
  treatyName(treatyLevel({ interactionRegistry }, player, other)) as Treaty;

/** How `holder` feels toward `toward`, as a band from 0, the warmest, to 8, or `null` while it has no attitude. */
export const attitude = (
  holder: Player,
  toward: Player,
  registries: RelationRegistries
): number | null => {
  const value = attitudes(registries).get(holder, toward);

  return value === undefined ? null : attitudeLevel(value);
};

/** `player`'s reputation, 0 the best, as the original's foreign minister words it: no worse than 7 (`reports.cpp:1786`). */
export const reputation = (
  player: Player,
  registries: RelationRegistries
): number =>
  Math.min(7, Math.max(0, Math.floor(reputations(registries).get(player))));

/** What `player`'s leader is called under its government, as a translation key, or `null`. */
export const leaderTitle = (
  player: Player,
  rules: RuleRegistry,
  playerGovernments: PlayerGovernmentRegistry = playerGovernmentRegistryInstance
): string | null => {
  try {
    const leader = player.civilization()?.leader(),
      government = playerGovernments.getByPlayer(player).current();

    return leader && government
      ? leaderTitleOf(leader, government, rules) ?? null
      : null;
  } catch (e) {
    // A player without a government yet (as a test may make one) has no title.
    return null;
  }
};
