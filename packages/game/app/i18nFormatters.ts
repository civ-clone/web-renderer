import { i18n } from 'i18next';

// i18next's own escaping, for a value it would have escaped itself.
const entities: { [character: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  },
  escapeHtml = (value: string): string =>
    value.replace(/[&<>"'\/]/g, (character) => entities[character]);

// Formatters the translations use, added once i18next is initialised (they live on its services). `capitalise`
//  upper-cases the first letter, for a value that opens a sentence: `.nation` carries its own article ("the Aztec
//  Empire"), which stays lower case anywhere else in a sentence (#359).
//
// `cityName` gives a city's name from its founder's list, `civilization` (#2), or the name as it is when the list
//  doesn't have it, as for a city its player has renamed. The name is part of the key, and since i18next 25.3.3 a
//  nested `$t(…)` doesn't match a key with an apostrophe in it, as "Xi'an" has, so the lookup is done here. It reads
//  the resources rather than calling `t()`, which would reset the interpolation this runs inside. The name it falls
//  back to is escaped as the call asks, as the nested lookup's `defaultValue` was.
export const addFormatters = (i18nInstance: i18n): void => {
  i18nInstance.services.formatter?.add(
    'capitalise',
    (value: string, lng: string | undefined): string => {
      const [first = '', ...rest] = value;

      return first.toLocaleUpperCase(lng) + rest.join('');
    }
  );

  i18nInstance.services.formatter?.add(
    'cityName',
    (
      value: string,
      lng: string | undefined,
      options: {
        civilization?: string;
        interpolation?: { escapeValue?: boolean };
      }
    ): string => {
      const key = `${options.civilization}.${value}.name`,
        languages: readonly string[] = lng
          ? i18nInstance.services.languageUtils.toResolveHierarchy(lng)
          : i18nInstance.languages;

      for (const language of languages) {
        const name = i18nInstance.getResource(language, 'city', key);

        if (typeof name === 'string') {
          return name;
        }
      }

      const escapeValue =
        options.interpolation?.escapeValue ??
        i18nInstance.options.interpolation?.escapeValue ??
        true;

      return escapeValue ? escapeHtml(value) : value;
    }
  );
};

export default addFormatters;
