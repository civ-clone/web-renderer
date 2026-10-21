import { ActiveUnit, InactiveUnit } from '@civ-clone/civ1-unit/PlayerActions';
import {
  ChangeProduction,
  CityBuild,
} from '@civ-clone/core-city-build/PlayerActions';
import {
  ChoiceMeta,
  DataForChoiceMeta,
} from '@civ-clone/core-client/ChoiceMeta';
import { Client, IClient } from '@civ-clone/core-client/Client';
import AIClient from '@civ-clone/core-ai-client/AIClient';
import { AdjustTradeRates } from '@civ-clone/civ1-trade-rate/PlayerActions';
import Advance from '@civ-clone/core-science/Advance';
import BuildItem from '@civ-clone/core-city-build/BuildItem';
import ChangeSpecialist from '@civ-clone/core-city/PlayerActions/ChangeSpecialist';
import ChangeWorkedTile from '@civ-clone/core-city/PlayerActions/ChangeWorkedTile';
import ChooseResearch from '@civ-clone/civ1-science/PlayerActions/ChooseResearch';
import City from '@civ-clone/core-city/City';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import {
  CompleteProduction,
  SellImprovement,
} from '@civ-clone/civ1-treasury/PlayerActions';
import { ObjectMap, typeNameOf } from '@civ-clone/core-data-object/DataObject';
import { EndTurn } from '@civ-clone/civ1-player/PlayerActions';
import EventEmitter from '@dom111/typed-event-emitter/EventEmitter';
import { instance as availableCityBuildItemsRegistryInstance } from '@civ-clone/core-city-build/AvailableCityBuildItemsRegistry';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { IAction } from '@civ-clone/core-diplomacy/Negotiation/Action';
import { IInteraction } from '@civ-clone/core-diplomacy/Interaction';
import Initiate from '@civ-clone/core-diplomacy/Negotiation/Initiate';
import { LaunchSpaceship } from '@civ-clone/civ1-spaceship/PlayerActions';
import MandatoryPlayerAction from '@civ-clone/core-player/MandatoryPlayerAction';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import mayNegotiate from '@civ-clone/library-diplomacy/lib/mayNegotiate';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerTradeRates from '@civ-clone/core-trade-rate/PlayerTradeRates';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Resolution from '@civ-clone/core-diplomacy/Proposal/Resolution';
import {
  ChooseGovernment,
  Revolution,
} from '@civ-clone/civ1-government/PlayerActions';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { choosers } from '@civ-clone/simple-ai-client/lib/Diplomacy/negotiate';
import TransferObject from './TransferObject';
import Tile from '@civ-clone/core-world/Tile';
import Timeout from './Error/Timeout';
import TradeRate from '@civ-clone/core-trade-rate/TradeRate';
import Transport, {
  TransportDisposer,
  TransportHandledAction,
} from './Transport';
import Unit from '@civ-clone/core-unit/Unit';
import UnitAction from '@civ-clone/core-unit/Action';
import UnknownCity from './UnknownObjects/City';
import UnknownUnit from './UnknownObjects/Unit';
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
import autoBuild from '@civ-clone/civ1-city/lib/autoBuild';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as gameDifficultyRegistryInstance } from '@civ-clone/core-difficulty/GameDifficultyRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { instance as yearInstance } from '@civ-clone/core-game-year/Year';
import {
  chooseGovernment,
  revolution,
} from '@civ-clone/civ1-government/lib/revolution';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import {
  changeSpecialist,
  changeWorkedTile,
  reassignWorkers,
} from '@civ-clone/civ1-city/lib/assignWorkers';
import { TopCitiesRow, defaultTopCitiesLimit } from './lib/topCities';
import { CivilizationScore } from './lib/civilizationScore';
import { GameOverDetails } from './lib/gameOver';
import GameResult from '@civ-clone/core-turn-based-game/GameResult';
import { instance as gameResultRegistryInstance } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as specialistRegistryInstance } from '@civ-clone/core-city/SpecialistRegistry';
import { instance as wonderRegistryInstance } from '@civ-clone/core-wonder/WonderRegistry';
import hasMet from './lib/hasMet';
import { awaitTimeout, filterToReference, standalone } from './Client/refs';
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
// Last, as registering these used to follow every import here.
import './Client/registerAdditionalData';

