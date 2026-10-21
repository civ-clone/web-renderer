// The patches the client sends the player (#449), moved out of `DataTransferClient`: the queue, which builds each patch
//  when it is sent, in the order they were queued, the helpers that queue each part of the game once per flush (#138,
//  #411), the player's actions (#411), and the flush itself, held while an action is handled (#321).

import City from '@civ-clone/core-city/City';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import MandatoryPlayerAction from '@civ-clone/core-player/MandatoryPlayerAction';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerTradeRates from '@civ-clone/core-trade-rate/PlayerTradeRates';
import PlayerTreasury from '@civ-clone/core-treasury/PlayerTreasury';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import DataQueue from '../DataQueue';
import Transport from '../Transport';
import playerWithoutActions from '../lib/playerWithoutActions';
import ActionsState, { diffActions } from './ActionsState';
import {
  actionKey,
  filterToReference,
  filterToReferenceAllExcept,
  referenceObject,
} from './refs';
import {
  DataFilter,
  serialiseCity,
  serialiseOwn,
  serialisePlayerPart,
  serialiseTile,
  serialiseUnit,
} from './visibilityFilter';

type DataPatchValue = Parameters<DataQueue['add']>[1];

export class PlayerPatches {
  #actions: ActionsState;
  #dataFilter: DataFilter;
  #dataQueue: DataQueue;
  // Set while an action is handled, so the several flushes an action causes (the moved unit's tiles, then the player)
  //  go out as a single patch once it is done (#321). See `hold`.
  #holdingFlushes = false;
  #player: () => Player;
  // The ids of the units, cities and parts of the player in the queue, each sent once a flush (#411).
  #queued: Set<string> = new Set();
  // The tiles in the queue, each sent once a flush (#138).
  #queuedTiles: Set<PlayerTile> = new Set();
  #transport: Transport<TransportDataMap>;

  constructor(
    transport: Transport<TransportDataMap>,
    dataFilter: DataFilter,
    actions: ActionsState,
    player: () => Player,
    dataQueue: DataQueue = new DataQueue()
  ) {
    this.#transport = transport;
    this.#dataFilter = dataFilter;
    this.#actions = actions;
    this.#player = player;
    this.#dataQueue = dataQueue;
  }

  // A patch of anything else, queued as it is given: a value, or a function that builds it when it is sent.
  add(id: string, value: DataPatchValue, index: string | null = null): void {
    this.#dataQueue.add(id, value, index);
  }

  update(id: string, value: DataPatchValue, index: string | null = null): void {
    this.#dataQueue.update(id, value, index);
  }

  // A square newly seen, added to the player's world at its index there.
  seenTile(playerWorld: PlayerWorld, playerTile: PlayerTile): void {
    this.#queuedTiles.add(playerTile);
    this.#dataQueue.add(
      playerWorld.id(),
      () => serialiseTile(this.#dataFilter, playerTile),
      `tiles[${playerWorld.entries().indexOf(playerTile)}]`
    );
  }

  // The frontend redraws a tile only when it arrives in a patch, so every change that alters one sends it (#138). Once
  //  per flush: the patch is only built when it's sent, so a later change to the same tile is in it all the same.
  tile(tile: Tile | PlayerTile | null): void {
    const playerTile =
      tile instanceof Tile
        ? playerWorldRegistryInstance
            .getByPlayer(this.#player())
            .getByTile(tile)
        : tile;

    if (!playerTile || this.#queuedTiles.has(playerTile)) {
      return;
    }

    this.#queuedTiles.add(playerTile);

    this.#dataQueue.update(playerTile.id(), () =>
      serialiseTile(this.#dataFilter, playerTile)
    );
  }

  // The player's own city in full, for any change to it: the frontend holds it as the last patch of it left it, as an
  //  action's patch no longer sends the whole player (#411). Once per flush, as a tile is: the patch is only built when
  //  it's sent.
  city(city: City | null): void {
    if (
      city === null ||
      city.player() !== this.#player() ||
      this.#queued.has(city.id())
    ) {
      return;
    }

    this.#queued.add(city.id());

    this.#dataQueue.update(city.id(), () =>
      serialiseCity(this.#dataFilter, city)
    );
  }

  // What one of the player's cities is building, for a change to that alone: a new choice, or a purchase (#411). The
  //  city in full is several times the size, with all of its yields.
  cityBuild(cityBuild: CityBuildItem): void {
    if (
      cityBuild.city().player() !== this.#player() ||
      this.#queued.has(cityBuild.id())
    ) {
      return;
    }

    this.#queued.add(cityBuild.id());

    this.#dataQueue.update(cityBuild.id(), () =>
      serialiseOwn(
        this.#dataFilter,
        cityBuild,
        filterToReference(Player, City, Unit)
      )
    );
  }

  // The player's own unit in full, for any change to it (#411), once per flush. With its actions if it's the one the UI
  //  has them for when the patch is sent, and without them otherwise.
  unit(unit: Unit | null): void {
    if (
      unit === null ||
      unit.player() !== this.#player() ||
      this.#queued.has(unit.id())
    ) {
      return;
    }

    this.#queued.add(unit.id());

    this.#dataQueue.update(unit.id(), () =>
      serialiseUnit(this.#dataFilter, unit)
    );
  }

  // Everything of ours on these squares, whose units and cities an action can change by being there: a move into or out
  //  of a city (martial law, a Republic's units abroad), a transport's cargo, a city founded under a stack (#411).
  onTiles(...tiles: (Tile | null)[]): void {
    tiles.forEach((tile) => {
      if (tile === null) {
        return;
      }

      unitRegistryInstance
        .getByTile(tile)
        .forEach((tileUnit) => this.unit(tileUnit));

      this.city(cityRegistryInstance.getByTile(tile));
    });
  }

