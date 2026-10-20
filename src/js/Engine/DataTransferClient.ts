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
import Busy from '@civ-clone/core-unit/Rules/Busy';
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
import DataObject, {
  ObjectMap,
  typeNameOf,
} from '@civ-clone/core-data-object/DataObject';
import DataQueue from './DataQueue';
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
import PlayerTreasury from '@civ-clone/core-treasury/PlayerTreasury';
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
import UnknownPlayer from './UnknownObjects/Player';
import UnknownUnit from './UnknownObjects/Unit';
import Wonder from '@civ-clone/core-wonder/Wonder';
import Yield from '@civ-clone/core-yield/Yield';
import JoinCity from '@civ-clone/library-unit/Actions/JoinCity';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
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
import actionResult from './AdditionalData/actionResult';
import anarchyTurns from './AdditionalData/anarchyTurns';
import civilDisorderDeclared from './AdditionalData/civilDisorderDeclared';
import {
  calculateCitizenState,
  citizenSummary,
} from '@civ-clone/civ1-city-happiness/lib/calculateCitizenState';
import {
  TopCitiesRow,
  defaultTopCitiesLimit,
  topCitiesRows,
} from './lib/topCities';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as specialistRegistryInstance } from '@civ-clone/core-city/SpecialistRegistry';
import { instance as wonderRegistryInstance } from '@civ-clone/core-wonder/WonderRegistry';
import { intelligenceRows } from './lib/intelligence';
import {
  isUnitWithoutActions,
  unitWithoutActions,
} from './lib/unitWithoutActions';
import playerWithoutActions from './lib/playerWithoutActions';
import researchCosts from './AdditionalData/researchCosts';
import tradeRoutes from './AdditionalData/tradeRoutes';
import Declaration from '@civ-clone/core-diplomacy/Declaration';

// What a player's action is, which stays the same though `actions()` makes it afresh, with a new id, every time
//  (#411): what kind it is and what it acts on.
const actionKey = (action: PlayerAction): string => {
  const value = action.value();

  return `${action.constructor.name} ${
    value instanceof DataObject ? value.id() : JSON.stringify(value ?? null)
  }`;
};

const awaitTimeout = (delay: number, reason?: any) =>
  new Promise<void>((resolve, reject) =>
    setTimeout(() => (reason === undefined ? resolve() : reject(reason)), delay)
  );

const referenceObject = (object: any) =>
    object instanceof DataObject
      ? {
          '#ref': object.id(),
        }
      : object,
  filterToReference =
    (...types: (new (...args: any[]) => any)[]) =>
    (object: any) =>
      types.some((Type) => object instanceof Type)
        ? referenceObject(object)
        : object,
  filterToReferenceAllExcept =
    (...types: (new (...args: any[]) => any)[]) =>
    (object: any) =>
      types.some((Type) => object instanceof Type)
        ? object
        : referenceObject(object),
  // For a payload the UI reconstitutes on its own rather than merging into the game data, so it cannot carry refs: a
  //  player or a tile says who and where, and no more (#130).
  standalone = (object: any) =>
    object instanceof Player
      ? {
          _: 'Player',
          id: object.id(),
          civilization: object.civilization(),
        }
      : object instanceof PlayerTile
      ? { _: 'PlayerTile', id: object.id(), x: object.x(), y: object.y() }
      : object;

additionalDataRegistryInstance.register(
  actionResult(),
  anarchyTurns(),
  civilDisorderDeclared(),
  researchCosts(),
  tradeRoutes()
);

// What kind of thing a sabotaged city was building, which says where its name is translated, as `City.building-complete`
//  notices do (#58). `target` is the class being built, or nothing.
const sabotagedBuildKind = (target: unknown): string => {
  const is = (Type: Function): boolean =>
    typeof target === 'function' &&
    Object.prototype.isPrototypeOf.call(Type, target);

  return is(Unit)
    ? '.unit'
    : is(Wonder)
    ? '.wonder'
    : is(CityImprovement)
    ? '.city-improvement'
    : is(Part)
    ? '.spaceship-part'
    : '';
};

const unknownPlayers: WeakMap<Player, UnknownPlayer> = new WeakMap(),
  unknownUnits: WeakMap<Unit, UnknownUnit> = new WeakMap(),
  unknownCities: WeakMap<City, UnknownCity> = new WeakMap();

// A `CityBuild` without `available` (#324). Working out what every city could build was most of every player patch (a
//  production change in a large game sent 500 KB of it, all for the one picker that reads it), so the picker asks for
//  it when it opens (`cityBuildAvailable`). `toPlainObject` only reads what `keys()` names, so a stand-in that names
//  fewer is enough; it shares the id, and so the entry in the UI's data, with the build it stands in for. A stand-in is
//  an `instanceof CityBuild` itself, which is why `standsInForCityBuild` is there for the filter to check.
const cityBuildStandIns: WeakMap<CityBuildItem, CityBuildItem> = new WeakMap(),
  standsInForCityBuild: WeakSet<CityBuildItem> = new WeakSet(),
  withoutAvailable = (cityBuild: CityBuildItem): CityBuildItem => {
    if (!cityBuildStandIns.has(cityBuild)) {
      const standIn: CityBuildItem = Object.create(cityBuild, {
        keys: {
          value: () => cityBuild.keys().filter((key) => key !== 'available'),
        },
      });

      standsInForCityBuild.add(standIn);
      cityBuildStandIns.set(cityBuild, standIn);
    }

    return cityBuildStandIns.get(cityBuild)!;
  };