export class DataTransferClient extends Client implements IClient {
  #automationClient: AIClient;
  #automationEnabled: boolean;
  // The player's actions as the frontend was last sent them, and the unit it has the actions of (#411, #323).
  #actions: ActionsState = new ActionsState();
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
  // The other players our units have moved next to since talks were last offered (#357): by hand, on a GoTo, or on a
  //  GoTo carried on at the start of the turn.
  #metOnTheWay: Set<Player> = new Set();
  #pendingChoiceDisposer: TransportDisposer | null = null;
  #receiver: (channel: string, handler: (...args: any[]) => void) => void;
  // What the request receivers read, kept for the methods tests call (see `Client/requests.ts`).
  #requests: RequestsContext;
  #sender: (channel: string, payload: any) => void;
  #sentInitialData: boolean = false;
  // Talks a Diplomat's Meet with King started (#58), which the action that started them waits for, as it waits for
  //  talks with units met on the way (`talkToPlayersMet`).
  #talks: Promise<void> = Promise.resolve();
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

    engineInstance.on('unit:moved', (unit: Unit) => {
      // Automation's own client does the talking for the moves it makes, as it does for halts.
      if (unit.player() !== this.player() || this.#automationEnabled) {
        return;
      }

      unit
        .tile()
        .getNeighbours()
        .forEach((tile) =>
          unitRegistryInstance.getByTile(tile).forEach((tileUnit) => {
            if (tileUnit.player() !== this.player()) {
              this.#metOnTheWay.add(tileUnit.player());
            }
          })
        );
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

    // The report opens on the civilization the embassy is with, as v474.05 opens it.
    engineInstance.on(
      'player:embassy-established',
      (holder: Player, host: Player) => {
        if (holder !== this.player()) {
          return;
        }

        this.#transport.send(
          'embassyEstablished',
          typeNameOf(host.civilization().sourceClass())
        );
      }
    );

    // The city is sent once, in full, as its owner would see it. Nothing else of its owner's goes with it: players are
    //  sent as their civilization, and other cities and every unit as the wrappers the map has for them.
    engineInstance.on('city:investigated', (city: City, player: Player) => {
      if (player !== this.player()) {
        return;
      }

      const playerWorld = playerWorldRegistryInstance.getByPlayer(
          this.player()
        ),
        // Tiles as the player knows them, in full, as nothing else is sent with it, and `Busy` by name.
        otherwise = this.#dataFilter(undefined, { tilesInFull: true }),
        // One wrapper per unit and city, so each is the same object wherever it appears.
        wrappers = new Map<Unit | City, UnknownUnit | UnknownCity>(),
        wrap = (object: Unit | City, make: () => UnknownUnit | UnknownCity) => {
          if (!wrappers.has(object)) {
            wrappers.set(object, make());
          }

          return wrappers.get(object)!;
        };

      this.#transport.send(
        'investigateCity',
        city.toPlainObject((object: any) => {
          if (object === city) {
            return object;
          }

          if (object instanceof Player) {
            return {
              _: 'Player',
              id: object.id(),
              civilization: object.civilization(),
              // The city screen's map is laid out in the world's dimensions.
              world: {
                height: playerWorld.height(),
                width: playerWorld.width(),
              },
            };
          }

          if (object instanceof Unit) {
            return wrap(object, () => UnknownUnit.fromUnit(object));
          }

          if (object instanceof City) {
            return wrap(object, () => UnknownCity.fromCity(object));
          }

          return otherwise(object);
        }) as never
      );
    });

    engineInstance.on(
      'player:meet-with-king',
      (player: Player, other: Player) => {
        if (player !== this.player()) {
          return;
        }

        this.#talks = this.#talks
          .then(() => this.handleNegotiation(other))
          .then(() => {});
      }
    );

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

