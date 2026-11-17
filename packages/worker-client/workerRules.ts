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
import type Government from '@civ-clone/core-government/Government';
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
import type { NotificationTable } from './Client/notifications/NotificationContext';
import Notification from '@civ-clone/ui-protocol/Notification';
import type Turn from '@civ-clone/core-turn-based-game/Turn';

export type PlayerActionType = new (...args: any[]) => PlayerAction;

export type { Treaty };

// What a rule set's own notices are made of (`notifications`), so a rule set's worker rules needn't reach past the
//  worker client.
export type {
  NotificationContext,
  NotificationTable,
} from './Client/notifications/NotificationContext';
export { Notification };

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
   * The engine events by which a computer player asks for an audience with a person (each with the computer player and
   *  the person), which the person's client opens at the start of their turn, led by the computer player. None by
   *  default: Civ1's computer players talk only when their units meet.
   */
  audienceEvents?: string[];
  /**
   * The rule set's own notices: its engine events and how each is told, registered after every rule set's own, in this
   *  order. None by default.
   */
  notifications?: NotificationTable;
  /** Events every rule set tells of that this one's `notifications` tell of in their place. None by default. */
  replacesNotices?: string[];
  /**
   * A revolution the rules offer when an advance makes a government available: the engine event that offers it (with
   *  the player and the government), and accepting it, which starts the revolution as the rules have it. None by
   *  default: Civ1's rules make no offer.
   */
  revolutionOffer?: {
    event: string;
    accept: (
      player: Player,
      GovernmentType: typeof Government,
      rules: RuleRegistry
    ) => void;
  };
  /**
   * A chance the rules give the victim of an incident to answer it (Civ2's: an espionage incident under a treaty offers
   *  war, or the end of an alliance): the engine event that makes it, which of its arguments the offer is (`null` for
   *  none), and the answers. None by default: Civ1's rules make no such offer.
   */
  incidentOffer?: {
    event: string;
    offer: (...args: any[]) => {
      perpetrator: Player;
      victim: Player;
      alliance: boolean;
    } | null;
    accept: (perpetrator: Player, victim: Player) => void;
    decline: (perpetrator: Player, victim: Player) => void;
  };
  /** The goods `holder`'s trade route to `partner` carries, by its key, or `null`. None by default. */
  tradeRouteGoods?: (holder: City, partner: City) => string | null;
  /**
   * Whether `player` may open talks with `other` (from the Foreign Advisor), under rules where a person can (Civ2's).
   *  Not by default: in Civ1 only the computer players open talks (#1071).
   */
  mayOpenTalks?: (
    player: Player,
    other: Player,
    registries: RelationRegistries
  ) => boolean;
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
