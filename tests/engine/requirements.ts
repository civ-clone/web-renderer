// What the ruleset's things need is data the game holds (#37): with every plugin loaded, `defaultGame.requirements` has
//  an entry for each rule made from one (units, advances, Wonders, city improvements, governments, spaceship parts and
//  tile improvements), and each of those rules was made from its entry. The graph reads both ways: what Musketmen need,
//  what Gunpowder leads to, and that a Trireme, being a ship, needs a coastal city. Entries come in the order they were
//  registered. The page gets them with `getRequirements`, classes named as saves name them, and a city says which rules
//  refuse each item it can't build, by the ids the entries share.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import {
  BridgeBuilding,
  Gunpowder,
  Mysticism,
  Railroad,
} from '@civ-clone/civ1-science/Advances';
import { Irrigation } from '@civ-clone/civ1-world/TileImprovements';
import { Temple } from '@civ-clone/civ1-city-improvement/CityImprovements';
import { Oracle } from '@civ-clone/civ1-wonder/Wonders';
import Available from '@civ-clone/core-tile-improvement/Rules/Available';
import { Musketman, Trireme, Warrior } from '@civ-clone/civ1-unit/Units';
import Availability from '@civ-clone/core-government/Rules/Availability';
import Build from '@civ-clone/core-city-build/Rules/Build';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import Complete from '@civ-clone/core-science/Rules/Complete';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import { Requirement } from '@civ-clone/core-requirement/Requirement';
import Requirements from '@civ-clone/core-science/Rules/Requirements';
import Rule from '@civ-clone/core-rule/Rule';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import requirementsData from '../../src/js/Engine/lib/requirements';
import setUpCity from '@civ-clone/civ1-city/tests/lib/setUpCity';

const failures: string[] = [];
let finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
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
    process.stderr.write('FAIL requirements: stopped before its checks\n');
    process.exitCode = 1;
  }
});

const ids = (entries: Requirement[]): string[] =>
  entries.map((entry: Requirement): string => entry.id);

// The ids of the rules made from entries, by the prefixes the packages give them; hand-written rules have others.
const derivedId =
  /^civ1-(unit:city\/build\/(requires-advance|obsolete)|science:research\/requirements|wonder:(city\/build\/requires-(advance|wonder)|wonder\/obsolete)|city-improvement:city\/build\/(requires-advance|requires-improvement|excluded-by)|government:governments\/availability|spaceship:city\/build\/requires-(advance|wonder)|world:tile-improvement\/available)\//;

