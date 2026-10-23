// A city lost or won reaches the player's other cities (#515). Losing the capital moves every other city's corruption
//  to its furthest, and a city won or lost can bring or take a wonder that works in all of them, so each of the
//  player's remaining cities goes out in full, with its yields as the engine has them now, when one of its cities is
//  captured, when it captures one, and when one is destroyed. The whole player that goes with a loss sends the cities
//  as refs, and the turn's hand-over, which sends them in full, can be turns away.
//
// Drives a seeded game with a human `DataTransferClient`, as `cityNews` does. On the human's first turn the test founds
//  its capital with the starting Settlers, builds two more cities directly, and has a rival take the capital.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import { Corruption } from '@civ-clone/civ1-city/Yields';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import Tile from '@civ-clone/core-world/Tile';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let started = false,
  checks = 0,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  // Every object the patches sent since the last `clear()`, by id.
  objectsSent: Map<string, any> = new Map();

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL lostCityCorruption: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const collectObjects = (value: any): void => {
  if (value === null || typeof value !== 'object') {
    return;
  }

  if (typeof value._ === 'string' && typeof value.id === 'string') {
    objectsSent.set(value.id, value);
  }

  Object.values(value).forEach(collectObjects);
};

// The UI can't ask for a flush, but the engine sends whatever is queued at the end of every action and turn.
const flush = (): void => humanClient!.flush();

const clear = (): void => {
  flush();
  objectsSent = new Map();
};

const resolve = (value: any): any =>
  value && typeof value === 'object' && '#ref' in value
    ? objectsSent.get(value['#ref'])
    : value;

// A city's corruption as the engine works it out now: how much, and the distance to the capital it was measured over.
const corruptionNow = (city: City): string =>
  JSON.stringify(
    city
      .yields()
      .find((cityYield) => cityYield instanceof Corruption)!
      .values()
  );

// The corruption the patches carried for the city, if they carried the city in full.
const corruptionSent = (city: City): string | undefined => {
  const sentCity = objectsSent.get(city.id());

  if (sentCity === undefined || !Array.isArray(sentCity.yields)) {
    return undefined;
  }

  const corruption = sentCity.yields
    .map(resolve)
    .find((cityYield: any) => cityYield?._ === 'Corruption');

  return corruption === undefined
    ? undefined
    : JSON.stringify(corruption.values);
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
          .every((city) => city.tile().distanceFrom(tile) >= 4)
    );

  if (!tile) {
    fail('there is no room for another city');
  }

  return tile!;
};

const growTo = (city: City, size: number): void => {
  const cityGrowth = cityGrowthRegistryInstance.getByCity(city);

  while (cityGrowth.size() < size) {
    cityGrowth.grow();
  }
};

// Each city went out in full, with the corruption the engine has for it now.
const expectSentInFull = (what: string, cities: City[]): void => {
  cities.forEach((city) => {
    checks++;

    const sent = corruptionSent(city);

    if (sent === undefined) {
      fail(
        `${what}: ${city.name()} was not sent in full (${
          objectsSent.has(city.id()) ? 'no corruption in it' : 'not at all'
        })`
      );
    }

    if (sent !== corruptionNow(city)) {
      fail(
        `${what}: ${city.name()} went out with corruption ${sent}, not ${corruptionNow(
          city
        )}`
      );
    }
  });
};

const run = async (): Promise<void> => {
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

  const [capital] = cityRegistryInstance.getByPlayer(humanPlayer!);

  if (!capital) {
    fail('the starting Settlers could not found a city');
  }

  const [rival] = playerRegistryInstance
      .entries()
      .filter((player) => player !== humanPlayer),
    others = ['Antium', 'Veii'].map(
      (name) => new City(humanPlayer!, site(capital.tile()), name)
    );

  [capital, ...others].forEach((city) => growTo(city, 3));
  await settle();
  clear();

  // The capital lost: the others' corruption is measured over the furthest distance now, and each goes in full.
  const before = others.map(corruptionNow);

  capital.capture(rival);
  await settle();
  flush();

  if (capital.destroyed() || capital.player() !== rival) {
    fail('the capital was not captured');
  }

  others.forEach((city, index) => {
    checks++;

    if (corruptionNow(city) === before[index]) {
      fail(
        `losing the capital did not change ${city.name()}'s corruption (${
          before[index]
        }), so there is nothing to check`
      );
    }
  });

  expectSentInFull('the capital captured from us', others);

  // A city won: ours go in full as well, as it may bring a wonder with it.
  const theirs = new City(rival, site(capital.tile()), 'Theirs');

  growTo(theirs, 3);
  await settle();
  clear();

  theirs.capture(humanPlayer!);
  await settle();
  flush();

  if (theirs.player() !== humanPlayer) {
    fail("the rival's city was not captured");
  }

  expectSentInFull('a city captured by us', others);

  // One of ours destroyed, here with no one to blame: the rest go in full.
  clear();

  theirs.destroy();
  await settle();
  flush();

  expectSentInFull('a city of ours destroyed', others);

  console.log(
    `PASS lostCityCorruption (${checks} checks: a city lost, won or destroyed sends the player's other cities in full, with their corruption as it is now)`
  );

  process.exit(0);
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

    if (channel === 'gameDataPatch') {
      collectObjects(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'turnStarted' && !started) {
      started = true;

      setTimeout(() =>
        run().catch((error) => fail('the test could not be played', error))
      );
    }
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

engine.setOption('players', config.players);
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
