// Civ2's worker rules (M2a, #1008): what the worker client acts on, shows and scores that only Civ2's rules have.
//  Imported by the plugin list once the civ2 set's plugins are in (`package.json`'s `civ-clone.sets.civ2.rules`), as
//  `@civ-clone/ui-rules-civ1` is for Civ1's sets: it hands them to the client and registers Civ2's AdditionalData.
//
// Civ2's own: buying and selling (civ2-treasury, on base-treasury's actions), the revolution (civ2-government), what an
//  exchange of knowledge took (civ2-diplomacy, on base-diplomacy), civil disorder (civ2-city-happiness), the citizens'
//  moods (base-city-happiness's calculator, as civ2-city-happiness uses it), the Wonders report (civ2-wonder), the
//  difficulty level, and the terrain tooltip (civ2-world's tables). Still as a game without them would answer, as M2a
//  has none of them: choosing an Auto city's next build, scoring and conquest, and fuel. It imports nothing of
//  Civ1's (the civ2 set's isolation suite checks that none of it loads).

import {
  calculateCitizenState,
  citizenSummary,
} from '@civ-clone/base-city-happiness/lib/calculateCitizenState';
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
import Revolution from '@civ-clone/base-player-action-revolution/Revolution';
import SellImprovement from '@civ-clone/base-treasury/PlayerActions/SellImprovement';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import anarchyTurns from './AdditionalData/anarchyTurns';
import { civilDisorder } from '@civ-clone/civ2-city-happiness/lib/cityStatus';
import civilDisorderDeclared from './AdditionalData/civilDisorderDeclared';
import { levelOf } from '@civ-clone/civ2-difficulty/level';
import { wonderHistory } from '@civ-clone/civ2-wonder/lib/wonderHistory';

export const civ2Rules: WorkerRules = {
  // After the shared ones, in the same order as Civ1's.
  actionHandlers: [
    [CompleteProduction, handleCompleteProduction],
    [SellImprovement, handleSellImprovement],
    [Revolution, handleRevolution],
    [ChooseGovernment, handleChooseGovernment],
  ],
  // What a computer player took in an exchange of knowledge.
  saveableClasses: [AdvanceTaken],
  civilDisorder: (city) => civilDisorder(city) !== null,
  // A city on Auto keeps what it is building: Civ2 has no choice of its own to make yet.
  autoBuild: (): void => {},
  citizenMoods: (cityGrowth, specialists) =>
    citizenSummary(
      calculateCitizenState(cityGrowth, cityGrowth.city().yields(), specialists)
    ),
  // No score in M2a, so nothing for conquest either.
  conquestBonus: (): null => null,
  difficultyLevel: (difficulties) => levelOf(difficulties),
  rating: () => ({ rating: 0, famousLeader: null }),
  // No fuel in M2a.
  needsFuel: (): boolean => false,
  // Standing or lost, in RULES.TXT's order, for the Wonders of the World report.
  wonderHistory: (wonders, cityImprovements) =>
    wonderHistory(wonders, cityImprovements),
};

let registered = false;

/** Hands Civ2's rules to the worker client and registers its AdditionalData: once, however often it is called. */
export const register = (): void => {
  setWorkerRules(civ2Rules);

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

export default civ2Rules;
