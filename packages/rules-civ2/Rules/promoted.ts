import Action from '@civ-clone/core-unit/Action';
import Effect from '@civ-clone/core-rule/Effect';
import Engine from '@civ-clone/core-engine/Engine';
import { Promoted } from '@civ-clone/base-unit-veteran-promotion/lib/Rules';
import Unit from '@civ-clone/core-unit/Unit';

/**
 * Tells the client a unit was promoted to veteran after a win (M2b, #1007). base-unit-veteran-promotion asks its
 *  `Promoted` rules "for a notice to its player" and emits nothing itself, so this one turns it into an engine event,
 *  `unit:promoted` (the unit, the unit it beat), which the client's notices listen for as they do the engine's own.
 *  Only Civ2's rules register it, and it changes nothing in the game.
 */
export const promoted = (engine: Pick<Engine, 'emit'>): Promoted =>
  new Promoted(
    'ui-rules-civ2:unit/promoted/emit',
    new Effect((unit: Unit, loser: Unit, action: Action): void => {
      engine.emit('unit:promoted', unit, loser, action);
    })
  );

export default promoted;
