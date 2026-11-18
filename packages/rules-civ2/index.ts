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
//  specialists it may have, what a change of build keeps, and the gold Capitalization makes. And M2d part 2's Diplomats,
//  Spies and Caravans: what a Spy may aim a theft or a sabotage at, what a mission does to a treaty, the victim's answer
//  to an espionage incident, the goods each trade route carries, and their notices. And M2e part 1's barbarians and
//  endgame: the score's conquest bonus, rating and title (civ2-score), what each score term counts, a spaceship's
//  supplies, the ship's layout in a save, and the notices of barbarians, global warming, a civil war and a launch. It
//  imports nothing of Civ1's (the civ2 set's isolation suite checks that none of it loads).

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
import NuclearDeviceRecord from '@civ-clone/civ2-diplomacy/Records/NuclearDeviceRecord';
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
import espionageEvents from './Rules/espionageEvents';
import espionageNotices from './espionageNotices';
import incidentOffer from './lib/incidentOffer';
import {
  forgetRouteGoodsListener,
  routeGoods,
  routeGoodsListener,
} from './lib/routeGoods';
import { missionConsequences, missionTargets } from './AdditionalData/missions';
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
import walledData, { walled } from './AdditionalData/walled';
import { levelOf } from '@civ-clone/civ2-difficulty/level';
import {
  conquestBonusFor,
  rating,
  title,
} from '@civ-clone/civ2-score/lib/rating';
import SpaceshipLayout from '@civ-clone/civ2-spaceship/SpaceshipLayout';
import endgameNotices from './endgameNotices';
import spaceshipSupply from './AdditionalData/spaceship';
import { wonderHistory } from '@civ-clone/civ2-wonder/lib/wonderHistory';

// civ2-enhanced's pollution term, which charges each civilization for its own pollution rather than the world's.
const OWN_POLLUTION_RULE = 'civ2-enhanced:player/score/pollution';

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
  //  Senate's roll, a call for help, the border incidents, the units warned and a nuclear device found out by a
  //  civilization not yet met (M2d part 2).
  saveableClasses: [
    AdvanceTaken,
    BorderRecord,
    CallForHelpRecord,
    NuclearDeviceRecord,
    SenateRecord,
    TreatyFlagsRecord,
    WarnedUnitsRecord,
    // civ2-spaceship's layout, which no registry holds (M2e).
    SpaceshipLayout,
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
  // An espionage incident under a treaty, which the victim may answer with war or the end of an alliance (M2d part 2).
  incidentOffer: incidentOffer(),
  // What a trade route carries, kept as each Caravan or Freight arrives (`lib/routeGoods`).
  tradeRouteGoods: (holder, partner) => routeGoods(holder, partner),
  // What it tells a person of its diplomacy, and of its Diplomats, Spies and Caravans (M2d part 2), and of the
  //  barbarians, the world and the endgame (M2e).
  notifications: [
    ...notifications(),
    ...espionageNotices(),
    ...endgameNotices(),
  ],
  // A treaty's end is told by what ended it (`civ2:war-on`, and civ2-diplomacy's own events), not as each ends; a
  //  delivery, with the research it pays too; a nuclear detonation, which doesn't name a device's planter.
  replacesNotices: [
    'player:declaration-expired',
    'unit:trade-route-established',
    'unit:nuclear-detonation',
    // Civ2's uprising sends whether anyone knows Industrialization where Civ1's sends guerrillas (M2e).
    'barbarians:uprising',
  ],
  // How a rival's city is drawn, from its owner's advances, as one's own is (`style`).
  cityStyle: (city) => cityStyle(city),
  // Whether a rival's city is drawn walled, as last seen, as one's own is (`walled`): its City Walls or its owner's
  //  Great Wall (#688, #1069).
  walled: (city) => walled(city),
  // civ2-score's conquest bonus, which reads whether eliminated civilizations come back (M2e).
  conquestBonus: (player, gameResults, playerWorlds, rules) =>
    conquestBonusFor(player, gameResults, playerWorlds, rules),
  difficultyLevel: (difficulties) => levelOf(difficulties),
  // The rating, and the title it earns, one of 24 in our own words (`RatingTitle.civ2-score.*`).
  rating: (score, level) => {
    const value = rating(score, level);

    return {
      rating: value,
      famousLeader: null,
      title: `civ2-score.${title(value)}`,
    };
  },
  // Civ2's numbers for each score term and the conquest bonus, and civ2-enhanced's own pollution where it's on.
  scoreContext: (term, rules) =>
    term === 'pollution' &&
    (rules.getById(OWN_POLLUTION_RULE)?.enabled() ?? false)
      ? 'civ2-own'
      : 'civ2',
  // A unit that runs out of fuel says so itself (`unit:out-of-fuel`), so nothing lost at sea is a fuel loss.
  needsFuel: (): boolean => false,
  // Standing or lost, in RULES.TXT's order, for the Wonders of the World report.
  wonderHistory: (wonders, cityImprovements) =>
    wonderHistory(wonders, cityImprovements),
  carryOnUnattendedRule: 'civ2-game-end:game-over/carry-on-unattended',
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
    walledData(),
    terrainDefenceBonus(),
    terrainMoveCost(),
    unitHitPoints(),
    unitFirepower(),
    unitFuel(),
    actionTargets(),
    pillageTargets(),
    ...missionTargets(),
    ...missionConsequences(),
    leaderTitleData(),
    rechoose(),
    maxRates(),
    limitedRates(),
    ...cities(),
    spaceshipSupply()
  );

  ruleRegistryInstance.register(
    promoted(engineInstance),
    ...reputationNotices(engineInstance),
    warNotices(engineInstance),
    ...espionageEvents(engineInstance)
  );

  // What each trade route carries, as Caravans and Freight arrive, and forgotten with a destroyed city.
  engineInstance.on('unit:trade-route-established', routeGoodsListener());
  engineInstance.on('city:destroyed', forgetRouteGoodsListener());
};

register();

export default civ2Rules;
