import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import { turnsUntilChoice } from '@civ-clone/civ1-government/lib/revolution';

/**
 * Turns until a revolution's new government can be chosen, so the player details can say how long Anarchy has left
 * (#33). `null` when there's no revolution under way. The countdown is a `PendingEffect`, which the renderer is never
 * sent.
 */
export const anarchyTurns = (): AdditionalData =>
  new AdditionalData(
    PlayerGovernment,
    'anarchyTurns',
    (playerGovernment: PlayerGovernment): number | null =>
      turnsUntilChoice(playerGovernment)
  );

export default anarchyTurns;
