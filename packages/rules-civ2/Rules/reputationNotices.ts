import Effect from '@civ-clone/core-rule/Effect';
import Engine from '@civ-clone/core-engine/Engine';
import Player from '@civ-clone/core-player/Player';
import ReputationChanged from '@civ-clone/core-diplomacy/Rules/Reputation/Changed';

/**
 * Tells the client of the Wonders that change reputations (M2d, #1007): civ2-wonder changes them with a reason and emits
 *  nothing itself, so these turn the changes into engine events, which the client's notices listen for. The Eiffel
 *  Tower halves its owner's reputation once (`civ2:reputation-restored`, the player), and the Manhattan Project brings
 *  everyone's down (`civ2:reputations-halved`, each player). Only Civ2's rules register them, and they change nothing
 *  in the game.
 */
export const reputationNotices = (
  engine: Pick<Engine, 'emit'>
): ReputationChanged[] => [
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
  new ReputationChanged(
    'ui-rules-civ2:reputation/changed/manhattan-project',
    new Effect(
      (player: Player, from: number, to: number, reason?: string): void => {
        if (reason === 'manhattan-project') {
          engine.emit('civ2:reputations-halved', player, from, to);
        }
      }
    )
  ),
];

export default reputationNotices;
