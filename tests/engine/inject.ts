// `Game.inject`, as a runnable check — the other half of hydration.
//
// `hydration.ts` proves an entity can be rebuilt without running its
// constructor. That is necessary and not sufficient: `stateKeys()` omits every
// transient field, so a rebuilt entity arrives with those fields *absent*, and
// three of the four categories then misbehave. One of them silently — a `Yield`
// whose `_valueCache` is `undefined` fails the `=== null` guard that would have
// recomputed it, so `value()` returns `undefined` and every yield in a loaded
// game reads empty with no error.
//
// Each check below rebuilds a real entity from a real game exactly as the
// hydrator's passes 1 and 2 do, injects, and then calls the accessor that broke.

import Civilization from '@civ-clone/core-civilization/Civilization';
import { Grassland } from '@civ-clone/civ1-world/Terrains';
import {
  generateGenerator,
  generateWorld,
} from '@civ-clone/core-world/tests/lib/buildWorld';
import City from '@civ-clone/core-city/City';
import { DataObject } from '@civ-clone/core-data-object/DataObject';
import { Game } from '@civ-clone/core-game/Game';
import Player from '@civ-clone/core-player/Player';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import Tile from '@civ-clone/core-world/Tile';
import World from '@civ-clone/core-world/World';
import Year from '@civ-clone/core-game-year/Year';
import Yield from '@civ-clone/core-yield/Yield';

const checks: [string, () => unknown, unknown][] = [];

const push = (
  label: string,
  actual: () => unknown,
  expected: unknown
): void => {
  checks.push([label, actual, expected]);
};

/**
 * Rebuild exactly as `hydrate`'s passes 1 and 2 do: allocate with no
 * constructor, fill from `stateKeys()`, and carry `_id`/`_keys` beside the
 * state rather than inside it — which is what `SerialisedEntity` does, because
 * they are bookkeeping and no `Game` can supply them.
 */
const rebuild = <T extends DataObject>(source: T): T => {
  const state: Record<string, unknown> = {};
  const record = source as unknown as Record<string, unknown>;

  source.stateKeys().forEach((key) => (state[key] = record[key]));

  return Object.assign(Object.create(Object.getPrototypeOf(source)), state, {
    _id: source.id(),
    _keys: source.keys(),
  });
};

const run = async (): Promise<void> => {
  const game = new Game();
  const world: World = await generateWorld(
    generateGenerator(5, 5, Grassland),
    game.rules
  );
  const player = new Player(game.rules);

  // `City.toPlainObject()` walks to the player and asks for its civilisation,
  // which throws when unset — so the fixture needs one. `Civilization` is
  // itself one of the 29 classes with a `transient` declaration, and its
  // `_attributes` is the only field `inject` has to *derive* rather than look
  // up, so this exercises that path too.
  const civilization = new Civilization(game.attributes, game.cityNames);

  player.setCivilization(civilization);
  const tile = world.get(2, 2) as Tile;
  const city = new City(player, tile, 'Babilim', game.rules, game.workedTiles);
  const year = new Year(game.turn, game.rules);
  const value = new Yield(3);
  const playerTile = new PlayerTile(tile, player, game.additionalData);

  const injected = <T extends DataObject>(source: T): T => {
    const entity = rebuild(source);

    game.inject(entity);

    return entity;
  };

  // The three measured failures, each with the answer written out so a change
  // of behaviour is visible rather than merely self-consistent.
  const rebuiltYield = injected(value);

  push(
    'Yield.value() — silently undefined before',
    () => rebuiltYield.value(),
    3
  );

  const rebuiltTile = injected(tile);

  push(
    'Tile.getNeighbours() — threw before',
    () => rebuiltTile.getNeighbours().length > 0,
    true
  );

  const rebuiltCity = injected(city);

  push(
    'City.keys() — undefined before',
    () => rebuiltCity.keys().length > 0,
    true
  );
  push(
    'City.toPlainObject() — threw before',
    () => Object.keys(rebuiltCity.toPlainObject().hierarchy).length > 0,
    true
  );
  push('City.name() still correct', () => rebuiltCity.name(), 'Babilim');
  push(
    'City.player().id() still correct',
    () => rebuiltCity.player().id(),
    player.id()
  );

  // The collaborator case, which was already working — asserted so a
  // regression in the table is caught rather than assumed away.
  push(
    'City got the game`s rule registry, not a stale one',
    () =>
      (rebuiltCity as unknown as Record<string, unknown>)._ruleRegistry ===
      game.rules,
    true
  );

  const rebuiltYear = injected(year);

  // `Year.value()` needs a `YearRule`, and a bare `Game` has none — so the
  // original throws too. The contract is therefore *parity*: a hydrated entity
  // must behave the same as the one it was rebuilt from, which is the honest
  // assertion here and does not depend on the fixture registering rules.
  const behaviour = (fn: () => unknown): string => {
    try {
      return `ok:${typeof fn()}`;
    } catch (error) {
      return `threw:${(error as Error).message}`;
    }
  };

  push(
    'Year.value() matches the original — `_cache` was undefined before',
    () => behaviour(() => rebuiltYear.value(1)),
    behaviour(() => year.value(1))
  );
  push(
    'Year got a real Map, not undefined',
    () =>
      (rebuiltYear as unknown as Record<string, unknown>)._cache instanceof Map,
    true
  );

  // `World._generator` is rebuilt from the world's own saved dimensions,
  // because every geometry method is a pure function of height and width and a
  // loaded world never calls `generate()`.
  const rebuiltWorld = injected(world);

  push(
    'World.get() — needs a generator it never saved',
    () => (rebuiltWorld.get(2, 2) as Tile).id(),
    tile.id()
  );
  push(
    'World kept its dimensions',
    () => [rebuiltWorld.width(), rebuiltWorld.height()],
    [world.width(), world.height()]
  );

  // `Civilization._attributes` is a filtered view of the game's attribute
  // registry — the one transient field `inject` derives rather than looks up.
  const rebuiltCivilization = injected(civilization);

  push(
    'Civilization.attributes() — a derived registry, not a collaborator',
    () => Array.isArray(rebuiltCivilization.attributes()),
    true
  );

  // The one class that builds per-instance structure in its constructor.
  const rebuiltPlayerTile = injected(playerTile);

  push(
    'PlayerTile.toPlainObject() — accessors reinstalled by onHydrated',
    () => Object.keys(rebuiltPlayerTile.toPlainObject().hierarchy).length > 0,
    true
  );
  push(
    'PlayerTile.x() still correct',
    () => rebuiltPlayerTile.x(),
    playerTile.x()
  );

  // And the guard that keeps the tables honest as classes change. A transient
  // field with no source must fail the load, not read `undefined`.
  push(
    'inject refuses to leave a transient field undefined',
    () => {
      class Unknown extends DataObject {
        static readonly transient = ['_id', '_keys', '_somethingNew'];
        private _somethingNew: object | null = null;
        private _saved: number = 1;
      }

      const entity = Object.create(Unknown.prototype);

      try {
        game.inject(entity);

        return 'did not throw';
      } catch (error) {
        return (error as Error).message.includes('_somethingNew')
          ? 'threw, naming the field'
          : `threw, but unhelpfully: ${(error as Error).message}`;
      }
    },
    'threw, naming the field'
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
      `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(58)} ${JSON.stringify(result)}${
        ok ? '' : ` (expected ${JSON.stringify(expected)})`
      }\n`
    );
  });

  process.stdout.write(
    `\n${checks.length - failures}/${
      checks.length
    } — a hydrated entity works after inject\n`
  );

  if (failures > 0) {
    process.exit(1);
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
