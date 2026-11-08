import { City, CityGrowth } from '@civ-clone/ui-protocol/types';
import { t } from 'i18next';

export const cityName = (city: City | null): string =>
  city === null
    ? t('None', {
        ns: 'city',
      })
    : t(`${city.originalPlayer.civilization._}.${city.name}.name`, {
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

/** "View Beijing", as text: the name of a button that opens a city, its city named as `cityNameText` names it. */
export const viewCityText = (city: {
  name: string;
  originalPlayer: { civilization: { _: string } };
}): string =>
  t('ReportTable.view-city', {
    city: cityNameText(city),
    interpolation: { escapeValue: false },
  });

/**
 * "Needs an Aqueduct", as text, when the ruleset says the city can't grow without it (#781): said in place of the turns
 *  to a growth that won't happen. `null` when nothing holds it back.
 */
export const growthLimitText = (
  growth: CityGrowth | undefined
): string | null => {
  const needs = growth?.limit?.needs;

  if (!needs) {
    return null;
  }

  // An improvement's own sentence where its name needs an article ("an Aqueduct"), the plain one otherwise. i18next
  //  tries the first key in every language before the second, so a language that has the plain sentence needs each
  //  improvement's own one too, or English's shows through.
  return t([`City.Growth.needs-${needs}`, 'City.Growth.needs'], {
    improvement: t(`Improvement.${needs}.name`, {
      defaultValue: needs,
      ns: 'city',
    }),
    interpolation: { escapeValue: false },
  });
};
