// Carrying a game in progress over a reload (#1118): a theme with other interface art needs a new page, as what's drawn
//  with the old art stays drawn, and the game is saved, handed over as Load Game hands a save over, and loaded again on
//  the other side. The game says how (`provideGameHandOver`, in `GameSession`), while it can be: before a game, and
//  for a game being watched, there is none, and nothing is handed over.

/** Starts handing the game over to a new page: false, with nothing started, when it can't be now. */
export type GameHandOver = () => boolean;

let handOver: GameHandOver | null = null;

/** Hands the game over with `gameHandOver` from now on, or with nothing, given null. */
export const provideGameHandOver = (
  gameHandOver: GameHandOver | null
): void => {
  handOver = gameHandOver;
};

/** Whether there's a game that could be handed over to a new page. */
export const canHandOverGame = (): boolean => handOver !== null;

/**
 * Starts handing the game in progress over to a new page, which loads it again: the page reloads once it's saved.
 *  False, with nothing started, when there's no game to hand over or it can't be now (waiting for the turn).
 */
export const handOverGame = (): boolean => handOver?.() ?? false;

export default handOverGame;
