// The Military report (F2, #405) is worked out in the worker and sent as finished rows. This checks, with plain data
//  and the ruleset's own unit numbers, what it tells the player: each type of unit we have or are building, with its
//  A/D/M/V, how many are active and how many our cities are building, in the build list's order; and each type we have
//  lost, with how many, ours only.

import { Settlers, Trireme, Warrior } from '@civ-clone/civ1-unit/Units';
import {
  MilitaryDependencies,
  militaryReport,
} from '../../src/js/Engine/lib/military';
import { Barracks } from '@civ-clone/civ1-city-improvement/CityImprovements';
import Player from '@civ-clone/core-player/Player';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Unit from '@civ-clone/core-unit/Unit';
import UnitLossRegistry from '@civ-clone/core-unit/UnitLossRegistry';
import unitYield from '@civ-clone/civ1-unit/Rules/Unit/yield';

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

const rules = new RuleRegistry(),
  player = new Player(rules),
  rival = new Player(rules),
  unitLosses = new UnitLossRegistry();

rules.register(...unitYield(undefined, rules));

// What the report reads of a unit, a city and its build is only these, so plain stand-ins will do.
const unit = (UnitType: Function) => ({ sourceClass: () => UnitType }),
  building = (Item: Function | null) => ({
    building: () => (Item === null ? null : { item: () => Item }),
  }),
  [home, port, idle] = ['home', 'port', 'idle'],
  builds: { [city: string]: Function | null } = {
    home: Settlers,
    port: Settlers,
    idle: Barracks,
  };

unitLosses.record(player, Warrior);
unitLosses.record(player, Warrior);
// A transport's constructor takes a `TransportRegistry` too, so it isn't a `typeof Unit` to TypeScript.
unitLosses.record(rival, Trireme as unknown as typeof Unit);

const dependencies = {
  // Registry order, as a city's build list has it: Trireme before Warrior to show the report follows it.
  availableCityBuildItems: {
    entries: () => [Barracks, Settlers, Trireme, Warrior],
  },
  cities: {
    getByPlayer: (owner: Player) =>
      owner === player ? [home, port, idle] : [],
  },
  // Only by city: anything else finds nothing, as a wrong key would.
  cityBuilds: {
    getBy: (key: string, city: string) =>
      key === 'city' ? [building(builds[city])] : [],
  },
  rules,
  unitLosses,
  units: {
    getByPlayer: (owner: Player) =>
      owner === player
        ? [unit(Warrior), unit(Trireme), unit(Warrior)]
        : owner === rival
        ? [unit(Settlers)]
        : [],
  },
} as unknown as MilitaryDependencies;

const report = militaryReport(player, dependencies);

expect(
  'each type we have or are building, in the build list’s order, with its numbers and counts',
  report.status,
  [
    {
      unit: 'Settlers',
      stats: { attack: 0, defence: 1, movement: 1, visibility: 1 },
      active: 0,
      inProduction: 2,
    },
    {
      unit: 'Trireme',
      stats: { attack: 1, defence: 0, movement: 3, visibility: 1 },
      active: 1,
      inProduction: 0,
    },
    {
      unit: 'Warrior',
      stats: { attack: 1, defence: 1, movement: 1, visibility: 1 },
      active: 2,
      inProduction: 0,
    },
  ]
);

expect('each type we have lost, ours only', report.losses, [
  { unit: 'Warrior', lost: 2 },
]);

expect(
  'nothing for a player with no units, no cities and no losses',
  militaryReport(new Player(rules), dependencies),
  { status: [], losses: [] }
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL military (${failures.length} of ${checks} checks)\n  ${failures.join(
      '\n  '
    )}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS military (${checks} checks)\n`);
