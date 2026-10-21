import { GameData, Player } from '../../types';
import DataChanges, { instance } from '../../lib/DataChanges';

/** The ids, besides the player's own, that a window shows of the player. */
export type PlayerIds = (player: Player) => Iterable<string>;

/** Each of the player's cities. */
export const cityIds: PlayerIds = (player) =>
  player.cities.map((city) => city.id);

/** Each of the player's cities, its growth and its build: a row of the City Status or Trade Report. */
export const cityRowIds: PlayerIds = (player) =>
  player.cities.flatMap(({ id, build, growth }) => [id, growth.id, build.id]);

/** The player's research and each of its cities. */
export const researchIds: PlayerIds = (player) => [
  player.research.id,
  ...cityIds(player),
];

/**
 * Keeps an open report current (#344). It wakes when the player changes, or any of the ids `ids` picks from it. Those
 * are read live at each render, so a city founded after the report opened is followed without re-subscribing.
 *
 * `update` is given the player as `data` holds it now, which the ids are read from after that, as a rebuild of
 * everything leaves the one held stale.
 *
 * Returns what stops the watch.
 */
export const watchPlayer = (
  player: Player,
  ids: PlayerIds,
  update: (player: Player, data: GameData) => void,
  changes: DataChanges = instance
): (() => void) => {
  // Refilled in place by each rebuild from patches, `refillAll` included, so it survives those. Only a rebuild of
  //  everything (which resets the reconstituter) or a second `gameData` replaces it, so after each update it is swapped
  //  for the one `data` holds.
  let current = player;

  return changes.watch(
    () => [current.id, ...ids(current)],
    (data) => {
      current = data.player;

      update(current, data);
    }
  );
};

export default watchPlayer;
