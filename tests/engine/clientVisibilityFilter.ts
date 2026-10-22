// The parts of the client's visibility filter that need no game (#449), checked with stand-in objects: a tile goes as
//  a ref unless asked for in full or the caller's filter sends something else, a `Busy` rule goes by name, a player's
//  action serialised anywhere but where the actions are sent forgets the ones held, and the player's own build goes
//  without `available`, read against the client's player as it is now rather than when the filter was made.

import Busy from '@civ-clone/core-unit/Rules/Busy';
import type { DataObject } from '@civ-clone/core-data-object/DataObject';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import ActionsState from '../../src/js/Engine/Client/ActionsState';
import {
  filterPlayerTile,
  makeDataFilter,
} from '../../src/js/Engine/Client/visibilityFilter';

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
    process.stderr.write(
      'FAIL clientVisibilityFilter: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

// Each branch below checks the class alone, so an object made from the prototype will do.
const make = <T>(Type: { prototype: T }, fields: Record<string, any> = {}): T =>
  Object.create(
    Type.prototype as any,
    Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, { value }])
    )
  );

// DataObject's `_keys: (keyof this)[]` keeps a subclass with methods of its own from being passed as a DataObject.
const asData = (object: unknown): DataObject => object as DataObject;

const identity = (object: any) => object,
  playerTile = make(PlayerTile, { id: () => 'PlayerTile-1' }),
  standIn = { _: 'PlayerTile', id: 'PlayerTile-1', x: 1, y: 2 };

expect(
  'a tile the caller leaves alone goes as a ref',
  filterPlayerTile(playerTile, identity, false),
  { '#ref': 'PlayerTile-1' }
);
expect(
  'a tile the caller leaves alone goes in full when tiles are',
  filterPlayerTile(playerTile, identity, true) === playerTile,
  true
);
expect(
  "the caller's stand-in for a tile stands",
  filterPlayerTile(playerTile, () => standIn, false),
  standIn
);

const me = make(Player),
  them = make(Player);
let current = me;

const actions = new ActionsState(),
  dataFilter = makeDataFilter(() => current, actions),
  calledWith: any[] = [],
  recording = (object: any) => {
    calledWith.push(object);

    return object;
  };

expect(
  'a tile through the filter goes as a ref',
  dataFilter()(asData(playerTile)),
  {
    '#ref': 'PlayerTile-1',
  }
);
expect(
  'a tile through the filter with tiles in full goes in full',
  dataFilter(undefined, { tilesInFull: true })(asData(playerTile)) ===
    playerTile,
  true
);

class Fortified extends Busy {}

expect(
  "a Busy rule goes by its class name, without the caller's filter",
  dataFilter(recording)(make(Fortified)),
  { _: 'Fortified' }
);
expect("the caller's filter is not asked about a Busy rule", calledWith, []);

const action = make(PlayerAction),
  held = () => ({
    held: new Map<string, PlayerAction>([['Fortify 1', action]]),
    heldKeys: ['Fortify 1'],
    heldMandatory: [],
  });

actions.hold(held());
actions.serialising = true;

expect(
  'an action while the actions are serialised goes as it is',
  dataFilter()(asData(action)) === action,
  true
);
expect(
  'an action while the actions are serialised leaves those held',
  [actions.held?.size, actions.heldKeys, actions.heldMandatory],
  [1, ['Fortify 1'], []]
);

actions.serialising = false;

expect(
  'an action serialised any other way goes as it is',
  dataFilter()(asData(action)) === action,
  true
);
expect(
  'an action serialised any other way forgets those held',
  [actions.held, actions.heldKeys, actions.heldMandatory],
  [null, undefined, undefined]
);

const build = make(CityBuildItem, {
    city: () => ({ player: () => me }),
    keys: () => ['available', 'building', 'progress'],
  }),
  sent = dataFilter(identity)(asData(build));

expect(
  "the player's own build goes as a stand-in, not the build",
  sent !== build && sent instanceof CityBuildItem,
  true
);
expect("the player's own build goes without available", sent.keys(), [
  'building',
  'progress',
]);
expect(
  'the stand-in is the same one each time',
  dataFilter(identity)(asData(build)) === sent,
  true
);
expect(
  'the stand-in is not wrapped again when it is walked',
  dataFilter(identity)(sent) === sent,
  true
);

current = them;

expect(
  'once the player is another, the build is no longer its own, and goes as it is',
  dataFilter(identity)(asData(build)) === build,
  true
);

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL clientVisibilityFilter (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS clientVisibilityFilter (${checks} checks)\n`);
