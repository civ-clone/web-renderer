// The units the player can move and those deferred with `w` (wait) (#344):
// `UnitQueue`, as `Renderer` calls it. `update` after every rebuild, `wait`
// from the `w` key, `activated` for each unit made active (`setActiveUnit`
// follows every `wait` that returns a unit, so the checks do too).

import { PlayerAction, Unit } from '../../src/js/UI/types';
import UnitQueue from '../../src/js/UI/lib/UnitQueue';

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
      `FAIL unit-queue: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

const unit = (id: string): Unit =>
    ({ _: 'Settlers', id, tile: { x: 0, y: 0 } } as unknown as Unit),
  action = (_: string, value: unknown): PlayerAction =>
    ({
      _,
      id: `${_}-${(value as Unit)?.id}`,
      value,
    } as unknown as PlayerAction),
  activeUnit = (value: Unit): PlayerAction => action('ActiveUnit', value),
  ids = (units: Unit[]): string => units.map((unit) => unit.id).join(),
  A = unit('A'),
  B = unit('B'),
  C = unit('C'),
  D = unit('D'),
  // `wait` then, as `setActiveUnit` does with the unit returned, `activated`.
  pressW = (queue: UnitQueue, current: Unit): Unit | null => {
    const next = queue.wait(current);

    if (next !== null) {
      queue.activated(next.id);
    }

    return next;
  };

// The order of the actions, only the `ActiveUnit` ones, and holes skipped.
{
  const queue = new UnitQueue();

  queue.update(
    [
      activeUnit(C),
      action('EndTurn', null),
      activeUnit(A),
      undefined as unknown as PlayerAction,
      action('CityBuild', unit('city')),
      activeUnit(B),
    ],
    false
  );

  check(
    `selectable in the actions' order (${ids(queue.selectable())})`,
    ids(queue.selectable()) === 'C,A,B'
  );
  check(
    `units in the actions' order (${ids(queue.units())})`,
    ids(queue.units()) === 'C,A,B'
  );
  check(
    'the units are the actions’ own objects',
    queue.units()[0] === C && queue.selectable()[1] === A
  );
}

// Nothing to select or move while waiting for the turn, and waits are dropped.
{
  const queue = new UnitQueue();

  queue.update([activeUnit(A), activeUnit(B)], false);
  pressW(queue, A);
  queue.update([activeUnit(A), activeUnit(B)], true);

  check(
    `nothing selectable while waiting (${ids(queue.selectable())})`,
    queue.selectable().length === 0
  );
  check(
    `no units while waiting (${ids(queue.units())})`,
    queue.units().length === 0
  );
  check('w does nothing while waiting', queue.wait(B) === null);

  queue.update([activeUnit(A), activeUnit(B)], false);

  check(
    `a wait does not outlast the wait for the turn (${ids(
      queue.selectable()
    )})`,
    ids(queue.selectable()) === 'A,B'
  );
}

// w rotates through the active units in order, then wraps to the oldest waited.
{
  const queue = new UnitQueue(),
    actions = [activeUnit(A), activeUnit(B), activeUnit(C)],
    seen: string[] = [];

  queue.update(actions, false);

  let current: Unit = A;

  for (let i = 0; i < 6; i++) {
    const next = pressW(queue, current);

    if (next === null) {
      break;
    }

    seen.push(next.id);
    current = next;
    // `updateState` runs after each unit change.
    queue.update(actions, false);
  }

  check(
    `w from A goes B, C, then wraps to the longest waiting (${seen.join()})`,
    seen.join() === 'B,C,A,B,C,A'
  );
}

// The same rotation with no update in between (keys pressed quickly).
{
  const queue = new UnitQueue(),
    seen: string[] = [];

  queue.update(
    [activeUnit(A), activeUnit(B), activeUnit(C), activeUnit(D)],
    false
  );

  let current: Unit = B;

  for (let i = 0; i < 5; i++) {
    const next = pressW(queue, current) as Unit;

    seen.push(next.id);
    current = next;
  }

  check(
    `w from B skips the waited and wraps in waiting order (${seen.join()})`,
    seen.join() === 'A,C,D,B,A'
  );
}

