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
import ChooseResearch from '@civ-clone/civ1-science/PlayerActions/ChooseResearch';
import City from '@civ-clone/core-city/City';
import CityGrowth from '@civ-clone/core-city-growth/CityGrowth';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import Civilization from '@civ-clone/core-civilization/Civilization';
import { CompleteProduction } from '@civ-clone/civ1-treasury/PlayerActions';
import DataObject from '@civ-clone/core-data-object/DataObject';
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
import { Revolution } from '@civ-clone/civ1-government/PlayerActions';
import TransferObject from './TransferObject';
import Tile from '@civ-clone/core-world/Tile';
import Timeout from './Error/Timeout';
import TradeRate from '@civ-clone/core-trade-rate/TradeRate';
import Transport from './Transport';
import Unit from '@civ-clone/core-unit/Unit';
import UnitAction from '@civ-clone/core-unit/Action';
import UnknownCity from './UnknownObjects/City';
import UnknownPlayer from './UnknownObjects/Player';
import UnknownUnit from './UnknownObjects/Unit';
import Wonder from '@civ-clone/core-wonder/Wonder';
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
import { reassignWorkers } from '@civ-clone/civ1-city/lib/assignWorkers';
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
  MIN_NUMBER_OF_TURNS_BEFORE_NEW_NEGOTIATION = 15;

const unknownPlayers: Map<Player, UnknownPlayer> = new Map(),
  unknownUnits: Map<Unit, UnknownUnit> = new Map(),
  unknownCities: Map<City, UnknownCity> = new Map();

export class DataTransferClient extends Client implements IClient {
  #dataFilter =
    (localFilter = (object: any) => object) =>
    (object: DataObject) => {
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
        );

        return playerWorld.get(object.x(), object.y());
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
  #receiver: (channel: string, handler: (...args: any[]) => void) => void;
  #sender: (channel: string, payload: any) => void;
  #sentInitialData: boolean = false;
  #transport: Transport<TransportDataMap>;

  constructor(
    player: Player,
    transport: Transport<TransportDataMap>,
    sender: (channel: string, payload: any) => void,
    receiver: (channel: string, handler: (...args: any[]) => void) => void
  ) {
    super(player);

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
        const [Advance] = advanceRegistryInstance.filter(
            (Advance) => Advance.name === value
          ),
          playerResearch = playerResearchRegistryInstance.getByPlayer(
            this.player()
          );

        if (!Advance) {
          return;
        }

        if (playerResearch.completed(Advance)) {
          return;
        }

        playerResearch.addAdvance(Advance);

        this.#dataQueue.add(
          playerResearch.id(),
          playerResearch.toPlainObject(
            this.#dataFilter(filterToReference(Player))
          )
        );
      }

      if (name === 'GrantGold') {
        const playerTreasury =
          playerTreasuryRegistryInstance.getByPlayerAndType(
            this.player(),
            Gold
          );

        playerTreasury.add(value);

        this.#dataQueue.add(
          playerTreasury.id(),
          playerTreasury.toPlainObject(
            this.#dataFilter(filterToReference(Player))
          )
        );
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

    ['unit:created', 'unit:defeated'].forEach((event) => {
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

        this.#dataQueue.update(this.player().id(), () =>
          this.player().toPlainObject(
            this.#dataFilter(
              filterToReferenceAllExcept(Player, Unit, Civilization)
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

        if (fromTile) {
          this.#dataQueue.update(fromTile.id(), () =>
            fromTile.toPlainObject(
              this.#dataFilter(filterToReference(Player, City))
            )
          );
        }

        if (toTile) {
          this.#dataQueue.update(toTile.id(), () =>
            toTile.toPlainObject(
              this.#dataFilter(filterToReference(Player, City))
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
          const playerCities = cityRegistryInstance.getByPlayer(this.player()),
            cityIndex = playerCities.indexOf(city);

          if (cityIndex !== -1) {
            this.#dataQueue.update(this.player().id(), () =>
              this.player().toPlainObject(
                this.#dataFilter(
                  filterToReferenceAllExcept(Player, Civilization)
                )
              )
            );
            // this.#dataQueue.remove(this.player().id(), `cities[${cityIndex}]`);
          }

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

          unknownCity.update(city);

          this.#dataQueue.update(unknownCity.id(), () =>
            unknownCity.toPlainObject(
              this.#dataFilter(filterToReference(Tile, Unit, Player))
            )
          );
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
        this.sendNotification(
          new Notification(
            playerWorld.getByTile(cityBuild.city().tile())
              ? 'Wonder.building-complete.other-player.known'
              : 'Wonder.building-complete.other-player.unknown',
            {
              cityBuild,
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

        this.sendNotification(
          new Notification(
            player === null ? `Player.defeated.unknown` : 'Player.defeated.by',
            {
              defeatedPlayer,
              player,
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
        new Notification('Spaceship.part-built', {
          player,
        })
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
        if (!declaration.players().includes(this.player())) {
          return;
        }

        this.sendNotification(
          new Notification('Player.declaration-expired', {
            player: this.player(),
            declaration,
            enemy: declaration
              .players()
              .filter(
                (declarationPlayer) => declarationPlayer !== this.player()
              )[0],
          })
        );
      }
    );
  }

  async chooseFromList<Name extends keyof ChoiceMetaDataMap>(
    meta: ChoiceMeta<Name>
  ): Promise<DataForChoiceMeta<ChoiceMeta<Name>>> {
    return new Promise<DataForChoiceMeta<ChoiceMeta<Name>>>((resolve) => {
      if (
        meta.choices().length === 1 &&
        'negotiation.next-step' !== meta.key()
      ) {
        const [choice] = meta.choices();

        resolve(choice.value());

        return;
      }

      this.#transport.send('chooseFromList', meta);

      this.#transport.receiveOnce('chooseFromList', async (chosenId) => {
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
      });
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

    // TODO: DelayedPlayerAction -> Revolution --> SelectGovernment
    if (playerAction instanceof Revolution) {
      const playerGovernment = playerAction.value() as PlayerGovernment,
        { chosen } = action,
        [GovernmentType] = playerGovernment
          .available()
          .filter((GovernmentType) => GovernmentType.name === chosen);

      if (!GovernmentType) {
        console.error(`Government type: '${chosen}' not found.`);

        return false;
      }

      playerGovernment.set(new GovernmentType());

      const playerWorld = playerWorldRegistryInstance.getByPlayer(
        this.player()
      );

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

    if (playerAction instanceof LaunchSpaceship) {
      playerAction.value().launch();

      return false;
    }

    console.log(`unhandled action: ${JSON.stringify(action)}`);
    return false;
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

  private sendNotification(notification: Notification): void {
    this.#transport.send('gameNotification', notification);
  }

  takeTurn(): Promise<void> {
    return new Promise<void>((resolve, reject): void => {
      if (!this.#sentInitialData) {
        this.sendInitialData();
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
      }, 1);

      const listener = async (...args: any[]): Promise<void> => {
        try {
          if (await this.handleAction(...args)) {
            this.#eventEmitter.off('action', listener);

            this.sendPatchData();

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
