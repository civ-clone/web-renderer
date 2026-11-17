// The spaceship window (#177) with Civ2's ship (M2e): its six kinds of part by our names, the rule set's supplies where
//  its parts carry no energy or life support yields (life support, energy and fuel, from `ui-rules-civ2`'s `supply`),
//  the flight in whole years, and Launch only while the Launch action is offered. Civ1's ship, with no `supply`, keeps
//  the two rows it works out from its yields.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';

import { Spaceship } from '@civ-clone/ui-protocol/types';
import Transport from '@civ-clone/ui-client/Transport';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import { openSpaceshipWindow } from '@civ-clone/ui-hud/components/Actions/Spaceship';

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

const part = (_: string) => ({ _, yields: [] }),
  ship = (overrides: Partial<Spaceship> = {}): Spaceship =>
    ({
      _: 'Spaceship',
      id: 'spaceship-1',
      activeParts: [
        ...Array.from({ length: 8 }, () => part('Structural')),
        part('Habitation'),
        part('LifeSupport'),
        part('Power'),
        part('Propulsion'),
        part('Fuel'),
      ],
      inactiveParts: [part('Propulsion')],
      chanceOfSuccess: 0.86,
      flightTime: 28,
      launched: false,
      player: { civilization: { _: 'Roman' } },
      successful: null,
      yields: [],
      ...overrides,
    } as unknown as Spaceship);

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');
  await import('../../translations/civ1-spaceship/en');

  const sent: unknown[] = [],
    transport = {
      send: (channel: string, data: unknown) => sent.push([channel, data]),
    } as unknown as Transport,
    lists = (element: HTMLElement): string[][] =>
      Array.from(element.querySelectorAll('dl')).map((list) =>
        Array.from(list.querySelectorAll('dd')).map(
          (label) =>
            `${label.textContent}: ${
              (label.nextElementSibling as HTMLElement).textContent
            }`
        )
      ),
    civ2 = openSpaceshipWindow(
      ship({ supply: { lifeSupport: 1, energy: 0.5, fuel: 1 } } as never),
      transport,
      false
    ),
    civ2Element = civ2.element(),
    launch = (element: HTMLElement) =>
      element.querySelector('footer button') as HTMLButtonElement;

  expect(
    'Civ2’s ship: its parts by kind, the inactive counted apart, and its supplies from the rule set, the flight in whole years',
    lists(civ2Element),
    [
      [
        'SS Structural: 8',
        'SS Fuel: 1',
        'SS Propulsion: 1 (1 inactive)',
        'SS Habitation: 1',
        'SS Life Support: 1',
        'SS Power: 1',
      ],
      [
        'Chance of success: 86%',
        'Flight time: 28 years',
        'Launched?: No',
        'Mass: 0 kg',
        'Population: 0',
        'Energy: 50%',
        'Life Support: 100%',
        'Fuel: 100%',
      ],
    ]
  );

  launch(civ2Element).click();

  expect(
    'Launch is held while the action isn’t offered, and sends nothing',
    [launch(civ2Element).disabled, sent],
    [true, []]
  );

  civ2.close();

  const civ1 = openSpaceshipWindow(
      ship({
        flightTime: 15.9,
        yields: [
          { _: 'Energy', value: 2 },
          { _: 'Energy', value: -4 },
          { _: 'LifeSupport', value: 1 },
          { _: 'LifeSupport', value: -1 },
        ],
      } as never),
      transport,
      true
    ),
    civ1Element = civ1.element();

  expect(
    'Civ1’s ship keeps its rows from its yields, its flight of 15.9 years shown in whole years as it always was',
    lists(civ1Element)[1]!.slice(1),
    [
      'Flight time: 16 years',
      'Launched?: No',
      'Mass: 0 kg',
      'Population: 0',
      'Energy: 50%',
      'Life Support: 100%',
    ]
  );

  launch(civ1Element).click();

  expect('and with the action offered, Launch sends it', sent, [
    ['action', { name: 'LaunchSpaceship', id: 'spaceship-1' }],
  ]);

  document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
};

run().then(
  () => {
    if (failures.length > 0) {
      process.stderr.write(
        `FAIL spaceshipWindow (${
          failures.length
        } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write(`PASS spaceshipWindow (${checks} checks)\n`);
    process.exit(0);
  },
  (error) => {
    process.stderr.write(`FAIL spaceshipWindow: ${error?.stack ?? error}\n`);
    process.exit(1);
  }
);
