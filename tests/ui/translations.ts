// Names containing an apostrophe must survive translation intact (#3).
//
// `{{item}}` is HTML-escaped by i18next, so "J. S. Bach's Cathedral" came out
// as "J. S. Bach&#39;s Cathedral" wherever the string is set as text. And a
// finished label passed through `t()` a second time loses everything before
// the `:` in "(Cost: …", because i18next reads it as a namespace separator —
// which is why `SelectionWindow` no longer translates labels it is given.

import i18next, { t } from 'i18next';

const names = [
  "J. S. Bach's Cathedral",
  "Michelangelo's Chapel",
  "Magellan's Expedition",
];

const failures: string[] = [];

const expect = (description: string, actual: string, expected: string) => {
  if (actual !== expected) {
    failures.push(
      `${description}\n    expected: ${expected}\n    actual:   ${actual}`
    );
  }
};

(async () => {
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('../../translations/local/en');

  names.forEach((item) => {
    expect('City.Build.title', t('City.Build.title', { item }), item);

    expect(
      'City.Build.build-item',
      t('City.Build.build-item', { item, cost: 400, turns: 80 }),
      `${item} (Cost: 400 / 80 turns)`
    );

    const body = t('City.CompleteProduction.body', {
      item,
      spendCost: { value: 10, resource: { _: 'Gold' } },
      treasury: { value: 20, yield: { _: 'Gold' } },
    });

    expect(
      'City.CompleteProduction.body',
      body.includes(`rush building of ${item} for`) ? item : body,
      item
    );
  });

  if (failures.length) {
    console.error(`FAIL translations\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(`PASS translations (${names.length} names, 3 keys)`);
})();
