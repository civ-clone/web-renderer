// Road to (#195): Settlers sent to a distant square build a Road on each square of the way, turn after turn, and are
//  handed back on arrival. The UI is told which route orders a unit may be given (`routeOrders`), to offer them beside
//  Go to.
//
// Drives a seeded game with a human `DataTransferClient`, as `goToArrival` does. On the human's first turn its starting
// Settlers are sent `RoadTo` a land square three away, the way the unit action menu sends it. Then it ends turns the
// way the UI does until the order is done, and checks every square of the way has a Road.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import {
  BuildRouteNote,
  generateKey,
} from '@civ-clone/base-unit-action-build-route/BuildRoute';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import { Road } from '@civ-clone/civ1-world/TileImprovements';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as strategyNoteRegistryInstance } from '@civ-clone/core-strategy/StrategyNoteRegistry';
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

// More than the order can take: four squares to build on, each up to a turn to reach and several to build on in rough
//  terrain.
const TURNS = 30;

let humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  worker: Unit | null = null,
  squares: Tile[] = [],
  turns = 0;

const patches: any[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL roadTo: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const at = (tile: Tile): string => `(${tile.x()},${tile.y()})`;

const note = (): BuildRouteNote | undefined =>
  strategyNoteRegistryInstance
    .getByKey<BuildRouteNote>(generateKey(worker!))
    ?.value();

const hasRoad = (tile: Tile): boolean =>
  tileImprovementRegistryInstance
    .getByTile(tile)
    .some((improvement) => improvement instanceof Road);

// The last `routeOrders` the UI was sent for `unit`, from the patches' unit objects.
const routeOrdersSent = (unit: Unit): unknown => {
  let found: unknown = undefined;

  const visit = (value: any): void => {
    if (value === null || typeof value !== 'object') {
      return;
    }

    if (value.id === unit.id() && 'routeOrders' in value) {
      found = value.routeOrders;
    }

    Object.values(value).forEach(visit);
  };

  patches.forEach(visit);

  return found;
};

const order = async (): Promise<void> => {
  const [settlers] = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers);

  if (!settlers) {
    fail('the human has no Settlers');
  }

  worker = settlers;

  const playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!),
    start = worker.tile(),
    candidates = start
      .getSurroundingArea(3)
      .entries()
      .filter(
        (tile: Tile): boolean => tile.isLand() && tile.distanceFrom(start) === 3
      );

  for (const target of candidates) {
    playerWorld.register(target);

    await Promise.resolve(
      actionHandler!({
        name: 'ActiveUnit',
        id: worker.id(),
        unitAction: 'RoadTo',
        target: playerWorld.getByTile(target)!.id(),
      })
    ).then(settle);

    const started = note();

    if (started) {
      squares = [start, ...started.path];

      break;
    }
  }

  if (squares.length === 0) {
    fail(`no land square three from ${at(start)} could be reached`);
  }

  const sent = routeOrdersSent(worker);

  if (JSON.stringify(sent) !== JSON.stringify(['RoadTo'])) {
    fail(`the UI was sent routeOrders ${JSON.stringify(sent)}, not ["RoadTo"]`);
  }
};

const finish = (): void => {
  const missing = squares.filter((tile) => !hasRoad(tile));

  if (note()) {
    fail(`the order was still under way after ${TURNS} turns`);
  }

  if (missing.length > 0) {
    fail(`no Road on ${missing.map(at).join(', ')}`);
  }

  if (worker!.busy() !== null) {
    fail(
      `the Settlers weren't handed back: ${worker!.busy()!.constructor.name}`
    );
  }

  process.stdout.write(
    `PASS roadTo: Roads on ${squares
      .map(at)
      .join(' ')} in ${turns} turns; routeOrders sent\n`
  );
  process.exit(0);
};

const playTurn = async (): Promise<void> => {
  if (worker === null) {
    await order();

    return;
  }

  turns++;

  if (!note() || turns >= TURNS) {
    finish();
  }
};

// The rest of the turn is played by a `SimpleAIClient` for the same player, with the worker put aside first.
const endTurn = (): Promise<unknown> =>
  settle()
    .then(() => {
      if (worker && !worker.destroyed()) {
        worker.setActive(false);
      }
    })
    .then(() => helper!.takeTurn())
    .then(() => actionHandler!({ name: 'EndTurn' }));

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    if (channel === 'action') {
      actionHandler = handler;
    }

    return () => false;
  },
  receiveOnce: (channel: string, handler: (value: any) => void) => {
    if (channel === 'chooseFromList') {
      setTimeout(() => handler(undefined));
    }

    return () => {};
  },
  send: (channel: string, data: any): void => {
    if (channel === 'gameDataPatch') {
      // Round-trip, as `postMessage` would.
      patches.push(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'chooseFromList') {
      return;
    }

    if (channel !== 'turnStarted') {
      return;
    }

    setTimeout(() =>
      playTurn()
        .then(endTurn)
        .catch((error) => fail('the turn could not be played', error))
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

      clientRegistryInstance.register(
        new DataTransferClient(
          player,
          transport as any,
          (channel, payload) => transport.send(channel, payload),
          () => {}
        )
      );

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
