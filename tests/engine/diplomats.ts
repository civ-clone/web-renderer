// A Diplomat's work through the actions the UI sends (#58): stealing an advance, sabotage, establishing an embassy,
//  investigating a city, meeting the king, inciting a city's revolt, and bribing a unit. Each tells the player, and
//  what changed hands reaches the UI with the move.
//
// Drives a seeded game with a human `DataTransferClient`, as `tradeRoutes` does. On the human's first turn the test
// founds a city, puts a computer player's city of size 3 a few tiles away with a Warrior in it, gives the human gold,
// and sends Diplomats from beside it. The queue is flushed before each action, as `joinCity` explains.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import {
  Chariot,
  Diplomat,
  Settlers,
  Warrior,
} from '@civ-clone/civ1-unit/Units';
import { BronzeWorking } from '@civ-clone/civ1-science/Advances';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import { IntelligenceRow } from '../../src/js/Engine/lib/intelligence';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import { Peace } from '@civ-clone/library-diplomacy/Declarations';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import { Gold } from '@civ-clone/civ1-city/Yields';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityImprovementRegistryInstance } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import { Palace } from '@civ-clone/library-city/CityImprovements';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { reconstituteData } from '../../src/js/UI/lib/reconstituteData';

let started = false,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  // What the UI asks for and gets back, by channel.
  requestHandlers: { [channel: string]: (value: any) => unknown } = {},
  requested: { [channel: string]: any } = {},
  // The investigated city, as `WorkerTransport` rebuilds it.
  investigated: any = null,
  embassyWith: string | null = null,
  negotiationSteps = 0,
  pendingChoice: ((value: any) => void) | null = null,
  // The owner the UI was last sent for each unit and city, by its id.
  ownersSent: { [id: string]: string } = {},
  // The units the UI was last sent for each of the player's tiles, by its id.
  tileUnitsSent: { [id: string]: string[] } = {};

