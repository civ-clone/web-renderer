import { City, GameData } from '../../types';
import DataChanges, { instance } from '../../lib/DataChanges';

export type CityWatchHandlers = {
  /** The city changed: `city` is it as `data` holds it now. */
  update(city: City, data: GameData): void;
  /** The city is no longer the player's: captured or destroyed. The watch has already stopped. */
  close(): void;
};

/**
 * Keeps an open city screen current (#344). The ids are read live at each render, so the screen follows its city's
 * build, growth, supported units (a unit built or disbanded included) and the player's gold without re-subscribing.
 *
 * The player is watched too, for the patch that takes a city out of the player's list, a capture or a destruction,
 * which names no id of the city's own (#483). A change to the player alone only closes the screen when the city is
 * gone; it doesn't redraw it, as the player changes with most actions.
 *
 * Returns what stops the watch, which `close` has already done.
 */
export const watchCity = (
  city: City,
  { update, close }: CityWatchHandlers,
  changes: DataChanges = instance
): (() => void) => {
  const cityId = city.id,
    playerId = city.player.id,
    find = (data: GameData): City | undefined =>
      (data.player?.cities ?? []).find(({ id }) => id === cityId);

  // Held to read the ids from: refilled in place by each rebuild, replaced by the one `data` holds after each update,
  //  as a rebuild of everything leaves it stale.
  let current = city;

  const unwatchers = [
      changes.watch(
        () => [
          current.id,
          current.build.id,
          current.growth.id,
          ...current.units.map((unit) => unit.id),
          ...current.player.treasuries
            .filter((treasury) => treasury.yield._ === 'Gold')
            .map((treasury) => treasury.id),
        ],
        (data) => {
          const updatedCity = find(data);

          if (!updatedCity) {
            stop();
            close();

            return;
          }

          current = updatedCity;

          update(updatedCity, data);
        }
      ),
      changes.watch(
        () => [playerId],
        (data) => {
          if (find(data)) {
            return;
          }

          stop();
          close();
        }
      ),
    ],
    stop = (): void => unwatchers.forEach((unwatch) => unwatch());

  return stop;
};

export default watchCity;
