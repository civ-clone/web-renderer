// The intelligence report (F3, #58) is worked out in the worker and sent as finished rows. This checks, with plain
//  data, what a row tells the player: full details only for a civilization the player holds an embassy with; just the
//  name of any other it has met; nothing about one it hasn't; foreign affairs at peace or at war, with a third party
//  the player hasn't met left unnamed (#59); and the leader's personality without the normal traits. Without an
//  embassy, a row still has what the player knows of anyone it has met: the leader's name, whether we're at peace or
//  at war, and whether they hold an embassy with us (#419).

import {
  Babylonian,
  English,
  Greek,
  Roman,
  Zulu,
} from '@civ-clone/civ1-civilization/Civilizations';
import {
  Aggressive,
  Civilized,
  Expansionist,
  Friendly,
  Militaristic,
  Perfectionist,
} from '@civ-clone/civ1-civilization/Traits';
import {
  IntelligenceDependencies,
  intelligenceRows,
} from '@civ-clone/ui-worker-client/lib/intelligence';
import { Peace, War } from '@civ-clone/library-diplomacy/Declarations';
import {
  BronzeWorking,
  Monarchy as MonarchyAdvance,
} from '@civ-clone/civ1-science/Advances';
import Civilization from '@civ-clone/core-civilization/Civilization';
import Embassy from '@civ-clone/base-unit-action-establish-embassy/Embassy';
import InteractionRegistry from '@civ-clone/core-diplomacy/InteractionRegistry';
import {
  AlexanderTheGreat,
  JuliusCaesar,
} from '@civ-clone/civ1-civilization/Leaders';
import { Monarchy } from '@civ-clone/civ1-government/Governments';
import { Palace } from '@civ-clone/library-city/CityImprovements';
import Player from '@civ-clone/core-player/Player';
import PlayerRegistry from '@civ-clone/core-player/PlayerRegistry';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import TraitRegistry from '@civ-clone/core-civilization/TraitRegistry';
import { instance as turn } from '@civ-clone/core-turn-based-game/Turn';
import registerTraits from '@civ-clone/civ1-civilization/registerTraits';
import { Alliance, Ceasefire } from '@civ-clone/library-diplomacy/Declarations';
import {
  WorkerRules,
  setWorkerRules,
} from '@civ-clone/ui-worker-client/workerRules';
import {
  attitude,
  leaderTitle,
  reputation,
  treaty,
} from '@civ-clone/ui-rules-civ2/lib/relations';
import {
  attitude as attitudes,
  reputation as reputations,
} from '@civ-clone/civ2-diplomacy/lib/relations';
import Effect from '@civ-clone/core-rule/Effect';
import LeaderTitle from '@civ-clone/core-civilization/Rules/LeaderTitle';

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

const ruleRegistry = new RuleRegistry(),
  traitRegistry = new TraitRegistry(),
  interactionRegistry = new InteractionRegistry(),
  playerRegistry = new PlayerRegistry();

registerTraits(traitRegistry);

const player = (CivilizationType: new () => Civilization): Player => {
  const created = new Player(ruleRegistry);

  created.setCivilization(new CivilizationType());
  playerRegistry.register(created);

  return created;
};

// The reader, then a rival it has an embassy with, one it has met without one, one only the rival has met, and one
//  nobody has.
const reader = player(Babylonian),
  rival = player(Roman),
  metOnly = player(Greek),
  unmet = player(English);

player(Zulu);

rival.civilization().setLeader(new JuliusCaesar(traitRegistry));
metOnly.civilization().setLeader(new AlexanderTheGreat(traitRegistry));

interactionRegistry.register(
  new Embassy(reader, rival, ruleRegistry) as never,
  // One-way: the Greeks' embassy with the reader gives the reader nothing on them.
  new Embassy(metOnly, reader, ruleRegistry) as never,
  new Peace(rival, reader, ruleRegistry) as never,
  new War(rival, unmet, ruleRegistry) as never
);

// Everything about a civilization beyond the diplomacy above is read through these, so plain stand-ins will do.
const palace = Object.assign(Object.create(Palace.prototype), {
    destroyed: () => false,
  }),
  rome = { name: () => 'Rome', originalPlayer: () => rival },
  dependencies = {
    cityImprovementRegistry: { getByCity: () => [palace] },
    cityRegistry: {
      getByPlayer: (owner: Player) => (owner === rival ? [rome] : []),
    },
    interactionRegistry,
    playerGovernmentRegistry: {
      getByPlayer: () => ({
        current: () => Object.create(Monarchy.prototype),
      }),
    },
    playerRegistry,
    playerResearchRegistry: {
      getByPlayer: () => ({
        complete: () => [
          Object.create(BronzeWorking.prototype),
          // Its `type` is `MonarchyAdvance`, but the report's strings are keyed `Monarchy.name` (#373).
          Object.create(MonarchyAdvance.prototype),
        ],
      }),
    },
    playerTreasuryRegistry: {
      getByPlayerAndType: () => ({ value: () => 250 }),
    },
    unitRegistry: { getByPlayer: () => new Array(7).fill(null) },
    // Twenty years a turn from 4000 BCE.
    year: { value: (when: number) => -4000 + when * 20 },
  } as unknown as IntelligenceDependencies;

