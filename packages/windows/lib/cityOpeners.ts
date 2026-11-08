// How a city opens from the map, a report or a notice: a player's own city opens its screen from the data the page
//  holds; a watcher (#607, #613) asks the worker for the city in full, as a Diplomat's investigation is sent, and
//  opens it read-only. Every way in goes through `Portal#openCity`, so one choice covers them all.

import { City as CityData } from '@civ-clone/ui-protocol/types';
import openCity from '../components/openCity';
import ObserveCity from '@civ-clone/ui-protocol/Requests/ObserveCity';
import { ObserverState } from '@civ-clone/ui-protocol/observer';
import Portal, { CityOpener } from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { unlessRequestFailed } from '@civ-clone/ui-client/lib/unlessRequestFailed';

export type { CityOpener };

// The player's own cities, from the data the page holds.
export const playerCityOpener = (): CityOpener => ({
  opens: (city, portal) => city.player.id === portal.playerId(),
  open: (city, portal) => void openCity(city, portal, portal.transport()),
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
          openCity(full, portal, transport, { readOnly: true });
        }
      })
      // Not answered: the player has been told, and no city opens (#580).
      .catch(unlessRequestFailed),
});
