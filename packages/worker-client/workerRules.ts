// What the worker client needs from the rule set a game is played with (#865), which it no longer imports itself: the
//  rule set's worker package (civ.one's is `@civ-clone/ui-rules-civ1`) hands these in with `setWorkerRules` when it is
//  loaded, alongside the plugins. Everything here is the rule set's own: what every rule set shares, the client acts
//  on itself.

import type { ActionHandler } from './Client/actions/ActionContext';
import type City from '@civ-clone/core-city/City';
import type CityGrowth from '@civ-clone/core-city-growth/CityGrowth';
import type CityBuild from '@civ-clone/core-city-build/CityBuild';
import type { IBuildable as Buildable } from '@civ-clone/core-city-build/Buildable';
import type { GameDifficultyRegistry } from '@civ-clone/core-difficulty/GameDifficultyRegistry';
import type { GameResultRegistry } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import type Player from '@civ-clone/core-player/Player';
import type PlayerAction from '@civ-clone/core-player/PlayerAction';
import type { PlayerWorldRegistry } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import type RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import type { SaveableClass } from '@civ-clone/core-data-object/ClassRegistry';
import type { SpecialistRegistry } from '@civ-clone/core-city/SpecialistRegistry';
import type Unit from '@civ-clone/core-unit/Unit';
import type Wonder from '@civ-clone/core-wonder/Wonder';
import type { WonderRegistry } from '@civ-clone/core-wonder/WonderRegistry';
import type { CityImprovementRegistry } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import type { InteractionRegistry } from '@civ-clone/core-diplomacy/InteractionRegistry';
import type { PlayerGovernmentRegistry } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import type { Treaty } from '@civ-clone/ui-protocol/reports';
import type Turn from '@civ-clone/core-turn-based-game/Turn';

export type PlayerActionType = new (...args: any[]) => PlayerAction;

export type { Treaty };

/** The registries the relations between players are read from. */
export type RelationRegistries = {
  interactionRegistry: InteractionRegistry;
  ruleRegistry: RuleRegistry;
  turn: Turn;
};

/** A Wonder as the rule set's history of them gives it: standing (in `city`, `owner`'s), lost with its city, or never built. */
export type WonderStatus = {
  type: typeof Wonder;
  state: 'standing' | 'lost' | 'never';
  city: City | null;
  owner: Player | null;
};

export type WorkerRules = {
  /** The rule set's own player actions and what acts on each, tried after the ones every rule set shares. */
  actionHandlers: [PlayerActionType, ActionHandler<any>][];
  /** The classes of the rule set's own that a save can name, registered with the shared ones. */
  saveableClasses: SaveableClass[];
  /** Whether the rules have declared `city` in civil disorder, which only changes at the start of a turn. */
  civilDisorder: (city: City) => boolean;
  /** A city on Auto chooses its next build: from `mode`'s items, under rules with a choice of them (M2c). */
  autoBuild: (cityBuild: CityBuild, rules: RuleRegistry, mode?: string) => void;
  /** The city's citizens as `[unhappy, content, happy]`, its specialists left out. */
  citizenMoods: (
    cityGrowth: CityGrowth,
    specialists: SpecialistRegistry
  ) => [number, number, number];
  /** What conquering the world would score `player`, or `null` while it can't. */
  conquestBonus: (
    player: Player,
    gameResults: GameResultRegistry,
    playerWorlds: PlayerWorldRegistry
  ) => number | null;
  /** The game's difficulty as a number, lowest 0. */
  difficultyLevel: (difficulties: GameDifficultyRegistry) => number;
  /** The rating a final score gives at a difficulty level, and the famous leader it compares with (`null`: none). */
  rating: (
    score: number,
    level: number
  ) => { rating: number; famousLeader: string | null };
  /** Whether `unit` needs fuel, so a loss at the end of a turn was running out of it rather than being lost at sea. */
  needsFuel: (unit: Unit) => boolean;
  /** Every Wonder ever built, standing or lost, in the order the rule set's Wonders report lists them (#971, #992). */
  wonderHistory: (
    wonders: WonderRegistry,
    cityImprovements: CityImprovementRegistry
  ) => WonderStatus[];
  /**
   * Anything the rule set adds to an item in a city's build list (M2c): what changing the build to it would leave as
   *  progress (`progressAfterChange`), for rules that take part of it. None by default.
   */
  buildItemDetails?: (
    cityBuild: CityBuild,
    Item: Buildable,
    rules: RuleRegistry
  ) => { progressAfterChange?: number; goldPerTurn?: number };
  /** Whether a square yields each city its own figures (`City.squareYields`, Civ2), so a city goes again when a square in its radius changes. Not by default. */
  citySquareYields?: boolean;
  /** A city taken off Auto, for rules that keep more than the flag (Civ2's Auto mode, M2c). Nothing by default. */
  autoBuildStopped?: (cityBuild: CityBuild) => void;
  /** Whether a city that grows while it celebrates is told so (Civ2's rapture growth). Not by default. */
  celebrationGrowthNotice?: boolean;
  /** How a city is drawn, for a rival's city, which goes without the rule set's own city data. None by default. */
  cityStyle?: (city: City) => object | null;
  /**
   * Whether having seen a city a player holds or founded counts as meeting them, for naming them (`hasMet`). Yes by
   *  default, as the client has always had it (Civ1); Civ2's rules say no, as the Apollo Program shows every city
   *  without making contact (#1067).
   */
  seenCityMeets?: boolean;
  /**
   * Where `player` and `other` stand, for the reports and the talks. By default at peace while a `Peace` is in force
   *  between them, and otherwise at war, as v474.05 has it for any two who have met.
   */
  treaty?: (
    player: Player,
    other: Player,
    registries: RelationRegistries
  ) => Treaty;
  /** How `holder` feels toward `toward`, as one of nine bands (0 the warmest), or `null` with no feeling kept. None by default. */
  attitude?: (
    holder: Player,
    toward: Player,
    registries: RelationRegistries
  ) => number | null;
  /** `player`'s reputation, 0 the best to 7 the worst, or `null`. None by default. */
  reputation?: (
    player: Player,
    registries: RelationRegistries
  ) => number | null;
  /** What `player`'s leader is called under their government, as a translation key, or `null`. None by default. */
  leaderTitle?: (
    player: Player,
    rules: RuleRegistry,
    playerGovernments: PlayerGovernmentRegistry
  ) => string | null;
};

let current: WorkerRules | null = null;

/** The rule set's worker package hands in its rules, once, when it is loaded. */
export const setWorkerRules = (rules: WorkerRules): void => {
  current = rules;
};

/** The rules the game is played with, or `null` before any are loaded: for what may be asked before a game, too. */
export const currentWorkerRules = (): WorkerRules | null => current;

/** The rules the game is played with: the client asks for them only once a game is under way, after they're in. */
export const workerRules = (): WorkerRules => {
  if (current === null) {
    throw new Error(
      "No rule set's worker rules were loaded: the plugin list imports them (package.json `civ-clone.rules`)."
    );
  }

  return current;
};

export default workerRules;
