import Civilization from '@civ-clone/core-civilization/Civilization';
import CorePlayer from '@civ-clone/core-player/Player';
import DataObject from '@civ-clone/core-data-object/DataObject';
import type { Era } from '@civ-clone/ui-protocol/types';
import { currentWorkerRules } from '../workerRules';

// What another player shows of its own: its civilization and, under rules that say (D9), its age, which the map draws
//  its cities in. The age is read from the player as each payload is made, so a rival's cities drawn again after an
//  advance carry it. Not sent where the rules have none, so a stand-in is as it was.
export class Player extends DataObject {
  #civilization: Civilization;
  #player: CorePlayer | null;

  constructor(civilization: Civilization, player: CorePlayer | null = null) {
    super();

    this.#civilization = civilization;
    this.#player = player;

    this.addKey('_', 'civilization');

    if (player !== null && currentWorkerRules()?.era !== undefined) {
      this.addKey('era');
    }
  }

  static fromPlayer(player: CorePlayer): Player {
    return new Player(player.civilization(), player);
  }

  _(): string {
    return 'Player';
  }

  civilization(): Civilization {
    return this.#civilization;
  }

  era(): Era | null {
    const eraOf = currentWorkerRules()?.era;

    return this.#player === null || eraOf === undefined
      ? null
      : eraOf(this.#player);
  }
}

export default Player;
