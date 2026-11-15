// What Civ2's rules send the interface about its combat and units (M2b, #1007), with the civ2 set loaded as a game
//  loads it and rules-civ2's AdditionalData registered:
//
// - a unit's hit points left and most, its firepower and an aircraft's fuel (`hitPoints`, `firepower`, `fuel`);
// - the distant squares Paradrop and Airlift reach (`actionTargets`), asked of the engine square by square, and left out
//   of every unit but the one the interface has the actions of, as `actions` are;
// - what Pillage can take (`targets`), and the player's choice reaching `perform(target)` through the client's
//   `ActiveUnit` handler, which passes on only a choice the action offers;
// - `unit:promoted`, which rules-civ2's `Promoted` rule emits for the client's notice.

import './lib/seed';
import '@civ-clone/ui-worker-client/Game';
import { Airbase, Mine, Road } from '@civ-clone/civ2-world/TileImprovements';
import { Grassland, Ocean } from '@civ-clone/civ2-world/Terrains';
import {
  Fighter,
  Musketman,
  Paratrooper,
  Warrior,
} from '@civ-clone/civ2-unit/Units';
import ActionsState from '@civ-clone/ui-worker-client/Client/ActionsState';
import { Airport } from '@civ-clone/civ2-city-improvement/CityImprovements';
import City from '@civ-clone/core-city/City';
import CityGrowth from '@civ-clone/core-city-growth/CityGrowth';
import FillGenerator from '@civ-clone/simple-world-generator/tests/lib/FillGenerator';
import Pillage from '@civ-clone/base-unit-action-pillage/Pillage';
import Player from '@civ-clone/core-player/Player';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import { Promoted } from '@civ-clone/base-unit-veteran-promotion/lib/Rules';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import World from '@civ-clone/core-world/World';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { handleActiveUnit } from '@civ-clone/ui-worker-client/Client/actions/unit';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';
import unitWithoutActions from '@civ-clone/ui-worker-client/lib/unitWithoutActions';

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
    process.stderr.write('FAIL civ2Units: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// The key's value for `object`, as the client's payload would carry it.
const additional = (object: any, key: string): unknown =>
  additionalDataRegistryInstance
    .getByType(object.sourceClass())
    .find((additionalData) => additionalData.key() === key)
    ?.data(object);

const run = async (): Promise<void> => {
  // A 30 × 30 square world of Grassland with a column of Ocean, built before the rules are in, as are the cities, so
  //  nothing here needs what a whole game sets up.
  class Map extends FillGenerator {
    generate() {
      return Promise.resolve(
        new Array(30 * 30)
          .fill(0)
          .map((value, index) =>
            index % 30 === 5 ? new Ocean() : new Grassland()
          )
      );
    }
  }

  const world = await new World(
      new Map(30, 30, Grassland),
      defaultGame.rules,
      defaultGame.landMasses
    ).build(),
    addPlayer = () => {
      const player = new Player(defaultGame.rules);

      defaultGame.players.register(player);
      defaultGame.playerResearch.register(new PlayerResearch(player));
      defaultGame.playerWorlds.register(
        new PlayerWorld(player, world, defaultGame.rules)
      );

      return player;
    },
    us = addPlayer(),
    them = addPlayer(),
    addCity = (player: Player, tile: Tile, name: string) => {
      const city = new City(player, tile, name, defaultGame.rules);

      defaultGame.cities.register(city);
      defaultGame.cityGrowth.register(new CityGrowth(city, defaultGame.rules));

      return city;
    },
    home = addCity(us, world.get(10, 10), 'Home'),
    other = addCity(us, world.get(20, 20), 'Other');

  defaultGame.cityImprovements.register(
    new Airport(home, defaultGame.rules),
    new Airport(other, defaultGame.rules)
  );

  await pluginsFrom(pluginSets)
    .sets.find(({ id }) => id === 'civ2')!
    .load();
  await import('@civ-clone/ui-rules-civ2');

  const fullMoves = (unit: Unit): Unit => {
    unit.moves().set(unit.movement().value());

    return unit;
  };

  // Hit points, firepower, fuel.

  const warrior = new Warrior(null, us, world.get(12, 12), defaultGame.rules),
    fighter = fullMoves(
      new Fighter(null, us, world.get(12, 12), defaultGame.rules)
    );

  expect(
    "a Warrior's hit points, firepower and fuel",
    ['hitPoints', 'firepower', 'fuel'].map((key) => additional(warrior, key)),
    [{ current: 10, max: 10 }, 1, null]
  );

  warrior.setDamage(4);

  expect('a damaged Warrior', additional(warrior, 'hitPoints'), {
    current: 6,
    max: 10,
  });
  expect(
    "a Fighter's fuel: its range, and the turns of it left",
    additional(fighter, 'fuel'),
    {
      range: 1,
      turnsLeft: 1,
    }
  );

  // Paradrop and Airlift.

  const paratrooper = fullMoves(
      new Paratrooper(null, us, home.tile(), defaultGame.rules)
    ),
    targets = additional(paratrooper, 'actionTargets') as {
      [action: string]: string[];
    },
    reaches = (tile: Tile) => targets.Paradrop!.includes(tile.id());

  expect(
    'a Paratrooper in a city with an Airport reaches land within 10, its own square and water not, and nothing farther (and can be airlifted)',
    [
      Object.keys(targets),
      reaches(world.get(11, 10)),
      reaches(world.get(10, 20)),
      reaches(world.get(10, 10)),
      reaches(world.get(5, 10)),
      // civ2-unit's `map_distance` is the isometric map's, by half-steps: 15 here.
      reaches(world.get(25, 10)),
    ],
    [['Paradrop', 'Airlift'], true, true, false, false, false]
  );
  expect(
    'a Paratrooper out of a city reaches nothing',
    additional(
      fullMoves(
        new Paratrooper(null, us, world.get(12, 12), defaultGame.rules)
      ),
      'actionTargets'
    ),
    null
  );

  const musketman = fullMoves(
    new Musketman(null, us, home.tile(), defaultGame.rules)
  );

  expect(
    'a Musketman in a city with an Airport is airlifted to the other',
    additional(musketman, 'actionTargets'),
    { Airlift: [other.tile().id()] }
  );
  expect(
    'a unit without the actions the interface asked for carries no targets, but its hit points',
    ['actionTargets', 'hitPoints'].map((key) =>
      (unitWithoutActions(paratrooper).keys() as string[]).includes(key)
    ),
    [false, true]
  );

  // Pillage, with a choice.

  const pillaged = world.get(14, 14);

  defaultGame.tileImprovements.register(
    new Road(pillaged),
    new Mine(pillaged),
    new Airbase(pillaged)
  );

  const enemy = fullMoves(new Warrior(null, them, pillaged, defaultGame.rules)),
    pillageOf = (unit: Unit) =>
      unit.actions(unit.tile()).find((action) => action instanceof Pillage) as
        | Pillage
        | undefined;

  expect(
    'what Pillage can take, as the square lists it',
    additional(pillageOf(enemy), 'targets'),
    ['Road', 'Mine', 'Airbase']
  );

  const pillagedWith = async (choice: string | undefined) => {
    const unit = fullMoves(
        new Warrior(null, them, pillaged, defaultGame.rules)
      ),
      patched: string[] = [];

    await handleActiveUnit(
      {
        view: {
          world: () => [{ id: () => pillaged.id(), tile: () => pillaged }],
        },
        actions: new ActionsState(),
        patches: {
          unit: () => patched.push('unit'),
          city: () => patched.push('city'),
          onTiles: () => patched.push('tiles'),
        },
        talks: {
          pending: Promise.resolve(),
          talkToPlayersMet: async () => {},
        },
      } as any,
      {
        unitAction: 'Pillage',
        target: pillaged.id(),
        ...(choice === undefined ? {} : { choice }),
      },
      { value: () => unit } as any
    );

    return defaultGame.pendingEffects
      .entries()
      .filter((effect: any) => effect.target?.() === unit)
      .map((effect: any) => effect.data()?.target ?? null);
  };

  expect(
    'the client passes the choice on: the work is recorded with it',
    await pillagedWith('Airbase'),
    ['Airbase']
  );
  expect(
    'and a choice the action does not offer is left out',
    await pillagedWith('Farmland'),
    [null]
  );
  expect('as is none', await pillagedWith(undefined), [null]);

  // Promotion.

  const promoted: string[] = [],
    listener = (unit: Unit, loser: Unit) =>
      promoted.push(`${unit.id()} beat ${loser.id()}`);

  defaultGame.engine.on('unit:promoted', listener);
  defaultGame.rules.process(Promoted, warrior, enemy, null as any);
  defaultGame.engine.off('unit:promoted', listener);

  expect('a promotion is told to the client', promoted, [
    `${warrior.id()} beat ${enemy.id()}`,
  ]);

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL civ2Units (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civ2Units (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL civ2Units: ${error?.stack ?? error}\n`);
  process.exit(1);
});
