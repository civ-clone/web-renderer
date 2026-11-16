import {
  InteractionRegistry,
  instance as interactionRegistryInstance,
} from '@civ-clone/core-diplomacy/InteractionRegistry';
import {
  TreatyLevel,
  treatyLevel,
} from '@civ-clone/base-diplomacy/lib/treatyLevel';
import DeclaredWar from '@civ-clone/base-diplomacy/Rules/DeclaredWar';
import Effect from '@civ-clone/core-rule/Effect';
import Engine from '@civ-clone/core-engine/Engine';
import Low from '@civ-clone/core-rule/Priorities/Low';
import {
  PlayerRegistry,
  instance as playerRegistryInstance,
} from '@civ-clone/core-player/PlayerRegistry';
import Player from '@civ-clone/core-player/Player';
import { declaringQuietly } from '@civ-clone/civ2-diplomacy/lib/effects';

/**
 * Tells the client of every war declared under Civ2's rules (M2d, #1007), with the treaty it broke: `civ2:war-on` (who
 *  declared it, on whom, and the treaty level just before). A treaty ends in Civ2 in many ways (a ceasefire superseded
 *  by peace, run out, an alliance ended in talks, a war ended by a treaty), and only a war breaks one, so the client
 *  tells of a broken treaty from this rather than from each treaty's ending (`player:declaration-expired`, which the
 *  rule set's notices replace). After the rule set's own (`Low`), and only if a war is then in force: a war on an ally
 *  becomes an alliance cancelled, which is told as that. Nor for an ally joining its ally's war (civ2-diplomacy's
 *  `alliesJoinWar`, a war declared quietly by a player allied with someone at war with `against`), which civ2-diplomacy
 *  tells as that (`civ2-diplomacy:ally-joins-war`). Only Civ2's rules register it, and it changes nothing.
 */
export const warNotices = (
  engine: Pick<Engine, 'emit'>,
  interactionRegistry: InteractionRegistry = interactionRegistryInstance,
  playerRegistry: PlayerRegistry = playerRegistryInstance
): DeclaredWar =>
  new DeclaredWar(
    'ui-rules-civ2:declared-war/emit',
    new Low(),
    new Effect(
      (by: Player, against: Player, forced: boolean, broken: TreatyLevel) => {
        const level = (player: Player, other: Player): TreatyLevel =>
          treatyLevel({ interactionRegistry }, player, other);

        if (level(by, against) !== TreatyLevel.War) {
          return;
        }

        if (
          declaringQuietly(by) &&
          playerRegistry
            .entries()
            .some(
              (ally: Player) =>
                ally !== by &&
                ally !== against &&
                level(by, ally) === TreatyLevel.Alliance &&
                level(ally, against) === TreatyLevel.War
            )
        ) {
          return;
        }

        engine.emit('civ2:war-on', by, against, broken);
      }
    )
  );

export default warNotices;
