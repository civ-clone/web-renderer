// A held build (#959): a city of size 1 doesn't complete Settlers until it is size 2, and the page is told why with the
//  build's `held`, the ids of the rules holding the item, from the moment it is chosen. With the plugins the game is
//  built with and the rule sets as they start, through a human `DataTransferClient`, checking what the page is sent:
//  T1. a new city of size 1 is offered Settlers with the id of `civ1-enhanced`'s rule beside them in its build list
//      (#970), and nothing else with any; it chooses them: `held` names that rule with shields still to pay (it will
//      wait), and again once they are paid for (it is waiting), with nothing to buy; more Settlers queued behind them
//      are sent with the same id, and a queued Warrior with none (`queueHeld`);
//  T2. the turn after, still waiting: the city is there at size 1, no Settlers, the shields still adding up;
//  T3. the turn it grows to size 2 it completes them, and is size 1 again;
//  T4. a city that grows before its Settlers are paid for is no longer held, and its build list says none would hold
//      them.
// Then, with "Settlers wait for size 2" unticked, the original's: held on Chieftain by `civ1-unit`'s rule (which the
//  build list and the queue name too), and on King a size-1 city with others is removed by its Settlers, which stand on its square.
// And, on the same game, "Bribed and defecting units stay veteran" (#960): off to start with, then ticked.
//
// This is also the only guard against two copies of `@civ-clone/core-city-build` being installed: `CityBuild#held()`
//  finds the `Hold` rules by their class, so with a second copy the plugins' rules are made from the other `Hold`,
//  nothing is ever held, and nothing else would notice.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import { Chieftain, King } from '@civ-clone/civ1-difficulty/Difficulties';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '@civ-clone/ui-worker-client/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import { Production } from '@civ-clone/civ1-world/Yields';
import {
  DEFECTORS_STAY_VETERAN,
  SETTLERS_WAIT_FOR_SIZE_TWO,
} from '@civ-clone/civ1-enhanced/RuleSets';
import { SETTLERS_WAIT_RULE } from '@civ-clone/civ1-enhanced/RuleIds';
import { CHIEFTAIN_SETTLERS_RULE } from '@civ-clone/civ1-unit/RuleIds';
import { Settlers, Warrior } from '@civ-clone/civ1-unit/Units';
import { Veteran } from '@civ-clone/civ1-unit/UnitImprovements';
import { instance as unitImprovementRegistryInstance } from '@civ-clone/core-unit-improvement/UnitImprovementRegistry';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import { applyRuleSets } from '@civ-clone/ui-worker-client/lib/ruleSets';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as gameDifficultyRegistryInstance } from '@civ-clone/core-difficulty/GameDifficultyRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  // The worker's answer to the build list's `cityBuildAvailable` (#970), and what it last sent.
  buildListHandler: ((cityBuildId: string) => unknown) | null = null,
  buildListSent: any = null,
  pendingChoice: ((value: any) => void) | null = null,
  city: City | null = null,
  // The human turns played so far, and the shields stored when the last one ended.
  turnsPlayed = 0,
  progressAtEnd = 0,
  turnCompleted: number | null = null,
  // Every object the patches sent since the human's last turn ended, round-tripped as `postMessage` would.
  objectsSent: any[] = [];

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL heldBuild: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL heldBuild: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const collectObjects = (value: any, into: any[] = objectsSent): void => {
  if (value === null || typeof value !== 'object') {
    return;
  }

  if (typeof value._ === 'string') {
    into.push(value);
  }

  Object.values(value).forEach((child) => collectObjects(child, into));
};

// The city's build as the page gets it when the city is sent: `held`, `remaining` and the prices, as sent.
const buildAsSent = (of: City): any => {
  const objects: any[] = [],
    id = cityBuildRegistryInstance.getByCity(of).id();

  collectObjects(
    JSON.parse(JSON.stringify(humanClient!.serialiseCity(of))),
    objects
  );

  return objects.find((object) => object.id === id && 'held' in object);
};

// The city's build as the turn's patches last sent it.
const buildInPatches = (of: City): any => {
  const id = cityBuildRegistryInstance.getByCity(of).id();

  return objectsSent
    .filter((object) => object.id === id && 'held' in object)
    .pop();
};

