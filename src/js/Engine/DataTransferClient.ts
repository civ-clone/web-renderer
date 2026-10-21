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
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import Civilization from '@civ-clone/core-civilization/Civilization';
import {
  CompleteProduction,
  SellImprovement,
} from '@civ-clone/civ1-treasury/PlayerActions';
import { ObjectMap, typeNameOf } from '@civ-clone/core-data-object/DataObject';
import { EndTurn } from '@civ-clone/civ1-player/PlayerActions';
import EventEmitter from '@dom111/typed-event-emitter/EventEmitter';
import { Gold } from '@civ-clone/civ1-city/Yields';
import { instance as availableCityBuildItemsRegistryInstance } from '@civ-clone/core-city-build/AvailableCityBuildItemsRegistry';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import GoodyHut from '@civ-clone/core-goody-hut/GoodyHut';
import { IAction } from '@civ-clone/core-diplomacy/Negotiation/Action';
import { IInteraction } from '@civ-clone/core-diplomacy/Interaction';
import Initiate from '@civ-clone/core-diplomacy/Negotiation/Initiate';
import { LaunchSpaceship } from '@civ-clone/civ1-spaceship/PlayerActions';
import MandatoryPlayerAction from '@civ-clone/core-player/MandatoryPlayerAction';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import mayNegotiate from '@civ-clone/library-diplomacy/lib/mayNegotiate';
import Notification from './Notification';
import Part from '@civ-clone/core-spaceship/Part';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerTradeRates from '@civ-clone/core-trade-rate/PlayerTradeRates';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Retryable from './Retryable';
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
import Wonder from '@civ-clone/core-wonder/Wonder';
import ActionsState from './Client/ActionsState';
import Yield from '@civ-clone/core-yield/Yield';
import JoinCity from '@civ-clone/library-unit/Actions/JoinCity';
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
import { aircraftRange } from '@civ-clone/civ1-unit/Rules/Player/turnEnd';
import {
  chooseGovernment,
  revolution,
} from '@civ-clone/civ1-government/lib/revolution';
import { Anarchy } from '@civ-clone/civ1-government/Governments';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import {
  changeSpecialist,
  changeWorkedTile,
  reassignWorkers,
} from '@civ-clone/civ1-city/lib/assignWorkers';
import {
  TopCitiesRow,
  defaultTopCitiesLimit,
  topCitiesEntries,
  topCitiesRows,
} from './lib/topCities';
import { CivilizationScore, civilizationScore } from './lib/civilizationScore';
import { GameOverDetails, gameOverDetails } from './lib/gameOver';
import GameResult from '@civ-clone/core-turn-based-game/GameResult';
import endGame from '@civ-clone/core-turn-based-game/lib/endGame';
import { instance as gameResultRegistryInstance } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import { levelOf } from '@civ-clone/civ1-difficulty/level';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as specialistRegistryInstance } from '@civ-clone/core-city/SpecialistRegistry';
import { instance as wonderRegistryInstance } from '@civ-clone/core-wonder/WonderRegistry';
import hasMet from './lib/hasMet';
import { intelligenceRows } from './lib/intelligence';
import Declaration from '@civ-clone/core-diplomacy/Declaration';
import {
  awaitTimeout,
  filterToReference,
  filterToReferenceAllExcept,
  standalone,
} from './Client/refs';
import { knownUnknownCity } from './Client/standIns';
import { sabotagedBuildKind } from './Client/notifications/diplomat';
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

    // TODO: These could be `HiddenAction`s. Need to add a `perform` method to actions too...
    this.#transport.receive('cheat', ({ name, value }): void => {
      if (name === 'RevealMap') {
        const playerWorld = playerWorldRegistryInstance.getByPlayer(
          this.player()
        );

        // A bit nasty... I wonder how slow this data transfer will be...
        const [tile] = playerWorld.entries();

        tile
          .tile()
          .map()
          .entries()
          .forEach((tile) => {
            if (playerWorld.includes(tile)) {
              return;
            }

            // Registering raises `player:visibility-changed`, which sends the tile as seeing it would (#342).
            playerWorld.register(tile);
          });
      }

      if (name === 'GrantAdvance') {
        const target = this.resolveCheatPlayer(value.player);

        if (!target) {
          return;
        }

        const playerResearch =
            playerResearchRegistryInstance.getByPlayer(target),
          Advances = advanceRegistryInstance.filter(
            (Advance) =>
              value.advances.includes(Advance.name) &&
              !playerResearch.completed(Advance)
          );

        if (Advances.length === 0) {
          return;
        }

        Advances.forEach((Advance) => playerResearch.addAdvance(Advance));

        // Rivals' `PlayerResearch` is never sent to the page, so patching it
        // would leak hidden state and hand the frontend a ref it never
        // received (#46).
        if (target === this.player()) {
          this.#patches.add(
            playerResearch.id(),
            playerResearch.toPlainObject(
              this.#dataFilter(filterToReference(Player))
            )
          );
        }
      }

      if (name === 'GrantGold') {
        const target = this.resolveCheatPlayer(value.player);

        if (!target) {
          return;
        }

        const playerTreasury =
          playerTreasuryRegistryInstance.getByPlayerAndType(target, Gold);

        playerTreasury.add(value.amount);

        // As above: a rival's `PlayerTreasury` stays off the wire (#46).
        if (target === this.player()) {
          this.#patches.add(
            playerTreasury.id(),
            playerTreasury.toPlainObject(
              this.#dataFilter(filterToReference(Player))
            )
          );
        }
      }

      if (name === 'ModifyUnit') {
        const { unitId, properties } = value;

        const [unit] = unitRegistryInstance.getBy('id', unitId);

        if (!unit) {
          return;
        }

        (
          ['attack', 'defence', 'moves', 'movement', 'visibility'] as (
            | 'attack'
            | 'defence'
            | 'moves'
            | 'movement'
            | 'visibility'
          )[]
        ).forEach((property) => {
          if (property in properties) {
            unit[property]().set(properties[property]!);
          }
        });

        this.#patches.add(
          unit.id(),
          unit.toPlainObject(this.#dataFilter(filterToReference(Player)))
        );
      }

      if (name === 'CreateUnit') {
        const { unitType, x, y } = value,
          target = this.resolveCheatPlayer(value.player),
          UnitType = this.cheatUnitTypes().find(
            (UnitType) => UnitType.name === unitType
          ),
          [firstTile] = playerWorldRegistryInstance
            .getByPlayer(this.player())
            .entries();

        if (!target || !UnitType || !firstTile) {
          return;
        }

        const world = firstTile.tile().map();

        if (
          !Number.isInteger(x) ||
          !Number.isInteger(y) ||
          x < 0 ||
          y < 0 ||
          x >= world.width() ||
          y >= world.height()
        ) {
          return;
        }

        // Constructing a unit registers it and emits `unit:created`, which is what sends the unit itself.
        new UnitType(null, target, world.get(x, y));

        // Our own new unit also needs our actions resent, or it can't be activated until something else resends them.
        if (target === this.player()) {
          this.#patches.actions();
        }
      }

      this.sendPatchData();
    });

    this.#transport.receive('cheatUnitTypes', () =>
      this.#transport.send(
        'cheatUnitTypes',
        this.cheatUnitTypes().map((UnitType) => UnitType.name)
      )
    );

    this.#transport.receive('cheatAdvances', (playerId) => {
      const target = this.resolveCheatPlayer(playerId ?? undefined);

      if (!target) {
        this.#transport.send('cheatAdvances', []);

        return;
      }

      const playerResearch = playerResearchRegistryInstance.getByPlayer(target);

      // Every advance not yet discovered, prerequisites or not, so a cheat can
      // jump straight to (say) Automobile.
      this.#transport.send(
        'cheatAdvances',
        advanceRegistryInstance
          .entries()
          .filter((Advance) => !playerResearch.completed(Advance))
          .map((Advance) => Advance.name)
      );
    });

    this.#transport.receive('cheatPlayers', () =>
      this.#transport.send(
        'cheatPlayers',
        playerRegistryInstance.entries().map((player) => ({
          id: player.id(),
          civilization: player.civilization().sourceClass().name,
          isLocal: player === this.player(),
        }))
      )
    );

    // Worked out here and sent as finished rows, so the UI learns nothing about rival cities beyond what the report
    //  shows (#124).
    this.#transport.receive('topCities', (limit) =>
      this.#transport.send('topCities', this.topCities(limit))
    );

    // The engine's `Score` rules add it up (#149).
    this.#transport.receive('civilizationScore', () =>
      this.#transport.send('civilizationScore', this.civilizationScore())
    );

    // Game → Retire: the game ends now, with your score (#176, #362).
    //  Once the game has ended, the ending shows again instead.
    this.#transport.receive('retire', () => {
      const gameResult =
        endGame(
          'retired',
          null,
          gameResultRegistryInstance,
          ruleRegistryInstance,
          turnInstance
        ) ?? gameResultRegistryInstance.get();

      // A new result has already been sent, by `game:over`.
      if (gameResult !== null && gameResult.scoringComplete()) {
        this.#transport.send('gameOver', this.gameOver(gameResult));
      }
    });

    // Keep playing after the game has ended: the score is final, and a turn loop waiting at the end of the turn goes on
    //  (#176).
    this.#transport.receive('gameContinue', () => {
      const gameResult = gameResultRegistryInstance.get();

      if (gameResult === null || gameResult.reason() === 'destroyed') {
        return;
      }

      gameResult.completeScoring();

      engineInstance.emit('game:continue');
    });

    // What a city can build, for the production picker (#324). Standalone, as a notification is, so the picker's list
    //  resolves on its own and brings nothing of the game with it. A build that is not ours has nothing to show.
    this.#transport.receive('cityBuildAvailable', (cityBuildId) => {
      const [cityBuild] = cityBuildRegistryInstance.getBy('id', cityBuildId);

      this.#transport.send(
        'cityBuildAvailable',
        cityBuild && cityBuild.city().player() === this.player()
          ? this.cityBuildAvailable(cityBuild)
          : { hierarchy: [], objects: {} }
      );
    });

    // The UI makes a unit active and asks for its actions, which the patches leave out for every other unit (#323). The
    //  answer is a patch of that unit alone, with its tiles as refs the UI already holds.
    this.#transport.receive('unitActions', (unitId) => {
      const [unit] = unitRegistryInstance.getBy('id', unitId);

      if (!unit || unit.player() !== this.player()) {
        return;
      }

      this.#setUnitWithActions(unit);

      this.#patches.update(unit.id(), () => {
        this.#actions.answering = unit;

        try {
          return this.serialiseUnit(unit);
        } finally {
          this.#actions.answering = null;
        }
      });

      this.sendPatchData();
    });

    // The intelligence report (F3, #58), worked out here for the same reason.
    this.#transport.receive('intelligence', () =>
      this.#transport.send(
        'intelligence',
        intelligenceRows(this.player(), (player) => this.hasMet(player))
      )
    );

    engineInstance.on('engine:plugins:load:failed', (packagePath, error) => {
      console.log(packagePath + ' failed to load');
      console.error(error);
    });

    engineInstance.on('player:visibility-changed', (tile, player) => {
      if (player !== this.player()) {
        return;
      }

      const playerWorld = playerWorldRegistryInstance.getByPlayer(
          this.player()
        ),
        playerTile = playerWorld.getByTile(tile);

      // A square newly seen in one of our cities' areas is one of its `tiles` from now on, where it was undiscovered
      //  (#411).
      if (!this.#automatedTurn()) {
        this.#patches.citiesAround(tile);
      }

      if (playerTile === null) {
        new Retryable(
          () => {
            const playerTile = playerWorld.getByTile(tile);

            if (playerTile === null) {
              return false;
            }

            this.#patches.seenTile(playerWorld, playerTile);

            return true;
          },
          2,
          20
        );

        return;
      }

      this.#patches.seenTile(playerWorld, playerTile);
    });

    ['unit:created', 'unit:defeated', 'unit:lost-at-sea'].forEach((event) => {
      engineInstance.on(event, (unit) => {
        const playerWorld = playerWorldRegistryInstance.getByPlayer(
            this.player()
          ),
          playerTile = playerWorld.getByTile(unit.tile());

        if (!playerTile) {
          return;
        }

        this.#patches.tile(playerTile);

        if (unit.player() !== this.player()) {
          return;
        }

        // The unit, the player's list of units, and its home city, which supports it (#411). Each is built when the
        //  patch is sent, so a unit gone by then, a Settlers that founded a city, isn't put back (#138).
        this.#patches.unit(unit);
        this.#patches.city(unit.city());

        if (event === 'unit:created') {
          this.#patches.playerKey('units');
        }
      });
    });

    ['unit:destroyed'].forEach((event) => {
      engineInstance.on(event, (unit: Unit) => {
        // A disbanded or destroyed unit leaves its square, whoever's it was (#138).
        this.#patches.tile(unit.tile());

        // It goes once more, marked destroyed, and then drops out of the player's list of units, which no longer holds
        //  it or the home city it kept (#459). Its home city no longer supports it (#411).
        this.#patches.unit(unit);
        this.#patches.city(unit.city());

        if (unit.player() === this.player()) {
          this.#patches.playerKey('units');
        }
      });
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

    ['unit:moved'].forEach((event) => {
      engineInstance.on(event, (unit: Unit, action: UnitAction) => {
        const playerWorld = playerWorldRegistryInstance.getByPlayer(
            this.player()
          ),
          fromTile = playerWorld.getByTile(action.from()),
          toTile = playerWorld.getByTile(action.to());

        if (!fromTile && !toTile) {
          return;
        }

        this.#patches.tile(fromTile);
        this.#patches.tile(toTile);

        // A Settlers joining a city makes it grow, so the city goes out in full, as `city:grow` sends it. In the tile
        //  patch alone the city is a ref, and would keep the size the UI already has (#243).
        if (action instanceof JoinCity) {
          const city = cityRegistryInstance.getByTile(action.to());

          if (city !== null) {
            this.#patches.city(city);
          }
        }

        // The unit, and the city that supports it, which may be unhappy about where it is now (#411).
        if (unit.player() === this.player() && !this.#automatedTurn()) {
          this.#patches.unit(unit);
          this.#patches.city(unit.city());
          this.#patches.onTiles(action.from(), action.to());
        }

        this.sendPatchData();
      });
    });

    [
      'tile-improvement:built',
      'tile-improvement:pillaged',
      'tile-improvement:removed',
    ].forEach((event) => {
      engineInstance.on(event, (tile) => this.#patches.tile(tile));
    });

    engineInstance.on(
      'city:captured',
      (city: City, capturingPlayer: Player, originalPlayer: Player) => {
        if (originalPlayer === this.player()) {
          // The city already belongs to the capturing player here, so resend ours: the city is gone from our list,
          //  and losing the capital changes every remaining city's corruption.
          this.#patches.wholePlayer(
            filterToReferenceAllExcept(Player, PlayerAction, Civilization)
          );

          Object.assign(this.#cityNews.of(city), {
            capturedBy: capturingPlayer,
            capturedFrom: originalPlayer,
          });

          return;
        }

        if (capturingPlayer === this.player()) {
          this.#notifier.notify(
            new Notification('City.captured-by-us', {
              city,
              capturingPlayer,
              originalPlayer,
            })
          );

          return;
        }
      }
    );

    // The map draws a city from its tile: its size, or an unhappy citizen in civil disorder (#193). Our own city is a
    //  ref in the tile patch, so it goes out in full along with it: a new or captured city the frontend has never had,
    //  or a size or disorder the map draws from it. Not a destroyed one.
    const cityChanged = (
      city: City,
      destroyed: boolean = false,
      listChanged: boolean = false
    ): void => {
      const playerWorld = playerWorldRegistryInstance.getByPlayer(
          this.player()
        ),
        playerTile = playerWorld.getByTile(city.tile());

      if (!playerTile) {
        return;
      }

      const unknownCity = knownUnknownCity(city);

      if (unknownCity) {
        this.#patches.update(unknownCity.id(), () => {
          unknownCity.update(city);

          return unknownCity.toPlainObject(
            this.#dataFilter(filterToReference(Tile, Unit, Player))
          );
        });
      }

      this.#patches.tile(playerTile);

      if (!destroyed) {
        this.#patches.city(city);
      }

      // A city founded, captured or destroyed is added to or gone from the player's list of cities (#411).
      if (listChanged && city.player() === this.player()) {
        this.#patches.playerKey('cities');
      }
    };

    [
      'city:created',
      'city:captured',
      'city:grow',
      'city:shrink',
      // A rival's city in disorder shows on the map as your own does (#265). The engine raises
      //  `city:civil-disorder` before it records the disorder, which is why the city is only read when the patch is
      //  built.
      'city:civil-disorder',
      'city:order-restored',
    ].forEach((event) =>
      engineInstance.on(event, (city: City) =>
        cityChanged(
          city,
          false,
          ['city:created', 'city:captured'].includes(event)
        )
      )
    );

    engineInstance.on('city:destroyed', (city: City, player: Player | null) => {
      cityChanged(city, true, true);

      Object.assign(this.#cityNews.of(city), {
        destroyed: true,
        destroyedBy: player ?? null,
      });
    });

    // Which city works a tile is part of the tile (`workedBy`), so it goes out whenever that changes (#138): a city
    //  founded, growing, shrinking or destroyed, a tile the player chose, workers reassigned, an enemy unit in the way.
    //  The city's yields change with it, so ours goes too (#411): a city founded next to it takes a square it worked.
    ['city:tile-worked', 'city:tile-released'].forEach((event) =>
      engineInstance.on(event, (city: City, tile: Tile) => {
        this.#patches.tile(tile);

        if (!this.#automatedTurn()) {
          this.#patches.city(city);
        }
      })
    );

    // A government's yields reach every tile and city, so a change of government resends them all: whatever changed
    //  it, a revolution, a new government chosen, or one that collapsed.
    engineInstance.on('player:government:changed', (player: Player) => {
      if (player === this.player()) {
        this.#patches.allTilesAndCities();
      }
    });

    // A nuclear detonation (#129). The engine announces it before anything changes, and patches are only built when
    //  they're sent, so every square in the 3×3 area and every city in it is queued here and read once the units are
    //  gone and the cities halved.
    engineInstance.on('unit:nuclear-detonation', (unit: Unit, tile: Tile) => {
      const area = [tile, ...tile.getNeighbours()],
        cities = area
          .map((areaTile) => cityRegistryInstance.getByTile(areaTile))
          .filter((city): city is City => city !== null);

      area.forEach((areaTile) => this.#patches.tile(areaTile));

      cities.forEach((city) => cityChanged(city));

      if (
        cities.some((city) => city.player() === this.player()) ||
        area.some((areaTile) =>
          unitRegistryInstance
            .getByTile(areaTile)
            .some((areaUnit) => areaUnit.player() === this.player())
        )
      ) {
        this.#patches.wholePlayer(
          filterToReferenceAllExcept(
            Player,
            PlayerAction,
            Unit,
            UnitAction,
            Yield,
            Civilization
          )
        );
      }

      if (unit.player() === this.player()) {
        return;
      }

      this.#notifier.notify(
        new Notification('Unit.nuclear-attack', {
          player: unit.player(),
        })
      );
    });

    // "Pollution near Rome." (#32).
    engineInstance.on('city:polluted', (city: City) => {
      if (city.player() !== this.player()) {
        return;
      }

      this.#notifier.notify(
        new Notification('City.polluted', {
          city,
        })
      );
    });

    engineInstance.on('city:sdi-protected', (city: City, unit: Unit) => {
      if (city.player() !== this.player() && unit.player() !== this.player()) {
        return;
      }

      this.#notifier.notify(
        new Notification('City.sdi-protected', {
          city,
        })
      );
    });

    engineInstance.on('unit:lost-at-sea', (unit: Unit) => {
      if (unit.player() !== this.player()) {
        return;
      }

      this.#notifier.notify(
        new Notification(
          aircraftRange.some(([UnitType]) => unit instanceof UnitType)
            ? 'Unit.out-of-fuel'
            : 'Unit.lost-at-sea',
          {
            unit,
          }
        )
      );
    });

    engineInstance.on('unit:unsupported', (city: City, unit: Unit) => {
      if (city.player() !== this.player()) {
        return;
      }

      this.#notifier.notify(
        new Notification('City.unit-unsupported', {
          city,
          unit,
        })
      );
    });

    engineInstance.on(
      'city:unsupported-improvement',
      (city: City, cityImprovement: CityImprovement) => {
        if (city.player() !== this.player()) {
          return;
        }

        this.#notifier.notify(
          new Notification('City.improvement-unsupported', {
            city,
            cityImprovement,
          })
        );
      }
    );

    engineInstance.on(
      'unit:trade-route-established',
      (
        player: Player,
        home: City,
        city: City,
        goods: string,
        bonus: number
      ) => {
        if (player !== this.player()) {
          return;
        }

        // Both cities' trade changes (#411).
        this.#patches.city(home);
        this.#patches.city(city);

        this.#notifier.notify(
          new Notification('Unit.trade-route-established', {
            bonus,
            city,
            goods,
            home,
          })
        );
      }
    );

    // A Diplomat's work (#58): the player who sent it and the player it was done to are both told, as v474.05 tells
    //  them.
    engineInstance.on(
      'player:advance-stolen',
      (thief: Player, victim: Player, AdvanceType: typeof Advance) => {
        if (![thief, victim].includes(this.player())) {
          return;
        }

        this.#notifier.notify(
          new Notification('Diplomat.advance-stolen', {
            advance: AdvanceType.name,
            thief,
          })
        );
      }
    );

    engineInstance.on(
      'city:sabotaged',
      (city: City, saboteur: Player, target: unknown) => {
        if (![saboteur, city.player()].includes(this.player())) {
          return;
        }

        this.#notifier.notify(
          target instanceof CityImprovement
            ? new Notification('Diplomat.sabotaged.improvement', {
                city,
                improvement: target.sourceClass().name,
              })
            : new Notification(
                'Diplomat.sabotaged.production' + sabotagedBuildKind(target),
                {
                  city,
                  build: {
                    _:
                      typeof target === 'function'
                        ? (target as Function).name
                        : '',
                  },
                }
              )
        );
      }
    );

    engineInstance.on(
      'city:incited',
      (city: City, inciter: Player, originalPlayer: Player) => {
        if (![inciter, originalPlayer].includes(this.player())) {
          return;
        }

        this.#notifier.notify(
          new Notification('Diplomat.incited', {
            city,
            inciter,
            originalPlayer,
          })
        );
      }
    );

    // Only the side that lost the unit is told, as in v474.05: the briber has seen the price paid.
    engineInstance.on(
      'unit:bribed',
      (unit: Unit, briber: Player, previousOwner: Player) => {
        if (previousOwner !== this.player()) {
          return;
        }

        this.#notifier.notify(
          new Notification('Diplomat.unit-bribed', {
            briber,
            previousOwner,
            unit: unit.sourceClass().name,
          })
        );
      }
    );

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

    // A bribed or defecting unit stays where it is but changes colour, and moves between the two players' lists.
    engineInstance.on(
      'unit:transferred',
      (unit: Unit, player: Player, previousPlayer: Player) => {
        this.#patches.tile(unit.tile());

        if (![player, previousPlayer].includes(this.player())) {
          return;
        }

        this.#patches.wholePlayer(
          filterToReference(PlayerWorld, PlayerTile, Tile, City)
        );
      }
    );

    // Famine (#400). A city shrinks for many reasons, most of them told some other way or not at all (Settlers built,
    //  no Aqueduct), so a shrinking city has no notice of its own. `city:shrink` carries its cause (the Settlers, the
    //  Attack lost, `Aqueduct`, `FoodExhausted`, `Captured`) for any that should have one.
    engineInstance.on('city:food-storage-exhausted', (city: City) => {
      this.#cityNews.of(city).famine = true;
    });

    engineInstance.on('city:building-complete', (cityBuild, build) => {
      const playerWorld = playerWorldRegistryInstance.getByPlayer(
        this.player()
      );

      if (
        cityBuild.city().player() !== this.player() &&
        build instanceof Wonder
      ) {
        // Only the city (sent as an `UnknownCity`) and the wonder: `cityBuild` is the other player's build queue, and
        //  a city we have never seen is not named at all (#43).
        this.#notifier.notify(
          playerWorld.getByTile(cityBuild.city().tile())
            ? new Notification('Wonder.building-complete.other-player.known', {
                city: cityBuild.city(),
                build,
              })
            : new Notification(
                'Wonder.building-complete.other-player.unknown',
                {
                  build,
                }
              )
        );

        return;
      }

      if (cityBuild.city().player() !== this.player()) {
        return;
      }

      this.#patches.update(cityBuild.id(), () =>
        cityBuild.toPlainObject(
          this.#dataFilter(filterToReference(Tile, Unit, Player))
        )
      );

      const suffix =
        build instanceof Unit
          ? 'unit'
          : build instanceof Wonder
          ? 'wonder'
          : build instanceof CityImprovement
          ? 'city-improvement'
          : build instanceof Part
          ? 'spaceship-part'
          : 'other';

      this.#notifier.notify(
        new Notification('City.building-complete.' + suffix, {
          cityBuild,
          build,
        })
      );
    });

    engineInstance.on('player:research-complete', (playerResearch, advance) => {
      if (playerResearch.player() !== this.player()) {
        return;
      }

      this.#patches.update(playerResearch.id(), () =>
        playerResearch.toPlainObject(
          this.#dataFilter(filterToReference(Player))
        )
      );

      this.#notifier.notify(
        new Notification('Player.research-complete', {
          playerResearch,
          advance,
          // Which one this is, for an advance a player can hold more than one of (Future Technology 1, 2, …).
          number: playerResearch
            .complete()
            .filter((known: Advance) => known instanceof advance.sourceClass())
            .length,
        })
      );
    });

    engineInstance.on('wonder:obsolete', (wonder: Wonder, city: City) => {
      if (city.player() !== this.player()) {
        return;
      }

      this.#notifier.notify(
        new Notification(
          'Wonder.obsolete',
          {
            city,
            wonder,
          },
          true
        )
      );
    });

    // Barracks at Gunpowder and Combustion (#184). As in Civ1, the player is told even when there were none to remove,
    //  because rebuilding them now costs more.
    engineInstance.on(
      'city-improvement:obsolete',
      (
        player: Player,
        advance: Advance,
        ImprovementType: typeof CityImprovement,
        cityImprovements: CityImprovement[]
      ) => {
        if (player !== this.player()) {
          return;
        }

        cityImprovements.forEach((cityImprovement) =>
          this.#patches.city(cityImprovement.city())
        );

        this.#notifier.notify(
          new Notification(
            'CityImprovement.obsolete',
            {
              advance,
              improvement: ImprovementType.name,
            },
            true
          )
        );
      }
    );

    engineInstance.on(
      'goody-hut:action-performed',
      (goodyHut: GoodyHut, action) => {
        const tile = goodyHut.tile(),
          units = unitRegistryInstance.getByTile(tile);

        // The hut is gone from the square, whoever found it (#138).
        this.#patches.tile(tile);

        if (!units.some((unit: Unit) => unit.player() === this.player())) {
          return;
        }

        this.#notifier.notify(
          new Notification(
            `GoodyHut.action-performed.${action.constructor.name}`,
            {
              goodyHut,
              action,
            }
          )
        );
      }
    );

    // However the game ends, the ending window says so (#176). Our own destruction is one of the endings.
    engineInstance.on('game:over', (gameResult: GameResult) =>
      this.#transport.send('gameOver', this.gameOver(gameResult))
    );

    // A game saved after it ended, and before the players chose to keep playing, ends again as it loads.
    engineInstance.on('game:loaded', () => {
      const gameResult = gameResultRegistryInstance.get();

      if (gameResult !== null && !gameResult.scoringComplete()) {
        this.#transport.send('gameOver', this.gameOver(gameResult));
      }
    });

    engineInstance.on('game:retirement-warning', () =>
      this.#notifier.notify(
        new Notification('Game.retirement-warning', {
          player: this.player(),
        })
      )
    );

    engineInstance.on(
      'player:defeated',
      (defeatedPlayer: Player, player: Player | null) => {
        // The ending window tells us (`game:over`). After you've kept playing from an earlier ending the game can't
        //  end again, so the destruction is sent as an ending of its own.
        if (defeatedPlayer === this.player()) {
          const gameResult = gameResultRegistryInstance.get();

          if (gameResult !== null && gameResult.scoringComplete()) {
            this.#transport.send(
              'gameOver',
              this.gameOver(
                new GameResult('destroyed', null, turnInstance.value())
              )
            );
          }

          return;
        }

        // A civilization we have not met is neither named nor sent (#59).
        const victor = player !== null && this.hasMet(player) ? player : null;

        this.#notifier.notify(
          this.hasMet(defeatedPlayer)
            ? new Notification(
                victor === null
                  ? 'Player.defeated.unknown'
                  : 'Player.defeated.by',
                {
                  defeatedPlayer,
                  player: victor,
                }
              )
            : new Notification(
                victor === null
                  ? 'Player.defeated.unmet'
                  : 'Player.defeated.unmet-by',
                {
                  player: victor,
                }
              )
        );
      }
    );

    engineInstance.on('city:civil-disorder', (city: City) => {
      if (city.player() === this.player()) {
        this.#notifier.notify(
          new Notification('City.civil-disorder', {
            city,
          })
        );
      }
    });

    engineInstance.on('city:order-restored', (city: City) => {
      if (city.player() === this.player()) {
        this.#notifier.notify(
          new Notification('City.order-restored', {
            city,
          })
        );
      }
    });

    engineInstance.on(
      'player:government:collapsed',
      (player: Player, city: City) => {
        if (player !== this.player()) {
          return;
        }

        // With the Pyramids there's no Anarchy, and the new government is
        // chosen straight away.
        this.#notifier.notify(
          new Notification(
            playerGovernmentRegistryInstance.getByPlayer(player).is(Anarchy)
              ? 'Player.government-collapsed'
              : 'Player.government-collapsed.pyramids',
            {
              city,
            }
          )
        );
      }
    );

    engineInstance.on('city:leader-celebration', (city: City) => {
      if (city.player() === this.player()) {
        this.#notifier.notify(
          new Notification('City.leader-celebration', {
            city,
          })
        );
      }
    });

    engineInstance.on('city:leader-celebration-ended', (city: City) => {
      if (city.player() === this.player()) {
        this.#notifier.notify(
          new Notification('City.leader-celebration-ended', {
            city,
          })
        );
      }
    });

    // A destroyed civilization comes back as a new one (#178). We haven't met the new one, so it isn't named (#59); the
    //  one it replaces is, if we knew it.
    engineInstance.on(
      'player:respawned',
      (player: Player, defeatedPlayer: Player) => {
        this.#notifier.notify(
          this.hasMet(defeatedPlayer)
            ? new Notification('Player.respawned', { defeatedPlayer }, true)
            : new Notification('Player.respawned.unmet', {}, true)
        );
      }
    );

    engineInstance.on('player:spaceship:part-built', (player: Player) => {
      if (this.player() === player) {
        return;
      }

      this.#notifier.notify(
        this.hasMet(player)
          ? new Notification('Spaceship.part-built', {
              player,
            })
          : new Notification('Spaceship.part-built.unmet', {})
      );
    });

    // A ship is lost when its civilization loses its capital or is destroyed (#177): one in flight returns to Earth,
    //  one being built is cancelled. News of a civilization we haven't met doesn't reach us.
    engineInstance.on(
      'player:spaceship:lost',
      (player: Player, launched: boolean) => {
        if (this.player() !== player && !this.hasMet(player)) {
          return;
        }

        this.#notifier.notify(
          new Notification(
            launched ? 'Spaceship.returned' : 'Spaceship.cancelled',
            {
              player,
            }
          )
        );
      }
    );

    engineInstance.on('player:spaceship:landed', (player: Player) => {
      if (this.player() !== player) {
        return;
      }

      this.#notifier.notify(
        new Notification('Player.spaceship-landed', {
          player,
        })
      );
    });

    engineInstance.on(
      'player:declaration-expired',
      (player: Player, declaration: Declaration) => {
        if (player !== this.player()) {
          return;
        }

        this.#notifier.notify(
          new Notification('Player.declaration-expired', {
            player,
            declaration,
            enemy: declaration
              .players()
              .filter((declarationPlayer) => declarationPlayer !== player)[0],
          })
        );
      }
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

  // Resolves a cheat's target: no id means the local player, an id matching a
  // registered player means that player (rival or not), and any other id
  // means nothing found, which the caller treats as "do nothing".

  // Every unit type the game knows, taken from what cities can be told to build.
  private cheatUnitTypes(): (typeof Unit)[] {
    return availableCityBuildItemsRegistryInstance
      .entries()
      .filter(
        (Item): Item is typeof Unit =>
          Item === (Unit as unknown) ||
          Object.prototype.isPrototypeOf.call(Unit, Item)
      );
  }

  private resolveCheatPlayer(id?: string): Player | null {
    if (!id) {
      return this.player();
    }

    return (
      playerRegistryInstance.entries().find((player) => player.id() === id) ??
      null
    );
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
    const available = cityBuild.available(),
      filter = this.#dataFilter(standalone);

    // `toPlainObject` is a method on `DataObject`, and it is the only way in: the filter is applied to what it is called
    //  on first, so handing it the list in place of the build gets the list serialised, as the `hierarchy`.
    return cityBuild.toPlainObject((object: any) =>
      object === cityBuild ? available : filter(object)
    );
  }

  civilizationScore(): CivilizationScore {
    return civilizationScore(this.player(), {
      gameResults: gameResultRegistryInstance,
      playerWorlds: playerWorldRegistryInstance,
      rules: ruleRegistryInstance,
    });
  }

  // How the game ended, for the ending window (#176).
  gameOver(gameResult: GameResult): GameOverDetails {
    const difficulty = gameDifficultyRegistryInstance.get();

    let discoveries: Advance[] = [];

    try {
      discoveries = playerResearchRegistryInstance
        .getByPlayer(this.player())
        .complete();
    } catch (e) {
      // A player with no research (yet) has discovered nothing.
    }

    return gameOverDetails(gameResult, this.player(), {
      difficulty: difficulty === null ? null : typeNameOf(difficulty),
      discovery:
        discoveries.length === 0
          ? null
          : typeNameOf(discoveries[discoveries.length - 1].sourceClass()),
      hasMet: (player: Player) => this.hasMet(player),
      level: levelOf(gameDifficultyRegistryInstance),
      score: this.civilizationScore(),
      year: yearInstance.value(gameResult.turn()),
    });
  }

  topCities(limit: number = defaultTopCitiesLimit): TopCitiesRow[] {
    return topCitiesRows(
      topCitiesEntries(this.player(), {
        cities: cityRegistryInstance,
        cityGrowths: cityGrowthRegistryInstance,
        specialists: specialistRegistryInstance,
        wonders: wonderRegistryInstance,
        playerWorlds: playerWorldRegistryInstance,
        hasMet: (player: Player) => this.hasMet(player),
      }),
      Number.isInteger(limit) && limit > 0 ? limit : defaultTopCitiesLimit
    );
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
