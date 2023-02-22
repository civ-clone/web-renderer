import DataObject from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import Turn from '@civ-clone/core-turn-based-game/Turn';
import Year from '@civ-clone/core-game-year/Year';

export class TransferObject extends DataObject {
  #player: Player;
  #turn: Turn;
  #year: Year;

  constructor(player: Player, turn: Turn, year: Year) {
    super();

    this.#player = player;
    this.#turn = turn;
    this.#year = year;

    this.addKey('player', 'turn', 'year');
  }

  player() {
    return this.#player;
  }

  turn(): Turn {
    return this.#turn;
  }

  year(): Year {
    return this.#year;
  }
}

export default TransferObject;
