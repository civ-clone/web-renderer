// What a person's Diplomat or Spy is told before a mission under Civ2's rules (M2d part 2, #1007): what a Spy may aim a
//  theft or a sabotage at, and what a mission would do to a treaty.

import {
  InteractionRegistry,
  instance as interactionRegistryInstance,
} from '@civ-clone/core-diplomacy/InteractionRegistry';
import {
  TreatyLevel,
  treatyLevel,
} from '@civ-clone/base-diplomacy/lib/treatyLevel';
import {
  SneakIndustrialSabotage,
  SneakPoisonWater,
} from '@civ-clone/civ2-unit/lib/SneakMissions';
import Action from '@civ-clone/core-unit/Action';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import InciteRevolt from '@civ-clone/base-unit-action-incite-revolt/InciteRevolt';
import IndustrialSabotage from '@civ-clone/base-unit-action-industrial-sabotage/IndustrialSabotage';
import PoisonWater from '@civ-clone/base-unit-action-poison-water/PoisonWater';
import SneakStealTechnology from '@civ-clone/base-unit-action-steal-technology/SneakStealTechnology';
import StealTechnology from '@civ-clone/base-unit-action-steal-technology/StealTechnology';
import SubvertCity from '@civ-clone/base-unit-action-incite-revolt/SubvertCity';
import { targetName } from '@civ-clone/base-unit-agent/lib/mission';

/**
 * What a treaty comes to if a person goes ahead with a mission, as the incite window and the treaty warning word it:
 *  - `incident-if-lost`: a theft, sabotage or poisoning under a treaty (civ2-unit's `Sneak` rows) breaks nothing
 *    itself, but an agent lost after it causes an incident (civ2-diplomacy's `AgentLost` rule);
 *  - `treaty-ends`: inciting at the plain price under a treaty brings an incident and a war (civ2-diplomacy's
 *    `incited`);
 *  - `treaty-kept`: inciting at the doubled price keeps the treaty, but the city's owner holds a vendetta.
 */
export type MissionConsequence =
  | 'incident-if-lost'
  | 'treaty-ends'
  | 'treaty-kept';

/**
 * What a Spy may choose to steal or sabotage (civ2-unit's `MissionTargets`), by name: an advance's or a building's type
 *  name, or `production`. Sent back as the action's `choice`, which the action reads by name (base-unit-agent's
 *  `chosenTarget`). Empty when it has no choice: a Diplomat, a computer player's agent, a city already robbed.
 */
const targets = (Type: typeof StealTechnology | typeof IndustrialSabotage) =>
  new AdditionalData(
    Type,
    'targets',
    (action: StealTechnology | IndustrialSabotage): string[] =>
      action
        .targets()
        .map((target: unknown): string | null => targetName(target))
        .filter((name): name is string => name !== null)
  );

export const missionTargets = (): AdditionalData[] => [
  targets(StealTechnology),
  targets(IndustrialSabotage),
];

/** `MissionConsequence` of `action`, or `null` when it changes no treaty. */
export const consequenceOf = (
  action: Action,
  interactionRegistry: InteractionRegistry = interactionRegistryInstance
): MissionConsequence | null => {
  if (
    action instanceof SneakStealTechnology ||
    action instanceof SneakIndustrialSabotage ||
    action instanceof SneakPoisonWater
  ) {
    return 'incident-if-lost';
  }

  if (action instanceof SubvertCity) {
    return 'treaty-kept';
  }

  if (
    action instanceof InciteRevolt &&
    treatyLevel(
      { interactionRegistry },
      action.unit().player(),
      action.city().player()
    ) >= TreatyLevel.Ceasefire
  ) {
    return 'treaty-ends';
  }

  return null;
};

export const missionConsequences = (
  interactionRegistry: InteractionRegistry = interactionRegistryInstance
): AdditionalData[] =>
  [StealTechnology, IndustrialSabotage, PoisonWater, InciteRevolt].map(
    (Type) =>
      new AdditionalData(
        Type,
        'consequence',
        (action: Action): MissionConsequence | null =>
          consequenceOf(action, interactionRegistry)
      )
  );
