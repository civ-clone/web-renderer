// The arena's rating (`lib/rating.ts`), on hand-built inputs: what Civ1's rules charge for advances, the tiers its
//  prerequisites give, and the one `floor` over the treasury and the research.

import * as Advances from '@civ-clone/civ1-science/Advances';
import {
  advanceTiers,
  prerequisites,
  rating,
  ratingAdvances,
  ratingGold,
  researchInvested,
  tiers,
} from './lib/rating';
import Advance from '@civ-clone/core-science/Advance';
import Criterion from '@civ-clone/core-rule/Criterion';
import Effect from '@civ-clone/core-rule/Effect';
import Requirements from '@civ-clone/core-science/Rules/Requirements';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import costRules from '@civ-clone/civ1-science/Rules/Research/cost';
import requirementRules from '@civ-clone/civ1-science/Rules/Research/requirements';

const civ1 = new RuleRegistry();

civ1.register(...costRules(), ...requirementRules());

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
  // Civ1 charges (advances known + 1) × 6: 6, 12, 18...
  ['research for none', researchInvested(civ1, [], 0), 0],
  ['research for one', researchInvested(civ1, [Pottery], 0), 6],
  [
    'research for two, 5 in progress',
    researchInvested(civ1, [Pottery, Alphabet], 5),
    23,
  ],
  ['research for ten', researchInvested(civ1, all.slice(0, 10), 0), 330],
  ['ratingGold 99', ratingGold(99), 9],
  ['ratingAdvances 330', ratingAdvances(330), 33],
  // One floor over both: 9 gold and 1 bulb rate as 10 gold does.
  ['rating 9 gold + 1 bulb', rating(0, 9, 1), rating(0, 10, 0)],
  ['rating 17 + 25 gold + 330 bulbs', rating(17, 25, 330), 52],
];

const failures = cases.filter(([, actual, expected]) => actual !== expected);

failures.forEach(([label, actual, expected]) =>
  console.error(`  FAIL ${label}: expected ${expected}, got ${actual}`)
);

if (failures.length > 0) {
  console.error(`FAIL rating: ${failures.length} of ${cases.length}`);
  process.exit(1);
}

console.log(`PASS rating (${cases.length} cases)`);
