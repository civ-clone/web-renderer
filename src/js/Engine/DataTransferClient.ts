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
import CityGrowth from '@civ-clone/core-city-growth/CityGrowth';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import Civilization from '@civ-clone/core-civilization/Civilization';
import { CompleteProduction } from '@civ-clone/civ1-treasury/PlayerActions';
import DataObject, { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import DataQueue from './DataQueue';
import { EndTurn } from '@civ-clone/civ1-player/PlayerActions';
import EventEmitter from '@dom111/typed-event-emitter/EventEmitter';
import { GameData } from '../UI/types';
import { Gold } from '@civ-clone/civ1-city/Yields';
import GoodyHut from '@civ-clone/core-goody-hut/GoodyHut';
import { IAction } from '@civ-clone/core-diplomacy/Negotiation/Action';
import { IInteraction } from '@civ-clone/core-diplomacy/Interaction';
import Initiate from '@civ-clone/core-diplomacy/Negotiation/Initiate';
import { LaunchSpaceship } from '@civ-clone/civ1-spaceship/PlayerActions';
import MandatoryPlayerAction from '@civ-clone/core-player/MandatoryPlayerAction';
import { Move } from '@civ-clone/civ1-unit/Actions';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
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
import TransferObject from './TransferObject';
import Tile from '@civ-clone/core-world/Tile';
import Timeout from './Error/Timeout';
import TradeRate from '@civ-clone/core-trade-rate/TradeRate';
import Transport, { TransportDisposer } from './Transport';
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
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
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
import researchCosts from './AdditionalData/researchCosts';
import tradeRoutes from './AdditionalData/tradeRoutes';
import Declaration from '@civ-clone/core-diplomacy/Declaration';

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
      : object,
  MIN_NUMBER_OF_TURNS_BEFORE_NEW_NEGOTIATION = 15;

additionalDataRegistryInstance.register(
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

export class DataTransferClient extends Client implements IClient {
  #automationClient: AIClient;
  #automationEnabled: boolean;
  #dataFilter =
    (localFilter = (object: any) => object) =>
    // `Busy` as well as `DataObject`, because that is what `toPlainObject`
    // actually hands a filter: it walks every field, and `Unit._busy` holds a
    // rule. Typed as `DataObject` alone, the `instanceof Busy` branch below
    // narrows to `DataObject & Busy` — and since `core-rule@0.1.5` gave `Rule`
    // a `private _id` for rule identity, alongside `DataObject`'s own, that
    // intersection is `never` and the renderer stops compiling.
    (object: DataObject | Busy) => {
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

        // The caller's filter applies to the tile that is actually sent, so a
        // caller that references `PlayerTile` gets refs rather than every tile
        // in full (#130). Only a tile the player knows can be a ref: an
        // undiscovered one is made up afresh, with a new id, on every call.
        return playerTile instanceof PlayerTile
          ? localFilter(playerTile)
          : playerTile;
      }

      if (object instanceof Busy) {
        return {
          _: object.constructor.name,
        };
      }

      return localFilter(object);
    };
  #dataQueue: DataQueue = new DataQueue();
  #eventEmitter: EventEmitter;
  // Whether the UI has been handed this player's turn: `turnStarted` is sent and `action`s are listened for. Until then,
  //  our own notifications are held (see `sendNotification`).
  #handedOver: boolean = false;
  #heldNotifications: Notification[] = [];
  #pendingChoiceDisposer: TransportDisposer | null = null;
  #receiver: (channel: string, handler: (...args: any[]) => void) => void;
  #sender: (channel: string, payload: any) => void;
  #sentInitialData: boolean = false;
  // Talks a Diplomat's Meet with King started (#58), which the action that started them waits for, as it waits for
  //  talks with units met on the way (`canNegotiate`).
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

            playerWorld.register(tile);

            const playerTile = playerWorld.getByTile(tile)!;

            this.#dataQueue.add(
              playerWorld.id(),
              () => tile.toPlainObject(this.#dataFilter()),
              `entries[${playerWorld.entries().indexOf(playerTile)}]`
            );
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

      this.sendPatchData();
    });

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

      if (playerTile === null) {
        new Retryable(
          () => {
            const playerTile = playerWorld.getByTile(tile);

            if (playerTile === null) {
              return false;
            }

            this.#dataQueue.add(
              playerWorld.id(),
              () =>
                tile.toPlainObject(this.#dataFilter(filterToReference(Player))),
              `tiles[${playerWorld.entries().indexOf(playerTile)}]`
            );

            return true;
          },
          2,
          20
        );

        return;
      }

      this.#dataQueue.add(
        playerWorld.id(),
        () =>
          playerTile.toPlainObject(this.#dataFilter(filterToReference(Player))),
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

        // TODO: check if this is another player first and if there's already another unit there, use an unknown unit
        //  Need to update Units renderer if this happens
        this.#dataQueue.update(playerTile.id(), () =>
          playerTile.toPlainObject(
            this.#dataFilter(
              // filterToReferenceAllExcept(Tile, Unit, UnknownPlayer, Yield)
              filterToReference(Player)
            )
          )
        );

        if (unit.player() !== this.player()) {
          return;
        }

        if (event === 'unit:created') {
          const playerUnits = unitRegistryInstance.getByPlayer(this.player()),
            playerIndex = playerUnits.indexOf(unit),
            cityUnits = unitRegistryInstance.getByCity(unit.city()),
            cityIndex = cityUnits.indexOf(unit),
            tileUnits = unitRegistryInstance.getByTile(unit.tile()),
            tileIndex = tileUnits.indexOf(unit);

          this.#dataQueue.add(
            player.id(),
            () =>
              unit.toPlainObject(
                this.#dataFilter(
                  filterToReference(Tile, Player, PlayerTile, City)
                )
              ),
            `units[${playerIndex}]`
          );
          this.#dataQueue.add(
            playerTile.id(),
            () => unit.toPlainObject(this.#dataFilter(filterToReference(Unit))),
            `units[${tileIndex}]`
          );

          if (unit.city() !== null) {
            this.#dataQueue.add(
              unit.city().id(),
              () =>
                unit.toPlainObject(this.#dataFilter(filterToReference(Unit))),
              `units[${cityIndex}]`
            );
          }

          return;
        }

        // Actions and yields are serialised inline, not as refs: `actions()`, `attack()` and the rest build fresh
        //  ones, with fresh ids, on every call, so the frontend never holds them already (#46).
        this.#dataQueue.update(this.player().id(), () =>
          this.player().toPlainObject(
            this.#dataFilter(
              filterToReferenceAllExcept(
                Player,
                PlayerAction,
                Unit,
                UnitAction,
                Yield,
                Civilization
              )
            )
          )
        );
      });
    });

    ['unit:destroyed'].forEach((event) => {
      engineInstance.on(event, (unit: Unit, action: UnitAction) => {
        if (unit.player() === this.player() && unit.city() !== null) {
          this.#dataQueue.update(unit.city()!.id(), () =>
            unit
              .city()!
              .toPlainObject(
                this.#dataFilter(
                  filterToReference(
                    CityBuild,
                    CityGrowth,
                    CityImprovement,
                    Player,
                    PlayerTile,
                    Tile,
                    Unit
                  )
                )
              )
          );
        }
      });
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

        // A Settlers joining a city makes it grow with no `city:grow`, so the
        // tile goes out with its city in full, as that event sends it. As a
        // reference the city would keep the size the UI already has (#243).
        const references =
          action instanceof JoinCity ? [Player] : [Player, City];

        if (fromTile) {
          this.#dataQueue.update(fromTile.id(), () =>
            fromTile.toPlainObject(
              this.#dataFilter(filterToReference(...references))
            )
          );
        }

        if (toTile) {
          this.#dataQueue.update(toTile.id(), () =>
            toTile.toPlainObject(
              this.#dataFilter(filterToReference(...references))
            )
          );
        }

        if (unit.player() === this.player() && unit.city() !== null) {
          this.#dataQueue.update(unit.city()!.id(), () =>
            unit
              .city()!
              .toPlainObject(
                this.#dataFilter(
                  filterToReference(
                    CityBuild,
                    CityGrowth,
                    CityImprovement,
                    Player,
                    PlayerTile,
                    Tile,
                    Unit
                  )
                )
              )
          );
        }

        this.sendPatchData();
      });
    });

    ['tile-improvement:built', 'tile-improvement:pillaged'].forEach((event) => {
      engineInstance.on(event, (tile) => {
        const playerWorld = playerWorldRegistryInstance.getByPlayer(
            this.player()
          ),
          playerTile = playerWorld.getByTile(tile);

        if (playerTile) {
          this.#dataQueue.update(playerTile.id(), () =>
            playerTile.toPlainObject(
              this.#dataFilter(filterToReference(Player, City))
            )
          );
        }
      });
    });

    engineInstance.on(
      'city:captured',
      (city: City, capturingPlayer: Player, originalPlayer: Player) => {
        if (originalPlayer === this.player()) {
          // The city already belongs to the capturing player here, so resend ours: the city is gone from our list,
          //  and losing the capital changes every remaining city's corruption.
          this.#dataQueue.update(this.player().id(), () =>
            this.player().toPlainObject(
              this.#dataFilter(
                filterToReferenceAllExcept(Player, PlayerAction, Civilization)
              )
            )
          );

          this.sendNotification(
            new Notification('City.captured-from-us', {
              city,
              capturingPlayer,
              originalPlayer,
            })
          );

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

    [
      'city:created',
      'city:captured',
      'city:destroyed',
      'city:grow',
      'city:shrink',
      // A rival's city in disorder shows on the map as your own does (#265). The engine raises
      //  `city:civil-disorder` before it records the disorder, which is why the city is only read when the patch is
      //  built.
      'city:civil-disorder',
      'city:order-restored',
    ].forEach((event) => {
      engineInstance.on(event, (city) => {
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

        this.#dataQueue.update(playerTile.id(), () =>
          playerTile.toPlainObject(this.#dataFilter(filterToReference(Player)))
        );
      });
    });

    engineInstance.on('city:shrink', (city) => {
      if (city.player() !== this.player()) {
        return;
      }

      this.sendNotification(
        new Notification('City.shrink', {
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
        // Tiles as the player knows them, and `Busy` by name.
        otherwise = this.#dataFilter(),
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
        const playerTile = playerWorldRegistryInstance
          .getByPlayer(this.player())
          .getByTile(unit.tile());

        if (playerTile) {
          this.#dataQueue.update(playerTile.id(), () =>
            playerTile.toPlainObject(
              this.#dataFilter(filterToReference(Player, City))
            )
          );
        }

        if (![player, previousPlayer].includes(this.player())) {
          return;
        }

        this.#dataQueue.update(this.player().id(), () =>
          this.player().toPlainObject(
            this.#dataFilter(
              filterToReference(PlayerWorld, PlayerTile, Tile, City)
            )
          )
        );
      }
    );

    engineInstance.on('city:food-storage-exhausted', (city: City) => {
      if (city.player() !== this.player()) {
        return;
      }

      this.sendNotification(
        new Notification('City.food-storage-exhausted', {
          city,
        })
      );
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

        new Set(
          cityImprovements.map((cityImprovement) => cityImprovement.city())
        ).forEach((city: City) =>
          this.#dataQueue.update(city.id(), () =>
            city.toPlainObject(
              this.#dataFilter(filterToReference(Player, Tile, Unit))
            )
          )
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
        this.#sendCityTile(city);
        this.sendNotification(
          new Notification('City.civil-disorder', {
            city,
          })
        );
      }
    });

    engineInstance.on('city:order-restored', (city: City) => {
      if (city.player() === this.player()) {
        this.#sendCityTile(city);
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

        this.governmentChanged();
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

      this.#dataQueue.update(
        city.id(),
        city.toPlainObject(this.#dataFilter(filterToReference(Player, Tile)))
      );

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

      const [actionToPerform] = filteredActions;

      actionToPerform.perform();

      await this.#talks;

      if (actionToPerform instanceof Move) {
        await this.canNegotiate(unit);
      }

      return false;
    }

    if (playerAction instanceof InactiveUnit) {
      const unit: Unit = playerAction.value();

      if (unit.moves().value() > 0) {
        this.#dataQueue.update(
          unit.id(),
          unit.toPlainObject(this.#dataFilter(filterToReference(Player, Tile)))
        );
      }

      unit.activate();

      return false;
    }

    if (
      playerAction instanceof CityBuild ||
      playerAction instanceof ChangeProduction
    ) {
      const cityBuild = playerAction.value() as CityBuildItem,
        { chosen } = action;

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

      this.#dataQueue.update(
        playerTreasury.id(),
        playerTreasury.toPlainObject(
          this.#dataFilter(filterToReference(Player))
        )
      );

      return false;
    }

    if (playerAction instanceof Revolution) {
      revolution(playerAction.value() as PlayerGovernment);

      this.governmentChanged();

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

      this.governmentChanged();

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

      cityRegistryInstance
        .getByPlayer(this.player())
        .forEach((city) =>
          this.#dataQueue.update(
            city.id(),
            city.toPlainObject(
              this.#dataFilter(filterToReference(Player, Tile, Unit))
            )
          )
        );

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

      this.#dataQueue.update(
        city.id(),
        city.toPlainObject(this.#dataFilter(filterToReference(Player, Tile)))
      );

      return false;
    }

    if (playerAction instanceof ChangeSpecialist) {
      const city = playerAction.value().city();

      changeSpecialist(playerAction.value());

      this.#dataQueue.update(
        city.id(),
        city.toPlainObject(this.#dataFilter(filterToReference(Player, Tile)))
      );

      return false;
    }

    if (playerAction instanceof LaunchSpaceship) {
      playerAction.value().launch();

      return false;
    }

    console.log(`unhandled action: ${JSON.stringify(action)}`);
    return false;
  }

  // Resolves a cheat's target: no id means the local player, an id matching a
  // registered player means that player (rival or not), and any other id
  // means nothing found, which the caller treats as "do nothing".
  /** A government's yields reach every tile and city, so a change of government resends them all. */
  private governmentChanged(): void {
    const playerWorld = playerWorldRegistryInstance.getByPlayer(this.player());

    this.#dataQueue.update(
      playerWorld.id(),
      playerWorld.toPlainObject(this.#dataFilter(filterToReference(Player)))
    );

    cityRegistryInstance
      .getByPlayer(this.player())
      .forEach((city) =>
        this.#dataQueue.update(
          city.id(),
          city.toPlainObject(
            this.#dataFilter(filterToReference(Player, Tile, Unit))
          )
        )
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
    this.#transport.send(
      'gameData',
      new TransferObject(
        this.player(),
        turnInstance,
        yearInstance
      ) as unknown as GameData
    );

    this.#sentInitialData = true;
  }

  private sendPatchData(): void {
    this.#transport.send('gameDataPatch', this.#dataQueue.transferData());

    this.#dataQueue.clear();
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

  // The map draws a city from its tile: its size, or an unhappy citizen in civil disorder (#193). A change the tile
  //  itself doesn't record goes out with it all the same, the city in full, as `city:grow` sends it.
  #sendCityTile(city: City): void {
    const playerTile = playerWorldRegistryInstance
      .getByPlayer(this.player())
      .getByTile(city.tile());

    if (!playerTile) {
      return;
    }

    this.#dataQueue.update(playerTile.id(), () =>
      playerTile.toPlainObject(this.#dataFilter(filterToReference(Player)))
    );
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
  }

  takeTurn(): Promise<void> {
    return new Promise<void>((resolve, reject): void => {
      if (!this.#sentInitialData) {
        this.sendInitialData();
      }

      if (this.#automationEnabled) {
        this.#automationClient
          .takeTurn()
          .then(() => {
            this.#dataQueue.update(turnInstance.id(), () =>
              turnInstance.toPlainObject()
            );
            this.#dataQueue.update(yearInstance.id(), () =>
              yearInstance.toPlainObject()
            );
            this.#dataQueue.update(this.player().id(), () =>
              this.player().toPlainObject(
                this.#dataFilter(
                  filterToReference(PlayerWorld, PlayerTile, Tile)
                )
              )
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
        this.#dataQueue.add(this.player().id(), () =>
          this.player().toPlainObject(
            this.#dataFilter(filterToReference(PlayerWorld, PlayerTile, Tile))
          )
        );

        this.sendPatchData();

        // The listener below is already attached, so the UI can act from here.
        this.#handOver();
      }, 1);

      const listener = async (...args: any[]): Promise<void> => {
        try {
          if (await this.handleAction(...args)) {
            this.#eventEmitter.off('action', listener);

            this.#handedOver = false;

            this.sendPatchData();

            this.#transport.send('turnEnded', null);

            setTimeout(() => resolve(), 10);

            return;
          }

          this.#dataQueue.update(this.player().id(), () =>
            this.player().toPlainObject(
              this.#dataFilter(
                filterToReference(PlayerWorld, PlayerTile, Tile, City)
              )
            )
          );

          this.sendPatchData();
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
  private async canNegotiate(unit: Unit): Promise<void> {
    // TODO: This could be a `Rule`.
    const surroundingPlayers = Array.from(
      new Set(
        unit
          .tile()
          .getNeighbours()
          .flatMap((tile) =>
            unitRegistryInstance
              .getByTile(tile)
              .map((tileUnit) => tileUnit.player())
              .filter((player) => player !== this.player())
          )
      )
    );

    if (surroundingPlayers.length === 0) {
      return;
    }

    await surroundingPlayers
      .filter((player) =>
        interactionRegistryInstance
          .getByPlayer(player)
          .filter(
            (interaction) =>
              interaction instanceof Negotiation &&
              interaction.isBetween(player, this.player())
          )
          .every(
            (interaction) =>
              turnInstance.value() - interaction.when() >
              MIN_NUMBER_OF_TURNS_BEFORE_NEW_NEGOTIATION
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
      const lastInteraction = negotiation.lastInteraction(),
        players =
          lastInteraction !== null
            ? lastInteraction.for()
            : negotiation.players().slice(1);

      await players.reduce(
        (promise: Promise<void>, player: Player) =>
          promise
            .then(async () => {
              const client = clientRegistryInstance.getByPlayer(player),
                nextSteps = negotiation.nextSteps(),
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
