// The intelligence report (F3, #58), worked out in the worker so the UI only ever sees what the report shows: full
//  details for a civilization the player holds an embassy with, and only the name of any other it has met.

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
import Embassy from '@civ-clone/base-unit-action-establish-embassy/Embassy';
import { Gold } from '@civ-clone/library-city/Yields';
import { Palace } from '@civ-clone/library-city/CityImprovements';
import { Peace } from '@civ-clone/library-diplomacy/Declarations';
import Player from '@civ-clone/core-player/Player';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

export type IntelligenceAffair = {
  // Only for a civilization the player has met (#59).
  civilization: string | null;
  atPeace: boolean;
};

export type IntelligenceDetails = {
  leader: string | null;
  // The leader's personality: the traits that aren't the normal one, as v474.05 lists them.
  traits: string[];
  capital: {
    name: string;
    // The founder's civilization, whose list the name comes from (`Generic.city-name`).
    civilization: string;
  } | null;
  government: string | null;
  gold: number;
  units: number;
  foreignAffairs: IntelligenceAffair[];
  advances: string[];
};

export type IntelligenceRow = {
  civilization: string;
  colors: [string, string] | null;
  // Only for a civilization the player holds an embassy with.
  details: IntelligenceDetails | null;
};

export type IntelligenceDependencies = {
  cityImprovementRegistry: CityImprovementRegistry;
  cityRegistry: CityRegistry;
  interactionRegistry: InteractionRegistry;
  playerGovernmentRegistry: PlayerGovernmentRegistry;
  playerRegistry: PlayerRegistry;
  playerResearchRegistry: PlayerResearchRegistry;
  playerTreasuryRegistry: PlayerTreasuryRegistry;
  unitRegistry: UnitRegistry;
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
};

const civilizationOf = (player: Player): string =>
  typeNameOf(player.civilization().sourceClass());

export const hasEmbassy = (
  holder: Player,
  host: Player,
  interactionRegistry: InteractionRegistry = interactionRegistryInstance
): boolean =>
  interactionRegistry
    .getByPlayers(holder, host)
    .some(
      (interaction) =>
        interaction instanceof Embassy &&
        (interaction as unknown as Embassy).holder() === holder
    );

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
  {
    cityImprovementRegistry,
    cityRegistry,
    interactionRegistry,
    playerGovernmentRegistry,
    playerRegistry,
    playerResearchRegistry,
    playerTreasuryRegistry,
    unitRegistry,
  }: IntelligenceDependencies
): IntelligenceDetails => {
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
    leader: leader === null ? null : typeNameOf(leader.sourceClass()),
    traits: (leader?.traits() ?? [])
      .map((trait) => typeNameOf(trait.sourceClass()))
      .filter((name) => !name.startsWith('Normal')),
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
    units: unitRegistry.getByPlayer(subject).length,
    // Every civilization the subject has dealt with, the player included, in the order they joined the game.
    foreignAffairs: playerRegistry
      .entries()
      .filter(
        (other) =>
          other !== subject &&
          interactionRegistry.getByPlayers(subject, other).length > 0
      )
      .map((other) => ({
        civilization:
          other === reader || hasMet(other) ? civilizationOf(other) : null,
        atPeace: interactionRegistry
          .getByPlayers(subject, other)
          .some(
            (interaction) =>
              interaction instanceof Peace && (interaction as Peace).active()
          ),
      })),
    advances: attempt(
      () =>
        playerResearchRegistry
          .getByPlayer(subject)
          .complete()
          .map((advance) => typeNameOf(advance.sourceClass())),
      []
    ),
  };
};

/** A row for each civilization `reader` has met, in the order they joined the game. */
export const intelligenceRows = (
  reader: Player,
  hasMet: (player: Player) => boolean,
  dependencies: IntelligenceDependencies = defaultDependencies
): IntelligenceRow[] =>
  dependencies.playerRegistry
    .entries()
    .filter((player) => player !== reader && hasMet(player))
    .map((player) => {
      const colors = player
        .civilization()
        .attributes()
        .find((attribute) => attribute.name() === 'colors');

      return {
        civilization: civilizationOf(player),
        colors: colors ? (colors.value() as [string, string]) : null,
        details: hasEmbassy(reader, player, dependencies.interactionRegistry)
          ? details(reader, player, hasMet, dependencies)
          : null,
      };
    });
