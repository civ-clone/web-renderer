import City, { classicCityLayout } from './City';
import { City as CityData } from '@civ-clone/ui-client/types';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import cityLayout from './CityLayout';
import { defineSlot } from '@civ-clone/ui-client/lib/interfaceMode';

type CityLayout = typeof cityLayout | typeof classicCityLayout;

// The interface's `cityScreen` slot (#824), which each interface in `interfaces/` fills (#825).
export const cityScreen = defineSlot<CityLayout>('cityScreen');

/**
 * Where the city screen is put together (#735): the classic page, or the window with its columns (#746). Every way a city screen opens comes here. `readOnly` shows a city that can't be changed, as a
 *  Diplomat's investigation sends one (#58).
 */
export const openCity = (
  city: CityData,
  portal: Portal,
  transport: Transport,
  { readOnly = false }: { readOnly?: boolean } = {}
): City =>
  new City(city, portal, transport, {
    readOnly,
    layout: cityScreen.current(),
  });

export default openCity;
