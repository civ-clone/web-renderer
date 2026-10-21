// When the game's data is rebuilt (#344): `GameState`, as `Renderer` drives it,
// with its frame scheduler faked so the test says when a frame comes. Checks
// that during the player's turn each patch flush rebuilds at once; that while
// waiting for the turn the flushes coalesce to one rebuild per frame; that
// handing the turn over (`setWaiting(false)` then `update()`, as `turnStarted`
// does) drops the deferred rebuild and rebuilds once; that each update runs in
// the order the input handlers rely on (rebuild, tiles, then `onUpdated`) and
// tells the world whether its tiles were refilled; that a `PlayerTile` a patch
// carries is queued; that what changed reaches `DataChanges`; and that the map
// is pruned on schedule and the pruned ids forgotten.

import GameState, {
  FrameScheduler,
  GameStateTiles,
} from '../../src/js/UI/game/GameState';
import DataChanges from '../../src/js/UI/lib/DataChanges';
import IncrementalReconstituter from '../../src/js/UI/lib/IncrementalReconstituter';
import { ObjectMap, PlainObject } from '../../src/js/UI/lib/reconstituteData';
import { DataPatch, Tile } from '../../src/js/UI/types';

const failures: string[] = [];
let checks = 0,
  finished = false;

const check = (description: string, passed: boolean): void => {
  checks++;

  if (!passed) {
    failures.push(description);
  }
};

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL game-state: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

const ref = (id: string) => ({ '#ref': id });

const unit = (id: string, moves = 1): PlainObject => ({
  _: 'Unit',
  id,
  moves,
});

const playerTile = (id: string, x: number): PlainObject => ({
  _: 'PlayerTile',
  id,
  x,
  y: 0,
});

// A player with a world of two tiles and two units, on `turn`. `junk` ids
// nothing refers to make the map big enough to prune.
const makeMap = (turn = 1, junk = 0): ObjectMap => {
  const objects: ObjectMap['objects'] = {
    'Player-1': {
      _: 'Player',
      id: 'Player-1',
      actions: [],
      units: [ref('Unit-1'), ref('Unit-2')],
      world: ref('World-1'),
    },
    'World-1': {
      _: 'PlayerWorld',
      id: 'World-1',
      tiles: [ref('Tile-1'), ref('Tile-2')],
    },
    'Tile-1': playerTile('Tile-1', 0),
    'Tile-2': playerTile('Tile-2', 1),
    'Unit-1': unit('Unit-1'),
    'Unit-2': unit('Unit-2'),
    'Turn-1': { _: 'Turn', id: 'Turn-1', value: turn },
  };

  for (let i = 0; i < junk; i++) {
    objects[`Junk-${i}`] = { _: 'Junk', id: `Junk-${i}` };
  }

  return {
    hierarchy: { player: ref('Player-1'), turn: ref('Turn-1') },
    objects,
  };
};

const update = (
  id: string,
  hierarchy: PlainObject,
  objects: PlainObject = {}
): DataPatch => ({
  [id]: { type: 'update', value: { hierarchy, objects } },
});

const moves = (id: string, value: number): DataPatch =>
  update(id, unit(id, value));

// Frames run only when the test says so.
class TestFrames implements FrameScheduler {
  #next = 1;
  #pending = new Map<number, () => void>();
  requested = 0;
  cancelled = 0;

  request(callback: () => void): number {
    const handle = this.#next++;

    this.#pending.set(handle, callback);
    this.requested++;

    return handle;
  }

  cancel(handle: number): void {
    if (this.#pending.delete(handle)) {
      this.cancelled++;
    }
  }

  pending(): number {
    return this.#pending.size;
  }

