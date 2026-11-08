import CoreUnit from '@civ-clone/core-unit/Unit';
import DataObject from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import Tile from '@civ-clone/core-world/Tile';

export class Unit extends DataObject {
  #_: string;
  #tile: Tile;
  #player: Player;

  constructor(name: string, tile: Tile, player: Player) {
    super();

    this.#_ = name;
    this.#tile = tile;
    this.#player = player;

    this.addKey('_', 'tile', 'player');
  }

  static fromUnit(unit: CoreUnit): Unit {
    return new Unit(unit.constructor.name, unit.tile(), unit.player());
  }

  _(): string {
    return this.#_;
  }

  player(): Player {
    return this.#player;
  }

  tile(): Tile {
    return this.#tile;
  }
}

export default Unit;
