// The soak's and the arena's counts (`lib/counters`, M2e) move when what they count happens: each treaty in its own
//  bucket (an `Alliance` is a `Peace` too, and must count as an alliance only), a government change after the player's
//  first, a city taken by the barbarians, and each event in the counters' tables. Most of these never happen in a short
//  soak, so this makes each happen by hand.

import Alliance from '@civ-clone/base-diplomacy-declaration-alliance/Alliance';
import Barbarian from '@civ-clone/base-civilization-barbarian/Barbarian';
import Ceasefire from '@civ-clone/base-diplomacy-declaration-ceasefire/Ceasefire';
import Peace from '@civ-clone/base-diplomacy-declaration-peace/Peace';
import Government from '@civ-clone/core-government/Government';
import Player from '@civ-clone/core-player/Player';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import War from '@civ-clone/base-diplomacy-declaration-war/War';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
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

const counting = startCounting(),
  first = new Player(),
  second = new Player(),
  barbarians = new Player();

playerRegistryInstance.register(first, second);

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

interactionRegistryInstance.register(
  new Ceasefire(first, second),
  new Peace(first, second),
  new Alliance(first, second),
  new War(first, second)
);

engine.emit('city:captured', {}, barbarians, first);
engine.emit('barbarians:ransom', second, null, 100);
[
  'barbarians:raiders-at-sea',
  'barbarians:uprising',
  'player:civil-war',
  'world:global-warming',
].forEach((event) => engine.emit(event, first));
engine.emit('player:respawned', second, null);

const report = counting.report(),
  of = (player: Player) => report.players.find(({ id }) => id === player.id())!;

expect(
  'each treaty in its own bucket, for each of its players',
  [of(first).treaties, of(second).treaties],
  [
    { ceasefire: 1, peace: 1, alliance: 1, war: 1 },
    { ceasefire: 1, peace: 1, alliance: 1, war: 1 },
  ]
);
expect(
  "the game's treaties, each once",
  [
    report.game.ceasefire,
    report.game.peace,
    report.game.alliance,
    report.game.war,
    report.game.alliancesFormed,
  ],
  [1, 1, 1, 1, 1]
);
expect(
  'government changes after the first turn, and revolutions into Anarchy',
  [of(first).governmentChanges, of(first).revolutions],
  [2, 1]
);
expect(
  'cities taken by the barbarians, for the player and the game',
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
  [
    report.game.barbarianRaidsAtSea,
    report.game.barbarianUprisings,
    report.game.civilWars,
    report.game.globalWarmings,
    report.game.respawns,
    of(second).respawned,
  ],
  [1, 1, 1, 1, 1, 1]
);

if (failures.length > 0) {
  process.stderr.write(`FAIL counters\n${failures.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`PASS counters (${checks} checks)\n`);
process.exit(0);