  run(): void {
    const callbacks = [...this.#pending.values()];

    this.#pending.clear();

    callbacks.forEach((callback) => callback());
  }
}

// What the world and the map are told, in order, with what `onUpdated` sees.
type Setup = {
  changes: DataChanges;
  events: string[];
  frames: TestFrames;
  objectMap: ObjectMap;
  queued: Tile[];
  reconstituter: IncrementalReconstituter;
  state: GameState;
  tilesChanged: boolean[];
  updates: () => number;
};

const setup = (objectMap = makeMap()): Setup => {
  const changes = new DataChanges(),
    events: string[] = [],
    frames = new TestFrames(),
    queued: Tile[] = [],
    reconstituter = new IncrementalReconstituter(),
    tilesChanged: boolean[] = [],
    tiles: GameStateTiles = {
      queueTile: (tile) => queued.push(tile),
      setTiles: (tiles, changed) => {
        events.push(`setTiles:${tiles.length}`);
        tilesChanged.push(changed);
      },
    };

  let updates = 0;

  const state = new GameState(objectMap, {
    changes,
    frames,
    reconstituter,
    tiles,
  });

  state.onUpdated(() => {
    updates++;
    events.push('updated');
  });

  return {
    changes,
    events,
    frames,
    objectMap,
    queued,
    reconstituter,
    state,
    tilesChanged,
    updates: () => updates,
  };
};

const unitMoves = (state: GameState, id: string): number | undefined =>
  (state.data().player.units as PlainObject[]).find((unit) => unit.id === id)
    ?.moves;

// The first rebuild, and the first update.
{
  const { events, state, tilesChanged, updates } = setup();

  check(
    'the data is built on construction',
    state.data().player.id === 'Player-1'
  );
  check(
    'nothing is updated on construction',
    updates() === 0 && events.length === 0
  );

  state.update();

  check('update runs onUpdated once', updates() === 1);
  check(
    'the world is told its tiles, then onUpdated runs',
    events.join(',') === 'setTiles:2,updated'
  );
  check(
    'the tiles are not refilled when nothing changed',
    tilesChanged[0] === false
  );
  check('the turn is read', state.currentTurn() === 1);
  check(
    'the object count is read',
    state.currentObjectCount() === Object.keys(makeMap().objects).length
  );
}

// During the player's turn: each flush rebuilds at once.
{
  const { frames, state, updates } = setup();

  state.update();

  state.applyPatches([moves('Unit-1', 0)]);

  check('a flush rebuilds at once', updates() === 2);
  check('the rebuild has the patch', unitMoves(state, 'Unit-1') === 0);

  state.applyPatches([moves('Unit-2', 0)]);

  check('the next flush rebuilds at once too', updates() === 3);
  check('and has its patch', unitMoves(state, 'Unit-2') === 0);
  check('no frame is asked for', frames.requested === 0);
}

// While waiting: flushes coalesce to one rebuild per frame.
{
  const { frames, state, updates } = setup();

  state.update();

  // `turnEnded`.
  state.setWaiting(true);
  state.update();

  check('waiting', state.waiting());
  check('turnEnded updates at once', updates() === 2);

  state.applyPatches([moves('Unit-1', 0)]);
  state.applyPatches([moves('Unit-2', 0)]);
  state.applyPatches([moves('Unit-1', 2)]);

  check('no rebuild before the frame', updates() === 2);
  check('the data is as it was', unitMoves(state, 'Unit-1') === 1);
  check('one frame for three flushes', frames.requested === 1);

  frames.run();

  check('one rebuild in the frame', updates() === 3);
  check(
    'the rebuild has every flush',
    unitMoves(state, 'Unit-1') === 2 && unitMoves(state, 'Unit-2') === 0
  );

  state.applyPatches([moves('Unit-2', 3)]);

  check('the next flush asks for the next frame', frames.requested === 2);

  frames.run();

  check(
    'and rebuilds in it',
    updates() === 4 && unitMoves(state, 'Unit-2') === 3
  );
}

// `turnStarted` drops the deferred rebuild and rebuilds at once.
{
  const { frames, state, updates } = setup();

  state.update();
  state.setWaiting(true);
  state.update();

  state.applyPatches([moves('Unit-1', 0)]);

  check('a rebuild is deferred', frames.pending() === 1);

  // `turnStarted`.
  state.setWaiting(false);

  check('not waiting', !state.waiting());
  check(
    'the deferred rebuild is dropped',
    frames.pending() === 0 && frames.cancelled === 1
  );

  state.update();

  check('turnStarted rebuilds once', updates() === 3);
  check('with the patches that were waiting', unitMoves(state, 'Unit-1') === 0);

  frames.run();

  check('and not again next frame', updates() === 3);
}

// `dispose` drops a deferred rebuild.
{
  const { frames, state, updates } = setup();

  state.setWaiting(true);
  state.applyPatches([moves('Unit-1', 0)]);
  state.dispose();
  frames.run();

  check(
    'dispose drops the deferred rebuild',
    frames.pending() === 0 && updates() === 0
  );
}

// The world's tiles and the tiles a patch carries.
{
  const { queued, state, tilesChanged } = setup();

  state.update();
  state.applyPatches([moves('Unit-1', 0)]);

  check(
    'a patch that leaves the world alone does not refill its tiles',
    tilesChanged[1] === false
  );

  // As a tile newly seen arrives: the world re-sent, with the tile.
  state.applyPatches([
    update(
      'World-1',
      {
        _: 'PlayerWorld',
        id: 'World-1',
        tiles: [ref('Tile-1'), ref('Tile-2'), ref('Tile-3')],
      },
      { 'Tile-3': playerTile('Tile-3', 2) }
    ),
  ]);

  check('a re-sent world refills its tiles', tilesChanged[2] === true);
  check(
    'the new tile is in the data',
    state.data().player.world.tiles.length === 3
  );
  check(
    "the patch's PlayerTile is queued",
    queued.length === 1 && queued[0].id === 'Tile-3'
  );
}

// What changed reaches `DataChanges`.
{
  const { changes, state } = setup();
  const woken: string[] = [];

  changes.watch(
    () => ['Unit-1'],
    () => woken.push('Unit-1')
  );
  changes.watch(
    () => ['Unit-2'],
    () => woken.push('Unit-2')
  );

  state.update();
  changes.notify(state.data());

  check('nothing wakes for an update with no changes', woken.length === 0);

  state.applyPatches([moves('Unit-1', 0)]);
  changes.notify(state.data());

  check('a changed id wakes its watcher alone', woken.join(',') === 'Unit-1');

  woken.length = 0;

  state.setWaiting(true);
  state.applyPatches([moves('Unit-1', 2)]);
  state.applyPatches([moves('Unit-2', 2)]);
  changes.notify(state.data());

  check('nothing before the deferred rebuild', woken.length === 0);

  state.setWaiting(false);
  state.update();
  changes.notify(state.data());

  check(
    'the coalesced rebuild wakes both',
    woken.join(',') === 'Unit-1,Unit-2'
  );

  woken.length = 0;

  state.replace(makeMap(2));
  changes.notify(state.data());

  check(
    'a replaced map wakes every watcher',
    woken.join(',') === 'Unit-1,Unit-2'
  );
}

// The prune: every 5th turn over 5,000 objects, and the pruned ids forgotten.
{
  const objectMap = makeMap(4, 5000),
    { reconstituter, state } = setup(objectMap),
    size = Object.keys(objectMap.objects).length;

  state.update();

  check('not pruned on turn 4', Object.keys(objectMap.objects).length === size);
  check('Unit-2 is tracked', reconstituter.trackedIds().has('Unit-2'));

  // Turn 5, and the player loses Unit-2.
  state.applyPatches([
    update('Turn-1', { _: 'Turn', id: 'Turn-1', value: 5 }),
    update('Player-1', {
      _: 'Player',
      id: 'Player-1',
      actions: [],
      units: [ref('Unit-1')],
      world: ref('World-1'),
    }),
  ]);

  check('pruned on turn 5', !('Junk-0' in objectMap.objects));
  check('the lost unit is pruned', !('Unit-2' in objectMap.objects));
  check('what is reachable is kept', 'Unit-1' in objectMap.objects);
  check(
    'the pruned unit is forgotten',
    !reconstituter.trackedIds().has('Unit-2')
  );
  check('the turn is counted', state.currentTurn() === 5);
  check(
    'the count is the one the prune was decided on',
    state.currentObjectCount() === size
  );
  check(
    'the data still holds the player',
    (state.data().player.units as PlainObject[]).length === 1
  );
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL game-state (${failures.length} of ${checks} checks)\n  ${failures
      .slice(0, 20)
      .join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS game-state (${checks} checks)\n`);
