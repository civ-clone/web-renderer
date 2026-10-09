// Explore and Automate carry on by themselves, turn after turn (#198, #200).
//
// Drives a seeded game with a human `DataTransferClient`, as `terrainJob` does. On the human's first turn the starting
// Settlers found a city, and the test gives the player a Warrior and two more Settlers there, then orders them through
// the action the UI sends: the Warrior to Explore and both Settlers to Automate. Then it ends turns the way the UI does,
// and checks at the start of each of the human's turns:
//  - the explorer moves on by itself each turn, and the player knows more of the map than when it was ordered;
//  - after a few turns another player's unit is put beside it, and at the next turn it's handed back: active, no longer
//    busy, where it stood;
//  - the first worker improves a tile around the city;
//  - the second worker is selected and put to sleep, as a player would, and from then on it gets no more automated
//    work: it stays asleep where it was, and its order's note is gone;
//  - once all that is done, the player is shown the whole map and a new Warrior is ordered to Explore: with no unseen
//    tile left to reach, it's handed straight back (active, not busy, no note), and still is on the next turn.
//
//   --save <file>   the above; and on the turn after the order, with the explorer and the first worker mid-order,
//                   the game is saved to <file>
//   --load <file>   in a second process (loading needs an engine that has not started a game, see `load.ts`), the
//                   save is restored through the renderer's own load path and played on: the explorer keeps exploring
//                   and the player learns more of the map, and the worker keeps working and finishes an improvement.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import { Settlers, Warrior } from '@civ-clone/civ1-unit/Units';
import { readFileSync, writeFileSync } from 'fs';
import { restoreGame, resumeGame } from '../../src/js/Engine/loadGame';
import Busy from '@civ-clone/core-unit/Rules/Busy';
import City from '@civ-clone/core-city/City';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import Criterion from '@civ-clone/core-rule/Criterion';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Effect from '@civ-clone/core-rule/Effect';
import Player from '@civ-clone/core-player/Player';
import { SaveGame } from '@civ-clone/core-save-game/SaveGame';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { generateKey as automateKey } from '@civ-clone/base-unit-action-automate/Automate';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { generateKey as exploreKey } from '@civ-clone/base-unit-action-explore/Explore';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { plugins } from '../../src/js/plugins';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { registerDiplomacyClasses } from '../../src/js/Engine/diplomacy';
import { save } from '@civ-clone/core-save-game/save';
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

const mode = process.argv.includes('--load') ? 'load' : 'save';
const file = process.argv[process.argv.indexOf(`--${mode}`) + 1];

// How long each order has to show itself.
const TURNS = 20;

// How many turns the explorer explores before another player's unit is put beside it.
const EXPLORE_TURNS = 3;

// How many turns after the order the second worker is given another one by hand, and how many turns after that it's
//  watched to show it gets no more automated work.
const MANUAL_ORDER_AFTER = 2;
const MANUAL_TURNS = 3;

// How many turns the explorer has to keep exploring after the load.
const LOADED_EXPLORE_TURNS = 3;

// The busy rules of a worker on an Automate order: on its way to a job, or at one.
const AUTOMATED = [
  'Automated',
  'BuildingRoad',
  'BuildingIrrigation',
  'BuildingMine',
];

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
  // The tiles the player knew when the explorer was ordered (or, after a load, when the game was loaded).
  knownBefore = 0,
  explorerAt: Tile | null = null,
  exploredTurns = 0,
  // Where the explorer was when another player's unit was put beside it.
  threatenedAt: Tile | null = null,
  explorerHandedBack = false,
  improvedTurn: number | null = null,
  // The second worker, given another order by hand part way through its Automate order.
  stoppedWorker: Unit | null = null,
  stoppedTurn: number | null = null,
  stoppedAt: Tile | null = null,
  stoppedBusy: string | null = null,
  stoppedTurns = 0,
  saved = false,
  // The Warrior ordered to Explore once there's nothing left to explore.
  latecomer: Unit | null = null,
  latecomerTurn: number | null = null,
  // After a load: the turn it resumed on, and how the worker's jobs have gone since.
  loadedTurn: number | null = null,
  loadedExploredTurns = 0,
  jobTile: Tile | null = null,
  jobTileImprovements = 0,
  finishedJobAt: Tile | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL standingOrders${mode === 'load' ? ' (loaded)' : ''}: ${reason}\n${
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

const busyName = (unit: Unit): string | null =>
  unit.busy()?.constructor.name ?? null;

const hasNote = (key: string): boolean =>
  defaultGame.strategyNotes.getByKey(key) !== undefined;

const unitById = (id: string): Unit => {
  const [unit] = unitRegistryInstance
    .entries()
    .filter((unit: Unit): boolean => unit.id() === id);

  if (!unit) {
    fail(`there is no unit ${id} in the loaded game`);
  }

  return unit;
};

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

// Selecting a unit that isn't active, as clicking on it does.
const select = (unit: Unit): Promise<void> =>
  Promise.resolve(actionHandler!({ name: 'InactiveUnit', id: unit.id() })).then(
    settle
  );

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
  // Homed nowhere: a size 1 city can't feed two Settlers, and would disband one.
  stoppedWorker = new Settlers(null, humanPlayer!, tile);

  orderTurn = turnInstance.value();
  knownBefore = known();
  explorerAt = explorer.tile();

  await unitAction(explorer, 'Explore');
  await unitAction(worker, 'Automate');
  await unitAction(stoppedWorker, 'Automate');

  if (busyName(explorer) !== 'Exploring') {
    fail(`the Warrior isn't exploring: ${explorer.busy()}`);
  }

  if (explorer.tile() === explorerAt) {
    fail('the Warrior did not set off when it was ordered to explore');
  }

  explorerAt = explorer.tile();

  [worker, stoppedWorker].forEach((unit: Unit): void => {
    if (!AUTOMATED.includes(busyName(unit) ?? '')) {
      fail(`the Settlers ${unit.id()} aren't automated: ${unit.busy()}`);
    }
  });
};

