// Specialists and the city improvements that multiply them (#84).
//
// Each specialist gives 2 of its yield, and the ordinary +50% building
// modifiers take that to the values in Table 4-1 ("Elite Citizen Efficiency",
// book p46): 3 with a Marketplace (luxury, gold) or Library (science), and 4
// with a Bank or University as well.

import {
  Bank,
  Library,
  Marketplace,
  University,
} from '@civ-clone/civ1-city-improvement/CityImprovements';
import {
  Entertainer,
  Scientist,
  TaxCollector,
} from '@civ-clone/library-city/Specialists';
import { Gold, Luxuries, Research } from '@civ-clone/civ1-city/Yields';
import CityGrowthRegistry from '@civ-clone/core-city-growth/CityGrowthRegistry';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import CityImprovementRegistry from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import PlayerWorldRegistry from '@civ-clone/core-player-world/PlayerWorldRegistry';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Specialist from '@civ-clone/core-city/Specialist';
import SpecialistRegistry from '@civ-clone/core-city/SpecialistRegistry';
import TileImprovementRegistry from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import WorkedTileRegistry from '@civ-clone/core-city/WorkedTileRegistry';
import Yield from '@civ-clone/core-yield/Yield';
import cityYield from '@civ-clone/civ1-city/Rules/City/yield';
import { reduceYield } from '@civ-clone/core-yield/lib/reduceYields';
import setUpCity from '@civ-clone/civ1-city/tests/lib/setUpCity';
import yieldModifier from '@civ-clone/civ1-city-improvement/Rules/City/yield-modifier';

const cases: [
  typeof Specialist,
  typeof Yield,
  (typeof CityImprovement)[],
  number
][] = [
  [Entertainer, Luxuries, [], 2],
  [Entertainer, Luxuries, [Marketplace], 3],
  [Entertainer, Luxuries, [Marketplace, Bank], 4],
  [TaxCollector, Gold, [], 2],
  [TaxCollector, Gold, [Marketplace], 3],
  [TaxCollector, Gold, [Marketplace, Bank], 4],
  [Scientist, Research, [], 2],
  [Scientist, Research, [Library], 3],
  [Scientist, Research, [Library, University], 4],
  // A Library does nothing for an Entertainer, nor a Marketplace for a Scientist.
  [Entertainer, Luxuries, [Library, University], 2],
  [Scientist, Research, [Marketplace, Bank], 2],
];

const run = async (): Promise<number> => {
  let failures = 0;

  for (const [SpecialistType, YieldType, Improvements, expected] of cases) {
    const ruleRegistry = new RuleRegistry(),
      cityImprovementRegistry = new CityImprovementRegistry(),
      specialistRegistry = new SpecialistRegistry(),
      city = await setUpCity({
        ruleRegistry,
        cityGrowthRegistry: new CityGrowthRegistry(),
        playerWorldRegistry: new PlayerWorldRegistry(),
        tileImprovementRegistry: new TileImprovementRegistry(),
        workedTileRegistry: new WorkedTileRegistry(ruleRegistry),
      });

    ruleRegistry.register(
      // Only the specialists' own yields: the others need a government.
      ...cityYield(undefined, undefined, specialistRegistry).filter((rule) =>
        rule.id()?.startsWith('civ1-city:city/yield/specialist/')
      ),
      ...yieldModifier(cityImprovementRegistry)
    );

    specialistRegistry.register(new SpecialistType(city));
    cityImprovementRegistry.register(
      ...Improvements.map((Improvement) => new Improvement(city, ruleRegistry))
    );

    const actual = reduceYield(city.yields(), YieldType),
      label = `${SpecialistType.name} with ${
        Improvements.map((Improvement) => Improvement.name).join(' and ') ||
        'nothing'
      }`;

    if (actual !== expected) {
      failures++;

      console.error(
        `  FAIL ${label.padEnd(40)} ${actual} ${
          YieldType.name
        } (expected ${expected})`
      );

      continue;
    }

    console.log(`  ok   ${label.padEnd(40)} ${actual} ${YieldType.name}`);
  }

  return failures;
};

run().then((failures) => {
  if (failures > 0) {
    console.error(`FAIL specialists: ${failures} of ${cases.length}`);

    process.exit(1);
  }

  console.log(`PASS specialists (${cases.length} Table 4-1 values)`);
});
