// Text a player reads in the Trade report and on the Civil Disorder button (#472): the report names each improvement
//  ("2 × City Walls", not "2 × CityWalls"), and the button's tooltip names the city rather than showing its
//  placeholder ("Civil disorder in {{- city.name}}!").

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { City, Player, PlayerAction } from '../../src/js/UI/types';
import CivilDisorder from '../../src/js/UI/components/Actions/CivilDisorder';
import Portal from '../../src/js/UI/components/Portal';
import TradeReport from '../../src/js/UI/components/TradeReport';
import Transport from '../../src/js/UI/Transport';
import { assetStore } from '../../src/js/UI/AssetStore';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';

const failures: string[] = [];
let checks = 0,
  finished = false;

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

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL report-text: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// No IndexedDB under node: every picture is its path.
(assetStore as any).get = (path: string) =>
  Promise.resolve({ name: path, uri: path });
(assetStore as any).getScaled = () =>
  Promise.resolve({ toDataURL: () => 'gold.png' });

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-city/en');
  await import('../../translations/civ1-city-improvement/en');

  const maintenance = (improvement: string) => ({
      _: 'CityImprovementMaintenanceGold',
      __: ['CityImprovementMaintenanceGold', 'Gold', 'Yield'],
      cityImprovement: { _: improvement },
      value: -1,
    }),
    city = {
      id: 'City-1',
      name: 'Karakorum',
      build: { id: 'CityBuild-1' },
      growth: { id: 'CityGrowth-1' },
      originalPlayer: { civilization: { _: 'Mongol' } },
      player: { civilization: { _: 'Mongol' } },
      yields: [maintenance('CityWalls'), maintenance('CityWalls')],
    } as unknown as City,
    transport = {} as Transport,
    portal = {} as Portal;

  const report = new TradeReport(
    { id: 'Player-1', cities: [city] } as unknown as Player,
    portal,
    transport
  );

  await settle();

  expect(
    'the Trade report names each improvement',
    Array.from(
      report.element().querySelectorAll('.improvement-list td:first-child')
    ).map((cell) => cell.textContent),
    ['2 × City Walls']
  );

  report.close();

  const disorder = new CivilDisorder(
    { _: 'CivilDisorder', value: city } as unknown as PlayerAction,
    portal,
    transport
  );

  disorder.build();

  await settle();

  expect(
    'the Civil Disorder button names the city',
    disorder.element().querySelector('button')?.getAttribute('title'),
    'Civil disorder in Karakorum!'
  );

  finished = true;

  if (failures.length) {
    console.error(`FAIL report-text\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(`PASS report-text (${checks} checks)`);
};

run();
