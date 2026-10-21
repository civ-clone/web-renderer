// The engine's registries the client reads (#449), as its context holds them (see `ClientContext.ts`): the singletons,
//  in one place, so that the modules are given them rather than importing them.

import { instance as advanceRegistryInstance } from '@civ-clone/core-science/AdvanceRegistry';
import { instance as availableCityBuildItemsRegistryInstance } from '@civ-clone/core-city-build/AvailableCityBuildItemsRegistry';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityImprovementRegistryInstance } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as currentPlayerRegistryInstance } from '@civ-clone/core-player/CurrentPlayerRegistry';
import { instance as gameDifficultyRegistryInstance } from '@civ-clone/core-difficulty/GameDifficultyRegistry';
import { instance as gameResultRegistryInstance } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as specialistRegistryInstance } from '@civ-clone/core-city/SpecialistRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { instance as wonderRegistryInstance } from '@civ-clone/core-wonder/WonderRegistry';
import { instance as yearInstance } from '@civ-clone/core-game-year/Year';
import { ClientRegistries } from './ClientContext';

export const registries: ClientRegistries = {
  advances: advanceRegistryInstance,
  availableCityBuildItems: availableCityBuildItemsRegistryInstance,
  cities: cityRegistryInstance,
  cityBuilds: cityBuildRegistryInstance,
  cityGrowths: cityGrowthRegistryInstance,
  cityImprovements: cityImprovementRegistryInstance,
  clients: clientRegistryInstance,
  currentPlayers: currentPlayerRegistryInstance,
  difficulties: gameDifficultyRegistryInstance,
  gameResults: gameResultRegistryInstance,
  interactions: interactionRegistryInstance,
  players: playerRegistryInstance,
  playerResearches: playerResearchRegistryInstance,
  playerTreasuries: playerTreasuryRegistryInstance,
  playerWorlds: playerWorldRegistryInstance,
  rules: ruleRegistryInstance,
  specialists: specialistRegistryInstance,
  turn: turnInstance,
  units: unitRegistryInstance,
  wonders: wonderRegistryInstance,
  year: yearInstance,
};

export default registries;
