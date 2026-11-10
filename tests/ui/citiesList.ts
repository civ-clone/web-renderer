// The sidebar's list of cities (#700): each city's build and the turns left, the soonest first, a city with nothing to
//  build before them all and flagged, a build that never finishes last, a city in disorder (from the player's
//  `CivilDisorder` actions, #274) or starving flagged, five rows and then "Show all", a row opening its city, and the
//  list following the cities through `DataChanges` (#344), not every render.
// A city sent again with nothing a row shows changed leaves the list's elements as they are (#851), and a row opens
//  the city as the page holds it now.

// Must stay first: the components read `document` as they load.
import './lib/dom';
import './lib/interfaces';

import { City, GameData, Player } from '@civ-clone/ui-protocol/types';
import CitiesList from '@civ-clone/ui-hud/components/CitiesList';
import { DataChanges } from '@civ-clone/ui-client/lib/DataChanges';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

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
    process.stderr.write(`FAIL cities-list: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

const yieldOf = (name: string, value: number) => ({
    _: name,
    __: [name, 'Yield'],
    value,
  }),
  // A city building `item` (or nothing) with `progress` of `cost` done, `production` spare a turn and `food` spare.
  city = (
    name: string,
    item: string | null,
    {
      cost = 40,
      progress = 0,
      production = 2,
      food = 1,
    }: { cost?: number; progress?: number; production?: number; food?: number }
  ): City =>
    ({
      id: `City-${name}`,
      name,
      originalPlayer: { civilization: { _: 'Roman' } },
      build: {
        id: `CityBuild-${name}`,
        building: item === null ? null : { item: { _: item } },
        cost: { value: cost },
        progress: { value: progress },
      },
      growth: { id: `CityGrowth-${name}` },
      yields: [yieldOf('Production', production), yieldOf('Food', food)],
    } as unknown as City),
  player = (cities: City[], disorder: City[] = []): Player =>
    ({
      id: 'Player-1',
      actions: disorder.map((city) => ({
        _: 'CivilDisorder',
        id: `CivilDisorder-${city.id}`,
        value: city,
      })),
      cities,
    } as unknown as Player);

const opened: string[] = [],
  openedCities: City[] = [],
  portal = {
    openCity: (city: City) => {
      opened.push(city.name);
      openedCities.push(city);

      return true;
    },
  },
  rows = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('.city-row')).map((row) =>
      [
        row.querySelector('.name')?.textContent,
        row.querySelector('.build')?.textContent,
        ...Array.from(row.querySelectorAll('.flags .flag')).map(
          (flag) => flag.textContent
        ),
      ].join(' | ')
    );

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-city/en');
  await import('../../translations/civ1-city-improvement/en');

  {
    const roma = city('Roma', 'Warrior', { cost: 10, progress: 6 }),
      veii = city('Veii', null, {}),
      antium = city('Antium', 'Settlers', { cost: 30, progress: 0 }),
      cumae = city('Cumae', 'Warrior', { production: 0 }),
      neapolis = city('Neapolis', 'Warrior', { food: -2 }),
      changes = new DataChanges(),
      element = document.createElement('div'),
      data = player([roma, veii, antium, cumae, neapolis], [antium]);

    new CitiesList(element, data, portal, changes);

    expect(
      'nothing to build first and flagged, then the soonest done, and never last',
      rows(element),
      [
        'Veii | Nothing to build',
        'Roma | Warrior2 turns',
        'Antium | Settlers15 turns | Civil disorder',
        'Neapolis | Warrior20 turns | Starving',
        'Cumae | WarriorNever',
      ]
    );
    expect(
      'a city with nothing to build is marked',
      element.querySelector('.city-row.no-build .name')?.textContent,
      'Veii'
    );
    expect(
      'five rows: no "Show all"',
      element.querySelector('.show-all'),
      null
    );

    (element.querySelectorAll('.city-row')[1] as HTMLElement).click();

    expect('a row opens its city', opened, ['Roma']);

    // A city chooses a build: it changes, and the next render redraws the list.
    (veii.build as any).building = { item: { _: 'Warrior' } };

    const list = element.querySelector('.cities-list');

    changes.notify({ player: data } as GameData);

    expect(
      'nothing changed since the last render: the list is left as it is',
      element.querySelector('.cities-list') === list,
      true
    );

    // The keyboard on Antium's row when the list is rebuilt: it's put back on Antium's new row (linkedom has no focus,
    //  so it's tracked by hand).
    let focused: Element | null = null;

    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => focused,
    });

    const focus = HTMLElement.prototype.focus;

    HTMLElement.prototype.focus = function (this: HTMLElement) {
      focused = this;
    };

    document.body.append(element);
    focused = element.querySelector('[data-city="City-Antium"]');

    changes.collect([veii.build.id]);
    changes.notify({ player: data } as GameData);

    expect(
      'a build changed: the list follows it on the next render',
      rows(element)[0],
      'Roma | Warrior2 turns'
    );
    expect(
      'and the keyboard stays on the row it was on',
      [
        (focused as HTMLElement | null)?.dataset.city,
        element.contains(focused),
      ],
      ['City-Antium', true]
    );

    HTMLElement.prototype.focus = focus;
    element.remove();
  }

  {
    // What a unit moving beside a city does (#851): the city is sent again, and reads as it did.
    const roma = city('Roma', 'Warrior', { cost: 10, progress: 6 }),
      veii = city('Veii', 'Settlers', { cost: 30 }),
      changes = new DataChanges(),
      element = document.createElement('div'),
      data = player([roma, veii]);

    new CitiesList(element, data, portal, changes);

    const list = element.querySelector('.cities-list'),
      row = element.querySelector('[data-city="City-Roma"]');

    changes.collect([roma.id, roma.build.id, roma.growth.id, data.id]);
    changes.notify({ player: data } as GameData);

    expect(
      'a city sent again that reads the same: the list and its rows are left as they are',
      [
        element.querySelector('.cities-list') === list,
        element.querySelector('[data-city="City-Roma"]') === row,
      ],
      [true, true]
    );

    // Everything rebuilt: new objects that read the same. The row stays, and opens the city held now.
    const romaNow = city('Roma', 'Warrior', { cost: 10, progress: 6 }),
      dataNow = player([romaNow, city('Veii', 'Settlers', { cost: 30 })]);

    changes.collect(null);
    changes.notify({ player: dataNow } as GameData);

    (element.querySelector('[data-city="City-Roma"]') as HTMLElement).click();

    expect(
      'everything rebuilt to the same: the row is left, and opens the city as the page holds it now',
      [
        element.querySelector('[data-city="City-Roma"]') === row,
        openedCities[openedCities.length - 1] === romaNow,
      ],
      [true, true]
    );

    // What a row shows changes: drawn again.
    (romaNow.build.progress as any).value = 8;

    changes.collect([romaNow.build.id]);
    changes.notify({ player: dataNow } as GameData);

    expect(
      'a build moved on: the list is drawn again',
      [element.querySelector('.cities-list') === list, rows(element)[0]],
      [false, 'Roma | Warrior1 turn']
    );

    // A city falls into disorder, which only the player's actions say.
    const disordered = player(dataNow.cities, [dataNow.cities[1]]);

    changes.collect([disordered.id]);
    changes.notify({ player: disordered } as GameData);

    expect(
      'a city in disorder, from the player alone: drawn again, and flagged',
      rows(element)[1],
      'Veii | Settlers15 turns | Civil disorder'
    );
  }

  {
    const cities = [1, 2, 3, 4, 5, 6, 7].map((turns) =>
        city(`City${turns}`, 'Warrior', { cost: turns * 2, production: 2 })
      ),
      element = document.createElement('div');

    new CitiesList(element, player(cities), portal, new DataChanges());

    const more = element.querySelector('.show-all') as HTMLButtonElement;

    expect(
      'more than five: five rows, then "Show all"',
      [rows(element).length, more?.textContent],
      [5, 'Show all (7)']
    );

    more.click();

    expect(
      '"Show all" shows them all',
      [
        rows(element).length,
        element.querySelector('.show-all')?.textContent,
        element.querySelector('.show-all')?.getAttribute('aria-expanded'),
      ],
      [7, 'Show fewer', 'true']
    );

    (element.querySelector('.show-all') as HTMLButtonElement).click();

    expect('and "Show fewer" five again', rows(element).length, 5);
  }

  {
    const element = document.createElement('div');

    new CitiesList(element, player([]), portal, new DataChanges());

    expect(
      'no cities: says so',
      element.querySelector('.empty')?.textContent,
      'No cities yet.'
    );
  }

  {
    const element = document.createElement('div');

    new CitiesList(
      element,
      player([city("Rock & Roll's", null, {})]),
      portal,
      new DataChanges()
    );

    expect(
      'a name is shown as written, not escaped',
      element.querySelector('.name')?.textContent,
      "Rock & Roll's"
    );
  }

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL cities-list (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS cities-list (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL cities-list: ${error.stack ?? error}\n`);
  process.exit(1);
});
