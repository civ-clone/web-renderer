import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import Spaceship from '@civ-clone/core-spaceship/Spaceship';
import { statsOf } from '@civ-clone/civ2-spaceship/lib/ship';

/** What the spaceship window shows of a Civ2 ship that Civ1's yields don't carry, each as a fraction (M2e). */
export type SpaceshipSupply = {
  // Life support for the habitation.
  lifeSupport: number;
  // Solar power for the modules.
  energy: number;
  // Fuel for the propulsion.
  fuel: number;
};

/**
 * A Civ2 ship's supplies, from civ2-spaceship's figures: Civ2's parts have no energy or life support yields, so the
 *  window reads them from here rather than working them out from yields as it does for Civ1's ship.
 */
export const spaceshipSupply = (): AdditionalData =>
  new AdditionalData(
    Spaceship,
    'supply',
    (spaceship: Spaceship): SpaceshipSupply => {
      const { support, energy, fuel } = statsOf(spaceship);

      return {
        lifeSupport: support / 100,
        energy: energy / 100,
        fuel: fuel / 100,
      };
    }
  );

export default spaceshipSupply;