const rows = intelligenceRows(
  reader,
  (other) => [rival, metOnly].includes(other),
  dependencies
);

expect(
  'a row for each civilization met, in the order they joined, and none for the rest',
  rows.map((row) => row.civilization),
  ['Roman', 'Greek']
);

expect(
  'no details without an embassy, even one they hold with us',
  rows[1].details,
  null
);

expect(
  'what we know of anyone we have met: the leader, peace or war, and their embassy with us; under Civ1’s rules no title and no attitude',
  rows.map(({ leader, leaderTitle, treaty, attitude, theirEmbassy }) => ({
    leader,
    leaderTitle,
    treaty,
    attitude,
    theirEmbassy,
  })),
  [
    {
      leader: 'JuliusCaesar',
      leaderTitle: null,
      treaty: 'peace',
      attitude: null,
      theirEmbassy: false,
    },
    {
      leader: 'AlexanderTheGreat',
      leaderTitle: null,
      treaty: 'war',
      attitude: null,
      theirEmbassy: true,
    },
  ]
);

expect('the details an embassy gives', rows[0].details, {
  // Julius Caesar is NormalAggression, Expansionist and Civilized: the normal trait isn't listed.
  traits: ['Expansionist', 'Civilized'],
  capital: { name: 'Rome', civilization: 'Roman' },
  government: 'Monarchy',
  gold: 250,
  cities: 1,
  units: 7,
  foreignAffairs: [
    { civilization: 'Babylonian', treaty: 'peace' },
    { civilization: null, treaty: 'war' },
  ],
  advances: ['BronzeWorking', 'Monarchy'],
  reputation: null,
});

expect(
  'the year of our first dealings with each, or none where we have had none (met only by seeing a city)',
  intelligenceRows(
    reader,
    (other) => [rival, metOnly, unmet].includes(other),
    dependencies
  ).map(({ civilization, firstMet }) => ({ civilization, firstMet })),
  [
    { civilization: 'Roman', firstMet: -4000 + turn.value() * 20 },
    { civilization: 'Greek', firstMet: -4000 + turn.value() * 20 },
    { civilization: 'English', firstMet: null },
  ]
);

// The report's strings are keyed on these names (`IntelligenceReport.trait.*`).
expect(
  'each personality trait is sent under its own name',
  [
    Aggressive,
    Friendly,
    Expansionist,
    Perfectionist,
    Civilized,
    Militaristic,
  ].map((TraitType) => typeNameOf(TraitType)),
  [
    'Aggressive',
    'Friendly',
    'Expansionist',
    'Perfectionist',
    'Civilized',
    'Militaristic',
  ]
);

// Under Civ2's rules (M2d, #1007): the treaty between us has a ceasefire and an alliance, a row says how they feel
//  toward us and what their leader is called, and the embassy's details give their reputation.
setWorkerRules({ treaty, attitude, reputation, leaderTitle } as WorkerRules);

const civ2Interactions = new InteractionRegistry(),
  civ2Rules = new RuleRegistry(),
  civ2Dependencies = {
    ...dependencies,
    interactionRegistry: civ2Interactions,
    ruleRegistry: civ2Rules,
    turn,
  } as unknown as IntelligenceDependencies,
  relationRegistries = {
    interactionRegistry: civ2Interactions,
    ruleRegistry: civ2Rules,
    turn,
  };

civ2Interactions.register(
  new Embassy(reader, rival, civ2Rules) as never,
  new Ceasefire(rival, reader, civ2Rules) as never,
  new Alliance(rival, unmet, civ2Rules) as never
);
civ2Rules.register(
  new LeaderTitle(
    new Effect((leader: unknown, government: unknown) =>
      government instanceof Monarchy ? 'LeaderTitle.civ2.Monarchy' : undefined
    )
  )
);
attitudes(relationRegistries).set(rival, reader, 30);
reputations(relationRegistries).set(rival, 3);

const civ2Rows = intelligenceRows(
  reader,
  (other) => [rival, unmet].includes(other),
  civ2Dependencies
);

expect(
  'under Civ2’s rules, a row has the treaty (a ceasefire), how they feel toward us (30, the fourth band) and their leader’s title',
  civ2Rows.map(({ treaty, attitude, leaderTitle }) => ({
    treaty,
    attitude,
    leaderTitle,
  })),
  [
    {
      treaty: 'ceasefire',
      attitude: 3,
      leaderTitle: 'LeaderTitle.civ2.Monarchy',
    },
    // No leader set, so no title.
    { treaty: 'contact', attitude: null, leaderTitle: null },
  ]
);
expect(
  'and the embassy’s details their reputation, and their foreign affairs with each treaty',
  [civ2Rows[0]!.details?.reputation, civ2Rows[0]!.details?.foreignAffairs],
  [
    3,
    [
      { civilization: 'Babylonian', treaty: 'ceasefire' },
      { civilization: 'English', treaty: 'alliance' },
    ],
  ]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL intelligence (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS intelligence (${checks} checks)\n`);
