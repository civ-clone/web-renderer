import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import CoreUnit from '@civ-clone/core-unit/Unit';
import DataObject from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import Tile from '@civ-clone/core-world/Tile';

// What another player's unit shows of its own, besides what it is, where and whose: its hit points, where the rules
//  give units them (Civ2, M2b), as a damaged unit's bar is on the map for anyone who sees it. Read from the unit as
//  each payload is made. Not sent where the rules register none, so a Civ1 unit's stand-in is as it was.
const hitPointsData = (unit: CoreUnit) =>
  additionalDataRegistryInstance
    .getByType(unit.sourceClass())
    .find((additionalData) => additionalData.key() === 'hitPoints');

export class Unit extends DataObject {
  #_: string;
  #tile: Tile;
  #player: Player;
  #unit: CoreUnit | null;

  constructor(
    name: string,
    tile: Tile,
    player: Player,
    unit: CoreUnit | null = null
  ) {
    super();

    this.#_ = name;
    this.#tile = tile;
    this.#player = player;
    this.#unit = unit;

    this.addKey('_', 'tile', 'player');

    if (unit !== null && hitPointsData(unit) !== undefined) {
      this.addKey('hitPoints');
    }
  }

  static fromUnit(unit: CoreUnit): Unit {
    return new Unit(unit.constructor.name, unit.tile(), unit.player(), unit);
  }

  // What it is now: a unit upgraded in place (M2c) is its new type.
  _(): string {
    return this.#unit?.constructor.name ?? this.#_;
  }

  hitPoints(): unknown {
    return this.#unit === null
      ? null
      : hitPointsData(this.#unit)?.data(this.#unit) ?? null;
  }

  player(): Player {
    return this.#player;
  }

  tile(): Tile {
    return this.#tile;
  }
}

export default Unit;
