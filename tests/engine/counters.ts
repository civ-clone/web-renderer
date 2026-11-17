// The soak's and the arena's counts (`lib/counters`, M2e) move when what they count happens. Most of these never
//  happen in a short soak, so this makes each happen:
//
// - treaties through base-diplomacy's own `makeCeasefire`, `makePeace`, `makeAlliance` and `declareWar`, which
//   register real declarations: each counted once for the game and once for each of its players, an alliance as an
//   alliance only (its class extends `Peace`), and the peace `makeAlliance` makes first, where there was none, not
//   counted at all, while the registry still holds every declaration as it would uncounted;
// - a government change after the player's first turn, and a revolution into Anarchy;
// - units a city builds, by kind, from stand-in units of each type and trait;
// - Wonders and Apollo, the space race, barbarians, huts, meltdowns, collapses and the rest of the events' tables.

import Air from '@civ-clone/base-unit-type-air/Air';
import Barbarian from '@civ-clone/base-civilization-barbarian/Barbarian';
import Detonates from '@civ-clone/base-unit-trait-detonates/Detonates';
import DiplomaticMissions from '@civ-clone/base-unit-trait-diplomatic-missions/DiplomaticMissions';
import Government from '@civ-clone/core-government/Government';
import Naval from '@civ-clone/base-unit-type-naval/Naval';
import Player from '@civ-clone/core-player/Player';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import SingleUse from '@civ-clone/base-unit-trait-single-use/SingleUse';
import Spaceship from '@civ-clone/core-spaceship/Spaceship';
import TradeMissions from '@civ-clone/base-unit-trait-trade-missions/TradeMissions';
import Unit from '@civ-clone/core-unit/Unit';
import {
  TreatyLevel,
  treatyLevel,
} from '@civ-clone/base-diplomacy/lib/treatyLevel';
import {
  declareWar,
  makeAlliance,
  makeCeasefire,
  makePeace,
} from '@civ-clone/base-diplomacy/lib/declareWar';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as spaceshipRegistryInstance } from '@civ-clone/core-spaceship/SpaceshipRegistry';
import startCounting from './lib/counters';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}: expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actual)}`
    );
  }
};

class Anarchy extends Government {}
class Monarchy extends Government {}
// What `wonder:built` and a hut name, by class.
class ApolloProgram {}
class Pyramids {}
class Barbarians {}

// A unit of `Type` whose rule set gives it `traits`, made without a tile or player: only its class and traits are read.
const unitOf = (Type: typeof Unit, ...traits: unknown[]): Unit =>
  Object.assign(Object.create(Type.prototype), {
    hasTrait: (Trait: unknown): boolean => traits.includes(Trait),
  });

// A spaceship of `player`'s, launched and landed as asked.
const spaceshipOf = (
  player: Player,
  launched: boolean,
  successful: boolean
): Spaceship =>
  Object.assign(Object.create(Spaceship.prototype), {
    player: () => player,
    launched: () => (launched ? 400 : false),
    successful: () => (successful ? true : null),
  });

(async (): Promise<void> => {
  const counting = startCounting(),
    first = new Player(),
    second = new Player(),
    third = new Player(),
    fourth = new Player(),
    barbarians = new Player(),
    dependencies = {
      interactionRegistry: interactionRegistryInstance,
      ruleRegistry: ruleRegistryInstance,
    } as any,
    cityOf = (player: Player) => ({ player: () => player }),
    buildIn = (player: Player, built: unknown): void =>
      engine.emit(
        'city:building-complete',
        { city: () => cityOf(player) },
        built
      );

  playerRegistryInstance.register(first, second, third, fourth);

  // The barbarians' player, by its civilization, as `isBarbarian` reads it.
  barbarians.setCivilization(new Barbarian());

  // Before any turn: a player's first government isn't a change.
  const government = new PlayerGovernment(first);

  playerGovernmentRegistryInstance.register(government);
  government.set(new Monarchy());
  engine.emit('player:government:changed', first, new Monarchy());
  engine.emit('turn:start', 1);
  engine.emit('player:government:changed', first, new Anarchy());
  engine.emit('player:government:changed', first, new Monarchy());

  // Treaties, through the engine's own diplomacy. Each agreement is its own call, as the AI's negotiations yield between
  //  steps: a peace is counted once the call that made it is over.
  makeCeasefire(dependencies, first, second);
  makePeace(dependencies, first, second);
  await Promise.resolve();
  // A peace already stands, so only the alliance is made.
  makeAlliance(dependencies, first, second);
  await Promise.resolve();
  // No peace yet: `makeAlliance` makes one, then the alliance, which is the one treaty.
  makeAlliance(dependencies, first, third);
  await Promise.resolve();
  // A peace and then an alliance in one call, as civ2-diplomacy's turn start makes an alliance: the one treaty too.
  makePeace(dependencies, second, fourth);
  makeAlliance(dependencies, second, fourth);
  await Promise.resolve();
  declareWar(dependencies, second, third);

  const between = (player: Player, other: Player): string[] =>
    interactionRegistryInstance
      .getByPlayers(player, other)
      .map((interaction) => interaction.constructor.name);

  expect(
    'the registry holds every declaration made, as it would uncounted',
    [
      between(first, second),
      between(first, third),
      between(second, fourth),
      between(second, third),
    ],
    [
      ['Ceasefire', 'Peace', 'Alliance'],
      ['Peace', 'Alliance'],
      ['Peace', 'Alliance'],
      ['War'],
    ]
  );
  expect(
    'and the diplomacy reads them as it would',
    [
      treatyLevel(dependencies, first, second),
      treatyLevel(dependencies, first, third),
      treatyLevel(dependencies, second, third),
    ],
    [TreatyLevel.Alliance, TreatyLevel.Alliance, TreatyLevel.War]
  );

  // Units built, by kind: a fighter, a cruise missile, a nuclear missile, a Civ1-style Nuclear (which detonates but
  //  isn't spent by its attack), a ship, a Caravan and a Diplomat; and an improvement, which isn't a unit.
  buildIn(first, unitOf(Air));
  buildIn(first, unitOf(Air, SingleUse));
  buildIn(first, unitOf(Air, SingleUse, Detonates));
  buildIn(first, unitOf(Air, Detonates));
  buildIn(first, unitOf(Naval));
  buildIn(first, unitOf(Unit, TradeMissions));
  buildIn(first, unitOf(Unit, DiplomaticMissions));
  buildIn(first, {});

  engine.emit('wonder:built', new Pyramids(), cityOf(second));
  engine.emit('wonder:built', new ApolloProgram(), cityOf(second));

  engine.emit('player:spaceship:part-built', third);
  engine.emit('player:spaceship:part-built', third);
  engine.emit('player:spaceship:landed', third);
  spaceshipRegistryInstance.register(
    spaceshipOf(third, true, true),
    spaceshipOf(third, true, false),
    spaceshipOf(second, false, false)
  );

  engine.emit('city:captured', {}, barbarians, first);
  engine.emit('city:captured', {}, second, first);
  engine.emit('barbarians:ransom', second, null, 100);
  engine.emit('goody-hut:action-performed', {}, new Barbarians());
  engine.emit('goody-hut:action-performed', {}, {});
  [
    'barbarians:raiders-at-sea',
    'barbarians:uprising',
    'barbarians:landed',
    'player:civil-war',
    'world:global-warming',
    'city:nuclear-meltdown',
  ].forEach((event) => engine.emit(event, first));
  engine.emit('player:government:collapsed', second, {});
  engine.emit('player:respawned', second, null);

  const report = counting.report(),
    of = (player: Player) =>
      report.players.find(({ id }) => id === player.id())!;

  expect(
    'each treaty in its own bucket, for each of its players',
    [
      of(first).treaties,
      of(second).treaties,
      of(third).treaties,
      of(fourth).treaties,
    ],
    [
      { ceasefire: 1, peace: 1, alliance: 2, war: 0 },
      { ceasefire: 1, peace: 1, alliance: 2, war: 1 },
      { ceasefire: 0, peace: 0, alliance: 1, war: 1 },
      { ceasefire: 0, peace: 0, alliance: 1, war: 0 },
    ]
  );
  expect(
    "the game's treaties, each once",
    [
      report.game.ceasefire,
      report.game.peace,
      report.game.alliance,
      report.game.war,
    ],
    [1, 1, 3, 1]
  );
  expect(
    'government changes after the first turn, revolutions into Anarchy, and a collapse',
    [
      of(first).governmentChanges,
      of(first).revolutions,
      of(second).governmentCollapses,
    ],
    [2, 1, 1]
  );
  expect(
    'units built, in all and by kind',
    [of(first).unitsBuilt, of(first).unitsBuiltByKind],
    [7, { air: 4, naval: 1, missile: 2, nuclear: 2, trade: 1, agent: 1 }]
  );
  expect(
    'Wonders built, and Apollo',
    [of(second).wondersBuilt, of(second).apolloBuilt],
    [2, 1]
  );
  expect(
    'the space race: parts and arrivals by event, launches and arrivals by ship',
    [
      of(third).spaceshipParts,
      of(third).spaceshipArrivals,
      of(third).spaceshipsLaunched,
      of(third).spaceshipsArrived,
      of(second).spaceshipsLaunched,
    ],
    [2, 1, 2, 1, 0]
  );
  expect(
    'cities taken by the barbarians only, for the player and the game',
    [of(first).citiesTakenByBarbarians, report.game.citiesTakenByBarbarians],
    [1, 1]
  );
  expect(
    'a ransom, for the player and the game',
    [of(second).ransomsReceived, report.game.barbarianRansoms],
    [1, 1]
  );
  expect(
    "the game's events",
    {
      barbarianRaidsAtSea: report.game.barbarianRaidsAtSea,
      barbarianUprisings: report.game.barbarianUprisings,
      barbarianLandings: report.game.barbarianLandings,
      barbarianHuts: report.game.barbarianHuts,
      civilWars: report.game.civilWars,
      globalWarmings: report.game.globalWarmings,
      nuclearMeltdowns: report.game.nuclearMeltdowns,
      respawns: report.game.respawns,
      respawned: of(second).respawned,
    },
    {
      barbarianRaidsAtSea: 1,
      barbarianUprisings: 1,
      barbarianLandings: 1,
      barbarianHuts: 1,
      civilWars: 1,
      globalWarmings: 1,
      nuclearMeltdowns: 1,
      respawns: 1,
      respawned: 1,
    }
  );

  if (failures.length > 0) {
    process.stderr.write(`FAIL counters\n${failures.join('\n')}\n`);
    process.exit(1);
  }

  process.stdout.write(`PASS counters (${checks} checks)\n`);
  process.exit(0);
})().catch((error) => {
  process.stderr.write(`FAIL counters\n${error?.stack ?? error}\n`);
  process.exit(1);
});
