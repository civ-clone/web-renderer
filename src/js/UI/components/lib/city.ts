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

// The name `Generic.city-name` gives, by the city's founder, as text for a text node rather than HTML: it would escape
//  a name that isn't on its founder's list, so "O'Brien" showed as "O&#39;Brien" (#472).
export const cityNameText = (city: {
  name: string;
  originalPlayer: { civilization: { _: string } };
}): string =>
  t('Generic.city-name', {
    civilization: city.originalPlayer.civilization._,
    interpolation: { escapeValue: false },
    name: city.name,
  });
