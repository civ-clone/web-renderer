// A Caravan walks into a rival's city and sets up a trade route through the action the UI sends (#57). The goods
//  sell for gold, the player is told, and the home city's trade routes reach the UI with the move. Then a second
//  Caravan helps its city build a Wonder, and the shields reach the UI too.
//
// Drives a seeded game with a human `DataTransferClient`, as `joinCity` does. On the human's first turn the test founds
// a city with the starting Settlers, puts a computer player's city a few tiles away, and a Caravan from the new city
// next to it, then sends `EstablishTradeRoute` the way the arrow keys do. The queue is flushed first, as `joinCity`
// explains.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import { Caravan, Settlers } from '@civ-clone/civ1-unit/Units';
import { BronzeWorking } from '@civ-clone/civ1-science/Advances';
import Buildable from '@civ-clone/core-city-build/Buildable';
import { Colossus } from '@civ-clone/civ1-wonder/Wonders';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import { Gold } from '@civ-clone/civ1-city/Yields';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as tradeRouteRegistryInstance } from '@civ-clone/core-city/TradeRouteRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { goods } from '@civ-clone/civ1-unit/Rules/Unit/tradeRouteEstablished';
import { reconstituteData } from '../../src/js/UI/lib/reconstituteData';

let started = false,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  // The latest `tradeRoutes` the UI has been sent for each city, by its id.
  routesSent: { [id: string]: any } = {},
  // The latest value the UI has been sent for each `BuildProgress`, by its id.
  progressSent: { [id: string]: number } = {};

