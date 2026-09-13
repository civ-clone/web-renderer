// The point of Stage 4, as a runnable check.
//
// `static transient` is a list of strings, which is the whole problem with it:
// nothing about a declaration proves the field it names exists, that the name
// reaches `allTransient()`, or that `stateKeys()` acts on it. A typo, a renamed
// field, or a `core-data-object` that predates the mechanism all produce the
// same thing — a declaration that reads correctly and does nothing.
//
// 0.1.14 was exactly that failure at the other end: the mechanism worked, its
// own tests passed, and a required static broke 22 checkouts' typechecks
// without a single runtime symptom. So this checks behaviour on real instances
// rather than trusting the source.

import { Grassland } from '@civ-clone/civ1-world/Terrains';
import {
  generateGenerator,
  generateWorld,
} from '@civ-clone/core-world/tests/lib/buildWorld';
import City from '@civ-clone/core-city/City';
import { DataObject } from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Tile from '@civ-clone/core-world/Tile';
import World from '@civ-clone/core-world/World';
import Year from '@civ-clone/core-game-year/Year';
import Yield from '@civ-clone/core-yield/Yield';

type Check = [string, () => unknown, unknown];

const checks: Check[] = [];

const push = (
  label: string,
  actual: () => unknown,
  expected: unknown
): void => {
  checks.push([label, actual, expected]);
};

// `_id` and `_keys` come from `DataObject` itself. Every subclass must still
// report them, because a subclass's own `static transient` *replaces* the
// parent's rather than extending it — `allTransient()` walks the prototype
// chain precisely so the declarations are additive, and that is the property
// most likely to regress unnoticed.
const inherits = (object: DataObject, label: string): void => {
  push(
    `${label}: inherits DataObject's own`,
    () =>
      ['_id', '_keys'].every((name) => object.allTransient().includes(name)),
    true
  );
};

// A declared name that is not an own property of the instance is a no-op — the
// declaration is fine, the field is spelled differently, and nothing says so.
const declaresOnlyRealFields = (object: DataObject, label: string): void => {
  push(
    `${label}: every transient name is a real field`,
    () =>
      object
        .allTransient()
        .filter((name) => !Object.keys(object).includes(name)),
    []
  );
};

// The consequence: nothing transient may appear in what would be saved.
const excludesTransient = (object: DataObject, label: string): void => {
  const transient = new Set(object.allTransient());

  push(
    `${label}: stateKeys() excludes them`,
    () => object.stateKeys().filter((name) => transient.has(name)),
    []
  );
};

const run = async (): Promise<void> => {
  const ruleRegistry = new RuleRegistry();
  const world: World = await generateWorld(
    generateGenerator(5, 5, Grassland),
    ruleRegistry
  );
  const player = new Player(ruleRegistry);
  const tile = world.get(2, 2) as Tile;
  const city = new City(player, tile, 'Babilim', ruleRegistry);
  const year = new Year(ruleRegistry);
  const value = new Yield(3);

  (
    [
      [city, 'City'],
      [player, 'Player'],
      [tile, 'Tile'],
      [world, 'World'],
      [year, 'Year'],
      [value, 'Yield'],
    ] as [DataObject, string][]
  ).forEach(([object, label]) => {
    inherits(object, label);
    declaresOnlyRealFields(object, label);
    excludesTransient(object, label);
  });

  // Spot checks with the answers written out, so a change of meaning is visible
  // rather than merely self-consistent. These are the plan's worked examples.
  push(
    'Tile: declares the documented set',
    () =>
      ['_neighbours', '_ruleRegistry', '_yieldCache'].every((name) =>
        tile.allTransient().includes(name)
      ),
    true
  );
  push(
    'City: declares the documented set',
    () =>
      ['_ruleRegistry', '_workedTileRegistry'].every((name) =>
        city.allTransient().includes(name)
      ),
    true
  );

  // And the other half, which matters more: real state must survive. A
  // too-eager `transient` is silent data loss, so assert what is still saved.
  push(
    'Tile: keeps its terrain and map',
    () => ['_terrain', '_map'].every((name) => tile.stateKeys().includes(name)),
    true
  );
  push(
    'City: keeps its name, player and tile',
    () =>
      ['_name', '_player', '_tile'].every((name) =>
        city.stateKeys().includes(name)
      ),
    true
  );
  push(
    'World: keeps its tiles and dimensions',
    () =>
      ['_tiles', '_height', '_width'].every((name) =>
        world.stateKeys().includes(name)
      ),
    true
  );
  push(
    'World: does not keep its generator',
    () => world.stateKeys().includes('_generator'),
    false
  );
  push(
    'Year: does not keep its memo',
    () => year.stateKeys().includes('_cache'),
    false
  );
  push(
    'Yield: keeps its values, not its cache',
    () =>
      value.stateKeys().includes('_values') &&
      !value.stateKeys().includes('_valueCache'),
    true
  );

  // `stateKeys()` returning everything would satisfy every "keeps" check above
  // and mean the mechanism is inert, so prove it removes something at all.
  push(
    'stateKeys() is narrower than Object.keys()',
    () => city.stateKeys().length < Object.keys(city).length,
    true
  );

  let failures = 0;

  checks.forEach(([label, actual, expected]) => {
    let result: unknown;

    try {
      result = actual();
    } catch (error) {
      result = `threw: ${error instanceof Error ? error.message : error}`;
    }

    const ok = JSON.stringify(result) === JSON.stringify(expected);

    if (!ok) {
      failures += 1;
    }

    process.stdout.write(
      `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${JSON.stringify(result)}${
        ok ? '' : ` (expected ${JSON.stringify(expected)})`
      }\n`
    );
  });

  process.stdout.write(
    `\n${checks.length - failures}/${
      checks.length
    } — transient declarations take effect\n`
  );

  if (failures > 0) {
    process.exit(1);
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
