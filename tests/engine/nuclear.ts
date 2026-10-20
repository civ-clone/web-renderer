// Nuclear units detonate (#129):
//  a. a city can only build a Nuclear unit once a Manhattan Project exists somewhere in the world;
//  b. a Nuclear unit attacking destroys every unit in the 3×3 area (its owner's too) except those in a city with SDI
//     Defense, halves the cities there, pollutes the land around, and the UI is told about the SDI save;
//  c. a rival's Nuclear unit detonating next to ours tells the UI who did it;
//  d. against a civilization we have a Peace with, the attack on offer is the Sneak one, and it ends the peace.
//
// Drives a seeded game with a human `DataTransferClient`, as `goToArrival` does. On the human's first turn the starting
// Settlers found a city, and the test places everything each scenario needs on chosen land (rival cities and units
// included, so nothing depends on where the seed puts them) and sends the attack the way the unit action menu does.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import { ManhattanProject } from '@civ-clone/civ1-wonder/Wonders';
import { Nuclear, Settlers, Warrior } from '@civ-clone/civ1-unit/Units';
import { Peace } from '@civ-clone/library-diplomacy/Declarations';
import { Pollution } from '@civ-clone/civ1-world/TileImprovements';
import { Rocketry } from '@civ-clone/civ1-science/Advances';
import { SdiDefence } from '@civ-clone/library-city/CityImprovements';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { instance as wonderRegistryInstance } from '@civ-clone/core-wonder/WonderRegistry';

let humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  helper: SimpleAIClient | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  started = false;

// What the UI is sent that matters here, in order. Round-tripped, as `postMessage` would.
const patches: any[] = [],
  notifications: any[] = [],
  results: { name: string; pass: boolean; detail: string }[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL nuclear: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const check = (name: string, pass: boolean, detail: string): void => {
  results.push({ name, pass, detail });
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

const describeTile = (tile: Tile): string => `(${tile.x()},${tile.y()})`;

const playerTileOf = (tile: Tile) => {
  const playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!);

  playerWorld.register(tile);

  const playerTile = playerWorld.getByTile(tile);

  if (!playerTile) {
    fail(`the player can't see ${describeTile(tile)}`);
  }

  return playerTile!;
};

const unitAction = (unit: Unit, name: string, target: Tile): Promise<void> =>
  Promise.resolve(
    actionHandler!({
      name: 'ActiveUnit',
      id: unit.id(),
      unitAction: name,
      target: playerTileOf(target).id(),
    })
  ).then(settle);

// The tile `dx`, `dy` from `tile`, wrapping east-west.
const offset = (tile: Tile, dx: number, dy: number): Tile => {
  const world = tile.map(),
    width = world.width();

  return world.get((((tile.x() + dx) % width) + width) % width, tile.y() + dy);
};

const pollutionOn = (tile: Tile): boolean =>
  tileImprovementRegistryInstance
    .getByTile(tile)
    .some((improvement) => improvement instanceof Pollution);

const sizeOf = (city: City): number =>
  cityGrowthRegistryInstance.getByCity(city).size();

const notificationsNamed = (name: string, from: number): any[] =>
  notifications
    .slice(from)
    .filter((notification) => JSON.stringify(notification).includes(name));

// Sites for the scenarios: a 5×3 block of land with nothing on it, centred on the returned tile and well away from
//  everything already used, so the 3×3 area around it and one square beyond are all land.
const used: Tile[] = [];

const findSite = (): Tile => {
  const world = cityRegistryInstance.entries()[0].tile().map();

  for (let y = 2; y < world.height() - 2; y++) {
    for (let x = 0; x < world.width(); x++) {
      const centre = world.get(x, y);

      if (
        used.some(
          (other) => Math.abs(other.x() - x) < 8 && Math.abs(other.y() - y) < 8
        )
      ) {
        continue;
      }

      let clear = true;

      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const tile = offset(centre, dx, dy);

          if (
            !tile.isLand() ||
            cityRegistryInstance.getByTile(tile) !== null ||
            unitRegistryInstance.getByTile(tile).length !== 0
          ) {
            clear = false;
          }
        }
      }

      if (clear) {
        used.push(centre);

        return centre;
      }
    }
  }

  return fail('there is no clear land for a scenario');
};

const peaceBetween = (a: Player, b: Player): Peace[] =>
  interactionRegistryInstance
    .getByPlayers(a, b)
    .filter(
      (interaction): interaction is Peace => interaction instanceof Peace
    );

