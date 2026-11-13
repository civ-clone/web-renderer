// Civ1's worker rules (#865): what the worker client acts on, shows and scores that only Civ1's rules have. Imported by
//  the plugin list once the plugins are in (`package.json`'s `civ-clone.rules`), which hands them to the client and
//  registers Civ1's AdditionalData, as a plugin registers its own when it is imported.

import {
  FAMOUS_LEADERS,
  famousLeader,
  rating,
} from '@civ-clone/civ1-game-end/lib/scoring';
import {
  calculateCitizenState,
  citizenSummary,
} from '@civ-clone/civ1-city-happiness/lib/calculateCitizenState';
import { handleChooseGovernment, handleRevolution } from './actions/government';
import {
  handleCompleteProduction,
  handleSellImprovement,
} from '@civ-clone/ui-worker-client/Client/actions/city';
import {
  setWorkerRules,
  WorkerRules,
} from '@civ-clone/ui-worker-client/workerRules';
import {
  terrainDefenceBonus,
  terrainMoveCost,
} from './AdditionalData/terrainRules';
import AdvanceTaken from '@civ-clone/base-diplomacy/Dialogues/AdvanceTaken';
import ChooseGovernment from '@civ-clone/base-player-action-choose-government/ChooseGovernment';
import CompleteProduction from '@civ-clone/base-treasury/PlayerActions/CompleteProduction';
import { Revolution } from '@civ-clone/library-government/PlayerActions';
import SellImprovement from '@civ-clone/base-treasury/PlayerActions/SellImprovement';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import { aircraftRange } from '@civ-clone/civ1-unit/Rules/Player/turnEnd';
import anarchyTurns from './AdditionalData/anarchyTurns';
import autoBuild from '@civ-clone/civ1-city/lib/autoBuild';
import { civilDisorder } from '@civ-clone/civ1-city-happiness/lib/cityStatus';
import civilDisorderDeclared from './AdditionalData/civilDisorderDeclared';
import conquestBonusFor from '@civ-clone/civ1-game-end/lib/conquestBonusFor';
import { levelOf } from '@civ-clone/civ1-difficulty/level';
import { wonderHistory } from '@civ-clone/civ1-wonder/lib/wonderHistory';

export const civ1Rules: WorkerRules = {
  // After the shared ones, in the order the client's `if` chain once tested them among those (#449).
  actionHandlers: [
    [CompleteProduction, handleCompleteProduction],
    [SellImprovement, handleSellImprovement],
    [Revolution, handleRevolution],
    [ChooseGovernment, handleChooseGovernment],
  ],
  // What a computer player took in an exchange of knowledge (#453).
  saveableClasses: [AdvanceTaken],
  civilDisorder: (city) => civilDisorder(city) !== null,
  autoBuild: (cityBuild, rules) => autoBuild(cityBuild, rules),
  citizenMoods: (cityGrowth, specialists) =>
    citizenSummary(
      calculateCitizenState(cityGrowth, cityGrowth.city().yields(), specialists)
    ),
  conquestBonus: (player, gameResults, playerWorlds) =>
    conquestBonusFor(player, gameResults, playerWorlds),
  difficultyLevel: (difficulties) => levelOf(difficulties),
  rating: (score, level) => {
    const value = rating(score, level),
      leaderIndex = famousLeader(value);

    return {
      rating: value,
      famousLeader: leaderIndex === null ? null : FAMOUS_LEADERS[leaderIndex]!,
    };
  },
  needsFuel: (unit) =>
    aircraftRange.some(([UnitType]) => unit instanceof UnitType),
  // Standing or lost, in Civ1's order (#971), for the Wonders of the World report (#992).
  wonderHistory: (wonders, cityImprovements) =>
    wonderHistory(wonders, cityImprovements),
};

let registered = false;

/** Hands Civ1's rules to the worker client and registers its AdditionalData: once, however often it is called. */
export const register = (): void => {
  setWorkerRules(civ1Rules);

  if (registered) {
    return;
  }

  registered = true;

  additionalDataRegistryInstance.register(
    anarchyTurns(),
    civilDisorderDeclared(),
    terrainDefenceBonus(),
    terrainMoveCost()
  );
};

register();

export default civ1Rules;
