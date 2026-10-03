// The city screen's yield rows and its specialist keys.
//
// A yield the city uses more of than it makes is split into what it covers and
// what it is short by, so the shortfall can be drawn in its own colour (#188).
// Keys 1–8 pick a specialist in the order the roster draws them (#107).

import {
  orderSpecialists,
  specialistForKey,
} from '../../src/js/UI/lib/specialists';
import { Yield } from '../../src/js/UI/types';
import { splitYield } from '../../src/js/UI/lib/yieldMap';

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

const yields = (...entries: [string, number][]): Yield[] =>
  entries.map(([_, value]) => ({ _, value } as unknown as Yield));

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

if (failures.length) {
  process.stderr.write(
    `FAIL cityScreen\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS cityScreen (${checks} checks)`);
