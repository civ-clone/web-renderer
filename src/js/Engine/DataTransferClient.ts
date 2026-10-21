import {
  ChoiceMeta,
  DataForChoiceMeta,
} from '@civ-clone/core-client/ChoiceMeta';
import { Client, IClient } from '@civ-clone/core-client/Client';
import AIClient from '@civ-clone/core-ai-client/AIClient';
import City from '@civ-clone/core-city/City';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import EventEmitter from '@dom111/typed-event-emitter/EventEmitter';
import { instance as availableCityBuildItemsRegistryInstance } from '@civ-clone/core-city-build/AvailableCityBuildItemsRegistry';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import Player from '@civ-clone/core-player/Player';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import TransferObject from './TransferObject';
import Tile from '@civ-clone/core-world/Tile';
import Transport, { TransportHandledAction } from './Transport';
import Unit from '@civ-clone/core-unit/Unit';
import ActionsState from './Client/ActionsState';
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
import { filterToReference } from './Client/refs';
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
import { handleAction as handleActionFor } from './Client/handleAction';
import { ActionContext } from './Client/actions/ActionContext';
// Last, as registering these used to follow every import here.
import './Client/registerAdditionalData';

export class DataTransferClient extends Client implements IClient {
  #automationClient: AIClient;
  #automationEnabled: boolean;
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
  #eventEmitter: EventEmitter;
  // What the game-end receivers and listeners read, kept for `gameOver` (see `Client/gameEnd.ts`).
  #gameEnd: GameEndContext;
  // Whether the UI has been handed this player's turn: `turnStarted` is sent and `action`s are listened for. Until then,
  //  our own notifications are held (see `#holdsNotifications`).
  #handedOver: boolean = false;
  // The notifications sent the player, held until the hand-over (see `Client/Notifier.ts`). Made in the constructor,
  //  which is given the transport.
  #notifier: Notifier;
  // What happened to each city during the engine call under way, told to the player once it's over (#400, #420; see
  //  `Client/cityNews.ts`).
  #cityNews: CityNewsCollector;
  // GoTos that stopped next to a choice (#357), sent once the patch with the unit's move has gone, or with
  //  `turnStarted` for one carried on at the start of the turn.
  #heldHalts: { target: string; unit: string }[] = [];
  // Asks the player to choose, one prompt at a time (see `Client/ChoicePrompt.ts`). Made in the constructor, which is
  //  given the transport.
  #choicePrompt: ChoicePrompt;
  #receiver: (channel: string, handler: (...args: any[]) => void) => void;
  // What the request receivers read, kept for the methods tests call (see `Client/requests.ts`).
  #requests: RequestsContext;
  #sender: (channel: string, payload: any) => void;
  #sentInitialData: boolean = false;
  // Talks with other players: those met on the way and a Diplomat's Meet with King (see `Client/Talks.ts`).
  #talks: Talks;
  #transport: Transport<TransportDataMap>;

