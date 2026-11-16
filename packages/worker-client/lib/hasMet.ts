// Whether one player has met another, for naming them in a notification or a report (#59), worked out from the
//  registries it is given so it can be checked with plain data.

import City from '@civ-clone/core-city/City';
import { CityRegistry } from '@civ-clone/core-city/CityRegistry';
import { InteractionRegistry } from '@civ-clone/core-diplomacy/InteractionRegistry';
import Player from '@civ-clone/core-player/Player';
import { PlayerWorldRegistry } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import RelationRecord from '@civ-clone/core-diplomacy/Records/RelationRecord';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import { currentWorkerRules } from '../workerRules';
import { hasEmbassy } from '@civ-clone/base-diplomacy/lib/embassy';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';

export type HasMetDependencies = {
  interactions: Pick<InteractionRegistry, 'getByPlayers'>;
  cities: Pick<CityRegistry, 'entries'>;
  playerWorlds: Pick<PlayerWorldRegistry, 'getByPlayer'>;
  // The rules, for an embassy one of them gives (`HasEmbassy`: a Wonder that is an embassy with everyone). Without
  //  them, only an embassy a Diplomat established counts.
  rules?: RuleRegistry;
  // Whether having seen a city they hold or founded is meeting them. The rule set's (`WorkerRules.seenCityMeets`) when
  //  not given.
  seenCityMeets?: boolean;
};

// Any dealings between us: a negotiation, a declaration, a contact or an embassy, but not one of the records the rules
//  keep about a pair (how one feels about the other, its patience, the turn they last met: `RelationRecord`s), which
//  can be kept before they've met (#1067). An embassy either of the rules gives counts, as it shows them everything
//  (`HasEmbassy`). And, under rules where it counts (Civ1's), having seen a city they hold or founded: the founder
//  counts because a defeated player holds no cities by the time we are told. Civ2's don't: there, the Apollo Program
//  shows every city without anyone meeting (#1067).
export const hasMet = (
  self: Player,
  other: Player,
  {
    interactions,
    cities,
    playerWorlds,
    rules,
    seenCityMeets = currentWorkerRules()?.seenCityMeets ?? true,
  }: HasMetDependencies
): boolean => {
  if (other === self) {
    return true;
  }

  // Everyone knows the barbarians (#169): a notice never calls them an unknown civilization.
  if (isBarbarian(other)) {
    return true;
  }

  if (
    interactions
      .getByPlayers(self, other)
      .some((interaction) => !(interaction instanceof RelationRecord))
  ) {
    return true;
  }

  if (
    rules !== undefined &&
    hasEmbassy(
      {
        interactionRegistry: interactions as InteractionRegistry,
        ruleRegistry: rules,
      },
      self,
      other
    )
  ) {
    return true;
  }

  if (!seenCityMeets) {
    return false;
  }

  const playerWorld = playerWorlds.getByPlayer(self);

  return cities
    .entries()
    .some(
      (city: City) =>
        (city.player() === other || city.originalPlayer() === other) &&
        playerWorld.getByTile(city.tile()) !== null
    );
};

export default hasMet;