// What happened to a city during one engine call (#400, #420).
type CityNews = {
  // Whose it was when it was first heard of.
  ours: boolean;
  capturedBy: Player | null;
  capturedFrom: Player | null;
  destroyed: boolean;
  destroyedBy: Player | null;
  famine: boolean;
};

export class DataTransferClient extends Client implements IClient {
  #automationClient: AIClient;
  #automationEnabled: boolean;
  // Set while the action listener is handling one of the human's actions, so the several flushes an action causes (the
  //  moved unit's tiles, then the player) go out as a single patch once it is done (#321).
  #holdingFlushes = false;
  // Tiles go as refs unless asked for in full (#138). A `PlayerTile` goes in full in a tile patch (`serialiseTile`), and
  //  in the payloads that cannot hold refs, or that bring the frontend tiles it has never had: the initial game data and
  //  an investigated city. Everywhere else the frontend already holds every tile the player knows, and a tile that
  //  changes is sent on its own, so a tile in full there is only payload.
  #dataFilter =
    (
      localFilter = (object: any) => object,
      { tilesInFull = false }: { tilesInFull?: boolean } = {}
    ) =>
    // `Busy` as well as `DataObject`, because that is what `toPlainObject`
    // actually hands a filter: it walks every field, and `Unit._busy` holds a
    // rule. Typed as `DataObject` alone, the `instanceof Busy` branch below
    // narrows to `DataObject & Busy` — and since `core-rule@0.1.5` gave `Rule`
    // a `private _id` for rule identity, alongside `DataObject`'s own, that
    // intersection is `never` and the renderer stops compiling.
    (object: DataObject | Busy) => {
      // The player's actions are going out some other way, made afresh, and the frontend will hold those instead.
      if (object instanceof PlayerAction && !this.#serialisingActions) {
        this.#forgetHeldActions();
      }

      if (object instanceof Player && object !== this.player()) {
        if (!unknownPlayers.has(object)) {
          unknownPlayers.set(object, UnknownPlayer.fromPlayer(object));
        }

        return unknownPlayers.get(object);
      }

      if (object instanceof Unit && object.player() !== this.player()) {
        if (!unknownUnits.has(object)) {
          unknownUnits.set(object, UnknownUnit.fromUnit(object));
        }

        return unknownUnits.get(object);
      }

      // The player's units go out without their actions, but for the one the UI has them for (#323).
      if (
        object instanceof Unit &&
        object.player() === this.player() &&
        !isUnitWithoutActions(object) &&
        !this.#sendsUnitActions(object)
      ) {
        return localFilter(unitWithoutActions(object));
      }

      if (object instanceof City && object.player() !== this.player()) {
        if (!unknownCities.has(object)) {
          unknownCities.set(object, UnknownCity.fromCity(object));
        }

        return unknownCities.get(object);
      }

      if (object instanceof Tile) {
        const playerWorld = playerWorldRegistryInstance.getByPlayer(
            this.player()
          ),
          playerTile = playerWorld.get(object.x(), object.y());

        // The caller's filter applies to the tile that is actually sent (#130). Only a tile the player knows can be a
        //  ref: an undiscovered one is made up afresh, with a new id, on every call, so it goes inline.
        return playerTile instanceof PlayerTile
          ? this.#filterPlayerTile(playerTile, localFilter, tilesInFull)
          : playerTile;
      }

      if (object instanceof PlayerTile) {
        return this.#filterPlayerTile(object, localFilter, tilesInFull);
      }

      if (object instanceof Busy) {
        return {
          _: object.constructor.name,
        };
      }

      // Not `available`, which the picker fetches itself (#324). The filter sees the stand-in again when it is the thing
      //  being walked, so it is not wrapped twice.
      if (
        object instanceof CityBuildItem &&
        !standsInForCityBuild.has(object) &&
        object.city().player() === this.player()
      ) {
        return localFilter(withoutAvailable(object));
      }

      return localFilter(object);
    };
  #dataQueue: DataQueue = new DataQueue();
  // The tiles in the queue, each sent once a flush (#138).
  #queuedTiles: Set<PlayerTile> = new Set();
  // The ids of the units, cities and parts of the player in the queue, each sent once a flush (#411).
  #queued: Set<string> = new Set();
  // The player's actions as the frontend was last sent them by `#sendActions`, by what each is (#411), and what each
  //  list was. `null` once they have gone some other way, in the whole player, as fresh objects the frontend holds in
  //  place of these.
  #heldActions: Map<string, PlayerAction> | null = null;
  #heldActionKeys: string[] | undefined = undefined;
  #heldMandatoryActions: string[] | undefined = undefined;
  // Set while `#sendActions` serialises them, or a test compares with them, which leave the actions held alone.
  #serialisingActions = false;
  #eventEmitter: EventEmitter;
  // Whether the UI has been handed this player's turn: `turnStarted` is sent and `action`s are listened for. Until then,
  //  our own notifications are held (see `sendNotification`).
  #handedOver: boolean = false;
  #heldNotifications: Notification[] = [];
  // What happened to each city during the engine call under way, told to the player once it's over (#400, #420), so a
  //  city lost or starved gets one notice. Capturing a size 1 city destroys it before `city:captured` is emitted, and
  //  by then it is the capturer's, so neither event alone says that we lost it, or how.
  #cityNews: Map<City, CityNews> = new Map();
  #cityNewsQueued = false;
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
  // The unit sent with its actions (#323): the one that last acted, or the one the UI last asked about. It is the UI's
  //  active unit, so its actions go out while it can use them, and the next unit's are asked for when it moves on.
  #unitWithActions: Unit | null = null;
  // While a `unitActions` request is answered: the unit asked about goes out with its actions whatever its state, so
  //  the UI is never left asking again.
  #answeringUnitActions: Unit | null = null;

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
          this.#dataQueue.add(
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
          this.#dataQueue.add(
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