// What the UI is sent on `gameNotification`, rebuilt as `WorkerTransport` rebuilds it.
const notifications: any[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL tradeRoutes: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const collectRoutes = (value: any): void => {
  if (value === null || typeof value !== 'object') {
    return;
  }

  if (value._ === 'City' && 'tradeRoutes' in value) {
    routesSent[value.id] = value.tradeRoutes;
  }

  // A `CityBuild` holds its progress by reference, and the `BuildProgress` goes out as an object of its own.
  if (value._ === 'BuildProgress' && typeof value.value === 'number') {
    progressSent[value.id] = value.value;
  }

  Object.values(value).forEach(collectRoutes);
};

const unitAction = (unit: Unit, name: string, target: Tile): Promise<void> => {
  const playerTile = playerWorldRegistryInstance
    .getByPlayer(humanPlayer!)
    .getByTile(target);

  if (!playerTile) {
    fail(`the player has not seen the tile ${unit.id()} is heading for`);
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

const gold = (): number =>
  playerTreasuryRegistryInstance.getByPlayerAndType(humanPlayer!, Gold).value();

const run = async (): Promise<void> => {
  const [founder] = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .filter((unit) => unit instanceof Settlers);

  if (!founder) {
    fail('the human player has no Settlers to start with');
  }

  await unitAction(founder, 'FoundCity', founder.tile());

  const [home] = cityRegistryInstance.getByPlayer(humanPlayer!);

  if (!home) {
    fail('the starting Settlers could not found a city');
  }

  // A land tile a few tiles away, with a free land tile beside it for the Caravan.
  const rival = playerRegistryInstance
      .entries()
      .find((player) => player !== humanPlayer)!,
    playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!),
    [site, approach] = home
      .tile()
      .getSurroundingArea(4)
      .entries()
      .filter(
        (tile) =>
          tile.isLand() &&
          tile.distanceFrom(home.tile()) >= 3 &&
          cityRegistryInstance.getByTile(tile) === null &&
          unitRegistryInstance.getByTile(tile).length === 0
      )
      .flatMap((tile): [Tile, Tile][] =>
        tile
          .getNeighbours()
          .filter(
            (neighbour) =>
              neighbour.isLand() &&
              cityRegistryInstance.getByTile(neighbour) === null &&
              unitRegistryInstance.getByTile(neighbour).length === 0
          )
          .map((neighbour): [Tile, Tile] => [tile, neighbour])
      )[0] ?? [null, null];

  if (!site || !approach) {
    fail('no land near the city for a rival city and a Caravan beside it');
  }

  const partner = new City(rival, site!, 'Partner');

  [site!, approach!].forEach((tile) => playerWorld.register(tile));

  const caravan = new Caravan(home, humanPlayer!, approach!);

  await settle();
  (humanClient as any).sendPatchData();

  if (
    !caravan
      .actions(site!)
      .some((action) => action.sourceClass().name === 'EstablishTradeRoute')
  ) {
    fail("a Caravan next to a rival's city is not offered EstablishTradeRoute");
  }

  const goldBefore = gold();

  await unitAction(caravan, 'EstablishTradeRoute', site!);

  if (!caravan.destroyed()) {
    fail('the Caravan is still on the map after setting up the route');
  }

  const routes = tradeRouteRegistryInstance.getByCity(home);

  if (routes.length !== 1 || routes[0].to() !== partner) {
    fail(`the home city holds ${routes.length} route(s), not one to Partner`);
  }

  if (gold() <= goldBefore) {
    fail(
      `the goods sold for nothing: gold went from ${goldBefore} to ${gold()}`
    );
  }

  const told = notifications.find(
    (notification) => notification.key === 'Unit.trade-route-established'
  );

  if (!told) {
    fail(
      `the player was not told: ${JSON.stringify(
        notifications.map((notification) => notification.key)
      )}`
    );
  }

  const { bonus, city: toldCity, goods: toldGoods, home: toldHome } = told.data;

  if (
    toldHome?.name !== home.name() ||
    toldCity?.name !== 'Partner' ||
    !goods.includes(toldGoods) ||
    bonus !== gold() - goldBefore
  ) {
    fail(
      `the notification doesn't say what happened: ${JSON.stringify({
        home: toldHome?.name,
        city: toldCity?.name,
        goods: toldGoods,
        bonus,
      })}`
    );
  }

  const sent = routesSent[home.id()];

  if (!Array.isArray(sent) || sent.length !== 1 || sent[0].name !== 'Partner') {
    fail(
      `the UI was not sent the home city's route: it holds ${JSON.stringify(
        sent
      )}`
    );
  }

  // A second Caravan helps the city build the Colossus.
  playerResearchRegistryInstance
    .getByPlayer(humanPlayer!)
    .addAdvance(BronzeWorking);

  const cityBuild = cityBuildRegistryInstance.getByCity(home);

  cityBuild.build(Colossus as unknown as typeof Buildable);

  const [besideHome] = home
      .tile()
      .getNeighbours()
      .filter(
        (tile) =>
          tile.isLand() &&
          cityRegistryInstance.getByTile(tile) === null &&
          unitRegistryInstance
            .getByTile(tile)
            .every((unit) => unit.player() === humanPlayer)
      ),
    // With no home city, so it isn't the Caravan's home going out, as it does when a unit is used up, that carries the
    //  city's build.
    helper2 = new Caravan(null, humanPlayer!, besideHome);

  playerWorld.register(besideHome);

  await settle();
  (humanClient as any).sendPatchData();

  const progressBefore = cityBuild.progress().value();

  if (
    !helper2
      .actions(home.tile())
      .some((action) => action.sourceClass().name === 'HelpBuildWonder')
  ) {
    fail(
      'a Caravan next to its city building a Wonder is not offered HelpBuildWonder'
    );
  }

  await unitAction(helper2, 'HelpBuildWonder', home.tile());

  if (cityBuild.progress().value() !== progressBefore + 50) {
    fail(
      `the Colossus has ${cityBuild.progress().value()} shields, not ${
        progressBefore + 50
      }`
    );
  }

  const progressId = cityBuild.progress().id();

  if (progressSent[progressId] !== progressBefore + 50) {
    fail(
      `the UI was not sent the new shields: it holds ${progressSent[progressId]} for ${progressId}`
    );
  }

  console.log(
    `PASS tradeRoutes (the goods sold for ${
      gold() - goldBefore
    } gold; the route to Partner, +${
      sent[0].trade
    } trade, was sent with the move; a Caravan's 50 shields reached the UI)`
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
      notifications.push(reconstituteData(JSON.parse(JSON.stringify(data))));

      return;
    }

    if (channel === 'gameDataPatch') {
      collectRoutes(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'turnStarted' && !started) {
      started = true;

      setTimeout(() =>
        run().catch((error) => fail('the route could not be set up', error))
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
