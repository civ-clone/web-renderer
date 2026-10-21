import {
  ChoiceMeta,
  DataForChoiceMeta,
} from '@civ-clone/core-client/ChoiceMeta';
import { Client, IClient } from '@civ-clone/core-client/Client';
import City from '@civ-clone/core-city/City';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import { instance as availableCityBuildItemsRegistryInstance } from '@civ-clone/core-city-build/AvailableCityBuildItemsRegistry';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import Player from '@civ-clone/core-player/Player';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Transport from './Transport';
import Unit from '@civ-clone/core-unit/Unit';
import ActionsState from './Client/ActionsState';
import Automation from './Client/Automation';
import { instance as advanceRegistryInstance } from '@civ-clone/core-science/AdvanceRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as currentPlayerRegistryInstance } from '@civ-clone/core-player/CurrentPlayerRegistry';
import { instance as engineInstance } from '@civ-clone/core-engine/Engine';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as cityImprovementRegistryInstance } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as gameDifficultyRegistryInstance } from '@civ-clone/core-difficulty/GameDifficultyRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { instance as yearInstance } from '@civ-clone/core-game-year/Year';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import { TopCitiesRow, defaultTopCitiesLimit } from './lib/topCities';
import { CivilizationScore } from './lib/civilizationScore';
import { GameOverDetails } from './lib/gameOver';
import GameResult from '@civ-clone/core-turn-based-game/GameResult';
import { instance as gameResultRegistryInstance } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as specialistRegistryInstance } from '@civ-clone/core-city/SpecialistRegistry';
import { instance as wonderRegistryInstance } from '@civ-clone/core-wonder/WonderRegistry';
import hasMet from './lib/hasMet';
import {
  DataFilter,
  makeDataFilter,
  serialiseCity,
  serialisePlayer,
  serialiseTile,
  serialiseUnit,
} from './Client/visibilityFilter';
import PlayerPatches from './Client/PlayerPatches';
import Notifier from './Client/Notifier';
import CityNewsCollector from './Client/cityNews';
import registerCheats from './Client/cheats';
import registerRequests, {
  RequestsContext,
  cityBuildAvailable as cityBuildAvailableFor,
  civilizationScore as civilizationScoreFor,
  topCities as topCitiesFor,
} from './Client/requests';
import registerGameEnd, {
  GameEndContext,
  gameOver as gameOverFor,
} from './Client/gameEnd';
import registerNotifications from './Client/notifications/registerNotifications';
import registerPatchEvents from './Client/events/patchEvents';
import Talks, { registerTalkEvents } from './Client/Talks';
import ChoicePrompt from './Client/ChoicePrompt';
import registerDiplomatEvents from './Client/diplomatEvents';
import TurnHandover, {
  registerTurnHandoverEvents,
} from './Client/TurnHandover';
import { handleAction as handleActionFor } from './Client/handleAction';
import { ActionContext } from './Client/actions/ActionContext';
// Last, as registering these used to follow every import here.
import './Client/registerAdditionalData';

