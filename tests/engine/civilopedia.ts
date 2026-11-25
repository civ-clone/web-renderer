// The Civilopedia's entries (#183) come from the engine: with every plugin loaded, every class the requirements (#37)
//  name has an entry, keyed as saves key it, so Railroad the advance and the Railroad tile improvement are two. Each
//  entry says something. Musketmen need Gunpowder, go obsolete with Conscription, give way to Riflemen, and are 2/3/1
//  for 30 shields, all read from the ruleset's rules. A Trireme needs a coastal city through `Naval`, the registry's
//  own walk. And a city says which requirement entries refuse what it can't build, for its own player only. Its build
//  list comes in sections, units, improvements, spaceship parts then Wonders, with a unit's numbers on its line
//  (#381, #432).

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import { BridgeBuilding, Gunpowder } from '@civ-clone/civ1-science/Advances';
import { HOOVER_DAM_PLANT_RULE_PREFIX } from '@civ-clone/civ1-wonder/RuleIds';
import { Musketman } from '@civ-clone/civ1-unit/Units';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Build from '@civ-clone/core-city-build/Rules/Build';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import civilopediaData, {
  effectsOf,
  onSquaresTogether,
  unavailableBuildItems,
} from '@civ-clone/ui-worker-client/lib/civilopedia';
import { Desert, Grassland } from '@civ-clone/civ1-world/Terrains';
import { Food, Production } from '@civ-clone/civ1-world/Yields';
import { Road } from '@civ-clone/civ1-world/TileImprovements';
import { CivilopediaEntry } from '@civ-clone/ui-protocol/civilopedia';
import requirementsData from '@civ-clone/ui-worker-client/lib/requirements';
import {
  cityBuildAvailable,
  registerRequests,
} from '@civ-clone/ui-worker-client/Client/requests';
import { inBuildListOrder } from '@civ-clone/ui-worker-client/lib/buildList';
import Player from '@civ-clone/core-player/Player';
import missingWording, { missingConditions } from './lib/effectWording';
import setUpCity from '@civ-clone/civ1-city/tests/lib/setUpCity';

const failures: string[] = [];
let finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
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
    process.stderr.write('FAIL civilopedia: stopped before its checks\n');
    process.exitCode = 1;
  }
});

