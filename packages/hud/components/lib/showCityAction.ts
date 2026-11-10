import { City as CityData } from '@civ-clone/ui-protocol/types';
import { INotificationWindow } from '@civ-clone/ui-component-window/NotificationWindow';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
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
