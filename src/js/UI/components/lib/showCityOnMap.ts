import { City as CityData } from '../../types';
import { INotificationWindow } from '../NotificationWindow';
import Portal from '../Portal';
import { cityName } from './city';
import { t } from 'i18next';

export const showCityOnMapAction = (city: CityData, portal: Portal) => ({
  label: t('Actions.ShowOnMap.label', {
    cityName: cityName(city),
  }),
  action(selectionWindow: INotificationWindow) {
    selectionWindow.close();

    portal.setCenter(city.tile.x, city.tile.y);
  },
});

export default showCityOnMapAction;
