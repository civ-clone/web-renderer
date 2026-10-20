// Pollution (#32):
//  a. a city's smokestacks pollute a square around it, and its owner is told ("Pollution near …");
//  b. a rival's city polluting tells us nothing;
//  c. a polluted square gives half its Food (rounded up);
//  d. Settlers on a polluted square are offered CleanPollution, take Civ1's 4 turns, and the square is sent to the UI
//     again once clean, with its yields back.
// The city's pollution is sent with it, for the city screen (#402).
//
// Drives a seeded game with a human `DataTransferClient`, as `nuclear` and `goToArrival` do. On the human's first turn
// the starting Settlers found a city, and the test places everything each scenario needs on chosen land. The cities'
// smokestacks are made certain by processing the pollution rule directly with a huge shield total.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import { Grassland } from '@civ-clone/civ1-world/Terrains';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import { Pollution } from '@civ-clone/civ1-world/TileImprovements';
import { Production } from '@civ-clone/civ1-city-improvement/Yields';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import ProcessYield from '@civ-clone/core-city/Rules/ProcessYield';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { Food } from '@civ-clone/civ1-world/Yields';

let humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  helper: SimpleAIClient | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  started = false;

// What the UI is sent that matters here, in order. Round-tripped, as `postMessage` would.
const patches: any[] = [],
  notifications: any[] = [],
  log: { kind: 'patch' | 'notification'; data: any }[] = [],
  results: { name: string; pass: boolean; detail: string }[] = [];

// The clean-up in progress, carried across turns.
let pollutedAId: string | null = null,
  pollutedALogFrom = 0,
  cleaner: Unit | null = null,
  cleanTile: Tile | null = null,
  cleanOrderTurn: number | null = null,
  foodBefore = 0,
  foodPolluted = 0,
  lastCheckLogLength = 0,
  gonePatch: boolean | null = null,
  goneTurn: number | null = null;

const MAX_TURNS = 6,
  CLEAN_TURNS = 4;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL pollution: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const check = (name: string, pass: boolean, detail: string): void => {
  results.push({ name, pass, detail });
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const describeTile = (tile: Tile): string => `(${tile.x()},${tile.y()})`;

const playerTileOf = (tile: Tile) => {
  const playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!);

  playerWorld.register(tile);

  const playerTile = playerWorld.getByTile(tile);

  if (!playerTile) {
    fail(`the player can't see ${describeTile(tile)}`);
  }

  return playerTile!;
};

const unitAction = (unit: Unit, name: string, target: Tile): Promise<void> =>
  Promise.resolve(
    actionHandler!({
      name: 'ActiveUnit',
      id: unit.id(),
      unitAction: name,
      target: playerTileOf(target).id(),
    })
  ).then(settle);

// The tile `dx`, `dy` from `tile`, wrapping east-west.
const offset = (tile: Tile, dx: number, dy: number): Tile => {
  const world = tile.map(),
    width = world.width();

  return world.get((((tile.x() + dx) % width) + width) % width, tile.y() + dy);
};

const pollutionOn = (tile: Tile): boolean =>
  tileImprovementRegistryInstance
    .getByTile(tile)
    .some((improvement) => improvement instanceof Pollution);

// Everything a city of ours could pollute, and a margin: a 5×5 block.
const around = (centre: Tile, radius = 2): Tile[] => {
  const tiles: Tile[] = [];

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const y = centre.y() + dy;

      if (y >= 0 && y < centre.map().height()) {
        tiles.push(offset(centre, dx, dy));
      }
    }
  }

  return tiles;
};

// Sites for the scenarios: a block of land `radius` out with nothing on it, centred on the returned tile and away from
//  everything already used. The seed's land is too broken up for a clear 5×5 block, so a city's other squares may be
//  water, and `smoke` tries again when the rule picks one.
const used: Tile[] = [];

const findSite = (radius = 1): Tile => {
  const world = cityRegistryInstance.entries()[0].tile().map();

  for (let y = 2; y < world.height() - 2; y++) {
    for (let x = 0; x < world.width(); x++) {
      const centre = world.get(x, y);

      if (
        used.some(
          (other) => Math.abs(other.x() - x) < 5 && Math.abs(other.y() - y) < 5
        )
      ) {
        continue;
      }

      if (
        around(centre, radius).every(
          (tile) =>
            tile.isLand() &&
            cityRegistryInstance.getByTile(tile) === null &&
            unitRegistryInstance.getByTile(tile).length === 0
        )
      ) {
        used.push(centre);

        return centre;
      }
    }
  }

  return fail(`no clear land, ${used.length} found`);
};

