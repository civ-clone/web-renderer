// The city screen's yield rows and its specialist keys.
//
// A yield the city uses more of than it makes is split into what it covers and
// what it is short by, so the shortfall can be drawn in its own colour (#188).
// A yield is grouped by the ancestry the engine sends with it, so one the UI has
// never heard of still counts with its group.
// Keys 1–8 pick a specialist in the order the roster draws them (#107).
// The citizens drawn are the moods the engine sends, in order, one sprite each.
// The Auto button and the A key send the action that turns Auto the other way (#194).
// A polluted square's halved yields are drawn as what each nets to, or the city map runs out of icon slots (#32).
// An open city screen follows what it shows through `watchCity` (#344): its city, build, growth, supported units (a
// new one without re-subscribing) and the player's gold, redrawing for each, and closes, watching nothing more, when
// a patch keyed on the player takes the city out of the player's list, as a capture or a destruction does (#483).
// Patches go through the shipped `applyDataPatches` and a real `IncrementalReconstituter`, and each rebuild is
// collected into the shared `DataChanges` instance as `Renderer` does; a "render" is a `notify`.

import {
  citizenMoods,
  citizenSprites,
  specialistSprites,
} from '../../src/js/UI/lib/citizens';
import {
  orderSpecialists,
  specialistForKey,
} from '../../src/js/UI/lib/specialists';
import { CitizenMood, Yield } from '../../src/js/UI/types';
import {
  netTileYields,
  splitYield,
  tileYieldIcons,
  yieldGroup,
} from '../../src/js/UI/lib/yieldMap';
import { City, DataPatch, GameData } from '../../src/js/UI/types';
import { ObjectMap, PlainObject } from '../../src/js/UI/lib/reconstituteData';
import IncrementalReconstituter from '../../src/js/UI/lib/IncrementalReconstituter';
import applyDataPatches from '../../src/js/UI/lib/applyDataPatches';
import { instance as dataChanges } from '../../src/js/UI/lib/DataChanges';
import { toggleAuto } from '../../src/js/UI/components/lib/cityBuild';
import watchCity from '../../src/js/UI/components/lib/watchCity';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL cityScreen: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

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

// The group of each Civ1 yield that isn't itself a group, as the engine's ancestry gives it.
const groups: { [key: string]: string } = {
  UnitSupportFood: 'Food',
  PopulationSupportFood: 'Food',
  UnitSupportProduction: 'Production',
  Corruption: 'Trade',
  LuxuryHappiness: 'Happiness',
  MartialLaw: 'Unhappiness',
  MilitaryUnhappiness: 'Unhappiness',
  PopulationUnhappiness: 'Unhappiness',
  CityImprovementContent: 'Unhappiness',
  CityImprovementMaintenanceGold: 'Gold',
};

const ancestry = (name: string): string[] =>
  groups[name]
    ? [name, groups[name], 'Yield', 'DataObject']
    : [name, 'Yield', 'DataObject'];

const yields = (...entries: [string, number][]): Yield[] =>
  entries.map(
    ([_, value]) => ({ _, __: ancestry(_), value } as unknown as Yield)
  );

expect(
  'Rome makes 5 Gold and pays 6: 5 used and 1 short',
  splitYield(
    'Gold',
    yields(
      ['Gold', 5],
      ['CityImprovementMaintenanceGold', -2],
      ['CityImprovementMaintenanceGold', -4]
    )
  ),
  { used: 5, deficit: 1, free: 0 }
);

expect(
  'Berlin makes no Gold and pays 1: 1 short',
  splitYield('Gold', yields(['CityImprovementMaintenanceGold', -1])),
  { used: 0, deficit: 1, free: 0 }
);

expect(
  'a balanced city has no shortfall and nothing spare',
  splitYield(
    'Gold',
    yields(['Gold', 3], ['CityImprovementMaintenanceGold', -3])
  ),
  { used: 3, deficit: 0, free: 0 }
);

