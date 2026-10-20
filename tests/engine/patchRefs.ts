// Every ref the frontend can reach resolves, patch after patch (#46).
//
// Drives a seeded game with one automated `DataTransferClient` and applies what
// it sends to an object map the way `Renderer` does. The backend serialises
// some things as `#ref`s on the assumption that the frontend already holds
// them; a ref to something it was never sent reconstitutes as `undefined`, and
// the renderer then trips over the hole (`mandatoryActions` did).
//
// It also checks the page is only ever handed the human's own map (#328): `world` is additional data on `Player`, so a
// rival's `Player` serialised in full brings every tile their civilization knows, and the initial game data did exactly
// that, as the unit and city stand-ins' `player` and a tile's `workedBy` all reached one.
//
// It also checks the payloads stay the size of what changed: a notification or
// a whole-player patch that carries tiles in full has brought the map along
// with it, which in a large game took seconds at every turn start (#130).
//
// And that every tile the frontend holds is the tile as it is now (#138). Tiles go as refs everywhere but in a patch of
// the tile itself, so a change to a tile that sends no tile patch is never seen, nor drawn: after each batch, every
// `PlayerTile` the frontend holds is compared with what the client would send for it now. Only a tile patch may carry
// a tile in full, and only its own.
//
// And that an action sends what it changed (#411). An action's patch no longer carries the whole player, only what the
// action and the events it raised sent, so the human plays most of its turns by hand, as the UI does: it sends the
// actions the UI sends, for its units, cities, research, rates and government, chosen at random, and every fourth turn
// is automated, as a player can switch it on. After each action's patch, and each turn's hand-over, everything the
// frontend holds of the player, every unit and city included, is compared with what the client would send for it now.

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
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import reconstituteData from '../../src/js/UI/lib/reconstituteData';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import MandatoryPlayerAction from '@civ-clone/core-player/MandatoryPlayerAction';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as cityImprovementRegistryInstance } from '@civ-clone/core-city-improvement/CityImprovementRegistry';

// Long enough for the human, playing by hand, to have founded a few cities and have units to move about (#411).
const TURNS = Number(process.env.PATCH_REFS_TURNS ?? 120);

const objectMap: ObjectMap = { hierarchy: {}, objects: {} },
  missing = new Map<string, number>(),
  // What #130 found: payloads that carried every tile the player knows.
  oversized: string[] = [],
  // What #328 found: a `PlayerWorld` that is not the human's, or a `PlayerTile` that is not in it, reachable from the
  //  root. The first few, with the path that reaches each, so the leak can be found without a debugger.
  foreignMap = new Map<string, string>();

// The most `PlayerTile`s the root reached after any batch: the human's own known tiles, and nothing else.
let reachablePlayerTiles = 0;

// What the engine listens for, so a test can ask it something as the UI would, and what it answered (#324).
const receivers = new Map<string, (...args: any[]) => void>(),
  answers: any[] = [],
  // `BuildItem`s that went out in the game data or a patch: the picker fetches them itself.
  buildItemsSent: string[] = [],
  // `CityBuild`s that went out with `available`, or without what the UI reads (#410), with the channel, the key of the
  //  patch or notification, and the path from its root to the build, so the code that sent it can be found.
  badCityBuilds = new Map<string, string>();

let stopped = false,
  batches = 0,
  notifications = 0,
  humanPlayer: Player | null = null,
  humanClient: DataTransferClient | null = null;

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

// Each tile the frontend holds that isn't what the client would send for it now (#138): the first difference, and when
//  it was first seen. A tile that is stale after one batch is usually stale after every batch until something else
//  sends it, so each is reported once.
const staleTiles = new Map<string, string>();

let tilesCompared = 0;

