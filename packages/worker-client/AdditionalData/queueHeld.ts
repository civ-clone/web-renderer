import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import { IBuildable as Buildable } from '@civ-clone/core-city-build/Buildable';
import CityBuild from '@civ-clone/core-city-build/CityBuild';

/**
 * The ids of the rules that would hold each queued item of a city's build (#970), by its place in the queue, as
 *  `CityBuild#heldFor` gives them for the city as it is now, so the city screen can say beside a queued item what holds
 *  it as things stand. The queue itself is sent as `BuildItem`s, which are made afresh each time it is sent and don't
 *  know their city's rules, so the ids go with the build.
 */
export const queueHeld = (): AdditionalData =>
  new AdditionalData(
    CityBuild,
    'queueHeld',
    (cityBuild: CityBuild): (string | null)[][] =>
      cityBuild.queued().map((Item: Buildable) => cityBuild.heldFor(Item))
  );

export default queueHeld;
