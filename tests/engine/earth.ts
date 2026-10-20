// An Earth game is played on the Earth map for the size asked for: Normal (80 × 50) is Civilization's own map, and
// Large (104 × 65) and Huge (128 × 80) have larger maps of their own. Every civilization starts on its start tile
// for that size. `tools/earth.js` runs this once per size, with all 14 civilizations.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import World from '@civ-clone/core-world/World';
import { earthMaps } from '@civ-clone/civ1-earth-generator/EarthMaps';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

const size = `${config.width} × ${config.height}`,
  failures: string[] = [];

let world: World | null = null,
  checks = 0;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL earth (${size}): ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

engine.on('world:built', (built: World): void => {
  world = built;
});

engine.on('game:start', (): void => {
  const map = earthMaps.find(
    ({ width, height }) => width === config.width && height === config.height
  );

  if (!map || !world) {
    fail(map ? 'no world was built' : 'there is no Earth map for this size');

    return;
  }

  expect(
    'the world is the size asked for',
    [world.width(), world.height()],
    [map.width, map.height]
  );

  expect(
    "the world's terrain is the map's",
    world
      .entries()
      .map((tile) => tile.terrain().constructor.name[0])
      .join(''),
    map.terrain.replace(/\n/g, '')
  );

  const players = playerRegistryInstance.entries();

  expect('all 14 civilizations are playing', players.length, 14);

  players.forEach((player: Player) => {
    const CivilizationType = player.civilization().sourceClass(),
      [, expected] =
        map.startTiles.find(([Type]) => Type === CivilizationType) ?? [],
      [unit] = unitRegistryInstance.getByPlayer(player),
      tile = unit?.tile();

    expect(
      `the ${CivilizationType.name} start on their start tile`,
      tile ? { x: tile.x(), y: tile.y() } : null,
      expected ?? null
    );
  });

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL earth (${size}: ${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS earth (${size}: ${checks} checks)\n`);
  process.exit(0);
});

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((): void => {
    const player = new Player();

    playerRegistryInstance.register(player);
    clientRegistryInstance.register(new SimpleAIClient(player));
  });
});

engine.setOption('earth', true);
engine.setOption('players', config.players);
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
