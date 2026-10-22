// A player can be added to a game that's already running (#168). In a seeded game of computer players, civ1-player's
//  `addPlayer` brings in a new one part-way through turn 10, the host answers `player:spawned` with a client as
//  src/js/Engine/Game.ts does, and the `Spawn` rules give it a Settlers. It doesn't move on turn 10, the turn it
//  joined part-way through; it takes its turn from turn 11; and a save keeps the player, its world and its client.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import Built from '@civ-clone/core-world/Rules/Built';
import Effect from '@civ-clone/core-rule/Effect';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Spawn from '@civ-clone/core-player/Rules/Spawn';
import World from '@civ-clone/core-world/World';
import addPlayer from '@civ-clone/civ1-player/lib/addPlayer';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { gameForLoad } from '@civ-clone/core-save-game/gameForLoad';
import { hydrate } from '@civ-clone/core-save-game/hydrate';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { save } from '@civ-clone/core-save-game/save';

const ADD_ON = 10,
  STOP_ON = 13;

let world: World | null = null,
  added: Player | null = null,
  stopped = false;

const turnsTaken: number[] = [];

const fail: (reason: string, error?: unknown) => never = (
  reason: string,
  error?: unknown
): never => {
  process.stderr.write(
    `FAIL addPlayer: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const finish = (): void => {
  stopped = true;

  if (added === null) {
    fail('no player was added');
  }

  if (turnsTaken[0] !== ADD_ON + 1) {
    fail(`the new player first moved on turn ${turnsTaken[0]}`);
  }

  if (!turnsTaken.includes(ADD_ON + 2)) {
    fail(`the new player moved on turns ${turnsTaken.join(', ')}`);
  }

  const file = save(defaultGame, { name: 'addPlayer' }),
    id = added!.id();

  if (!(file.registries.players ?? []).includes(id)) {
    fail('the save left the new player out of the players');
  }

  if (
    !file.clients.some(
      ({ module, playerId }) => module === 'SimpleAIClient' && playerId === id
    )
  ) {
    fail(
      `the save has no client for the new player: ${JSON.stringify(
        file.clients
      )}`
    );
  }

  if (defaultGame.playerWorlds.getByPlayer(added!) === undefined) {
    fail('the new player has no PlayerWorld');
  }

  // Loaded into a game of its own, as a fresh worker loads it.
  const loaded = gameForLoad({
    classes: defaultGame.classes,
    engine: defaultGame.engine,
    rules: defaultGame.rules,
  });

  hydrate(file, loaded);

  const [restored] = loaded.players.getBy('id', id);

  if (
    !restored ||
    restored.civilization().constructor !== added!.civilization().constructor
  ) {
    fail('the load lost the new player, or its civilization');
  }

  if (!loaded.playerWorlds.getByPlayer(restored)) {
    fail("the load lost the new player's world");
  }

  console.log(
    `PASS addPlayer (joined on turn ${ADD_ON} as ${
      added!.civilization().constructor.name
    }, moved on turns ${turnsTaken.join(', ')}, and a save and load keep it)`
  );

  process.exit(0);
};

// The world is only handed out by `Built`.
ruleRegistryInstance.register(
  new Built(
    new Effect((built: World): void => {
      world = built;
    })
  )
);

// Part-way through turn 10, as the first player's turn starts: the way a player comes into a game being played.
engine.on('player:turn-start', (player: Player): void => {
  if (player === added) {
    turnsTaken.push(defaultGame.turn.value());
  }

  if (added === null && defaultGame.turn.value() === ADD_ON) {
    added = addPlayer(defaultGame, world!);

    // Somewhere on land with nothing on it.
    const tile = world!
      .entries()
      .find(
        (tile) =>
          tile.isLand() &&
          unitRegistryInstance.getByTile(tile).length === 0 &&
          cityRegistryInstance.getByTile(tile) === null
      );

    if (!tile) {
      fail('no empty land for the new player');
    }

    ruleRegistryInstance.process(Spawn, added, tile);

    if (unitRegistryInstance.getByPlayer(added).length === 0) {
      fail('the new player was given no units');
    }
  }
});

engine.on('turn:start', (turn: number): void => {
  if (stopped) {
    return;
  }

  if (turn >= STOP_ON) {
    finish();
  }
});

// Before the players claim their civilizations, as src/js/Engine/Game.ts does, so a save can name them.
engine.on('engine:start', (): void => {
  registerClasses(defaultGame);
});

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((): void => {
    const player = new Player();

    clientRegistryInstance.register(new SimpleAIClient(player));
    playerRegistryInstance.register(player);
  });
});

engine.setOption('players', config.players);
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(({ plugins }) => {
    // The manifest a save records, as src/js/Engine/Game.ts registers it.
    engine.registerPlugins(plugins);
    engine.emit('plugins:load:end');
  })
  .catch((error) => fail('failed to load plugins', error));