// The second worker, a couple of turns into its Automate order, is selected and put to sleep. From the next turn on,
//  the order is over: the worker stays asleep where it was, and its note is gone.
const checkManualOrder = async (turn: number): Promise<void> => {
  const unit = stoppedWorker!,
    key = automateKey(unit);

  if (stoppedTurn === null) {
    if (turn < orderTurn! + MANUAL_ORDER_AFTER) {
      return;
    }

    if (!AUTOMATED.includes(busyName(unit) ?? '') || !hasNote(key)) {
      fail(
        `the second Settlers weren't automated on turn ${turn}: ${busyName(
          unit
        )}`
      );
    }

    // A busy worker may have spent its moves on its job; selecting it gives it back the ones it has.
    if (unit.moves().value() <= 0) {
      return;
    }

    await select(unit);
    await unitAction(unit, 'Sleep');

    stoppedBusy = busyName(unit);

    if (stoppedBusy === null || AUTOMATED.includes(stoppedBusy)) {
      fail(`the second Settlers weren't put to sleep: ${stoppedBusy}`);
    }

    stoppedTurn = turn;
    stoppedAt = unit.tile();

    return;
  }

  if (stoppedTurns >= MANUAL_TURNS) {
    return;
  }

  if (hasNote(key)) {
    fail(`the second Settlers' Automate order was kept on turn ${turn}`);
  }

  if (busyName(unit) !== stoppedBusy) {
    fail(
      `the second Settlers went back to automated work on turn ${turn}: ${busyName(
        unit
      )}`
    );
  }

  if (unit.tile() !== stoppedAt) {
    fail(`the second Settlers moved by themselves on turn ${turn}`);
  }

  stoppedTurns++;
};

// The player is shown the whole map, so there's no unseen tile left anywhere, and a new Warrior in the city is ordered
//  to Explore.
const orderLatecomer = async (turn: number): Promise<void> => {
  const playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!),
    world = playerWorld.entries()[0].tile().map(),
    [city] = cityRegistryInstance.getByPlayer(humanPlayer!);

  playerWorld.register(...world.entries());

  if (known() !== world.entries().length) {
    fail(`the player was not shown the whole map`);
  }

  // The land tile nearest the city with no other player's unit in sight of it, so that it's handed back for having
  //  nothing to explore, not for another player's unit near it.
  const foreignNear = (tile: Tile): boolean =>
      tile
        .getSurroundingArea(1)
        .some((nearby: Tile): boolean =>
          unitRegistryInstance
            .getByTile(nearby)
            .some((unit: Unit): boolean => unit.player() !== humanPlayer)
        ),
    [start] = world
      .entries()
      .filter(
        (tile: Tile): boolean =>
          tile.isLand() &&
          (cityRegistryInstance.getByTile(tile)?.player() ?? humanPlayer) ===
            humanPlayer &&
          !foreignNear(tile)
      )
      .sort(
        (a: Tile, b: Tile): number =>
          a.distanceFrom(city.tile()) - b.distanceFrom(city.tile())
      );

  if (!start) {
    fail('there is nowhere free of other players to start the Warrior');
  }

  latecomer = new Warrior(null, humanPlayer!, start);

  if (latecomer.visibility().value() > 1) {
    fail(`the Warrior sees further than the tiles checked around it`);
  }

  latecomerTurn = turn;

  await unitAction(latecomer, 'Explore');

  checkLatecomer('as it was ordered');
};

