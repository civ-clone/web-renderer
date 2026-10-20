// The Hall of Fame (#179): your best games, kept in this browser as Civ1 kept them on the machine. Free of DOM imports
//  so it can be tested in Node.

import { GameOverDetails } from '../../Engine/lib/gameOver';

export type HallOfFameStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type HallOfFameEntry = {
  // The game's result, so a game is recorded once, however often its ending is shown.
  id: string;
  civilization: string;
  leader: string | null;
  difficulty: string | null;
  reason: string;
  year: number;
  score: number;
  rating: number;
  // When the game ended, in milliseconds since the epoch.
  date: number;
};

const storageKey = 'civ.hallOfFame';

// How many games it keeps.
export const hallOfFameSize = 10;

const browserStorage = (): HallOfFameStorage | null =>
  globalThis.localStorage ?? null;

const isEntry = (entry: unknown): entry is HallOfFameEntry =>
  typeof entry === 'object' &&
  entry !== null &&
  typeof (entry as HallOfFameEntry).id === 'string' &&
  typeof (entry as HallOfFameEntry).rating === 'number' &&
  typeof (entry as HallOfFameEntry).score === 'number';

// Ranked by rating, as Civ1 ranks it, then by score.
const ranked = (entries: HallOfFameEntry[]): HallOfFameEntry[] =>
  [...entries]
    .sort((a, b) => b.rating - a.rating || b.score - a.score)
    .slice(0, hallOfFameSize);

/**
 * The games in the Hall of Fame, best first. A browser that won't keep them, or that has something else under the key,
 * has none.
 */
export const hallOfFame = (
  storage: () => HallOfFameStorage | null = browserStorage
): HallOfFameEntry[] => {
  try {
    const stored = JSON.parse(storage()?.getItem(storageKey) ?? '[]');

    return Array.isArray(stored) ? ranked(stored.filter(isEntry)) : [];
  } catch {
    return [];
  }
};

// The entry a game's ending makes, or `null` when it makes none: a civilization destroyed has no score, and once you
//  keep playing the score is final and nothing more is recorded.
export const hallOfFameEntry = (
  details: GameOverDetails,
  date: number
): HallOfFameEntry | null =>
  details.score === null || details.rating === null || details.scoringComplete
    ? null
    : {
        // Every game's result is `GameResult-1` (each game is a fresh worker, and a load restores the counters), so the
        //  id alone can't tell games apart. With who played it and how it ended, it can.
        id: [
          details.id,
          details.you.civilization,
          details.you.leader,
          details.difficulty,
          details.reason,
          details.turn,
          details.score.total,
        ].join('|'),
        civilization: details.you.civilization,
        leader: details.you.leader,
        difficulty: details.difficulty,
        reason: details.reason,
        year: details.year,
        score: details.score.total,
        rating: details.rating,
        date,
      };

/**
 * Record a game, once, and return the Hall of Fame with it. A game already recorded, or one that doesn't make the
 * cut, leaves it as it was. A browser that won't keep it still shows the game for now.
 */
export const enterHallOfFame = (
  entry: HallOfFameEntry,
  storage: () => HallOfFameStorage | null = browserStorage
): HallOfFameEntry[] => {
  const entries = hallOfFame(storage);

  if (entries.some(({ id }) => id === entry.id)) {
    return entries;
  }

  const updated = ranked([...entries, entry]);

  try {
    storage()?.setItem(storageKey, JSON.stringify(updated));
  } catch {
    // Storage is blocked or full: the game isn't kept.
  }

  return updated;
};