  // Our cities that have this square among theirs.
  citiesAround(tile: Tile): void {
    tile
      .getSurroundingArea()
      .entries()
      .forEach((areaTile) => {
        const city = cityRegistryInstance.getByTile(areaTile);

        if (
          city !== null &&
          city.player() === this.#player() &&
          city.tiles().entries().includes(tile)
        ) {
          this.city(city);
        }
      });
  }

  // One of the player's keys on its own, as an update of that key (#411): the list of its units or cities when one is
  //  added, which go as refs, as each is sent on its own.
  playerKey(key: 'cities' | 'units'): void {
    if (this.#queued.has(`${this.#player().id()} ${key}`)) {
      return;
    }

    this.#queued.add(`${this.#player().id()} ${key}`);

    this.#dataQueue.update(
      this.#player().id(),
      () =>
        serialisePlayerPart(
          this.#dataFilter,
          this.#player(),
          additionalDataRegistryInstance
            .getByType(Player)
            .find((additionalData) => additionalData.key() === key)!
            .data(this.#player()),
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
  actions(): void {
    let mandatoryActions: ObjectMap | undefined;

    this.#dataQueue.update(
      this.#player().id(),
      () => {
        const held = this.#actions.held,
          actions = this.#player()
            .actions()
            .map((action) => held?.get(actionKey(action)) ?? action),
          mandatory = actions.filter(
            (action) => action instanceof MandatoryPlayerAction
          ),
          changed = diffActions(actions, mandatory, this.#actions),
          filter = (object: any) =>
            object instanceof PlayerAction
              ? held !== null && held.get(actionKey(object)) === object
                ? referenceObject(object)
                : object
              : referenceObject(object),
          serialise = (list: PlayerAction[]): ObjectMap => {
            this.#actions.serialising = true;

            try {
              return serialisePlayerPart(
                this.#dataFilter,
                this.#player(),
                list,
                filter
              );
            } finally {
              this.#actions.serialising = false;
            }
          };

        mandatoryActions =
          changed.mandatory === undefined
            ? undefined
            : serialise(changed.mandatory);

        const sent =
          changed.actions === undefined
            ? undefined
            : serialise(changed.actions);

        this.#actions.hold(changed.nextHeld);

        return sent;
      },
      'actions'
    );

    this.#dataQueue.update(
      this.#player().id(),
      () => mandatoryActions,
      'mandatoryActions'
    );
  }

  // The whole player, for an action that changes it broadly: a revolution, a new government, a spaceship launched.
  //  Its cities are refs here: what changes them sends them.
  player(): void {
    this.wholePlayer(filterToReference(PlayerWorld, PlayerTile, Tile, City));
  }

  /**
   * The whole player, but for its actions, which go straight after it (#411): an action the frontend already holds
   *  goes as a ref there, so the hundreds a large game has don't all go again. The player's patch replaces what the
   *  frontend holds of it, actions and all, so they always go, if only as refs, and in the same flush, so that none it
   *  holds is let go of in between.
   */
  wholePlayer(
    localFilter: (object: any) => any,
    type: 'add' | 'update' = 'update'
  ): void {
    const player = this.#player();

    this.#dataQueue[type](player.id(), () => {
      const standIn = playerWithoutActions(player),
        filter = this.#dataFilter(localFilter);

      this.#actions.heldKeys = undefined;
      this.#actions.heldMandatory = undefined;

      // As `serialisePlayerPart`: the filter sees what `toPlainObject` is called on first.
      return player.toPlainObject((object: any) =>
        object === player ? standIn : filter(object)
      );
    });

    this.actions();
  }

  // What an action can change of the player's own as a side effect, a hut's gold or advance, a trade route's bonus, a
  //  bribe, cheaply enough to compare before and after each one (#411).
  playerState(): Map<PlayerResearch | PlayerTreasury, string> {
    const playerResearch = playerResearchRegistryInstance.getByPlayer(
      this.#player()
    );

    return new Map<PlayerResearch | PlayerTreasury, string>([
      ...playerTreasuryRegistryInstance
        .getByPlayer(this.#player())
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
  playerStateChanged(
    before: Map<PlayerResearch | PlayerTreasury, string>
  ): void {
    this.playerState().forEach((state, object) => {
      if (before.get(object) !== state) {
        this.playerObject(object);
      }
    });
  }

  // The player's research, trade rates or treasury, once per flush.
  playerObject(
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

  /**
   * A government's yields reach every tile and city, so a change of government resends them all. Built when the patch is
   *  sent: `player:government:changed` is raised before the tiles' yields are worked out again.
   */
  allTilesAndCities(): void {
    playerWorldRegistryInstance
      .getByPlayer(this.#player())
      .forEach((playerTile) => this.tile(playerTile));

    cityRegistryInstance
      .getByPlayer(this.#player())
      .forEach((city) => this.city(city));
  }

  // Holds every flush while `fn` runs, as the action listener does while an action is handled, awaited talks and all,
  //  so the queue keeps accumulating and goes in one patch once it is done (#321).
  async hold<T>(fn: () => Promise<T>): Promise<T> {
    this.#holdingFlushes = true;

    try {
      return await fn();
    } finally {
      this.#holdingFlushes = false;
    }
  }

  flush(): void {
    if (this.#holdingFlushes) {
      // The queue keeps accumulating, and the listener flushes it all in one go when the action is done.
      return;
    }

    this.#transport.send('gameDataPatch', this.#dataQueue.transferData());

    this.#dataQueue.clear();
    this.#queuedTiles.clear();
    this.#queued.clear();
  }
}

export default PlayerPatches;