export class DataTransferClient extends Client implements IClient {
  // Whether the player's turns are automated, and the computer player that plays them (see `Client/Automation.ts`).
  //  Made in the constructor, which is given whether it starts on.
  #automation: Automation;
  // The player's actions as the frontend was last sent them, and the unit it has the actions of (#411, #323).
  #actions: ActionsState = new ActionsState();
  // What acting on the UI's actions reads (see `Client/handleAction.ts`). Made in the constructor, once the patches and
  //  the talks are.
  #actionContext: ActionContext;
  // What the player may see, which every payload goes through (see `Client/visibilityFilter.ts`). After `#actions`,
  //  which it is made with.
  #dataFilter: DataFilter = makeDataFilter(() => this.player(), this.#actions);
  // The patches queued for the player and the flush that sends them (see `Client/PlayerPatches.ts`). Made in the
  //  constructor, which is given the transport.
  #patches: PlayerPatches;
  // What the game-end receivers and listeners read, kept for `gameOver` (see `Client/gameEnd.ts`).
  #gameEnd: GameEndContext;
  // The notifications sent the player, held until the hand-over (see `Client/Notifier.ts`). Made in the constructor,
  //  which is given the transport.
  #notifier: Notifier;
  // What happened to each city during the engine call under way, told to the player once it's over (#400, #420; see
  //  `Client/cityNews.ts`).
  #cityNews: CityNewsCollector;
  // Asks the player to choose, one prompt at a time (see `Client/ChoicePrompt.ts`). Made in the constructor, which is
  //  given the transport.
  #choicePrompt: ChoicePrompt;
  // What the request receivers read, kept for the methods tests call (see `Client/requests.ts`).
  #requests: RequestsContext;
  // Talks with other players: those met on the way and a Diplomat's Meet with King (see `Client/Talks.ts`).
  #talks: Talks;
  #transport: Transport<TransportDataMap>;
  // The turn handed to the UI and back, and each `action` it sends acted on (see `Client/TurnHandover.ts`). Made in
  //  the constructor, once the patches, the notifications and the talks are.
  #turnHandover: TurnHandover;

