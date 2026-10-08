// Every ref the frontend can reach resolves, patch after patch (#46).
//
// Drives a seeded game with one automated `DataTransferClient` and applies what
// it sends to an object map the way `Renderer` does. The backend serialises
// some things as `#ref`s on the assumption that the frontend already holds
// them; a ref to something it was never sent reconstitutes as `undefined`, and
// the renderer then trips over the hole (`mandatoryActions` did).
//
// It also checks the payloads stay the size of what changed: a notification or
// a whole-player patch that carries tiles in full has brought the map along
// with it, which in a large game took seconds at every turn start (#130).

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';

import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import DataObject from '@civ-clone/core-data-object/DataObject';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { ObjectMap, PlainObject } from '../../src/js/UI/lib/reconstituteData';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import reconstituteData from '../../src/js/UI/lib/reconstituteData';

const TURNS = Number(process.env.PATCH_REFS_TURNS ?? 60);

const objectMap: ObjectMap = { hierarchy: {}, objects: {} },
  missing = new Map<string, number>(),
  // What #130 found: payloads that carried every tile the player knows.
  oversized: string[] = [];

// What the engine listens for, so a test can ask it something as the UI would, and what it answered (#324).
const receivers = new Map<string, (...args: any[]) => void>(),
  answers: any[] = [],
  // `BuildItem`s that went out in the game data or a patch: the picker fetches them itself.
  buildItemsSent: string[] = [];

let stopped = false,
  batches = 0,
  notifications = 0,
  humanPlayer: Player | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `${reason}\n${error instanceof Error ? error.stack : String(error ?? '')}\n`
  );
  process.exit(1);

  throw new Error(reason);
};

// Mirrors `Renderer`'s `setObjectPath`.
const setObjectPath = (object: PlainObject, path: string, value: any): void => {
  const parts = path.replace(/]/g, '').split(/[.[]/),
    lastPart = parts.pop()!,
    target = parts.reduce((object, part) => object?.[part], object);

  if (target) {
    target[lastPart] = value;
  }
};

const playerTilesIn = (objects: PlainObject): number =>
  Object.values(objects).filter(
    (object: PlainObject) => object?._ === 'PlayerTile' && 'terrain' in object
  ).length;

// A notification is reconstituted on its own, from nothing but what it
// carries, so every ref in it has to resolve inside it. And it only needs to
// say who and where: a tile in full means it brought the map along (#130).
const checkNotification = ({ hierarchy, objects }: ObjectMap): void => {
  notifications++;

  const key = objects[hierarchy['#ref']]?.key,
    seen = new Set<any>(),
    visit = (value: any): void => {
      if (!value || typeof value !== 'object' || seen.has(value)) {
        return;
      }

      seen.add(value);

      const ref = value['#ref'];

      if (typeof ref === 'string') {
        if (!(ref in objects)) {
          const type = ref.replace(/-[0-9a-z]+$/, '');

          missing.set(
            `${type} in ${key}`,
            (missing.get(`${type} in ${key}`) ?? 0) + 1
          );

          return;
        }

        visit(objects[ref]);

        return;
      }

      Object.values(value).forEach(visit);
    };

  visit(hierarchy);

  const tiles = playerTilesIn(objects);

  if (tiles > 0) {
    oversized.push(`notification ${key} carried ${tiles} PlayerTile(s)`);
  }
};

// Only refs reachable from the hierarchy matter: that is what `reconstituteData` walks.
const checkRefs = (): void => {
  const seen = new Set<any>(),
    visit = (value: any): void => {
      if (!value || typeof value !== 'object' || seen.has(value)) {
        return;
      }

      seen.add(value);

      const ref = value['#ref'];

      if (typeof ref === 'string') {
        if (!(ref in objectMap.objects)) {
          const type = ref.replace(/-[0-9a-z]+$/, '');

          missing.set(type, (missing.get(type) ?? 0) + 1);

          return;
        }

        visit(objectMap.objects[ref]);

        return;
      }

      Object.values(value).forEach(visit);
    };

  visit(objectMap.hierarchy);
};

