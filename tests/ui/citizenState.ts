// The citizens the city screen and the Happiness report draw match the ones
// the engine counts when it decides disorder and celebration (#269).

import Happiness from '@civ-clone/base-city-yield-happiness/Happiness';
import Unhappiness from '@civ-clone/base-city-yield-unhappiness/Unhappiness';
import { calculateCitizenState } from '@civ-clone/civ1-city-happiness/lib/calculateCitizenState';
import { citizenState } from '../../src/js/UI/lib/citizenState';

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

// The engine's function, given just enough of a city to read its size and
// specialists.
const engineState = (
  size: number,
  happiness: number,
  unhappiness: number,
  specialists: number
) => {
  const city = {};

  return calculateCitizenState(
    { city: () => city, size: () => size } as any,
    [new Happiness(happiness), new Unhappiness(unhappiness)],
    { getByCity: () => new Array(specialists).fill(null) } as any
  );
};

expect(
  "size 2, both unhappy, 1 Happiness and an Entertainer: the Entertainer's luxury calms the citizen left working",
  citizenState(2, 1, 2, 1),
  [1]
);

for (let size = 1; size <= 12; size++) {
  for (let happiness = 0; happiness <= 14; happiness++) {
    for (let unhappiness = 0; unhappiness <= 14; unhappiness++) {
      for (let specialists = 0; specialists <= size; specialists++) {
        expect(
          `size ${size}, ${happiness} Happiness, ${unhappiness} Unhappiness, ${specialists} specialists`,
          citizenState(size, happiness, unhappiness, specialists),
          engineState(size, happiness, unhappiness, specialists)
        );
      }
    }
  }
}

if (failures.length) {
  process.stderr.write(
    `FAIL citizenState (${failures.length} of ${checks})\n${failures
      .slice(0, 10)
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS citizenState (${checks} checks)`);
