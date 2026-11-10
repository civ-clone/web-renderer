// A pillaged square loses its improvement and each player who knows it sees what it yields now (#413, #877).
//
// Three packages each do a part: the unit's `Pillage` action (base-unit-action-pillage) finishes by running the
// `Pillaged` rules, civ1-world's take the improvement off the square, and civ1-player's forget what the square yields
// for each player who knows it. Each has tests of its own part. This is the whole of it, in a game with the rules
// civ.one is built with: with any part missing, the square would keep its irrigation, or go on yielding as if it had.
//
// Drives a seeded game with a human `DataTransferClient`, as `terrainJob` does. On the human's first turn the test
// makes the starting Settlers' square irrigated Plains, shows it to a rival who has no unit near it, asks what it
// yields each of them (so the answers are ones the engine has kept), and orders the Settlers to pillage it through the
// action the UI sends. Then it ends turns the way the UI does until the irrigation is gone. The rival is the one that
// tells: the Settlers' own player sees the square afresh each turn, as a unit of theirs stands on it.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '@civ-clone/ui-worker-client/DataTransferClient';
import { Food as FoodYield } from '@civ-clone/civ1-world/Yields';
import { Plains } from '@civ-clone/civ1-world/Terrains';
import { Irrigation } from '@civ-clone/civ1-world/TileImprovements';
import Player from '@civ-clone/core-player/Player';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

// Long past the turn or two pillaging takes: a run that never sees the irrigation go fails rather than playing on.
const TURNS_TO_WAIT = 6;

let humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  passed = false,
  orderTurn: number | null = null,
  rival: Player | null = null,
  tile: Tile | null = null,
  // What the square yielded each of them while it was irrigated.
  foodBefore: Food[] | null = null;

type Food = [who: string, food: number];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL pillage: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const irrigated = (): boolean =>
  tileImprovementRegistryInstance
    .getByTile(tile!)
    .some((improvement) => improvement instanceof Irrigation);

const food = (player: Player | null): number =>
  tile!
    .yields(player)
    .filter((tileYield) => tileYield instanceof FoodYield)
    .reduce((total, tileYield) => total + tileYield.value(), 0);

const foodForEach = (): Food[] => [
  ['its player', food(humanPlayer)],
  ['a rival who knows it', food(rival)],
  ['no one', food(null)],
];

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
  const [settlers] = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers);

  if (!settlers) {
    fail('the human player has no Settlers to start with');
  }

  tile = settlers.tile();
  // Plains, as irrigated they yield 2 food: a square yielding more would lose 1 to Despotism, and yield the player
  //  the same irrigated or not.
  tile.setTerrain(new Plains());

  // As a finished irrigation job makes one: through the `Built` rules.
  new Irrigation(tile);

  if (!irrigated()) {
    fail('the square was not irrigated to begin with');
  }

  // A rival who has seen the square, and has nothing there to see it again with.
  [rival] = playerRegistryInstance
    .entries()
    .filter((player) => player !== humanPlayer);

  if (!rival) {
    fail('the game has no second player');
  }

  playerWorldRegistryInstance.getByPlayer(rival).register(tile);

  // Asked for now, so the engine keeps the answers: what it gives after the pillage is only right if it forgot them.
  foodBefore = foodForEach();

  orderTurn = turnInstance.value();

  await unitAction(settlers, 'Pillage');

  if (settlers.busy()?.constructor.name !== 'Pillaging') {
    fail(`the Settlers isn't pillaging: ${settlers.busy()}`);
  }
};

const check = (): boolean => {
  const turn = turnInstance.value();

  if (irrigated()) {
    if (turn >= orderTurn! + TURNS_TO_WAIT) {
      fail(
        `the square pillaged on turn ${orderTurn} is still irrigated on turn ${turn}`
      );
    }

    return false;
  }

  const foodAfter = foodForEach(),
    unchanged = foodAfter.filter(
      ([, after], index) => after >= foodBefore![index][1]
    );

  if (unchanged.length > 0) {
    fail(
      `the pillaged square still yields as if irrigated for ${unchanged
        .map(([who]) => who)
        .join(' and ')}: ${JSON.stringify(
        foodBefore
      )} food before, ${JSON.stringify(foodAfter)} after`
    );
  }

  console.log(
    `PASS pillage (ordered on turn ${orderTurn}, irrigation gone by turn ${turn}; food ${foodAfter
      .map(
        ([who, after], index) =>
          `for ${who} ${foodBefore![index][1]} to ${after}`
      )
      .join(', ')})`
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
        new DataTransferClient(player, transport as any)
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
      `FAIL pillage: the game stopped on turn ${turnInstance.value()} before the pillaged square was checked\n`
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
