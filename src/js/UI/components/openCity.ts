import City, { classicCityLayout } from './City';
import { City as CityData } from '../types';
import Portal from './Portal';
import Transport from '../Transport';
import cityLayout from './CityLayout';
import { defineSlot } from '../lib/interfaceMode';

type CityLayout = typeof cityLayout | typeof classicCityLayout;

// The interface's `cityScreen` slot (#824).
export const cityScreen = defineSlot<CityLayout>('cityScreen');

cityScreen.provide('window', cityLayout);
cityScreen.provide('page', classicCityLayout);

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