// What a city can build is not part of the game data (#324): the picker asks for it, and is answered on its own. Every
//  answer is the names `CityBuild.available()` gives for the player's cities, and nothing for anyone else's.
const checkCityBuildAvailable = (): void => {
  const request = (cityBuildId: string): PlainObject[] => {
      answers.length = 0;
      receivers.get('cityBuildAvailable')?.(cityBuildId);

      if (answers.length !== 1) {
        return fail(
          `cityBuildAvailable for ${cityBuildId} was answered ${answers.length} times`
        );
      }

      const [answer] = answers;

      // Reconstituted on its own, so a ref to anything it does not carry would be a hole.
      [...JSON.stringify(answer).matchAll(/"#ref":"([^"]+)"/g)].forEach(
        ([, ref]) => {
          if (!(ref in answer.objects)) {
            fail(`cityBuildAvailable for ${cityBuildId} refers to ${ref}`);
          }
        }
      );

      return reconstituteData(answer) as PlainObject[];
    },
    cities = cityRegistryInstance.entries();

  let compared = 0;

  cities
    .filter((city) => city.player() === humanPlayer)
    .forEach((city) => {
      const cityBuild = cityBuildRegistryInstance.getByCity(city),
        expected = cityBuild
          .available()
          .map((buildItem) => buildItem.item().name)
          .sort(),
        answered = request(cityBuild.id());

      if (
        answered.some(
          (buildItem) =>
            buildItem._ !== 'BuildItem' ||
            typeof buildItem.cost?.value !== 'number'
        )
      ) {
        fail(`cityBuildAvailable for ${city.name()} has malformed items`);
      }

      if (
        JSON.stringify(answered.map(({ item }) => item._).sort()) !==
        JSON.stringify(expected)
      ) {
        fail(
          `cityBuildAvailable for ${city.name()} answered ${JSON.stringify(
            answered.map(({ item }) => item._).sort()
          )}, expected ${JSON.stringify(expected)}`
        );
      }

      if (expected.length > 0) {
        compared++;
      }
    });

  if (compared === 0) {
    fail('no city of the player could build anything, so none was compared');
  }

  const [foreignCity] = cities.filter((city) => city.player() !== humanPlayer);

  if (!foreignCity) {
    fail('no other player has a city, so a refused request was not checked');
  }

  if (request(cityBuildRegistryInstance.getByCity(foreignCity).id()).length) {
    fail(`cityBuildAvailable answered for ${foreignCity.name()}`);
  }

  if (request('CityBuild-nonexistent').length) {
    fail('cityBuildAvailable answered for a build that does not exist');
  }

  const cityBuilds = Object.values(objectMap.objects).filter(
    (object: PlainObject) => object?._ === 'CityBuild'
  );

  if (
    cityBuilds.length === 0 ||
    cityBuilds.some(
      (cityBuild: PlainObject) =>
        'available' in cityBuild ||
        !['building', 'city', 'cost', 'progress', 'remaining'].every(
          (key) => key in cityBuild
        )
    )
  ) {
    fail(
      'a CityBuild in the player data carries available, or is missing building, city, cost, progress or remaining'
    );
  }

  if (buildItemsSent.length > 0) {
    console.error(
      `FAIL patchRefs: ${
        buildItemsSent.length
      } BuildItem(s) went out with the game data, e.g. ${[
        ...new Set(buildItemsSent),
      ]
        .slice(0, 5)
        .join('; ')}`
    );

    process.exit(1);
  }
};

// A `BuildItem` is only ever what a city is building, which a `CityBuild` holds as `building`. Any other is something it
//  could build, that `available` brought along.
const buildItemsIn = (objects: PlainObject): number => {
  const building = new Set(
    Object.values(objects)
      .filter((object: PlainObject) => object?._ === 'CityBuild')
      .map((cityBuild: PlainObject) => cityBuild.building?.['#ref'])
  );

  return Object.entries(objects).filter(
    ([id, object]: [string, PlainObject]) =>
      object?._ === 'BuildItem' && !building.has(id)
  ).length;
};

