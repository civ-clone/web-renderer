// A city of size 1 abandoned by its own Settlers, and a city of size 1 incited (#969), on the real engine: with the
//  plugins the game is built with, through a human `DataTransferClient`, checking what the page is sent. On the human's
//  first turn, with "Settlers wait for size 2" unticked:
//  1. a second city of size 1 completes Settlers and is removed: the player is told once that it was abandoned, not
//     that it built Settlers nor that it was destroyed; the Settlers stand on its square, homed in the player's nearest
//     city; a Trireme in it, homed elsewhere, goes with the city, and the page is sent that it is gone;
//  2. one whose nearest city is a rival's: told the same, and the Settlers, homed nowhere, are sent with no city;
// then, with the box ticked again,
//  3. one that completes Settlers waits instead (#959, #970): it stands, and nothing is said of it but that it waits;
// and
//  4. a rival's city of size 1 that our Diplomat incites is kept, and ours: we are told we captured it, and of the
//     revolt, and nothing of it being destroyed;
//  5. ours, of size 1, that a rival's Diplomat incites is kept, and theirs: we are told it was captured, and of the
//     revolt, and nothing of it being destroyed.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import { Diplomat, Settlers, Trireme } from '@civ-clone/civ1-unit/Units';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataTransferClient from '@civ-clone/ui-worker-client/DataTransferClient';
import { Gold } from '@civ-clone/civ1-city/Yields';
import InciteRevolt from '@civ-clone/library-unit/Actions/InciteRevolt';
import { King } from '@civ-clone/civ1-difficulty/Difficulties';
import { Palace } from '@civ-clone/library-city/CityImprovements';
import Player from '@civ-clone/core-player/Player';
import { Production } from '@civ-clone/civ1-world/Yields';
import { SETTLERS_WAIT_FOR_SIZE_TWO } from '@civ-clone/civ1-enhanced/RuleSets';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { applyRuleSets } from '@civ-clone/ui-worker-client/lib/ruleSets';
import civ1Distance from '@civ-clone/civ1-world/lib/civ1Distance';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityImprovementRegistryInstance } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as gameDifficultyRegistryInstance } from '@civ-clone/core-difficulty/GameDifficultyRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  started = false,
  // Every notification sent to the human, as the page gets it.
  noticesSent: any[] = [],
  // Every object the patches sent, round-tripped as `postMessage` would.
  objectsSent: any[] = [];

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL abandonedCity: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL abandonedCity: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

// What the engine call left to say and send: the city news goes out once the call is over, the patches at a flush.
const sent = async (): Promise<void> => {
  await settle();

  humanClient!.flush();
};

const collectObjects = (value: any): void => {
  if (value === null || typeof value !== 'object') {
    return;
  }

  if (typeof value._ === 'string') {
    objectsSent.push(value);
  }

  Object.values(value).forEach(collectObjects);
};

// The notices sent while `act` and what it set off ran: key, bubble, and the city's name, as the page is sent it (a
//  city no longer ours goes as the stand-in we know it by).
const noticesOf = async (act: () => unknown): Promise<unknown[]> => {
  noticesSent = [];
  objectsSent = [];

  await act();
  await sent();

  return noticesSent.map((notice) => [
    notice.key,
    notice.bubble,
    notice.data.city?.name ?? null,
  ]);
};

// The last the patches said of an object.
const lastSent = (id: string): any =>
  objectsSent.filter((object) => object.id === id).pop();

const free = (tile: Tile): boolean =>
  tile.isLand() &&
  cityRegistryInstance.getByTile(tile) === null &&
  unitRegistryInstance.getByTile(tile).length === 0;

