// Citizens are drawn as faces, so each population also says who is in it in
// words, for a screen reader (#272). Where nothing in it is interactive (the
// Happiness and Top Cities reports) it's an image labelled with the summary.
// On the city screen the specialists are buttons, which an image role would
// hide, so the summary is text that's only hidden from view, and each
// specialist keeps its own label. The faces themselves are decorative.

// Must stay first: the citizens are built as DOM elements.
import './lib/dom';

import {
  renderCitizenCounts,
  renderPopulation,
} from '../../src/js/UI/components/lib/cityYields';
import i18next from 'i18next';
import { assetStore } from '../../src/js/UI/AssetStore';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// No IndexedDB under node: every face is the same blank image. The assets are an import from before the women
//  specialists were added (#334), so those are missing.
const drawn: string[] = [],
  missing = /people_(luxury|science|tax)_f\.png$/;

(assetStore as any).get = (path: string) =>
  Promise.resolve(missing.test(path) ? undefined : { name: path, uri: '' });
(assetStore as any).getScaled = (path: string) => {
  drawn.push(path);

  return Promise.resolve({ toDataURL: () => 'data:,' });
};

const settle = () => new Promise((resolve) => setTimeout(resolve));

(async () => {
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('../../translations/local/en');

  const report = renderCitizenCounts(
    {
      happy: 3,
      content: 2,
      unhappy: 1,
      specialists: ['Entertainer'],
    },
    'Rome'
  );

  expect(
    'a report: the population is an image labelled with its citizens',
    [report.getAttribute('role'), report.getAttribute('aria-label')],
    ['img', '3 happy, 2 content, 1 unhappy, 1 Entertainer']
  );

  const specialists = renderCitizenCounts(
    {
      happy: 0,
      content: 4,
      unhappy: 0,
      specialists: ['Scientist', 'TaxCollector', 'Scientist'],
    },
    'Babylon'
  );

  expect(
    'empty moods are left out, and specialists are counted in the order they are drawn',
    specialists.getAttribute('aria-label'),
    '4 content, 1 Tax collector, 2 Scientists'
  );

  const chosen: string[] = [],
    screen = renderPopulation(
      {
        name: 'Rome',
        specialists: [{ _: 'Entertainer' }, { _: 'Scientist' }],
      } as any,
      ['happy', 'content'],
      (specialist) => chosen.push(specialist._)
    ) as HTMLElement;

  expect(
    'the city screen: no image role, which would hide the specialist buttons',
    [screen.getAttribute('role'), screen.getAttribute('aria-label')],
    [null, null]
  );
  expect(
    'the city screen: the summary is text hidden from view',
    [...screen.querySelectorAll('.visually-hidden')].map(
      (element) => element.textContent
    ),
    ['1 happy, 1 content, 1 Entertainer, 1 Scientist']
  );
  expect(
    'the city screen: each specialist is still a labelled button',
    [...screen.querySelectorAll('.specialist')].map((element) => [
      element.getAttribute('role'),
      element.getAttribute('aria-label'),
    ]),
    [
      ['button', 'Change Entertainer'],
      ['button', 'Change Scientist'],
    ]
  );

  await settle();

  const faces = [report, specialists, screen].flatMap((population) => [
    ...population.querySelectorAll('img'),
  ]);

  expect(
    'every face is drawn',
    faces.length,
    3 + 2 + 1 + 1 + (4 + 3) + (2 + 2)
  );
  expect(
    "a woman specialist missing from older assets is drawn as the man's sprite",
    [
      drawn.filter((path) => missing.test(path)),
      drawn.filter((path) => /people_(luxury|science|tax)\.png$/.test(path))
        .length,
    ],
    [[], 1 + 3 + 2]
  );
  expect(
    'a sprite that has been imported is drawn',
    await assetStore.firstImported([
      './assets/city/people_tax_m.png',
      './assets/city/people_tax.png',
    ]),
    './assets/city/people_tax_m.png'
  );
  expect(
    'every face is decorative',
    faces.filter((face) => face.getAttribute('alt') !== '').length,
    0
  );

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL citizens (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS citizens (${checks} checks)\n`);
})().catch((error) => {
  process.stderr.write(`FAIL citizens: ${error?.stack ?? error}\n`);
  process.exit(1);
});