expect(
  'a city in surplus shows what it uses and what is spare',
  splitYield(
    'Gold',
    yields(['Gold', 7], ['CityImprovementMaintenanceGold', -3])
  ),
  { used: 3, deficit: 0, free: 4 }
);

expect(
  'a city with nothing to pay shows everything as spare',
  splitYield('Gold', yields(['Gold', 4])),
  { used: 0, deficit: 0, free: 4 }
);

expect(
  'a shrinking city is short of Food',
  splitYield(
    'Food',
    yields(
      ['Food', 5],
      ['PopulationSupportFood', -6],
      ['UnitSupportFood', -1],
      ['Production', 9]
    )
  ),
  { used: 5, deficit: 2, free: 0 }
);

expect(
  'units a city cannot support leave it short of Production',
  splitYield(
    'Production',
    yields(
      ['Production', 1],
      ['UnitSupportProduction', -1],
      ['UnitSupportProduction', -1],
      ['Food', 9]
    )
  ),
  { used: 1, deficit: 1, free: 0 }
);

expect('a yield the city has none of is empty', splitYield('Research', []), {
  used: 0,
  deficit: 0,
  free: 0,
});

expect(
  'a Civ1 yield is grouped by its ancestry',
  yieldGroup({ _: 'MartialLaw', __: ancestry('MartialLaw') }),
  'Unhappiness'
);

expect(
  'a group is its own group',
  yieldGroup({ _: 'Gold', __: ancestry('Gold') }),
  'Gold'
);

expect(
  'an object without ancestry is its own group',
  yieldGroup({ _: 'Food' }),
  'Food'
);

expect(
  'a yield the UI has never heard of is counted with its group',
  splitYield('Gold', [
    { _: 'Gold', __: ancestry('Gold'), value: 5 },
    { _: 'Tithe', __: ['Tithe', 'Gold', 'Yield', 'DataObject'], value: -7 },
  ] as unknown as Yield[]),
  { used: 5, deficit: 2, free: 0 }
);

const specialists = [
  { _: 'Scientist', id: 'scientist' },
  { _: 'Entertainer', id: 'entertainer-1' },
  { _: 'TaxCollector', id: 'tax-collector' },
  { _: 'Entertainer', id: 'entertainer-2' },
];

expect(
  'specialists are ordered Entertainers, Tax collectors, Scientists',
  orderSpecialists(specialists).map(({ id }) => id),
  ['entertainer-1', 'entertainer-2', 'tax-collector', 'scientist']
);

expect(
  '1 picks the first specialist as drawn',
  specialistForKey('1', specialists)?.id,
  'entertainer-1'
);

expect(
  '3 picks the third specialist as drawn',
  specialistForKey('3', specialists)?.id,
  'tax-collector'
);

expect(
  '4 picks the last of four specialists',
  specialistForKey('4', specialists)?.id,
  'scientist'
);

expect(
  'a number beyond the specialists picks nothing',
  specialistForKey('5', specialists),
  null
);

['0', '9', 'c', 'Enter', '12', ''].forEach((key) =>
  expect(
    `${JSON.stringify(key)} picks nothing`,
    specialistForKey(key, specialists),
    null
  )
);

expect(
  'a city with no specialists has nothing to pick',
  specialistForKey('1', []),
  null
);

const moods: CitizenMood[] = ['happy', 'content', 'unhappy', 'unhappy'];

expect(
  'the citizens are the moods the engine sends, in order',
  citizenMoods({ citizens: { moods } }),
  moods
);

expect(
  'a city the engine sends no citizens for draws no workers',
  citizenMoods({}),
  []
);

expect(
  'each mood gets its own sprite, in order',
  citizenSprites(moods, 'Rome').map(
    (path) => /people_(\w+?)_[fm]\.png$/.exec(path)?.[1]
  ),
  moods
);

expect(
  'a city keeps the same faces each time it is drawn',
  citizenSprites(moods, 'Rome'),
  citizenSprites(moods, 'Rome')
);

expect('no moods give no sprites', citizenSprites([], 'Rome'), []);