// A free square of land `distance` from `near`, at least `clear` from every other city, with free land beside it.
const site = (near: Tile, distance: number, clear: number): Tile => {
  const tile = near
    .map()
    .entries()
    .find(
      (tile) =>
        free(tile) &&
        civ1Distance(tile, near) === distance &&
        tile.getNeighbours().some(free) &&
        cityRegistryInstance
          .entries()
          .filter((city) => city.tile() !== near)
          .every((city) => civ1Distance(city.tile(), tile) >= clear)
    );

  if (!tile) {
    fail(
      `there is no room for a city ${distance} from ${near.x()},${near.y()}`
    );
  }

  return tile!;
};

const sizeOf = (city: City): number =>
  cityGrowthRegistryInstance.getByCity(city).size();

// Our Settlers on `tile`, still there.
const settlersOn = (tile: Tile): Unit[] =>
  unitRegistryInstance
    .getByTile(tile)
    .filter(
      (unit) =>
        unit instanceof Settlers &&
        unit.player() === humanPlayer &&
        !unit.destroyed()
    );

// `city` completes Settlers it has paid for.
const completeSettlers = (city: City) => {
  const cityBuild = cityBuildRegistryInstance.getByCity(city);

  cityBuild.build(Settlers);
  cityBuild.add(new Production(cityBuild.cost().value()));

  return cityBuild.check();
};

// The Palace goes: a capital can't be incited.
const notCapital = (city: City): void =>
  cityImprovementRegistryInstance
    .getByCity(city)
    .filter((improvement) => improvement instanceof Palace)
    .forEach((palace) => palace.destroy());

