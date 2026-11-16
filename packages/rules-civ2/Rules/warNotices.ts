import { TreatyLevel } from '@civ-clone/base-diplomacy/lib/treatyLevel';
import DeclaredWar from '@civ-clone/base-diplomacy/Rules/DeclaredWar';
import Effect from '@civ-clone/core-rule/Effect';
import Engine from '@civ-clone/core-engine/Engine';
import Player from '@civ-clone/core-player/Player';

/**
 * Tells the client of every war declared under Civ2's rules (M2d, #1007), with the treaty it broke: `civ2:war-on` (who
 *  declared it, on whom, and the treaty level just before). A treaty ends in Civ2 in many ways (a ceasefire superseded
 *  by peace, run out, an alliance ended in talks, a war ended by a treaty), and only a war breaks one, so the client
 *  tells of a broken treaty from this rather than from each treaty's ending (`player:declaration-expired`, which the
 *  rule set's notices replace). Only Civ2's rules register it, and it changes nothing in the game.
 */
export const warNotices = (engine: Pick<Engine, 'emit'>): DeclaredWar =>
  new DeclaredWar(
    'ui-rules-civ2:declared-war/emit',
    new Effect(
      (by: Player, against: Player, forced: boolean, broken: TreatyLevel) => {
        engine.emit('civ2:war-on', by, against, broken);
      }
    )
  );

export default warNotices;
