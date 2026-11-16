import {
  PendingEffectRegistry,
  instance as pendingEffectRegistryInstance,
} from '@civ-clone/core-pending-effect';
import {
  RuleRegistry,
  instance as ruleRegistryInstance,
} from '@civ-clone/core-rule/RuleRegistry';
import {
  Turn,
  instance as turnInstance,
} from '@civ-clone/core-turn-based-game/Turn';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import { REVOLUTION } from '@civ-clone/civ2-government/lib/revolution';
import { rechoiceOpen } from '@civ-clone/base-government-change/lib/rechoice';

/**
 * Whether a revolution now would be a free re-choice (M2d, #1007): the player chose its government this turn, and
 *  civ2-government's `MayRechoose` rules let it choose again with no Anarchy. The Revolution window words its question
 *  so.
 */
export const rechoose = (
  pendingEffects: PendingEffectRegistry = pendingEffectRegistryInstance,
  rules: RuleRegistry = ruleRegistryInstance,
  turn: Turn = turnInstance
): AdditionalData =>
  new AdditionalData(
    PlayerGovernment,
    'rechoose',
    (playerGovernment: PlayerGovernment): boolean =>
      rechoiceOpen(REVOLUTION, playerGovernment, pendingEffects, rules, turn)
  );

export default rechoose;
