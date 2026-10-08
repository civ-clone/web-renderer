// Explore and Automate carry on by themselves, turn after turn (#198, #200).
//
// Drives a seeded game with a human `DataTransferClient`, as `terrainJob` does. On the human's first turn the starting
// Settlers found a city, and the test gives the player a Warrior and another Settlers there, then orders them through
// the action the UI sends: the Warrior to Explore and the Settlers to Automate. Then it ends turns the way the UI does,
// and checks at the start of each of the human's turns:
//  - the explorer moves on by itself each turn, and the player knows more of the map than when it was ordered;
//  - after a few turns another player's unit is put beside it, and at the next turn it's handed back: active, no longer
//    busy, where it stood;
//  - the worker improves a tile around the city.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import { Settlers, Warrior } from '@civ-clone/civ1-unit/Units';
import Busy from '@civ-clone/core-unit/Rules/Busy';
import City from '@civ-clone/core-city/City';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import Criterion from '@civ-clone/core-rule/Criterion';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Effect from '@civ-clone/core-rule/Effect';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

// How long each order has to show itself.
const TURNS = 20;

// How many turns the explorer explores before another player's unit is put beside it.
const EXPLORE_TURNS = 3;

let humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  passed = false,
  orderTurn: number | null = null,
  explorer: Unit | null = null,
  worker: Unit | null = null,
  cityTiles: Tile[] = [],
  improvementsBefore = 0,
  // The tiles the player knew when the explorer was ordered.
  knownBefore = 0,
  explorerAt: Tile | null = null,
  exploredTurns = 0,
  // Where the explorer was when another player's unit was put beside it.
  threatenedAt: Tile | null = null,
  explorerHandedBack = false,
  improvedTurn: number | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL standingOrders: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const known = (): number =>
  playerWorldRegistryInstance.getByPlayer(humanPlayer!).entries().length;

const improvements = (): number =>
  cityTiles.reduce(
    (total: number, tile: Tile): number =>
      total + tileImprovementRegistryInstance.getByTile(tile).length,
    0
  );

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
  const [founder] = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers);

  if (!founder) {
    fail('the human player has no Settlers to start with');
  }

  const tile = founder.tile();

  await unitAction(founder, 'FoundCity');

  const city: City | null = cityRegistryInstance.getByTile(tile);

  if (!city) {
    fail('the starting Settlers did not found a city');
  }

  cityTiles = city!.tiles().entries();
  improvementsBefore = improvements();

  explorer = new Warrior(null, humanPlayer!, tile);
  worker = new Settlers(city, humanPlayer!, tile);

  orderTurn = turnInstance.value();
  knownBefore = known();
  explorerAt = explorer.tile();

  await unitAction(explorer, 'Explore');
  await unitAction(worker, 'Automate');

  if (explorer.busy()?.constructor.name !== 'Exploring') {
    fail(`the Warrior isn't exploring: ${explorer.busy()}`);
  }

  if (explorer.tile() === explorerAt) {
    fail('the Warrior did not set off when it was ordered to explore');
  }

  explorerAt = explorer.tile();

  if (
    ![
      'Automated',
      'BuildingRoad',
      'BuildingIrrigation',
      'BuildingMine',
    ].includes(worker.busy()?.constructor.name ?? '')
  ) {
    fail(`the Settlers aren't automated: ${worker.busy()}`);
  }
};

const check = (): void => {
  const turn = turnInstance.value(),
    busy = explorer!.busy()?.constructor.name ?? null;

  if (threatenedAt !== null && !explorerHandedBack) {
    if (busy !== null || !explorer!.active()) {
      fail(
        `the Warrior wasn't handed back with another player's unit beside it: ${busy}`
      );
    }

    if (explorer!.tile() !== threatenedAt) {
      fail("the Warrior moved on with another player's unit beside it");
    }

    explorerHandedBack = true;
  }

  if (threatenedAt === null) {
    if (busy !== 'Exploring') {
      fail(`the Warrior stopped exploring on turn ${turn}: ${busy}`);
    }

    if (explorer!.tile() === explorerAt) {
      fail(`the Warrior didn't move on by itself on turn ${turn}`);
    }

    explorerAt = explorer!.tile();
    exploredTurns++;

    if (exploredTurns === EXPLORE_TURNS) {
      if (known() <= knownBefore) {
        fail(
          `the player knows no more of the map after ${exploredTurns} turns`
        );
      }

      const [other] = playerRegistryInstance
          .entries()
          .filter((player) => player !== humanPlayer),
        [beside] = explorer!
          .tile()
          .getNeighbours()
          .filter((tile) => tile.isLand());

      const enemy = new Warrior(null, other, beside);

      // Busy for ever, so that its player leaves it where it is.
      enemy.setActive(false);
      enemy.setBusy(
        new Busy(
          new Criterion((): boolean => false),
          new Effect((): void => {})
        )
      );

      threatenedAt = explorer!.tile();
    }
  }

  if (improvedTurn === null && improvements() > improvementsBefore) {
    improvedTurn = turn;
  }

  if (
    turn < orderTurn! + TURNS &&
    (improvedTurn === null || !explorerHandedBack)
  ) {
    return;
  }

  if (!explorerHandedBack) {
    fail(`the Warrior was never handed back`);
  }

  if (improvedTurn === null) {
    fail(`the Settlers improved no tile around the city in ${TURNS} turns`);
  }

  console.log(
    `PASS standingOrders (ordered on turn ${orderTurn}: the Warrior explored ${exploredTurns} more turns and was handed back, the Settlers improved a tile by turn ${improvedTurn})`
  );

  passed = true;
  process.exit(0);
};

// The rest of the turn is played by a `SimpleAIClient` for the same player, as in `terrainJob`, so nothing mandatory
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
      `FAIL standingOrders: the game stopped on turn ${turnInstance.value()} before the orders were checked\n`
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
