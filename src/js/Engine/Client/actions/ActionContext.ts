// What the action handlers read (#449): the player, the patches an action queues, the unit the UI has the actions of,
//  the talks an action waits for, and the registries the actions look things up in.

import PlayerAction from '@civ-clone/core-player/PlayerAction';
import { ClientContext, Registries } from '../ClientContext';
import Talks from '../Talks';

export type ActionContext = Pick<
  ClientContext,
  | 'player'
  | 'patches'
  // The unit the UI has the actions of (#323), which a unit's action changes.
  | 'actions'
  // Whole, as a city told to choose its own builds hands them to `autoBuild`.
  | 'rules'
> &
  Registries<{
    cities: 'getBy' | 'getByPlayer';
    cityImprovements: 'getByCity';
    playerTreasuries: 'getBy';
    playerWorlds: 'getByPlayer';
  }> & {
    // The talks a unit's action waits for, and those it offers with the players it met on the way. `EndTurn` waits for
    //  those under way too.
    talks: Pick<Talks, 'pending' | 'talkToPlayersMet' | 'underWay'>;
  };

// Acts on one of the player's actions, as the UI sent it (`action`) and as the player has it (`playerAction`), and
//  says whether the turn is over.
export type ActionHandler<Action extends PlayerAction = PlayerAction> = (
  ctx: ActionContext,
  action: any,
  playerAction: Action
) => Promise<boolean>;