// Specialists carry on the city's pattern of women and men after the workers (#334).
const specialistSeeds = ['Rome', 'Babylon', 'Zimbabwe', 'Thebes'],
  face = (path: string) => (/_f\.png$/.test(path) ? 'f' : 'm');

specialistSeeds.forEach((seed) => {
  const sprites = specialistSprites(['tax', 'science', 'luxury'], 3, seed);

  expect(
    `${seed}: each specialist is the face a worker in their place would have`,
    sprites.map(([path]) => face(path)),
    citizenSprites(new Array(6).fill('content'), seed).slice(3).map(face)
  );
  expect(
    `${seed}: every specialist falls back to the man's sprite`,
    sprites.map((paths) => paths[paths.length - 1]),
    [
      './assets/city/people_tax.png',
      './assets/city/people_science.png',
      './assets/city/people_luxury.png',
    ]
  );
});

expect(
  'specialists are drawn as both women and men',
  [
    ...new Set(
      specialistSeeds.flatMap((seed) =>
        specialistSprites(new Array(8).fill('tax'), 0, seed).map(([path]) =>
          face(path)
        )
      )
    ),
  ].sort(),
  ['f', 'm']
);
expect(
  "a woman specialist is tried before the man's sprite",
  specialistSprites(new Array(8).fill('science'), 0, 'Rome').find(
    (paths) => paths.length === 2
  ),
  ['./assets/city/people_science_f.png', './assets/city/people_science.png']
);

// What toggling Auto sends: the `CityBuild` action while the city builds nothing, `ChangeProduction` otherwise.
const autoSent = (auto: boolean, building: object | null): unknown => {
  const sent: unknown[] = [];

  toggleAuto(
    { id: 'build-1', auto, building } as any,
    {
      send: (channel: string, data: unknown) => sent.push([channel, data]),
    } as any
  );

  return sent;
};

expect(
  'Auto, building nothing, answers the CityBuild action',
  autoSent(false, null),
  [['action', { name: 'CityBuild', id: 'build-1', auto: true }]]
);
expect(
  'Auto, building something, answers ChangeProduction',
  autoSent(false, {}),
  [['action', { name: 'ChangeProduction', id: 'build-1', auto: true }]]
);
expect('Stop Auto turns it off', autoSent(true, {}), [
  ['action', { name: 'ChangeProduction', id: 'build-1', auto: false }],
]);

expect(
  'a polluted square draws what each yield nets to',
  netTileYields([
    { _: 'Food', value: 3 },
    { _: 'Production', value: 2 },
    { _: 'Trade', value: 2 },
    { _: 'Food', value: -1 },
    { _: 'Production', value: -1 },
    { _: 'Trade', value: -1 },
  ]),
  [
    { _: 'Food', value: 2 },
    { _: 'Production', value: 1 },
    { _: 'Trade', value: 1 },
  ]
);
expect(
  'a yield that nets to nothing is not drawn',
  netTileYields([
    { _: 'Food', value: 1 },
    { _: 'Trade', value: 1 },
    { _: 'Trade', value: -1 },
  ]),
  [{ _: 'Food', value: 1 }]
);

expect(
  'a fraction of a yield is not drawn as a whole icon',
  netTileYields([{ _: 'Trade', value: 1.5 }]),
  [{ _: 'Trade', value: 1 }]
);

const icons = (counts: { [key: string]: number }) =>
  tileYieldIcons(Object.entries(counts).map(([_, value]) => ({ _, value })));