// A waited unit is out of auto-selection until it is the only kind left.
{
  const queue = new UnitQueue(),
    actions = [activeUnit(A), activeUnit(B), activeUnit(C)];

  queue.update(actions, false);
  pressW(queue, A);
  queue.update(actions, false);

  check(
    `a waited unit is not selectable (${ids(queue.selectable())})`,
    ids(queue.selectable()) === 'B,C'
  );
  check(
    `but is still one of the units (${ids(queue.units())})`,
    ids(queue.units()) === 'A,B,C'
  );

  pressW(queue, B);
  queue.update(actions, false);

  check(
    `two waited (${ids(queue.selectable())})`,
    ids(queue.selectable()) === 'C'
  );

  // C runs out of moves: only waited units are left, so the oldest is up.
  queue.update([activeUnit(A), activeUnit(B)], false);

  check(
    `when only waited units are left the oldest is selectable (${ids(
      queue.selectable()
    )})`,
    ids(queue.selectable()) === 'A'
  );
}

// A waited id is dropped when its unit can no longer act.
{
  const queue = new UnitQueue();

  queue.update([activeUnit(A), activeUnit(B), activeUnit(C)], false);
  pressW(queue, A);
  // A is no longer active (it was disbanded, fortified, or has no moves).
  queue.update([activeUnit(B), activeUnit(C)], false);
  // A comes back (a later update gives it moves again).
  queue.update([activeUnit(A), activeUnit(B), activeUnit(C)], false);

  check(
    `a unit gone from the actions is no longer waited (${ids(
      queue.selectable()
    )})`,
    ids(queue.selectable()) === 'A,B,C'
  );
}

// Activating a waited unit (a click, the stack window) ends its wait.
{
  const queue = new UnitQueue(),
    actions = [activeUnit(A), activeUnit(B), activeUnit(C)];

  queue.update(actions, false);
  pressW(queue, A);
  pressW(queue, B);

  check(
    `A and B waited (${ids(queue.selectable())})`,
    ids(queue.selectable()) === 'C'
  );

  queue.activated(A.id);

  check(
    `activated(A) makes it selectable at once (${ids(queue.selectable())})`,
    ids(queue.selectable()) === 'A,C'
  );

  queue.update(actions, false);

  check(
    `and after the next update (${ids(queue.selectable())})`,
    ids(queue.selectable()) === 'A,C'
  );

  // A unit no longer waited comes before B, which is.
  check('w from C goes to A, ahead of the waited B', queue.wait(C) === A);
}

// A lone unit: w does nothing and waits nothing.
{
  const queue = new UnitQueue();

  queue.update([activeUnit(A)], false);

  check('w with one unit returns nothing', queue.wait(A) === null);
  check(
    `the lone unit is not waited (${ids(queue.selectable())})`,
    ids(queue.selectable()) === 'A'
  );
}

// `wait` leaves the unit it returns waited until it is activated, as the key
// handler's `setActiveUnit` does straight after.
{
  const queue = new UnitQueue();

  queue.update([activeUnit(A), activeUnit(B)], false);
  pressW(queue, A);

  const next = queue.wait(B);

  check(`the wrap returns A (${next?.id})`, next === A);
  check(
    `A and B both waited until A is activated (${ids(queue.selectable())})`,
    queue.selectable().length === 0
  );

  queue.activated(A.id);

  check(
    `then only B waits (${ids(queue.selectable())})`,
    ids(queue.selectable()) === 'A'
  );
}

// The objects come from the latest update: a full rebuild makes them afresh.
{
  const queue = new UnitQueue();

  queue.update([activeUnit(A), activeUnit(B)], false);
  pressW(queue, A);

  const freshA = unit('A'),
    freshB = unit('B');

  queue.update([activeUnit(freshA), activeUnit(freshB)], false);

  check(
    'waits are kept by id across a rebuild',
    ids(queue.selectable()) === 'B' && queue.selectable()[0] === freshB
  );
  check('w returns the fresh object', queue.wait(freshB) === freshA);
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL unit-queue (${failures.length} of ${checks} checks)\n  ${failures
      .slice(0, 20)
      .join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS unit-queue (${checks} checks)\n`);
