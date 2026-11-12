import { City, GameData, PlayerAction } from '@civ-clone/ui-protocol/types';
import { Notification } from './Notifications';
import { judgeHeldNotice } from '@civ-clone/ui-client/components/lib/cityBuild';

export interface Notice {
  city: City | null;
  // Our civilization's colours, for a notice drawn as one of our cities (#420).
  colours: string[] | null;
  dismiss: () => void;
  notification: Notification;
}

// `bubble` notifications, held until they are opened or the turn they were shown in ends. The primary actions are
//  rebuilt from the game data on every update, so these are added back each time rather than appended once.
export class Notices {
  #fromBeforeLastRoll = new Set<string>();
  #nextId = 0;
  #notices = new Map<string, Notification>();
  // The notices whose city has been among the view's own in the data (#970).
  #citySeen = new Set<string>();

  constructor() {
    // A notice that arrives after the turn has ended (during another player's turn) is still there for the next one.
    document.addEventListener('endturn', () => this.clear());
  }

  // A watcher's turns end without End Turn (#607): the session clears them when its view changes, and rolls them as
  //  the game's turn moves on.
  clear(): void {
    this.#notices.clear();
    this.#citySeen.clear();
  }

  // The watched turn's data comes after what the turn told of, so a turn's notices are kept until the turn after it has
  //  come, and the ones from before then go: paused between turns, the last turn's are there to read.
  rollTurn(): void {
    this.#fromBeforeLastRoll.forEach((id) => this.#notices.delete(id));
    this.#fromBeforeLastRoll = new Set(this.#notices.keys());
  }

  add(notification: Notification): void {
    this.#notices.set(`notice-${this.#nextId++}`, notification);
  }

  actions(data: GameData): PlayerAction<Notice>[] {
    // One that no longer holds, as a build no longer waiting (#970), is withdrawn: the data it is rebuilt from says so.
    //  Whether its city has been among ours is kept, so a city lost since withdraws it.
    this.#notices.forEach((notification, id) => {
      const { stands, citySeen } = judgeHeldNotice(
        notification,
        data.player.cities,
        data.turn?.value,
        this.#citySeen.has(id)
      );

      if (citySeen) {
        this.#citySeen.add(id);
      }

      if (!stands) {
        this.#notices.delete(id);
        this.#citySeen.delete(id);
      }
    });

    return Array.from(this.#notices, ([id, notification]) => ({
      _: 'Notice',
      __: ['Notice'],
      id,
      value: {
        // The city as it is now, not the snapshot the notification carried, so opening it shows current data.
        city:
          data.player.cities.find(
            (city) => city.id === notification.data?.city?.id
          ) ?? null,
        colours:
          data.player.civilization?.attributes?.find(
            (attribute) => attribute.name === 'colors'
          )?.value ?? null,
        dismiss: () => this.#notices.delete(id),
        notification,
      },
    }));
  }
}

export default Notices;
