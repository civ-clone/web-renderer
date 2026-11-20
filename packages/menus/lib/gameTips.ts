// Which of the game's help is due (#1295), from what the game shows: a tip for each moment a new player meets, once a
//  game. Worked out from the data rather than from the windows opening, and shown in turn with the game's notices.

import type { Player, Unit } from '@civ-clone/ui-protocol/types';

export type GameTip =
  | 'found-city'
  | 'city-founded'
  | 'research'
  | 'unit-built'
  | 'fortify'
  | 'expand'
  | 'disorder'
  | 'starving'
  | 'barbarians';

export type GameMoment = {
  player: Player;
  // The unit awaiting orders, if any. Its orders arrive after it does, so it's looked at again as they do.
  active: Unit | null;
  turn: number;
  // Whether the player has been seen with no city in this page: only then is a first city a first.
  hadNoCity: boolean;
  // The tips shown so far, not those only waiting: a tip that follows another waits until that one has been read.
  shown: readonly string[];
};

// The early tips, for a player still finding their feet: a save loaded with an empire grown isn't told about its first
//  city.
const early = (player: Player): boolean => player.cities.length <= 2;

const canDo = (unit: Unit | null, action: string): boolean =>
  (unit?.actions ?? []).some(({ _ }) => _ === action);

/** The tips due now, in the order they'd be shown, leaving out those `seen`. */
export const tipsDue = (
  { player, active, turn, hadNoCity, shown }: GameMoment,
  seen: readonly string[]
): GameTip[] =>
  (
    [
      ['found-city', player.cities.length === 0 && canDo(active, 'FoundCity')],
      ['city-founded', hadNoCity && player.cities.length > 0],
      [
        'research',
        // Once there's a city to research with: the first turn's tip is the Settlers'.
        player.cities.length > 0 &&
          early(player) &&
          player.actions.some(({ _ }) => _ === 'ChooseResearch'),
      ],
      [
        'fortify',
        // Not straight after the new unit's own tip, which it follows.
        shown.includes('unit-built') &&
          early(player) &&
          canDo(active, 'Fortify') &&
          active!.tile.city?.player?.id === player.id,
      ],
      ['expand', turn >= 20 && player.cities.length === 1],
    ] as [GameTip, boolean][]
  )
    .filter(([tip, due]) => due && !seen.includes(tip))
    .map(([tip]) => tip);

/**
 * Whether the player has a unit they didn't have last time (`known`, their units' ids then, or `null` before the first
 *  look): a city's first unit, as an early tip has it. Not only from the notice, which a city building the same unit
 *  again ("Keep building military units") doesn't send.
 */
export const hasNewUnit = (
  known: ReadonlySet<string> | null,
  player: Player
): boolean =>
  known !== null &&
  early(player) &&
  player.units.some(({ id }) => !known.has(id));

/** The tip a notification of the game's brings, if any: those that happen at any time, and the first unit built. */
export const tipForNotification = (
  key: string,
  player: Player
): GameTip | null => {
  if (key === 'City.building-complete.unit') {
    return early(player) ? 'unit-built' : null;
  }

  if (key === 'City.civil-disorder') {
    return 'disorder';
  }

  // Either way: with a unit lost to it or not.
  if (key.startsWith('City.food-storage-exhausted')) {
    return 'starving';
  }

  // Their arrival, by sea or rising in the land (Civ2's armed and tribal risings too), not an uprising that failed.
  if (
    key === 'Barbarians.landing' ||
    (key.startsWith('Barbarians.uprising') &&
      key !== 'Barbarians.uprising-failed')
  ) {
    return 'barbarians';
  }

  return null;
};
