import { City } from '../../types';
import { t } from 'i18next';

export const cityName = (city: City | null): string =>
  city === null
    ? t('None', {
        ns: 'city',
      })
    : t(`${city.player.civilization._}.${city.name}.name`, {
        defaultValue: city.name,
        ns: 'city',
      });
