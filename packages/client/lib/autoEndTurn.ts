import { Player } from '../types';

// Whether `GameSession` ends the turn by itself after an update: the `autoEndOfTurn` option is on, the only thing left
//  to do is end the turn, and the player has none of the actions named in `autoEndOfTurnExceptions` that they haven't
//  dismissed this turn (#416). Never while waiting for the other civilizations.

/** The part of `GameOptionsRegistry` this reads. */
export interface AutoEndTurnOptions {
  get(key: string, defaultValue?: any): any;
}

export const shouldAutoEndTurn = (
  player: Pick<Player, 'actions' | 'mandatoryActions'>,
  options: AutoEndTurnOptions,
  waiting: boolean,
  dismissed: (action: Player['actions'][number]) => boolean = () => false
): boolean => {
  const autoEndOfTurnExceptions = options.get('autoEndOfTurnExceptions', []);

  return (
    !waiting &&
    // The option's own value, or `null` when it is unset: either way a yes or a no here.
    !!options.get('autoEndOfTurn') &&
    player.mandatoryActions.length === 1 &&
    player.mandatoryActions.every((action) => action._ === 'EndTurn') &&
    !player.actions.some(
      (action) =>
        autoEndOfTurnExceptions.includes(action._) && !dismissed(action)
    )
  );
};

export default shouldAutoEndTurn;
