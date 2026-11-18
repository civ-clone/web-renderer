import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import City from '@civ-clone/core-city/City';
import { CityWalls } from '@civ-clone/civ2-city-improvement/CityImprovements';
import { GreatWall } from '@civ-clone/civ2-wonder/Wonders';
import { cityHasImprovementOrWonder } from '@civ-clone/base-wonder/lib/hasImprovementOrWonder';

/**
 * Whether the map draws `city` walled (#688, #1069): it has City Walls, or its owner's Great Wall stands and isn't
 *  obsolete, which acts as City Walls in every one of their cities. The same test civ2-unit's defence makes
 *  (`unit_defense_strength`), so the map shows walls exactly where they defend.
 */
export const walled = (city: City): boolean =>
  cityHasImprovementOrWonder(city, CityWalls, GreatWall);

/** `walled` for your own cities: a rival's goes on its stand-in, as last seen (`WorkerRules.walled`). */
export const walledData = (): AdditionalData =>
  new AdditionalData(City, 'walled', (city: City): boolean => walled(city));

export default walledData;