const shape = (build: any) =>
  build === undefined
    ? null
    : {
        held: build.held,
        waiting: build.remaining <= 0,
        spendCost: build.spendCost.length,
      };

// The ids sent with each item the build list offers `of` (#970), by name: the rules that would hold it there now.
const offeredHeld = (of: City): Record<string, unknown> => {
  buildListSent = null;
  buildListHandler!(cityBuildRegistryInstance.getByCity(of).id());

  return Object.fromEntries(
    (buildListSent.hierarchy as { '#ref': string }[]).map(({ '#ref': id }) => [
      buildListSent.objects[id].item._,
      buildListSent.objects[id].held,
    ])
  );
};

const ourSettlers = (): number =>
  unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers).length;

const sizeOf = (of: City): number =>
  cityGrowthRegistryInstance.getByCity(of).size();

// Grows at the start of the human's next turn: the food stored is the cost.
const growNextTurn = (of: City): void => {
  const growth = cityGrowthRegistryInstance.getByCity(of);

  growth.progress().set(growth.cost().value());
};

// A square of land at least four from every city, for another one.
const site = (near: Tile): Tile => {
  const tile = near
    .map()
    .entries()
    .find(
      (tile) =>
        tile.isLand() &&
        cityRegistryInstance
          .entries()
          .every((other) => other.tile().distanceFrom(tile) >= 4)
    );

  if (!tile) {
    fail('there is no room for another city');
  }

  return tile!;
};

const firstTurn = async (): Promise<void> => {
  const [founder] = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers);

  if (!founder) {
    fail('the human player has no Settlers to start with');
  }

  await Promise.resolve(
    actionHandler!({
      name: 'ActiveUnit',
      id: founder.id(),
      unitAction: 'FoundCity',
      target: playerWorldRegistryInstance
        .getByPlayer(humanPlayer!)
        .getByTile(founder.tile())!
        .id(),
    })
  ).then(settle);

  [city] = cityRegistryInstance.getByPlayer(humanPlayer!);

  if (!city) {
    fail('the starting Settlers could not found a city');
  }

  const cityBuild = cityBuildRegistryInstance.getByCity(city!),
    offered = offeredHeld(city!);

  expect(
    "T1: the build list of a city of size 1 says, before they are chosen, that Settlers would wait, by civ1-enhanced's rule, and that nothing else would",
    [
      offered.Settlers,
      Object.entries(offered)
        .filter(([name]) => name !== 'Settlers')
        .every(([, held]) => JSON.stringify(held) === '[]'),
      Object.keys(offered).length > 1,
    ],
    [[SETTLERS_WAIT_RULE], true, true]
  );

  cityBuild.build(Settlers);

  expect(
    'T1: a city of size 1 that chooses Settlers is told at once that they will wait, with shields to pay and a price',
    [
      sizeOf(city!),
      shape(buildAsSent(city!))?.held,
      shape(buildAsSent(city!))?.waiting,
      shape(buildAsSent(city!))!.spendCost > 0,
    ],
    [1, [SETTLERS_WAIT_RULE], false, true]
  );

  // Queued behind them, more Settlers and a Warrior: each queued item's ids go with the build, by its place (#970).
  cityBuild.enqueue(Settlers);
  cityBuild.enqueue(Warrior);

  expect(
    "T1: queued, more Settlers are sent with civ1-enhanced's rule beside them, and a Warrior with none",
    buildAsSent(city!)?.queueHeld,
    [[SETTLERS_WAIT_RULE], []]
  );

  cityBuild.clearQueue();

  expect('T1: with nothing queued, none', buildAsSent(city!)?.queueHeld, []);

  cityBuild.add(new Production(cityBuild.cost().value()));

  expect(
    'T1: paid for, they are waiting, with nothing to buy',
    shape(buildAsSent(city!)),
    { held: [SETTLERS_WAIT_RULE], waiting: true, spendCost: 0 }
  );
};

