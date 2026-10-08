// The city screen's yield rows and its specialist keys.
//
// A yield the city uses more of than it makes is split into what it covers and
// what it is short by, so the shortfall can be drawn in its own colour (#188).
// A yield is grouped by the ancestry the engine sends with it, so one the UI has
// never heard of still counts with its group.
// Keys 1–8 pick a specialist in the order the roster draws them (#107).
// The citizens drawn are the moods the engine sends, in order, one sprite each.

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
import { splitYield, yieldGroup } from '../../src/js/UI/lib/yieldMap';

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

if (failures.length) {
  process.stderr.write(
    `FAIL cityScreen\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS cityScreen (${checks} checks)`);
