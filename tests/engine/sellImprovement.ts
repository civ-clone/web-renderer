// Selling an improvement (#31): the city goes out with each improvement's sale value, a `SellImprovement` action sells
//  one for its cost in shields, 1 gold each, and the city then goes out without it. A city sells one improvement a
//  turn, so a second sale that turn is refused and the rest of its improvements go out with no sale value.
//
// Drives a seeded game with a human `DataTransferClient`, as `improvementObsolete` does. On the human's first turn the
// test founds a city, gives it a Temple and a Library, then sells the Temple and tries to sell the Library.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import {
  Library,
  Temple,
} from '@civ-clone/civ1-city-improvement/CityImprovements';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import { Gold } from '@civ-clone/civ1-treasury/Yields';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as cityImprovementRegistryInstance } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
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
    `FAIL sellImprovement: ${reason}\n${
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

// The city, as the last patches sent it, if they sent it in full.
const citySent = (city: City): any =>
  objectsSent.find(
    (object) => object._ === 'City' && object.id === city.id() && object.name
  );

// An improvement's sale value as the UI would get it, resolving the patch's refs.
const saleValueSent = (improvementId: string): number[] | null => {
  const improvement = objectsSent.find(
    (object) => object.id === improvementId && Array.isArray(object.saleValue)
  );

  return improvement
    ? improvement.saleValue.map(
        (saleValue: any) =>
          (saleValue.value ??
            objectsSent.find((object) => object.id === saleValue['#ref'])
              ?.value) as number
      )
    : null;
};

const sell = (city: City, improvementId: string): Promise<void> =>
  Promise.resolve(
    actionHandler!({
      name: 'SellImprovement',
      id: city.id(),
      improvement: improvementId,
      treasury: playerTreasuryRegistryInstance
        .getByPlayerAndType(humanPlayer!, Gold)
        .id(),
    })
  ).then(settle);

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

  const temple = new Temple(city),
    library = new Library(city),
    treasury = playerTreasuryRegistryInstance.getByPlayerAndType(
      humanPlayer!,
      Gold
    );

  cityImprovementRegistryInstance.register(temple, library);
  treasury.set(0);

  flush();
  objectsSent = [];

  // The city as the UI gets it, with what each improvement sells for.
  collectObjects(
    JSON.parse(JSON.stringify((humanClient as any).serialiseCity(city)))
  );

  if (JSON.stringify(saleValueSent(temple.id())) !== '[40]') {
    fail(
      `expected the Temple to go out selling for 40, got ${JSON.stringify(
        saleValueSent(temple.id())
      )}`
    );
  }

  objectsSent = [];

  await sell(city, temple.id());
  flush();

  if (!temple.destroyed() || treasury.value() !== 40) {
    fail(
      `selling the Temple left it ${
        temple.destroyed() ? 'gone' : 'standing'
      } and the treasury at ${treasury.value()}, not 40`
    );
  }

  const sent = citySent(city);

  if (!sent) {
    fail('the city that sold its Temple was not sent to the UI');
  }

  if (JSON.stringify(sent.improvements ?? null).includes(temple.id())) {
    fail('the city was sent still holding its Temple');
  }

  if (JSON.stringify(saleValueSent(library.id())) !== '[]') {
    fail(
      `expected the Library to go out with no sale value once the city had sold, got ${JSON.stringify(
        saleValueSent(library.id())
      )}`
    );
  }

  // One sale a turn.
  await sell(city, library.id());
  flush();

  if (library.destroyed() || treasury.value() !== 40) {
    fail('the city sold a second improvement in the same turn');
  }

  console.log(
    'PASS sellImprovement (the Temple goes out selling for 40, sells, and the city goes out without it; a second sale that turn is refused)'
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