const checkLatecomer = (when: string): void => {
  const unit = latecomer!;

  if (busyName(unit) === 'Exploring' || hasNote(exploreKey(unit))) {
    fail(
      `the Warrior kept exploring ${when} with no unseen tile left: ${busyName(
        unit
      )}`
    );
  }

  if (
    unit.busy() !== null &&
    // On a later turn the rest of the turn may have been played for it, as for any unit the player has.
    when === 'as it was ordered'
  ) {
    fail(`the Warrior was left busy with no unseen tile left: ${unit.busy()}`);
  }

  if (when === 'as it was ordered' && !unit.active()) {
    fail('the Warrior was not handed back active with no unseen tile left');
  }
};

const saveGame = (): void => {
  const game = save(defaultGame, { name: 'standing-orders', createdAt: 0 });

  writeFileSync(
    file,
    JSON.stringify({
      ids: { explorer: explorer!.id(), worker: worker!.id() },
      game,
    })
  );

  saved = true;
};

const check = async (): Promise<void> => {
  const turn = turnInstance.value(),
    busy = busyName(explorer!);

  if (latecomerTurn !== null) {
    checkLatecomer(`on turn ${turn}`);

    console.log(
      `PASS standingOrders (ordered on turn ${orderTurn}: the Warrior explored ${exploredTurns} more turns and was handed back, the Settlers improved a tile by turn ${improvedTurn}, the second Settlers were put to sleep on turn ${stoppedTurn} and did no automated work for ${stoppedTurns} turns, the game was saved mid-order, and a Warrior ordered to explore a map with nothing unseen was handed back on turn ${latecomerTurn})`
    );

    passed = true;
    process.exit(0);
  }

  if (threatenedAt !== null && !explorerHandedBack) {
    if (busy !== null || !explorer!.active()) {
      fail(
        `the Warrior wasn't handed back with another player's unit beside it: ${busy}`
      );
    }

    if (explorer!.tile() !== threatenedAt) {
      fail("the Warrior moved on with another player's unit beside it");
    }

    if (hasNote(exploreKey(explorer!))) {
      fail("the Warrior's Explore order was kept after it was handed back");
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

    // Mid-order for both: the explorer on its way, and the worker at or on its way to a job.
    if (!saved) {
      if (!AUTOMATED.includes(busyName(worker!) ?? '')) {
        fail(`the Settlers weren't automated when saved: ${busyName(worker!)}`);
      }

      saveGame();
    }

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

  await checkManualOrder(turn);

  if (
    turn < orderTurn! + TURNS &&
    (improvedTurn === null ||
      !explorerHandedBack ||
      stoppedTurns < MANUAL_TURNS)
  ) {
    return;
  }

  if (!explorerHandedBack) {
    fail(`the Warrior was never handed back`);
  }

  if (improvedTurn === null) {
    fail(`the Settlers improved no tile around the city in ${TURNS} turns`);
  }

  if (stoppedTurn === null) {
    fail(`the second Settlers never had moves left to be given another order`);
  }

  if (stoppedTurns < MANUAL_TURNS) {
    fail(`the second Settlers weren't watched for ${MANUAL_TURNS} turns`);
  }

  if (!saved) {
    fail('the game was never saved');
  }

  await orderLatecomer(turn);
};

// After a load: the explorer keeps exploring, and the player learns more of the map; the worker keeps working, and
//  finishes a job it was at.
const checkLoaded = (): void => {
  const turn = turnInstance.value(),
    busy = busyName(explorer!),
    workerBusy = busyName(worker!);

  if (loadedTurn === null) {
    // The turn the game was saved on, as it was saved.
    loadedTurn = turn;
    knownBefore = known();
    explorerAt = explorer!.tile();

    if (busy !== 'Exploring' || !hasNote(exploreKey(explorer!))) {
      fail(`the Warrior wasn't exploring as loaded: ${busy}`);
    }

    if (
      !AUTOMATED.includes(workerBusy ?? '') ||
      !hasNote(automateKey(worker!))
    ) {
      fail(`the Settlers weren't automated as loaded: ${workerBusy}`);
    }
  } else if (loadedExploredTurns < LOADED_EXPLORE_TURNS) {
    if (busy !== 'Exploring' || !hasNote(exploreKey(explorer!))) {
      fail(`the Warrior stopped exploring on turn ${turn}: ${busy}`);
    }

    if (explorer!.tile() === explorerAt) {
      fail(`the Warrior didn't move on by itself on turn ${turn}`);
    }

    explorerAt = explorer!.tile();
    loadedExploredTurns++;

    if (
      loadedExploredTurns === LOADED_EXPLORE_TURNS &&
      known() <= knownBefore
    ) {
      fail(
        `the player knows no more of the map ${loadedExploredTurns} turns after the load`
      );
    }
  }

  if (finishedJobAt === null) {
    if (
      !AUTOMATED.includes(workerBusy ?? '') ||
      !hasNote(automateKey(worker!))
    ) {
      fail(
        `the Settlers stopped working on turn ${turn} before finishing a job: ${workerBusy}`
      );
    }

    if (
      jobTile !== null &&
      tileImprovementRegistryInstance.getByTile(jobTile).length >
        jobTileImprovements
    ) {
      finishedJobAt = jobTile;
    }

    if (workerBusy !== 'Automated' && worker!.tile() !== jobTile) {
      jobTile = worker!.tile();
      jobTileImprovements =
        tileImprovementRegistryInstance.getByTile(jobTile).length;
    }
  }

  if (
    turn < loadedTurn + TURNS &&
    (finishedJobAt === null || loadedExploredTurns < LOADED_EXPLORE_TURNS)
  ) {
    return;
  }

  if (loadedExploredTurns < LOADED_EXPLORE_TURNS) {
    fail(
      `the Warrior explored only ${loadedExploredTurns} turns after the load`
    );
  }

  if (finishedJobAt === null) {
    fail(`the Settlers finished no job in ${TURNS} turns after the load`);
  }

  console.log(
    `PASS standingOrders (loaded on turn ${loadedTurn}: the Warrior explored ${loadedExploredTurns} more turns and the player knows ${
      known() - knownBefore
    } more tiles, the Settlers finished a job by turn ${turn})`
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

const playTurn = (): Promise<void> => {
  if (mode === 'load') {
    return Promise.resolve(checkLoaded());
  }

  return orderTurn === null ? order() : check();
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
        .catch((error) => fail('the turn could not be played', error))
    );
  },
};

const humanClient = (player: Player): DataTransferClient => {
  humanPlayer = player;
  helper = new SimpleAIClient(player);

  return new DataTransferClient(
    player,
    transport as any,
    (channel, payload) => transport.send(channel, payload),
    () => {}
  );
};

// Nothing keeps the process alive between turns but the engine's own work, so a run that stalls just ends.
process.on('exit', (code: number): void => {
  if (code === 0 && !passed) {
    process.stderr.write(
      `FAIL standingOrders${
        mode === 'load' ? ' (loaded)' : ''
      }: the game stopped on turn ${turnInstance.value()} before the orders were checked\n`
    );
    process.exitCode = 1;
  }
});
process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

if (mode === 'load') {
  const { ids, game } = JSON.parse(readFileSync(file, 'utf8')) as {
    ids: { explorer: string; worker: string };
    game: SaveGame;
  };

  // No `engine.start()`: that is what generates a world. Plugins are imported for their rules, as the worker does.
  import('../../src/js/plugins')
    .then((): void => {
      restoreGame(game, (player: Player, human: boolean) =>
        human ? humanClient(player) : new SimpleAIClient(player)
      );

      if (!humanPlayer) {
        fail('the loaded game has no human player');
      }

      explorer = unitById(ids.explorer);
      worker = unitById(ids.worker);

      resumeGame();
    })
    .catch((error) => fail('failed to load the game', error));
} else {
  engine.on('engine:start', (): void => {
    // What a save needs, as `Game.start` registers them.
    engine.registerPlugins(plugins);
    registerClasses(defaultGame);
    registerDiplomacyClasses(defaultGame);
  });

  engine.on('engine:start', (): void => {
    new Array(config.players).fill(0).forEach((_, index): void => {
      const player = new Player();

      playerRegistryInstance.register(player);
      clientRegistryInstance.register(
        index === 0 ? humanClient(player) : new SimpleAIClient(player)
      );
    });
  });

  engine.setOption('players', config.players);
  engine.setOption('height', config.height);
  engine.setOption('width', config.width);

  engine.start();

  import('../../src/js/plugins')
    .then(() => engine.emit('plugins:load:end'))
    .catch((error) => fail('failed to load plugins', error));
}
