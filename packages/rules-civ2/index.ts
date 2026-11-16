// Civ2's worker rules (M2a, #1008): what the worker client acts on, shows and scores that only Civ2's rules have.
//  Imported by the plugin list once the civ2 set's plugins are in (`package.json`'s `civ-clone.sets.civ2.rules`), as
//  `@civ-clone/ui-rules-civ1` is for Civ1's sets: it hands them to the client and registers Civ2's AdditionalData.
//
// Civ2's own: buying and selling (civ2-treasury, on base-treasury's actions), the revolution (civ2-government), what an
//  exchange of knowledge took (civ2-diplomacy, on base-diplomacy), civil disorder (civ2-city-happiness), the citizens'
//  moods (base-city-happiness's calculator, as civ2-city-happiness uses it), the Wonders report (civ2-wonder), the
//  difficulty level, the terrain tooltip (civ2-world's tables), and M2b's combat and units: hit points, firepower and
//  fuel on the unit card, what a battle sounds like (with Civ1's sounds), the squares Paradrop and Airlift reach, what
//  Pillage can take, and a notice for a unit promoted after a win. And M2c's cities: the citizens' moods in Civ2's
//  stages (angry ones among them), what each square yields its city, the city's style and citizens' era, the
//  specialists it may have, what a change of build keeps, and the gold Capitalization makes. Still as a game without them would answer: choosing
//  an Auto city's next build, and scoring and conquest. It imports nothing of Civ1's (the civ2 set's isolation suite checks that none of it loads).

import { citizenSummary } from '@civ-clone/base-city-happiness/lib/calculateCitizenState';
import {
  acceptRevolution,
  handleChooseGovernment,
  handleRevolution,
} from './actions/government';
import {
  handleCompleteProduction,
  handleSellImprovement,
} from '@civ-clone/ui-worker-client/Client/actions/city';
import {
  setWorkerRules,
  WorkerRules,
} from '@civ-clone/ui-worker-client/workerRules';
import { actionTargets, pillageTargets } from './AdditionalData/actionTargets';
import {
  terrainDefenceBonus,
  terrainMoveCost,
} from './AdditionalData/terrainRules';
import {
  unitFirepower,
  unitFuel,
  unitHitPoints,
} from './AdditionalData/unitCombat';
import AdvanceTaken from '@civ-clone/base-diplomacy/Dialogues/AdvanceTaken';
import BorderRecord from '@civ-clone/civ2-diplomacy/Records/BorderRecord';
import CallForHelpRecord from '@civ-clone/civ2-diplomacy/Records/CallForHelpRecord';
import { SaveableClass } from '@civ-clone/core-data-object/ClassRegistry';
import SenateRecord from '@civ-clone/civ2-diplomacy/Records/SenateRecord';
import TreatyFlagsRecord from '@civ-clone/civ2-diplomacy/Records/TreatyFlagsRecord';
import WarnedUnitsRecord from '@civ-clone/civ2-diplomacy/Records/WarnedUnitsRecord';
import ChooseGovernment from '@civ-clone/base-player-action-choose-government/ChooseGovernment';
import CompleteProduction from '@civ-clone/base-treasury/PlayerActions/CompleteProduction';
import Revolution from '@civ-clone/base-player-action-revolution/Revolution';
import SellImprovement from '@civ-clone/base-treasury/PlayerActions/SellImprovement';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import { instance as engineInstance } from '@civ-clone/core-engine/Engine';
import promoted from './Rules/promoted';
import notifications from './notifications';
import reputationNotices from './Rules/reputationNotices';
import warNotices from './Rules/warNotices';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import anarchyTurns from './AdditionalData/anarchyTurns';
import attackSound from './AdditionalData/attackSound';
import { civilDisorder } from '@civ-clone/civ2-city-happiness/lib/cityStatus';
import cities, { buildItemDetails } from './AdditionalData/cities';
import {
  AutoMode,
  autoModes,
  setAutoMode,
} from '@civ-clone/civ2-city/lib/autoMode';
import cityStyle from './lib/cityStyle';
import { attitude, leaderTitle, reputation, treaty } from './lib/relations';
import { audienceEvents, mayOpenTalks } from './lib/talks';
import leaderTitleData from './AdditionalData/leaderTitle';
import rechoose from './AdditionalData/rechoose';
import { limitedRates, maxRates } from './AdditionalData/tradeRates';
import stagedHappiness from '@civ-clone/civ2-city-happiness/lib/stagedHappiness';
import civilDisorderDeclared from './AdditionalData/civilDisorderDeclared';
import { levelOf } from '@civ-clone/civ2-difficulty/level';
import { wonderHistory } from '@civ-clone/civ2-wonder/lib/wonderHistory';

