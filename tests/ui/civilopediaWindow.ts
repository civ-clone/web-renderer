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

  // In a game, an entry says only what applies to the player now (#1310), asked each time it's shown, with a button for
  //  every case; with no answer (no one playing, or a transport that doesn't know the request) it says every case.
  const asked: string[] = [],
    inForceTransport = {
      request: async (request: { channel(): string; args(): unknown[] }) => {
        const channel = request.channel();

        if (channel === 'getCivilopedia') {
          return [...entries, effects];
        }

        if (channel === 'getRequirements') {
          return requirements;
        }

        if (channel === 'getCivilopediaInForce') {
          asked.push(request.args()[0] as string);

          return request.args()[0] === 'Temple'
            ? [{ type: 'upkeep', yield: gold, value: 1 }]
            : null;
        }

        throw new Error(`unexpected request ${channel}`);
      },
    } as any,
    said = (shown: Civilopedia): string =>
      text(
        shown
          .element()
          .querySelector('.entry')!
          .innerHTML.replace(
            /<button class="btn-quiet every-case">.*?<\/button>/,
            ''
          )
      )
        .split('What it does')[1]
        ?.split('Requirements')[0] ?? '',
    inGame = new Civilopedia(inForceTransport, 'Temple');

  await wait();
  await wait();

  expect(
    'in a game, an entry says what applies now, with a button for every case',
    [
      said(inGame),
      inGame.element().querySelector('.entry button.every-case')?.textContent,
    ],
    ['Upkeep: 1 gold a turn', 'Show every case']
  );

  (
    inGame.element().querySelector('.entry button.every-case') as HTMLElement
  ).click();

  expect(
    'and every case when asked, with a button back',
    [
      said(inGame).startsWith('Makes 1 unhappy citizen content'),
      inGame.element().querySelector('.entry button.every-case')?.textContent,
    ],
    [true, 'Show what applies to you']
  );

  inGame.show('Musketman');

  await wait();

  expect(
    'an entry with no answer has no button',
    inGame.element().querySelector('.entry button.every-case'),
    null
  );

  inGame.close();
  new Civilopedia(inForceTransport, 'Temple').close();

  await wait();

  expect('and what applies is asked each time an entry is shown', asked, [
    'Temple',
    'Musketman',
    'Temple',
  ]);

  // A Wonder’s effects say where they act (#1196): in all its owner’s cities, on its continent, or (no scope) its
  //  own city, said for the types that act on a city (#1318).
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
      'Makes every unhappy citizen content, in its city' +
      '+1 move for your ships' +
      'Makes 2 more unhappy citizens content, in all your cities with a Temple, with Mysticism'
  );

  // A tile improvement says what it does on the squares it's on (#1272), its yields first: each square with an entry
  //  links to it, and a class with none is said as squares ("any land square", where the class says "land units").
  const desert = { class: 'Desert', name: 'Desert', entry: true },
    grassland = { class: 'Grassland', name: 'Grassland', entry: true },
    road = entry('Road', 'tileImprovement', {
      effects: [
        { type: 'route_squares', value: 3 },
        {
          type: 'improvement_turns',
          value: 2,
          unit: { class: 'Settlers', name: 'Settlers' },
          squares: [desert, grassland],
        },
        {
          type: 'improvement_yield',
          yield: { class: 'Trade', name: 'Trade', entry: false },
          value: 1,
          squares: [desert, grassland],
        },
        {
          type: 'improvement_yield_percent',
          yield: { class: 'Food', name: 'Food', entry: false },
          value: 0.5,
          squares: [{ class: 'Land', name: 'Land', entry: false }],
        },
      ],
    }),
    roadHtml = entryHtml(road, data);

  expect(
    'a tile improvement says what it does on its squares, its yields first',
    text(roadHtml).split('What it does')[1]?.split('Requirements')[0],
    '+1 Trade on Desert and Grassland' +
      '+50% Food on any land square, rounded down' +
      'Land units move 3 squares along it for each move' +
      '2 turns of Settlers work on Desert and Grassland'
  );
  expect(
    'and its squares link to their entries',
    roadHtml.includes('data-key="Desert"'),
    true
  );

  // Pollution says what it takes from its square, what causes it and what cleans it up (#621), and a line that needs an
  //  advance says so, each in its own wording.
  const settlers = { class: 'Settlers', name: 'Settlers' },
    pollution = entry('Pollution', 'tileImprovement', {
      effects: [
        { type: 'caused_by', source: 'production' },
        {
          type: 'caused_by',
          source: 'population',
          with: [
            { class: 'Industrialization', name: 'Industrialization' },
            { class: 'Automobile', name: 'Automobile' },
          ],
        },
        { type: 'removal_turns', value: 4, unit: settlers },
        {
          type: 'tile_yield_halved',
          yield: { class: 'Food', name: 'Food', entry: false },
        },
        {
          type: 'improvement_turns',
          value: 2,
          unit: settlers,
          squares: [{ class: 'River', name: 'River', entry: true }],
          with: [{ class: 'BridgeBuilding', name: 'BridgeBuilding' }],
        },
        {
          type: 'converts_to',
          terrain: grassland,
          squares: [{ class: 'Swamp', name: 'Swamp', entry: true }],
        },
        { type: 'route_free' },
      ],
    });

  expect(
    'Pollution says what it does, what causes it and what cleans it up',
    text(entryHtml(pollution, data))
      .split('What it does')[1]
      ?.split('Requirements')[0],
    'Halves the Food of its square, rounded up' +
      'Cities cause it from their shields' +
      'Cities cause it from their citizens, for each of Industrialization and Automobile you know' +
      'Settlers clean it up in 4 turns' +
      '2 turns of Settlers work on River, with BridgeBuilding' +
      'On Swamp, turns the square into Grassland instead' +
      'Land units move along it for free'
  );

  // Civilization II's (#1272): a Fortress's defence first, with what it doesn't hold against, an Airbase's turns
  //  said once, and Farmland's food in a city with a Supermarket.
  const air = { class: 'Air', name: 'Air', entry: false },
    fortress = entry('Fortress', 'tileImprovement', {
      effects: [
        { type: 'heals_resting', value: 2 },
        { type: 'build_turns', value: 4, unit: settlers },
        { type: 'refuels', unit: air },
        {
          type: 'square_yield_percent',
          yield: { class: 'Food', name: 'Food', entry: false },
          value: 0.5,
          inCitiesWith: { class: 'Supermarket', name: 'Supermarket' },
        },
        {
          type: 'square_defence_multiplier',
          value: 2,
          unit: { class: 'Land', name: 'Land', entry: false },
          except: [
            air,
            {
              class: 'IgnoresFortifications',
              name: 'IgnoresFortifications',
              entry: false,
            },
          ],
        },
      ],
    });

  // The pages still empty after #1272 (#621), and the rest of a Fortress and an Airbase (#1343).
  const anarchy = entry('Anarchy', 'government', {
    effects: [
      { type: 'anarchy_follows', cause: 'chosen', min: 1, max: 4 },
      { type: 'anarchy_follows', cause: 'civil-disorder', min: 2, max: 8 },
      { type: 'needs_every_other_advance' },
      { type: 'spares_stack' },
      { type: 'no_wear', unit: { class: 'Helicopter', name: 'Helicopter' } },
      {
        type: 'not_away',
        radius: 3,
        unit: { class: 'Land', name: 'Land', entry: false },
      },
      { type: 'pollution_tolerance', value: 20 },
      { type: 'pollution_tolerance_removed', value: 20 },
      { type: 'no_bomber_cover' },
      { type: 'paradrop_from' },
      {
        type: 'pollution_step',
        value: 1,
        source: 'population',
        scope: 'player',
      },
      {
        type: 'improvement_yield_percent',
        yield: { class: 'Food', name: 'Food', entry: false },
        value: 0.5,
        squares: [{ class: 'Water', name: 'Water', entry: false }],
      },
      { type: 'route_free', onto: 'road' },
      {
        type: 'improvement_turns',
        value: 1,
        unit: settlers,
        squares: [{ class: 'Desert', name: 'Desert', entry: true }],
      },
    ],
  });

  expect(
    'Anarchy, Future Technology and the rest say what they do, each in its own words',
    text(entryHtml(anarchy, data))
      .split('What it does')[1]
      ?.split('Requirements')[0],
    '+50% Food on any water square, rounded down' +
      'Follows a revolution, for 1 to 4 turns' +
      'Follows civil disorder that brings down a Democracy, for 2 to 8 turns' +
      'Can be discovered once every other advance is known, and again and again after that' +
      'When a unit defending here loses, the other units here survive' +
      'A Helicopter here doesn’t wear down' +
      'Your land units on it within 3 squares of one of your cities don’t count as away, so cause no unhappiness' +
      'A city risks it only when its shields and people together cause more than 20 pollution: the city screen shows only what’s beyond that' +
      'In its city there’s no allowance of 20: any pollution from the city’s people risks Pollution' +
      'A stack with a bomber here loses the cover that keeps all but fighters from attacking it' +
      'Paratroopers can drop from here' +
      'In all your cities, people who cause pollution cause it 1 step lower' +
      'Land units move along it for free, and from it onto a road' +
      '1 turn of Settlers work on Desert'
  );

  expect(
    "Civilization II's tile improvements say what they do",
    text(entryHtml(fortress, data))
      .split('What it does')[1]
      ?.split('Requirements')[0],
    '+50% Food on its square, rounded down, in cities with a Supermarket' +
      'Defense ×2 for land units here, outside a city, in place of being fortified, except against aircraft and units that ignore City Walls' +
      'Damaged units resting here recover 2 tenths of their hit points a turn, rather than 1' +
      '4 turns of Settlers work' +
      'Refuels aircraft here'
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
