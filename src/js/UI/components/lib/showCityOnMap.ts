import { City as CityData } from '../../types';
import { INotificationWindow } from '../NotificationWindow';
import Portal from '../Portal';

export const showCityOnMapAction = (city: CityData, portal: Portal) => ({
  label: 'Show on map',
  action(selectionWindow: INotificationWindow) {
    selectionWindow.close();

    portal.setCenter(city.tile.x, city.tile.y);
  },
});

export default showCityOnMapAction;
