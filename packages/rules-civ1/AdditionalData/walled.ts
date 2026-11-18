import {
  CityImprovementRegistry,
  instance as cityImprovementRegistryInstance,
} from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import City from '@civ-clone/core-city/City';
import { CityWalls } from '@civ-clone/civ1-city-improvement/CityImprovements';

/**
 * Whether the map draws `city` walled (#688): it has City Walls, as v474.05 draws them on any city it draws (`MAP.C`,
 *  `buildings & 0x80`). Civ1's Great Wall is no walls (a parley's peace offer), so it doesn't count.
 */
export const walled = (
  city: City,
  cityImprovementRegistry: CityImprovementRegistry = cityImprovementRegistryInstance
): boolean =>
  cityImprovementRegistry
    .getByCity(city)
    .some((improvement) => improvement instanceof CityWalls);

/** `walled` for your own cities: a rival's goes on its stand-in, as last seen (`WorkerRules.walled`). */
export const walledData = (): AdditionalData =>
  new AdditionalData(City, 'walled', (city: City): boolean => walled(city));

export default walledData;
