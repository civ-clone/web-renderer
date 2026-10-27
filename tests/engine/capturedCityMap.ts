// A city that changes hands leaves the map the player holds as it is in the game.
//
// - A rival's city the player has seen, captured by another rival, names the capturer as its owner in the map the
//    page holds, which the map draws its colours from (#631). `tests/ui/gameState.ts` checks that a city patch with
//    a new owner redraws its square; this checks that the patch is sent.
// - A unit our captured city supported, away from the city, is disbanded: it is gone from the game, from its square
//    and from our units, in the map the page holds as well (#286).
//
// Drives a seeded game with a human `DataTransferClient`, as `lostCityCorruption` does, and applies what it sends to
//  an object map with the page's own `applyDataPatches`.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import DataObject from '@civ-clone/core-data-object/DataObject';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { Settlers, Warrior } from '@civ-clone/civ1-unit/Units';
import Tile from '@civ-clone/core-world/Tile';
import { ObjectMap } from '../../src/js/UI/lib/reconstituteData';
import applyDataPatches from '../../src/js/UI/lib/applyDataPatches';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { unknownPlayerOf } from '../../src/js/Engine/Client/standIns';

let started = false,
  checks = 0,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => unknown) | null = null,
  pendingChoice: ((value: any) => void) | null = null;

// The map the page holds, as `GameState` keeps it.
const objectMap: ObjectMap = { hierarchy: {}, objects: {} };

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL capturedCityMap: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const check = (condition: boolean, reason: string): void => {
  checks++;

  if (!condition) {
    fail(reason);
  }
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

// The UI can't ask for a flush, but the engine sends whatever is queued at the end of every action and turn.
const flush = async (): Promise<void> => {
  humanClient!.flush();

  await settle();
};

const held = (id: string | undefined): any =>
  id === undefined ? undefined : objectMap.objects[id];

const ref = (value: any): string | undefined => value?.['#ref'] ?? value?.id;

// The square as the page holds it.
const heldTile = (tile: Tile): any =>
  held(
    playerWorldRegistryInstance.getByPlayer(humanPlayer!).getByTile(tile)?.id()
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

  const [firstRival, secondRival] = playerRegistryInstance
    .entries()
    .filter((player) => player !== humanPlayer);

  if (!secondRival) {
    fail('the game needs two rivals');
  }

  // A rival's city we have seen, taken by another rival (#631).
  const theirs = new City(firstRival, site(capital.tile()), 'Theirs');

  growTo(theirs, 3);
  playerWorldRegistryInstance
    .getByPlayer(humanPlayer!)
    .register(...theirs.tile().getSurroundingArea(1).entries());
  await flush();

  const seen = heldTile(theirs.tile());

  check(seen !== undefined, "the rival's city's square never reached the page");
  check(
    ref(held(ref(seen.city))?.player) === unknownPlayerOf(firstRival).id(),
    "the page doesn't hold the rival's city as its founder's before the capture"
  );

  theirs.capture(secondRival);
  await flush();

  check(theirs.player() === secondRival, "the rival's city was not captured");
  const heldOwner = ref(held(ref(heldTile(theirs.tile()).city))?.player);

  check(
    heldOwner === unknownPlayerOf(secondRival).id(),
    `the page holds the captured city as ${heldOwner}'s, not its capturer's (${unknownPlayerOf(
      secondRival
    ).id()}; its founder is ${unknownPlayerOf(firstRival).id()})`
  );

  // A unit one of our cities supports, away from it, disbanded when the city is taken (#286).
  const ours = new City(humanPlayer!, site(capital.tile()), 'Ours');

  growTo(ours, 3);

  const away = ours
      .tile()
      .getNeighbours()
      .find((tile) => tile.isLand())!,
    supported = new Warrior(ours, humanPlayer!, away);

  playerWorldRegistryInstance
    .getByPlayer(humanPlayer!)
    .register(...ours.tile().getSurroundingArea(1).entries());
  await flush();

  check(
    (heldTile(away)?.units ?? []).some(
      (unit: any) => ref(unit) === supported.id()
    ),
    "the supported unit's square never reached the page with the unit on it"
  );
  check(
    (held(humanPlayer!.id())?.units ?? []).some(
      (unit: any) => ref(unit) === supported.id()
    ),
    'the page never listed the supported unit among ours'
  );

  ours.capture(firstRival);
  await flush();

  check(ours.player() === firstRival, 'our city was not captured');
  check(supported.destroyed(), "the captured city's unit was not disbanded");
  check(
    !unitRegistryInstance.getByTile(away).includes(supported),
    'the disbanded unit is still on its square'
  );
  check(
    !(heldTile(away)?.units ?? []).some(
      (unit: any) => ref(unit) === supported.id()
    ),
    'the page still draws the disbanded unit on its square'
  );
  check(
    !(held(humanPlayer!.id())?.units ?? []).some(
      (unit: any) => ref(unit) === supported.id()
    ),
    'the page still lists the disbanded unit among ours'
  );

  console.log(
    `PASS capturedCityMap (${checks} checks: a captured city is drawn as its new owner's, and the units it supported leave the map)`
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

    // Round-tripped, as `postMessage` would.
    if (channel === 'gameData') {
      Object.assign(
        objectMap,
        JSON.parse(
          JSON.stringify(
            data instanceof DataObject ? data.toPlainObject() : data
          )
        )
      );

      return;
    }

    if (channel === 'gameDataPatch') {
      applyDataPatches(objectMap, JSON.parse(JSON.stringify(data)), {
        changed: () => {},
      });

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
  new Array(Math.max(config.players, 3)).fill(0).forEach((_, index): void => {
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

engine.setOption('players', Math.max(config.players, 3));
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
