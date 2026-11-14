// Civ2's worker rules (M2a, #1008): what the worker client acts on, shows and scores that only Civ2's rules have.
//  Imported by the plugin list once the civ2 set's plugins are in (`package.json`'s `civ-clone.sets.civ2.rules`), as
//  `@civ-clone/ui-rules-civ1` is for Civ1's sets.
//
// Most of it is still to come: Civ2 has no player actions of its own, happiness, scoring, fuel or Wonders yet, so each
//  of those answers as a game without them would. Only what the civ2 packages already have is Civ2's own: the
//  difficulty level. It imports nothing of Civ1's (the civ2 set's isolation suite checks that none of it loads).

import {
  setWorkerRules,
  WorkerRules,
} from '@civ-clone/ui-worker-client/workerRules';
import { levelOf } from '@civ-clone/civ2-difficulty/level';

export const civ2Rules: WorkerRules = {
  // None of Civ2's own yet: only the player actions every rule set shares.
  actionHandlers: [],
  saveableClasses: [],
  // No civil disorder until Civ2's happiness is in.
  civilDisorder: (): boolean => false,
  // A city on Auto keeps what it is building until Civ2 has a choice of its own to make.
  autoBuild: (): void => {},
  // Every citizen content until Civ2's happiness is in.
  citizenMoods: (cityGrowth): [number, number, number] => [
    0,
    cityGrowth.size(),
    0,
  ],
  // No score yet, so nothing for conquest either.
  conquestBonus: (): null => null,
  difficultyLevel: (difficulties) => levelOf(difficulties),
  rating: () => ({ rating: 0, famousLeader: null }),
  // No units that carry fuel yet.
  needsFuel: (): boolean => false,
  // No Wonders yet.
  wonderHistory: () => [],
};

/** Hands Civ2's rules to the worker client: however often it is called. */
export const register = (): void => {
  setWorkerRules(civ2Rules);
};

register();

export default civ2Rules;
