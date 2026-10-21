// The checks behind the cheats (#449), with plain data: a `CreateUnit` is acted on only for a unit type the game knows
//  and a square on the map, a `ModifyUnit` sets only the fields a unit may have changed, the unit types the cheat menu
//  lists are the units among what cities can build, and a cheat with no player, or an unknown one, is for us, or for
//  nobody.

import {
  CheatsContext,
  cheatUnitTypes,
  modifiableProperties,
  resolveCheatPlayer,
  validCreateUnit,
} from '../../src/js/Engine/Client/cheats';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const same = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (actual !== expected) {
    failures.push(`${description}: not the same object`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL clientCheats: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

class Warrior extends Unit {}
class Settlers extends Unit {}
class Barracks {}

const world = { width: () => 10, height: () => 8 },
  unitTypes = [Warrior, Settlers];

// validCreateUnit
same(
  'a known unit type on the map is created',
  validCreateUnit({ unitType: 'Settlers', x: 3, y: 4 }, world, unitTypes),
  Settlers
);
same(
  'the first square of the map is on it',
  validCreateUnit({ unitType: 'Warrior', x: 0, y: 0 }, world, unitTypes),
  Warrior
);
same(
  'the last square of the map is on it',
  validCreateUnit({ unitType: 'Warrior', x: 9, y: 7 }, world, unitTypes),
  Warrior
);
expect(
  'an unknown unit type is not created',
  validCreateUnit({ unitType: 'NoSuchUnit', x: 3, y: 4 }, world, unitTypes),
  null
);
expect(
  'a unit type the game does not list is not created',
  validCreateUnit({ unitType: 'Warrior', x: 3, y: 4 }, world, [Settlers]),
  null
);
expect(
  'a square off the map, or not a square, creates nothing',
  [
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 10, y: 0 },
    { x: 0, y: 8 },
    { x: 1.5, y: 0 },
    { x: 0, y: NaN },
    { x: '1', y: 0 },
  ].map(
    ({ x, y }) =>
      validCreateUnit(
        { unitType: 'Warrior', x: x as number, y },
        world,
        unitTypes
      )?.name ?? null
  ),
  [null, null, null, null, null, null, null]
);

// modifiableProperties
expect('no fields sets nothing', modifiableProperties({}), []);
expect(
  'every field a unit may have changed is set, in the same order whatever order it is given in',
  modifiableProperties({
    visibility: 5,
    movement: 4,
    moves: 3,
    defence: 2,
    attack: 1,
  }),
  [
    ['attack', 1],
    ['defence', 2],
    ['moves', 3],
    ['movement', 4],
    ['visibility', 5],
  ]
);
expect(
  'any other field is ignored',
  modifiableProperties({
    attack: 6,
    player: 'someone',
    id: 'other',
    tile: 1,
  } as Parameters<typeof modifiableProperties>[0]),
  [['attack', 6]]
);
expect('a field given as 0 is set', modifiableProperties({ moves: 0 }), [
  ['moves', 0],
]);

// cheatUnitTypes and resolveCheatPlayer
const us = { id: () => 'us' } as unknown as Player,
  them = { id: () => 'them' } as unknown as Player,
  ctx = {
    player: () => us,
    availableCityBuildItems: {
      entries: () => [Warrior, Barracks, Unit, Settlers],
    },
    players: { entries: () => [us, them] },
  } as unknown as CheatsContext;

expect(
  'the unit types are the units cities can build, in the order they are listed',
  cheatUnitTypes(ctx).map((UnitType) => UnitType.name),
  ['Warrior', 'Unit', 'Settlers']
);
same('no player means us', resolveCheatPlayer(ctx), us);
same('an empty player means us', resolveCheatPlayer(ctx, ''), us);
same("a rival's id means them", resolveCheatPlayer(ctx, 'them'), them);
same('our own id means us', resolveCheatPlayer(ctx, 'us'), us);
expect(
  'an unknown id means nobody',
  resolveCheatPlayer(ctx, 'no-such-player'),
  null
);

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL clientCheats (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS clientCheats (${checks} checks)\n`);
