import DataObject from '@civ-clone/core-data-object/DataObject';
import GameDifficulty from '@civ-clone/core-difficulty/GameDifficulty';
import Player from '@civ-clone/core-player/Player';
import Turn from '@civ-clone/core-turn-based-game/Turn';
import Year from '@civ-clone/core-game-year/Year';

export class TransferObject extends DataObject {
  #difficulty: GameDifficulty | null;
  #player: Player;
  #turn: Turn;
  #year: Year;

  constructor(
    player: Player,
    turn: Turn,
    year: Year,
    difficulty: GameDifficulty | null = null
  ) {
    super();

    this.#difficulty = difficulty;
    this.#player = player;
    this.#turn = turn;
    this.#year = year;

    this.addKey('difficulty', 'player', 'turn', 'year');
  }

  difficulty(): GameDifficulty | null {
    return this.#difficulty;
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
