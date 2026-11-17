import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import Spaceship from '@civ-clone/core-spaceship/Spaceship';
import { statsOf } from '@civ-clone/civ2-spaceship/lib/ship';

/**
 * What the spaceship window shows of a Civ2 ship that Civ1's yields don't carry (M2e): its supplies, each as a fraction
 *  from 0 to 1, and its mass, which counts every part built, not only the parts that count.
 */
export type SpaceshipSupply = {
  // Life support for the habitation.
  lifeSupport: number;
  // Solar power for the modules.
  energy: number;
  // Fuel for the propulsion.
  fuel: number;
  // The mass of every part built, in civ2-spaceship's units (a structural 1, a component 4, a module 16).
  mass: number;
};

// A percentage as a fraction, kept to 0 to 1: civ2-spaceship's figures can run past 100 (fuel for no propulsion, say).
const fraction = (percent: number): number =>
  Math.min(1, Math.max(0, percent / 100));

/**
 * A Civ2 ship's supplies and mass, from civ2-spaceship's figures: Civ2's parts have no energy or life support yields,
 *  and a Civ2 ship flies with every part built, so the window reads these rather than working them out from the
 *  counted parts' yields as it does for Civ1's ship.
 */
export const spaceshipSupply = (): AdditionalData =>
  new AdditionalData(
    Spaceship,
    'supply',
    (spaceship: Spaceship): SpaceshipSupply => {
      const { support, energy, fuel, mass } = statsOf(spaceship);

      return {
        lifeSupport: fraction(support),
        energy: fraction(energy),
        fuel: fraction(fuel),
        mass,
      };
    }
  );

export default spaceshipSupply;
