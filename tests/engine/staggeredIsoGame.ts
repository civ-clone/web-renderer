// A whole game of computer players on the staggered isometric grid (#86): Civ1's rules and the AI were written for the
//  square grid, and only reach the grid through the world's topology, so this plays one and checks that nothing
//  behaves as if it were square. On that grid a tile's storage coordinates aren't a grid: its neighbours depend on
//  whether its row is odd, and north and south are two rows away (see core-world's `StaggeredIsoTopology`).
//
// Every turn it checks that each city works the 21 tiles of a fat cross, distinct and within two steps of it, and
//  every `unit:moved` goes to the tile itself or one of its neighbours. At the end, that cities and units stood on
//  both odd and even rows, that units moved in all eight directions, that no unit had to be skipped for a move that
//  threw (the AI logs those and carries on) and that nothing reached `Math.random`. Every ten turns and at the end,
//  that Civ1's distance between every two cities, and from each city to its capital (corruption's), is measured over
//  the grid's logical axes.
//
// `CONFORMANCE_CONFIG='{"topologyId":"square"}'` plays the same seed on the square grid, to compare by hand.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config, mathRandomCalls } from './lib/seed';
import './lib/spawnedClients';

import Action from '@civ-clone/core-unit/Action';
import City from '@civ-clone/core-city/City';
import BarbarianClient from '@civ-clone/simple-ai-client/BarbarianClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import World from '@civ-clone/core-world/World';
import civ1Distance from '@civ-clone/civ1-world/lib/civ1Distance';
import { Palace } from '@civ-clone/library-city/CityImprovements';
import { instance as cityGrowthRegistryInstance } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { instance as cityImprovementRegistryInstance } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

// The suite's own game, smaller and longer than `lib/seed`'s default: an even height, as the grid wraps north to south.
const supplied = JSON.parse(process.env.CONFORMANCE_CONFIG || '{}'),
  topologyId: string = supplied.topologyId ?? 'staggered-iso',
  width: number = supplied.width ?? 40,
  height: number = supplied.height ?? 32,
  players: number = supplied.players ?? 4,
  turns: number = supplied.turns ?? 150,
  label = `${topologyId}, ${width}x${height}, seed ${config.seed}, ${turns} turns`,
  failures: string[] = [],
  // A few of each kind of failure are enough to see what went wrong.
  examples: { [kind: string]: number } = {},
  failure = (kind: string, message: string): void => {
    examples[kind] = (examples[kind] ?? 0) + 1;

    if (examples[kind]! <= 5) {
      failures.push(`${kind}: ${message}`);
    }
  },
  at = (tile: Tile): string => `(${tile.x()}, ${tile.y()})`,
  started = Date.now();

let world: World | null = null,
  stopped = false,
  checks = 0,
  moves = 0;