    return new Promise<DataForChoiceMeta<ChoiceMeta<Name>>>((resolve) => {
      if (
        meta.choices().length === 1 &&
        'negotiation.next-step' !== meta.key()
      ) {
        const [choice] = meta.choices();

        resolve(choice.value());

        return;
      }

      // A listener stranded by an abandoned prompt would consume this
      // prompt's response (and retain its ChoiceMeta closure), so dispose it
      // before registering the next one.
      this.#pendingChoiceDisposer?.();

      // Serialised like a notification (#305). Sent whole, a negotiation's players brought every player's cities, units
      //  and known tiles: 20 MB and 10 s per step of a talk in a large game, and rivals' state the page should not see.
      //  Still the `ChoiceMeta` the transport expects, which a test's transport hands to an AI to answer; only what it
      //  serialises as changes.
      this.#transport.send(
        'chooseFromList',
        Object.create(meta, {
          toPlainObject: {
            value: () => meta.toPlainObject(this.#dataFilter(standalone)),
          },
        })
      );

      this.#pendingChoiceDisposer = this.#transport.receiveOnce(
        'chooseFromList',
        async (chosenId) => {
          this.#pendingChoiceDisposer = null;

          const [choice] = meta
            .choices()
            .filter((choice) => choice.id() === chosenId);

          if (!choice) {
            console.warn(
              `No choice found for '${chosenId}' against '${meta.id()}', using super.`
            );

            resolve(await super.chooseFromList(meta));

            return;
          }

          resolve(choice.value());
        }
      );
    });
  }

  async handleAction(...args: any[]): Promise<boolean> {
    const [action] = args,
      player = this.player(),
      actions = player.actions(),
      mandatoryActions = actions.filter(
        (action: PlayerAction): boolean =>
          action instanceof MandatoryPlayerAction
      );

    const { name, id } = action;

    // TODO: a proper action for this probably...
    if (name === 'ReassignWorkers') {
      const [city] = cityRegistryInstance.getBy('id', action.city);

      if (!city) {
        return false;
      }

      reassignWorkers(city);

      this.#patches.city(city);

      return false;
    }

    if (name === 'EndTurn') {
      return (
        mandatoryActions.length === 1 &&
        mandatoryActions.every((action) => action instanceof EndTurn)
      );
    }

    if (!name) {
      console.log(`action not specified: `, action);

      return false;
    }

    const [playerAction] = actions.filter(
      (action: PlayerAction): boolean =>
        action.constructor.name === name &&
        id === (action.value() ? action.value().id() : undefined)
    );

    if (!playerAction) {
      console.log('action not specified');

      return false;
    }

    // TODO: other actions
    // TODO: make this better...
    if (playerAction instanceof ActiveUnit) {
      const { unitAction, target } = action,
        unit: Unit = playerAction.value(),
        [playerTile] = playerWorldRegistryInstance
          .getByPlayer(this.player())
          .filter((tile) => tile.id() === target);

      if (!playerTile) {
        console.log(`tile not found: ${target}`);

        return false;
      }

      const actions = unit.actions(playerTile.tile()),
        filteredActions = actions.filter(
          (action: UnitAction): boolean =>
            action.sourceClass().name === unitAction
        );

      if (filteredActions.length === 0) {
        console.log(`action not found: ${unitAction}`);

        return false;
      }

      const [actionToPerform] = filteredActions,
        // Where the unit was, and the city that supported it, before it acted: a move leaves the one, and setting a new
        //  home city leaves the other (#411).
        fromTile = unit.tile(),
        homeCity = unit.city();

      // The patch this action sends keeps the unit's actions while it has moves left to use them (#323).
      this.#setUnitWithActions(unit);

      actionToPerform.perform();

      await this.#talks;

      await this.talkToPlayersMet();

      // What the action changed (#411): the unit, the cities that support it before and after, and what of ours is on
      //  the square it acted from, the square it acted on, and the square it is on now. A Caravan that helped build a
      //  wonder, or a Settlers that joined a city, is gone into the city on the square it acted on. Anything else is
      //  sent by the events the action raises.
      this.#patches.unit(unit);
      this.#patches.city(homeCity);
      this.#patches.city(unit.city());
      this.#patches.onTiles(fromTile, playerTile.tile(), unit.tile());

      return false;
    }

    if (playerAction instanceof InactiveUnit) {
      const unit: Unit = playerAction.value();

      unit.activate();

      // Built when the patch is sent, so as it is now it is active (#411).
      this.#patches.unit(unit);

      return false;
    }

    if (
      playerAction instanceof CityBuild ||
      playerAction instanceof ChangeProduction
    ) {
      const cityBuild = playerAction.value() as CityBuildItem,
        { auto, chosen } = action;

      // What the city is building, which is all a choice changes (#411).
      this.#patches.cityBuild(cityBuild);

      // Auto: the city chooses its improvements itself, starting now if it's building nothing (#194).
      if (typeof auto === 'boolean') {
        cityBuild.setAuto(auto);

        if (auto) {
          autoBuild(cityBuild, ruleRegistryInstance);
        }

        return false;
      }

      if (!chosen) {
        console.warn(`no build item specified`);

        return false;
      }

      const [buildItem] = cityBuild
        .available()
        .filter((buildItem: BuildItem) => buildItem.item().name === chosen);

      if (!buildItem) {
        console.log(`build item not available: ${chosen}`);

        return false;
      }

      cityBuild.build(buildItem.item());
      // Choosing a build by hand takes the city off Auto.
      cityBuild.setAuto(false);

      return false;
    }

    if (playerAction instanceof ChooseResearch) {
      const playerResearch = playerAction.value() as PlayerResearch,
        { chosen } = action;

      if (!chosen) {
        console.warn(`no advance specified`);

        return false;
      }

      const [ChosenAdvance] = playerResearch
        .available()
        .filter((AdvanceType: typeof Advance) => AdvanceType.name === chosen);

      if (!ChosenAdvance) {
        console.log(`build item not available: ${chosen}`);

        return false;
      }

      playerResearch.research(ChosenAdvance);

      this.#patches.playerObject(playerResearch);

      return false;
    }

    if (playerAction instanceof CompleteProduction) {
      const cityBuild = playerAction.value(),
        [playerTreasury] = playerTreasuryRegistryInstance.getBy(
          'id',
          action.treasury
        );

      if (!playerTreasury) {
        console.warn(`No playerTreasury found for id: ${action.treasury}.`);

        return false;
      }

      playerTreasury.buy(cityBuild.city());

      this.#patches.playerObject(playerTreasury);
      this.#patches.cityBuild(cityBuild);

      return false;
    }

    // Selling one of the city's improvements (#31): the rules decide whether it can be sold, and for what.
    if (playerAction instanceof SellImprovement) {
      const city = playerAction.value(),
        [playerTreasury] = playerTreasuryRegistryInstance.getBy(
          'id',
          action.treasury
        ),
        [cityImprovement] = cityImprovementRegistryInstance
          .getByCity(city)
          .filter(
            (cityImprovement) => cityImprovement.id() === action.improvement
          );

      if (!playerTreasury || !cityImprovement) {
        console.warn(
          `No playerTreasury (${action.treasury}) or improvement (${action.improvement}) found.`
        );

        return false;
      }

      playerTreasury.sell(cityImprovement);

      // Selling the Palace changes every city's corruption, so every city goes again (#460 would say when).
      this.#patches.playerObject(playerTreasury);
      cityRegistryInstance
        .getByPlayer(this.player())
        .forEach((city) => this.#patches.city(city));

      return false;
    }

    if (playerAction instanceof Revolution) {
      revolution(playerAction.value() as PlayerGovernment);

      this.#patches.player();

      return false;
    }

    if (playerAction instanceof ChooseGovernment) {
      const playerGovernment = playerAction.value() as PlayerGovernment,
        { chosen } = action,
        [GovernmentType] = playerGovernment
          .available()
          .filter((GovernmentType) => GovernmentType.name === chosen);

      if (!GovernmentType) {
        console.error(`Government type: '${chosen}' not found.`);

        return false;
      }

      chooseGovernment(playerGovernment, GovernmentType);

      this.#patches.player();

      return false;
    }

    if (playerAction instanceof AdjustTradeRates) {
      const playerTradeRates = playerAction.value() as PlayerTradeRates,
        { value } = action;

      playerTradeRates.setAll(
        value.map(([name, value]: [string, string]) => {
          const [rate] = playerTradeRates
            .all()
            .filter((rate) => rate.constructor.name === name);

          return [rate.constructor as typeof TradeRate, value];
        })
      );

      // Every city's trade is split by the rates (#411).
      this.#patches.playerObject(playerTradeRates);

      cityRegistryInstance
        .getByPlayer(this.player())
        .forEach((city) => this.#patches.city(city));

      return false;
    }

    if (playerAction instanceof ChangeWorkedTile) {
      const city = playerAction.value(),
        [playerTile] = playerWorldRegistryInstance
          .getByPlayer(this.player())
          .filter((tile) => tile.id() === action.tile);

      if (!playerTile) {
        console.log(`tile not found: ${action.tile}`);

        return false;
      }

      if (changeWorkedTile(city, playerTile.tile()) === 'none') {
        return false;
      }

      this.#patches.city(city);

      return false;
    }

    if (playerAction instanceof ChangeSpecialist) {
      const city = playerAction.value().city();

      changeSpecialist(playerAction.value());

      this.#patches.city(city);

      return false;
    }

    if (playerAction instanceof LaunchSpaceship) {
      playerAction.value().launch();

      this.#patches.player();

      return false;
    }

    console.log(`unhandled action: ${JSON.stringify(action)}`);
    return false;
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

    // Anyone met by a GoTo carried on at the start of the turn.
    this.#talks = this.#talks.then(() => this.talkToPlayersMet());
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
        this.#metOnTheWay.clear();
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

  // TODO: This is duplicated between here and SimpleAIClient, this should be re-usable.
  // Offers talks with each player a unit of ours has moved next to since the last time (`#metOnTheWay`), if they may
  //  talk now (`MayNegotiate`).
  private async talkToPlayersMet(): Promise<void> {
    // TODO: This could be a `Rule`.
    const surroundingPlayers = Array.from(this.#metOnTheWay);

    this.#metOnTheWay.clear();

    if (surroundingPlayers.length === 0) {
      return;
    }

    await surroundingPlayers
      // How often players talk is the ruleset's to say (`MayNegotiate`).
      .filter((player) =>
        mayNegotiate(
          player,
          this.player(),
          ruleRegistryInstance,
          interactionRegistryInstance,
          turnInstance
        )
      )
      .reduce(
        (promise, player): Promise<any> =>
          promise.then(() => this.handleNegotiation(player)),
        Promise.resolve()
      );
  }

  private async handleNegotiation(player: Player): Promise<Negotiation> {
    const negotiation = new Negotiation(
      player,
      this.player(),
      ruleRegistryInstance
    );

    negotiation.proceed(
      new Initiate(player, negotiation, ruleRegistryInstance) as IAction
    );

    while (!negotiation.terminated()) {
      // The steps on offer, worked out once for the first player asked: each call makes new actions.
      let offered: IAction[] | null = negotiation.nextSteps();

      // The player whose steps they are chooses: after the hand-over in a meeting at peace, your OK is for the computer
      //  player, but the next move is yours (#450).
      const players = choosers(negotiation, offered);

      await players.reduce(
        (promise: Promise<void>, player: Player) =>
          promise
            .then(async () => {
              const client = clientRegistryInstance.getByPlayer(player),
                nextSteps = offered ?? negotiation.nextSteps(),
                resultPromise = Promise.race([
                  client.chooseFromList(
                    new ChoiceMeta(
                      nextSteps,
                      'negotiation.next-step',
                      negotiation
                    )
                  ),
                  client instanceof AIClient
                    ? awaitTimeout(
                        500,
                        new Timeout(
                          `Timeout waiting for ${client.player().id()} (${
                            client.player().civilization().sourceClass().name
                          }) - sent ${nextSteps.length} options`
                        )
                      )
                    : new Promise<void>(() => {}),
                ]);

              offered = null;

              const interaction = await resultPromise;

              if (!interaction) {
                return;
              }

              negotiation.proceed(interaction);

              if (interaction instanceof Resolution) {
                await interaction.proposal().resolve(interaction);
              }
            })
            .catch((reason) => console.error(reason)),
        Promise.resolve()
      );

      if (negotiation.terminated()) {
        break;
      }
    }

    interactionRegistryInstance.register(negotiation as IInteraction);

    return negotiation;
  }
}

export default DataTransferClient;