  constructor(
    player: Player,
    transport: Transport<TransportDataMap>,
    {
      automationEnabled = false,
    }: {
      automationEnabled?: boolean;
    } = {}
  ) {
    super(player);

    this.#automation = new Automation(
      new SimpleAIClient(player),
      automationEnabled,
      {
        player: () => this.player(),
        currentPlayers: currentPlayerRegistryInstance,
      }
    );
    this.#transport = transport;
    this.#patches = new PlayerPatches(
      transport,
      this.#dataFilter,
      this.#actions,
      () => this.player()
    );
    this.#notifier = new Notifier(transport, this.#dataFilter);
    this.#choicePrompt = new ChoicePrompt(transport, this.#dataFilter);
    this.#cityNews = new CityNewsCollector(
      () => this.player(),
      (notification) => this.#notifier.notify(notification)
    );

    this.#talks = new Talks({
      player: () => this.player(),
      clients: clientRegistryInstance,
      interactions: interactionRegistryInstance,
      rules: ruleRegistryInstance,
      turn: turnInstance,
      units: unitRegistryInstance,
    });

    // The turn handed to the UI and back: it listens for the UI's `action`s, and holds our notifications until the
    //  hand-over (see `Client/TurnHandover.ts`).
    this.#turnHandover = new TurnHandover({
      player: () => this.player(),
      transport,
      dataFilter: this.#dataFilter,
      actions: this.#actions,
      patches: this.#patches,
      notifier: this.#notifier,
      talks: this.#talks,
      automation: this.#automation,
      handleAction: (...args: any[]) => this.handleAction(...args),
      difficulties: gameDifficultyRegistryInstance,
      playerWorlds: playerWorldRegistryInstance,
      turn: turnInstance,
      year: yearInstance,
    });
    this.#notifier.holdWhile(() => this.#turnHandover.holdsNotifications());

    // The cheats and the lists the cheat menu asks for (see `Client/cheats.ts`).
    registerCheats(this.#transport, {
      player: () => this.player(),
      patches: this.#patches,
      dataFilter: this.#dataFilter,
      advances: advanceRegistryInstance,
      availableCityBuildItems: availableCityBuildItemsRegistryInstance,
      players: playerRegistryInstance,
      playerResearches: playerResearchRegistryInstance,
      playerTreasuries: playerTreasuryRegistryInstance,
      playerWorlds: playerWorldRegistryInstance,
      units: unitRegistryInstance,
    });

    // What the UI asks for: the reports, what a city can build and a unit's actions (see `Client/requests.ts`).
    this.#requests = {
      player: () => this.player(),
      hasMet: (player: Player) => this.hasMet(player),
      dataFilter: this.#dataFilter,
      actions: this.#actions,
      patches: this.#patches,
      cities: cityRegistryInstance,
      cityBuilds: cityBuildRegistryInstance,
      cityGrowths: cityGrowthRegistryInstance,
      gameResults: gameResultRegistryInstance,
      playerWorlds: playerWorldRegistryInstance,
      rules: ruleRegistryInstance,
      specialists: specialistRegistryInstance,
      units: unitRegistryInstance,
      wonders: wonderRegistryInstance,
    };

    registerRequests(this.#transport, this.#requests);

    engineInstance.on('engine:plugins:load:failed', (packagePath, error) => {
      console.log(packagePath + ' failed to load');
      console.error(error);
    });

    // What the UI's actions read and change (see `Client/handleAction.ts`).
    this.#actionContext = {
      player: () => this.player(),
      patches: this.#patches,
      actions: this.#actions,
      talks: this.#talks,
      cities: cityRegistryInstance,
      cityImprovements: cityImprovementRegistryInstance,
      playerTreasuries: playerTreasuryRegistryInstance,
      playerWorlds: playerWorldRegistryInstance,
      rules: ruleRegistryInstance,
    };

    // The players met by our units' moves, and a Diplomat's Meet with King (see `Client/Talks.ts`). Its `unit:moved`
    //  listener is before the patches' below, which flushes.
    registerTalkEvents(engineInstance, this.#talks, this.#automation);

    // A GoTo that stopped next to a choice, told once its move has gone (see `Client/TurnHandover.ts`).
    registerTurnHandoverEvents(engineInstance, this.#turnHandover);

    // What each engine event changes of what the player is sent, queued for the next flush, and the flush after every
    //  unit's move (see `Client/events/patchEvents.ts`). After the talks' `unit:moved` listener above, as it was.
    registerPatchEvents(engineInstance, {
      player: () => this.player(),
      patches: this.#patches,
      dataFilter: this.#dataFilter,
      automation: this.#automation,
      cityNews: this.#cityNews,
    });

    // A Diplomat's embassy report and investigated city (see `Client/diplomatEvents.ts`).
    registerDiplomatEvents(engineInstance, {
      player: () => this.player(),
      transport: this.#transport,
      dataFilter: this.#dataFilter,
      playerWorlds: playerWorldRegistryInstance,
    });

    // Famine (#400). A city shrinks for many reasons, most of them told some other way or not at all (Settlers built,
    //  no Aqueduct), so a shrinking city has no notice of its own. `city:shrink` carries its cause (the Settlers, the
    //  Attack lost, `Aqueduct`, `FoodExhausted`, `Captured`) for any that should have one.
    engineInstance.on('city:food-storage-exhausted', (city: City) => {
      this.#cityNews.of(city).famine = true;
    });

    // How the game ends for us: Game → Retire, keeping playing, and the ending window, sent however the game ends (see
    //  `Client/gameEnd.ts`).
    this.#gameEnd = {
      player: () => this.player(),
      hasMet: (player: Player) => this.hasMet(player),
      civilizationScore: () => this.civilizationScore(),
      difficulties: gameDifficultyRegistryInstance,
      gameResults: gameResultRegistryInstance,
      playerResearches: playerResearchRegistryInstance,
      rules: ruleRegistryInstance,
      turn: turnInstance,
      year: yearInstance,
    };

    registerGameEnd(this.#transport, engineInstance, this.#gameEnd);

    // What the player is told of, after the listeners above, so that what an event changes is queued before the
    //  player is told of it (see `Client/notifications/registerNotifications.ts`).
    registerNotifications(
      engineInstance,
      {
        player: () => this.player(),
        hasMet: (player: Player) => this.hasMet(player),
        hasSeen: (tile: Tile) =>
          Boolean(
            playerWorldRegistryInstance
              .getByPlayer(this.player())
              .getByTile(tile)
          ),
        unitsOn: (tile: Tile) => unitRegistryInstance.getByTile(tile),
        government: (player: Player) =>
          playerGovernmentRegistryInstance.getByPlayer(player),
      },
      this.#notifier
    );
  }

  setAutomationEnabled(enabled: boolean): void {
    this.#automation.setEnabled(enabled);
  }

  async chooseFromList<Name extends keyof ChoiceMetaDataMap>(
    meta: ChoiceMeta<Name>
  ): Promise<DataForChoiceMeta<ChoiceMeta<Name>>> {
    if (this.#automation.enabled) {
      return this.#automation.client.chooseFromList(meta) as Promise<
        DataForChoiceMeta<ChoiceMeta<Name>>
      >;
    }

    if (meta.choices().length === 1 && 'negotiation.next-step' !== meta.key()) {
      const [choice] = meta.choices();

      return new Promise<DataForChoiceMeta<ChoiceMeta<Name>>>((resolve) =>
        resolve(choice.value())
      );
    }

    // Sent to the UI to choose (see `Client/ChoicePrompt.ts`), or chosen at random if it answers with an unknown id.
    return this.#choicePrompt.promptChoice(meta, () =>
      super.chooseFromList(meta)
    );
  }

  // What the UI sends on `action`, acted on (see `Client/handleAction.ts`). Says whether the turn is over. Not `async`,
  //  so that it settles when the action's handler does, inside the listener's hold on flushes.
  handleAction(...args: any[]): Promise<boolean> {
    return handleActionFor(this.#actionContext, ...args);
  }

  /**
   * Send the player's whole state, as the first hand-over does (see `Client/TurnHandover.ts`).
   *
   * For tests and `Game.ts`: the UI can't ask for it.
   */
  initialData(): void {
    this.#turnHandover.sendInitialData();
  }

  /**
   * Send the patches queued for the player, unless an action is being handled (see `PlayerPatches#flush`).
   *
   * For tests and `Game.ts`: the UI can't ask for it, but the engine flushes after every action and turn.
   */
  flush(): void {
    this.#patches.flush();
  }

  cityBuildAvailable(cityBuild: CityBuildItem): ObjectMap {
    return cityBuildAvailableFor(this.#dataFilter, cityBuild);
  }

  civilizationScore(): CivilizationScore {
    return civilizationScoreFor(this.#requests);
  }

  // How the game ended, for the ending window (#176).
  gameOver(gameResult: GameResult): GameOverDetails {
    return gameOverFor(this.#gameEnd, gameResult);
  }

  topCities(limit: number = defaultTopCitiesLimit): TopCitiesRow[] {
    return topCitiesFor(this.#requests, limit);
  }

  // Whether this player has met `player`, for naming them in a notification (#59).
  private hasMet(player: Player): boolean {
    return hasMet(this.player(), player, {
      interactions: interactionRegistryInstance,
      cities: cityRegistryInstance,
      playerWorlds: playerWorldRegistryInstance,
    });
  }

  // One of the player's tiles in full, as a tile patch sends it (#138).
  serialiseTile(playerTile: PlayerTile): ObjectMap {
    return serialiseTile(this.#dataFilter, playerTile);
  }

  // The whole player as the frontend should hold it now, for a test to compare with what it does hold (#411).
  serialisePlayer(): ObjectMap {
    return serialisePlayer(this.#dataFilter, this.player(), this.#actions);
  }

  // One of the player's units, as a patch of the unit sends it (#411).
  serialiseUnit(unit: Unit): ObjectMap {
    return serialiseUnit(this.#dataFilter, unit);
  }

  // One of the player's cities, as a patch of the city sends it (#411).
  serialiseCity(city: City): ObjectMap {
    return serialiseCity(this.#dataFilter, city);
  }

  // The player's turn, handed to the UI, or played by automation (see `Client/TurnHandover.ts`).
  takeTurn(): Promise<void> {
    return this.#turnHandover.takeTurn();
  }
}

export default DataTransferClient;
