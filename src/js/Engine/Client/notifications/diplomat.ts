// What the client tells the player about Diplomats (#449).

import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import Part from '@civ-clone/core-spaceship/Part';
import Unit from '@civ-clone/core-unit/Unit';
import Wonder from '@civ-clone/core-wonder/Wonder';

// What kind of thing a sabotaged city was building, which says where its name is translated, as `City.building-complete`
//  notices do (#58). `target` is the class being built, or nothing.
export const sabotagedBuildKind = (target: unknown): string => {
  const is = (Type: Function): boolean =>
    typeof target === 'function' &&
    Object.prototype.isPrototypeOf.call(Type, target);

  return is(Unit)
    ? '.unit'
    : is(Wonder)
    ? '.wonder'
    : is(CityImprovement)
    ? '.city-improvement'
    : is(Part)
    ? '.spaceship-part'
    : '';
};