        this.#dataQueue.add(
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
          this.#sendActions();
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

      this.#dataQueue.update(unit.id(), () => {
        this.#answeringUnitActions = unit;

        try {
          return this.serialiseUnit(unit);
        } finally {
          this.#answeringUnitActions = null;
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
        this.#sendCitiesAround(tile);
      }

      if (playerTile === null) {
        new Retryable(
          () => {
            const playerTile = playerWorld.getByTile(tile);

            if (playerTile === null) {
              return false;
            }

            this.#queuedTiles.add(playerTile);
            this.#dataQueue.add(
              playerWorld.id(),
              () => this.serialiseTile(playerTile),
              `tiles[${playerWorld.entries().indexOf(playerTile)}]`
            );

            return true;
          },
          2,
          20
        );

        return;
      }

      this.#queuedTiles.add(playerTile);
      this.#dataQueue.add(
        playerWorld.id(),
        () => this.serialiseTile(playerTile),
        `tiles[${playerWorld.entries().indexOf(playerTile)}]`
      );
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

        this.#sendTile(playerTile);

        if (unit.player() !== this.player()) {
          return;
        }

        // The unit, the player's list of units, and its home city, which supports it (#411). Each is built when the
        //  patch is sent, so a unit gone by then, a Settlers that founded a city, isn't put back (#138).
        this.#sendUnit(unit);
        this.#sendCity(unit.city());

        if (event === 'unit:created') {
          this.#sendPlayerKey('units');
        }
      });
    });

    ['unit:destroyed'].forEach((event) => {
      engineInstance.on(event, (unit: Unit) => {
        // A disbanded or destroyed unit leaves its square, whoever's it was (#138).
        this.#sendTile(unit.tile());

        // It goes once more, marked destroyed, and then drops out of the player's list of units, which no longer holds
        //  it or the home city it kept (#459). Its home city no longer supports it (#411).
        this.#sendUnit(unit);
        this.#sendCity(unit.city());

        if (unit.player() === this.player()) {
          this.#sendPlayerKey('units');
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
      this.#sendUnit(unit);

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

        this.#sendTile(fromTile);
        this.#sendTile(toTile);

        // A Settlers joining a city makes it grow, so the city goes out in full, as `city:grow` sends it. In the tile
        //  patch alone the city is a ref, and would keep the size the UI already has (#243).
        if (action instanceof JoinCity) {
          const city = cityRegistryInstance.getByTile(action.to());

          if (city !== null) {
            this.#sendCity(city);
          }
        }

        // The unit, and the city that supports it, which may be unhappy about where it is now (#411).
        if (unit.player() === this.player() && !this.#automatedTurn()) {
          this.#sendUnit(unit);
          this.#sendCity(unit.city());
          this.#sendOnTiles(action.from(), action.to());
        }

        this.sendPatchData();
      });
    });

    [
      'tile-improvement:built',
      'tile-improvement:pillaged',
      'tile-improvement:removed',
    ].forEach((event) => {
      engineInstance.on(event, (tile) => this.#sendTile(tile));
    });

    engineInstance.on(
      'city:captured',
      (city: City, capturingPlayer: Player, originalPlayer: Player) => {
        if (originalPlayer === this.player()) {
          // The city already belongs to the capturing player here, so resend ours: the city is gone from our list,
          //  and losing the capital changes every remaining city's corruption.
          this.#sendWholePlayer(
            filterToReferenceAllExcept(Player, PlayerAction, Civilization)
          );

          Object.assign(this.#newsOf(city), {
            capturedBy: capturingPlayer,
            capturedFrom: originalPlayer,
          });

          return;
        }

        if (capturingPlayer === this.player()) {
          this.sendNotification(
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

      if (unknownCities.has(city)) {
        const unknownCity = unknownCities.get(city)!;

        this.#dataQueue.update(unknownCity.id(), () => {
          unknownCity.update(city);

          return unknownCity.toPlainObject(
            this.#dataFilter(filterToReference(Tile, Unit, Player))
          );
        });
      }

      this.#sendTile(playerTile);

      if (!destroyed) {
        this.#sendCity(city);
      }

      // A city founded, captured or destroyed is added to or gone from the player's list of cities (#411).
      if (listChanged && city.player() === this.player()) {
        this.#sendPlayerKey('cities');
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

      Object.assign(this.#newsOf(city), {
        destroyed: true,
        destroyedBy: player ?? null,
      });
    });

    // Which city works a tile is part of the tile (`workedBy`), so it goes out whenever that changes (#138): a city
    //  founded, growing, shrinking or destroyed, a tile the player chose, workers reassigned, an enemy unit in the way.
    //  The city's yields change with it, so ours goes too (#411): a city founded next to it takes a square it worked.
    ['city:tile-worked', 'city:tile-released'].forEach((event) =>
      engineInstance.on(event, (city: City, tile: Tile) => {
        this.#sendTile(tile);

        if (!this.#automatedTurn()) {
          this.#sendCity(city);
        }
      })
    );

    // A government's yields reach every tile and city, so a change of government resends them all: whatever changed
    //  it, a revolution, a new government chosen, or one that collapsed.
    engineInstance.on('player:government:changed', (player: Player) => {
      if (player === this.player()) {
        this.governmentChanged();
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

      area.forEach((areaTile) => this.#sendTile(areaTile));

      cities.forEach((city) => cityChanged(city));

      if (
        cities.some((city) => city.player() === this.player()) ||
        area.some((areaTile) =>
          unitRegistryInstance
            .getByTile(areaTile)
            .some((areaUnit) => areaUnit.player() === this.player())
        )
      ) {
        this.#sendWholePlayer(
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

      this.sendNotification(
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

      this.sendNotification(
        new Notification('City.polluted', {
          city,
        })
      );
    });

    engineInstance.on('city:sdi-protected', (city: City, unit: Unit) => {
      if (city.player() !== this.player() && unit.player() !== this.player()) {
        return;
      }

      this.sendNotification(
        new Notification('City.sdi-protected', {
          city,
        })
      );
    });

    engineInstance.on('unit:lost-at-sea', (unit: Unit) => {
      if (unit.player() !== this.player()) {
        return;
      }

      this.sendNotification(
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

      this.sendNotification(
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

        this.sendNotification(
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
        this.#sendCity(home);
        this.#sendCity(city);

        this.sendNotification(
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

        this.sendNotification(
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

        this.sendNotification(
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

        this.sendNotification(
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

        this.sendNotification(
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
        this.#sendTile(unit.tile());

        if (![player, previousPlayer].includes(this.player())) {
          return;
        }

        this.#sendWholePlayer(
          filterToReference(PlayerWorld, PlayerTile, Tile, City)
        );
      }
    );

    // Famine (#400). A city shrinks for many reasons, most of them told some other way or not at all (Settlers built,
    //  no Aqueduct), so a shrinking city has no notice of its own. `city:shrink` carries its cause (the Settlers, the
    //  Attack lost, `Aqueduct`, `FoodExhausted`, `Captured`) for any that should have one.
    engineInstance.on('city:food-storage-exhausted', (city: City) => {
      this.#newsOf(city).famine = true;
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
        this.sendNotification(
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

      this.#dataQueue.update(cityBuild.id(), () =>
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

      this.sendNotification(
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

      this.#dataQueue.update(playerResearch.id(), () =>
        playerResearch.toPlainObject(
          this.#dataFilter(filterToReference(Player))
        )
      );

      this.sendNotification(
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

      this.sendNotification(
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
          this.#sendCity(cityImprovement.city())
        );

        this.sendNotification(
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
        this.#sendTile(tile);

        if (!units.some((unit: Unit) => unit.player() === this.player())) {
          return;
        }

        this.sendNotification(
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

    engineInstance.on(
      'player:defeated',
      (defeatedPlayer: Player, player: Player | null) => {
        if (defeatedPlayer === this.player()) {
          this.sendNotification(
            new Notification(`Player.defeated.local`, {
              defeatedPlayer,
              player,
            })
          );

          playerRegistryInstance.unregister(
            ...playerRegistryInstance.entries()
          );
          currentPlayerRegistryInstance.unregister(
            ...currentPlayerRegistryInstance.entries()
          );

          // TODO: summary and quit

          this.#transport.send('restart', null);

          return;
        }

        // A civilization we have not met is neither named nor sent (#59).
        const victor = player !== null && this.hasMet(player) ? player : null;

        this.sendNotification(
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
        this.sendNotification(
          new Notification('City.civil-disorder', {
            city,
          })
        );
      }
    });

    engineInstance.on('city:order-restored', (city: City) => {
      if (city.player() === this.player()) {
        this.sendNotification(
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
        this.sendNotification(
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
        this.sendNotification(
          new Notification('City.leader-celebration', {
            city,
          })
        );
      }
    });

    engineInstance.on('city:leader-celebration-ended', (city: City) => {
      if (city.player() === this.player()) {
        this.sendNotification(
          new Notification('City.leader-celebration-ended', {
            city,
          })
        );
      }
    });

    engineInstance.on('player:spaceship:part-built', (player: Player) => {
      if (this.player() === player) {
        return;
      }

      this.sendNotification(
        this.hasMet(player)
          ? new Notification('Spaceship.part-built', {
              player,
            })
          : new Notification('Spaceship.part-built.unmet', {})
      );
    });

    engineInstance.on('player:spaceship:lost', (player: Player) => {
      if (this.player() !== player) {
        return;
      }

      this.sendNotification(
        new Notification('Player.spaceship-lost', {
          player,
        })
      );
    });

    engineInstance.on('player:spaceship:landed', (player: Player) => {
      if (this.player() !== player) {
        return;
      }

      this.sendNotification(
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

        this.sendNotification(
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

      this.#sendCity(city);

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
      this.#sendUnit(unit);
      this.#sendCity(homeCity);
      this.#sendCity(unit.city());
      this.#sendOnTiles(fromTile, playerTile.tile(), unit.tile());

      return false;
    }

    if (playerAction instanceof InactiveUnit) {
      const unit: Unit = playerAction.value();

      unit.activate();

      // Built when the patch is sent, so as it is now it is active (#411).
      this.#sendUnit(unit);

      return false;
    }

    if (
      playerAction instanceof CityBuild ||
      playerAction instanceof ChangeProduction
    ) {
      const cityBuild = playerAction.value() as CityBuildItem,
        { auto, chosen } = action;

      // What the city is building, which is all a choice changes (#411).
      this.#sendCityBuild(cityBuild);

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

      this.#sendPlayerObject(playerResearch);

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

      this.#sendPlayerObject(playerTreasury);
      this.#sendCityBuild(cityBuild);

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
      this.#sendPlayerObject(playerTreasury);
      cityRegistryInstance
        .getByPlayer(this.player())
        .forEach((city) => this.#sendCity(city));

      return false;
    }

    if (playerAction instanceof Revolution) {
      revolution(playerAction.value() as PlayerGovernment);

      this.#sendPlayer();

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

      this.#sendPlayer();

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
      this.#sendPlayerObject(playerTradeRates);

      cityRegistryInstance
        .getByPlayer(this.player())
        .forEach((city) => this.#sendCity(city));

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

      this.#sendCity(city);

      return false;
    }

    if (playerAction instanceof ChangeSpecialist) {
      const city = playerAction.value().city();

      changeSpecialist(playerAction.value());

      this.#sendCity(city);

      return false;
    }

    if (playerAction instanceof LaunchSpaceship) {
      playerAction.value().launch();

      this.#sendPlayer();

      return false;
    }

    console.log(`unhandled action: ${JSON.stringify(action)}`);
    return false;
  }

  // Resolves a cheat's target: no id means the local player, an id matching a
  // registered player means that player (rival or not), and any other id
  // means nothing found, which the caller treats as "do nothing".
  /**
   * A government's yields reach every tile and city, so a change of government resends them all. Built when the patch is
   *  sent: `player:government:changed` is raised before the tiles' yields are worked out again.
   */
  private governmentChanged(): void {
    playerWorldRegistryInstance
      .getByPlayer(this.player())
      .forEach((playerTile) => this.#sendTile(playerTile));

    cityRegistryInstance
      .getByPlayer(this.player())
      .forEach((city) => this.#sendCity(city));
  }

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

  private sendPatchData(): void {
    if (this.#holdingFlushes) {
      // The queue keeps accumulating, and the listener flushes it all in one go when the action is done.
      return;
    }

    this.#transport.send('gameDataPatch', this.#dataQueue.transferData());

    this.#dataQueue.clear();
    this.#queuedTiles.clear();
    this.#queued.clear();
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

  topCities(limit: number = defaultTopCitiesLimit): TopCitiesRow[] {
    const playerWorld = playerWorldRegistryInstance.getByPlayer(this.player()),
      metPlayers = new Map<Player, boolean>();

    return topCitiesRows(
      cityRegistryInstance.entries().map((city: City) => {
        const owner = city.player(),
          [unhappy, content, happy] = citizenSummary(
            calculateCitizenState(cityGrowthRegistryInstance.getByCity(city))
          ),
          colors = owner
            .civilization()
            .attributes()
            .find((attribute) => attribute.name() === 'colors');

        if (!metPlayers.has(owner)) {
          metPlayers.set(owner, this.hasMet(owner));
        }

        return {
          name: city.name(),
          originalCivilization: typeNameOf(
            city.originalPlayer().civilization().sourceClass()
          ),
          owner: {
            civilization: typeNameOf(owner.civilization().sourceClass()),
            colors: colors ? (colors.value() as [string, string]) : null,
          },
          size: cityGrowthRegistryInstance.getByCity(city).size(),
          citizens: {
            happy,
            content,
            unhappy,
            specialists: specialistRegistryInstance
              .getByCity(city)
              .map((specialist) => typeNameOf(specialist.sourceClass())),
          },
          wonders: wonderRegistryInstance
            .getByCity(city)
            .map((wonder) => typeNameOf(wonder.sourceClass())),
          seen: playerWorld.getByTile(city.tile()) !== null,
          met: metPlayers.get(owner)!,
        };
      }),
      Number.isInteger(limit) && limit > 0 ? limit : defaultTopCitiesLimit
    );
  }

  // Whether this player has met `player`, for naming them in a notification (#59). There is no formal first-contact
  //  record, so this stands in: any interaction between us (a negotiation or a declaration), or having seen a city
  //  they hold or founded. The founder counts because a defeated player holds no cities by the time we are told.
  private hasMet(player: Player): boolean {
    if (player === this.player()) {
      return true;
    }

    if (
      interactionRegistryInstance.getByPlayers(this.player(), player).length > 0
    ) {
      return true;
    }

    const playerWorld = playerWorldRegistryInstance.getByPlayer(this.player());

    return cityRegistryInstance
      .entries()
      .some(
        (city: City) =>
          (city.player() === player || city.originalPlayer() === player) &&
          playerWorld.getByTile(city.tile()) !== null
      );
  }

  #newsOf(city: City): CityNews {
    if (!this.#cityNews.has(city)) {
      this.#cityNews.set(city, {
        ours: city.player() === this.player(),
        capturedBy: null,
        capturedFrom: null,
        destroyed: false,
        destroyedBy: null,
        famine: false,
      });
    }

    if (!this.#cityNewsQueued) {
      this.#cityNewsQueued = true;

      // The engine handles a capture, a turn's famines and the rest synchronously, so this runs once they are done.
      queueMicrotask(() => this.#sendCityNews());
    }

    return this.#cityNews.get(city)!;
  }

  // A lost city waits beside End Turn, as an improvement going obsolete does (#420). Famine stops play, as in Civ1.
  #sendCityNews(): void {
    const news = Array.from(this.#cityNews);

    this.#cityNews.clear();
    this.#cityNewsQueued = false;

    news.forEach(
      ([
        city,
        { ours, capturedBy, capturedFrom, destroyed, destroyedBy, famine },
      ]) => {
        if (capturedFrom === this.player()) {
          this.sendNotification(
            destroyed
              ? new Notification(
                  'City.destroyed-by',
                  { city, player: capturedBy },
                  true
                )
              : new Notification(
                  'City.captured-from-us',
                  {
                    city,
                    capturingPlayer: capturedBy,
                    originalPlayer: capturedFrom,
                  },
                  true
                )
          );

          return;
        }

        if (!ours) {
          return;
        }

        if (destroyed) {
          this.sendNotification(
            destroyedBy
              ? new Notification(
                  'City.destroyed-by',
                  { city, player: destroyedBy },
                  true
                )
              : new Notification('City.destroyed', { city }, true)
          );

          return;
        }

        if (famine) {
          this.sendNotification(
            new Notification('City.food-storage-exhausted', {
              city,
            })
          );
        }
      }
    );
  }

  private sendNotification(notification: Notification): void {
    // Serialize with the visibility filter so notification data referencing
    // other players/cities/units is bounded to their Unknown* wrappers rather
    // than dragging (and leaking) their full object graphs over the transport.
    //
    // A notification is reconstituted on its own, not merged into the game
    // data, so it cannot carry refs. It only needs to say who and where: the
    // text reads names and civilizations, and a notice finds its city by id.
    // In full, our own `Player` brought every city, unit and known tile with
    // it: 2 MB and 400 ms per notification in a large game (#130).
    const payload = notification.toPlainObject(
      this.#dataFilter(standalone)
    ) as unknown as Notification;

    // The TurnStart rules, which say what happened in our cities, run before `takeTurn`, and so before the patch with
    //  the new turn in it. Sent straight away, they arrived under the previous turn and year (#130), so they wait for
    //  the handover. Serialised now all the same: they describe the game as it was when they happened.
    if (this.#holdsNotifications()) {
      this.#heldNotifications.push(payload);

      return;
    }

    this.#transport.send('gameNotification', payload);
  }

  // A caller's filter can still send a tile as something else, a notification's stand-in say, and that stands.
  //  Otherwise a tile is a ref unless the caller asked for tiles in full (#138).
  #filterPlayerTile(
    playerTile: PlayerTile,
    localFilter: (object: any) => any,
    tilesInFull: boolean
  ): any {
    const filtered = localFilter(playerTile);

    return filtered !== playerTile || tilesInFull
      ? filtered
      : referenceObject(playerTile);
  }

  /**
   * One of the player's tiles in full, as a tile patch sends it (#138). `toPlainObject` puts the tile it's called on
   *  through the filter as well, which would make it a ref to itself, so the tile is kept and only what it holds is
   *  filtered: the player's own units and cities as refs, as the frontend holds them, and anyone else's as the stand-ins
   *  the map has for them, inline, as the frontend may never have had them (#46).
   */
  serialiseTile(playerTile: PlayerTile): ObjectMap {
    const filter = this.#dataFilter(filterToReference(Player, Unit, City));

    return playerTile.toPlainObject((object: any) =>
      object === playerTile ? object : filter(object)
    ) as ObjectMap;
  }

  // The frontend redraws a tile only when it arrives in a patch, so every change that alters one sends it (#138). Once
  //  per flush: the patch is only built when it's sent, so a later change to the same tile is in it all the same.
  #sendTile(tile: Tile | PlayerTile | null): void {
    const playerTile =
      tile instanceof Tile
        ? playerWorldRegistryInstance.getByPlayer(this.player()).getByTile(tile)
        : tile;

    if (!playerTile || this.#queuedTiles.has(playerTile)) {
      return;
    }

    this.#queuedTiles.add(playerTile);

    this.#dataQueue.update(playerTile.id(), () =>
      this.serialiseTile(playerTile)
    );
  }

  /**
   * One of the player's own objects in full, with what it refers to that the frontend already holds as refs (#411).
   *  `toPlainObject` puts the object it's called on through the filter as well, which would make it a ref to itself,
   *  so the object itself only goes through the visibility filter: a unit still goes without its actions, unless it's
   *  the one the UI has them for.
   */
  #serialiseOwn(
    object: City | CityBuildItem | Unit,
    localFilter: (object: any) => any
  ): ObjectMap {
    const root = this.#dataFilter()(object as unknown as DataObject),
      filter = this.#dataFilter(localFilter);

    return object.toPlainObject((value: any) =>
      value === object ? root : filter(value)
    );
  }

  /**
   * The whole player as the frontend should hold it now, for a test to compare with what it does hold (#411): every
   *  unit and city in full, and the map as refs, as the turn's hand-over sends it, with the player's actions. What the
   *  frontend is known to hold of those is left alone, as nothing is sent.
   */
  serialisePlayer(): ObjectMap {
    this.#serialisingActions = true;

    try {
      return this.player().toPlainObject(
        this.#dataFilter(filterToReference(PlayerWorld, PlayerTile, Tile))
      );
    } finally {
      this.#serialisingActions = false;
    }
  }

  /**
   * One of the player's units, as a patch of the unit sends it (#411). Its tiles, its home city and the player are refs,
   *  as the frontend holds them all.
   */
  serialiseUnit(unit: Unit): ObjectMap {
    return this.#serialiseOwn(unit, filterToReference(Player, City, Unit));
  }

  /**
   * One of the player's cities, as a patch of the city sends it (#411): its build, growth, improvements, specialists and
   *  yields in full, and its tiles, the units it supports and the player as refs, as the frontend holds them all.
   */
  serialiseCity(city: City): ObjectMap {
    return this.#serialiseOwn(city, filterToReference(Player, City, Unit));
  }

  // The player's own city in full, for any change to it: the frontend holds it as the last patch of it left it, as an
  //  action's patch no longer sends the whole player (#411). Once per flush, as a tile is: the patch is only built when
  //  it's sent.
  #sendCity(city: City | null): void {
    if (
      city === null ||
      city.player() !== this.player() ||
      this.#queued.has(city.id())
    ) {
      return;
    }

    this.#queued.add(city.id());

    this.#dataQueue.update(city.id(), () => this.serialiseCity(city));
  }

  // What one of the player's cities is building, for a change to that alone: a new choice, or a purchase (#411). The
  //  city in full is several times the size, with all of its yields.
  #sendCityBuild(cityBuild: CityBuildItem): void {
    if (
      cityBuild.city().player() !== this.player() ||
      this.#queued.has(cityBuild.id())
    ) {
      return;
    }

    this.#queued.add(cityBuild.id());

    this.#dataQueue.update(cityBuild.id(), () =>
      this.#serialiseOwn(cityBuild, filterToReference(Player, City, Unit))
    );
  }

  // The player's own unit in full, for any change to it (#411), once per flush. With its actions if it's the one the UI
  //  has them for when the patch is sent, and without them otherwise.
  #sendUnit(unit: Unit | null): void {
    if (
      unit === null ||
      unit.player() !== this.player() ||
      this.#queued.has(unit.id())
    ) {
      return;
    }

    this.#queued.add(unit.id());

    this.#dataQueue.update(unit.id(), () => this.serialiseUnit(unit));
  }

  // Everything of ours on these squares, whose units and cities an action can change by being there: a move into or out
  //  of a city (martial law, a Republic's units abroad), a transport's cargo, a city founded under a stack (#411).
  #sendOnTiles(...tiles: (Tile | null)[]): void {
    tiles.forEach((tile) => {
      if (tile === null) {
        return;
      }

      unitRegistryInstance
        .getByTile(tile)
        .forEach((tileUnit) => this.#sendUnit(tileUnit));

      this.#sendCity(cityRegistryInstance.getByTile(tile));
    });
  }

  // Our cities that have this square among theirs.
  #sendCitiesAround(tile: Tile): void {
    tile
      .getSurroundingArea()
      .entries()
      .forEach((areaTile) => {
        const city = cityRegistryInstance.getByTile(areaTile);

        if (
          city !== null &&
          city.player() === this.player() &&
          city.tiles().entries().includes(tile)
        ) {
          this.#sendCity(city);
        }
      });
  }

  // The UI has actions for one unit (#323). When that changes, the unit that had them goes again without them, so the
  //  UI asks again when it comes back to it rather than using actions from before whatever has happened since.
  #setUnitWithActions(unit: Unit | null): void {
    const previous = this.#unitWithActions;

    this.#unitWithActions = unit;

    if (previous !== null && previous !== unit) {
      this.#sendUnit(previous);
    }
  }

  // One of the player's keys on its own, as an update of that key (#411): the list of its units or cities when one is
  //  added, which go as refs, as each is sent on its own.
  #sendPlayerKey(key: 'cities' | 'units'): void {
    if (this.#queued.has(`${this.player().id()} ${key}`)) {
      return;
    }

    this.#queued.add(`${this.player().id()} ${key}`);

    this.#dataQueue.update(
      this.player().id(),
      () =>
        this.#serialisePlayerPart(
          additionalDataRegistryInstance
            .getByType(Player)
            .find((additionalData) => additionalData.key() === key)!
            .data(this.player()),
          filterToReferenceAllExcept()
        ),
      key
    );
  }

  /**
   * The player's actions, which can change after every action, as updates of `actions` and `mandatoryActions` rather
   *  than the whole player (#411). What each acts on goes as a ref: units, cities, builds, research, government and
   *  rates are all held by the frontend and sent whenever they change. An action the frontend already holds, one in
   *  the list it was last sent, goes as a ref too: `actions()` makes every one afresh, with a new id, so the one sent
   *  before stands in for it. Nothing goes when the list is as it was, as after most moves. The mandatory ones are
   *  the same objects (`mandatoryActions()` is `actions()` filtered), and are worked out with them: their patch comes
   *  second, and the queue builds patches in order.
   */
  #sendActions(): void {
    let mandatoryActions: ObjectMap | undefined;

    this.#dataQueue.update(
      this.player().id(),
      () => {
        const held = this.#heldActions,
          actions = this.player()
            .actions()
            .map((action) => held?.get(actionKey(action)) ?? action),
          mandatory = actions.filter(
            (action) => action instanceof MandatoryPlayerAction
          ),
          unchanged = (list: PlayerAction[], heldList: string[] | undefined) =>
            heldList !== undefined &&
            list.length === heldList.length &&
            list.every(
              (action, index) => actionKey(action) === heldList[index]
            ),
          filter = (object: any) =>
            object instanceof PlayerAction
              ? held !== null && held.get(actionKey(object)) === object
                ? referenceObject(object)
                : object
              : referenceObject(object),
          serialise = (list: PlayerAction[]): ObjectMap => {
            this.#serialisingActions = true;

            try {
              return this.#serialisePlayerPart(list, filter);
            } finally {
              this.#serialisingActions = false;
            }
          };

        mandatoryActions = unchanged(mandatory, this.#heldMandatoryActions)
          ? undefined
          : serialise(mandatory);

        const sent = unchanged(actions, this.#heldActionKeys)
          ? undefined
          : serialise(actions);

        this.#heldActions = new Map(
          actions.map((action): [string, PlayerAction] => [
            actionKey(action),
            action,
          ])
        );
        this.#heldActionKeys = actions.map(actionKey);
        this.#heldMandatoryActions = mandatory.map(actionKey);

        return sent;
      },
      'actions'
    );

    this.#dataQueue.update(
      this.player().id(),
      () => mandatoryActions,
      'mandatoryActions'
    );
  }

  // The whole player, for an action that changes it broadly: a revolution, a new government, a spaceship launched.
  //  Its cities are refs here: what changes them sends them.
  #sendPlayer(): void {
    this.#sendWholePlayer(
      filterToReference(PlayerWorld, PlayerTile, Tile, City)
    );
  }

  /**
   * The whole player, but for its actions, which go straight after it (#411): an action the frontend already holds
   *  goes as a ref there, so the hundreds a large game has don't all go again. The player's patch replaces what the
   *  frontend holds of it, actions and all, so they always go, if only as refs, and in the same flush, so that none it
   *  holds is let go of in between.
   */
  #sendWholePlayer(
    localFilter: (object: any) => any,
    type: 'add' | 'update' = 'update'
  ): void {
    const player = this.player();

    this.#dataQueue[type](player.id(), () => {
      const standIn = playerWithoutActions(player),
        filter = this.#dataFilter(localFilter);

      this.#heldActionKeys = undefined;
      this.#heldMandatoryActions = undefined;

      // As `#serialisePlayerPart`: the filter sees what `toPlainObject` is called on first.
      return player.toPlainObject((object: any) =>
        object === player ? standIn : filter(object)
      );
    });

    this.#sendActions();
  }

  #forgetHeldActions(): void {
    this.#heldActions = null;
    this.#heldActionKeys = undefined;
    this.#heldMandatoryActions = undefined;
  }

  // A value that is part of the player, serialised on its own. `toPlainObject` is a method on `DataObject`, and the
  //  filter is applied to what it is called on first, so handing it the value in place of the player gets the value
  //  serialised, as the `hierarchy` (as `cityBuildAvailable` does).
  #serialisePlayerPart(
    value: any,
    localFilter: (object: any) => any
  ): ObjectMap {
    const player = this.player(),
      filter = this.#dataFilter(localFilter);

    return player.toPlainObject((object: any) =>
      object === player ? value : filter(object)
    );
  }

  // What an action can change of the player's own as a side effect, a hut's gold or advance, a trade route's bonus, a
  //  bribe, cheaply enough to compare before and after each one (#411).
  #playerState(): Map<PlayerResearch | PlayerTreasury, string> {
    const playerResearch = playerResearchRegistryInstance.getByPlayer(
      this.player()
    );

    return new Map<PlayerResearch | PlayerTreasury, string>([
      ...playerTreasuryRegistryInstance
        .getByPlayer(this.player())
        .map((playerTreasury): [PlayerTreasury, string] => [
          playerTreasury,
          String(playerTreasury.value()),
        ]),
      [
        playerResearch,
        JSON.stringify([
          playerResearch.researching()?.name ?? null,
          playerResearch.progress().value(),
          playerResearch.cost().value(),
          playerResearch.complete().length,
        ]),
      ],
    ]);
  }

  // Each of them that has changed since `before`.
  #sendPlayerState(before: Map<PlayerResearch | PlayerTreasury, string>): void {
    this.#playerState().forEach((state, object) => {
      if (before.get(object) !== state) {
        this.#sendPlayerObject(object);
      }
    });
  }

  // The player's research, trade rates or treasury, once per flush.
  #sendPlayerObject(
    object: PlayerResearch | PlayerTradeRates | PlayerTreasury
  ): void {
    if (this.#queued.has(object.id())) {
      return;
    }

    this.#queued.add(object.id());

    this.#dataQueue.update(object.id(), () =>
      object.toPlainObject(this.#dataFilter(filterToReference(Player)))
    );
  }

  // Only for a unit that can act: one with nothing left to do this turn is listed as an `InactiveUnit`, which the UI
  //  doesn't read actions from.
  #sendsUnitActions(unit: Unit): boolean {
    return (
      unit === this.#answeringUnitActions ||
      (unit === this.#unitWithActions &&
        unit.active() &&
        unit.moves().value() > 0)
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

    this.#heldNotifications
      .splice(0)
      .forEach((notification) =>
        this.#transport.send('gameNotification', notification)
      );

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
            this.#dataQueue.update(turnInstance.id(), () =>
              turnInstance.toPlainObject()
            );
            this.#dataQueue.update(yearInstance.id(), () =>
              yearInstance.toPlainObject()
            );
            this.#sendWholePlayer(
              filterToReference(PlayerWorld, PlayerTile, Tile)
            );

            this.sendPatchData();
            resolve();
          })
          .catch(reject);

        return;
      }

      setTimeout(() => {
        this.#dataQueue.update(turnInstance.id(), () =>
          turnInstance.toPlainObject()
        );
        this.#dataQueue.update(yearInstance.id(), () =>
          yearInstance.toPlainObject()
        );

        // On later turns this is how the UI gets the new turn's actions.
        if (!playerJustSent) {
          this.#sendWholePlayer(
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
          let turnEnded: boolean;

          this.#holdingFlushes = true;

          const playerState = this.#playerState();

          try {
            turnEnded = await this.handleAction(...args);
          } finally {
            this.#holdingFlushes = false;
          }

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
          this.#sendPlayerState(playerState);
          this.#sendActions();

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
