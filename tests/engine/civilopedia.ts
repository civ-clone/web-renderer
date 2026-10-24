// The Civilopedia's entries (#183) come from the engine: with every plugin loaded, every class the requirements (#37)
//  name has an entry, keyed as saves key it, so Railroad the advance and the Railroad tile improvement are two. Each
//  entry says something. Musketmen need Gunpowder, go obsolete with Conscription, give way to Riflemen, and are 2/3/1
//  for 30 shields, all read from the ruleset's rules. A Trireme needs a coastal city through `Naval`, the registry's
//  own walk. And a city says which requirement entries refuse what it can't build, for its own player only. Its build
//  list comes in sections, units, improvements, spaceship parts then Wonders, with a unit's numbers on its line
//  (#381, #432).

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import { BridgeBuilding, Gunpowder } from '@civ-clone/civ1-science/Advances';
import { Musketman } from '@civ-clone/civ1-unit/Units';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Build from '@civ-clone/core-city-build/Rules/Build';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import civilopediaData, {
  CivilopediaEntry,
  unavailableBuildItems,
} from '../../src/js/Engine/lib/civilopedia';
import requirementsData from '../../src/js/Engine/lib/requirements';
import {
  cityBuildAvailable,
  registerRequests,
} from '../../src/js/Engine/Client/requests';
import { inBuildListOrder } from '../../src/js/Engine/lib/buildList';
import Player from '@civ-clone/core-player/Player';
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
    process.stderr.write('FAIL civilopedia: stopped before its checks\n');
    process.exitCode = 1;
  }
});

