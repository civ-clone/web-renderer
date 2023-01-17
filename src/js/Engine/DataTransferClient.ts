import { ActiveUnit, InactiveUnit } from '@civ-clone/civ1-unit/PlayerActions';
import {
  Advance as FreeAdvance,
  City as FreeCity,
  Gold as FreeGold,
  Unit as FreeUnit,
} from '@civ-clone/civ1-goody-hut/GoodyHuts';
import {
  ChangeProduction,
  CityBuild,
} from '@civ-clone/core-city-build/PlayerActions';
import { Client, IClient } from '@civ-clone/core-civ-client/Client';
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
import GoodyHut from '@civ-clone/core-goody-hut/GoodyHut';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import { LaunchSpaceship } from '@civ-clone/civ1-spaceship/PlayerActions';
import MandatoryPlayerAction from '@civ-clone/core-player/MandatoryPlayerAction';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerTradeRates from '@civ-clone/core-trade-rate/PlayerTradeRates';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Retryable from './Retryable';
import { Revolution } from '@civ-clone/civ1-government/PlayerActions';
import TransferObject from './TransferObject';
import Tile from '@civ-clone/core-world/Tile';
import TradeRate from '@civ-clone/core-trade-rate/TradeRate';
import Turn from '@civ-clone/core-turn-based-game/Turn';
import Unit from '@civ-clone/core-unit/Unit';
import UnitAction from '@civ-clone/core-unit/Action';
import UnknownCity from './UnknownObjects/City';
import UnknownPlayer from './UnknownObjects/Player';
import UnknownUnit from './UnknownObjects/Unit';
import Wonder from '@civ-clone/core-wonder/Wonder';
import Year from '@civ-clone/core-game-year/Year';
import { instance as advanceRegistryInstance } from '@civ-clone/core-science/AdvanceRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as currentPlayerRegistryInstance } from '@civ-clone/core-player/CurrentPlayerRegistry';
import { instance as engineInstance } from '@civ-clone/core-engine/Engine';
import { instance as leaderRegistryInstance } from '@civ-clone/core-civilization/LeaderRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { instance as yearInstance } from '@civ-clone/core-game-year/Year';
import { reassignWorkers } from '@civ-clone/civ1-city/lib/assignWorkers';
import { Gold } from '@civ-clone/civ1-city/Yields';

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
        : referenceObject(object);

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

  constructor(
    player: Player,
    sender: (channel: string, payload: any) => void,
    receiver: (channel: string, handler: (...args: any[]) => void) => void
  ) {
    super(player);

    this.#eventEmitter = new EventEmitter();
    this.#sender = sender;
    this.#receiver = receiver;

    this.#receiver('action', (...args): void => {
      this.#eventEmitter.emit('action', ...args);
    });

    // TODO: These could be `HiddenAction`s. Need to add a `perform` method to actions too...
    this.#receiver(
      'cheat',
      ({ name, value }: { name: string; value: any }): void => {
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
              unit[property]().set(properties[property]);
            }
          });

          this.#dataQueue.add(
            unit.id(),
            unit.toPlainObject(this.#dataFilter(filterToReference(Player)))
          );
        }

        this.sendPatchData();
      }
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
            this.#dataFilter(filterToReferenceAllExcept(Player, Unit))
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
                this.#dataFilter(filterToReferenceAllExcept(Player))
              )
            );
            // this.#dataQueue.remove(this.player().id(), `cities[${cityIndex}]`);
          }

          this.sendNotification(
            `${capturingPlayer
              .civilization()
              .name()} have captured our city ${city.name()}!`
          );

          return;
        }

        if (capturingPlayer === this.player()) {
          this.sendNotification(
            `We have captured ${city.name()} from ${originalPlayer
              .civilization()
              .name()}!`
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

        this.#dataQueue.update(playerTile.id(), () =>
          playerTile.toPlainObject(this.#dataFilter(filterToReference(Player)))
        );
      });
    });

    engineInstance.on('city:shrink', (city) => {
      if (city.player() !== this.player()) {
        return;
      }

      this.sendNotification(`Population decrease in ${city.name()}.`);
    });

    engineInstance.on('city:unit-unsupported', (city: City, unit: Unit) => {
      if (city.player() !== this.player()) {
        return;
      }

      this.sendNotification(
        `${city.name()} cannot support ${unit.constructor.name}.`
      );
    });

    engineInstance.on(
      'city:unsupported-improvement',
      (city: City, cityImprovement: CityImprovement) => {
        if (city.player() !== this.player()) {
          return;
        }

        this.sendNotification(
          `${city.name()} cannot support ${cityImprovement.constructor.name}.`
        );
      }
    );

    engineInstance.on('city:food-storage-exhausted', (city: City) => {
      if (city.player() !== this.player()) {
        return;
      }

      this.sendNotification(`Food storage exhausted in ${city.name()}!`);
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
          `${
            playerWorld.getByTile(cityBuild.city().tile())
              ? cityBuild.city().name()
              : 'A faraway city'
          } has completed work on ${build.constructor.name}!`
        );

        return;
      }

      if (
        cityBuild.city().player() !== this.player() &&
        !(build instanceof Wonder)
      ) {
        return;
      }

      this.#dataQueue.update(cityBuild.id(), () =>
        cityBuild.toPlainObject(
          this.#dataFilter(filterToReference(Tile, Unit, Player))
        )
      );

      this.sendNotification(
        `${cityBuild.city().name()} has completed work on ${
          build.constructor.name
        }!`
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
        `You have discovered the secrets of ${advance.constructor.name}!`
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

        if (action instanceof FreeAdvance) {
          this.sendNotification(
            'You have discovered scrolls of ancient wisdom...'
          );

          return;
        }

        if (action instanceof FreeCity) {
          this.sendNotification('You have discovered an advanced tribe...');

          return;
        }

        if (action instanceof FreeGold) {
          this.sendNotification('You have discovered valuable treasure...');

          return;
        }

        if (action instanceof FreeUnit) {
          this.sendNotification(
            'You have discovered a friendly tribe of skilled mercenaries...'
          );

          return;
        }
      }
    );

    engineInstance.on(
      'player:defeated',
      (defeatedPlayer: Player, player: Player | null) => {
        if (defeatedPlayer === this.player()) {
          this.sendNotification(`You have been defeated!`);

          playerRegistryInstance.unregister(
            ...playerRegistryInstance.entries()
          );
          currentPlayerRegistryInstance.unregister(
            ...currentPlayerRegistryInstance.entries()
          );

          // TODO: summary and quit

          this.#sender('restart', null);
        }

        this.sendNotification(
          `${defeatedPlayer.civilization().name()} defeated${
            player ? ` by ${player.civilization().name()}` : ''
          }.`
        );
      }
    );

    engineInstance.on('city:civil-disorder', (city: City) => {
      if (city.player() === this.player()) {
        // TODO: make this an optional action
        this.sendNotification(`Civil disorder in ${city.name()}!`);
      }
    });

    engineInstance.on('city:order-restored', (city: City) => {
      if (city.player() === this.player()) {
        this.sendNotification(`Order restored in ${city.name()}!`);
      }
    });

    engineInstance.on('city:leader-celebration', (city: City) => {
      if (city.player() === this.player()) {
        this.sendNotification(
          `We love the leader celebrations in ${city.name()}!`
        );
      }
    });

    engineInstance.on('city:leader-celebration-ended', (city: City) => {
      if (city.player() === this.player()) {
        this.sendNotification(
          `We love the leader celebrations cancelled in ${city.name()}!`
        );
      }
    });

    engineInstance.on('player:spaceship:part-built', (player: Player) => {
      if (this.player() === player) {
        return;
      }

      this.sendNotification(
        `Component added to ${player.civilization().name()} spaceship.`
      );
    });

    engineInstance.on('player:spaceship:lost', (player: Player) => {
      if (this.player() !== player) {
        return;
      }

      this.sendNotification(`Our spaceship was lost in space.`);
    });

    engineInstance.on('player:spaceship:landed', (player: Player) => {
      if (this.player() !== player) {
        return;
      }

      this.sendNotification(`Our spaceship has landed on Alpha Centauri!`);
    });
  }

  chooseCivilization(Civilizations: (typeof Civilization)[]): Promise<void> {
    const makeChoice = (ChosenCivilization: typeof Civilization) => {
      this.player().setCivilization(new ChosenCivilization());

      return this.chooseLeader(this.player().civilization());
    };

    return new Promise((resolve, reject) => {
      if (Civilizations.length === 1) {
        const [Civilization] = Civilizations;

        makeChoice(Civilization).then(() => resolve());

        return;
      }

      this.#sender(
        'chooseCivilization',
        new TransferObject({ choices: Civilizations }).toPlainObject()
      );

      this.#receiver('chooseCivilization', (choice) => {
        const [Civilization] = Civilizations.filter(
          (Civilization) => Civilization.name === choice
        );

        if (!Civilization) {
          reject(
            `Invalid civilization ${choice} (options: ${Civilizations.map(
              (Civilization) => Civilization.name
            ).join(', ')})`
          );

          return;
        }

        makeChoice(Civilization).then(() => resolve());
      });
    });
  }

  chooseLeader(civilization: Civilization): Promise<void> {
    return new Promise((resolve, reject) => {
      const Leaders = leaderRegistryInstance.getByCivilization(
        civilization.constructor as IConstructor<Civilization>
      );

      if (Leaders.length === 1) {
        const [Leader] = Leaders;

        civilization.setLeader(new Leader());

        resolve();

        return;
      }

      this.#sender(
        'chooseLeader',
        new TransferObject({ choices: Leaders }).toPlainObject()
      );

      this.#receiver('chooseLeader', (choice) => {
        const [Leader] = Leaders.filter((Leader) => Leader.name === choice);

        if (!Leader) {
          reject(
            `Invalid civilization ${choice} (options: ${Leaders.map(
              (Leader) => Leader.name
            ).join(', ')})`
          );

          return;
        }

        civilization.setLeader(new Leader());

        resolve();
      });
    });
  }

  handleAction(...args: any[]): boolean {
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
      console.log('action not specified');

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
        allActions = [
          ...unit.actions(),
          ...Object.values(unit.actionsForNeighbours()),
        ].flat();

      let actions = allActions.filter(
        (action: UnitAction): boolean => action.constructor.name === unitAction
      );

      while (actions.length !== 1) {
        if (actions.length === 0) {
          console.log(`action not found: ${unitAction}`);

          return false;
        }

        const [playerTile] = playerWorldRegistryInstance
          .getByPlayer(this.player())
          .filter((tile) => tile.id() === target);

        if (!playerTile) {
          console.log(`tile not found: ${target}`);

          return false;
        }

        actions = actions.filter(
          (action: UnitAction): boolean => action.to() === playerTile.tile()
        );

        if (actions.length > 1) {
          if (!target) {
            console.log(
              `too many actions found: ${unitAction} (${actions.length})`
            );

            return false;
          }
        }
      }

      const [actionToPerform] = actions;

      actionToPerform.perform();

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
        console.log(`no build item specified`);

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
        this.sendNotification(`no build item specified`);

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
        playerTreasury = playerTreasuryRegistryInstance.getByPlayerAndType(
          this.player(),
          Gold
        );

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
    const rawData: {
      player: Player;
      turn: Turn;
      year: Year;
    } = {
      player: this.player(),
      turn: turnInstance,
      year: yearInstance,
    };

    const dataObject = new TransferObject(rawData);

    this.#sender('gameData', dataObject.toPlainObject(this.#dataFilter()));

    this.#sentInitialData = true;
  }

  private sendPatchData(): void {
    this.#sender('gameDataPatch', this.#dataQueue.transferData());

    this.#dataQueue.clear();
  }

  private sendNotification(message: string): void {
    this.#sender('gameNotification', {
      message: message,
    });
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
            this.#dataFilter(filterToReference(Tile, Civilization))
          )
        );

        this.sendPatchData();
      }, 1);

      const listener = (...args: any[]): void => {
        try {
          if (this.handleAction(...args)) {
            this.#eventEmitter.off('action', listener);

            this.sendPatchData();

            setTimeout(() => resolve(), 100);

            return;
          }

          this.#dataQueue.update(this.player().id(), () =>
            this.player().toPlainObject(
              this.#dataFilter(filterToReference(PlayerWorld, Tile, City))
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
}

export default DataTransferClient;
