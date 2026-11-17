// The intelligence report (F3, #58), worked out in the worker so the UI only ever sees what the report shows: full
//  details for a civilization the player holds an embassy with, and for any other it has met only what the player
//  knows without one: its leader, and the player's own dealings with it (#419).

import { playerAge } from '@civ-clone/base-science-age/lib/ageOf';
import {
  CityImprovementRegistry,
  instance as cityImprovementRegistryInstance,
} from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import {
  CityRegistry,
  instance as cityRegistryInstance,
} from '@civ-clone/core-city/CityRegistry';
import {
  InteractionRegistry,
  instance as interactionRegistryInstance,
} from '@civ-clone/core-diplomacy/InteractionRegistry';
import {
  PlayerGovernmentRegistry,
  instance as playerGovernmentRegistryInstance,
} from '@civ-clone/core-government/PlayerGovernmentRegistry';
import {
  PlayerRegistry,
  instance as playerRegistryInstance,
} from '@civ-clone/core-player/PlayerRegistry';
import {
  PlayerResearchRegistry,
  instance as playerResearchRegistryInstance,
} from '@civ-clone/core-science/PlayerResearchRegistry';
import {
  PlayerTreasuryRegistry,
  instance as playerTreasuryRegistryInstance,
} from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import {
  UnitRegistry,
  instance as unitRegistryInstance,
} from '@civ-clone/core-unit/UnitRegistry';
import { Year, instance as yearInstance } from '@civ-clone/core-game-year/Year';
import {
  RuleRegistry,
  instance as ruleRegistryInstance,
} from '@civ-clone/core-rule/RuleRegistry';
import {
  Turn,
  instance as turnInstance,
} from '@civ-clone/core-turn-based-game/Turn';
import {
  NormalAggression,
  NormalDevelopment,
  NormalMilitarism,
} from '@civ-clone/library-civilization/Traits';
import { RelationRegistries, currentWorkerRules } from '../workerRules';
import { Gold } from '@civ-clone/library-city/Yields';
import { Palace } from '@civ-clone/library-city/CityImprovements';
import { Peace } from '@civ-clone/library-diplomacy/Declarations';
import Player from '@civ-clone/core-player/Player';
import RelationRecord from '@civ-clone/core-diplomacy/Records/RelationRecord';
import { hasEmbassy as hasEmbassyWith } from '@civ-clone/base-diplomacy/lib/embassy';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import {
  IntelligenceDetails,
  IntelligenceRow,
  Treaty,
} from '@civ-clone/ui-protocol/reports';

export type IntelligenceDependencies = {
  cityImprovementRegistry: CityImprovementRegistry;
  cityRegistry: CityRegistry;
  interactionRegistry: InteractionRegistry;
  playerGovernmentRegistry: PlayerGovernmentRegistry;
  playerRegistry: PlayerRegistry;
  playerResearchRegistry: PlayerResearchRegistry;
  playerTreasuryRegistry: PlayerTreasuryRegistry;
  unitRegistry: UnitRegistry;
  year: Year;
  // The rules, for an embassy one of them gives (`HasEmbassy`) and the rule set's relations; and the turn, which they
  //  read too.
  ruleRegistry: RuleRegistry;
  turn: Turn;
};

const defaultDependencies: IntelligenceDependencies = {
  cityImprovementRegistry: cityImprovementRegistryInstance,
  cityRegistry: cityRegistryInstance,
  interactionRegistry: interactionRegistryInstance,
  playerGovernmentRegistry: playerGovernmentRegistryInstance,
  playerRegistry: playerRegistryInstance,
  playerResearchRegistry: playerResearchRegistryInstance,
  playerTreasuryRegistry: playerTreasuryRegistryInstance,
  unitRegistry: unitRegistryInstance,
  year: yearInstance,
  ruleRegistry: ruleRegistryInstance,
  turn: turnInstance,
};

const civilizationOf = (player: Player): string =>
  typeNameOf(player.civilization().sourceClass());

// Whether `holder` has an embassy with `host`: one a Diplomat established, or one a rule gives (base-diplomacy's
//  `hasEmbassy`: Marco Polo's Embassy and the United Nations in Civ2). One way, as an embassy is.
export const hasEmbassy = (
  holder: Player,
  host: Player,
  interactionRegistry: InteractionRegistry = interactionRegistryInstance,
  ruleRegistry: RuleRegistry | undefined = undefined
): boolean =>
  hasEmbassyWith({ interactionRegistry, ruleRegistry }, holder, host);

// The dealings between the two: not the records the rules keep about a pair (how one feels toward the other, its
//  patience), which aren't dealings and can be kept before they've met (#1067).
const dealings = (
  player: Player,
  other: Player,
  interactionRegistry: InteractionRegistry
) =>
  interactionRegistry
    .getByPlayers(player, other)
    .filter((interaction) => !(interaction instanceof RelationRecord));

// At peace while a `Peace` between the two is in force; otherwise at war, as v474.05 has it for any two who have met.
const atPeace = (
  player: Player,
  other: Player,
  interactionRegistry: InteractionRegistry
): boolean =>
  interactionRegistry
    .getByPlayers(player, other)
    .some(
      (interaction) =>
        interaction instanceof Peace && (interaction as Peace).active()
    );

const relationRegistries = ({
  interactionRegistry,
  ruleRegistry,
  turn,
}: IntelligenceDependencies): RelationRegistries => ({
  interactionRegistry,
  ruleRegistry,
  turn,
});

