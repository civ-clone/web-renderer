import { t } from 'i18next';

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

    // -0, or a small negative rounded to 0, reads 0 rather than -0 (#816). `signDisplay: 'negative'` would say so, but
    //  older browsers reject it.
    const parts = formatter.formatToParts(number),
      digits = parts.filter(
        ({ type }) => type === 'integer' || type === 'fraction'
      );

    // No digits for Infinity or NaN, which are left as they are.
    if (digits.length > 0 && digits.every(({ value }) => /^0+$/.test(value))) {
      return formatter.format(0);
    }

    return parts.map(({ value }) => value).join('');
  }

  percent(number: number, options?: Intl.NumberFormatOptions): string {
    return this.number(number, {
      style: 'percent',
      maximumFractionDigits: 0,
      ...options,
    });
  }

  setLocale(locale: string): void {
    this.#locale = locale;
  }

  timeSince(date: Date, options?: Intl.RelativeTimeFormatOptions): string {
    const timeFormatter = new Intl.RelativeTimeFormat(this.locales(), options),
      secondsDifference = Math.trunc((date.getTime() - Date.now()) / 1000);

    if (Math.abs(secondsDifference) < 10) {
      return t('Generic.just-now');
    }

    const [value, unit] = (
      [
        [60, 'seconds'],
        [60, 'minutes'],
        [24, 'hours'],
        [28, 'days'],
        [12, 'months'],
        [Infinity, 'years'],
      ] as [number, Intl.RelativeTimeFormatUnit][]
    ).reduce(
      ([value, unit, resolved], [limit, currentUnit]) => {
        if (resolved) {
          return [value, unit, resolved];
        }

        if (Math.abs(value) <= limit) {
          return [value, currentUnit, true];
        }

        return [Math.trunc(value / limit), currentUnit, false];
      },
      [secondsDifference, 'seconds' as Intl.RelativeTimeFormatUnit, false]
    );

    return timeFormatter.format(value, unit);
  }
}

export const instance = new LocaleProvider();

export default LocaleProvider;
