// What units and advances need is data the game holds (#37): with every plugin loaded, `defaultGame.requirements` has an
//  entry for each of the unit build rules and advance research rules that `civ1-unit` and `civ1-science` register,
//  and each of those rules was made from its entry. The graph reads both ways: what Musketmen need, what Gunpowder leads
//  to, and that a Trireme, being a ship, needs a coastal city.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import { Musketman, Trireme } from '@civ-clone/civ1-unit/Units';
import Build from '@civ-clone/core-city-build/Rules/Build';
import { Gunpowder } from '@civ-clone/civ1-science/Advances';
import { Requirement } from '@civ-clone/core-requirement/Requirement';
import Requirements from '@civ-clone/core-science/Rules/Requirements';
import Rule from '@civ-clone/core-rule/Rule';
import { defaultGame } from '@civ-clone/core-game/defaultGame';

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

const check = (): void => {
  const { requirements, rules } = defaultGame,
    // The rules each package makes from its entries: every one of them, and nothing else, has an entry.
    derived = [
      ...rules
        .get(Build)
        .filter((rule: Rule) =>
          /^civ1-unit:city\/build\/(requires-advance|obsolete)\//.test(
            rule.id() ?? ''
          )
        ),
      ...rules
        .get(Requirements)
        .filter(
          (rule: Rule) =>
            rule.id() !== 'civ1-science:research/requirements/FutureTechnology'
        ),
    ],
    derivedIds = derived.map((rule: Rule): string | null => rule.id());

  expect(
    'how many rules are made from entries: 26 + 13 units, 60 advances',
    derived.length,
    99
  );
  expect(
    'each of those rules has an entry, and is the rule made from it',
    derived.filter(
      (rule: Rule): boolean =>
        requirements.getById(rule.id() ?? '') === null ||
        !requirements.rulesFor(rule.id()!).includes(rule)
    ).length,
    0
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
    'what Gunpowder leads to',
    ids(requirements.leadsTo(Gunpowder)).sort(),
    [
      'civ1-unit:city/build/requires-advance/Musketman',
      'civ1-unit:city/build/obsolete/Spearman',
      'civ1-unit:city/build/obsolete/Warrior',
      'civ1-science:research/requirements/Explosives',
      'civ1-science:research/requirements/Metallurgy',
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