const notificationsNamed = (name: string, from: number): any[] =>
  notifications
    .slice(from)
    .filter((notification) =>
      name === 'City.polluted'
        ? isPolluted(notification)
        : JSON.stringify(notification).includes(name)
    );

// Smoke a city: the rule gets 300 shields, so the odds are all but certain, bar the square picked being unsuitable.
//  Tries again, boundedly, until one square is polluted. Returns the square.
const smoke = (city: City, site: Tile): Tile | null => {
  const land = around(site);

  for (let attempt = 0; attempt < 30; attempt++) {
    const before = land.filter(pollutionOn);

    ruleRegistryInstance.process(
      ProcessYield,
      new Production(300, 'Consolidated'),
      city,
      [new Production(300)]
    );

    const added = land.filter(
      (tile) => pollutionOn(tile) && !before.includes(tile)
    );

    if (added.length > 0) {
      return added.length === 1 ? added[0] : null;
    }
  }

  return null;
};

const countPollution = (tiles: Tile[]): number =>
  tiles.filter(pollutionOn).length;

const food = (tile: Tile): number =>
  tile
    .yields(humanPlayer!)
    .filter((tileYield) => tileYield instanceof Food)
    .reduce((total, tileYield) => total + tileYield.value(), 0);

const offered = (unit: Unit, target: Tile): string[] =>
  unit.actions(target).map((action) => action.constructor.name);

const mentions = (value: unknown, text: string): boolean =>
  JSON.stringify(value).includes(text);

// The exact notification, not one that merely starts with its name.
const isPolluted = (value: unknown): boolean =>
  /City\.polluted(?![-\w])/.test(JSON.stringify(value));

const order = async (): Promise<void> => {
  const [founder] = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers);

  if (!founder) {
    fail('the human player has no Settlers to start with');
  }

  await unitAction(founder, 'FoundCity', founder.tile());

  const rival = playerRegistryInstance
    .entries()
    .find((player) => player !== humanPlayer);

  if (!rival) {
    fail('a rival is needed');
  }

  // a. Our own city.
  const siteA = findSite(),
    cityA = new City(humanPlayer!, siteA, 'Smogville'),
    landA = around(siteA);

  landA.forEach((tile) => playerTileOf(tile));

  const notificationsFromA = notifications.length,
    logFromA = log.length,
    pollutedA = smoke(cityA, siteA);

  await settle();

  const warned = notificationsNamed('City.polluted', notificationsFromA),
    warnedAt = log.findIndex(
      (entry, index) =>
        index >= logFromA &&
        entry.kind === 'notification' &&
        isPolluted(entry.data)
    );

  check(
    'a. A city that smokes pollutes exactly one square around it',
    pollutedA !== null &&
      countPollution(landA) === 1 &&
      pollutedA !== siteA &&
      !pollutionOn(siteA),
    `polluted: ${landA.filter(pollutionOn).map(describeTile).join(' ')}`
  );
  check(
    'a. The owner is told about the pollution, naming the city',
    warned.length === 1 && mentions(warned[0], 'Smogville'),
    JSON.stringify(warned)
  );
  // The UI is sent the square with the next flush (the next turn start), checked in `checkTurnStart`.
  if (pollutedA !== null) {
    pollutedAId = playerTileOf(pollutedA).id();
    pollutedALogFrom = logFromA;
  }

  // b. A rival's city.
  const siteB = findSite(),
    cityB = new City(rival, siteB, 'Rivalton'),
    landB = around(siteB),
    notificationsFromB = notifications.length,
    pollutedB = smoke(cityB, siteB);

  await settle();

  check(
    "b. A rival's city pollutes its own surroundings",
    pollutedB !== null && countPollution(landB) === 1,
    `polluted: ${landB.filter(pollutionOn).map(describeTile).join(' ')}`
  );
  check(
    "b. We aren't told about a rival's pollution",
    notificationsNamed('City.polluted', notificationsFromB).length === 0,
    JSON.stringify(notifications.slice(notificationsFromB))
  );

  // c. Yield. A plain Grassland, with nothing special on it.
  const siteC = findSite(0);

  cleanTile = siteC;
  cleanTile.setTerrain(new Grassland());
  cleanTile.clearYieldCache(humanPlayer!);
  playerTileOf(cleanTile);

  foodBefore = food(cleanTile);

  new Pollution(cleanTile, ruleRegistryInstance);
  cleanTile.clearYieldCache(humanPlayer!);

  foodPolluted = food(cleanTile);

  await settle();

  check(
    'c. A polluted square gives half its Food, rounded up',
    foodBefore > 0 &&
      pollutionOn(cleanTile) &&
      foodPolluted === Math.ceil(foodBefore / 2),
    `food ${foodBefore} before, ${foodPolluted} polluted`
  );

  // d. Clean-up.
  cleaner = new Settlers(null, humanPlayer!, cleanTile);

  const offer = offered(cleaner, cleanTile);

  check(
    'd. Settlers on a polluted square are offered CleanPollution',
    offer.includes('CleanPollution'),
    `offered: ${JSON.stringify(offer)}`
  );

  if (!offer.includes('CleanPollution')) {
    return evaluate();
  }

  cleanOrderTurn = turnInstance.value();
  lastCheckLogLength = log.length;

  await unitAction(cleaner, 'CleanPollution', cleanTile);

  check(
    'd. The Settlers is busy cleaning pollution',
    cleaner.busy()?.constructor.name === 'CleaningPollution' &&
      pollutionOn(cleanTile),
    `busy: ${cleaner.busy()?.constructor.name}`
  );
};

