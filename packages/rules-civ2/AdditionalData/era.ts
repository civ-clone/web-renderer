import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import type { Era } from '@civ-clone/ui-worker-client/workerRules';
import Player from '@civ-clone/core-player/Player';
import { peopleEra } from '../lib/cityStyle';

/**
 * The age `player` is in, which the map draws their cities in (D9): their citizens' row, from their advances
 *  (`peopleEra`), the finest of the eras Civ2's city styles use. So never classical or medieval.
 */
export const era = (player: Player): Era => peopleEra(player);

/** `era` for your own player: a rival's goes on its stand-in (`WorkerRules.era`). */
export const eraData = (): AdditionalData =>
  new AdditionalData(Player, 'era', (player: Player): Era => era(player));

export default eraData;