const playTurn = async (): Promise<void> => {
  turnsPlayed++;

  if (turnsPlayed === 1) {
    await firstTurn();

    return;
  }

  const cityBuild = cityBuildRegistryInstance.getByCity(city!);

  if (turnsPlayed === 2) {
    expect(
      'T2: still waiting, as the turn sent it: the city is there at size 1, no Settlers, the shields still adding up',
      [
        shape(buildInPatches(city!)),
        city!.destroyed(),
        sizeOf(city!),
        ourSettlers(),
        cityBuild.progress().value() > progressAtEnd,
        cityBuild.building()?.item() === Settlers,
      ],
      [
        { held: [SETTLERS_WAIT_RULE], waiting: true, spendCost: 0 },
        false,
        1,
        0,
        true,
        true,
      ]
    );

    growNextTurn(city!);

    return;
  }

  if (turnsPlayed === 3) {
    const settlers = unitRegistryInstance
      .getByTile(city!.tile())
      .filter(
        (unit) => unit instanceof Settlers && unit.player() === humanPlayer
      );

    // Food is processed before production at the start of a turn, so the city grows and completes them in one.
    expect(
      'T3: the turn it grows to size 2 it completes the Settlers, on its square, and is size 1 again',
      [settlers.length, turnCompleted === turnInstance.value(), sizeOf(city!)],
      [1, true, 1]
    );

    cityBuild.build(Settlers);
    cityBuild.progress().set(0);
    growNextTurn(city!);

    return;
  }

  if (turnsPlayed === 4) {
    const sent = buildInPatches(city!);

    expect(
      'T4: a city that grows before its Settlers are paid for is no longer held, as the turn sent it',
      [
        sizeOf(city!),
        cityBuild.building()?.item() === Settlers,
        sent?.held,
        sent?.remaining > 0,
      ],
      [2, true, [], true]
    );
    expect(
      'T4: and the build list of the city at size 2 says nothing would hold Settlers',
      offeredHeld(city!).Settlers,
      []
    );

    await originals();

    report();
  }
};

// The original's rules, with "Settlers wait for size 2" unticked (#959), in a city of size 1 made for them.
const originals = async (): Promise<void> => {
  applyRuleSets([{ id: SETTLERS_WAIT_FOR_SIZE_TWO, value: false }]);

  const other = new City(humanPlayer!, site(city!.tile()), 'Other'),
    otherBuild = cityBuildRegistryInstance.getByCity(other),
    level = gameDifficultyRegistryInstance.get();

  otherBuild.build(Settlers);
  otherBuild.add(new Production(otherBuild.cost().value()));
  gameDifficultyRegistryInstance.set(Chieftain);

  otherBuild.enqueue(Settlers);

  const onChieftain = shape(buildAsSent(other)),
    offeredOnChieftain = offeredHeld(other).Settlers,
    queuedOnChieftain = buildAsSent(other)?.queueHeld;

  otherBuild.clearQueue();

  const completed = otherBuild.check();

  expect(
    "unticked, on Chieftain: a city of size 1 holds paid-for Settlers by the original's rule, and completes nothing",
    [
      onChieftain,
      offeredOnChieftain,
      queuedOnChieftain,
      completed,
      other.destroyed(),
      sizeOf(other),
    ],
    [
      { held: [CHIEFTAIN_SETTLERS_RULE], waiting: true, spendCost: 0 },
      [CHIEFTAIN_SETTLERS_RULE],
      [[CHIEFTAIN_SETTLERS_RULE]],
      null,
      false,
      1,
    ]
  );

  gameDifficultyRegistryInstance.set(King);

  const onKing = shape(buildAsSent(other)),
    tile = other.tile();

  otherBuild.check();

  expect(
    'unticked, on King, with another city: nothing holds the Settlers, the city is removed for them, and they stand on its square',
    [
      onKing?.held,
      other.destroyed(),
      unitRegistryInstance
        .getByTile(tile)
        .filter(
          (unit) =>
            unit instanceof Settlers &&
            unit.player() === humanPlayer &&
            !unit.destroyed()
        ).length,
    ],
    [[], true, 1]
  );

  if (level !== null) {
    gameDifficultyRegistryInstance.set(level);
  }

  defectors();
  applyRuleSets([]);
};