// A unit's actions go out for the unit the UI asks about and no other (#323). Each turn the test asks, as the UI does
//  when it makes a unit active: the answer must be a patch of that unit with both keys and its tiles as refs that
//  resolve, and no patch may carry actions for any other unit, or for one listed as an `InactiveUnit`.
const unitActions = {
  handler: null as ((unitId: string) => void) | null,
  asked: null as string | null,
  answering: false,
  requests: 0,
  answers: 0,
  // Patches after the answer that carried the asked unit's actions again: it was still active with moves left.
  carried: 0,
  failures: [] as string[],
};

const requestUnitActions = (): void => {
  const units = unitRegistryInstance.getByPlayer(humanPlayer!),
    unit =
      units.find((unit) => unit.active() && unit.moves().value() > 0) ??
      units[0];

  // The UI asks once it has the game data, and not before.
  if (
    !unit ||
    !unitActions.handler ||
    Object.keys(objectMap.objects).length === 0
  ) {
    return;
  }

  unitActions.asked = unit.id();
  unitActions.answering = true;
  unitActions.requests++;

  // Answered synchronously: the human isn't acting, so nothing holds the flush.
  unitActions.handler(unit.id());

  if (unitActions.answering) {
    unitActions.answering = false;
    unitActions.failures.push(`unitActions for ${unit.id()} sent no patch`);
  }
};

const checkUnitActions = (data: PlainObject[]): void => {
  const withActions = new Set<string>(),
    inactive = new Set<string>();

  data.forEach((patch) =>
    Object.values(patch).forEach(({ value }: PlainObject) =>
      Object.entries(value?.objects ?? {}).forEach(
        ([id, object]: [string, any]) => {
          if (
            object &&
            ('actions' in object || 'actionsForNeighbours' in object) &&
            object.__?.includes('Unit')
          ) {
            withActions.add(id);
          }

          if (object?._ === 'InactiveUnit' && object.value?.['#ref']) {
            inactive.add(object.value['#ref']);
          }
        }
      )
    )
  );

  withActions.forEach((id) => {
    if (id !== unitActions.asked) {
      unitActions.failures.push(
        `a patch carried actions for ${id}, which was not asked about`
      );
    }

    if (inactive.has(id)) {
      unitActions.failures.push(
        `a patch carried actions for ${id}, an InactiveUnit`
      );
    }
  });

  if (!unitActions.answering) {
    if (unitActions.asked !== null && withActions.has(unitActions.asked)) {
      unitActions.carried++;
    }

    return;
  }

  unitActions.answering = false;
  unitActions.answers++;

  const id = unitActions.asked!,
    answer = data.find((patch) => id in patch)?.[id]?.value,
    unit = answer?.objects?.[id];

  if (!unit || !('actions' in unit) || !('actionsForNeighbours' in unit)) {
    unitActions.failures.push(`the answer for ${id} did not carry its actions`);

    return;
  }

  const tiles = playerTilesIn(answer.objects);

  if (tiles > 0) {
    unitActions.failures.push(
      `the answer for ${id} carried ${tiles} PlayerTile(s) in full`
    );
  }

  // Applied by now, as the renderer applies it: every ref in it must resolve.
  const seen = new Set<any>(),
    visit = (value: any): void => {
      if (!value || typeof value !== 'object' || seen.has(value)) {
        return;
      }

      seen.add(value);

      const ref = value['#ref'];

      if (typeof ref === 'string') {
        if (!(ref in objectMap.objects)) {
          unitActions.failures.push(
            `the answer for ${id} has a ref to ${ref}, which the frontend doesn't hold`
          );
        }

        return;
      }

      Object.values(value).forEach(visit);
    };

  visit(answer.objects);
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => void) => {
    receivers.set(channel, handler);

    if (channel === 'unitActions') {
      unitActions.handler = handler;
    }

    return () => false;
  },
  send: (channel: string, data: any): void => {
    if (data instanceof DataObject) {
      data = data.toPlainObject();
    }

    // Round-trip, as `postMessage` would: nothing may lean on shared identity.
    data = JSON.parse(JSON.stringify(data));

    if (channel === 'cityBuildAvailable') {
      answers.push(data);
    }

    if (channel === 'gameData') {
      objectMap.hierarchy = data.hierarchy;
      objectMap.objects = data.objects;

      if (buildItemsIn(data.objects) > 0) {
        buildItemsSent.push(`game data carried ${buildItemsIn(data.objects)}`);
      }
    }

    if (channel === 'gameNotification') {
      checkNotification(data);
    }

    if (channel === 'gameDataPatch') {
      data.forEach((patch: PlainObject) =>
        Object.entries(patch).forEach(([key, { type, index, value }]) => {
          if (type === 'remove') {
            return fail(`unexpected remove patch for ${key}`);
          }

          if (buildItemsIn(value.objects) > 0) {
            buildItemsSent.push(
              `patch for ${key} carried ${buildItemsIn(value.objects)}`
            );
          }

          // The whole player is sent with its world and tiles as refs: the
          // frontend already holds them, and tile changes go out on their own.
          if (key === humanPlayer?.id() && !index) {
            const tiles = playerTilesIn(value.objects);

            if (tiles > 0) {
              oversized.push(`player patch carried ${tiles} PlayerTile(s)`);
            }
          }

          if (index) {
            setObjectPath(objectMap.objects[key], index, value.hierarchy);
          } else {
            objectMap.objects[key] = value.hierarchy;
          }

          Object.assign(objectMap.objects, value.objects);
        })
      );
    }

    if (channel === 'gameData' || channel === 'gameDataPatch') {
      batches++;
      checkRefs();
    }

    if (channel === 'gameDataPatch') {
      checkUnitActions(data);
    }
  },
};

