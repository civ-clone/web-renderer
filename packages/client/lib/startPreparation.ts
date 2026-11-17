// What a new game waits for before it is started (#1063): the art its map is drawn with, which may have to be fetched
//  first. The page says how (`provideStartPreparation`, in `bootstrap.ts`), as this package draws nothing; until it
//  does, nothing is waited for.

/** Readies a game on the `topologyId` grid to be drawn, and resolves whether it can be: false once the player's told why not. */
export type StartPreparation = (topologyId: string) => Promise<boolean>;

let prepare: StartPreparation = async () => true;

/** Has each new game wait for `preparation` before it starts. */
export const provideStartPreparation = (
  preparation: StartPreparation
): void => {
  prepare = preparation;
};

/** Whether a game on the `topologyId` grid can start now that what it draws with is ready: false once the player's told why not. */
export const prepareStart = (topologyId: string): Promise<boolean> =>
  prepare(topologyId);

export default prepareStart;
