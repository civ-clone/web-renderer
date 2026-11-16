import BuildingComplete from '@civ-clone/core-city-build/Rules/BulidingComplete';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import Criterion from '@civ-clone/core-rule/Criterion';
import Effect from '@civ-clone/core-rule/Effect';
import Engine from '@civ-clone/core-engine/Engine';
import { ManhattanProject } from '@civ-clone/civ2-wonder/Wonders';
import Player from '@civ-clone/core-player/Player';
import ReputationChanged from '@civ-clone/core-diplomacy/Rules/Reputation/Changed';

/**
 * Tells the client of the Wonders that change reputations (M2d, #1007), as engine events the client's notices listen
 *  for: civ2-wonder changes them and emits nothing itself. The Eiffel Tower halves its owner's reputation once
 *  (`civ2:reputation-restored`, the player, from its reputation change); the Manhattan Project brings everyone's down
 *  when it's completed (`civ2:reputations-halved`, its owner, once, whether or not anyone's reputation moves). Only
 *  Civ2's rules register them, and they change nothing in the game.
 */
export const reputationNotices = (
  engine: Pick<Engine, 'emit'>
): (ReputationChanged | BuildingComplete)[] => [
  new ReputationChanged(
    'ui-rules-civ2:reputation/changed/eiffel-tower',
    new Effect(
      (player: Player, from: number, to: number, reason?: string): void => {
        if (reason === 'eiffel-tower') {
          engine.emit('civ2:reputation-restored', player, from, to);
        }
      }
    )
  ),
  new BuildingComplete(
    'ui-rules-civ2:city/building-complete/manhattan-project',
    new Criterion(
      (cityBuild: CityBuild, item: unknown): boolean =>
        item instanceof ManhattanProject
    ),
    new Effect((cityBuild: CityBuild): void => {
      engine.emit('civ2:reputations-halved', cityBuild.city().player());
    })
  ),
];

export default reputationNotices;
