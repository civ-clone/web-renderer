import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import City from '@civ-clone/core-city/City';
import { civilDisorder } from '@civ-clone/civ1-city-happiness/lib/cityStatus';

/**
 * Whether the engine has declared the city in civil disorder, so the map can show it (#193). Unlike `civilDisorder`,
 * which says whether the city *would* riot as things stand (and so follows every change to the luxury rate or the
 * specialists), this only changes at the start of a turn, when the engine records disorder or restores order. That
 * record is a `PendingEffect`, which the renderer is never sent.
 */
export const civilDisorderDeclared = (): AdditionalData =>
  new AdditionalData(
    City,
    'civilDisorderDeclared',
    (city: City): boolean => civilDisorder(city) !== null
  );

export default civilDisorderDeclared;
