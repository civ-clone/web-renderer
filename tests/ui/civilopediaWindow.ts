// The Civilopedia window (#183) draws what the engine sends: an index by section, and an entry's page with its
//  requirements in words, each class a link. Following "Needs Gunpowder" from Musketmen shows Gunpowder, Back returns,
//  and an entry on a base class (`Naval`) or a condition reads as words. The build list's Can't build window words each
//  refusing rule from its requirement entry, says "not available" for a rule without one, and links each item. An
//  entry whose relation and range would misstate its rule has wording of its own, keyed by its id: the Hoover Dam's,
//  which rule a plant out only in its owner's cities on its continent (#965), in `en` and `en-GB`.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';

import Civilopedia, {
  CivilopediaData,
  entryHtml,
  indexHtml,
} from '@civ-clone/ui-reports/components/Civilopedia';
import CityBuildUnavailableWindow, {
  reasons,
} from '@civ-clone/ui-reports/components/CityBuildUnavailableWindow';
import { CivilopediaEntry } from '@civ-clone/ui-protocol/civilopedia';
import { Condition } from '@civ-clone/core-requirement/Requirement';
import * as Civ1CityImprovementRequirements from '@civ-clone/civ1-city-improvement/Requirements';
import * as Civ1EnhancedRequirements from '@civ-clone/civ1-enhanced/Requirements';
import * as Civ1SpaceshipRequirements from '@civ-clone/civ1-spaceship/Requirements';
import * as Civ1UnitRequirements from '@civ-clone/civ1-unit/Requirements';
import * as Civ2CityImprovementRequirements from '@civ-clone/civ2-city-improvement/Requirements';
import * as Civ2WorldRequirements from '@civ-clone/civ2-world/Requirements';
import { conditionText } from '@civ-clone/ui-reports/components/lib/requirements';
import { HOOVER_DAM_PLANT_RULE_PREFIX } from '@civ-clone/civ1-wonder/RuleIds';
import { RequirementData } from '@civ-clone/ui-protocol/requirements';
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
    process.stderr.write(
      `FAIL civilopedia-window: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

const entry = (
    key: string,
    kind: CivilopediaEntry['kind'],
    values: Partial<CivilopediaEntry> = {}
  ): CivilopediaEntry => ({
    key,
    name: key,
    kind,
    requires: [],
    leadsTo: [],
    cost: null,
    stats: null,
    effects: [],
    ...values,
  }),
  requirement = (
    id: string,
    subject: string,
    relation: RequirementData['relation'],
    targets: RequirementData['targets'],
    values: Partial<RequirementData> = {}
  ): RequirementData => ({
    id,
    subject,
    relation,
    targets,
    mode: 'all',
    range: 'player',
    where: null,
    ...values,
  });

const requirements = [
    requirement('musketman/requires', 'Musketman', 'requires', [
      { class: 'Gunpowder' },
    ]),
    requirement('musketman/obsolete', 'Musketman', 'obsoletedBy', [
      { class: 'Conscription' },
    ]),
    requirement('musketman/replaced', 'Musketman', 'replacedBy', [
      { class: 'Rifleman' },
    ]),
    requirement('naval/coast', 'Naval', 'requires', [
      { condition: 'civ1-unit:coastal-city' },
    ]),
    requirement(
      'pyramids/obsolete',
      'Pyramids',
      'obsoletedBy',
      [{ class: 'Electricity' }],
      { range: 'world' }
    ),
    requirement('irrigation/available', 'Irrigation', 'requires', [], {
      range: 'tile',
      where: ['Desert', 'Grassland'],
    }),
    // As civ1-city-improvement and civ1-wonder send them (#965): one plant in a city rules the others out, and the
    //  Hoover Dam rules each out in its owner's cities on its continent, which its range, `player`, can't say.
    requirement(
      'civ1-city-improvement:city/build/excluded-by/PowerPlant',
      'PowerPlant',
      'excludedBy',
      [{ class: 'HydroPlant' }, { class: 'NuclearPlant' }],
      { mode: 'any', range: 'city' }
    ),
    ...['PowerPlant', 'HydroPlant', 'NuclearPlant'].map((plant) =>
      requirement(
        `${HOOVER_DAM_PLANT_RULE_PREFIX}/${plant}`,
        plant,
        'excludedBy',
        [{ class: 'HooverDam' }]
      )
    ),
    // A plugin's own `excludedBy` entry of range `player`, with no wording of its own, reads as the relation does.
    requirement('plugin:excluded', 'Factory', 'excludedBy', [
      { class: 'HooverDam' },
    ]),
  ],
  entries = [
    entry('Musketman', 'unit', {
      requires: [
        'musketman/requires',
        'musketman/obsolete',
        'musketman/replaced',
      ],
      cost: 30,
      stats: { attack: 2, defence: 3, movement: 1, visibility: 1 },
    }),
    entry('Trireme', 'unit', { requires: ['naval/coast'] }),
    entry('Gunpowder', 'advance', { leadsTo: ['musketman/requires'] }),
    entry('Conscription', 'advance', { leadsTo: ['musketman/obsolete'] }),
    entry('Electricity', 'advance', { leadsTo: ['pyramids/obsolete'] }),
    entry('Rifleman', 'unit', { leadsTo: ['musketman/replaced'] }),
    entry('Pyramids', 'wonder', { requires: ['pyramids/obsolete'] }),
    entry('Irrigation', 'tileImprovement', {
      requires: ['irrigation/available'],
    }),
    entry('Desert', 'terrain'),
    entry('Grassland', 'terrain'),
    entry('PowerPlant', 'improvement', {
      requires: [
        'civ1-city-improvement:city/build/excluded-by/PowerPlant',
        `${HOOVER_DAM_PLANT_RULE_PREFIX}/PowerPlant`,
      ],
    }),
    entry('HydroPlant', 'improvement', {
      requires: [`${HOOVER_DAM_PLANT_RULE_PREFIX}/HydroPlant`],
    }),
    entry('NuclearPlant', 'improvement', {
      requires: [`${HOOVER_DAM_PLANT_RULE_PREFIX}/NuclearPlant`],
    }),
    entry('Factory', 'improvement', { requires: ['plugin:excluded'] }),
    entry('HooverDam', 'wonder', {
      leadsTo: [
        `${HOOVER_DAM_PLANT_RULE_PREFIX}/PowerPlant`,
        `${HOOVER_DAM_PLANT_RULE_PREFIX}/HydroPlant`,
        `${HOOVER_DAM_PLANT_RULE_PREFIX}/NuclearPlant`,
      ],
    }),
  ],
  data: CivilopediaData = {
    entries: new Map(entries.map((entry) => [entry.key, entry])),
    requirements: new Map(
      requirements.map((requirement) => [requirement.id, requirement])
    ),
  };

// The page's text, without the markup.
const text = (html: string): string => {
    const element = document.createElement('div');

    element.innerHTML = html;

    return element.textContent ?? '';
  },
  links = (html: string): string[] =>
    Array.from(html.matchAll(/data-key="([^"]+)"/g), ([, key]) => key);

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');
  await import('../../translations/civ1-city-improvement/en');
  await import('../../translations/civ1-city-improvement/en-GB');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-science/en');
  await import('../../translations/civ1-wonder/en');
  await import('../../translations/civ1-world/en');
  await import('../../translations/civ1-enhanced/en');

  // Ages (#1076): an advance names its age, an age lists its advances, and the index has the ages in the order a
  //  civilization moves through them, the Industrial Age before the Electric, not by name.
  const ages: CivilopediaData = {
    entries: new Map(
      [
        entry('Railroad', 'advance', { age: 'Industrial' }),
        entry('Electricity', 'advance', { age: 'Electric' }),
        entry('Electric', 'age', { advances: ['Electricity'], order: 5 }),
        entry('Industrial', 'age', { advances: ['Railroad'], order: 4 }),
      ].map((item) => [item.key, item])
    ),
    requirements: new Map(),
  };

  expect(
    "an advance's page names its age, and an age's page its advances, each a link",
    [
      text(entryHtml(ages.entries.get('Railroad')!, ages)),
      links(entryHtml(ages.entries.get('Railroad')!, ages)),
      text(entryHtml(ages.entries.get('Industrial')!, ages)),
      links(entryHtml(ages.entries.get('Industrial')!, ages)),
    ],
    [
      'RailroadCivilization AdvanceAgeIndustrial Age',
      ['Industrial'],
      'Industrial AgeAgeAdvances of this ageRailroad',
      ['Railroad'],
    ]
  );
  expect(
    'the index lists the ages in order, after the advances',
    text(indexHtml(ages)),
    'Civilization AdvancesElectricityRailroadAgesIndustrial AgeElectric Age'
  );

  const musketman = entryHtml(data.entries.get('Musketman')!, data);

  expect(
    "Musketmen's page: numbers, cost, what they need and what replaces them",
    text(musketman),
    'MusketmanUnitAttack: 2 · Defense: 3 · Moves: 1 · Cost: 30RequirementsNeeds GunpowderObsolete with ConscriptionReplaced by Rifleman'
  );
  expect('each class a link to its entry', links(musketman), [
    'Gunpowder',
    'Conscription',
    'Rifleman',
  ]);
  expect(
    'what Gunpowder leads to',
    text(entryHtml(data.entries.get('Gunpowder')!, data)),
    'GunpowderCivilization AdvanceLeads toAllows Musketman'
  );
  expect(
    'a ship needs a coastal city, through an entry on Naval',
    text(entryHtml(data.entries.get('Trireme')!, data)),
    'TriremeUnitRequirementsNeeds a coastal city'
  );
  expect(
    'a world-wide entry says so',
    text(entryHtml(data.entries.get('Pyramids')!, data)).includes(
      'Obsolete with Electricity, once any civilization has it'
    ),
    true
  );
  expect(
    'a tile improvement says where it goes, and a terrain what goes on it',
    [
      text(entryHtml(data.entries.get('Irrigation')!, data)).includes(
        'Can be built on Desert and Grassland'
      ),
      text(entryHtml(data.entries.get('Desert')!, data)).includes(
        'Can be built hereIrrigation'
      ),
    ],
    [true, true]
  );

  // The Hoover Dam's plants, and what it rules out, in each language (#965).
  const hoover = () => ({
    plants: ['PowerPlant', 'HydroPlant', 'NuclearPlant'].map((plant) =>
      text(entryHtml(data.entries.get(plant)!, data))
    ),
    dam: text(entryHtml(data.entries.get('HooverDam')!, data)),
    reasons: reasons(
      {
        key: 'PowerPlant',
        name: 'PowerPlant',
        refusedBy: [`${HOOVER_DAM_PLANT_RULE_PREFIX}/PowerPlant`],
      },
      data
    ).map(text),
    plugin: text(entryHtml(data.entries.get('Factory')!, data)),
  });

  for (const language of ['en', 'en-GB']) {
    await i18next.changeLanguage(language);

    expect(
      `the Hoover Dam's plants and what it rules out, in ${language}`,
      hoover(),
      {
        plants: [
          'Power PlantCity ImprovementRequirementsCan’t be built alongside any of Hydro Plant, Nuclear PlantCan’t be built by the owner of Hoover Dam in a city on its continent',
          'Hydro PlantCity ImprovementRequirementsCan’t be built by the owner of Hoover Dam in a city on its continent',
          'Nuclear PlantCity ImprovementRequirementsCan’t be built by the owner of Hoover Dam in a city on its continent',
        ],
        dam: 'Hoover DamWonder of the WorldLeads toRules out Power Plant in its owner’s cities on its continentRules out Hydro Plant in its owner’s cities on its continentRules out Nuclear Plant in its owner’s cities on its continent',
        reasons: [
          'Can’t be built by the owner of Hoover Dam in a city on its continent',
        ],
        plugin:
          'FactoryCity ImprovementRequirementsCan’t be built alongside Hoover Dam',
      }
    );
  }

  await i18next.changeLanguage('en');

  // The window itself, with a transport that answers from the data above.
  const transport = {
      request: async (request: { channel(): string }) => {
        const channel = request.channel();

        if (channel === 'getCivilopedia') {
          return entries;
        }

        if (channel === 'getRequirements') {
          return requirements;
        }

        if (channel === 'cityBuildUnavailable') {
          return [
            {
              key: 'Musketman',
              name: 'Musketman',
              refusedBy: ['musketman/requires', 'civ1-unit:some-other-rule'],
            },
          ];
        }

        throw new Error(`unexpected request ${channel}`);
      },
    } as any,
    window = new Civilopedia(transport);

  await wait();

  const body = window.element(),
    click = (selector: string): void =>
      (body.querySelector(selector) as HTMLElement).click();

  expect(
    'the index lists each section that has entries',
    Array.from(
      body.querySelectorAll('.index-section h4'),
      (heading) => heading.textContent
    ),
    [
      'Civilization Advances',
      'City Improvements',
      'Wonders of the World',
      'Units',
      'Tile Improvements',
      'Terrain Types',
    ]
  );

  click('.index a[data-key="Musketman"]');

  expect('a link in the index shows its entry', window.shown(), 'Musketman');

  click('.entry a[data-key="Gunpowder"]');

  expect('a link on a page shows that entry', window.shown(), 'Gunpowder');

  click('.entry button.back');

  expect('Back returns to the entry before', window.shown(), 'Musketman');

  click('.entry button.back');

  expect('and then to the index', window.shown(), null);

  window.close();

  expect(
    'opening at an entry shows it',
    await (async () => {
      const opened = new Civilopedia(transport, 'Pyramids');

      await wait();

      const shown = opened.shown();

      opened.close();

      return shown;
    })(),
    'Pyramids'
  );

  expect(
    'the Can’t build window words a rule with an entry, and folds one without',
    reasons(
      {
        key: 'Musketman',
        name: 'Musketman',
        refusedBy: ['musketman/requires', 'one', 'two'],
      },
      data
    ).map(text),
    ['Needs Gunpowder']
  );
  expect(
    'and says only "not available" when no rule that refuses it has an entry',
    reasons(
      { key: 'Musketman', name: 'Musketman', refusedBy: ['one'] },
      data
    ).map(text),
    ['Not available in this city']
  );

  const unavailable = new CityBuildUnavailableWindow(
    {
      id: 'city-build-1',
      city: {
        name: 'Rome',
        originalPlayer: { civilization: { _: 'Roman' } },
      },
    } as any,
    transport
  );

  await wait();

  expect(
    'and lists each item with its reasons, linked to the Civilopedia',
    [
      unavailable.element().querySelector('.item a')?.getAttribute('data-key'),
      Array.from(
        unavailable.element().querySelectorAll('.reasons li'),
        (reason) => reason.textContent
      ),
    ],
    ['Musketman', ['Needs Gunpowder']]
  );

  (unavailable.element().querySelector('.item a') as HTMLElement).click();

  await wait();

  const opened = Array.from(
    document.querySelectorAll('dialog.window.civilopedia')
  );

  expect(
    'following an item opens the Civilopedia at its entry',
    opened.length > 0 &&
      opened[opened.length - 1]
        .querySelector('.entry')
        ?.getAttribute('data-key'),
    'Musketman'
  );

  // Every condition the rule sets name is worded, Civ2's by the name it shares with Civ1 or its own (#1051), and
  //  Civ1's wording is as it was.
  const conditions = [
    Civ1CityImprovementRequirements,
    Civ1EnhancedRequirements,
    Civ1SpaceshipRequirements,
    Civ1UnitRequirements,
    Civ2CityImprovementRequirements,
    Civ2WorldRequirements,
  ]
    .flatMap((module) => Object.values(module))
    .filter((value): value is Condition => value instanceof Condition)
    .map((condition) => condition.id);

  expect(
    'the conditions are found',
    [
      'civ1-unit:coastal-city',
      'civ2-city-improvement:not-in-city',
      'civ2-world:no-fortress',
    ].every((id) => conditions.includes(id)),
    true
  );
  expect(
    'every condition is worded',
    conditions.filter((id) => conditionText(id) === id),
    []
  );
  expect(
    'Civ2 shares Civ1’s wording',
    [
      conditionText('civ1-city-improvement:not-in-city'),
      conditionText('civ2-city-improvement:not-in-city'),
    ],
    [
      'a city that hasn’t built one already',
      'a city that hasn’t built one already',
    ]
  );
  expect(
    'Civ2’s own',
    conditionText('civ2-world:no-river'),
    'a square without a River'
  );
  expect(
    'and an unknown one is its id',
    conditionText('civ3-unit:somewhere'),
    'civ3-unit:somewhere'
  );

  // What an entry does (#1196), said by each effect's type, a plugin's unknown type, and a context with no wording, left
  //  out.
  const gold = { class: 'CityImprovementMaintenanceGold', name: 'Gold' },
    effects = entry('Temple', 'improvement', {
      effects: [
        { type: 'upkeep', yield: gold, value: 1 },
        { type: 'content', value: 1 },
        {
          type: 'content',
          value: 1,
          with: [{ class: 'Mysticism', name: 'Mysticism' }],
          step: 'more',
        },
        { type: 'plugin_unknown', value: 3 },
        // No wording for a negative "more", so it's left out, never said as a positive one.
        { type: 'content', value: -1, step: 'more' },
        { type: 'upkeep', yield: gold, value: 0 },
        {
          type: 'yield_percent',
          yield: { class: 'Corruption', name: 'Corruption' },
          value: -0.5,
          of: 'total',
        },
      ],
    });

  expect(
    'an entry says what it does, its upkeep last',
    text(entryHtml(effects, data))
      .split('What it does')[1]
      ?.split('Requirements')[0],
    'Makes 1 unhappy citizen content' +
      'Makes 1 more unhappy citizen content, with Mysticism' +
      '−50% Corruption' +
      'Upkeep: 1 gold a turn' +
      'No upkeep'
  );

  // A Wonder's effects say where they act (#1196): in all its owner's cities, on its continent, or (with no scope) its
  //  own city.
  const research = { class: 'Research', name: 'Research' },
    wonder = entry('IsaacNewtonsCollege', 'wonder', {
      effects: [
        {
          type: 'yield_percent',
          yield: research,
          value: 1 / 3,
          of: 'base',
          per: [
            { class: 'Library', name: 'Library' },
            { class: 'University', name: 'University' },
          ],
          scope: 'player',
        },
        { type: 'content', value: 2, scope: 'continent' },
        { type: 'content', amount: 'all' },
        {
          type: 'unit_movement',
          unit: { class: 'Naval', name: 'Naval' },
          value: 1,
          scope: 'player',
        },
        {
          type: 'content',
          value: 2,
          step: 'more',
          inCitiesWith: [{ class: 'Temple', name: 'Temple' }],
          with: [{ class: 'Mysticism', name: 'Mysticism' }],
          scope: 'player',
        },
      ],
    });

  expect(
    'a Wonder says where its effects act',
    text(entryHtml(wonder, data))
      .split('What it does')[1]
      ?.split('Requirements')[0],
    '+33% of the city’s base Science, for each Library and University, in all your cities' +
      'Makes 2 unhappy citizens content, in your cities on the same continent' +
      'Makes every unhappy citizen content' +
      '+1 move for your ships' +
      'Makes 2 more unhappy citizens content, in all your cities with a Temple, with Mysticism'
  );

  // Civilization II's (#1196): a wording that says its own scope, and a clause worded for its type.
  const civ2 = entry('SunTzusWarAcademy', 'wonder', {
    effects: [
      {
        type: 'veteran_units',
        unit: { class: 'Land', name: 'Land', entry: false },
        scope: 'player',
      },
      {
        type: 'content_multiplier',
        value: 2,
        inCitiesWith: [{ class: 'Temple', name: 'Temple' }],
        scope: 'player',
      },
      {
        type: 'defence_multiplier',
        value: 2,
        against: { class: 'Naval', name: 'Naval', entry: false },
        notFor: { class: 'Naval', name: 'Naval', entry: false },
      },
    ],
  });

  expect(
    'Civilization II’s effects say their scope once, and clauses worded for their type',
    text(entryHtml(civ2, data))
      .split('What it does')[1]
      ?.split('Requirements')[0],
    'New military land units built in any of your cities are veterans' +
      'Content citizens ×2, from each Temple, in all your cities' +
      'Defense of the units in the city ×2, against ships, except when ships defend'
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL civilopedia-window (${
        failures.length
      } of ${checks})\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civilopedia-window (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL civilopedia-window: ${error?.stack ?? error}\n`);
  process.exit(1);
});