const check = async (): Promise<void> => {
  const entries = civilopediaData(),
    requirements = requirementsData(),
    byKey = new Map(entries.map((entry) => [entry.key, entry])),
    entry = (key: string): CivilopediaEntry | undefined => byKey.get(key),
    // Base classes some entries are about, which have no entry of their own.
    baseClasses = ['CityImprovement', 'Naval', 'Part'];

  expect('every entry has a key of its own', entries.length, byKey.size);
  expect(
    'every class the requirements name has an entry, bar the base classes they apply through',
    Array.from(
      new Set(
        requirements.flatMap((requirement) => [
          requirement.subject,
          ...requirement.targets.flatMap((target) =>
            'class' in target ? [target.class] : []
          ),
          ...(requirement.where ?? []),
        ])
      )
    ).filter((key) => !byKey.has(key) && !baseClasses.includes(key)),
    []
  );
  // Bar four that no requirement entry describes yet, which the page says it knows nothing more about: Future
  //  Technology's need for every other advance is a hand-written rule, Anarchy needs nothing, Pollution isn't built,
  //  and nothing is built on Ocean.
  expect(
    'and every entry says something: a requirement, something it leads to, numbers, a cost, or tile improvements that go on it',
    entries
      .filter(
        (entry) =>
          entry.requires.length === 0 &&
          entry.leadsTo.length === 0 &&
          entry.stats === null &&
          entry.cost === null &&
          !requirements.some((requirement) =>
            requirement.where?.includes(entry.key)
          )
      )
      .map((entry) => entry.key),
    ['FutureTechnology', 'Anarchy', 'Pollution', 'Ocean']
  );
  expect(
    'each section has entries',
    [
      'advance',
      'improvement',
      'wonder',
      'unit',
      'government',
      'spaceship',
      'tileImprovement',
      'terrain',
    ].filter((kind) => !entries.some((entry) => entry.kind === kind)),
    []
  );

  expect('Musketmen', entry('Musketman'), {
    key: 'Musketman',
    name: 'Musketman',
    kind: 'unit',
    requires: [
      'civ1-unit:city/build/requires-advance/Musketman',
      'civ1-unit:city/build/obsolete/Musketman',
      'civ1-unit:unit/replaced-by/Musketman',
    ],
    leadsTo: [
      'civ1-unit:unit/replaced-by/Spearman',
      'civ1-unit:unit/replaced-by/Warrior',
    ],
    cost: 30,
    stats: { attack: 2, defence: 3, movement: 1, visibility: 1 },
  });
  expect(
    'a Trireme needs a coastal city, through Naval',
    entry('Trireme')?.requires.includes(
      'civ1-unit:city/build/naval-needs-coast'
    ),
    true
  );
  expect(
    'Railroad the advance and the Railroad tile improvement are two entries',
    [
      entry('RailroadAdvance')?.kind,
      entry('RailroadAdvance')?.name,
      entry('Railroad')?.kind,
    ],
    ['advance', 'Railroad', 'tileImprovement']
  );
  expect(
    'Bridge Building leads to both',
    entry((BridgeBuilding as unknown as { name: string }).name)?.leadsTo.sort(),
    [
      'civ1-science:research/requirements/Railroad',
      'civ1-world:tile-improvement/available/bridge/Road',
    ]
  );
  expect(
    'the Pyramids go obsolete, and a Wonder costs what it costs',
    [
      entry('Pyramids')?.requires.some((id) => id.includes('obsolete')),
      typeof entry('Pyramids')?.cost,
    ],
    [true, 'number']
  );
  expect(
    'what a city can build has a cost; advances, governments, tile improvements and terrain have none',
    entries
      .filter((entry) =>
        ['unit', 'improvement', 'wonder', 'spaceship'].includes(entry.kind)
          ? entry.cost === null
          : entry.cost !== null
      )
      .map((entry) => entry.key),
    []
  );

  // An inland city of a player who knows nothing yet.
  const cityRules = new RuleRegistry(),
    city = await setUpCity({ ruleRegistry: cityRules }),
    research = new PlayerResearch(
      city.player(),
      defaultGame.advances,
      defaultGame.rules
    ),
    cityBuild = new CityBuild(
      city,
      defaultGame.availableCityBuildItems,
      cityRules
    );

  defaultGame.playerResearch.register(research);
  cityRules.register(...defaultGame.rules.get(Build));

  const musketmen = () =>
    unavailableBuildItems(cityBuild).find(
      (item) => item.name === (Musketman as unknown as { name: string }).name
    );

  expect(
    'an inland city can’t build Musketmen without Gunpowder',
    musketmen(),
    {
      key: 'Musketman',
      name: 'Musketman',
      refusedBy: ['civ1-unit:city/build/requires-advance/Musketman'],
    }
  );
  expect(
    'and every reason it gives is a rule’s id',
    unavailableBuildItems(cityBuild).every((item) =>
      item.refusedBy.every((id) => typeof id === 'string')
    ),
    true
  );

  // As the page asks for it: its own city's answer, and nothing for a rival's.
  const asked = (player: Player): unknown[] => {
    const receivers: { [channel: string]: (data: any, meta: any) => void } = {},
      replies: unknown[] = [];

    registerRequests(
      {
        receive: (channel: string, handler: (data: any, meta: any) => void) => {
          receivers[channel] = handler;

          return () => {};
        },
        reply: (channel: string, value: unknown) => replies.push(value),
        send: () => {},
      } as any,
      {
        player: () => player,
        cityBuilds: { getBy: () => [cityBuild] },
      } as any
    );

    receivers.cityBuildUnavailable(cityBuild.id(), { id: 1 });

    return replies;
  };

  expect(
    'cityBuildUnavailable answers for the city’s own player, and with nothing for anyone else',
    [
      (asked(city.player())[0] as any[]).some(
        (item) => item.key === 'Musketman'
      ),
      asked(new Player()),
    ],
    [true, [[]]]
  );

  // Given in registry order, Wonders first, as a city's build list was before #432.
  const buildable = (name: string) =>
    (defaultGame.availableCityBuildItems.entries() as Function[]).find(
      (Item) => Item.name === name
    )!;

  expect(
    'the build list is in sections, each in the order it was given in',
    inBuildListOrder(
      ['Pyramids', 'Musketman', 'Barracks', 'Structural', 'Warrior', 'Temple'],
      buildable
    ),
    ['Musketman', 'Warrior', 'Barracks', 'Temple', 'Structural', 'Pyramids']
  );

  const available = cityBuildAvailable(
      () => (object: any) => object,
      cityBuild,
      defaultGame.rules
    ),
    availableItems = (available.hierarchy as { '#ref': string }[]).map(
      ({ '#ref': id }) => available.objects[id]
    ),
    groups = availableItems.map((item) => item.group);

  expect(
    'a city’s build list has each item’s section, units first',
    [
      groups.length > 0,
      groups.every((group) =>
        ['unit', 'improvement', 'spaceship', 'wonder'].includes(group)
      ),
      groups.every(
        (group, index) =>
          index === 0 ||
          ['unit', 'improvement', 'spaceship', 'wonder'].indexOf(group) >=
            ['unit', 'improvement', 'spaceship', 'wonder'].indexOf(
              groups[index - 1]
            )
      ),
      groups[0],
    ],
    [true, true, true, 'unit']
  );
  expect(
    'and a unit’s numbers, and none for anything else',
    availableItems
      .filter((item) => ['Warrior', 'Barracks'].includes(item.item._))
      .map((item) => [item.item._, item.stats]),
    [
      ['Warrior', { attack: 1, defence: 1, movement: 1, visibility: 1 }],
      ['Barracks', null],
    ]
  );

  research.addAdvance(Gunpowder);

  expect('once its player has Gunpowder, it can', musketmen(), undefined);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL civilopedia (${failures.length})\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civilopedia (${entries.length} entries)\n`);
};

import('../../src/js/plugins').then(check).catch((error) => {
  process.stderr.write(`FAIL civilopedia: ${error?.stack ?? error}\n`);
  process.exit(1);
});
