import { InitOptions } from 'i18next';

// How `initI18n` sets up i18next, here so a test can use the same. English is all there is, so a browser in any other
//  language falls back to it rather than showing the keys (#471).
export const i18nOptions: InitOptions = {
  defaultNS: 'default',
  fallbackLng: 'en',
  ns: ['default'],
};

export default i18nOptions;
