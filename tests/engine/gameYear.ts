// The displayed year runs on through every era of the calendar without a jump
// (#74).
//
// Civ1 counts 250 turns of 20 years to 1000 AD, then 50 turns each of 10, 5
// and 2 years, then 1 year a turn from 1850 AD. `civ1-game-year` used to carry
// the wrong offset into each era after the first, so turn 252 showed 2010 AD.

import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Year from '@civ-clone/core-game-year/Rules/Year';
import getRules from '@civ-clone/civ1-game-year/Rules/Turn/year';

const rules = new RuleRegistry();

rules.register(...getRules());

const year = (turn: number): number => {
    const years = rules.process(Year, turn);

    if (years.length !== 1) {
      throw new Error(`turn ${turn}: expected one year, got ${years.length}`);
    }

    return years[0];
  },
  step = (turn: number): number =>
    turn <= 250 ? 20 : turn <= 300 ? 10 : turn <= 350 ? 5 : turn <= 400 ? 2 : 1,
  expected: [number, number][] = [
    [1, -4000],
    [251, 1000],
    [252, 1010],
    [301, 1500],
    [302, 1505],
    [351, 1750],
    [352, 1752],
    [401, 1850],
    [402, 1851],
  ],
  failures: string[] = [];

expected.forEach(([turn, value]) => {
  if (year(turn) !== value) {
    failures.push(`turn ${turn}: expected ${value}, got ${year(turn)}`);
  }
});

for (let turn = 2; turn <= 500; turn++) {
  if (year(turn) - year(turn - 1) !== step(turn - 1)) {
    failures.push(
      `turn ${turn}: ${year(turn - 1)} -> ${year(
        turn
      )}, expected a step of ${step(turn - 1)}`
    );
  }
}

if (failures.length > 0) {
  console.error(`FAIL gameYear:\n  ${failures.slice(0, 10).join('\n  ')}`);

  process.exit(1);
}

console.log('PASS gameYear (turns 1-500 run on without a jump)');