// What the UI is sent on `gameNotification`, rebuilt as `WorkerTransport` rebuilds it.
const notifications: any[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL diplomats: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const collect = (value: any): void => {
  if (value === null || typeof value !== 'object') {
    return;
  }

  const owner = value.player?.id ?? value.player?.['#ref'];

  if (typeof value.id === 'string' && typeof owner === 'string') {
    ownersSent[value.id] = owner;
  }

  if (value._ === 'PlayerTile' && Array.isArray(value.units)) {
    tileUnitsSent[value.id] = value.units.map(
      (unit: any) => unit.id ?? unit['#ref']
    );
  }

  Object.values(value).forEach(collect);
};

const flush = async (): Promise<void> => {
  await settle();

  // `sendPatchData` is private: the UI can't ask for it, but a real game has long since sent everything by now.
  (humanClient as any).sendPatchData();
};

const unitAction = (unit: Unit, name: string, target: Tile): Promise<void> => {
  const playerTile = playerWorldRegistryInstance
    .getByPlayer(humanPlayer!)
    .getByTile(target);

  if (!playerTile) {
    fail(`the player has not seen the tile ${unit.id()} is acting on`);
  }

  if (
    !unit.actions(target).some((action) => action.sourceClass().name === name)
  ) {
    fail(`${unit.id()} is not offered ${name}`);
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

const told = (key: string): any => {
  const notification = notifications.find(
    (notification) => notification.key === key
  );

  if (!notification) {
    fail(
      `the player was not told ${key}: ${JSON.stringify(
        notifications.map((notification) => notification.key)
      )}`
    );
  }

  return notification;
};

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

  // A land tile a few tiles away for the rival city, with free land tiles around it for the Diplomats.
  const rival = playerRegistryInstance
      .entries()
      .find((player) => player !== humanPlayer)!,
    playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!),
    free = (tile: Tile): boolean =>
      tile.isLand() &&
      cityRegistryInstance.getByTile(tile) === null &&
      unitRegistryInstance.getByTile(tile).length === 0,
    [site] = home
      .tile()
      .getSurroundingArea(5)
      .entries()
      .filter(
        (tile) =>
          free(tile) &&
          tile.distanceFrom(home.tile()) >= 4 &&
          tile.getNeighbours().filter(free).length >= 6
      );

  if (!site) {
    fail('no land near the city for a rival city with room around it');
  }

  const target = new City(rival, site, 'Target'),
    beside = site.getNeighbours().filter(free),
    cityGrowth = cityGrowthRegistryInstance.getByCity(target);

  while (cityGrowth.size() < 3) {
    cityGrowth.grow();
  }

  const garrison = new Warrior(target, rival, site);

  playerResearchRegistryInstance.getByPlayer(rival).addAdvance(BronzeWorking);
  playerTreasuryRegistryInstance
    .getByPlayerAndType(humanPlayer!, Gold)
    .add(5000);
  playerWorld.register(
    site,
    ...site.getNeighbours(),
    ...beside.flatMap((tile) => tile.getNeighbours())
  );

  const diplomatAt = (tile: Tile): Unit =>
    new Diplomat(home, humanPlayer!, tile);

  // Stealing.
  const thief = diplomatAt(beside[0]);

  await flush();
  await unitAction(thief, 'StealTechnology', site);

  // Whichever advance it took (the rival may know others the player doesn't), the player now knows it and is told
  //  which.
  const stolen = told('Diplomat.advance-stolen').data.advance,
    known = playerResearchRegistryInstance
      .getByPlayer(humanPlayer!)
      .complete()
      .map((advance) => advance.sourceClass().name);

  if (!known.includes(stolen) || !thief.destroyed()) {
    fail(
      `stealing ${stolen} left the player knowing ${known.join(
        ', '
      )}, the Diplomat ${thief.destroyed() ? 'used up' : 'still there'}`
    );
  }

  // Sabotage.
  const saboteur = diplomatAt(beside[1]);

  await flush();
  await unitAction(saboteur, 'IndustrialSabotage', site);

  if (
    !notifications.some((notification) =>
      notification.key.startsWith('Diplomat.sabotaged.')
    )
  ) {
    fail('the player was not told of the sabotage');
  }

  // Establishing an embassy: the UI is told to open the report on the rival, which now has the rival's details.
  const envoy = diplomatAt(beside[5]),
    rivalCivilization = rival.civilization().sourceClass().name;

  await flush();
  await unitAction(envoy, 'EstablishEmbassy', site);

  if (!envoy.destroyed() || embassyWith !== rivalCivilization) {
    fail(
      `establishing an embassy left the Diplomat ${
        envoy.destroyed() ? 'used up' : 'still there'
      } and the UI was told ${embassyWith}`
    );
  }

  requestHandlers.intelligence(null);

  const report = (requested.intelligence as IntelligenceRow[]).find(
    (row) => row.civilization === rivalCivilization
  );

  if (
    !report?.details ||
    report.details.capital?.name !== 'Target' ||
    !report.details.advances.includes('BronzeWorking') ||
    report.details.units < 2
  ) {
    fail(`the intelligence report reads ${JSON.stringify(report)}`);
  }

  // Investigating: the city is sent once, in full, and its owner only as a civilization.
  const investigator = diplomatAt(beside[0]);

  await flush();
  await unitAction(investigator, 'InvestigateCity', site);

  if (
    !investigator.destroyed() ||
    investigated?.name !== 'Target' ||
    investigated.growth?.size !== cityGrowth.size() ||
    !Array.isArray(investigated.tiles) ||
    investigated.player?.treasuries !== undefined ||
    investigated.player?.cities !== undefined
  ) {
    fail(
      `investigating sent ${JSON.stringify({
        name: investigated?.name,
        size: investigated?.growth?.size,
        tiles: investigated?.tiles?.length,
        player: Object.keys(investigated?.player ?? {}),
      })}`
    );
  }

  // Meeting the king: talks with the rival open, and the Diplomat stays, with no moves left.
  const ambassador = diplomatAt(beside[1]),
    talksBefore = interactionRegistryInstance
      .getByPlayers(humanPlayer!, rival)
      .filter((interaction) => interaction instanceof Negotiation).length;

  ambassador.moves().set(1);

  await flush();
  await unitAction(ambassador, 'MeetWithKing', site);

  if (
    ambassador.destroyed() ||
    ambassador.moves().value() !== 0 ||
    negotiationSteps === 0 ||
    interactionRegistryInstance
      .getByPlayers(humanPlayer!, rival)
      .filter((interaction) => interaction instanceof Negotiation).length !==
      talksBefore + 1
  ) {
    fail(
      `meeting the king left the Diplomat ${
        ambassador.destroyed() ? 'used up' : 'there'
      } with ${ambassador
        .moves()
        .value()} moves, after ${negotiationSteps} steps of talks`
    );
  }

  // The talks may have ended in peace, which would make inciting below the peace-breaking kind.
  interactionRegistryInstance
    .getByPlayers(humanPlayer!, rival)
    .filter(
      (interaction): interaction is Peace =>
        interaction instanceof Peace && interaction.active()
    )
    .forEach((peace) => peace.expire());

  // Bribing a lone rival unit beside the city.
  const chariot = new Chariot(target, rival, beside[2]),
    briber = diplomatAt(beside[3]);

  await flush();
  await unitAction(briber, 'BribeUnit', beside[2]);

  if (chariot.player() !== humanPlayer) {
    fail('the bribed Chariot did not change sides');
  }

  if (ownersSent[chariot.id()] !== humanPlayer!.id()) {
    fail(`the UI holds ${ownersSent[chariot.id()]} as the Chariot's owner`);
  }

  if (briber.destroyed() || briber.moves().value() === 0) {
    fail('bribing used the Diplomat up');
  }

  // Inciting the city's revolt. It's the rival's first city, so it was given the Palace, and a capital can't be
  //  incited: the Palace goes.
  cityImprovementRegistryInstance
    .getByCity(target)
    .filter((improvement) => improvement instanceof Palace)
    .forEach((palace) => palace.destroy());

  const inciter = diplomatAt(beside[4]);

  await flush();
  await unitAction(inciter, 'InciteRevolt', site);

  if (target.player() !== humanPlayer || garrison.player() !== humanPlayer) {
    fail('the city and its garrison did not change sides');
  }

  told('Diplomat.incited');

  [target, garrison].forEach((changed) => {
    if (ownersSent[changed.id()] !== humanPlayer!.id()) {
      fail(
        `the UI holds ${ownersSent[changed.id()]} as ${changed.id()}'s owner`
      );
    }
  });

  // The other way round: a rival's Diplomat bribes the player's lone Warrior. The player did nothing, so only being
  //  told what changed puts the Warrior in the rival's colours, and tells the player.
  const [lonely, rivalSide] = home
    .tile()
    .getSurroundingArea(3)
    .entries()
    .filter(free)
    .flatMap((tile): [Tile, Tile][] =>
      tile
        .getNeighbours()
        .filter(free)
        .map((neighbour): [Tile, Tile] => [tile, neighbour])
    )[0] ?? [null, null];

  if (!lonely || !rivalSide) {
    fail('no room near the city for a rival to bribe a unit');
  }

  playerWorld.register(lonely!, rivalSide!);
  playerTreasuryRegistryInstance.getByPlayerAndType(rival, Gold).add(5000);

  const loyal = new Warrior(home, humanPlayer!, lonely!),
    rivalDiplomat = new Diplomat(null, rival, rivalSide!);

  rivalDiplomat.moves().set(1);

  await flush();

  const [bribe] = rivalDiplomat
    .actions(lonely!)
    .filter((action) => action.sourceClass().name === 'BribeUnit');

  if (!bribe) {
    fail("the rival's Diplomat is not offered BribeUnit");
  }

  bribe.perform();

  await flush();

  // The Warrior is a rival's now, so it's sent as an unknown unit in its place, as any rival unit is.
  const lonelyTile = playerWorld.getByTile(lonely!)!,
    unitsThere = tileUnitsSent[lonelyTile.id()] ?? [];

  if (
    unitsThere.includes(loyal.id()) ||
    unitsThere.length !== 1 ||
    ownersSent[unitsThere[0]] === humanPlayer!.id()
  ) {
    fail(
      `the UI holds ${JSON.stringify(
        unitsThere
      )} on the bribed Warrior's tile, owned by ${unitsThere
        .map((id) => ownersSent[id])
        .join(', ')}`
    );
  }

  told('Diplomat.unit-bribed');

  console.log(
    `PASS diplomats (an advance stolen, a city sabotaged, an embassy established and its report read, Target investigated, a king met, a Chariot bribed and Target incited, each told and sent to the UI; a Warrior bribed from the player is sent to the UI too)`
  );

  process.exit(0);
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    if (channel === 'action') {
      actionHandler = handler;
    }

    requestHandlers[channel] = handler;

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

      if (meta.key() === 'negotiation.next-step') {
        negotiationSteps++;

        // Serialised as `WorkerTransport` does it, a step of the talks says who is talking and no more: whole, its
        //  players brought every city, unit and known tile in the game with them (#305).
        const { objects } = (meta as any).toPlainObject(),
          sent = Object.values(objects) as any[],
          overshare = sent.filter(
            ({ __ = [] }) =>
              __.includes('City') ||
              __.includes('Unit') ||
              __.includes('Tile') ||
              __.includes('PlayerTile') ||
              __.includes('PlayerWorld')
          ),
          players = sent.filter(({ _ }) => _ === 'Player');

        if (
          overshare.length > 0 ||
          players.some((player) =>
            Object.keys(player).some(
              (key) => !['_', '__', 'id', 'civilization'].includes(key)
            )
          )
        ) {
          fail(
            `a step of the talks sent ${
              sent.length
            } objects, among them ${overshare
              .slice(0, 5)
              .map(({ id }) => id)
              .join(', ')} and players with ${players
              .map((player) => Object.keys(player).join('/'))
              .join('; ')}`
          );
        }
      }

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

    if (channel === 'embassyEstablished') {
      embassyWith = data;

      return;
    }

    if (channel === 'investigateCity') {
      investigated = reconstituteData(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'intelligence') {
      requested.intelligence = JSON.parse(JSON.stringify(data));

      return;
    }

    if (channel === 'gameNotification') {
      notifications.push(reconstituteData(JSON.parse(JSON.stringify(data))));

      return;
    }

    if (channel === 'gameDataPatch') {
      collect(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'turnStarted' && !started) {
      started = true;

      setTimeout(() =>
        run().catch((error) => fail('the Diplomats could not be played', error))
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