expect(
  'up to four icons sit in two columns',
  icons({ Food: 2, Production: 1, Trade: 1 }),
  [
    { _: 'Food', x: 0, y: 0 },
    { _: 'Food', x: 0.5, y: 0 },
    { _: 'Production', x: 0, y: 0.5 },
    { _: 'Trade', x: 0.5, y: 0.5 },
  ]
);
expect(
  'five icons take three columns',
  icons({ Food: 5 }).map(({ x, y }) => [x, y]),
  [
    [0, 0],
    [1 / 3, 0],
    [2 / 3, 0],
    [0, 0.5],
    [1 / 3, 0.5],
  ]
);
expect(
  'a polluted square draws one icon per yield it nets to',
  tileYieldIcons([
    { _: 'Food', value: 3 },
    { _: 'Production', value: 2 },
    { _: 'Trade', value: 2 },
    { _: 'Food', value: -1 },
    { _: 'Production', value: -1 },
    { _: 'Trade', value: -1 },
  ]).map(({ _ }) => _),
  ['Food', 'Food', 'Production', 'Trade']
);

const crowded = icons({ Food: 6, Production: 5, Trade: 4 });

expect('a square with more icons than room draws twelve', crowded.length, 12);
expect(
  'every icon drawn lands inside its square',
  crowded.every(({ x, y }) => x >= 0 && x < 1 && y >= 0 && y < 1),
  true
);

