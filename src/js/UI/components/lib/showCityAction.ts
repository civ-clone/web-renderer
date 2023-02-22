import City from '../City';
import { City as CityData } from '../../types';
import { INotificationWindow } from '../NotificationWindow';
import Portal from '../Portal';
import Transport from '../../Transport';

export const showCityAction = (
  city: CityData,
  portal: Portal,
  transport: Transport
) => ({
  label: 'View city',
  action(selectionWindow: INotificationWindow) {
    selectionWindow.close();

    new City(city, portal, transport);
  },
});

export default showCityAction;
