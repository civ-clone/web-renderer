import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import { turnsUntilChoice } from '@civ-clone/civ2-government/lib/revolution';

/**
 * Turns until a revolution's new government can be chosen, so the player details can say how long Anarchy has left,
 * as Civ1's does (#33). `null` when there's no revolution under way.
 */
export const anarchyTurns = (): AdditionalData =>
  new AdditionalData(
    PlayerGovernment,
    'anarchyTurns',
    (playerGovernment: PlayerGovernment): number | null =>
      turnsUntilChoice(playerGovernment)
  );

export default anarchyTurns;
