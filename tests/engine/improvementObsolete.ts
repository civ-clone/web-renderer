// Barracks going obsolete (#184): when the engine raises `city-improvement:obsolete` for our player, the cities that
//  lost a Barracks go out to the UI without it, and the player is told, even when there were none to remove. Another
//  player's obsolescence sends nothing.
//
// Drives a seeded game with a human `DataTransferClient`, as `civilDisorder` does. On the human's first turn the test
// founds a city, gives it a Barracks and flushes the queue, then grants Gunpowder (so civ1-city-improvement's rule
// raises the event), then Combustion with no Barracks left, then Gunpowder to a computer player.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import { Combustion, Gunpowder } from '@civ-clone/civ1-science/Advances';
import { Barracks } from '@civ-clone/civ1-city-improvement/CityImprovements';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { Settlers } from '@civ-clone/civ1-unit/Units';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as cityImprovementRegistryInstance } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
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
  objectsSent: any[] = [],
  // Every notification sent since it was last cleared.
  notificationsSent: any[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL improvementObsolete: ${reason}\n${
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

const obsoleteNotices = (): any[] =>
  notificationsSent.filter(
    (notification) => notification.key === 'CityImprovement.obsolete'
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

  const barracks = new Barracks(city);

  cityImprovementRegistryInstance.register(barracks);

  flush();
  objectsSent = [];
  notificationsSent = [];

  playerResearchRegistryInstance
    .getByPlayer(humanPlayer!)
    .addAdvance(Gunpowder);
  await settle();
  flush();

  if (!barracks.destroyed()) {
    fail('discovering Gunpowder left the Barracks standing');
  }

  const sent = citySent(city);

  if (!sent) {
    fail('the city that lost its Barracks was not sent to the UI');
  }

  if (JSON.stringify(sent.improvements ?? null).includes(barracks.id())) {
    fail('the city was sent still holding its Barracks');
  }

  const [notice] = obsoleteNotices();

  if (
    obsoleteNotices().length !== 1 ||
    notice.data.improvement !== 'Barracks' ||
    notice.data.advance?._ !== 'Gunpowder'
  ) {
    fail(
      `expected one notice for Gunpowder making Barracks obsolete, got ${JSON.stringify(
        obsoleteNotices()
      )}`
    );
  }

  objectsSent = [];
  notificationsSent = [];

  // No Barracks left: told all the same, and no city needs sending.
  playerResearchRegistryInstance
    .getByPlayer(humanPlayer!)
    .addAdvance(Combustion);
  await settle();
  flush();

  if (
    obsoleteNotices().length !== 1 ||
    obsoleteNotices()[0].data.advance?._ !== 'Combustion'
  ) {
    fail(
      `expected one notice for Combustion with no Barracks, got ${JSON.stringify(
        obsoleteNotices()
      )}`
    );
  }

  notificationsSent = [];

  const [rival] = playerRegistryInstance
    .entries()
    .filter((player) => player !== humanPlayer);

  playerResearchRegistryInstance.getByPlayer(rival).addAdvance(Gunpowder);
  await settle();
  flush();

  if (obsoleteNotices().length !== 0) {
    fail("another player's Barracks going obsolete was sent to us");
  }

  console.log(
    "PASS improvementObsolete (the city goes out without its Barracks, the notice is sent with or without Barracks, a rival's is not)"
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

    if (channel === 'gameNotification') {
      // Sent as `{ hierarchy, objects }`: resolve the notification and the refs in its data.
      const { hierarchy, objects } = JSON.parse(JSON.stringify(data)),
        resolve = (value: any): any =>
          value && typeof value === 'object' && '#ref' in value
            ? objects[value['#ref']]
            : value,
        notification = resolve(hierarchy);

      notificationsSent.push({
        ...notification,
        data: Object.fromEntries(
          Object.entries(notification.data ?? {}).map(([key, value]) => [
            key,
            resolve(value),
          ])
        ),
      });

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
