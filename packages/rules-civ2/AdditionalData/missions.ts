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
import {
  PlayerGovernmentRegistry,
  instance as playerGovernmentRegistryInstance,
} from '@civ-clone/core-government/PlayerGovernmentRegistry';
import Action from '@civ-clone/core-unit/Action';
import Fundamentalism from '@civ-clone/base-government-fundamentalism/Fundamentalism';
import PlantNuclearDevice from '@civ-clone/base-unit-action-plant-nuclear-device/PlantNuclearDevice';
import Player from '@civ-clone/core-player/Player';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import dependenciesOf from '@civ-clone/civ2-diplomacy/lib/dependenciesOf';
import { isSpy } from '@civ-clone/civ2-unit/lib/espionage';
import { senateGovernment } from '@civ-clone/civ2-diplomacy/lib/senate';
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
 *  - `incident-if-lost`: a Spy's theft, sabotage or poisoning under a treaty (civ2-unit's `Sneak` rows) breaks nothing
 *    itself, but a Spy lost after it causes an incident (civ2-diplomacy's `AgentLost` rule);
 *  - `incident-certain`: the same by a Diplomat, which is always used up, so the incident is certain;
 *  - `treaty-ends`: inciting at the plain price under a treaty brings an incident and a war (civ2-diplomacy's
 *    `incited`);
 *  - `treaty-kept`: inciting at the doubled price keeps the treaty, but the city's owner holds a vendetta;
 *  - `device-may-be-found`: a planted nuclear device may be found out, and every civilization in contact with its
 *    planter go to war with it (never a Fundamentalist's, `civ2-unit`'s `deviceDiscovered`).
 */
export type MissionConsequence =
  | 'incident-if-lost'
  | 'incident-certain'
  | 'treaty-ends'
  | 'treaty-kept'
  | 'device-may-be-found';

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
  interactionRegistry: InteractionRegistry = interactionRegistryInstance,
  playerGovernmentRegistry: PlayerGovernmentRegistry = playerGovernmentRegistryInstance
): MissionConsequence | null => {
  if (
    action instanceof SneakStealTechnology ||
    action instanceof SneakIndustrialSabotage ||
    action instanceof SneakPoisonWater
  ) {
    return isSpy(action.unit()) ? 'incident-if-lost' : 'incident-certain';
  }

  if (action instanceof PlantNuclearDevice) {
    try {
      return playerGovernmentRegistry
        .getByPlayer(action.unit().player())
        .is(Fundamentalism)
        ? null
        : 'device-may-be-found';
    } catch (e) {
      return 'device-may-be-found';
    }
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

/**
 * Whether the incident a mission may cause could bring `player`'s government down: under a Republic or Democracy, whose
 *  Senate has its scandal (civ2-diplomacy's `senateScandal`) when a person's incident breaks a treaty.
 */
export const senateMayFall = (player: Player): boolean =>
  senateGovernment(dependenciesOf(defaultGame), player) !== 'none';

const missionTypes = [
  StealTechnology,
  IndustrialSabotage,
  PoisonWater,
  InciteRevolt,
  PlantNuclearDevice,
];

export const missionConsequences = (
  interactionRegistry: InteractionRegistry = interactionRegistryInstance
): AdditionalData[] => [
  ...missionTypes.map(
    (Type) =>
      new AdditionalData(
        Type,
        'consequence',
        (action: Action): MissionConsequence | null =>
          consequenceOf(action, interactionRegistry)
      )
  ),
  // `scandal`: whether the treaty the mission may break could bring the government down with it.
  ...missionTypes.map(
    (Type) =>
      new AdditionalData(Type, 'scandal', (action: Action): boolean => {
        const consequence = consequenceOf(action, interactionRegistry);

        return (
          (consequence === 'incident-if-lost' ||
            consequence === 'incident-certain' ||
            consequence === 'treaty-ends') &&
          senateMayFall(action.unit().player())
        );
      })
  ),
];
