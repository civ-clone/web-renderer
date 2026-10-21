// What the action handlers read (#449): the player, the patches an action queues, the unit the UI has the actions of,
//  the talks an action waits for, and the registries the actions look things up in.

import { CityImprovementRegistry } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import { CityRegistry } from '@civ-clone/core-city/CityRegistry';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import { PlayerTreasuryRegistry } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { PlayerWorldRegistry } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import ActionsState from '../ActionsState';
import PlayerPatches from '../PlayerPatches';
import Talks from '../Talks';

export type ActionContext = {
  player(): Player;
  patches: PlayerPatches;
  // The unit the UI has the actions of (#323), which a unit's action changes.
  actions: ActionsState;
  // The talks a unit's action waits for, and those it offers with the players it met on the way.
  talks: Pick<Talks, 'pending' | 'talkToPlayersMet'>;
  cities: Pick<CityRegistry, 'getBy' | 'getByPlayer'>;
  cityImprovements: Pick<CityImprovementRegistry, 'getByCity'>;
  playerTreasuries: Pick<PlayerTreasuryRegistry, 'getBy'>;
  playerWorlds: Pick<PlayerWorldRegistry, 'getByPlayer'>;
  rules: RuleRegistry;
};

// Acts on one of the player's actions, as the UI sent it (`action`) and as the player has it (`playerAction`), and
//  says whether the turn is over.
export type ActionHandler<Action extends PlayerAction = PlayerAction> = (
  ctx: ActionContext,
  action: any,
  playerAction: Action
) => Promise<boolean>;
