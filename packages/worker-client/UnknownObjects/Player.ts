import Civilization from '@civ-clone/core-civilization/Civilization';
import CorePlayer from '@civ-clone/core-player/Player';
import DataObject from '@civ-clone/core-data-object/DataObject';

export class Player extends DataObject {
  #civilization: Civilization;

  constructor(civilization: Civilization) {
    super();

    this.#civilization = civilization;

    this.addKey('_', 'civilization');
  }

  static fromPlayer(player: CorePlayer): Player {
    return new Player(player.civilization());
  }

  _(): string {
    return 'Player';
  }

  civilization(): Civilization {
    return this.#civilization;
  }
}

export default Player;
