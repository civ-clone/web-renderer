// How the client refers to the game's objects in what it sends the UI (#449), checked with plain data: a `DataObject`
//  becomes a `{'#ref': id}` where a filter says so and stays itself where it doesn't, a player or a tile in a
//  standalone payload says who and where and no more (#130), and a player's action has a key that stays the same
//  though the action is made afresh (#411).

import {
  actionKey,
  filterToReference,
  filterToReferenceAllExcept,
  referenceObject,
  standalone,
} from '../../src/js/Engine/Client/refs';
import AdditionalDataRegistry from '@civ-clone/core-data-object/AdditionalDataRegistry';
import Civilization from '@civ-clone/core-civilization/Civilization';
import DataObject from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Tile from '@civ-clone/core-world/Tile';

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
    process.stderr.write('FAIL clientRefs: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

class Thing extends DataObject {}
class OtherThing extends DataObject {}
class Act extends PlayerAction {}
class OtherAct extends PlayerAction {}

const civilization = new Civilization(),
  player = new Player(new RuleRegistry()),
  thing = new Thing(),
  otherThing = new OtherThing(),
  // Only where it is: a tile on its own needs a world, terrain and yields.
  tile = { x: () => 3, y: () => 4 } as unknown as Tile,
  playerTile = new PlayerTile(tile, player, new AdditionalDataRegistry()),
  plain = { a: 1 };

player.setCivilization(civilization);

// referenceObject
expect('a DataObject becomes a ref to its id', referenceObject(thing), {
  '#ref': thing.id(),
});
same('anything else is left as it is', referenceObject(plain), plain);
expect(
  'a primitive is left as it is',
  [referenceObject(1), referenceObject('a'), referenceObject(null)],
  [1, 'a', null]
);

// filterToReference
const onlyThings = filterToReference(Thing);

expect('a type named becomes a ref', onlyThings(thing), {
  '#ref': thing.id(),
});
same('a type not named is left as it is', onlyThings(otherThing), otherThing);
same('a plain object is left as it is', onlyThings(plain), plain);
expect(
  'a subclass of a type named becomes a ref',
  filterToReference(DataObject)(otherThing),
  { '#ref': otherThing.id() }
);
expect(
  'each of several types named becomes a ref',
  [thing, otherThing].map(filterToReference(Thing, OtherThing)),
  [{ '#ref': thing.id() }, { '#ref': otherThing.id() }]
);
same(
  'with no types named, nothing becomes a ref',
  filterToReference()(thing),
  thing
);

// filterToReferenceAllExcept
const allButThings = filterToReferenceAllExcept(Thing);

same('a type named is left as it is', allButThings(thing), thing);
expect('a type not named becomes a ref', allButThings(otherThing), {
  '#ref': otherThing.id(),
});
same(
  'a plain object is left as it is, not being a DataObject',
  allButThings(plain),
  plain
);
expect(
  'with no types named, every DataObject becomes a ref',
  [thing, otherThing, plain].map(filterToReferenceAllExcept()),
  [{ '#ref': thing.id() }, { '#ref': otherThing.id() }, plain]
);

// standalone
const standalonePlayer = standalone(player);

expect('a player says who it is, and no more', Object.keys(standalonePlayer), [
  '_',
  'id',
  'civilization',
]);
expect('a standalone player is a Player with its id', standalonePlayer, {
  _: 'Player',
  id: player.id(),
  civilization: standalonePlayer.civilization,
});
same(
  "a standalone player carries the player's civilization",
  standalonePlayer.civilization,
  civilization
);
expect('a tile says where it is, and no more', standalone(playerTile), {
  _: 'PlayerTile',
  id: playerTile.id(),
  x: 3,
  y: 4,
});
same('anything else is left as it is', standalone(thing), thing);
same('a plain object is left as it is', standalone(plain), plain);

// actionKey
expect(
  'an action on a DataObject is keyed by its kind and the id of what it acts on',
  actionKey(new Act(player, thing)),
  `Act ${thing.id()}`
);
expect(
  'the same action made afresh has the same key',
  actionKey(new Act(player, thing)),
  actionKey(new Act(player, thing))
);
checks++;

if (
  actionKey(new Act(player, thing)) === actionKey(new OtherAct(player, thing))
) {
  failures.push('two kinds of action on the same thing share a key');
}

checks++;

if (
  actionKey(new Act(player, thing)) === actionKey(new Act(player, otherThing))
) {
  failures.push('one kind of action on two things shares a key');
}

expect(
  'an action on a plain value is keyed by its JSON',
  [
    actionKey(new Act(player, 3)),
    actionKey(new Act(player, 'a')),
    actionKey(new Act(player, { b: [1] })),
  ],
  ['Act 3', 'Act "a"', 'Act {"b":[1]}']
);
expect(
  'an action on nothing is keyed by null',
  [actionKey(new Act(player, undefined)), actionKey(new Act(player, null))],
  ['Act null', 'Act null']
);

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL clientRefs (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS clientRefs (${checks} checks)\n`);
