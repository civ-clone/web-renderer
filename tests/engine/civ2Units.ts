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
import { attackSoundOf } from '@civ-clone/ui-worker-client/Client/battleEvents';
import { battleTune } from '@civ-clone/ui-audio/eventSounds';
import * as Units from '@civ-clone/civ2-unit/Units';
import { handleActiveUnit } from '@civ-clone/ui-worker-client/Client/actions/unit';
import { makeDataFilter } from '@civ-clone/ui-worker-client/Client/visibilityFilter';
import { playerView } from '@civ-clone/ui-worker-client/Client/View';
import { registerPatchEvents } from '@civ-clone/ui-worker-client/Client/events/patchEvents';
import { unknownUnitOf } from '@civ-clone/ui-worker-client/Client/standIns';
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
  // A 60 × 40 square world (the soak's size) of Grassland with a column of Ocean, built before the rules are in, as are the cities, so
  //  nothing here needs what a whole game sets up.
  class Map extends FillGenerator {
    generate() {
      return Promise.resolve(
        new Array(60 * 40)
          .fill(0)
          .map((value, index) =>
            index % 60 === 5 ? new Ocean() : new Grassland()
          )
      );
    }
  }

  const world = await new World(
      new Map(60, 40, Grassland),
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

  // Everything discovered but one square, and two rival units: one next to the city, in sight, and one out of sight.
  const undiscovered = world.get(10, 18),
    rivalInSight = new Warrior(
      null,
      them,
      world.get(11, 11),
      defaultGame.rules
    ),
    rivalOutOfSight = new Warrior(
      null,
      them,
      world.get(10, 19),
      defaultGame.rules
    );

  defaultGame.playerWorlds
    .getByPlayer(us)
    .register(
      ...world
        .tiles()
        .filter(
          (tile: Tile) =>
            tile !== undiscovered &&
            defaultGame.playerWorlds.getByPlayer(us).getByTile(tile) === null
        )
    );

  // The Ocean nearest the city, within 10 of it.
  const [ocean] = world
      .tiles()
      .filter((tile: Tile) => tile.terrain() instanceof Ocean)
      .sort(
        (a: Tile, b: Tile) =>
          a.distanceFrom(home.tile()) - b.distanceFrom(home.tile())
      ),
    paratrooper = fullMoves(
      new Paratrooper(null, us, home.tile(), defaultGame.rules)
    ),
    targets = additional(paratrooper, 'actionTargets') as {
      [action: string]: Tile[];
    },
    reaches = (tile: Tile) => targets.Paradrop!.includes(tile);

  expect(
    'a Paratrooper in a city with an Airport reaches land within 10, its own square and water not, and nothing farther (and can be airlifted)',
    [
      Object.keys(targets),
      reaches(world.get(11, 10)),
      reaches(world.get(10, 20)),
      reaches(world.get(10, 10)),
      reaches(ocean!),
      // civ2-unit's `map_distance` is the isometric map's, by half-steps: 15 here.
      reaches(world.get(25, 10)),
    ],
    [['Paradrop', 'Airlift'], true, true, false, false, false]
  );
  expect(
    "the player's map only: a square not yet discovered isn't offered, though in range",
    reaches(undiscovered),
    false
  );
  expect(
    "a rival's unit in sight: refused, as the engine does; out of sight: offered as if empty, so nothing hidden shows",
    [reaches(rivalInSight.tile()), reaches(rivalOutOfSight.tile())],
    [false, true]
  );

  {
    // A drop onto it is refused when it's made, and answered like any action the engine doesn't offer: nothing done.
    const dropper = fullMoves(
        new Paratrooper(null, us, home.tile(), defaultGame.rules)
      ),
      target = rivalOutOfSight.tile(),
      answer = await handleActiveUnit(
        {
          view: {
            world: () => [{ id: () => target.id(), tile: () => target }],
          },
          actions: new ActionsState(),
          patches: { unit: () => {}, city: () => {}, onTiles: () => {} },
          talks: {
            pending: Promise.resolve(),
            talkToPlayersMet: async () => {},
          },
        } as any,
        { unitAction: 'Paradrop', target: target.id() },
        { value: () => dropper } as any
      );

    expect(
      'a drop onto a hidden unit is refused when made: answered, the Paratrooper still at home',
      [answer, dropper.tile() === home.tile()],
      [false, true]
    );
  }
  {
    // What working the targets out costs, on the client's every patch of the unit: printed, not checked.
    const started = process.hrtime.bigint();

    for (let i = 0; i < 10; i++) {
      additional(paratrooper, 'actionTargets');
    }

    process.stdout.write(
      `a Paratrooper's targets on a 60 × 40 map: ${(
        Number(process.hrtime.bigint() - started) / 1e7
      ).toFixed(1)} ms each\n`
    );
  }

  const onAirbase = world.get(30, 30);

  defaultGame.tileImprovements.register(new Airbase(onAirbase));

  expect(
    'a Paratrooper on an Airbase reaches land too',
    Object.keys(
      (additional(
        fullMoves(new Paratrooper(null, us, onAirbase, defaultGame.rules)),
        'actionTargets'
      ) ?? {}) as object
    ),
    ['Paradrop']
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
    (additional(musketman, 'actionTargets') as { Airlift: Tile[] }).Airlift.map(
      (tile) => tile.id()
    ),
    [other.tile().id()]
  );

  // As the client sends them: through its filter, the squares as the player's own, the ids the page knows them by.
  {
    const view = playerView(() => us, {
        cities: defaultGame.cities,
        interactions: defaultGame.interactions,
        playerWorlds: defaultGame.playerWorlds,
      } as any),
      actions = new ActionsState(),
      // Our player as a name: what it holds isn't what this is about, and its actions want a whole game.
      filter = makeDataFilter(
        () => view,
        actions
      )((object: any) => (object instanceof Player ? { _: 'Player' } : object));

    actions.setUnitWithActions(musketman, () => {});

    const { hierarchy, objects } = musketman.toPlainObject(filter) as any,
      sent = objects[hierarchy['#ref']].actionTargets.Airlift.map(
        (ref: any) => ref['#ref']
      );

    expect(
      "the targets go as the player's squares, by the ids the page has for them",
      sent,
      [view.tile(other.tile())!.id()]
    );

    const enemy = new Warrior(null, them, world.get(41, 30), defaultGame.rules);

    enemy.setDamage(3);

    // As the filter sends it (`unknownUnitOf`), its player and square left as names: they aren't what this is about.
    const { hierarchy: enemyRef, objects: enemyObjects } = unknownUnitOf(
        enemy
      ).toPlainObject((object: any) =>
        object instanceof Player || object instanceof Tile
          ? { _: object.constructor.name }
          : object
      ) as any,
      plainEnemy = enemyObjects[enemyRef['#ref']];

    expect(
      "another player's unit goes as what it is, where, whose, and its hit points, for its bar",
      [Object.keys(plainEnemy).sort(), plainEnemy.hitPoints],
      [
        ['_', '__', 'hitPoints', 'id', 'player', 'tile'],
        { current: 7, max: 10 },
      ]
    );

    // What the client patches after a battle: a damaged winner, and a promoted unit of ours however whole it is.
    const listeners: { [event: string]: ((...args: any[]) => void)[] } = {},
      patched: string[] = [],
      dispose = registerPatchEvents(
        {
          on: (event: string, listener: (...args: any[]) => void) =>
            (listeners[event] = [...(listeners[event] ?? []), listener]),
          off: () => {},
        } as any,
        {
          view,
          patches: {
            tile: (tile: any) => tile && patched.push(`tile ${tile.id()}`),
            unit: (unit: Unit) => patched.push(`unit ${unit.id()}`),
            city: () => {},
            playerKey: () => {},
          },
        } as any
      ),
      emit = (event: string, ...args: unknown[]) => {
        patched.length = 0;
        listeners[event]!.forEach((listener) => listener(...args));

        return [...patched];
      },
      winner = new Warrior(null, us, world.get(42, 30), defaultGame.rules),
      loser = new Warrior(null, them, world.get(43, 30), defaultGame.rules);

    expect(
      'an undamaged winner: only the loser’s square, as before',
      emit('unit:defeated', loser, winner, null),
      [`tile ${view.tile(loser.tile())!.id()}`]
    );

    winner.setDamage(2);

    expect(
      'a damaged winner of ours: its square and itself too',
      emit('unit:defeated', loser, winner, null),
      [
        `tile ${view.tile(loser.tile())!.id()}`,
        `tile ${view.tile(winner.tile())!.id()}`,
        `unit ${winner.id()}`,
      ]
    );

    winner.setDamage(0);

    expect(
      'a promoted unit of ours, whole: its square and itself',
      emit('unit:promoted', winner, loser),
      [`tile ${view.tile(winner.tile())!.id()}`, `unit ${winner.id()}`]
    );
    expect(
      "a rival's promotion: nothing",
      emit('unit:promoted', loser, winner),
      []
    );

    dispose();
  }
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

  // Battle sounds: Civ1's three, by Civ1's test on Civ2's table, as the battle events read them.

  const soundOf = (UnitType: typeof Unit) =>
    attackSoundOf(
      new UnitType(null, them, world.get(40, 30), defaultGame.rules)
    );

  expect(
    "battles sound as Civ1's do: a blade's, a gun's, a bombing run",
    [
      Units.Warrior,
      Units.Knight,
      Units.Crusader,
      Units.Musketman,
      Units.Catapult,
      Units.Frigate,
      Units.Ironclad,
      Units.Bomber,
      Units.StealthBomber,
      Units.Spy,
    ].map((UnitType) => [UnitType.name, soundOf(UnitType)]),
    [
      ['Warrior', ['melee']],
      ['Knight', ['melee']],
      ['Crusader', ['melee']],
      ['Musketman', ['gunfire']],
      ['Catapult', ['gunfire']],
      ['Frigate', ['melee']],
      ['Ironclad', ['gunfire']],
      ['Bomber', ['bombing', 'gunfire']],
      ['StealthBomber', ['bombing', 'gunfire']],
      ['Spy', ['melee']],
    ]
  );
  expect(
    'every Civ2 unit has one, and it has a tune',
    Object.values(Units)
      .filter(
        (UnitType) =>
          battleTune({ sound: soundOf(UnitType) ?? [], won: true }) === null
      )
      .map((UnitType) => UnitType.name),
    []
  );

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
