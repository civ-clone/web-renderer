import { Player } from '../types';

// Whether `Renderer` ends the turn by itself after an update: the `autoEndOfTurn` option is on, the only thing left to
//  do is end the turn, and the player has none of the actions named in `autoEndOfTurnExceptions`. Never while waiting
//  for the other civilizations.

/** The part of `GameOptionsRegistry` this reads. */
export interface AutoEndTurnOptions {
  get(key: string, defaultValue?: any): any;
}

export const shouldAutoEndTurn = (
  player: Pick<Player, 'actions' | 'mandatoryActions'>,
  options: AutoEndTurnOptions,
  waiting: boolean
): boolean => {
  const autoEndOfTurnExceptions = options.get('autoEndOfTurnExceptions', []);

  return (
    !waiting &&
    options.get('autoEndOfTurn') &&
    player.mandatoryActions.length === 1 &&
    player.mandatoryActions.every((action) => action._ === 'EndTurn') &&
    !player.actions.some((action) => autoEndOfTurnExceptions.includes(action._))
  );
};

export default shouldAutoEndTurn;