// Where the two stand: as the rule set has it, and otherwise as v474.05 has it, at peace or at war.
const treatyOf = (
  player: Player,
  other: Player,
  dependencies: IntelligenceDependencies
): Treaty => {
  const treaty = currentWorkerRules()?.treaty;

  if (treaty) {
    return treaty(player, other, relationRegistries(dependencies));
  }

  return atPeace(player, other, dependencies.interactionRegistry)
    ? 'peace'
    : 'war';
};

// The earliest of the two's dealings: `when` is the turn it happened in.
const firstMet = (
  player: Player,
  other: Player,
  { interactionRegistry, year }: IntelligenceDependencies
): number | null => {
  const turns = dealings(player, other, interactionRegistry).map(
    (interaction) => interaction.when()
  );

  return turns.length === 0
    ? null
    : attempt(() => year.value(Math.min(...turns)), null);
};

const leaderOf = (player: Player): string | null => {
  const leader = player.civilization().leader();

  return leader === null ? null : typeNameOf(leader.sourceClass());
};

// Each lookup tolerates a player without the registry entry (as a test may make them) rather than throwing.
const attempt = <T>(lookup: () => T, fallback: T): T => {
  try {
    return lookup();
  } catch (e) {
    return fallback;
  }
};

const details = (
  reader: Player,
  subject: Player,
  hasMet: (player: Player) => boolean,
  dependencies: IntelligenceDependencies
): IntelligenceDetails => {
  const {
    cityImprovementRegistry,
    cityRegistry,
    interactionRegistry,
    playerGovernmentRegistry,
    playerRegistry,
    playerResearchRegistry,
    playerTreasuryRegistry,
    unitRegistry,
  } = dependencies;

  const leader = subject.civilization().leader(),
    capital = cityRegistry
      .getByPlayer(subject)
      .find((city) =>
        cityImprovementRegistry
          .getByCity(city)
          .some(
            (improvement) =>
              improvement instanceof Palace && !improvement.destroyed()
          )
      ),
    government = attempt(
      () => playerGovernmentRegistry.getByPlayer(subject).current(),
      null
    );

  return {
    traits: (leader?.traits() ?? [])
      .filter(
        (trait) =>
          !(
            trait instanceof NormalAggression ||
            trait instanceof NormalDevelopment ||
            trait instanceof NormalMilitarism
          )
      )
      .map((trait) => typeNameOf(trait.sourceClass())),
    capital: capital
      ? {
          name: capital.name(),
          civilization: civilizationOf(capital.originalPlayer()),
        }
      : null,
    government:
      government === null ? null : typeNameOf(government.sourceClass()),
    gold: attempt(
      () => playerTreasuryRegistry.getByPlayerAndType(subject, Gold).value(),
      0
    ),
    cities: cityRegistry.getByPlayer(subject).length,
    units: unitRegistry.getByPlayer(subject).length,
    // Every civilization the subject has dealt with, the player included, in the order they joined the game.
    foreignAffairs: playerRegistry
      .entries()
      .filter(
        (other) =>
          other !== subject &&
          dealings(subject, other, interactionRegistry).length > 0
      )
      .map((other) => ({
        civilization:
          other === reader || hasMet(other) ? civilizationOf(other) : null,
        treaty: treatyOf(subject, other, dependencies),
      })),
    advances: attempt(
      () =>
        playerResearchRegistry
          .getByPlayer(subject)
          .complete()
          // Keyed as every other screen keys an advance (its `_`, the class name), not by its `type`, which is
          //  `MonarchyAdvance` for the five that share a name with a government or improvement (#373).
          .map((advance) => advance.sourceClass().name),
      []
    ),
    reputation:
      currentWorkerRules()?.reputation?.(
        subject,
        relationRegistries(dependencies)
      ) ?? null,
    age: attempt(
      () =>
        playerAge(
          playerResearchRegistry.getByPlayer(subject),
          dependencies.ruleRegistry
        )?.name ?? null,
      null
    ),
  };
};

/** A row for each civilization `reader` has met, in the order they joined the game. Never the barbarians (#169). */
export const intelligenceRows = (
  reader: Player,
  hasMet: (player: Player) => boolean,
  dependencies: IntelligenceDependencies = defaultDependencies
): IntelligenceRow[] =>
  dependencies.playerRegistry
    .entries()
    .filter(
      (player) => player !== reader && !isBarbarian(player) && hasMet(player)
    )
    .map((player) => {
      const colors = player
        .civilization()
        .attributes()
        .find((attribute) => attribute.name() === 'colors');

      return {
        civilization: civilizationOf(player),
        colors: colors ? (colors.value() as [string, string]) : null,
        leader: leaderOf(player),
        leaderTitle:
          currentWorkerRules()?.leaderTitle?.(
            player,
            dependencies.ruleRegistry,
            dependencies.playerGovernmentRegistry
          ) ?? null,
        treaty: treatyOf(reader, player, dependencies),
        attitude:
          currentWorkerRules()?.attitude?.(
            player,
            reader,
            relationRegistries(dependencies)
          ) ?? null,
        theirEmbassy: hasEmbassy(
          player,
          reader,
          dependencies.interactionRegistry,
          dependencies.ruleRegistry
        ),
        firstMet: firstMet(reader, player, dependencies),
        details: hasEmbassy(
          reader,
          player,
          dependencies.interactionRegistry,
          dependencies.ruleRegistry
        )
          ? details(reader, player, hasMet, dependencies)
          : null,
        talks:
          currentWorkerRules()?.mayOpenTalks?.(
            reader,
            player,
            relationRegistries(dependencies)
          ) ?? false,
      };
    });