// `player`'s Diplomat beside `city`, with gold to spare, incites it.
const incite = (player: Player, city: City): void => {
  const beside = city.tile().getNeighbours().find(free);

  if (!beside) {
    fail(`no free land beside ${city.name()}`);
  }

  playerTreasuryRegistryInstance.getByPlayerAndType(player, Gold).add(5000);

  const diplomat = new Diplomat(null, player, beside!),
    action = diplomat
      .actions(city.tile())
      .find((action) => action instanceof InciteRevolt);

  if (!action) {
    fail(`a Diplomat beside ${city.name()} is not offered InciteRevolt`);
  }

  action!.perform();
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

  const [home] = cityRegistryInstance.getByPlayer(humanPlayer!),
    rival = playerRegistryInstance
      .entries()
      .find((player) => player !== humanPlayer)!;

  if (!home) {
    fail('the starting Settlers could not found a city');
  }

  // On King: on Chieftain the original holds a size-1 city's Settlers too.
  gameDifficultyRegistryInstance.set(King);
  applyRuleSets([{ id: SETTLERS_WAIT_FOR_SIZE_TWO, value: false }]);

  // 1. Abandoned, beside our own city.
  const abandoned = new City(humanPlayer!, site(home!.tile(), 3, 6), 'Veii'),
    trireme = new Trireme(home!, humanPlayer!, abandoned.tile());

  const told = await noticesOf(() => completeSettlers(abandoned)),
    [settlers] = settlersOn(abandoned.tile());

  expect(
    'unticked: a city of size 1 with others that completes Settlers is removed, and its Settlers stand on its square, homed in our nearest city',
    [
      abandoned.destroyed(),
      settlersOn(abandoned.tile()).length,
      settlers?.city() === home,
    ],
    [true, 1, true]
  );
  expect(
    'and the player is told once that it was abandoned: not that it built Settlers, nor that it was destroyed',
    told,
    [['City.abandoned', true, abandoned.name()]]
  );
  expect(
    'the Settlers are sent with their new home',
    lastSent(settlers!.id())?.city?.['#ref'] ??
      lastSent(settlers!.id())?.city?.id,
    home!.id()
  );
  expect(
    'a Trireme in it, homed elsewhere, goes with the city, and the page is sent that it is gone',
    [trireme.destroyed(), lastSent(trireme.id())?.destroyed],
    [true, true]
  );

  // 2. Abandoned, with a rival's city nearer than any of ours.
  const lonely = new City(humanPlayer!, site(home!.tile(), 8, 6), 'Antium'),
    neighbour = new City(rival, site(lonely.tile(), 2, 4), 'Neighbour');

  const toldLonely = await noticesOf(() => completeSettlers(lonely)),
    [homeless] = settlersOn(lonely.tile());

  expect(
    "unticked, a rival's city nearest: the city is removed, its Settlers stand, homed nowhere, and are sent so",
    [
      lonely.destroyed(),
      homeless === undefined ? 'none' : homeless.city(),
      lastSent(homeless?.id() ?? '')?.city,
    ],
    [true, null, null]
  );
  expect('and the player is told once that it was abandoned', toldLonely, [
    ['City.abandoned', true, lonely.name()],
  ]);

  neighbour.destroy();

  // 3. Ticked: the Settlers wait, and the city stands.
  applyRuleSets([]);

  const waiting = new City(humanPlayer!, site(home!.tile(), 8, 6), 'Capua');

  let completed: unknown = undefined;

  const toldWaiting = await noticesOf(() => {
    completed = completeSettlers(waiting);
  });

  expect(
    'ticked: a city of size 1 holds its Settlers and stands, and is told only that they wait',
    [completed, waiting.destroyed(), sizeOf(waiting), toldWaiting],
    [null, false, 1, [['City.building-held.unit', true, waiting.name()]]]
  );

  // 4. Our Diplomat incites a rival's city of size 1.
  const target = new City(rival, site(home!.tile(), 8, 6), 'Target');

  notCapital(target);

  // Only what is told of the city: the Diplomat may find a goody hut where the city stands, as it goes in.
  const ofCities = (told: unknown[]) =>
      told.filter(([key]: any) => /^(City|Diplomat)\./.test(key)),
    toldInciter = ofCities(await noticesOf(() => incite(humanPlayer!, target)));

  expect(
    "a rival's city of size 1 that we incite is kept, at size 1, and is ours",
    [target.destroyed(), sizeOf(target), target.player() === humanPlayer],
    [false, 1, true]
  );
  expect(
    'and we are told we captured it, and of the revolt, and nothing of it being destroyed',
    toldInciter,
    [
      ['City.captured-by-us', false, target.name()],
      ['Diplomat.incited', false, target.name()],
    ]
  );

  // 5. A rival's Diplomat incites our city of size 1.
  const victim = new City(humanPlayer!, site(home!.tile(), 8, 6), 'Victim');

  notCapital(victim);

  const toldVictim = ofCities(await noticesOf(() => incite(rival, victim)));

  expect(
    'our city of size 1 that a rival incites is kept, at size 1, and is theirs',
    [victim.destroyed(), sizeOf(victim), victim.player() === rival],
    [false, 1, true]
  );
  expect(
    'and we are told of the revolt, and that it was captured, and nothing of it being destroyed',
    toldVictim,
    [
      ['Diplomat.incited', false, victim.name()],
      ['City.captured-from-us', true, victim.name()],
    ]
  );

  report();
};

const report = (): void => {
  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL abandonedCity (${failures.length} of ${checks})\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  console.log(
    `PASS abandonedCity (${checks} checks: unticked, a size-1 city removed by its Settlers is told once as abandoned, its Settlers homed in our nearest city or nowhere, a ship in it gone with it; ticked, it waits instead; a size-1 city incited either way is kept, and neither side is told it was destroyed)`
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
    if (channel === 'gameNotification') {
      const { hierarchy, objects } = JSON.parse(JSON.stringify(data)),
        // One level of references resolved, as the page reads them: the notice, and the objects in its data.
        deref = (value: any): any =>
          value && typeof value === 'object' && '#ref' in value
            ? objects[value['#ref']]
            : value,
        notice = deref(hierarchy);

      noticesSent.push({
        ...notice,
        data: Object.fromEntries(
          Object.entries(notice.data ?? {}).map(([key, value]) => [
            key,
            deref(value),
          ])
        ),
      });

      return;
    }

    if (channel === 'gameDataPatch') {
      collectObjects(JSON.parse(JSON.stringify(data)));

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
      run().catch((error) => fail('the checks could not be run', error))
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
