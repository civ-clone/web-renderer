import { Bomber, Crusader, StealthBomber } from '@civ-clone/civ2-unit/Units';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import Unit from '@civ-clone/core-unit/Unit';
import { unitTypes } from '@civ-clone/civ2-unit/lib/unitTable';
import { units } from '@civ-clone/civ2-unit/data/units';

// What a Civ2 battle sounds like (M2b), in the words the sound pack knows (`battleTunes`: `melee`, `gunfire`,
//  `bombing`), most specific first, as civ1-unit's `attackSound` gives Civ1's. There are no Civ2 sounds here, so Civ2's
//  units borrow Civ1's three, by Civ1's own test on civ2-unit's table (`@UNITS`): a gun's for an attack above 4 or a
//  defence above 2, a blade's otherwise, and a bombing run first for the bombers. Crusaders, mounted knights whose
//  attack of 5 would pass for a gun's, sound like Knights.

const bombers: (typeof Unit)[] = [Bomber, StealthBomber],
  blades: (typeof Unit)[] = [Crusader];

/** The sound for a unit of `UnitType`, or `null` for one that isn't in civ2-unit's table. */
export const attackSoundFor = (UnitType: typeof Unit): string[] | null => {
  const row = units[unitTypes.indexOf(UnitType)];

  if (row === undefined) {
    return null;
  }

  const [, , , , attack, defence] = row,
    sound =
      !blades.includes(UnitType) && (attack > 4 || defence > 2)
        ? 'gunfire'
        : 'melee';

  return bombers.includes(UnitType) ? ['bombing', sound] : [sound];
};

export const attackSound = (): AdditionalData =>
  new AdditionalData(Unit, 'attackSound', (unit: Unit): string[] | null =>
    attackSoundFor(unit.constructor as typeof Unit)
  );

export default attackSound;
