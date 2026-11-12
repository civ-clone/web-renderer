// What the worker client needs from the rule set a game is played with (#865), which it no longer imports itself: the
//  rule set's worker package (civ.one's is `@civ-clone/ui-rules-civ1`) hands these in with `setWorkerRules` when it is
//  loaded, alongside the plugins. Everything here is the rule set's own: what every rule set shares, the client acts
//  on itself.

import type { ActionHandler } from './Client/actions/ActionContext';
import type City from '@civ-clone/core-city/City';
import type CityGrowth from '@civ-clone/core-city-growth/CityGrowth';
import type CityBuild from '@civ-clone/core-city-build/CityBuild';
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

export type PlayerActionType = new (...args: any[]) => PlayerAction;

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
  /** A city on Auto chooses its next build. */
  autoBuild: (cityBuild: CityBuild, rules: RuleRegistry) => void;
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
};

let current: WorkerRules | null = null;

/** The rule set's worker package hands in its rules, once, when it is loaded. */
export const setWorkerRules = (rules: WorkerRules): void => {
  current = rules;
};

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
