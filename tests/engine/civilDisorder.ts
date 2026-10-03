// A city going into civil disorder, or out of it, sends its tile to the UI with the city in full, so the map can swap
//  the city's size for an unhappy citizen and back (#193).
//
// Drives a seeded game with a human `DataTransferClient`, as `joinCity` does. On the human's first turn the test
// founds a city, flushes the queue, then raises `city:civil-disorder` and `city:order-restored` as the TurnStart rules
// would, and checks what the next patch carries. The queue is flushed first because the client builds each queued
// patch only when it sends it: anything still queued from founding the city would carry the tile anyway.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let started = false,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  // Every object the patches sent since the last `flush()`.
  objectsSent: any[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL civilDisorder: ${reason}\n${
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

  if (typeof value._ === 'string') {
    objectsSent.push(value);
  }

  Object.values(value).forEach(collectObjects);
};

// `sendPatchData` is private: the UI can't ask for it, but the engine sends whatever is queued at the end of every
//  action and turn.
const flush = (): void => (humanClient as any).sendPatchData();

const tileSentWithCity = (city: City): boolean =>
  objectsSent.some(
    (object) =>
      object._ === 'PlayerTile' &&
      object.x === city.tile().x() &&
      object.y === city.tile().y()
  ) &&
  objectsSent.some(
    (object) =>
      object._ === 'City' &&
      object.id === city.id() &&
      typeof object.civilDisorder === 'boolean'
  );

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

  const [city] = cityRegistryInstance.getByPlayer(humanPlayer!);

  if (!city) {
    fail('the starting Settlers could not found a city');
  }

  for (const event of ['city:civil-disorder', 'city:order-restored']) {
    flush();
    objectsSent = [];

    engine.emit(event, city);
    flush();

    if (!tileSentWithCity(city)) {
      fail(`${event} did not send the city's tile with the city in full`);
    }
  }

  console.log(
    'PASS civilDisorder (the city tile goes out on disorder and on order restored)'
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