const check = async (): Promise<void> => {
  const entries = civilopediaData(),
    requirements = requirementsData(),
    byKey = new Map(entries.map((entry) => [entry.key, entry])),
    entry = (key: string): CivilopediaEntry | undefined => byKey.get(key),
    // Base classes some entries are about, which have no entry of their own.
    baseClasses = ['CityImprovement', 'Naval', 'Part'];

  expect('every entry has a key of its own', entries.length, byKey.size);
  expect(
    'every class the requirements name has an entry, bar the base classes they apply through',
    Array.from(
      new Set(
        requirements.flatMap((requirement) => [
          requirement.subject,
          ...requirement.targets.flatMap((target) =>
            'class' in target ? [target.class] : []
          ),
          ...(requirement.where ?? []),
        ])
      )
    ).filter((key) => !byKey.has(key) && !baseClasses.includes(key)),
    []
  );
  // Future Technology's need for every other advance is a hand-written rule, which says it, and Anarchy says what leads
  //  to it (#621). Ocean says what it gives and costs (#620), and Pollution what it does, what causes it and what
  //  cleans it up.
  expect(
    'and every entry says something: a requirement, something it leads to, numbers, a cost, what it does, or tile improvements that go on it',
    entries
      .filter(
        (entry) =>
          entry.requires.length === 0 &&
          entry.leadsTo.length === 0 &&
          entry.stats === null &&
          entry.cost === null &&
          entry.effects.length === 0 &&
          !requirements.some((requirement) =>
            requirement.where?.includes(entry.key)
          )
      )
      .map((entry) => entry.key),
    []
  );
  expect(
    'each section has entries',
    [
      'advance',
      'improvement',
      'wonder',
      'unit',
      'government',
      'spaceship',
      'tileImprovement',
      'terrain',
    ].filter((kind) => !entries.some((entry) => entry.kind === kind)),
    []
  );

  expect('Musketmen', entry('Musketman'), {
    key: 'Musketman',
    name: 'Musketman',
    kind: 'unit',
    requires: [
      'civ1-unit:city/build/requires-advance/Musketman',
      'civ1-unit:city/build/obsolete/Musketman',
      'civ1-unit:unit/replaced-by/Musketman',
    ],
    leadsTo: [
      'civ1-unit:unit/replaced-by/Spearman',
      'civ1-unit:unit/replaced-by/Warrior',
    ],
    cost: 30,
    stats: { attack: 2, defence: 3, movement: 1, visibility: 1 },
    effects: [],
  });
  expect(
    'a Trireme needs a coastal city, through Naval',
    entry('Trireme')?.requires.includes(
      'civ1-unit:city/build/naval-needs-coast'
    ),
    true
  );
  expect(
    'Railroad the advance and the Railroad tile improvement are two entries',
    [
      entry('RailroadAdvance')?.kind,
      entry('RailroadAdvance')?.name,
      entry('Railroad')?.kind,
    ],
    ['advance', 'Railroad', 'tileImprovement']
  );
  expect(
    'Bridge Building leads to both',
    entry((BridgeBuilding as unknown as { name: string }).name)?.leadsTo.sort(),
    [
      'civ1-science:research/requirements/Railroad',
      'civ1-world:tile-improvement/available/bridge/Road',
    ]
  );
  // The Hoover Dam's plant rules have entries of their own (#965), which the page words by their ids: the ids it has
  //  wording for (`translations/civ1-wonder/en.ts`) are these.
  const hooverIds = ['PowerPlant', 'HydroPlant', 'NuclearPlant'].map(
    (plant) => `${HOOVER_DAM_PLANT_RULE_PREFIX}/${plant}`
  );

  expect(
    "the Hoover Dam rules out each plant, by the ids of the plant rules, and each plant's page names it",
    [
      hooverIds.map((id) => {
        const sent = requirements.find((requirement) => requirement.id === id);

        return sent && [sent.subject, sent.relation, sent.targets, sent.range];
      }),
      entry('HooverDam')?.leadsTo.filter((id) => hooverIds.includes(id)),
      ['PowerPlant', 'HydroPlant', 'NuclearPlant'].map((plant) =>
        entry(plant)?.requires.filter((id) => hooverIds.includes(id))
      ),
    ],
    [
      ['PowerPlant', 'HydroPlant', 'NuclearPlant'].map((plant) => [
        plant,
        'excludedBy',
        [{ class: 'HooverDam' }],
        'player',
      ]),
      hooverIds,
      hooverIds.map((id) => [id]),
    ]
  );
  expect(
    'the Pyramids go obsolete, and a Wonder costs what it costs',
    [
      entry('Pyramids')?.requires.some((id) => id.includes('obsolete')),
      typeof entry('Pyramids')?.cost,
    ],
    [true, 'number']
  );
  expect(
    'what a city can build has a cost; advances, governments, tile improvements and terrain have none',
    entries
      .filter((entry) =>
        ['unit', 'improvement', 'wonder', 'spaceship'].includes(entry.kind)
          ? entry.cost === null
          : entry.cost !== null
      )
      .map((entry) => entry.key),
    []
  );

  // An inland city of a player who knows nothing yet.
  const cityRules = new RuleRegistry(),
    city = await setUpCity({ ruleRegistry: cityRules }),
    research = new PlayerResearch(
      city.player(),
      defaultGame.advances,
      defaultGame.rules
    ),
    cityBuild = new CityBuild(
      city,
      defaultGame.availableCityBuildItems,
      cityRules
    );

  defaultGame.playerResearch.register(research);
  cityRules.register(...defaultGame.rules.get(Build));

  const musketmen = () =>
    unavailableBuildItems(cityBuild).find(
      (item) => item.name === (Musketman as unknown as { name: string }).name
    );

  expect(
    'an inland city can’t build Musketmen without Gunpowder',
    musketmen(),
    {
      key: 'Musketman',
      name: 'Musketman',
      refusedBy: ['civ1-unit:city/build/requires-advance/Musketman'],
    }
  );
  expect(
    'and every reason it gives is a rule’s id',
    unavailableBuildItems(cityBuild).every((item) =>
      item.refusedBy.every((id) => typeof id === 'string')
    ),
    true
  );

  // As the page asks for it: its own city's answer, and nothing for a rival's.
  const asked = (player: Player): unknown[] => {
    const receivers: { [channel: string]: (data: any, meta: any) => void } = {},
      replies: unknown[] = [];

    registerRequests(
      {
        receive: (channel: string, handler: (data: any, meta: any) => void) => {
          receivers[channel] = handler;

          return () => {};
        },
        reply: (channel: string, value: unknown) => replies.push(value),
        send: () => {},
      } as any,
      {
        player: () => player,
        cityBuilds: { getBy: () => [cityBuild] },
      } as any
    );

    receivers.cityBuildUnavailable(cityBuild.id(), { id: 1 });

    return replies;
  };

  expect(
    'cityBuildUnavailable answers for the city’s own player, and with nothing for anyone else',
    [
      (asked(city.player())[0] as any[]).some(
        (item) => item.key === 'Musketman'
      ),
      asked(new Player()),
    ],
    [true, [[]]]
  );

  // Given in registry order, Wonders first, as a city's build list was before #432.
  const buildable = (name: string) =>
    (defaultGame.availableCityBuildItems.entries() as Function[]).find(
      (Item) => Item.name === name
    )!;

  expect(
    'the build list is in sections, each in the order it was given in',
    inBuildListOrder(
      ['Pyramids', 'Musketman', 'Barracks', 'Structural', 'Warrior', 'Temple'],
      buildable
    ),
    ['Musketman', 'Warrior', 'Barracks', 'Temple', 'Structural', 'Pyramids']
  );

  const available = cityBuildAvailable(
      () => (object: any) => object,
      cityBuild,
      defaultGame.rules
    ),
    availableItems = (available.hierarchy as { '#ref': string }[]).map(
      ({ '#ref': id }) => available.objects[id]
    ),
    groups = availableItems.map((item) => item.group);

  expect(
    'a city’s build list has each item’s section, units first',
    [
      groups.length > 0,
      groups.every((group) =>
        ['unit', 'improvement', 'spaceship', 'wonder'].includes(group)
      ),
      groups.every(
        (group, index) =>
          index === 0 ||
          ['unit', 'improvement', 'spaceship', 'wonder'].indexOf(group) >=
            ['unit', 'improvement', 'spaceship', 'wonder'].indexOf(
              groups[index - 1]
            )
      ),
      groups[0],
    ],
    [true, true, true, 'unit']
  );
  expect(
    'and a unit’s numbers, and none for anything else',
    availableItems
      .filter((item) => ['Warrior', 'Barracks'].includes(item.item._))
      .map((item) => [item.item._, item.stats]),
    [
      ['Warrior', { attack: 1, defence: 1, movement: 1, visibility: 1 }],
      ['Barracks', null],
    ]
  );

  research.addAdvance(Gunpowder);

  expect('once its player has Gunpowder, it can', musketmen(), undefined);

  // Ages (#1076): none while civ1-enhanced's set is off, as it starts; switched on, its eight in the order a
  //  civilization moves through them, each advance in one, Future Technology, which can be repeated, in none.
  expect(
    'no ages while they are off',
    [
      entries.filter((item) => item.kind === 'age').length,
      entries.filter((item) => item.age !== undefined).length,
    ],
    [0, 0]
  );

  defaultGame.ruleSets.set('civ1-enhanced:ages', true);

  const withAges = civilopediaData(),
    ageEntries = withAges.filter((item) => item.kind === 'age'),
    advanceEntries = withAges.filter((item) => item.kind === 'advance');

  defaultGame.ruleSets.set('civ1-enhanced:ages', false);

  expect(
    'with ages on, the eight in order',
    ageEntries.map(({ key, order }) => [key, order]),
    [
      ['Ancient', 0],
      ['Classical', 1],
      ['Medieval', 2],
      ['Renaissance', 3],
      ['Industrial', 4],
      ['Electric', 5],
      ['Modern', 6],
      ['Space', 7],
    ]
  );
  expect(
    'each advance in one age, and listed by it, but Future Technology',
    [
      advanceEntries
        .filter((item) => item.age === undefined)
        .map((item) => item.key),
      advanceEntries.every(
        (item) =>
          item.age === undefined ||
          (ageEntries
            .find((age) => age.key === item.age)
            ?.advances?.includes(item.key) ??
            false)
      ),
      ageEntries.reduce((total, age) => total + (age.advances ?? []).length, 0),
    ],
    [['FutureTechnology'], true, 67]
  );
  expect(
    'The Republic is of the Medieval Age, Alphabet of the Ancient',
    [
      advanceEntries.find((item) => item.key === 'TheRepublic')?.age,
      advanceEntries.find((item) => item.key === 'Alphabet')?.age,
    ],
    ['Medieval', 'Ancient']
  );

  // What the rules say each improvement does (#1196), from the rules in force.
  expect(
    'every city improvement says something it does',
    entries
      .filter((item) => item.kind === 'improvement')
      .filter((item) => item.effects.length === 0)
      .map((item) => item.key),
    []
  );
  expect(
    'every Wonder says something it does, bar those whose requirements say it',
    entries
      .filter((item) => item.kind === 'wonder')
      .filter((item) => item.effects.length === 0)
      .map((item) => item.key),
    ['ApolloProgram', 'ManhattanProject']
  );
  expect(
    'every effect, scope, class and square without an entry sent has wording in en',
    missingWording(entries),
    { effects: [], scopes: [], classes: [], squares: [] }
  );
  expect(
    'every condition a requirement names has wording in en (#1317)',
    missingConditions(requirements),
    []
  );
  expect(
    'a Library costs 1 gold a turn and adds half the base science',
    entry('Library')?.effects,
    [
      {
        type: 'upkeep',
        yield: {
          class: 'CityImprovementMaintenanceGold',
          name: 'CityImprovementMaintenanceGold',
          entry: false,
        },
        value: 1,
      },
      {
        type: 'yield_percent',
        yield: { class: 'Research', name: 'Research', entry: false },
        value: 0.5,
        of: 'base',
      },
    ]
  );
  expect(
    'a Temple makes one more content with Mysticism',
    entry('Temple')
      ?.effects.filter(({ type }) => type === 'content')
      .map(({ value, with: advances }) => [value, advances ?? null]),
    [
      [1, null],
      [1, [{ class: 'Mysticism', name: 'Mysticism', entry: true }]],
    ]
  );
  // As in Civ1 v474.05 (#1284, #1286).
  expect(
    'a Colosseum costs 4 gold a turn',
    entry('Colosseum')
      ?.effects.filter(({ type }) => type === 'upkeep')
      .map(({ value }) => value),
    [4]
  );
  expect(
    'the Great Library gives an advance two other civilizations know',
    entry('GreatLibrary')
      ?.effects.filter(({ type }) => type === 'shared_advances')
      .map(({ value }) => value),
    [2]
  );

  // A terrain says what it gives and costs, as Civ1 v474.05 has it (#620).
  const terrain = (key: string) =>
    entry(key)
      ?.effects.filter(({ type }) =>
        ['terrain_yield', 'movement_cost', 'defence_bonus'].includes(type)
      )
      .map(({ type, value, yield: yieldType }) => [
        type,
        (yieldType as { class?: string } | undefined)?.class ?? null,
        value,
      ])
      // In whichever order the rule sets load: the page puts a square's yields first.
      .sort((a, b) => String(a).localeCompare(String(b)));

  expect('Grassland gives 2 Food and costs 1 move', terrain('Grassland'), [
    ['movement_cost', null, 1],
    ['terrain_yield', 'Food', 2],
  ]);
  expect(
    'Hills give 1 Food, cost 2 moves and double a defender',
    terrain('Hills'),
    [
      ['defence_bonus', null, 2],
      ['movement_cost', null, 2],
      ['terrain_yield', 'Food', 1],
    ]
  );

  // A tile improvement says what it does on the squares it's on (#1272), from the rules that describe each terrain's
  //  yield with it and the turns it takes there, as one line for all the squares where only the square differs.
  const keysOf = (value: unknown): string[] =>
      (Array.isArray(value) ? value : [value])
        .filter((item) => item !== undefined && item !== null)
        .map((item) => (item as { class: string }).class),
    improving = (key: string, type: string) =>
      entry(key)
        ?.effects.filter((effect) => effect.type === type)
        .map(({ value, yield: yieldType, squares, with: needs, terrain }) => [
          value ?? null,
          keysOf(yieldType ?? terrain),
          keysOf(squares),
          keysOf(needs),
        ]);

  expect(
    'a Road gives 1 Trade on Desert, Grassland and Plains',
    improving('Road', 'improvement_yield'),
    [[1, ['Trade'], ['Desert', 'Grassland', 'Plains'], []]]
  );
  expect(
    'a Road takes 2, 4 or 6 turns by terrain, its River line needing Bridge Building',
    improving('Road', 'improvement_turns'),
    [
      [2, [], ['Desert', 'Grassland', 'Plains', 'Tundra'], []],
      [2, [], ['River'], ['BridgeBuilding']],
      [4, [], ['Arctic', 'Forest', 'Hills', 'Jungle', 'Swamp'], []],
      [6, [], ['Mountains'], []],
    ]
  );
  expect(
    'a land unit moves 3 squares along a Road for each move, and along a Railroad for free',
    [improving('Road', 'route_squares'), improving('Railroad', 'route_free')],
    [[[3, [], [], []]], [[null, [], [], []]]]
  );
  expect(
    'a Railroad adds half of each yield on any land square',
    improving('Railroad', 'improvement_yield_percent'),
    ['Food', 'Production', 'Trade'].map((yieldKey) => [
      0.5,
      [yieldKey],
      ['Land'],
      [],
    ])
  );
  expect(
    'a Mine gives 1 Production on Desert and Mountains, and 3 on Hills, in 5 or 10 turns',
    [
      improving('Mine', 'improvement_yield'),
      improving('Mine', 'improvement_turns'),
    ],
    [
      [
        [1, ['Production'], ['Desert', 'Mountains'], []],
        [3, ['Production'], ['Hills'], []],
      ],
      [
        [5, [], ['Desert'], []],
        [10, [], ['Hills', 'Mountains'], []],
      ],
    ]
  );
  expect(
    'a Fortress needs Construction, takes 5, 6 or 7 turns by terrain, doubles a land unit’s defence and spares a beaten defender’s stack (#388)',
    [
      entry('Fortress')?.requires,
      entry('Construction')?.leadsTo.includes(
        'civ1-world:tile-improvement/available/Fortress'
      ),
      improving('Fortress', 'improvement_turns'),
      entry('Fortress')
        ?.effects.filter(({ type }) => type !== 'improvement_turns')
        .map(({ type, value, unit }) =>
          [type, value ?? '', keysOf(unit).join()].join(' ')
        ),
    ],
    [
      ['civ1-world:tile-improvement/available/Fortress'],
      true,
      [
        [5, [], ['Desert', 'Grassland', 'Plains', 'River', 'Tundra'], []],
        [6, [], ['Arctic', 'Forest', 'Hills', 'Jungle', 'Swamp'], []],
        [7, [], ['Mountains'], []],
      ],
      ['spares_stack  ', 'square_defence_multiplier 2 Land'],
    ]
  );
  expect(
    'Future Technology says it needs every other advance, and Anarchy what leads to it and for how long (#621)',
    [
      entry('FutureTechnology')?.effects.map(({ type }) => type),
      entry('Anarchy')?.effects.map(({ type, cause, min, max }) =>
        [type, cause, min, max].join(' ')
      ),
    ],
    [
      ['needs_every_other_advance'],
      ['anarchy_follows chosen 1 4', 'anarchy_follows civil-disorder 2 8'],
    ]
  );
  expect(
    'Irrigation turns Jungle and Swamp into Grassland, and Forest into Plains',
    improving('Irrigation', 'converts_to'),
    [
      [null, ['Grassland'], ['Jungle', 'Swamp'], []],
      [null, ['Plains'], ['Forest'], []],
    ]
  );
  expect(
    "a terrain's own page says nothing as if it were on squares",
    entries
      .filter(({ kind }) => kind !== 'tileImprovement')
      .filter(({ effects }) =>
        effects.some(({ squares }) => squares !== undefined)
      )
      .map(({ key }) => key),
    []
  );
  expect(
    "Pollution halves its square's yields, comes from cities, and takes Settlers 4 turns to clean up",
    // In whichever order the rules load: the page puts what it does to the square first.
    entry('Pollution')
      ?.effects.map(({ type, yield: yieldType, source, value }) =>
        [type, keysOf(yieldType), source ?? null, value ?? null].join(' ')
      )
      .sort(),
    [
      'caused_by  population ',
      'caused_by  production ',
      'pollution_tolerance   20',
      'removal_turns   4',
      'tile_yield_halved Food  ',
      'tile_yield_halved Production  ',
      'tile_yield_halved Trade  ',
    ]
  );

  // How a tile improvement's lines come together (#1339): the same line from two rules names its square once, whatever
  //  order its fields or its lists came in; each yield's lines stay together; and each square's steps stand on
  //  their own, so one square's next step doesn't hide another's.
  const keyed = (effects: { [field: string]: unknown }[]) =>
    effects.map((effect) =>
      Object.fromEntries(
        Object.entries(effect).map(([field, value]) => [
          field,
          Array.isArray(value)
            ? value.map((item) => (item as Function).name)
            : typeof value === 'function'
            ? value.name
            : value,
        ])
      )
    );

  expect(
    'the same line from two rules names its square once, whatever the order of its fields and lists',
    keyed(
      onSquaresTogether([
        {
          type: 'improvement_turns',
          value: 2,
          with: [Gunpowder, BridgeBuilding],
          squares: Desert,
        },
        {
          with: [BridgeBuilding, Gunpowder],
          value: 2,
          type: 'improvement_turns',
          squares: Desert,
        },
        {
          type: 'improvement_turns',
          value: 2,
          with: [Gunpowder, BridgeBuilding],
          squares: Grassland,
        },
      ])
    ),
    [
      {
        type: 'improvement_turns',
        value: 2,
        with: ['Gunpowder', 'BridgeBuilding'],
        squares: ['Desert', 'Grassland'],
      },
    ]
  );
  expect(
    "each yield's lines together, by value",
    keyed(
      onSquaresTogether([
        { type: 'improvement_yield', yield: Food, value: 2, squares: Desert },
        {
          type: 'improvement_yield',
          yield: Production,
          value: 1,
          squares: Desert,
        },
        {
          type: 'improvement_yield',
          yield: Food,
          value: 1,
          squares: Grassland,
        },
      ])
    ).map(({ yield: yieldType, value }) => [yieldType, value]),
    [
      ['Food', 1],
      ['Food', 2],
      ['Production', 1],
    ]
  );
  expect(
    "one square's next step doesn't hide another's",
    effectsOf(
      Road,
      [
        {
          type: 'improvement_yield',
          subject: Desert,
          improvement: Road,
          yield: Food,
          value: 1,
          from: BridgeBuilding,
          until: Gunpowder,
        },
        {
          type: 'improvement_yield',
          subject: Grassland,
          improvement: Road,
          yield: Food,
          value: 2,
          from: Gunpowder,
        },
      ],
      new Set(),
      { knows: () => false, difficulty: null }
    ).map(({ value, squares }) => [
      value,
      (squares as { class: string }[]).map(({ class: key }) => key),
    ]),
    [
      [1, ['Desert']],
      [2, ['Grassland']],
    ]
  );

  // A rule set's own kind of Road gets the lines that name Road (#1339), and an `improvement` that isn't a class (an
  //  arrow function) names nothing, without throwing.
  class TollRoad extends Road {}

  expect(
    "a kind of Road has Road's lines, and a non-class improvement names nothing",
    effectsOf(TollRoad, [
      {
        type: 'improvement_yield',
        subject: Desert,
        improvement: Road,
        yield: Food,
        value: 1,
      },
      {
        type: 'improvement_yield',
        subject: Grassland,
        improvement: () => Road,
        yield: Food,
        value: 2,
      },
    ]).map(({ value, squares }) => [
      value,
      (squares as { class: string }[]).map(({ class: key }) => key),
    ]),
    [[1, ['Desert']]]
  );

  // In a game, Barracks say what applies now (#1310): with Gunpowder, 1 gold until Combustion, then 2.
  expect(
    'with Gunpowder, Barracks cost 1 gold until Combustion, then 2',
    civilopediaData(defaultGame, {
      knows: (AdvanceType) => AdvanceType === Gunpowder,
      difficulty: null,
    })
      .find(({ key }) => key === 'Barracks')
      ?.effects.filter(({ type }) => type === 'upkeep')
      .map(({ value, from, until }) => [
        value,
        (from as { class?: string } | null | undefined)?.class ?? null,
        (until as { class?: string } | null | undefined)?.class ?? null,
      ]),
    [
      [1, null, 'Combustion'],
      [2, 'Combustion', null],
    ]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL civilopedia (${failures.length})\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civilopedia (${entries.length} entries)\n`);
};

import('../../src/js/plugins').then(check).catch((error) => {
  process.stderr.write(`FAIL civilopedia: ${error?.stack ?? error}\n`);
  process.exit(1);
});