// `held` is what the frontend holds, and `fresh` what the client would send now. A ref the fresh tile leaves out of its
//  own objects is to something the frontend is trusted to hold (our units and cities, the player, other tiles), so
//  the two refs must name the same thing. Anything the fresh tile carries inline is compared by what it says, not by
//  id: yields and the like are made afresh, with new ids, every time.
const tileDifference = (
  held: any,
  fresh: any,
  heldObjects: PlainObject,
  freshObjects: PlainObject,
  path: string,
  seen: Set<string>
): string | null => {
  if (fresh && typeof fresh === 'object' && typeof fresh['#ref'] === 'string') {
    const freshId = fresh['#ref'],
      heldId = held?.['#ref'];

    if (typeof heldId !== 'string') {
      return `${path}: ${JSON.stringify(held)}, now a ref to ${freshId}`;
    }

    if (!(freshId in freshObjects)) {
      return heldId === freshId ? null : `${path}: ${heldId}, now ${freshId}`;
    }

    if (seen.has(`${heldId} ${freshId}`)) {
      return null;
    }

    seen.add(`${heldId} ${freshId}`);

    return tileDifference(
      heldObjects[heldId],
      freshObjects[freshId],
      heldObjects,
      freshObjects,
      `${path}<${freshId}>`,
      seen
    );
  }

  if (Array.isArray(fresh)) {
    if (!Array.isArray(held) || held.length !== fresh.length) {
      return `${path}: ${
        Array.isArray(held) ? held.length : JSON.stringify(held)
      } entries, now ${fresh.length}`;
    }

    for (let i = 0; i < fresh.length; i++) {
      const difference = tileDifference(
        held[i],
        fresh[i],
        heldObjects,
        freshObjects,
        `${path}[${i}]`,
        seen
      );

      if (difference !== null) {
        return difference;
      }
    }

    return null;
  }

  if (fresh && typeof fresh === 'object') {
    if (!held || typeof held !== 'object') {
      return `${path}: ${JSON.stringify(held)}, now an object`;
    }

    // Not `id`, which a `Yield` carries as a key: it's made afresh, with a new one, every time.
    const keys = new Set(
      [...Object.keys(held), ...Object.keys(fresh)].filter(
        (key) => key !== 'id'
      )
    );

    for (const key of keys) {
      const difference = tileDifference(
        held[key],
        fresh[key],
        heldObjects,
        freshObjects,
        path ? `${path}.${key}` : key,
        seen
      );

      if (difference !== null) {
        return difference;
      }
    }

    return null;
  }

  return held === fresh
    ? null
    : `${path}: ${JSON.stringify(held)}, now ${JSON.stringify(fresh)}`;
};

const checkTilesFresh = (label: string): void => {
  const playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!),
    byId = new Map(
      playerWorld
        .entries()
        .map((playerTile): [string, PlayerTile] => [
          playerTile.id(),
          playerTile,
        ])
    );

  Object.entries(objectMap.objects).forEach(([id, held]: [string, any]) => {
    if (
      held?._ !== 'PlayerTile' ||
      !('terrain' in held) ||
      staleTiles.has(id)
    ) {
      return;
    }

    const playerTile = byId.get(id);

    // Not the player's: the #328 check reports it.
    if (!playerTile) {
      return;
    }

    const fresh = humanClient!.serialiseTile(playerTile),
      difference = tileDifference(
        held,
        fresh.objects[id],
        objectMap.objects,
        fresh.objects,
        '',
        new Set()
      );

    tilesCompared++;

    if (difference !== null) {
      staleTiles.set(
        id,
        `${playerTile.x()},${playerTile.y()} after ${label} (turn ${turnInstance.value()}): ${difference}`
      );
    }
  });
};

// What the frontend holds of the player that isn't what the client would send for it now (#411), checked once an
//  action's patch is in and once the turn is handed over: every unit and city in it, its research, treasury and rates,
//  and its actions. Each difference is reported once, by the path that reaches it and the action after which it was
//  first seen.
const stalePlayer = new Map<string, string>();

let playerComparisons = 0;

const checkPlayerFresh = (label: string): void => {
  const id = humanPlayer!.id(),
    // Round-trip, as what the frontend holds was: a research cost of `Infinity` arrives as `null`.
    fresh = JSON.parse(JSON.stringify(humanClient!.serialisePlayer())),
    difference = tileDifference(
      objectMap.objects[id],
      fresh.objects[id],
      objectMap.objects,
      fresh.objects,
      '',
      // Its units and cities refer back to it.
      new Set([`${id} ${id}`])
    );

  playerComparisons++;

  if (difference !== null) {
    const where = difference.replace(/:.*$/, '');

    if (!stalePlayer.has(where)) {
      stalePlayer.set(
        where,
        `after ${label} (turn ${turnInstance.value()}): ${difference}`
      );
    }
  }
};

