import { City as CityData } from '../../types';
import { INotificationWindow } from '../NotificationWindow';
import Portal from '../Portal';
import Transport from '../../Transport';
import { t } from 'i18next';

export const showCityAction = (
  city: CityData,
  portal: Portal,
  transport: Transport
) => ({
  label: t('Actions.ShowCity.label', {
    city,
  }),
  action(selectionWindow: INotificationWindow) {
    selectionWindow.close();

    portal.openCity(city);
  },
});

export default showCityAction;
