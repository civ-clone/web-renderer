// What happened to each city during one engine call, told to the player once it is over (#400, #420, #449), moved out
//  of `DataTransferClient`: a city lost or starved gets one notice. Capturing a size 1 city destroys it before
//  `city:captured` is emitted, and by then it is the capturer's, so neither event alone says that we lost it, or how.

import City from '@civ-clone/core-city/City';
import Notification from '../Notification';
import Player from '@civ-clone/core-player/Player';

// What happened to a city during one engine call (#400, #420).
export type CityNews = {
  // Whose it was when it was first heard of.
  ours: boolean;
  capturedBy: Player | null;
  capturedFrom: Player | null;
  destroyed: boolean;
  destroyedBy: Player | null;
  famine: boolean;
};

// A lost city waits beside End Turn, as an improvement going obsolete does (#420). Famine stops play, as in Civ1.
export const cityNewsNotifications = (
  entries: [City, CityNews][],
  player: Player
): Notification[] => {
  const notifications: Notification[] = [];

  entries.forEach(
    ([
      city,
      { ours, capturedBy, capturedFrom, destroyed, destroyedBy, famine },
    ]) => {
      if (capturedFrom === player) {
        notifications.push(
          destroyed
            ? new Notification(
                'City.destroyed-by',
                { city, player: capturedBy },
                true
              )
            : new Notification(
                'City.captured-from-us',
                {
                  city,
                  capturingPlayer: capturedBy,
                  originalPlayer: capturedFrom,
                },
                true
              )
        );

        return;
      }

      if (!ours) {
        return;
      }

      if (destroyed) {
        notifications.push(
          destroyedBy
            ? new Notification(
                'City.destroyed-by',
                { city, player: destroyedBy },
                true
              )
            : new Notification('City.destroyed', { city }, true)
        );

        return;
      }

      if (famine) {
        notifications.push(
          new Notification('City.food-storage-exhausted', {
            city,
          })
        );
      }
    }
  );

  return notifications;
};

export class CityNewsCollector {
  #news: Map<City, CityNews> = new Map();
  #notify: (notification: Notification) => void;
  #player: () => Player;
  #queued = false;

  constructor(
    player: () => Player,
    notify: (notification: Notification) => void
  ) {
    this.#player = player;
    this.#notify = notify;
  }

  // The news of `city` in the engine call under way, sent once it is over.
  of(city: City): CityNews {
    if (!this.#news.has(city)) {
      this.#news.set(city, {
        ours: city.player() === this.#player(),
        capturedBy: null,
        capturedFrom: null,
        destroyed: false,
        destroyedBy: null,
        famine: false,
      });
    }

    if (!this.#queued) {
      this.#queued = true;

      // The engine handles a capture, a turn's famines and the rest synchronously, so this runs once they are done.
      queueMicrotask(() => this.#send());
    }

    return this.#news.get(city)!;
  }

  #send(): void {
    const news = Array.from(this.#news);

    this.#news.clear();
    this.#queued = false;

    cityNewsNotifications(news, this.#player()).forEach((notification) =>
      this.#notify(notification)
    );
  }
}

export default CityNewsCollector;
