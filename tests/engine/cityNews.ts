// What a player is told about their cities (#400, #420). A city that grows or shrinks goes out to the UI with its new
//  size, and says nothing more: it shrinks for Settlers built and for want of an Aqueduct as well. Famine is announced.
//  A city lost to a rival, captured or (at size 1) destroyed by the capture, leaves one bubble notice beside End Turn,
//  and so does one destroyed some other way. A rival's city tells us nothing.
//
// Drives a seeded game with a human `DataTransferClient`, as `improvementObsolete` does. On the human's first turn the
// test founds a city with the starting Settlers, then builds more cities directly and makes things happen to them.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import FoodExhausted from '@civ-clone/core-city-growth/Rules/FoodExhausted';
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
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
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
    `FAIL cityNews: ${reason}\n${
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

const clear = (): void => {
  flush();
  objectsSent = [];
  notificationsSent = [];
};

// The size the patches carried for the city, if they carried one.
const sizeSent = (city: City): number | undefined =>
  objectsSent.find(
    (object) =>
      object._ === 'CityGrowth' &&
      object.id === cityGrowthRegistryInstance.getByCity(city).id() &&
      typeof object.size === 'number'
  )?.size;

const describe = (notifications: any[]): string =>
  JSON.stringify(
    notifications.map(({ key, bubble, data }) => ({
      key,
      bubble,
      city: data?.city?.name,
      player: (data?.player ?? data?.capturingPlayer)?.civilization,
    }))
  );

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

const expectNotifications = (
  what: string,
  expected: { key: string; bubble: boolean; player?: Player }[]
): void => {
  const matches =
    notificationsSent.length === expected.length &&
    expected.every(
      ({ key, bubble, player }, index) =>
        notificationsSent[index].key === key &&
        notificationsSent[index].bubble === bubble &&
        // A player we haven't met goes as a stand-in with an id of its own, so it's known by its civilization.
        (player === undefined ||
          (
            notificationsSent[index].data.player ??
            notificationsSent[index].data.capturingPlayer
          )?.civilization?.['#ref'] === player.civilization().id())
    );

  if (!matches) {
    fail(
      `${what}: expected ${JSON.stringify(
        expected.map(({ key, bubble }) => ({ key, bubble }))
      )}, got ${describe(notificationsSent)}`
    );
  }
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
    capitalGrowth = cityGrowthRegistryInstance.getByCity(capital);

  clear();

  // Growing: the new size goes out, and nothing is said.
  capitalGrowth.grow();
  await settle();
  flush();

  if (sizeSent(capital) !== 2) {
    fail(`the grown city went out with size ${sizeSent(capital)}, not 2`);
  }

  expectNotifications('a city growing', []);

  clear();

  // Shrinking, as building Settlers does: the new size goes out, and nothing is said.
  capitalGrowth.shrink();
  await settle();
  flush();

  if (sizeSent(capital) !== 1) {
    fail(`the shrunk city went out with size ${sizeSent(capital)}, not 1`);
  }

  expectNotifications('a city shrinking', []);

  growTo(capital, 2);
  await settle();
  clear();

  // Famine: announced, and the shrinking it causes says nothing more.
  ruleRegistryInstance.process(FoodExhausted, capitalGrowth);
  await settle();
  flush();

  if (capitalGrowth.size() !== 1) {
    fail('famine did not shrink the city');
  }

  expectNotifications('famine', [
    { key: 'City.food-storage-exhausted', bubble: false },
  ]);

  // Captured by a rival: one notice, beside End Turn.
  const captured = new City(humanPlayer!, site(capital.tile()), 'Captured');

  growTo(captured, 3);
  await settle();
  clear();

  captured.capture(rival);
  await settle();
  flush();

  if (captured.destroyed()) {
    fail('a size 3 city was destroyed by its capture');
  }

  expectNotifications('a city captured from us', [
    { key: 'City.captured-from-us', bubble: true, player: rival },
  ]);

  // Captured at size 1, which destroys it: one notice that says so, and none that it was captured.
  const razed = new City(humanPlayer!, site(capital.tile()), 'Razed');

  await settle();
  clear();

  razed.capture(rival);
  await settle();
  flush();

  if (!razed.destroyed()) {
    fail('a size 1 city survived its capture');
  }

  expectNotifications('a size 1 city captured from us', [
    { key: 'City.destroyed-by', bubble: true, player: rival },
  ]);

  // Starved at size 1: one notice that it's gone, and no famine.
  const starved = new City(humanPlayer!, site(capital.tile()), 'Starved');

  await settle();
  clear();

  ruleRegistryInstance.process(
    FoodExhausted,
    cityGrowthRegistryInstance.getByCity(starved)
  );
  await settle();
  flush();

  if (!starved.destroyed()) {
    fail('a size 1 city survived famine');
  }

  expectNotifications('a size 1 city starved', [
    { key: 'City.destroyed', bubble: true },
  ]);

  // A rival's city growing, starving and destroyed: nothing.
  const theirs = new City(rival, site(capital.tile()), 'Theirs');

  growTo(theirs, 2);
  await settle();
  clear();

  const theirGrowth = cityGrowthRegistryInstance.getByCity(theirs);

  theirGrowth.grow();
  [1, 2, 3].forEach(() =>
    ruleRegistryInstance.process(FoodExhausted, theirGrowth)
  );
  await settle();
  flush();

  if (!theirs.destroyed()) {
    fail("the rival's city survived three famines at size 3");
  }

  expectNotifications("a rival's city", []);

  console.log(
    "PASS cityNews (a city growing or shrinking goes out with its size, famine is announced, a city lost leaves one notice, a rival's city says nothing)"
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