// Only a tile patch may carry a tile in full, and only its own: one keyed by the tile, or a newly discovered tile added
//  to the player's world (#138).
const checkFullTiles = (
  key: string,
  index: string | null,
  value: ObjectMap
): void => {
  const full = Object.entries(value.objects)
    .filter(
      ([, object]: [string, PlainObject]) =>
        object?._ === 'PlayerTile' && 'terrain' in object
    )
    .map(([id]) => id);

  if (full.length === 0) {
    return;
  }

  const own =
    full.length === 1 &&
    (index
      ? objectMap.objects[key]?._ === 'PlayerWorld' &&
        value.hierarchy?.['#ref'] === full[0]
      : full[0] === key);

  if (!own) {
    oversized.push(
      `patch for ${key}${index ? ` at ${index}` : ''} carried ${
        full.length
      } PlayerTile(s) in full`
    );
  }
};

// Only refs reachable from the hierarchy matter: that is what `reconstituteData` walks.
//
// Also where the page's view is checked (#328): it may hold the human's `PlayerWorld` and the `PlayerTile`s in it, and
//  no other player's. Each ref reached is remembered with the one that led to it, so the path to a leak can be printed.
const checkRefs = (objectMap: ObjectMap, label = 'patches'): void => {
  const seen = new Set<any>(),
    via = new Map<string, string | null>(),
    reached: [id: string, type: string][] = [],
    visit = (value: any, from: string | null): void => {
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

        if (!via.has(ref)) {
          via.set(ref, from);

          const type = objectMap.objects[ref]?._;

          if (type === 'PlayerWorld' || type === 'PlayerTile') {
            reached.push([ref, type]);
          }
        }

        visit(objectMap.objects[ref], ref);

        return;
      }

      Object.values(value).forEach((child) => visit(child, from));
    };

  visit(objectMap.hierarchy, null);

  const worldId = objectMap.objects[humanPlayer!.id()]?.world?.['#ref'],
    ownTiles = new Set<string>(
      (objectMap.objects[worldId]?.tiles ?? []).map(
        (tile: PlainObject) => tile['#ref']
      )
    ),
    pathTo = (id: string): string => {
      const path: string[] = [];

      for (let at: string | null | undefined = id; at; at = via.get(at)) {
        path.unshift(at);
      }

      return path.join(' -> ');
    };

  reachablePlayerTiles = Math.max(
    reachablePlayerTiles,
    reached.filter(([, type]) => type === 'PlayerTile').length
  );

  reached.forEach(([id, type]) => {
    if (type === 'PlayerWorld' ? id !== worldId : !ownTiles.has(id)) {
      foreignMap.set(`${label} ${id}`, `${label}: ${pathTo(id)}`);
    }
  });
};

// What a city can build is not part of the game data (#324): the picker asks for it, and is answered on its own. Every
//  answer is the names `CityBuild.available()` gives for the player's cities, and nothing for anyone else's.
// The `CityBuild` player action (what a city with nothing to build is waiting on) is serialised as `CityBuild` too, with
//  only a `value` that refers to the build. It is not the thing #324 trimmed, so is not checked as one (#410).
const isCityBuildItem = (object: PlainObject): boolean =>
  object?._ === 'CityBuild' && !object.__?.includes('PlayerAction');

const isBadCityBuild = (cityBuild: PlainObject): boolean =>
  'available' in cityBuild ||
  !['building', 'city', 'cost', 'progress', 'remaining'].every(
    (key) => key in cityBuild
  );

