// How a city opens from the map, a report or a notice: a player's own city opens its screen from the data the page
//  holds; a watcher (#607, #613) asks the worker for the city in full, as a Diplomat's investigation is sent, and
//  opens it read-only. Every way in goes through `Portal#openCity`, so one choice covers them all.

import { City as CityData } from '../types';
import City from '../components/City';
import ObserveCity from '../../Engine/Requests/ObserveCity';
import { ObserverState } from '../../Engine/Observer';
import Portal from '../components/Portal';
import Transport from '../Transport';

export type CityOpener = {
  // Whether `city` is one that opens: the map's click moves on to the square's units otherwise.
  opens(city: CityData, portal: Portal): boolean;
  open(city: CityData, portal: Portal): void;
};

// The player's own cities, from the data the page holds.
export const playerCityOpener = (): CityOpener => ({
  opens: (city, portal) => city.player.id === portal.playerId(),
  open: (city, portal) => void new City(city, portal, portal.transport()),
});

// Any city of a civilisation watched, or any city at all when the whole map is. The worker answers `null` for a square
//  with nothing to open by the time it looks (a city razed, or captured out of the civilisations watched, since the
//  page last heard), and nothing opens; a failure of the request itself is shown as any is.
export const observerCityOpener = (
  transport: Transport,
  observer: () => ObserverState | null
): CityOpener => ({
  opens: (city) => {
    const view = observer()?.view;

    return (
      view !== undefined &&
      (view.kind === 'world' || view.playerIds.includes(city.player.id))
    );
  },
  open: (city, portal) =>
    void transport
      .request(new ObserveCity(city.tile.x, city.tile.y))
      .then((full) => {
        if (full !== null) {
          new City(full, portal, transport, { readOnly: true });
        }
      }),
});
