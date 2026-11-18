// Whether a city is walled, as Civ1's rules send it for the map to draw (#688), with the civ1 set loaded as a game loads
//  it and rules-civ1's AdditionalData registered:
//
// - your own city's `walled`: City Walls make it walled, as v474.05 draws them (`MAP.C`, `buildings & 0x80`); Civ1's
//   Great Wall doesn't, as it's no walls there (a parley's peace offer);
// - a rival's city, sent as a stand-in, carries `walled` too, and its building City Walls sends it again with its
//   square; a building that changes nothing sends nothing.

import './lib/seed';
import '@civ-clone/ui-worker-client/Game';
import {
  CityWalls,
  Temple,
} from '@civ-clone/civ1-city-improvement/CityImprovements';
import { Grassland } from '@civ-clone/civ1-world/Terrains';
import City from '@civ-clone/core-city/City';
import FillGenerator from '@civ-clone/simple-world-generator/tests/lib/FillGenerator';
import { GreatWall } from '@civ-clone/civ1-wonder/Wonders';
import Player from '@civ-clone/core-player/Player';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Tile from '@civ-clone/core-world/Tile';
import { Greek, Roman } from '@civ-clone/civ1-civilization/Civilizations';
import { unknownCityOf } from '@civ-clone/ui-worker-client/Client/standIns';
import { playerView } from '@civ-clone/ui-worker-client/Client/View';
import { registerPatchEvents } from '@civ-clone/ui-worker-client/Client/events/patchEvents';
import Added from '@civ-clone/core-player/Rules/Added';
import World from '@civ-clone/core-world/World';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';
import { workerRules } from '@civ-clone/ui-worker-client/workerRules';

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

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL cityWalls: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// The key's value for `object`, as the client's payload would carry it.
const additional = (object: any, key: string): any =>
  additionalDataRegistryInstance
    .getByType(object.sourceClass())
    .find((additionalData) => additionalData.key() === key)
    ?.data(object);

const run = async (): Promise<void> => {
  const world = await new World(
      new FillGenerator(40, 40, Grassland),
      defaultGame.rules,
      defaultGame.landMasses
    ).build(),
    addPlayer = () => {
      const player = new Player(defaultGame.rules);

      defaultGame.players.register(player);
      defaultGame.playerWorlds.register(
        new PlayerWorld(player, world, defaultGame.rules)
      );

      return player;
    },
    us = addPlayer(),
    them = addPlayer();

  await pluginsFrom(pluginSets)
    .sets.find(({ id }) => id === 'civ1')!
    .load();
  await import('@civ-clone/ui-rules-civ1');

  [us, them].forEach((player, index) => {
    player.setCivilization(index === 0 ? new Roman() : new Greek());
    defaultGame.rules.process(Added, player);
  });

  const ours = new City(us, world.get(10, 10), 'Ours', defaultGame.rules),
    other = new City(us, world.get(20, 10), 'Other', defaultGame.rules),
    theirs = new City(them, world.get(30, 30), 'Theirs', defaultGame.rules);

  expect(
    'to begin with, no city is walled',
    [ours, other, theirs].map((city) => additional(city, 'walled')),
    [false, false, false]
  );

  defaultGame.cityImprovements.register(new CityWalls(ours, defaultGame.rules));
  defaultGame.wonders.register(new GreatWall(other, defaultGame.rules));

  expect(
    "City Walls make a city walled; Civ1's Great Wall doesn't",
    [ours, other].map((city) => additional(city, 'walled')),
    [true, false]
  );

  // What the client patches for a rival's city the player has seen.
  defaultGame.playerWorlds
    .getByPlayer(us)
    .register(
      ...world
        .tiles()
        .filter(
          (tile: Tile) =>
            defaultGame.playerWorlds.getByPlayer(us).getByTile(tile) === null
        )
    );

  const view = playerView(() => us, {
      cities: defaultGame.cities,
      interactions: defaultGame.interactions,
      playerWorlds: defaultGame.playerWorlds,
    } as any),
    listeners: { [event: string]: ((...args: any[]) => void)[] } = {},
    patched: string[] = [];

  registerPatchEvents(
    {
      on: (event: string, listener: (...args: any[]) => void) =>
        (listeners[event] = [...(listeners[event] ?? []), listener]),
      off: () => {},
    } as any,
    {
      view,
      cities: defaultGame.cities,
      units: defaultGame.units,
      dataFilter: () => (object: any) => object,
      patches: {
        tile: (tile: any) => tile && patched.push(`tile ${tile.id()}`),
        unit: (unit: any) => patched.push(`unit ${unit.id()}`),
        city: (city: any) => patched.push(`city ${city.name()}`),
        update: (id: string) => patched.push(`update ${id}`),
        playerKey: () => {},
        flush: () => {},
      },
    } as any
  );

  const emit = (event: string, ...args: unknown[]) => {
      patched.length = 0;
      listeners[event]!.forEach((listener) => listener(...args));

      return [...patched];
    },
    theirCity = unknownCityOf(theirs),
    theirBuild = defaultGame.cityBuilds.getByCity(theirs),
    theirTemple = new Temple(theirs, defaultGame.rules);

  expect(
    "a rival's city sent as a stand-in says whether it's walled",
    [theirCity.keys().includes('walled'), theirCity.walled()],
    [true, false]
  );

  defaultGame.cityImprovements.register(theirTemple);

  expect(
    "a rival's building that isn't walls sends nothing",
    emit('city:building-complete', theirBuild, theirTemple),
    []
  );

  const theirWalls = new CityWalls(theirs, defaultGame.rules);

  defaultGame.cityImprovements.register(theirWalls);

  expect(
    "a rival's City Walls: its stand-in is walled, and goes again with its square",
    [
      emit('city:building-complete', theirBuild, theirWalls),
      theirCity.walled(),
      workerRules().walled!(theirs),
    ],
    [
      [`update ${theirCity.id()}`, `tile ${view.tile(theirs.tile())!.id()}`],
      true,
      true,
    ]
  );

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL cityWalls (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS cityWalls (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL cityWalls: ${error?.stack ?? error}\n`);
  process.exit(1);
});