// Each later turn start: has the pollution gone?
const checkTurnStart = async (): Promise<void> => {
  const turn = turnInstance.value(),
    sinceOrder = turn - cleanOrderTurn!;

  await settle();

  if (pollutedAId !== null) {
    const id = pollutedAId;

    check(
      'a. The polluted square is sent to the UI',
      log
        .slice(pollutedALogFrom)
        .some((entry) => entry.kind === 'patch' && mentions(entry.data, id)),
      `${log.length - pollutedALogFrom} messages since the pollution`
    );

    // The value is 0 here, as `smoke` processes the rule directly; civ1-city-improvement's tests check the count.
    check(
      "a. The city's pollution is sent to the UI (#402)",
      log
        .slice(pollutedALogFrom)
        .some(
          (entry) =>
            entry.kind === 'patch' &&
            mentions(entry.data, 'Smogville') &&
            mentions(entry.data, '"pollution":')
        ),
      `${log.length - pollutedALogFrom} messages since the pollution`
    );

    pollutedAId = null;
  }

  if (goneTurn === null && !pollutionOn(cleanTile!)) {
    goneTurn = sinceOrder;

    const id = playerTileOf(cleanTile!).id();

    gonePatch = log
      .slice(lastCheckLogLength)
      .some((entry) => entry.kind === 'patch' && mentions(entry.data, id));
  }

  lastCheckLogLength = log.length;

  if (goneTurn !== null) {
    check(
      "d. The pollution is gone after Civ1's 4 turns (3 turn starts after the order)",
      goneTurn === CLEAN_TURNS - 1,
      `gone ${goneTurn} turn starts after the order`
    );
    check(
      'd. The Settlers is free again',
      cleaner!.busy() === null || cleaner!.busy() === undefined,
      `busy: ${cleaner!.busy()?.constructor.name}`
    );
    check(
      'd. The cleaned square is sent to the UI',
      gonePatch === true,
      `patch seen: ${gonePatch}`
    );
    check(
      'd. The square gives its full Food again',
      food(cleanTile!) === foodBefore,
      `food ${food(cleanTile!)}, was ${foodBefore} before pollution`
    );

    return evaluate();
  }

  if (sinceOrder >= MAX_TURNS) {
    check(
      `d. The pollution is cleaned within ${MAX_TURNS} turns`,
      false,
      `still polluted ${sinceOrder} turns after the order`
    );

    return evaluate();
  }
};

const playTurn = async (): Promise<void> => {
  if (!started) {
    started = true;

    return order();
  }

  return checkTurnStart();
};

// The rest of the turn is played by a `SimpleAIClient` for the same player, as in `goToArrival`.
const endTurn = (): Promise<unknown> =>
  settle()
    .then(() => helper!.takeTurn())
    .then(() => actionHandler!({ name: 'EndTurn' }));

const evaluate = (): never => {
  results.forEach(({ name, pass, detail }) =>
    console.log(
      `${pass ? 'PASS' : 'FAIL'} pollution: ${name}${
        pass ? '' : `\n    ${detail}`
      }`
    )
  );

  process.exit(results.every(({ pass }) => pass) ? 0 : 1);
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    if (channel === 'action') {
      actionHandler = handler;
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
    if (channel === 'gameDataPatch') {
      const patch = JSON.parse(JSON.stringify(data));

      patches.push(patch);
      log.push({ kind: 'patch', data: patch });

      return;
    }

    if (channel === 'gameNotification') {
      const notification = JSON.parse(JSON.stringify(data));

      notifications.push(notification);
      log.push({ kind: 'notification', data: notification });

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
        .then(endTurn)
        .catch((error) => fail('the scenarios could not be run', error))
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

      humanClient = new DataTransferClient(
        player,
        transport as any,
        (channel, payload) => transport.send(channel, payload),
        () => {}
      );

      clientRegistryInstance.register(humanClient);

      return;
    }

    clientRegistryInstance.register(new SimpleAIClient(player));
  });
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
