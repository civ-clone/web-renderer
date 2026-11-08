import { City as CityData } from '@civ-clone-ui/client/types';
import { INotificationWindow } from '@civ-clone-ui/widgets/components/NotificationWindow';
import Portal from '@civ-clone-ui/map/components/Portal';
import { cityName } from '@civ-clone-ui/client/components/lib/city';
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