const directions: { [direction: string]: number } = {},
  cityRows = { even: 0, odd: 0 },
  unitRows = { even: 0, odd: 0 },
  citiesSeen = new Set<string>(),
  skipped: string[] = [],
  loopGuardHits = { count: 0 },
  errorsLogged: string[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL staggered-iso game (${label}): ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

// The AI catches a unit's failed move, logs it and skips the unit for the turn (`actionFailed`), and gives up on a
//  unit that has run out of things to try (`actionLimitReached`, which dumps the unit to the console). A move that
//  throws on this grid would only show up there, so both are counted, and the console kept quiet.
console.log = (): void => {};
console.error = (...args: unknown[]): void => {
  errorsLogged.push(
    args
      .map((arg) => (arg instanceof Error ? arg.message : String(arg)))
      .join(' ')
  );
};

[SimpleAIClient, BarbarianClient].forEach((Client): void => {
  const prototype = Client.prototype as any,
    actionFailed = prototype.actionFailed,
    actionLimitReached = prototype.actionLimitReached;

  prototype.actionFailed = function (action: any, error: unknown) {
    const item = action.value();

    skipped.push(
      `${Client.name}: ${item?.constructor?.name} at ${
        item instanceof Unit ? at(item.tile()) : '?'
      }: ${error instanceof Error ? error.stack : String(error)}`
    );

    return actionFailed.call(this, action, error);
  };

  prototype.actionLimitReached = function (action: unknown) {
    loopGuardHits.count++;

    return actionLimitReached.call(this, action);
  };
});

// As `run.ts`: the turn loop has no natural exit, so its events are swallowed once the game is over.
const LOOP_EVENTS = [
    'player:turn-end',
    'player:turn-start',
    'turn:end',
    'turn:start',
  ],
  emit = engine.emit.bind(engine);

engine.emit = (event: string, ...args: any[]): void => {
  if (stopped && LOOP_EVENTS.includes(event)) {
    return;
  }

  emit(event, ...args);
};

engine.on('world:built', (built: World): void => {
  world = built;

  // Without this the rest proves nothing: a grid that didn't take plays a square game, and passes.
  if (
    built.topologyId() !== topologyId ||
    built.topology().id() !== topologyId
  ) {
    fail(
      `the world is on the '${built.topology().id()}' grid, not '${topologyId}'`
    );
  }

  if (topologyId === 'staggered-iso' && !built.topology().wrapsY()) {
    fail('the staggered isometric world does not wrap north to south');
  }
});

// Every action that moves a unit, or acts where it stands, says where from and where to: one step at most.
engine.on('unit:moved', (unit: Unit, action: Action): void => {
  const topology = world!.topology(),
    from = action.from(),
    to = action.to(),
    steps = topology.steps(from.x(), from.y(), to.x(), to.y());

  checks++;

  if (steps === 0) {
    return;
  }

  moves++;

  const direction = topology.directions().find((direction: string): boolean => {
    const neighbour = topology.neighbour(from.x(), from.y(), direction);

    return (
      neighbour !== null && neighbour[0] === to.x() && neighbour[1] === to.y()
    );
  });

  if (steps !== 1 || direction === undefined) {
    failure(
      'a unit moved to a tile that is not a neighbour',
      `${unit.constructor.name} ${action.constructor.name} ${at(from)} → ${at(
        to
      )}, ${steps} steps`
    );

    return;
  }

  directions[direction] = (directions[direction] ?? 0) + 1;
});

// A destroyed city stays in the registry, marked destroyed.
const liveCities = (): City[] =>
  cityRegistryInstance.entries().filter((city: City) => !city.destroyed());

const liveUnits = (): Unit[] =>
  unitRegistryInstance.entries().filter((unit: Unit) => !unit.destroyed());

const parity = (tile: Tile): 'even' | 'odd' =>
  (tile.y() & 1) === 0 ? 'even' : 'odd';

const checkCities = (): void => {
  const topology = world!.topology();

  liveCities().forEach((city): void => {
    const centre = city.tile(),
      tiles = city.tiles().entries(),
      distinct = new Set(tiles.map(at)),
      outside = tiles.filter(
        (tile) => topology.steps(centre.x(), centre.y(), tile.x(), tile.y()) > 2
      );

    checks++;
    citiesSeen.add(`${city.id()}`);
    cityRows[parity(centre)]++;

    if (tiles.length !== 21 || distinct.size !== 21) {
      failure(
        "a city's area is not the 21 tiles of a fat cross",
        `${city.name()} at ${at(centre)} has ${tiles.length} tiles, ${
          distinct.size
        } of them distinct`
      );
    }

    if (outside.length > 0) {
      failure(
        "a city's area reaches more than two steps away",
        `${city.name()} at ${at(centre)}: ${outside.map(at).join(' ')}`
      );
    }
  });

  liveUnits().forEach((unit: Unit): void => {
    unitRows[parity(unit.tile())]++;
  });
};

// Civ1's distance (corruption, trade routes, start spacing) between two tiles, from the grid's logical axes: the longer
//  gap plus half the shorter, rounded down. The gaps are checked against `steps` (the longer) and `distance` (the
//  straight line), so a `logicalDelta` that isn't the grid's would fail here rather than agree with itself.
const civ1DistanceProblem = (from: Tile, to: Tile): string | null => {
  const topology = world!.topology(),
    delta = topology.logicalDelta(from.x(), from.y(), to.x(), to.y());

  if (delta === null) {
    return `no logical axes on the ${topologyId} grid`;
  }

  const a = Math.abs(delta[0]),
    b = Math.abs(delta[1]),
    steps = topology.steps(from.x(), from.y(), to.x(), to.y()),
    straight = topology.distance(from.x(), from.y(), to.x(), to.y()),
    expected = Math.max(a, b) + Math.floor(Math.min(a, b) / 2),
    actual = civ1Distance(from, to);

  if (Math.max(a, b) !== steps || Math.hypot(a, b) !== straight) {
    return `logicalDelta ${JSON.stringify(
      delta
    )} disagrees with steps ${steps} or distance ${straight}`;
  }

  return actual === expected
    ? null
    : `civ1Distance is ${actual}, not ${expected} (logicalDelta ${JSON.stringify(
        delta
      )})`;
};

// Each player's capital, the city with its live Palace, as corruption finds it.
const capitalOf = (player: Player): City | null =>
  cityImprovementRegistryInstance
    .filter(
      (improvement) =>
        improvement instanceof Palace &&
        !improvement.destroyed() &&
        improvement.city().player() === player
    )
    .map((improvement) => improvement.city())[0] ?? null;

const civ1Distances = { pairs: 0, capitals: 0 };

const checkCiv1Distances = (): void => {
  const cities = liveCities();

  cities.forEach((city, index): void => {
    cities.slice(index + 1).forEach((other): void => {
      const problem = civ1DistanceProblem(city.tile(), other.tile());

      checks++;
      civ1Distances.pairs++;

      if (problem !== null) {
        failure(
          "Civ1's distance between two cities is not measured over the grid's logical axes",
          `${city.name()} ${at(city.tile())} to ${other.name()} ${at(
            other.tile()
          )}: ${problem}`
        );
      }
    });

    const capital = capitalOf(city.player());

    if (capital === null || capital === city) {
      return;
    }

    const problem = civ1DistanceProblem(capital.tile(), city.tile());

    checks++;
    civ1Distances.capitals++;

    if (problem !== null) {
      failure(
        "Civ1's distance from a city to its capital is not measured over the grid's logical axes",
        `${capital.name()} ${at(capital.tile())} to ${city.name()} ${at(
          city.tile()
        )}: ${problem}`
      );
    }
  });
};

const summary = (): string[] => {
  const topology = world!.topology(),
    cities = liveCities(),
    nearest = cities.map((city) =>
      Math.min(
        ...cities
          .filter((other) => other !== city)
          .map((other) =>
            topology.steps(
              city.tile().x(),
              city.tile().y(),
              other.tile().x(),
              other.tile().y()
            )
          )
      )
    ),
    living = playerRegistryInstance
      .entries()
      .filter(
        (player: Player) =>
          cityRegistryInstance.getByPlayer(player).length > 0 ||
          unitRegistryInstance.getByPlayer(player).length > 0
      ).length;

  return [
    `cities now ${cities.length}, founded ${
      citiesSeen.size
    }, population ${cities.reduce(
      (total, city) =>
        total + cityGrowthRegistryInstance.getByCity(city).size(),
      0
    )}`,
    `players with cities or units ${living} of ${
      playerRegistryInstance.entries().length
    }, units now ${liveUnits().length}`,
    cities.length < 2
      ? 'nearest other city: fewer than two cities'
      : `nearest other city, in steps: min ${Math.min(...nearest)}, mean ${(
          nearest.reduce((total, steps) => total + steps, 0) / nearest.length
        ).toFixed(2)}`,
    `moves ${moves}, by direction ${JSON.stringify(directions)}`,
    `city-turns on even/odd rows ${cityRows.even}/${cityRows.odd}, unit-turns ${unitRows.even}/${unitRows.odd}`,
    `loop guard hits ${loopGuardHits.count}, console errors ${errorsLogged.length}`,
    `civ1Distance checked between ${civ1Distances.pairs} pairs of cities and from ${civ1Distances.capitals} cities to their capital`,
  ];
};

const finish = (): void => {
  stopped = true;

  checkCiv1Distances();

  const expect = (description: string, ok: boolean, detail: string): void => {
    checks++;

    if (!ok) {
      failures.push(`${description}: ${detail}`);
    }
  };

  expect('some cities were founded', citiesSeen.size > 0, `${citiesSeen.size}`);
  expect(
    "Civ1's distance was checked from some city to its capital",
    civ1Distances.capitals > 0,
    `${civ1Distances.capitals}`
  );
  expect(
    'cities stood on both even and odd rows',
    cityRows.even > 0 && cityRows.odd > 0,
    JSON.stringify(cityRows)
  );
  expect(
    'units stood on both even and odd rows',
    unitRows.even > 0 && unitRows.odd > 0,
    JSON.stringify(unitRows)
  );
  expect(
    'units moved in every direction',
    world!
      .topology()
      .directions()
      .every((direction: string) => (directions[direction] ?? 0) > 0),
    JSON.stringify(directions)
  );
  expect(
    'no unit was skipped because its action threw',
    skipped.length === 0,
    `${skipped.length} on the ${topologyId} grid.${
      topologyId === 'square'
        ? ''
        : ` Run the same game with CONFORMANCE_CONFIG='${JSON.stringify({
            ...supplied,
            topologyId: 'square',
            seed: config.seed,
          })}' to see whether the square grid throws too.`
    } A Barbarian Sail throwing on \`ship.cargo()\` throws on every grid, and is civ-clone/web-renderer#979.\n      ${skipped
      .slice(0, 5)
      .join('\n      ')}`
  );
  expect(
    'nothing reached Math.random',
    mathRandomCalls() === 0,
    `${mathRandomCalls()} calls`
  );

  const seconds = ((Date.now() - started) / 1000).toFixed(1),
    notes = summary()
      .map((line) => `  ${line}\n`)
      .join('');

  if (failures.length > 0) {
    const others = Object.entries(examples)
      .filter(([, count]) => count > 5)
      .map(([kind, count]) => `  (${count} in all) ${kind}\n`)
      .join('');

    process.stderr.write(
      `FAIL staggered-iso game (${label}, ${seconds}s: ${
        failures.length
      } failures in ${checks} checks)\n  ${failures.join(
        '\n  '
      )}\n${others}${notes}`
    );
    process.exit(1);
  }

  process.stdout.write(
    `PASS staggered-iso game (${label}, ${seconds}s: ${checks} checks)\n${notes}`
  );
  process.exit(0);
};

engine.on('turn:start', (turn: number): void => {
  if (stopped) {
    return;
  }

  if (!world) {
    fail('turn started before the world was built');
  }

  checkCities();

  // Every ten turns, and at the end: capitals fall as the game goes on, so the end alone may have none.
  if (turn % 10 === 0 && turn < turns) {
    checkCiv1Distances();
  }

  if (turn >= turns) {
    finish();
  }
});

engine.on('engine:start', (): void => {
  new Array(players).fill(0).forEach((): void => {
    const player = new Player();

    playerRegistryInstance.register(player);
    clientRegistryInstance.register(new SimpleAIClient(player));
  });
});

engine.setOption('topologyId', topologyId);
engine.setOption('players', players);
engine.setOption('height', height);
engine.setOption('width', width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