// Notes every `CityBuild` in what a channel sent that carries `available`, or is missing what the picker reads, along
//  with the path from the root that reaches it, as `checkRefs` does for a `PlayerWorld`. `key` is the patch's key, or
//  the notification's root.
const noteCityBuilds = (
  channel: string,
  key: string,
  { hierarchy, objects }: ObjectMap
): void => {
  const seen = new Set<any>(),
    visit = (value: any, path: string): void => {
      if (!value || typeof value !== 'object' || seen.has(value)) {
        return;
      }

      seen.add(value);

      const ref = value['#ref'];

      if (typeof ref === 'string') {
        if (ref in objects) {
          visit(objects[ref], `${path} -> ${ref}`);
        }

        return;
      }

      if (isCityBuildItem(value) && isBadCityBuild(value)) {
        const problems = [
          ...('available' in value ? ['carries available'] : []),
          ...['building', 'city', 'cost', 'progress', 'remaining']
            .filter((name) => !(name in value))
            .map((name) => `has no ${name}`),
        ];

        badCityBuilds.set(
          `${channel} ${key} ${path}`,
          `${channel} ${key}: ${path} ${problems.join(' and ')}`
        );
      }

      Object.entries(value).forEach(([name, child]) =>
        visit(child, `${path}.${name}`)
      );
    };

  visit(hierarchy, key);

  // Anything in `objects` that the hierarchy does not reach is still shipped, so is checked too.
  Object.entries(objects).forEach(([id, object]) => {
    if (!seen.has(object)) {
      visit(object, `${key} (unreached) ${id}`);
    }
  });
};

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

  const cityBuilds = Object.values(objectMap.objects).filter(isCityBuildItem);

  if (
    cityBuilds.length === 0 ||
    cityBuilds.some(isBadCityBuild) ||
    badCityBuilds.size > 0
  ) {
    fail(
      `a CityBuild in the player data carries available, or is missing building, city, cost, progress or remaining (#324): ${
        badCityBuilds.size > 0
          ? [...badCityBuilds.values()].slice(0, 5).join('; ')
          : `${
              cityBuilds.filter(isBadCityBuild).length
            } in the object map, none seen in what was sent`
      }`
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
  // The unit the client should have actions for: the last one asked about, or the last one the human acted with.
  current: null as string | null,
  answering: false,
  requests: 0,
  answers: 0,
  // Patches after the answer that carried the asked unit's actions again: it was still active with moves left.
  carried: 0,
  failures: [] as string[],
};

const requestUnitActions = (unit?: Unit): void => {
  if (!unit) {
    const units = unitRegistryInstance.getByPlayer(humanPlayer!);

    unit =
      units.find((unit) => unit.active() && unit.moves().value() > 0) ??
      units[0];
  }

  // The UI asks once it has the game data, and not before.
  if (
    !unit ||
    !unitActions.handler ||
    Object.keys(objectMap.objects).length === 0
  ) {
    return;
  }

  unitActions.asked = unit.id();
  unitActions.current = unit.id();
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
    if (id !== unitActions.current) {
      unitActions.failures.push(
        `a patch carried actions for ${id}, which was neither asked about nor the last to act`
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

// A page that loads a game already under way (a saved game, or a reload) is handed everything the player knows at once,
//  as the initial game data: the one place a rival `Player` went out in full (#328). The live game's own initial data
//  is sent at turn 1, when nothing is known, so a second client is asked for it at the end, over a transport of its
//  own, and the result checked as the live game's is. The automated player explores too little to have met anyone in
//  the turns this runs for, so the map is revealed first (the `RevealMap` cheat), which makes every civilization's
//  units and cities known, as they are a long way into a game.
const checkReloadedGame = (): void => {
  receivers.get('cheat')?.({ name: 'RevealMap' });

  const rivals = unitRegistryInstance
    .entries()
    .filter((unit) => unit.player() !== humanPlayer);

  if (rivals.length === 0) {
    fail('no other player has a unit, so none could be revealed');
  }

  const reloaded: ObjectMap = { hierarchy: {}, objects: {} },
    client = new DataTransferClient(
      humanPlayer!,
      {
        receive: () => () => false,
        send: (channel: string, data: any): void => {
          if (channel === 'gameData') {
            // Round-trip, as `postMessage` would.
            Object.assign(
              reloaded,
              JSON.parse(
                JSON.stringify(
                  data instanceof DataObject ? data.toPlainObject() : data
                )
              )
            );
          }
        },
      } as any,
      () => {},
      () => {}
    );

  (client as any).sendInitialData();

  if (Object.keys(reloaded.objects).length === 0) {
    fail('the initial game data of a game under way was never sent');
  }

  checkRefs(reloaded, 'initial game data');
};

// The player's actions lists sent on their own, and how many of the actions in them went as refs to ones the frontend
//  already held (#411).
const actionLists = { sent: 0, held: 0 };

// The human, playing by hand (#411). Its choices come from a generator of its own, so that they don't move the engine's.
const human = {
  // Only every `automatedEvery`th turn is automated.
  automatedEvery: 4,
  seed: 411,
  // The action sent and not yet answered by its patch, and how to say it has been.
  pending: null as { label: string; done: () => void } | null,
  turnEnded: false,
  turns: 0,
  actions: 0,
  // How many of each the human sent, which the test reports.
  sent: new Map<string, number>(),
  // A `SimpleAIClient` for the same player, which answers whatever the human is asked to choose.
  helper: null as SimpleAIClient | null,
  pendingChoice: null as ((value: any) => void) | null,
  revolted: false,
  // Whether it has sold an improvement: once a game is enough, and more leaves it too weak to play on with (#31).
  sold: false,
};

const roll = (): number => {
    human.seed = (human.seed * 1103515245 + 12345) % 2147483648;

    return human.seed / 2147483648;
  },
  pick = <T>(list: T[]): T => list[Math.floor(roll() * list.length)],
  // One of `list`, each as likely as its weight.
  pickWeighted = <T>(list: [T, number][]): T => {
    let at = roll() * list.reduce((total, [, weight]) => total + weight, 0);

    for (const [item, weight] of list) {
      at -= weight;

      if (at < 0) {
        return item;
      }
    }

    return list[list.length - 1][0];
  };

const transport = {
  receive: (channel: string, handler: (...args: any[]) => void) => {
    receivers.set(channel, handler);

    if (channel === 'unitActions') {
      unitActions.handler = handler;
    }

    return () => false;
  },
  receiveOnce: (channel: string, handler: (value: any) => void) => {
    if (channel === 'chooseFromList') {
      human.pendingChoice = handler;
    }

    return () => {
      human.pendingChoice = null;
    };
  },
  send: (channel: string, data: any): void => {
    // Whatever the human is asked to choose while it plays by hand, the helper answers, on the next tick, as
    //  `receiveOnce` is registered after the send.
    if (channel === 'chooseFromList') {
      const meta = data as ChoiceMeta<any>,
        respond = human.pendingChoice;

      setTimeout(() =>
        human
          .helper!.chooseFromList(meta)
          .then((value) => {
            const [choice] = meta
              .choices()
              .filter((choice) => choice.value() === value);

            (human.pendingChoice ?? respond)!(choice?.id());
          })
          .catch((error) => fail('the helper could not choose', error))
      );

      return;
    }

    if (channel === 'turnStarted') {
      human.turnEnded = false;
      human.turns++;

      // Handed over: the whole player has just been sent.
      checkPlayerFresh('the hand-over');

      setTimeout(() =>
        playTurn().catch((error) => fail('the human could not play', error))
      );

      return;
    }

    if (channel === 'turnEnded') {
      human.turnEnded = true;

      return;
    }

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
      noteCityBuilds(channel, 'game data', data);

      if (buildItemsIn(data.objects) > 0) {
        buildItemsSent.push(`game data carried ${buildItemsIn(data.objects)}`);
      }
    }

    if (channel === 'gameNotification') {
      checkNotification(data);
      noteCityBuilds(
        channel,
        data.objects?.[data.hierarchy['#ref']]?.key,
        data
      );
    }

    if (channel === 'gameDataPatch') {
      data.forEach((patch: PlainObject) =>
        Object.entries(patch).forEach(([key, { type, index, value }]) => {
          if (type === 'remove') {
            return fail(`unexpected remove patch for ${key}`);
          }

          noteCityBuilds(channel, `${key}${index ? `[${index}]` : ''}`, value);

          if (buildItemsIn(value.objects) > 0) {
            buildItemsSent.push(
              `patch for ${key} carried ${buildItemsIn(value.objects)}`
            );
          }

          checkFullTiles(key, index, value);

          // The player's actions, which go as refs where the frontend already holds them (#411): those refs have to
          //  resolve as any other does, and some have to have been sent for that to have been checked.
          if (key === humanPlayer?.id() && index === 'actions') {
            actionLists.sent++;

            (value.hierarchy as PlainObject[]).forEach((action) => {
              if (!(action['#ref'] in value.objects)) {
                actionLists.held++;
              }
            });
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
      checkRefs(objectMap);
      checkTilesFresh(
        `batch ${batches}${human.pending ? `, ${human.pending.label}` : ''}`
      );
    }

    if (channel === 'gameDataPatch') {
      checkUnitActions(data);
    }

    // The first patch after an action is the one it sent (#321).
    if (channel === 'gameDataPatch' && human.pending !== null) {
      const { label, done } = human.pending;

      human.pending = null;

      checkPlayerFresh(label);
      done();
    }
  },
};

// Sends an action as the UI does, and waits for its patch.
const act = (action: { name: string; [key: string]: any }): Promise<void> =>
  new Promise<void>((resolve) => {
    const label = `${action.name}${
        action.unitAction ? ` ${action.unitAction}` : ''
      }`,
      timeout = setTimeout(
        () => fail(`${label} sent no patch: ${JSON.stringify(action)}`),
        10000
      );

    human.actions++;
    human.sent.set(label, (human.sent.get(label) ?? 0) + 1);

    if (action.name === 'ActiveUnit') {
      unitActions.current = action.id;
    }

    human.pending = {
      label,
      done: () => {
        clearTimeout(timeout);
        resolve();
      },
    };

    receivers.get('action')!(action);
  });

// The unit actions the human never chooses: a GoTo, exploring or automating hands the unit to the client, which then
//  sends its actions with no one asking, and a nuclear attack takes everything around it. And Pillage, for now: when
//  it completes, `base-unit-action-pillage` takes the improvement off the square itself rather than through the
//  `Pillaged` rules, so the square's yields aren't worked out again and nothing says the square changed.
const unitActionsNotChosen = new Set([
  'Automate',
  'Explore',
  'GoTo',
  'NuclearAttack',
  'Pillage',
  'SneakNuclearAttack',
]);

// One of a unit's actions, on its own square or a neighbour the player knows. Settlers found a city wherever they can,
//  so that there are cities to play with. A unit that has acted this turn as often as it may is done with: it is told
//  to wait, sleep or fortify.
const unitAction = (
  unit: Unit,
  done: boolean
): { name: string; [key: string]: any } | null => {
  const playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!),
    candidates: [[string, string], number][] = [];

  [unit.tile(), ...unit.tile().getNeighbours()].forEach((tile) => {
    const playerTile = playerWorld.getByTile(tile);

    if (!playerTile) {
      return;
    }

    unit.actions(tile).forEach((action) => {
      const name = action.sourceClass().name;

      if (unitActionsNotChosen.has(name)) {
        return;
      }

      // Mostly to wait: a unit asleep or fortified is out of the game until it's woken.
      if (done) {
        if (['NoOrders', 'Sleep', 'Fortify'].includes(name)) {
          candidates.push([
            [name, playerTile.id()],
            name === 'NoOrders' ? 1 : 0.1,
          ]);
        }

        return;
      }

      candidates.push([
        [name, playerTile.id()],
        name === 'Move'
          ? 4
          : name === 'Disband'
          ? 0.1
          : name === 'NoOrders'
          ? 0.5
          : ['Sleep', 'Fortify'].includes(name)
          ? 0.1
          : 1,
      ]);
    });
  });

  if (candidates.length === 0) {
    return null;
  }

  const [name, target] =
    candidates.find(([[name]]) => name === 'FoundCity')?.[0] ??
    pickWeighted(candidates);

  return {
    name: 'ActiveUnit',
    id: unit.id(),
    unitAction: name,
    target,
  };
};

// What a city builds: Settlers, mostly, until there are a few cities to play with, and anything after that.
const buildChoice = (cityBuild: any): string => {
  const available = (cityBuild.available() as any[]).map(
    (buildItem) => buildItem.item().name
  );

  return available.includes('Settlers') &&
    cityRegistryInstance.getByPlayer(humanPlayer!).length < 6 &&
    roll() < 0.8
    ? 'Settlers'
    : pick(available);
};

// One of the things the UI lets the player do besides moving units and making the choices it must, or nothing.
const sideAction = (
  actions: PlayerAction[]
): { name: string; [key: string]: any } | null => {
  const named = (name: string): any[] =>
      actions.filter((action) => action.constructor.name === name),
    kinds: (() => { name: string; [key: string]: any } | null)[] = [
      () => {
        const action = pick(named('ChangeProduction')),
          cityBuild = action?.value();

        if (!cityBuild) {
          return null;
        }

        if (roll() < 0.15) {
          return {
            name: 'ChangeProduction',
            id: cityBuild.id(),
            auto: !cityBuild.auto(),
          };
        }

        const chosen = buildChoice(cityBuild);

        return chosen === cityBuild.building()?.item().name
          ? null
          : {
              name: 'ChangeProduction',
              id: cityBuild.id(),
              chosen,
            };
      },
      () => {
        // One the treasury can pay for, as the UI only offers those.
        const [treasury] = playerTreasuryRegistryInstance.getByPlayer(
            humanPlayer!
          ),
          action = pick(
            named('CompleteProduction').filter((action) =>
              treasury
                ?.cost(action.value().city())
                .some(
                  (spendCost) =>
                    spendCost.resource() === treasury.yield() &&
                    spendCost.value() <= treasury.value()
                )
            )
          );

        return action && treasury
          ? {
              name: 'CompleteProduction',
              id: action.value().id(),
              treasury: treasury.id(),
            }
          : null;
      },
      () => {
        const action = pick(named('ChangeWorkedTile')),
          city = action?.value(),
          playerWorld = playerWorldRegistryInstance.getByPlayer(humanPlayer!),
          tiles = city
            ? city
                .tiles()
                .entries()
                .filter((tile: any) => tile !== city.tile())
                .map((tile: any) => playerWorld.getByTile(tile))
                .filter(Boolean)
            : [];

        return tiles.length === 0
          ? null
          : {
              name: 'ChangeWorkedTile',
              id: city.id(),
              tile: pick(tiles as any[]).id(),
            };
      },
      () => {
        const action = pick(named('ChangeSpecialist'));

        return action
          ? { name: 'ChangeSpecialist', id: action.value().id() }
          : null;
      },
      () => {
        const action = pick(named('ChangeWorkedTile'));

        return action
          ? { name: 'ReassignWorkers', city: action.value().id() }
          : null;
      },
      () => {
        const action = pick(named('AdjustTradeRates')),
          rates = action?.value().all();

        // The same values in another order: each is within the government's limit, as they are now.
        return rates
          ? {
              name: 'AdjustTradeRates',
              id: action.value().id(),
              value: rates.map((rate: any, index: number) => [
                rate.constructor.name,
                rates[(index + 1) % rates.length].value(),
              ]),
            }
          : null;
      },
      () => {
        const action = pick(named('InactiveUnit'));

        return action
          ? { name: 'InactiveUnit', id: action.value().id() }
          : null;
      },
      () => {
        const action = pick(named('Revolution'));

        if (!action || human.revolted || turnInstance.value() < 20) {
          return null;
        }

        human.revolted = true;

        return { name: 'Revolution', id: action.value().id() };
      },
      () => {
        // An improvement the rules will sell, as the UI only offers those (#31).
        if (human.sold || turnInstance.value() < 20) {
          return null;
        }

        const [treasury] = playerTreasuryRegistryInstance.getByPlayer(
            humanPlayer!
          ),
          improvements = named('SellImprovement').flatMap((action) =>
            cityImprovementRegistryInstance
              .getByCity(action.value())
              .filter((cityImprovement) =>
                treasury
                  ?.saleValue(cityImprovement)
                  .some(
                    (saleValue) => saleValue.resource() === treasury.yield()
                  )
              )
          ),
          improvement = improvements.length ? pick(improvements) : null;

        if (!improvement || !treasury) {
          return null;
        }

        human.sold = true;

        return improvement && treasury
          ? {
              name: 'SellImprovement',
              id: improvement.city().id(),
              improvement: improvement.id(),
              treasury: treasury.id(),
            }
          : null;
      },
    ];

  return pick(kinds)();
};

// A turn played by hand, as the UI plays it: now and then something besides what must be done, otherwise each
//  mandatory action in turn, a unit acting at a time, and the turn ended once nothing else is left. The UI asks for a
//  unit's actions when it makes it active, and the human sometimes does too, and sometimes "waits", asking about
//  another.
const playTurn = async (): Promise<void> => {
  const actedThisTurn = new Map<Unit, number>();

  for (let step = 0; step < 500; step++) {
    if (stopped || human.turnEnded) {
      return;
    }

    const actions = humanPlayer!.actions(),
      [mandatory] = actions.filter(
        (action) =>
          action instanceof MandatoryPlayerAction &&
          action.constructor.name !== 'EndTurn'
      );

    // Units asleep or fortified, by hand or on an automated turn, are woken now and then, or there'd soon be none.
    const inactive = actions.filter(
      (action) => action.constructor.name === 'InactiveUnit'
    );

    if (inactive.length > 0 && roll() < 0.1) {
      await act({ name: 'InactiveUnit', id: pick(inactive).value().id() });

      continue;
    }

    if (roll() < 0.15) {
      const side = sideAction(actions);

      if (side !== null) {
        await act(side);

        continue;
      }
    }

    if (!mandatory) {
      await act({ name: 'EndTurn' });

      if (!human.turnEnded) {
        fail('ending the turn was refused with nothing left to do');
      }

      return;
    }

    const name = mandatory.constructor.name,
      value: any = mandatory.value();

    if (name === 'ActiveUnit') {
      const unit = value as Unit,
        times = actedThisTurn.get(unit) ?? 0;

      if (roll() < 0.2) {
        requestUnitActions(
          pick(
            actions
              .filter((action) => action.constructor.name === 'ActiveUnit')
              .map((action) => action.value() as Unit)
          )
        );
      }

      if (roll() < 0.5) {
        requestUnitActions(unit);
      }

      const action = unitAction(unit, times >= 3);

      if (action === null) {
        return fail(`${unit.id()} has nothing it can do`);
      }

      actedThisTurn.set(unit, times + 1);

      await act(action);

      continue;
    }

    if (name === 'CityBuild') {
      await act({
        name,
        id: value.id(),
        chosen: buildChoice(value),
      });

      continue;
    }

    if (name === 'ChooseResearch' || name === 'ChooseGovernment') {
      await act({
        name,
        id: value.id(),
        chosen: pick(value.available() as any[]).name,
      });

      continue;
    }

    return fail(`the human does not know how to do ${name}`);
  }

  fail('the human could not end its turn in 500 actions');
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

  checkReloadedGame();

  // What the human did, to see what it covered.
  if (process.env.PATCH_REFS_VERBOSE) {
    console.log(
      `${batches} batches, ${human.actions} actions by hand over ${
        human.turns
      } turns, ${playerComparisons} player comparisons: ${[
        ...human.sent.entries(),
      ]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, count]) => `${label} x${count}`)
        .join(', ')}`
    );
  }

  if (foreignMap.size > 0) {
    console.error(
      `FAIL patchRefs: the page can reach ${
        foreignMap.size
      } PlayerWorld(s) or PlayerTile(s) that are not the player's own (#328), e.g. ${[
        ...foreignMap.values(),
      ]
        .slice(0, 3)
        .join('; ')}`
    );

    process.exit(1);
  }

  if (reachablePlayerTiles === 0) {
    console.error(
      "FAIL patchRefs: no PlayerTile was reachable, so none was checked for being the player's own"
    );

    process.exit(1);
  }

  if (staleTiles.size > 0) {
    console.error(
      `FAIL patchRefs: ${
        staleTiles.size
      } PlayerTile(s) the frontend holds were changed with no tile patch (#138), e.g. ${[
        ...staleTiles.entries(),
      ]
        .slice(0, 5)
        .map(([id, difference]) => `${id} at ${difference}`)
        .join('; ')}`
    );

    process.exit(1);
  }

  if (tilesCompared === 0) {
    console.error(
      'FAIL patchRefs: no PlayerTile the frontend holds was compared with the engine'
    );

    process.exit(1);
  }

  if (stalePlayer.size > 0) {
    console.error(
      `FAIL patchRefs: ${
        stalePlayer.size
      } part(s) of the player the frontend holds were changed with no patch of them (#411), e.g. ${[
        ...stalePlayer.entries(),
      ]
        .slice(0, 5)
        .map(([where, difference]) => `${where} ${difference}`)
        .join('; ')}`
    );

    process.exit(1);
  }

  if (human.actions === 0 || playerComparisons === 0) {
    console.error(
      `FAIL patchRefs: the human sent ${human.actions} action(s), and the player was compared ${playerComparisons} time(s)`
    );

    process.exit(1);
  }

  if (actionLists.held === 0) {
    console.error(
      `FAIL patchRefs: ${actionLists.sent} list(s) of the player's actions were sent, and none carried a ref to an action the frontend held`
    );

    process.exit(1);
  }

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
    `PASS patchRefs (${batches} batches and ${notifications} notifications over ${turn} turns, every reachable ref resolves; the player's own PlayerWorld and ${reachablePlayerTiles} PlayerTile(s) are all the page can reach; ${tilesCompared} comparisons found every tile the frontend holds up to date; ${unitActions.answers} unitActions answered, actions only ever for the unit asked about or the last to act, ${unitActions.carried} later patch(es) kept them; ${human.actions} actions by hand over ${human.turns} turns, after each of which, and each hand-over, ${playerComparisons} comparisons found the player the frontend holds up to date; ${actionLists.sent} lists of its actions sent, with ${actionLists.held} actions the frontend held as refs)`
  );

  process.exit(0);
});

engine.on('player:turn-start', (player: Player): void => {
  if (!stopped && player === humanPlayer) {
    requestUnitActions();
  }
});

// Every `automatedEvery`th turn, the human's turn is automated, as a player can switch it on.
engine.on('turn:start', (turn: number): void => {
  humanClient?.setAutomationEnabled(turn % human.automatedEvery === 0);
});

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((_, index): void => {
    const player = new Player();

    if (index === 0) {
      humanPlayer = player;
    }

    playerRegistryInstance.register(player);

    let client: DataTransferClient | SimpleAIClient;

    if (index === 0) {
      humanClient = new DataTransferClient(
        player,
        transport as any,
        (channel, payload) => transport.send(channel, payload),
        () => {}
      );
      human.helper = new SimpleAIClient(player);
      client = humanClient;
    } else {
      client = new SimpleAIClient(player);
    }

    clientRegistryInstance.register(client);
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