const check = async (): Promise<void> => {
  const { requirements, rules } = defaultGame,
    derived = [Build, Requirements, Complete, Availability, Available]
      .flatMap((RuleType) => rules.get(RuleType as typeof Rule))
      .filter(
        (rule: Rule): boolean =>
          derivedId.test(rule.id() ?? '') &&
          rule.id() !== 'civ1-science:research/requirements/FutureTechnology'
      ),
    derivedIds = derived.map((rule: Rule): string | null => rule.id());

  expect(
    'how many rules are made from entries: units 26 + 13, advances 60, Wonders 21 + 1 + 11, improvements 20 + 3 + 5, governments 5, spaceship parts 6 + 1, tile improvements 5',
    derived.length,
    26 + 13 + 60 + 21 + 1 + 11 + 20 + 3 + 5 + 5 + 6 + 1 + 5
  );
  expect(
    'each of those rules has an entry, and is the rule made from it',
    derived
      .filter(
        (rule: Rule): boolean =>
          requirements.getById(rule.id() ?? '') === null ||
          !requirements.rulesFor(rule.id()!).includes(rule)
      )
      .map((rule: Rule) => rule.id()),
    []
  );
  expect(
    'and every entry that makes a rule made one of those',
    requirements
      .entries()
      .filter(
        (entry: Requirement): boolean =>
          requirements.rulesFor(entry.id).length > 0
      )
      .map((entry: Requirement): string => entry.id)
      .filter((id: string): boolean => !derivedIds.includes(id)),
    []
  );

  expect(
    'what Musketmen need, are obsoleted by and are replaced by',
    ids(requirements.for(Musketman)),
    [
      'civ1-unit:city/build/requires-advance/Musketman',
      'civ1-unit:city/build/obsolete/Musketman',
      'civ1-unit:unit/replaced-by/Musketman',
    ]
  );
  expect(
    'what Gunpowder leads to, the Great Wall going obsolete included',
    ids(requirements.leadsTo(Gunpowder)).sort(),
    [
      'civ1-unit:city/build/requires-advance/Musketman',
      'civ1-unit:city/build/obsolete/Spearman',
      'civ1-unit:city/build/obsolete/Warrior',
      'civ1-science:research/requirements/Explosives',
      'civ1-science:research/requirements/Metallurgy',
      'civ1-wonder:wonder/obsolete/GreatWall',
    ].sort()
  );
  expect(
    'and that a Trireme, being a ship, needs a coastal city',
    requirements
      .for(Trireme)
      .map((entry: Requirement) => [
        entry.id,
        entry.targets.map((target: any): string => target.id ?? target.name),
      ]),
    [
      ['civ1-unit:city/build/requires-advance/Trireme', ['MapMaking']],
      ['civ1-unit:city/build/obsolete/Trireme', ['Navigation']],
      ['civ1-unit:city/build/naval-needs-coast', ['civ1-unit:coastal-city']],
      ['civ1-unit:unit/replaced-by/Trireme', ['Sail']],
    ]
  );

  // As the page gets them: every entry, classes named as saves name them (Railroad the advance is `RailroadAdvance`).
  const data = requirementsData();

  expect(
    'getRequirements answers with every entry',
    data.length,
    requirements.length
  );
  expect(
    'naming classes as saves do, and conditions by their ids',
    [
      data.find(
        ({ id }) => id === 'civ1-science:research/requirements/Railroad'
      ),
      data.find(({ id }) => id === 'civ1-unit:city/build/naval-needs-coast')
        ?.targets,
    ],
    [
      {
        id: 'civ1-science:research/requirements/Railroad',
        subject: (Railroad as unknown as { type: string }).type,
        relation: 'requires',
        targets: [{ class: 'BridgeBuilding' }, { class: 'SteamEngine' }],
        mode: 'all',
        range: 'player',
        where: null,
      },
      [{ condition: 'civ1-unit:coastal-city' }],
    ]
  );
  expect(
    "and where a tile improvement can go, as the terrains' keys",
    data.find(
      ({ id }) => id === 'civ1-world:tile-improvement/available/Irrigation'
    )?.where,
    ['Desert', 'Grassland', 'Hills', 'Plains', 'River']
  );

  // Tile improvements, the Worker's own conditions, and what makes things work better (step 10).
  expect(
    'what Bridge Building leads to: Railroad the advance, and a road on a River',
    ids(requirements.leadsTo(BridgeBuilding)).sort(),
    [
      'civ1-science:research/requirements/Railroad',
      'civ1-world:tile-improvement/available/bridge/Road',
    ]
  );
  expect(
    'Irrigation goes on five terrains, and a Worker needs water nearby to dig it',
    requirements
      .for(Irrigation)
      .map((entry: Requirement) => [
        entry.id,
        entry.targets.map((target: any): string => target.id ?? target.name),
      ])
      .sort(),
    [
      [
        'civ1-unit:unit/action/improvement/Irrigation/water-nearby',
        ['civ1-unit:water-nearby'],
      ],
      ['civ1-world:tile-improvement/available/Irrigation', []],
    ]
  );
  expect(
    'a Temple and the Oracle are enhanced by Mysticism',
    [
      ids(requirements.for(Temple, 'enhancedBy')),
      ids(requirements.for(Oracle, 'enhancedBy')),
      requirements
        .leadsTo(Mysticism, 'enhancedBy')
        .map((entry: Requirement): string => entry.subject.name)
        .sort(),
    ],
    [
      ['civ1-city-happiness:city/cost/enhanced-by/Temple'],
      ['civ1-wonder:wonder/enhanced-by/Oracle'],
      ['Oracle', 'Temple'],
    ]
  );

  // An inland city of a player who knows nothing yet: the build rules from every plugin, and what each refuses.
  const cityRules = new RuleRegistry(),
    city = await setUpCity({ ruleRegistry: cityRules }),
    research = new PlayerResearch(city.player(), defaultGame.advances, rules),
    cityBuild = new CityBuild(
      city,
      defaultGame.availableCityBuildItems,
      cityRules
    ),
    refusedBy = (Item: Function): (string | null)[] =>
      cityBuild
        .unavailable()
        .find(({ item }) => item === Item)
        ?.refusedBy.filter((id) => id !== null) ?? [];

  defaultGame.playerResearch.register(research);
  cityRules.register(...rules.get(Build));

  expect(
    "an inland city can't build Musketmen without Gunpowder, or a Trireme without Map Making or a coast",
    [refusedBy(Musketman), refusedBy(Trireme), refusedBy(Warrior)],
    [
      ['civ1-unit:city/build/requires-advance/Musketman'],
      [
        'civ1-unit:city/build/naval-needs-coast',
        'civ1-unit:city/build/requires-advance/Trireme',
      ],
      [],
    ]
  );

  research.addAdvance(Gunpowder);

  expect(
    'and once its player has Gunpowder, Musketmen are buildable and Warriors are obsolete',
    [refusedBy(Musketman), refusedBy(Warrior)],
    [[], ['civ1-unit:city/build/obsolete/Warrior']]
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL requirements (${failures.length})\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(
    `PASS requirements (${requirements.length} entries, ${derived.length} rules made from them)\n`
  );
};

import('../../src/js/plugins').then(check).catch((error) => {
  process.stderr.write(`FAIL requirements: ${error?.stack ?? error}\n`);
  process.exit(1);
});
