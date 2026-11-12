// What happened to each city during one engine call, told to the player once it is over (#400, #420, #449), moved out
//  of `DataTransferClient`: a city lost or starved gets one notice. Capturing a size 1 city destroys it before
//  `city:captured` is emitted, and by then it is the capturer's, so neither event alone says that we lost it, or how.
//  A size 1 city that its own Settlers remove is said to be abandoned, once, rather than to have built Settlers and
//  then been destroyed (#969).

import City from '@civ-clone/core-city/City';
import Notification from '@civ-clone/ui-protocol/Notification';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';

// What happened to a city during one engine call (#400, #420).
export type CityNews = {
  // Whose it was when it was first heard of, unless we captured it (#501).
  ours: boolean;
  capturedBy: Player | null;
  capturedFrom: Player | null;
  destroyed: boolean;
  destroyedBy: Player | null;
  famine: boolean;
  // The unit the famine cost the city in place of a citizen, as the engine says (#969), or `null`.
  famineUnitLost: Unit | null;
  // Removed by its own Settlers (#969): the engine says so before the build is announced and the city destroyed.
  abandoned: boolean;
};

// A lost city waits beside End Turn, as an improvement going obsolete does (#420). Famine stops play, as in Civ1.
export const cityNewsNotifications = (
  entries: [City, CityNews][],
  player: Player,
  // Whose cities are ours: the player's, unless a view of several says otherwise (#613).
  owns: (other: Player) => boolean = (other) => other === player
): Notification[] => {
  const notifications: Notification[] = [];

  entries.forEach(
    ([
      city,
      {
        ours,
        capturedBy,
        capturedFrom,
        destroyed,
        destroyedBy,
        famine,
        famineUnitLost,
        abandoned,
      },
    ]) => {
      if (capturedFrom !== null && owns(capturedFrom)) {
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

      // Removed by its own Settlers: told once, here, as the Settlers it built aren't (`Client/notifications/city.ts`).
      if (destroyed && abandoned && destroyedBy === null) {
        notifications.push(new Notification('City.abandoned', { city }, true));

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

      // With the unit it cost, "Settlers lost.", or else "Famine feared." (#969).
      if (famine) {
        notifications.push(
          famineUnitLost
            ? new Notification('City.food-storage-exhausted.unit-lost', {
                city,
                unit: famineUnitLost,
              })
            : new Notification('City.food-storage-exhausted', {
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
  #owns: (other: Player) => boolean;
  #player: () => Player;
  #queued = false;

  constructor(
    player: () => Player,
    notify: (notification: Notification) => void,
    owns: (other: Player) => boolean = (other) => other === player()
  ) {
    this.#player = player;
    this.#notify = notify;
    this.#owns = owns;
  }

  // The news of `city` in the engine call under way, sent once it is over.
  of(city: City): CityNews {
    if (!this.#news.has(city)) {
      this.#news.set(city, {
        ours: this.#owns(city.player()),
        capturedBy: null,
        capturedFrom: null,
        destroyed: false,
        destroyedBy: null,
        famine: false,
        famineUnitLost: null,
        abandoned: false,
      });
    }

    if (!this.#queued) {
      this.#queued = true;

      // The engine handles a capture, a turn's famines and the rest synchronously, so this runs once they are done.
      queueMicrotask(() => this.#send());
    }

    return this.#news.get(city)!;
  }

  // Whether `city` was abandoned in the engine call under way (#969), without making news of it.
  abandoned(city: City): boolean {
    return this.#news.get(city)?.abandoned ?? false;
  }

  #send(): void {
    const news = Array.from(this.#news);

    this.#news.clear();
    this.#queued = false;

    cityNewsNotifications(news, this.#player(), this.#owns).forEach(
      (notification) => this.#notify(notification)
    );
  }
}

export default CityNewsCollector;
