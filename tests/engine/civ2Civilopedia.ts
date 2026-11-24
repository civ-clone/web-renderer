// The Civilopedia of a Civilization II game (#1196): with the civ2 plugin set loaded as the worker loads it, every city
//  improvement and Wonder says what it does, bar those whose requirement entries say it, and every effect, scope and
//  class without an entry it sends has wording in en.

// Must stay first: seeds `Math.random` before any engine module evaluates.
import './lib/seed';
// The worker client a civ2 game runs in, as `civ2Isolation` loads it.
import '@civ-clone/ui-worker-client/Game';
import civilopediaData from '@civ-clone/ui-worker-client/lib/civilopedia';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import missingWording, { missingConditions } from './lib/effectWording';
import requirementsData from '@civ-clone/ui-worker-client/lib/requirements';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';

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
    process.stderr.write('FAIL civ2-civilopedia: stopped before its checks\n');
    process.exitCode = 1;
  }
});

const check = (): void => {
  const entries = civilopediaData(),
    silent = (kind: string): string[] =>
      entries
        .filter((entry) => entry.kind === kind && entry.effects.length === 0)
        .map((entry) => entry.key)
        .sort();

  expect(
    'a Civilization II game has its improvements and Wonders',
    [
      entries.filter((entry) => entry.kind === 'improvement').length > 30,
      entries.filter((entry) => entry.kind === 'wonder').length,
    ],
    [true, 28]
  );
  expect(
    'every city improvement says something it does',
    silent('improvement'),
    []
  );
  expect(
    'every Wonder says something it does, bar those whose requirements say it',
    silent('wonder'),
    []
  );
  expect(
    'every effect, scope, class and square without an entry sent has wording in en',
    missingWording(entries),
    { effects: [], scopes: [], classes: [], squares: [] }
  );

  expect(
    'every condition a requirement names has wording in en (#1317)',
    missingConditions(requirementsData()),
    []
  );

  // What #1196 left out (#1291): the effects each says, by type.
  const types = (key: string): string[] =>
    [
      ...new Set(
        entries
          .find((entry) => entry.key === key)
          ?.effects.map(({ type }) => type) ?? []
      ),
    ].sort();
  const has = (key: string, wanted: string[]): string[] =>
    wanted.filter((type) => !types(key).includes(type));

  expect(
    'the Palace: barbarians, civil war, its moves and its escape',
    has('Palace', [
      'barbarian_attack',
      'barbarian_defender_rerolls',
      'civil_war',
      'free_in_first_city',
      'lost_on_capture',
      'palace_escape',
      'relocates',
    ]),
    []
  );
  expect(
    'Barracks: sold on an advance, upkeep by difficulty, healing and repair',
    [
      has('Barracks', [
        'heals_nearby',
        'lost_on_capture',
        'repairs_allies',
        'sold_on',
        'upkeep',
      ]),
      entries
        .find((entry) => entry.key === 'Barracks')
        ?.effects.filter(({ type }) => type === 'upkeep')
        .map(({ below, atLeast }) => (below ? 'below' : atLeast ? 'at' : '')),
    ],
    [[], ['below', 'below', 'below', 'at', 'at', 'at']]
  );
  expect(
    'a Marketplace is lost half the time, unless its founder takes it',
    entries
      .find((entry) => entry.key === 'Marketplace')
      ?.effects.filter(({ type }) => type === 'lost_on_capture')
      .map(({ unless, value }) => [unless, value]),
    [['founder', 0.5]]
  );
  expect(
    'the rest of #1291, each on its page',
    [
      has('Courthouse', ['incite_distance']),
      has('Lighthouse', ['protects_from']),
      has('Airport', ['trade_route_link']),
      has('Superhighways', ['trade_route_link']),
      has('SolarPlant', ['global_warming', 'pollution_step']),
      has('GreatWall', [
        'attack_multiplier',
        'barbarian_attack',
        'talks_attitude',
        'talks_no_tribute',
        'talks_peace',
      ]),
      has('EiffelTower', [
        'attitude_improved',
        'reputation_halved',
        'vendettas_end',
      ]),
      has('ManhattanProject', ['reputation_recovers']),
      has('MarcoPolosEmbassy', ['shared_maps', 'tribute_demand']),
    ],
    [[], [], [], [], [], [], [], [], []]
  );

  // In a game, an entry says what applies to the player now (#1310): Barracks' upkeep and sales, at a level below
  //  Prince and at Prince, before Gunpowder, with it, and with Mobile Warfare too.
  const advance = (name: string) =>
      (defaultGame.advances.entries() as Function[]).find(
        (AdvanceType) => AdvanceType.name === name
      )!,
    levels = defaultGame.availableDifficulties.sorted(),
    Prince = levels.find((Level) => Level.name === 'Prince')!,
    Warlord = levels.find((Level) => Level.name === 'Warlord')!,
    barracks = (known: string[], level: Function) => {
      const knows = new Set(known.map(advance));

      return civilopediaData(defaultGame, {
        knows: (AdvanceType) => knows.has(AdvanceType),
        difficulty: level as never,
      })
        .find((entry) => entry.key === 'Barracks')
        ?.effects.filter(({ type }) => ['upkeep', 'sold_on'].includes(type))
        .map(({ type, value, from, until, below, atLeast, with: needs }) => [
          type,
          value ?? null,
          (from as { class?: string } | undefined)?.class ?? null,
          (until as { class?: string } | undefined)?.class ?? null,
          below === undefined && atLeast === undefined,
          ((needs as { class: string }[] | undefined) ?? []).map(
            ({ class: name }) => name
          ),
        ]);
    };

  expect(
    'Barracks before Gunpowder, below Prince: free until Gunpowder, then 1 gold, and both sales',
    barracks([], Warlord),
    [
      ['upkeep', 0, null, 'Gunpowder', true, []],
      ['upkeep', 1, 'Gunpowder', null, true, []],
      ['sold_on', null, null, null, true, ['Gunpowder']],
      ['sold_on', null, null, null, true, ['MobileWarfare']],
    ]
  );
  expect(
    'with Gunpowder, at Prince: 2 gold until Mobile Warfare, then 3, and one sale left',
    barracks(['Gunpowder'], Prince),
    [
      ['upkeep', 2, null, 'MobileWarfare', true, []],
      ['upkeep', 3, 'MobileWarfare', null, true, []],
      ['sold_on', null, null, null, true, ['MobileWarfare']],
    ]
  );
  expect(
    'and with Mobile Warfare too, just its upkeep',
    barracks(['Gunpowder', 'MobileWarfare'], Prince),
    [['upkeep', 3, null, null, true, []]]
  );

  // Every tile improvement says what it does (#1272, #621): on the squares it's on, and what it does beyond them. No
  //  other kind's page says anything as if it were on squares (a Wonder's `acts_as` names its improvement too).
  const byKey = new Map(entries.map((entry) => [entry.key, entry])),
    typesOf = (key: string): string[] =>
      Array.from(
        new Set(
          (byKey.get(key)?.effects ?? []).map(
            ({ type, squares }) =>
              `${squares === undefined ? '' : 'squares.'}${type}`
          )
        )
      ).sort();

  expect(
    'every tile improvement says something it does',
    silent('tileImprovement'),
    []
  );
  expect(
    "no other kind's page says anything as if it were on squares",
    entries
      .filter(({ kind }) => kind !== 'tileImprovement')
      .filter(({ effects }) =>
        effects.some(({ squares }) => squares !== undefined)
      )
      .map(({ key }) => key),
    []
  );
  expect(
    'each tile improvement says what it does',
    [
      'Airbase',
      'Farmland',
      'Fortress',
      'Irrigation',
      'Mine',
      'Pollution',
      'Railroad',
      'Road',
    ].map((key) => [key, typesOf(key)]),
    [
      ['Airbase', ['build_turns', 'heals', 'refuels']],
      ['Farmland', ['square_yield_percent', 'squares.improvement_turns']],
      [
        'Fortress',
        [
          'heals_resting',
          'square_defence_multiplier',
          'squares.improvement_turns',
        ],
      ],
      [
        'Irrigation',
        [
          'squares.converts_to',
          'squares.improvement_turns',
          'squares.improvement_yield',
        ],
      ],
      [
        'Mine',
        [
          'squares.converts_to',
          'squares.improvement_turns',
          'squares.improvement_yield',
        ],
      ],
      ['Pollution', ['caused_by', 'removal_turns', 'tile_yield_halved']],
      [
        'Railroad',
        [
          'route_free',
          'squares.improvement_turns',
          'squares.improvement_yield_percent',
        ],
      ],
      [
        'Road',
        [
          'route_squares',
          'squares.improvement_turns',
          'squares.improvement_yield',
        ],
      ],
    ]
  );

  // And their figures, as the rules give them.
  const effectOf = (key: string, type: string) =>
      byKey.get(key)?.effects.find((effect) => effect.type === type),
    classesOf = (value: unknown): string[] =>
      (Array.isArray(value) ? value : [value]).map(
        (item) => (item as { class: string }).class
      ),
    fortress = effectOf('Fortress', 'square_defence_multiplier');

  expect(
    'a Fortress doubles a land defender, except against aircraft and what ignores walls',
    [fortress?.value, classesOf(fortress?.unit), classesOf(fortress?.except)],
    [2, ['Land'], ['Air', 'IgnoresFortifications']]
  );
  expect(
    'a Road takes land units 3 squares a move, and an Airbase and cleaning up Pollution take 4 turns',
    [
      effectOf('Road', 'route_squares')?.value,
      effectOf('Airbase', 'build_turns')?.value,
      effectOf('Pollution', 'removal_turns')?.value,
      effectOf('Farmland', 'square_yield_percent')?.value,
      classesOf(effectOf('Farmland', 'square_yield_percent')?.inCitiesWith),
    ],
    [3, 4, 4, 0.5, ['Supermarket']]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL civ2-civilopedia (${
        failures.length
      } of ${checks})\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civ2-civilopedia (${checks} checks)\n`);
};

const civ2 = pluginsFrom(pluginSets).sets.find(({ id }) => id === 'civ2');

if (!civ2) {
  process.stderr.write('FAIL civ2-civilopedia: no civ2 plugin set\n');
  process.exit(1);
}

civ2!
  .load()
  .then(check)
  .catch((error: any): void => {
    process.stderr.write(`FAIL civ2-civilopedia: ${error?.stack ?? error}\n`);
    process.exit(1);
  });
