// A Settlers joins one of its player's cities through the action the UI sends, and the city's new size reaches the UI
//  with it (#243).
//
// Drives a seeded game with a human `DataTransferClient`, as `turnHandover` does. On the human's first turn the test
// founds a city with the starting Settlers, puts a second Settlers in it, and sends `JoinCity` for that unit the way
// the `b` key does. Joining grows the city with no `city:grow` event, so the size has to go out with the move.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Unit from '@civ-clone/core-unit/Unit';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let started = false,
  humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  // Every `CityGrowth` size a patch has carried since the join was sent, by the growth's id.
  sizesSent: { [id: string]: number[] } | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL joinCity: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const collectSizes = (value: any): void => {
  if (value === null || typeof value !== 'object') {
    return;
  }

  if (value._ === 'CityGrowth' && typeof value.size === 'number') {
    (sizesSent![value.id] ??= []).push(value.size);
  }

  Object.values(value).forEach(collectSizes);
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

const run = async (): Promise<void> => {
  const [founder] = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers);

  if (!founder) {
    fail('the human player has no Settlers to start with');
  }

  await unitAction(founder, 'FoundCity');

  const [city] = cityRegistryInstance.getByPlayer(humanPlayer!);

  if (!city) {
    fail('the starting Settlers could not found a city');
  }

  // With no home city, so the size can only reach the UI with the move, not with an update of the unit's own city.
  const cityGrowth = cityGrowthRegistryInstance.getByCity(city),
    sizeBefore = cityGrowth.size(),
    joiner = new Settlers(null, humanPlayer!, city.tile());

  await settle();

  if (
    !joiner
      .actions(city.tile())
      .some((action) => action.sourceClass().name === 'JoinCity')
  ) {
    fail('a Settlers in its own city is not offered JoinCity');
  }

  sizesSent = {};

  await unitAction(joiner, 'JoinCity');

  if (cityGrowth.size() !== sizeBefore + 1) {
    fail(
      `the city is size ${cityGrowth.size()} after the join, not ${
        sizeBefore + 1
      }`
    );
  }

  if (
    !joiner.destroyed() ||
    unitRegistryInstance.getByTile(city.tile()).includes(joiner)
  ) {
    fail('the Settlers is still on the map after joining');
  }

  const sent = sizesSent[cityGrowth.id()] ?? [];

  if (sent[sent.length - 1] !== sizeBefore + 1) {
    fail(
      `the UI was not sent the city's new size: it got ${
        sent.length ? sent.join(', ') : 'nothing'
      } for ${cityGrowth.id()}`
    );
  }

  console.log(
    `PASS joinCity (size ${sizeBefore} to ${cityGrowth.size()}, sent to the UI with the move)`
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

    if (channel === 'gameDataPatch' && sizesSent !== null) {
      collectSizes(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'turnStarted' && !started) {
      started = true;

      setTimeout(() =>
        run().catch((error) => fail('the join could not be played', error))
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