// The city screen's watch (#344, #483).
{
  const ref = (id: string) => ({ '#ref': id }),
    unit = (id: string, moves = 1): PlainObject => ({ _: 'Unit', id, moves });

  // A player with two cities, Rome supporting one unit, and its gold.
  const objectMap: ObjectMap = {
    hierarchy: { player: ref('Player-1') },
    objects: {
      'Player-1': {
        _: 'Player',
        id: 'Player-1',
        actions: [],
        cities: [ref('City-1'), ref('City-2')],
        treasuries: [ref('Treasury-1')],
        units: [ref('Unit-1')],
      },
      'City-1': {
        _: 'City',
        id: 'City-1',
        name: 'Rome',
        build: ref('CityBuild-1'),
        growth: ref('CityGrowth-1'),
        player: ref('Player-1'),
        units: [ref('Unit-1')],
      },
      'City-2': {
        _: 'City',
        id: 'City-2',
        name: 'Veii',
        build: ref('CityBuild-2'),
        growth: ref('CityGrowth-2'),
        player: ref('Player-1'),
        units: [],
      },
      'CityBuild-1': { _: 'CityBuild', id: 'CityBuild-1', building: null },
      'CityBuild-2': { _: 'CityBuild', id: 'CityBuild-2', building: null },
      'CityGrowth-1': { _: 'CityGrowth', id: 'CityGrowth-1', size: 1 },
      'CityGrowth-2': { _: 'CityGrowth', id: 'CityGrowth-2', size: 1 },
      'Treasury-1': {
        _: 'PlayerTreasury',
        id: 'Treasury-1',
        yield: { _: 'Gold' },
        value: 10,
      },
      'Unit-1': unit('Unit-1'),
    },
  };

  const reconstituter = new IncrementalReconstituter();

  let data = reconstituter.rebuild(objectMap, null) as GameData;

  // As `updateState` does: rebuild, then collect.
  const update = (patches: DataPatch[], rebuildAll = false): void => {
      const changedIds = new Set<string>();

      applyDataPatches(objectMap, patches, {
        changed: (id) => changedIds.add(id),
      });

      const changed = rebuildAll ? null : changedIds;

      data = reconstituter.rebuild(objectMap, changed) as GameData;

      dataChanges.collect(
        changed === null ? null : [...changed, ...reconstituter.filledIds()]
      );
    },
    render = (): void => dataChanges.notify(data),
    replace = (id: string, changes: PlainObject, objects = {}) => ({
      [id]: {
        type: 'update' as const,
        value: {
          hierarchy: (objectMap.objects[id] = {
            ...objectMap.objects[id],
            ...changes,
          }),
          objects,
        },
      },
    }),
    // One of the player's keys on its own, as the client sends its cities or actions.
    replacePlayerKey = (key: string, hierarchy: unknown) => ({
      'Player-1': {
        type: 'update' as const,
        index: key,
        value: { hierarchy, objects: {} },
      },
    }),
    findCity = (id: string): City =>
      data.player.cities.find((city) => city.id === id)!;

  // What the screen did since the last `reset`, as `City` would: redraw with the city given, or close.
  const updated: City[] = [];
  let closes = 0;

  const reset = (): void => {
    updated.length = 0;
    closes = 0;
  };

  // `City.close` calls what `watchCity` returned, as here.
  const unwatch = watchCity(findCity('City-1'), {
    update: (city) => updated.push(city),
    close: () => {
      closes++;
      unwatch();
    },
  });

  update([replace('City-1', { name: 'Roma' })]);
  render();

  expect(
    'the screen redraws when its city changes, with the city as it is now',
    updated.map(({ name }) => name),
    ['Roma']
  );

  // A change to gold alone, after that first redraw: the old re-subscription dropped the treasury here.
  reset();
  update([replace('Treasury-1', { value: 35 })]);
  render();

  expect(
    'after a first redraw, a change to gold alone still redraws it',
    [updated.length, closes, updated[0]?.player.treasuries[0].value],
    [1, 0, 35]
  );

  reset();
  update([replace('CityBuild-1', { building: { _: 'Militia' } })]);
  update([replace('CityGrowth-1', { size: 2 })]);
  render();

  expect(
    'a change to its build and growth redraws it once per render',
    updated.length,
    1
  );

  // A unit built in the city, then a change to that unit alone.
  reset();
  update([
    replace(
      'City-1',
      { units: [ref('Unit-1'), ref('Unit-2')] },
      { 'Unit-2': unit('Unit-2') }
    ),
  ]);
  render();
  reset();
  update([replace('Unit-2', { moves: 0 })]);
  render();

  expect(
    'a unit added to the city is followed without re-subscribing',
    [updated.length, updated[0]?.units.map(({ id, moves }) => [id, moves])],
    [
      1,
      [
        ['Unit-1', 1],
        ['Unit-2', 0],
      ],
    ]
  );

  // The player changes with most actions.
  reset();
  update([replacePlayerKey('actions', [])]);
  render();

  expect(
    'a change to the player alone, its city still there, neither redraws nor closes it',
    [updated.length, closes],
    [0, 0]
  );

  reset();
  update([replace('City-2', { name: 'Vei' })]);
  render();

  expect(
    'another city changing changes nothing',
    [updated.length, closes],
    [0, 0]
  );

  // A rebuild of everything leaves what the screen held stale: it is found again.
  reset();
  update([], true);
  render();

  expect(
    'a rebuild of everything redraws it with the rebuilt city',
    [updated.length, closes, updated[0] === findCity('City-1')],
    [1, 0, true]
  );

  reset();
  update([replace('Treasury-1', { value: 20 })]);
  render();

  expect(
    'and it still follows gold after that',
    [updated.length, closes],
    [1, 0]
  );

  // Captured: the player's list of cities loses it, in a patch keyed on the player, with nothing of the city's own.
  reset();
  update([replacePlayerKey('cities', [ref('City-2')])]);
  render();

  expect(
    'a patch keyed on the player that takes the city out of its list closes the screen',
    [updated.length, closes],
    [0, 1]
  );

  reset();
  update([replace('City-1', { name: 'Rome' })]);
  update([replace('Treasury-1', { value: 5 })]);
  update([replacePlayerKey('actions', [])]);
  render();
  update([], true);
  render();

  expect(
    'and nothing wakes it after that, not even a rebuild of everything',
    [updated.length, closes],
    [0, 0]
  );

  // Gone while one of its own ids changes too, as when a unit it supported is lost with it.
  const unwatchVeii = watchCity(findCity('City-2'), {
    update: (city) => updated.push(city),
    close: () => {
      closes++;
      unwatchVeii();
    },
  });

  reset();
  update([replace('City-2', { name: 'Veii' }), replacePlayerKey('cities', [])]);
  render();

  expect(
    'a city gone in the same render as a change of its own closes the screen once, without redrawing it',
    [updated.length, closes],
    [0, 1]
  );
}

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL cityScreen\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS cityScreen (${checks} checks)`);
