import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import Unit from '@civ-clone/core-unit/Unit';
import { fuelState } from '@civ-clone/base-unit-fuel/lib/reach';
import { instance as unitImprovementRegistryInstance } from '@civ-clone/core-unit-improvement/UnitImprovementRegistry';

// Civ2's combat and fuel (M2b, #1007), for the unit card. Only Civ2's rules register these, so a Civ1 unit's payload has
//  none of the keys and is as it was.

/** The hit points the unit has left and its most (civ2-unit's `HitPoints`, the `@UNITS` row ×10); `null` for none. */
export const unitHitPoints = (): AdditionalData =>
  new AdditionalData(
    Unit,
    'hitPoints',
    (unit: Unit): { current: number; max: number } | null => {
      const [current, max] = unit.hitPoints();

      return max > 0 ? { current, max } : null;
    }
  );

/** The damage the unit deals a round it wins (civ2-unit's `Firepower`); `null` for none. */
export const unitFirepower = (): AdditionalData =>
  new AdditionalData(Unit, 'firepower', (unit: Unit): number | null => {
    const value = unit.firepower().value();

    return value > 0 ? value : null;
  });

/**
 * An aircraft's fuel (base-unit-fuel's `fuelState`): its range, in turns it can end away from a city, an airbase or a
 *  carrier, and the turns of that it has left, this one included. `null` for a unit that needs none.
 */
export const unitFuel = (): AdditionalData =>
  new AdditionalData(
    Unit,
    'fuel',
    (unit: Unit): { range: number; turnsLeft: number } | null => {
      const state = fuelState(unitImprovementRegistryInstance, unit);

      return state === null
        ? null
        : { range: state.range, turnsLeft: state.turnsLeft };
    }
  );
