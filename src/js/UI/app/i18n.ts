import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Load translations
export const initI18n = async (): Promise<void> => {
  i18next.use(LanguageDetector);

  await i18next.init({
    defaultNS: 'default',
    ns: ['default'],
  });
  await import('../../translations');
};

export default initI18n;
