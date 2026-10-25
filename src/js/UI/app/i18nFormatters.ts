import { i18n } from 'i18next';

// Formatters the translations use, added once i18next is initialised (they live on its services). `capitalise`
//  upper-cases the first letter, for a value that opens a sentence: `.nation` carries its own article ("the Aztec
//  Empire"), which stays lower case anywhere else in a sentence (#359).
export const addFormatters = (i18nInstance: i18n): void => {
  i18nInstance.services.formatter?.add(
    'capitalise',
    (value: string, lng: string | undefined): string => {
      const [first = '', ...rest] = value;

      return first.toLocaleUpperCase(lng) + rest.join('');
    }
  );
};

export default addFormatters;
