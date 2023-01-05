export class LocaleProvider {
  #defaultLocale: string;
  #locale: string;
  #locales: string[];

  constructor(
    locale: string = navigator.language,
    locales: string[] = [...navigator.languages],
    defaultLocale = 'en'
  ) {
    this.#locale = locale || defaultLocale;
    this.#locales =
      locales.length > 0
        ? locales.includes(defaultLocale)
          ? locales
          : [...locales, defaultLocale]
        : locale
        ? [locale, defaultLocale]
        : [defaultLocale];
    this.#defaultLocale = defaultLocale;
  }

  locale(): string {
    return this.#locale;
  }

  locales(): string[] {
    return this.#locales;
  }

  list(list: Iterable<string>, options?: Intl.ListFormatOptions): string {
    const formatter = new Intl.ListFormat(this.locales(), {
      style: 'long',
      type: 'conjunction',
      ...options,
    });

    return formatter.format(list);
  }

  number(number: number, options?: Intl.NumberFormatOptions): string {
    const formatter = new Intl.NumberFormat(this.locales(), {
      maximumFractionDigits: 0,
      ...options,
    });

    return formatter.format(number);
  }

  percent(number: number, options?: Intl.NumberFormatOptions): string {
    return this.number(number, {
      style: 'percent',
      maximumFractionDigits: 0,
      ...options,
    });
  }
}

export const instance = new LocaleProvider();

export default LocaleProvider;