  constructor(
    player: Player,
    transport: Transport<TransportDataMap>,
    sender: (channel: string, payload: any) => void,
    receiver: (channel: string, handler: (...args: any[]) => void) => void,
    {
      automationEnabled = false,
    }: {
      automationEnabled?: boolean;
    } = {}
  ) {
    super(player);

    this.#automationClient = new SimpleAIClient(player);
    this.#automationEnabled = automationEnabled;
    this.#eventEmitter = new EventEmitter();
    this.#transport = transport;
    this.#patches = new PlayerPatches(
      transport,
      this.#dataFilter,
      this.#actions,
      () => this.player()
    );
    this.#notifier = new Notifier(transport, this.#dataFilter);
    this.#notifier.holdWhile(() => this.#holdsNotifications());
    this.#choicePrompt = new ChoicePrompt(transport, this.#dataFilter);
    this.#cityNews = new CityNewsCollector(
      () => this.player(),
      (notification) => this.#notifier.notify(notification)
    );
    this.#sender = sender;
    this.#receiver = receiver;

    this.#transport.receive('action', (...args): void =>
      this.#eventEmitter.emit('action', ...args)
    );

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

    this.#talks = new Talks({
      player: () => this.player(),
      clients: clientRegistryInstance,
      interactions: interactionRegistryInstance,
      rules: ruleRegistryInstance,
      turn: turnInstance,
      units: unitRegistryInstance,
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

    const client = this;

    // The players met by our units' moves, and a Diplomat's Meet with King (see `Client/Talks.ts`). Its `unit:moved`
    //  listener is before the patches' below, which flushes.
    registerTalkEvents(engineInstance, this.#talks, {
      get enabled(): boolean {
        return client.#automationEnabled;
      },
    });

    engineInstance.on('unit:halted', (unit: Unit, target: Tile) => {
      if (unit.player() !== this.player() || this.#automationEnabled) {
        return;
      }

      const playerTile = playerWorldRegistryInstance
        .getByPlayer(this.player())
        .getByTile(target);

      if (!playerTile) {
        return;
      }

      // Its actions go out with it, for the UI to choose from.
      this.#setUnitWithActions(unit);
      this.#patches.unit(unit);

      this.#heldHalts.push({ target: playerTile.id(), unit: unit.id() });
    });

    // What each engine event changes of what the player is sent, queued for the next flush, and the flush after every
    //  unit's move (see `Client/events/patchEvents.ts`). After the talks' `unit:moved` listener above, as it was.
    registerPatchEvents(engineInstance, {
      player: () => this.player(),
      patches: this.#patches,
      dataFilter: this.#dataFilter,
      automation: { automatedTurn: () => this.#automatedTurn() },
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
    this.#automationEnabled = !!enabled;
  }

  async chooseFromList<Name extends keyof ChoiceMetaDataMap>(
    meta: ChoiceMeta<Name>
  ): Promise<DataForChoiceMeta<ChoiceMeta<Name>>> {
    if (this.#automationEnabled) {
      return this.#automationClient.chooseFromList(meta) as Promise<
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

  private sendInitialData(): void {
    // Through the visibility filter, as every patch is. Sent as it was, `toPlainObject` was called on it with no filter, so
    //  every other player went out in full, and with them their `world`: every tile each civilization knows. Reached from
    //  our units' and cities' `player`/`originalPlayer`, a tile's `units`/`city`/`workedBy` and a unit's actions (#328).
    this.#transport.send(
      'gameData',
      new TransferObject(
        this.player(),
        turnInstance,
        yearInstance,
        gameDifficultyRegistryInstance.entries()[0] ?? null
      ).toPlainObject(this.#dataFilter(undefined, { tilesInFull: true }))
    );

    this.#sentInitialData = true;
  }

  // Every flush goes through `PlayerPatches#flush`, which holds them while an action is handled. Named, as tests reach it.
  private sendPatchData(): void {
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

  // The UI has actions for one unit (#323). When that changes, the unit that had them goes again without them.
  #setUnitWithActions(unit: Unit | null): void {
    this.#actions.setUnitWithActions(unit, (previous) =>
      this.#patches.unit(previous)
    );
  }

  // Whether this is our turn, automated: the whole player goes at the end of it, so what each of its moves changes of
  //  our units and cities needn't go as well, only the squares the map draws (#411).
  #automatedTurn(): boolean {
    if (!this.#automationEnabled) {
      return false;
    }

    const [currentPlayer] = currentPlayerRegistryInstance.entries();

    return currentPlayer === this.player();
  }

  #holdsNotifications(): boolean {
    if (this.#handedOver || this.#automationEnabled) {
      return false;
    }

    const [currentPlayer] = currentPlayerRegistryInstance.entries();

    return currentPlayer === this.player();
  }

  #handOver(): void {
    this.#handedOver = true;

    this.#transport.send('turnStarted', null);

    this.#notifier.release();

    this.#sendHalts();

    this.#talks.handOver();
  }

  // Says an action has been handled, once the patch with its result has gone (#326). An action's patch can't be told
  //  from any other by what is in it (a `unitActions` answer can arrive first, with the unit where it was), so the UI
  //  waits for this to know a move it has drawn ahead was refused.
  #acknowledge({ name, id, unitAction, target }: TransportHandledAction): void {
    this.#transport.send('actionHandled', { name, id, unitAction, target });
  }

  #sendHalts(): void {
    this.#heldHalts
      .splice(0)
      .forEach((halt) => this.#transport.send('unitHalted', halt));
  }

  takeTurn(): Promise<void> {
    return new Promise<void>((resolve, reject): void => {
      // The first turn after a load or a new game: the initial data is the player's whole state, so the hand-over
      //  below has no need to queue and send it a second time.
      const playerJustSent = !this.#sentInitialData;

      if (playerJustSent) {
        this.sendInitialData();
      }

      if (this.#automationEnabled) {
        // Automation's own client does the talking.
        this.#talks.metOnTheWay.clear();
        this.#heldHalts.splice(0);

        this.#automationClient
          .takeTurn()
          .then(() => {
            this.#patches.update(turnInstance.id(), () =>
              turnInstance.toPlainObject()
            );
            this.#patches.update(yearInstance.id(), () =>
              yearInstance.toPlainObject()
            );
            this.#patches.wholePlayer(
              filterToReference(PlayerWorld, PlayerTile, Tile)
            );

            this.sendPatchData();
            resolve();
          })
          .catch(reject);

        return;
      }

      setTimeout(() => {
        this.#patches.update(turnInstance.id(), () =>
          turnInstance.toPlainObject()
        );
        this.#patches.update(yearInstance.id(), () =>
          yearInstance.toPlainObject()
        );

        // On later turns this is how the UI gets the new turn's actions.
        if (!playerJustSent) {
          this.#patches.wholePlayer(
            filterToReference(PlayerWorld, PlayerTile, Tile),
            'add'
          );
        }

        this.sendPatchData();

        // The listener below is already attached, so the UI can act from here.
        this.#handOver();
      }, 1);

      const listener = async (...args: any[]): Promise<void> => {
        try {
          const playerState = this.#patches.playerState();

          // Every flush is held while the action is handled (#321).
          const turnEnded = await this.#patches.hold(() =>
            this.handleAction(...args)
          );

          if (turnEnded) {
            this.#eventEmitter.off('action', listener);

            this.#handedOver = false;

            this.sendPatchData();

            this.#acknowledge(args[0]);

            this.#transport.send('turnEnded', null);

            setTimeout(() => resolve(), 10);

            return;
          }

          // Not the whole player, which in a large game is hundreds of KB and most of the time an action takes: what
          //  the action changed has been sent by now, by the action and the events it raised, and the player's actions
          //  are sent if they changed (#411). And its research and treasury if the action changed them on the way.
          this.#patches.playerStateChanged(playerState);
          this.#patches.actions();

          this.sendPatchData();

          this.#acknowledge(args[0]);

          this.#sendHalts();
        } catch (e) {
          // Without this, a throwing action strands the listener on the
          // long-lived emitter and every later action gets double-processed.
          this.#eventEmitter.off('action', listener);

          reject(e);
        }
      };

      this.#eventEmitter.on('action', listener);
    });
  }
}

export default DataTransferClient;
