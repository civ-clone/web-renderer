// The intelligence report (F3, #58) is worked out in the worker and sent as finished rows. This checks, with plain
//  data, what a row tells the player: full details only for a civilization the player holds an embassy with; just the
//  name of any other it has met; nothing about one it hasn't; foreign affairs at peace or at war, with a third party
//  the player hasn't met left unnamed (#59); and the leader's personality without the normal traits.

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
} from '../../src/js/Engine/lib/intelligence';
import { Peace, War } from '@civ-clone/library-diplomacy/Declarations';
import { BronzeWorking } from '@civ-clone/civ1-science/Advances';
import Civilization from '@civ-clone/core-civilization/Civilization';
import Embassy from '@civ-clone/base-unit-action-establish-embassy/Embassy';
import InteractionRegistry from '@civ-clone/core-diplomacy/InteractionRegistry';
import { JuliusCaesar } from '@civ-clone/civ1-civilization/Leaders';
import { Monarchy } from '@civ-clone/civ1-government/Governments';
import { Palace } from '@civ-clone/library-city/CityImprovements';
import Player from '@civ-clone/core-player/Player';
import PlayerRegistry from '@civ-clone/core-player/PlayerRegistry';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import TraitRegistry from '@civ-clone/core-civilization/TraitRegistry';
import registerTraits from '@civ-clone/civ1-civilization/registerTraits';

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
        complete: () => [Object.create(BronzeWorking.prototype)],
      }),
    },
    playerTreasuryRegistry: {
      getByPlayerAndType: () => ({ value: () => 250 }),
    },
    unitRegistry: { getByPlayer: () => new Array(7).fill(null) },
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

expect('the details an embassy gives', rows[0].details, {
  leader: 'JuliusCaesar',
  // Julius Caesar is NormalAggression, Expansionist and Civilized: the normal trait isn't listed.
  traits: ['Expansionist', 'Civilized'],
  capital: { name: 'Rome', civilization: 'Roman' },
  government: 'Monarchy',
  gold: 250,
  units: 7,
  foreignAffairs: [
    { civilization: 'Babylonian', atPeace: true },
    { civilization: null, atPeace: false },
  ],
  advances: ['BronzeWorking'],
});

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

if (failures.length > 0) {
  process.stderr.write(
    `FAIL intelligence (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS intelligence (${checks} checks)\n`);
