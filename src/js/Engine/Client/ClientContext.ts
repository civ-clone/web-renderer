// What the client's modules share (#449): one object, made once by `DataTransferClient`'s constructor, which every
//  registrar and every module that reads the game is given. Each module still says what it reads of it, as a `Pick` of
//  this (`CheatsContext`, `RequestsContext`, …), so that a test can hand it a plain object with only those.

import { AdvanceRegistry } from '@civ-clone/core-science/AdvanceRegistry';
import { AvailableCityBuildItemsRegistry } from '@civ-clone/core-city-build/AvailableCityBuildItemsRegistry';
import { CityBuildRegistry } from '@civ-clone/core-city-build/CityBuildRegistry';
import { CityGrowthRegistry } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { CityImprovementRegistry } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import { CityRegistry } from '@civ-clone/core-city/CityRegistry';
import { ClientRegistry } from '@civ-clone/core-client/ClientRegistry';
import { CurrentPlayerRegistry } from '@civ-clone/core-player/CurrentPlayerRegistry';
import { GameDifficultyRegistry } from '@civ-clone/core-difficulty/GameDifficultyRegistry';
import { GameResultRegistry } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import { InteractionRegistry } from '@civ-clone/core-diplomacy/InteractionRegistry';
import Player from '@civ-clone/core-player/Player';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import { PlayerRegistry } from '@civ-clone/core-player/PlayerRegistry';
import { PlayerResearchRegistry } from '@civ-clone/core-science/PlayerResearchRegistry';
import { PlayerTreasuryRegistry } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { PlayerWorldRegistry } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import { SpecialistRegistry } from '@civ-clone/core-city/SpecialistRegistry';
import Tile from '@civ-clone/core-world/Tile';
import { Turn } from '@civ-clone/core-turn-based-game/Turn';
import Unit from '@civ-clone/core-unit/Unit';
import { UnitRegistry } from '@civ-clone/core-unit/UnitRegistry';
import { WonderRegistry } from '@civ-clone/core-wonder/WonderRegistry';
import { Year } from '@civ-clone/core-game-year/Year';
import Transport from '../Transport';
import ActionsState from './ActionsState';
import Automation from './Automation';
import { CityNewsCollector } from './cityNews';
import { CivilizationScore } from '../lib/civilizationScore';
import { DataFilter } from './visibilityFilter';
import Notifier from './Notifier';
import PlayerPatches from './PlayerPatches';
import Talks from './Talks';

// The engine's registries the client reads (see `registries.ts`), typed as narrowly as its modules read them: the union
//  of what each one picks.
export interface ClientRegistries {
  advances: Pick<AdvanceRegistry, 'entries' | 'filter'>;
  availableCityBuildItems: Pick<AvailableCityBuildItemsRegistry, 'entries'>;
  cities: Pick<CityRegistry, 'entries' | 'getBy' | 'getByPlayer'>;
  cityBuilds: Pick<CityBuildRegistry, 'getBy'>;
  cityGrowths: Pick<CityGrowthRegistry, 'getByCity'>;
  cityImprovements: Pick<CityImprovementRegistry, 'getByCity'>;
  clients: Pick<ClientRegistry, 'getByPlayer'>;
  currentPlayers: Pick<CurrentPlayerRegistry, 'entries'>;
  difficulties: GameDifficultyRegistry;
  gameResults: GameResultRegistry;
  interactions: InteractionRegistry;
  players: Pick<PlayerRegistry, 'entries'>;
  playerResearches: Pick<PlayerResearchRegistry, 'getByPlayer'>;
  playerTreasuries: Pick<
    PlayerTreasuryRegistry,
    'getBy' | 'getByPlayerAndType'
  >;
  playerWorlds: PlayerWorldRegistry;
  rules: RuleRegistry;
  specialists: SpecialistRegistry;
  turn: Turn;
  units: Pick<UnitRegistry, 'getBy' | 'getByTile'>;
  wonders: Pick<WonderRegistry, 'getByCity'>;
  year: Year;
}

export interface ClientContext extends ClientRegistries {
  // The player the client is for.
  player(): Player;
  transport: Transport<TransportDataMap>;
  // The player's actions as the frontend was last sent them, and the unit it has the actions of (#411, #323).
  actions: ActionsState;
  // What the player may see, which every payload goes through.
  dataFilter: DataFilter;
  // The patches queued for the player, and the flush that sends them.
  patches: PlayerPatches;
  // The notifications sent the player, held until the hand-over.
  notifier: Notifier;
  // What happened to each city during the engine call under way, told once it is over (#400, #420).
  cityNews: CityNewsCollector;
  // Whether the player's turns are automated, read as it goes: it is turned on and off mid-game.
  automation: Automation;
  // Talks with other players: those met on the way and a Diplomat's Meet with King.
  talks: Talks;
  // Whether we have met a player, which says whether a notice or a report may name them (#59).
  hasMet(player: Player): boolean;
  // Whether we have seen a square, which says whether a rival's wonder is told with its city (#43).
  hasSeen(tile: Tile): boolean;
  // The units on a square: a goody hut is told to the player whose unit found it.
  unitsOn(tile: Tile): Unit[];
  // A player's government, which says how its collapse is told.
  government(player: Player): PlayerGovernment;
  // Our Civilization Score, as `civilizationScore` sends it.
  civilizationScore(): CivilizationScore;
  // Acts on what the UI sends on `action` and says whether the turn is over: the client's own `handleAction`.
  handleAction(...args: any[]): Promise<boolean>;
}

// Undoes what a registrar registered: its engine listeners and its transport receivers.
export type Disposer = () => void;