const offered = (unit: Unit, target: Tile): string[] =>
  unit.actions(target).map((action) => action.constructor.name);

const order = async (): Promise<void> => {
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

  const rivals = playerRegistryInstance
    .entries()
    .filter((player) => player !== humanPlayer);

  if (rivals.length < 2) {
    fail(`two rivals are needed, there are ${rivals.length}`);
  }

  const [rival, other] = rivals;

  // a. The Manhattan gate.
  playerResearchRegistryInstance.getByPlayer(humanPlayer!).addAdvance(Rocketry);

  const cityBuild = cityBuildRegistryInstance.getByCity(home),
    canBuild = (): boolean =>
      cityBuild.available().some((buildItem) => buildItem.item() === Nuclear);

  check(
    'a. No Nuclear unit to build before a Manhattan Project',
    !canBuild(),
    `available: ${cityBuild
      .available()
      .map((buildItem) => buildItem.item().name)
      .join(', ')}`
  );

  const rivalCity = new City(other, findSite(), 'Los Alamos');

  wonderRegistryInstance.register(new ManhattanProject(rivalCity));

  check(
    'a. A Nuclear unit can be built once a rival has built the Manhattan Project',
    wonderRegistryInstance.some(
      (wonder) => wonder instanceof ManhattanProject
    ) && canBuild(),
    `wonders: ${
      wonderRegistryInstance.entries().length
    }, can build: ${canBuild()}`
  );

  // b. Detonation. Laid out around the target T = (0, 0):
  //     nuke (-1, 0); human Warrior (0, 1); rival Warrior at T;
  //     size 7 city (1, -1) and size 6 city with SDI Defense (1, 1), each with a Warrior;
  //     a rival Warrior outside the area at (2, 0).
  const site = findSite(),
    at = (dx: number, dy: number): Tile => offset(site, dx, dy),
    nuke = new Nuclear(null, humanPlayer!, at(-1, 0)),
    ownUnit = new Warrior(null, humanPlayer!, at(0, 1)),
    targetUnit = new Warrior(null, rival, site),
    bigCity = new City(rival, at(1, -1), 'Big'),
    bigDefender = new Warrior(null, rival, at(1, -1)),
    sdiCity = new City(rival, at(1, 1), 'Shielded'),
    sdiDefender = new Warrior(null, rival, at(1, 1)),
    outside = new Warrior(null, rival, at(2, 0));

  new SdiDefence(sdiCity);

  while (sizeOf(bigCity) < 7) {
    cityGrowthRegistryInstance.getByCity(bigCity).grow();
  }

  while (sizeOf(sdiCity) < 6) {
    cityGrowthRegistryInstance.getByCity(sdiCity).grow();
  }

  const area = [site, ...site.getNeighbours()];

  [nuke.tile(), ownUnit.tile(), site, bigCity.tile(), sdiCity.tile()].forEach(
    (tile) => playerTileOf(tile)
  );

  peaceBetween(humanPlayer!, rival).forEach((peace) => peace.expire());

  const nukeOffer = offered(nuke, site);

  check(
    'b. The Nuclear unit is offered NuclearAttack, and never Attack',
    nukeOffer.includes('NuclearAttack') &&
      !nukeOffer.includes('SneakNuclearAttack') &&
      !nukeOffer.includes('Attack'),
    `offered: ${JSON.stringify(nukeOffer)}`
  );

  const polluted = area.filter(pollutionOn),
    patchesFrom = patches.length,
    notificationsFrom = notifications.length;

  await unitAction(nuke, 'NuclearAttack', site);

  const unitsGone = [nuke, ownUnit, targetUnit, bigDefender].every((unit) =>
      unit.destroyed()
    ),
    pollutedAfter = area.filter(pollutionOn),
    targetId = playerTileOf(site).id();

  check(
    "b. The Nuclear unit and every unit in the area, the attacker's too, are destroyed",
    unitsGone,
    [nuke, ownUnit, targetUnit, bigDefender]
      .map((unit) => `${unit.constructor.name}:${unit.destroyed()}`)
      .join(' ')
  );
  check(
    'b. A city with SDI Defense keeps its units; units outside the area are untouched',
    !sdiDefender.destroyed() && !outside.destroyed(),
    `sdi defender destroyed=${sdiDefender.destroyed()}, outside destroyed=${outside.destroyed()}`
  );
  check(
    'b. Cities in the area are halved, SDI or not',
    sizeOf(bigCity) === 4 && sizeOf(sdiCity) === 3,
    `sizes ${sizeOf(bigCity)} (from 7), ${sizeOf(sdiCity)} (from 6)`
  );
  check(
    'b. Only land that is not a city is polluted',
    polluted.length === 0 &&
      pollutedAfter.length > 0 &&
      !pollutionOn(bigCity.tile()) &&
      !pollutionOn(sdiCity.tile()) &&
      pollutedAfter.every((tile) => area.includes(tile) && tile.isLand()),
    `polluted: ${pollutedAfter.map(describeTile).join(' ')}`
  );
  check(
    'b. The attacker is told the SDI Defense held, and gets no attack warning',
    notificationsNamed('City.sdi-protected', notificationsFrom).length === 1 &&
      notificationsNamed('Unit.nuclear-attack', notificationsFrom).length === 0,
    JSON.stringify(notifications.slice(notificationsFrom))
  );
  check(
    'b. The UI is sent the target square after the attack',
    patches
      .slice(patchesFrom)
      .some((patch) => JSON.stringify(patch).includes(targetId)),
    `${patches.length - patchesFrom} patches since the attack`
  );

  // c. A rival's Nuclear unit detonating next to ours.
  const siteTwo = findSite(),
    rivalNuke = new Nuclear(null, rival, offset(siteTwo, -1, 0)),
    victim = new Warrior(null, humanPlayer!, siteTwo);

  playerTileOf(siteTwo);
  peaceBetween(humanPlayer!, rival).forEach((peace) => peace.expire());

  const rivalAction = rivalNuke
      .actions(siteTwo)
      .find((action) => action.constructor.name === 'NuclearAttack'),
    rivalFrom = notifications.length;

  if (!rivalAction) {
    fail(
      `the rival's Nuclear unit has no attack: ${offered(rivalNuke, siteTwo)}`
    );
  }

  rivalNuke.action(rivalAction!);

  await settle();

  const warnings = notificationsNamed('Unit.nuclear-attack', rivalFrom);

  check(
    "c. A rival's detonation tells us who did it, and our unit is gone",
    victim.destroyed() &&
      warnings.length === 1 &&
      JSON.stringify(warnings[0]).includes(
        `"name":"${rival.civilization().name()}"`
      ),
    `victim destroyed=${victim.destroyed()}, warnings ${JSON.stringify(
      warnings
    )}`
  );

  // d. Sneak.
  const siteThree = findSite(),
    sneaker = new Nuclear(null, humanPlayer!, offset(siteThree, -1, 0)),
    sneakTarget = new Warrior(null, rival, siteThree);

  playerTileOf(siteThree);
  peaceBetween(humanPlayer!, rival).forEach((peace) => peace.expire());
  interactionRegistryInstance.register(new Peace(humanPlayer!, rival));

  const hasPeace = (): boolean =>
      peaceBetween(humanPlayer!, rival).some((peace) => peace.active()),
    sneakOffer = offered(sneaker, siteThree),
    peaceBefore = hasPeace();

  check(
    'd. At peace, the Nuclear unit is offered SneakNuclearAttack, not NuclearAttack',
    peaceBefore &&
      sneakOffer.includes('SneakNuclearAttack') &&
      !sneakOffer.includes('NuclearAttack'),
    `peace=${peaceBefore}, offered: ${JSON.stringify(sneakOffer)}`
  );

  await unitAction(sneaker, 'SneakNuclearAttack', siteThree);

  check(
    'd. The sneak attack detonates and ends the peace',
    sneaker.destroyed() && sneakTarget.destroyed() && !hasPeace(),
    `nuke destroyed=${sneaker.destroyed()}, target destroyed=${sneakTarget.destroyed()}, peace=${hasPeace()}`
  );

  evaluate();
};

const evaluate = (): void => {
  results.forEach(({ name, pass, detail }) =>
    console.log(
      `${pass ? 'PASS' : 'FAIL'} nuclear: ${name}${
        pass ? '' : `\n    ${detail}`
      }`
    )
  );

  process.exit(results.every(({ pass }) => pass) ? 0 : 1);
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
    if (channel === 'gameDataPatch') {
      patches.push(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'gameNotification') {
      notifications.push(JSON.parse(JSON.stringify(data)));

      return;
    }

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

    if (channel !== 'turnStarted' || started) {
      return;
    }

    started = true;

    setTimeout(() =>
      order().catch((error) => fail('the scenarios could not be run', error))
    );
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
