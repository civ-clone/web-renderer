import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import City from '@civ-clone/core-city/City';
import { civilDisorder } from '@civ-clone/civ2-city-happiness/lib/cityStatus';

/**
 * Whether the engine has declared the city in civil disorder, so the map can show it, as Civ1's does (#193). It only
 * changes at the start of a turn, when civ2-city-happiness records disorder or restores order.
 */
export const civilDisorderDeclared = (): AdditionalData =>
  new AdditionalData(
    City,
    'civilDisorderDeclared',
    (city: City): boolean => civilDisorder(city) !== null
  );

export default civilDisorderDeclared;