// "Bribed and defecting units stay veteran" (#960), off to start with: a veteran Warrior of a rival's that changes
//  sides to us arrives as a new unit, no longer a veteran, as in the original; with the box ticked it stays one.
const defectors = (): void => {
  const [rival] = playerRegistryInstance
      .entries()
      .filter((player) => player !== humanPlayer),
    veteranAfterDefecting = (choices: { id: string; value: boolean }[]) => {
      applyRuleSets(choices);

      const warrior = new Warrior(null, rival!, city!.tile());

      unitRegistryInstance.register(warrior);
      unitImprovementRegistryInstance.register(new Veteran(warrior));
      warrior.transfer(humanPlayer!, city!);

      const veteran = unitImprovementRegistryInstance
        .getByUnit(warrior)
        .some((improvement) => improvement instanceof Veteran);

      warrior.destroy();

      return [warrior.player() === humanPlayer, veteran];
    };

  expect(
    'a veteran that changes sides to us is no longer one as the game starts, as in the original, and stays one with "Bribed and defecting units stay veteran" ticked',
    [
      veteranAfterDefecting([]),
      veteranAfterDefecting([{ id: DEFECTORS_STAY_VETERAN, value: true }]),
    ],
    [
      [true, false],
      [true, true],
    ]
  );
};

const report = (): void => {
  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL heldBuild (${failures.length} of ${checks})\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  console.log(
    `PASS heldBuild (${checks} checks: a size-1 city's Settlers are held from the moment they are chosen, paid for and waiting, completed the turn it grows to 2, and not held once it grows first; unticked, held on Chieftain by the original's rule, and on King the city is removed and its Settlers live; a veteran that defects stays one only with the box ticked)`
  );

  process.exit(0);
};

const endTurn = (): Promise<unknown> => {
  progressAtEnd = city
    ? cityBuildRegistryInstance.getByCity(city).progress().value()
    : 0;
  objectsSent = [];

  // What else the turn waits on, done here: the helper's turn would choose what the city builds.
  const research = playerResearchRegistryInstance.getByPlayer(humanPlayer!);

  if (research.researching() === null && research.available().length > 0) {
    research.research(research.available()[0]!);
  }

  // And our units, Settlers once built: left where they are, with no moves to make.
  unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .forEach((unit) => unit.moves().set(0));

  return Promise.resolve(actionHandler!({ name: 'EndTurn' }));
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    if (channel === 'action') {
      actionHandler = handler;
    }

    if (channel === 'cityBuildAvailable') {
      buildListHandler = handler;
    }

    return () => false;
  },
  receiveOnce: (channel: string, handler: (value: any) => void) => {
    if (channel === 'chooseFromList') {
      pendingChoice = handler;
    }

    return () => {
      pendingChoice = null;
    };
  },
  send: (channel: string, data: any): void => {
    if (channel === 'cityBuildAvailable') {
      buildListSent = data;

      return;
    }

    if (channel === 'gameDataPatch') {
      collectObjects(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'chooseFromList') {
      const meta = data as ChoiceMeta<any>,
        respond = pendingChoice;

      // `receiveOnce` is registered after the send, so answer on the next tick.
      setTimeout(() =>
        helper!
          .chooseFromList(meta)
          .then((value) => {
            const [choice] = meta
              .choices()
              .filter((choice) => choice.value() === value);

            (pendingChoice ?? respond)!(choice?.id());
          })
          .catch((error) => fail('the helper could not choose', error))
      );

      return;
    }

    if (channel !== 'turnStarted') {
      return;
    }

    setTimeout(() =>
      playTurn()
        .then(() => (finished ? undefined : endTurn()))
        .catch((error) => fail('the turns could not be played', error))
    );
  },
};

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((_, index): void => {
    const player = new Player();

    playerRegistryInstance.register(player);

    if (index === 0) {
      humanPlayer = player;
      helper = new SimpleAIClient(player);

      humanClient = new DataTransferClient(player, transport as any);

      clientRegistryInstance.register(humanClient);

      return;
    }

    clientRegistryInstance.register(new SimpleAIClient(player));
  });
});

// The turn the human's city completes its Settlers, from the engine's own event.
engine.on('city:building-complete', (cityBuild: any): void => {
  if (city !== null && cityBuild?.city?.() === city) {
    turnCompleted = turnInstance.value();
  }
});

engine.setOption('players', config.players);
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