const LOOP_EVENTS = [
  'player:turn-end',
  'player:turn-start',
  'turn:end',
  'turn:start',
];
const emit = engine.emit.bind(engine);

engine.emit = (event: string, ...args: any[]): void => {
  if (stopped && LOOP_EVENTS.includes(event)) {
    return;
  }

  emit(event, ...args);
};

engine.on('turn:start', (turn: number): void => {
  if (stopped || turn < TURNS) {
    return;
  }

  stopped = true;

  if (oversized.length > 0) {
    console.error(
      `FAIL patchRefs: ${
        oversized.length
      } payload(s) carried tiles in full, e.g. ${[...new Set(oversized)]
        .slice(0, 5)
        .join('; ')}`
    );

    process.exit(1);
  }

  if (
    unitActions.requests === 0 ||
    unitActions.answers !== unitActions.requests
  ) {
    unitActions.failures.push(
      `${unitActions.requests} unitActions request(s), ${unitActions.answers} answer(s)`
    );
  }

  if (unitActions.failures.length > 0) {
    console.error(
      `FAIL patchRefs: unit actions (#323): ${[...new Set(unitActions.failures)]
        .slice(0, 5)
        .join('; ')}`
    );

    process.exit(1);
  }

  if (notifications === 0) {
    console.error(
      `FAIL patchRefs: no notifications over ${turn} turns, so none were checked`
    );

    process.exit(1);
  }

  checkCityBuildAvailable();

  if (missing.size > 0) {
    console.error(
      `FAIL patchRefs: unresolvable refs over ${turn} turns and ${batches} batches: ${[
        ...missing,
      ]
        .map(([type, count]) => `${type} x${count}`)
        .join(', ')}`
    );

    process.exit(1);
  }

  console.log(
    `PASS patchRefs (${batches} batches and ${notifications} notifications over ${turn} turns, every reachable ref resolves; ${unitActions.answers} unitActions answered, actions only ever for the unit asked about, ${unitActions.carried} later patch(es) kept them)`
  );

  process.exit(0);
});

engine.on('player:turn-start', (player: Player): void => {
  if (!stopped && player === humanPlayer) {
    requestUnitActions();
  }
});

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((_, index): void => {
    const player = new Player();

    if (index === 0) {
      humanPlayer = player;
    }

    playerRegistryInstance.register(player);
    clientRegistryInstance.register(
      index === 0
        ? new DataTransferClient(
            player,
            transport as any,
            (channel, payload) => transport.send(channel, payload),
            () => {},
            { automationEnabled: true }
          )
        : new SimpleAIClient(player)
    );
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
