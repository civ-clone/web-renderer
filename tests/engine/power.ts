// The arena's measures on hand-built inputs: v474.05's power ranking (`lib/power.ts`), with unit values from Civ1's
//  `BuildCost` rules; the Civilization Score's arithmetic (`lib/score.ts`); and the advance tiers Civ1's prerequisites
//  give (`lib/advanceTiers.ts`).

import * as Advances from '@civ-clone/civ1-science/Advances';
import {
  Battleship,
  Diplomat,
  Settlers,
  Warrior,
} from '@civ-clone/civ1-unit/Units';
import { advanceTiers, prerequisites, tiers } from './lib/advanceTiers';
import {
  power,
  powerAdvances,
  powerCitizens,
  powerGold,
  powerUnits,
  unitValue,
} from './lib/power';
import {
  score,
  scoreCitizens,
  scorePollution,
  scoreWonders,
} from './lib/score';
import Unit from '@civ-clone/core-unit/Unit';
import unitCostRules from '@civ-clone/civ1-unit/Rules/City/buildCost';
import Advance from '@civ-clone/core-science/Advance';
import Criterion from '@civ-clone/core-rule/Criterion';
import Effect from '@civ-clone/core-rule/Effect';
import Requirements from '@civ-clone/core-science/Rules/Requirements';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import requirementRules from '@civ-clone/civ1-science/Rules/Research/requirements';

const civ1 = new RuleRegistry();

civ1.register(...requirementRules(), ...unitCostRules());

const all = Object.values(Advances) as unknown as (typeof Advance)[];
const civ1Tiers = tiers(civ1, all);
const { Alphabet, Chivalry, CodeOfLaws, Feudalism, Monarchy, Pottery } =
  Advances as unknown as { [name: string]: typeof Advance };

const names = (list: (typeof Advance)[]): string =>
  list
    .map((AdvanceType) => AdvanceType.name)
    .sort()
    .join('+');

// A ruleset of three made-up advances, A needing nothing, B needing A, C needing A and B.
class A extends Advance {}
class B extends Advance {}
class C extends Advance {}

const made = new RuleRegistry();

(
  [
    [B, A],
    [C, A, B],
  ] as [typeof Advance, ...(typeof Advance)[]][]
).forEach(([Needing, ...needed]) =>
  made.register(
    new Requirements(
      new Criterion((Check: typeof Advance): boolean => Check === Needing),
      new Effect((Check: typeof Advance, known: Advance[]): boolean =>
        needed.every((Needed) =>
          known.some((advance) => advance instanceof Needed)
        )
      )
    )
  )
);

const madeTiers = tiers(made, [A, B, C]);

// A unit of `UnitType` for `powerUnits`, which only looks at its class: no constructor runs.
const unitLike = (UnitType: typeof Unit): Unit =>
  Object.create(UnitType.prototype);

const cases: [string, unknown, unknown][] = [
  ['Civ1 advances', all.length, 67],
  ['Alphabet needs', names(prerequisites(civ1, all, Alphabet)), ''],
  [
    'Chivalry needs',
    names(prerequisites(civ1, all, Chivalry)),
    'Feudalism+HorsebackRiding',
  ],
  [
    'Monarchy needs',
    names(prerequisites(civ1, all, Monarchy)),
    'CeremonialBurial+CodeOfLaws',
  ],
  ['Alphabet tier', civ1Tiers.get(Alphabet), 1],
  ['Pottery tier', civ1Tiers.get(Pottery), 1],
  ['Code of Laws tier', civ1Tiers.get(CodeOfLaws), 2],
  ['Monarchy tier', civ1Tiers.get(Monarchy), 3],
  ['Feudalism tier', civ1Tiers.get(Feudalism), 4],
  ['Chivalry tier', civ1Tiers.get(Chivalry), 5],
  [
    'advanceTiers, Alphabet to Chivalry',
    advanceTiers(civ1Tiers, [
      Alphabet,
      CodeOfLaws,
      Monarchy,
      Feudalism,
      Chivalry,
    ]),
    15,
  ],
  [
    'made-up A, B, C tiers',
    [A, B, C].map((T) => madeTiers.get(T)).join(','),
    '1,2,3',
  ],
  ['made-up C needs', names(prerequisites(made, [A, B, C], C)), 'A+B'],
  // Size 8: 2 happy, 3 content, 1 specialist, 2 unhappy: 2×2 + 3 + 1 = 8 + 2 − 2.
  ['citizens of a size-8 city', scoreCitizens(8, 2, 2), 8],
  ['citizens, all unhappy', scoreCitizens(6, 0, 6), 0],
  ['three Wonders', scoreWonders(3), 60],
  ['two polluted tiles', scorePollution(2), -20],
  ['score', score(8, 60, -20), 48],
  ['score never below 0', score(3, 0, scorePollution(1)), 0],
  // v474.05: coins / 32, truncated; 8 per citizen; 1 + advances gained since the start; tens of shields per unit.
  ['powerGold 63', powerGold(63), 1],
  ['powerGold 64', powerGold(64), 2],
  ['powerCitizens 14', powerCitizens(14), 112],
  ['powerAdvances with none gained', powerAdvances(0), 1],
  ['powerAdvances with 4 gained', powerAdvances(4), 5],
  ['Warrior value', unitValue(civ1, Warrior), 1],
  ['Settlers value', unitValue(civ1, Settlers), 4],
  ['Diplomat value', unitValue(civ1, Diplomat), 3],
  ['Battleship value', unitValue(civ1, Battleship), 16],
  [
    'powerUnits, two Warriors, Settlers and a Battleship',
    powerUnits(civ1, [Warrior, Warrior, Settlers, Battleship].map(unitLike)),
    22,
  ],
  ['power', power(true, 2, 112, 5, 22), 141],
  ['power out of the game', power(false, 2, 112, 5, 22), 0],
];

const failures = cases.filter(([, actual, expected]) => actual !== expected);

failures.forEach(([label, actual, expected]) =>
  console.error(`  FAIL ${label}: expected ${expected}, got ${actual}`)
);

if (failures.length > 0) {
  console.error(`FAIL power: ${failures.length} of ${cases.length}`);
  process.exit(1);
}

console.log(`PASS power (${cases.length} cases)`);
