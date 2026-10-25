import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import addFormatters from './i18nFormatters';
import i18nOptions from './i18nOptions';

// Load translations
export const initI18n = async (): Promise<void> => {
  i18next.use(LanguageDetector);

  await i18next.init(i18nOptions);
  addFormatters(i18next);
  await import('../../translations');
};

export default initI18n;