const isAutoMode = (mode: unknown): mode is AutoMode =>
  autoModes.includes(mode as AutoMode);

export const civ2Rules: WorkerRules = {
  // After the shared ones, in the same order as Civ1's.
  actionHandlers: [
    [CompleteProduction, handleCompleteProduction],
    [SellImprovement, handleSellImprovement],
    [Revolution, handleRevolution],
    [ChooseGovernment, handleChooseGovernment],
  ],
  // What a computer player took in an exchange of knowledge, and civ2-diplomacy's own records: the treaty flags, the
  //  Senate's roll, a call for help, the border incidents and the units warned.
  saveableClasses: [
    AdvanceTaken,
    BorderRecord,
    CallForHelpRecord,
    SenateRecord,
    TreatyFlagsRecord,
    WarnedUnitsRecord,
  ] as unknown as SaveableClass[],
  civilDisorder: (city) => civilDisorder(city) !== null,
  // A city put on Auto chooses at once, from what its mode allows (civ2-city's three, M2c).
  autoBuild: (cityBuild, rules, mode) => {
    setAutoMode(cityBuild, isAutoMode(mode) ? mode : 'any', rules);
  },
  // Civ2's stages (civ2-city-happiness), the angry citizens among the unhappy.
  citizenMoods: (cityGrowth, specialists) =>
    citizenSummary(
      stagedHappiness(cityGrowth.city(), cityGrowth.city().yields(), {
        specialistRegistry: specialists,
      }).states
    ),
  // What changing to an item would leave the build with: civ2-city's change penalty, asked of its rules.
  buildItemDetails: (cityBuild, Item, rules) =>
    buildItemDetails(cityBuild, Item, rules),
  // Each city sends what its squares yield it (`squareYields`).
  citySquareYields: true,
  // Taken off Auto, it forgets its mode.
  autoBuildStopped: (cityBuild) => {
    setAutoMode(cityBuild, null);
  },
  // Rapture growth is told, as a city's growth.
  celebrationGrowthNotice: true,
  // Seeing a city isn't meeting its owner: the Apollo Program shows every city, and makes no contact (#1067).
  seenCityMeets: false,
  // M2d's relations: the treaty with a ceasefire and an alliance, a computer player's feelings, reputation and titles.
  treaty,
  attitude,
  reputation,
  leaderTitle,
  // Talks a person opens from the Foreign Advisor, and the audiences computer players ask for.
  mayOpenTalks,
  audienceEvents,
  // A revolution offered as an advance makes a government available, which a person is asked about.
  revolutionOffer: {
    event: 'player:government:available',
    accept: (player, GovernmentType, rules) =>
      acceptRevolution(player, GovernmentType, rules),
  },
  // What it tells a person of its diplomacy.
  notifications: notifications(),
  // A treaty's end is told by what ended it (`civ2:war-on`, and civ2-diplomacy's own events), not as each ends.
  replacesNotices: ['player:declaration-expired'],
  // How a rival's city is drawn, from its owner's advances, as one's own is (`style`).
  cityStyle: (city) => cityStyle(city),
  // No score in M2a, so nothing for conquest either.
  conquestBonus: (): null => null,
  difficultyLevel: (difficulties) => levelOf(difficulties),
  rating: () => ({ rating: 0, famousLeader: null }),
  // A unit that runs out of fuel says so itself (`unit:out-of-fuel`), so nothing lost at sea is a fuel loss.
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
    attackSound(),
    civilDisorderDeclared(),
    terrainDefenceBonus(),
    terrainMoveCost(),
    unitHitPoints(),
    unitFirepower(),
    unitFuel(),
    actionTargets(),
    pillageTargets(),
    leaderTitleData(),
    rechoose(),
    maxRates(),
    limitedRates(),
    ...cities()
  );

  ruleRegistryInstance.register(
    promoted(engineInstance),
    ...reputationNotices(engineInstance),
    warNotices(engineInstance)
  );
};

register();

export default civ2Rules;
