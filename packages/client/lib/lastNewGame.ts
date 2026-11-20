// What each game was last started with (#1247): its grid, the world's size and how many civilizations, which New Game
//  starts that game with next time, without asking. Kept in this browser beside the difficulty (`difficulty.ts`), and
//  free of DOM imports so it can be tested in Node. It's a convenience, so storage that is blocked, full or unreadable
//  just means the defaults.

import { TopologyId } from './topologyFor';

export type LastNewGameStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** What a game was last started with. Each part is missing until it has been chosen. */
export type LastNewGame = {
  topologyId?: TopologyId;
  /** The world size's key: `normal`, `large`… */
  size?: string;
  players?: number;
};

const storageKey = 'civ.newGame';

const browserStorage = (): LastNewGameStorage | null =>
  globalThis.localStorage ?? null;

const readAll = (
  storage: () => LastNewGameStorage | null
): { [game: string]: LastNewGame } => {
  try {
    const parsed = JSON.parse(storage()?.getItem(storageKey) ?? '{}');

    return parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

/**
 * What `game` (a set's id, or `''` where there is only the one game) was last started with in this browser, keeping
 *  only the parts that are what they should be.
 */
export const lastNewGame = (
  game: string,
  storage: () => LastNewGameStorage | null = browserStorage
): LastNewGame => {
  const stored = readAll(storage)[game],
    last: LastNewGame = {};

  if (stored === null || typeof stored !== 'object') {
    return last;
  }

  if (typeof stored.topologyId === 'string') {
    last.topologyId = stored.topologyId;
  }

  if (typeof stored.size === 'string') {
    last.size = stored.size;
  }

  if (
    typeof stored.players === 'number' &&
    Number.isInteger(stored.players) &&
    stored.players > 0
  ) {
    last.players = stored.players;
  }

  return last;
};

/** Keeps what `game` was started with, for New Game to start it with next time. */
export const rememberNewGame = (
  game: string,
  choices: Required<LastNewGame>,
  storage: () => LastNewGameStorage | null = browserStorage
): void => {
  try {
    storage()?.setItem(
      storageKey,
      JSON.stringify({ ...readAll(storage), [game]: choices })
    );
  } catch {
    // Storage is blocked or full: the next game starts with the defaults instead.
  }
};
