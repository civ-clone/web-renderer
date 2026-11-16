// Civ2's revolution: a revolution starts Anarchy, and the new government is chosen once it is over (civ2-government's
//  `lib/revolution`, on base-government-change, with civ2-government's own save key and Anarchy). In the turn a person
//  chose a government, a revolution is a free re-choice (`MayRechoose`): civ2-government's rules say so, with the
//  game's rules handed to them (M2d). And a revolution offered as an advance makes a government available is accepted
//  as the original accepts it, always with Anarchy (`acceptRevolutionOffer`).

import {
  acceptRevolutionOffer,
  chooseGovernment,
  pendingRevolution,
  revolution,
} from '@civ-clone/civ2-government/lib/revolution';
import {
  PendingEffectRegistry,
  instance as pendingEffectRegistryInstance,
} from '@civ-clone/core-pending-effect';
import {
  PlayerGovernmentRegistry,
  instance as playerGovernmentRegistryInstance,
} from '@civ-clone/core-government/PlayerGovernmentRegistry';
import {
  Turn,
  instance as turnInstance,
} from '@civ-clone/core-turn-based-game/Turn';
import { ActionHandler } from '@civ-clone/ui-worker-client/Client/actions/ActionContext';
import ChooseGovernment from '@civ-clone/base-player-action-choose-government/ChooseGovernment';
import Government from '@civ-clone/core-government/Government';
import Player from '@civ-clone/core-player/Player';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import Revolution from '@civ-clone/base-player-action-revolution/Revolution';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';

export const handleRevolution: ActionHandler<Revolution> = async (
  ctx,
  action,
  playerAction
) => {
  revolution(
    playerAction.value() as PlayerGovernment,
    pendingEffectRegistryInstance,
    ctx.rules,
    ctx.turn
  );

  ctx.patches.player();

  return false;
};

export const handleChooseGovernment: ActionHandler<ChooseGovernment> = async (
  ctx,
  action,
  playerAction
) => {
  const playerGovernment = playerAction.value() as PlayerGovernment,
    { chosen } = action,
    [GovernmentType] = playerGovernment
      .available()
      .filter((GovernmentType) => GovernmentType.name === chosen);

  if (!GovernmentType) {
    console.error(`Government type: '${chosen}' not found.`);

    return false;
  }

  // With the game's rules, so a revolution later this turn is a free re-choice (`MayRechoose`).
  chooseGovernment(
    playerGovernment,
    GovernmentType,
    pendingEffectRegistryInstance,
    ctx.turn,
    ctx.rules
  );

  ctx.patches.player();

  return false;
};

/**
 * A revolution offered as an advance made `GovernmentType` available (`player:government:available`), accepted: Anarchy,
 *  as the original sets it, even in the turn a government was chosen. Nothing, if a revolution is already under way.
 */
export const acceptRevolution = (
  player: Player,
  GovernmentType: typeof Government,
  rules: RuleRegistry,
  playerGovernments: PlayerGovernmentRegistry = playerGovernmentRegistryInstance,
  pendingEffects: PendingEffectRegistry = pendingEffectRegistryInstance,
  turn: Turn = turnInstance
): void => {
  const playerGovernment = playerGovernments.getByPlayer(player);

  if (pendingRevolution(playerGovernment, pendingEffects) !== null) {
    return;
  }

  acceptRevolutionOffer(playerGovernment, pendingEffects, rules, turn);
};
