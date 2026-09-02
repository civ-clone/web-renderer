// The point of Stage 1, as a runnable check.
//
// With `#private` fields, a private slot could only be installed by running the
// constructor, so no generic rehydration was possible — the save layer would
// have needed a hand-written hydrator per class. With `private _x` the fields
// are ordinary properties, so one generic hydrator works for every class.
//
// Constructors here have side effects (`ruleRegistry.process(Created, this)`),
// which is exactly why hydration must not call them. `Object.create` skips them.

import City from '@civ-clone/core-city/City';
import Player from '@civ-clone/core-player/Player';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import Yield from '@civ-clone/core-yield/Yield';

const checks: [string, () => unknown, unknown][] = [];

const hydrate = <T>(Class: { prototype: T }, state: object): T =>
  Object.assign(Object.create(Class.prototype), state);

const player = hydrate(Player, { _id: 'Player-1', _keys: ['id'] });

checks.push(['Player.id()', () => player.id(), 'Player-1']);

const city = hydrate(City, {
  _id: 'City-1',
  _keys: ['id'],
  _name: 'Babilim',
  _player: player,
});

checks.push(['City.name()', () => city.name(), 'Babilim']);
checks.push(['City.player().id()', () => city.player().id(), 'Player-1']);

const tile = hydrate(Tile, { _id: 'Tile-1', _keys: ['id'], _x: 4, _y: 7 });

checks.push(['Tile.x()', () => tile.x(), 4]);
checks.push(['Tile.y()', () => tile.y(), 7]);

const unit = hydrate(Unit, {
  _id: 'Unit-1',
  _keys: ['id'],
  _player: player,
  _tile: tile,
  _active: true,
  _destroyed: false,
});

checks.push(['Unit.tile().x()', () => unit.tile().x(), 4]);
checks.push(['Unit.active()', () => unit.active(), true]);

const value = hydrate(Yield, {
  _id: 'Yield-1',
  _keys: ['id'],
  _values: [[3, 'initial']],
  _valueCache: null,
});

checks.push(['Yield.value()', () => value.value(), 3]);

// A round trip through JSON, which is what a save file actually is.
const roundTripped = hydrate(
  City,
  JSON.parse(JSON.stringify({ _id: 'City-2', _keys: ['id'], _name: 'Nineveh' }))
);

checks.push(['City.name() after JSON round trip', () => roundTripped.name(), 'Nineveh']);

let failed = 0;

checks.forEach(([label, run, expected]) => {
  let actual;

  try {
    actual = run();
  } catch (error) {
    actual = `threw ${error instanceof Error ? error.message : String(error)}`;
  }

  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  if (!ok) {
    failed += 1;
  }

  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`
  );
});

console.log(
  `\n${checks.length - failed}/${checks.length} hydrated without running a constructor`
);

process.exit(failed === 0 ? 0 : 1);
