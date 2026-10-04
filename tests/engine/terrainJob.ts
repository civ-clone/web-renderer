// Settlers' terrain jobs take Civ1's time, counting the turn the order is given on (#261).
//
// Drives a seeded game with a human `DataTransferClient`, as `joinCity` does. On the human's first turn the test makes
// the starting Settlers' square Grassland and orders a road through the action the UI sends, and puts a second
// Settlers on a River square beside it and orders irrigation. Then it ends turns the way the UI does and notes the turn
// each improvement first appears on. In Civ1 a road on Grassland takes 2 turns and irrigating a River 5, so they're
// there at the start of the human's turn 1 and 4 turns after the order.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import { Grassland, River } from '@civ-clone/civ1-world/Terrains';
import { Irrigation, Road } from '@civ-clone/civ1-world/TileImprovements';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import TileImprovement from '@civ-clone/core-tile-improvement/TileImprovement';
import Unit from '@civ-clone/core-unit/Unit';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

// Civ1's turns for each job, counting the turn of the order (Rome on 640K, Table 3-2; v474.05).
const ROAD_ON_GRASSLAND = 2,
  IRRIGATE_RIVER = 5;

let humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  passed = false,
  orderTurn: number | null = null,
  roadTile: Tile | null = null,
  irrigationTile: Tile | null = null,
  // The turn each improvement was first seen on, at the start of the human's turn.
  roadTurn: number | null = null,
  irrigationTurn: number | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL terrainJob: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const has = (tile: Tile, Improvement: typeof TileImprovement): boolean =>
  tileImprovementRegistryInstance
    .getByTile(tile)
    .some((improvement) => improvement instanceof Improvement);

const unitAction = (unit: Unit, name: string): Promise<void> => {
  const playerTile = playerWorldRegistryInstance
    .getByPlayer(humanPlayer!)
    .getByTile(unit.tile());

  if (!playerTile) {
    fail(`the player has not seen the tile ${unit.id()} is on`);
  }

  return Promise.resolve(
    actionHandler!({
      name: 'ActiveUnit',
      id: unit.id(),
      unitAction: name,
      target: playerTile!.id(),
    })
  ).then(settle);
};

const order = async (): Promise<void> => {
  const [roadBuilder] = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers);

  if (!roadBuilder) {
    fail('the human player has no Settlers to start with');
  }

  roadTile = roadBuilder.tile();
  roadTile.setTerrain(new Grassland());

  irrigationTile = roadTile.getNeighbour('e');
  irrigationTile.setTerrain(new River());

  const irrigator = new Settlers(null, humanPlayer!, irrigationTile);

  orderTurn = turnInstance.value();

  await unitAction(roadBuilder, 'BuildRoad');
  await unitAction(irrigator, 'BuildIrrigation');

  if (roadBuilder.busy()?.constructor.name !== 'BuildingRoad') {
    fail(`the Settlers isn't building a road: ${roadBuilder.busy()}`);
  }

  if (irrigator.busy()?.constructor.name !== 'BuildingIrrigation') {
    fail(`the Settlers isn't irrigating: ${irrigator.busy()}`);
  }
};

const check = (): boolean => {
  const turn = turnInstance.value();

  if (roadTurn === null && has(roadTile!, Road)) {
    roadTurn = turn;
  }

  if (irrigationTurn === null && has(irrigationTile!, Irrigation)) {
    irrigationTurn = turn;
  }

  if (turn < orderTurn! + IRRIGATE_RIVER) {
    return false;
  }

  if (roadTurn !== orderTurn! + ROAD_ON_GRASSLAND - 1) {
    fail(
      `a road on Grassland ordered on turn ${orderTurn} should be there on turn ${
        orderTurn! + ROAD_ON_GRASSLAND - 1
      }, not ${roadTurn}`
    );
  }

  if (irrigationTurn !== orderTurn! + IRRIGATE_RIVER - 1) {
    fail(
      `irrigating a River ordered on turn ${orderTurn} should be done on turn ${
        orderTurn! + IRRIGATE_RIVER - 1
      }, not ${irrigationTurn}`
    );
  }

  console.log(
    `PASS terrainJob (ordered on turn ${orderTurn}: a road on Grassland on turn ${roadTurn}, River irrigation on turn ${irrigationTurn})`
  );

  passed = true;
  process.exit(0);
};

// The rest of the turn is played by a `SimpleAIClient` for the same player, as in `turnHandover`, so nothing mandatory
//  holds up `EndTurn`. Busy units are left alone.
const endTurn = (): Promise<unknown> =>
  settle()
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
      pendingChoice = handler;
    }

    return () => {
      pendingChoice = null;
    };
  },
  send: (channel: string, data: any): void => {
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
      (orderTurn === null ? order() : Promise.resolve(check()))
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

// Nothing keeps the process alive between turns but the engine's own work, so a run that stalls just ends.
process.on('exit', (code: number): void => {
  if (code === 0 && !passed) {
    process.stderr.write(
      `FAIL terrainJob: the game stopped on turn ${turnInstance.value()} before the jobs were checked\n`
    );
    process.exitCode = 1;
  }
});
process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
