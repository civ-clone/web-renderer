import { City, GameData, PlayerAction } from '../types';
import { Notification } from './Notifications';

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
  #nextId = 0;
  #notices = new Map<string, Notification>();

  constructor() {
    // A notice that arrives after the turn has ended (during another player's turn) is still there for the next one.
    document.addEventListener('endturn', () => this.#notices.clear());
  }

  add(notification: Notification): void {
    this.#notices.set(`notice-${this.#nextId++}`, notification);
  }

  actions(data: GameData): PlayerAction<Notice>[] {
    return Array.from(this.#notices, ([id, notification]) => ({
      _: 'Notice',
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
