// What the client holds of the player's actions on the frontend (#411, #323, #449), checked with plain data: which
//  action lists `diffActions` says to send again and what it says the frontend holds after, what `forget` lets go of,
//  which unit goes with its actions, and that changing that unit hands back the one that had them.

import ActionsState, {
  diffActions,
} from '../../src/js/Engine/Client/ActionsState';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import Unit from '@civ-clone/core-unit/Unit';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) =>
    JSON.stringify(value instanceof Map ? [...value.entries()] : value)
  );

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL clientActionsState: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

// An action is keyed by its class name and what it acts on, so plain classes with a `value()` will do.
class Fortify {
  constructor(private target: string) {}

  value() {
    return this.target;
  }
}

class ChooseResearch {
  value() {
    return null;
  }
}

const action = (Type: new (...args: any[]) => any, ...args: any[]) =>
    new Type(...args) as unknown as PlayerAction,
  keysOf = (list: PlayerAction[] | undefined) =>
    list?.map((item) => `${item.constructor.name} ${item.value()}`);

// diffActions

const fortifyA = action(Fortify, 'a'),
  fortifyB = action(Fortify, 'b'),
  research = action(ChooseResearch),
  all = [fortifyA, fortifyB, research],
  mandatory = [research],
  nothingHeld = diffActions(all, mandatory, {
    heldKeys: undefined,
    heldMandatory: undefined,
  });

expect('nothing held: the actions all go', nothingHeld.actions === all, true);
expect(
  'nothing held: the mandatory actions all go',
  nothingHeld.mandatory === mandatory,
  true
);
expect(
  'nextHeld keeps each action by what it is',
  nothingHeld.nextHeld.held,
  new Map([
    ['Fortify "a"', fortifyA],
    ['Fortify "b"', fortifyB],
    ['ChooseResearch null', research],
  ])
);
expect(
  'nextHeld keeps each action under its own key',
  [...nothingHeld.nextHeld.held!.values()].every(
    (value, index) => value === all[index]
  ),
  true
);
expect('nextHeld keeps the action list', nothingHeld.nextHeld.heldKeys, [
  'Fortify "a"',
  'Fortify "b"',
  'ChooseResearch null',
]);
expect(
  'nextHeld keeps the mandatory list',
  nothingHeld.nextHeld.heldMandatory,
  ['ChooseResearch null']
);

// Made afresh, as `actions()` makes them every time: the same lists by what each is, though not the same objects.
const fresh = [
    action(Fortify, 'a'),
    action(Fortify, 'b'),
    action(ChooseResearch),
  ],
  same = diffActions(fresh, [fresh[2]], nothingHeld.nextHeld);

expect('the same lists: the actions do not go', same.actions, undefined);
expect('the same lists: the mandatory do not go', same.mandatory, undefined);
expect(
  'the same lists: nextHeld is the same keys',
  [same.nextHeld.heldKeys, same.nextHeld.heldMandatory],
  [nothingHeld.nextHeld.heldKeys, nothingHeld.nextHeld.heldMandatory]
);

const added = [...fresh, action(Fortify, 'c')],
  oneAdded = diffActions(added, [fresh[2]], nothingHeld.nextHeld);

expect('one action added: the actions go', keysOf(oneAdded.actions), [
  'Fortify a',
  'Fortify b',
  'ChooseResearch null',
  'Fortify c',
]);
expect(
  'one action added: the mandatory do not go',
  oneAdded.mandatory,
  undefined
);

const removed = [fresh[0], fresh[2]],
  oneRemoved = diffActions(removed, [fresh[2]], nothingHeld.nextHeld);

expect('one action removed: the actions go', keysOf(oneRemoved.actions), [
  'Fortify a',
  'ChooseResearch null',
]);
expect(
  'one action removed: the mandatory do not go',
  oneRemoved.mandatory,
  undefined
);
expect(
  'one action removed: nextHeld no longer holds it',
  [...oneRemoved.nextHeld.held!.keys()],
  ['Fortify "a"', 'ChooseResearch null']
);

const reordered = diffActions(
  [fresh[1], fresh[0], fresh[2]],
  [fresh[2]],
  nothingHeld.nextHeld
);

expect(
  'the same actions in another order: the actions go',
  keysOf(reordered.actions),
  ['Fortify b', 'Fortify a', 'ChooseResearch null']
);

const mandatoryOnly = diffActions(fresh, [], nothingHeld.nextHeld);

expect(
  'only the mandatory list changed: the actions do not go',
  mandatoryOnly.actions,
  undefined
);
expect(
  'only the mandatory list changed: the mandatory go, empty',
  mandatoryOnly.mandatory,
  []
);
expect(
  'only the mandatory list changed: nextHeld has no mandatory',
  mandatoryOnly.nextHeld.heldMandatory,
  []
);

const onlyActionsHeld = diffActions(fresh, [fresh[2]], {
  heldKeys: nothingHeld.nextHeld.heldKeys,
  heldMandatory: undefined,
});

expect(
  'the mandatory list let go of, as the whole player does: the actions do not go',
  onlyActionsHeld.actions,
  undefined
);
expect(
  'the mandatory list let go of: the mandatory go',
  keysOf(onlyActionsHeld.mandatory),
  ['ChooseResearch null']
);

const empty = diffActions([], [], { heldKeys: [], heldMandatory: [] });

expect(
  'empty lists held and empty now: nothing goes',
  [empty.actions, empty.mandatory],
  [undefined, undefined]
);

// ActionsState: hold and forget

const state = new ActionsState();

expect(
  'a new state holds nothing',
  [state.held, state.heldKeys, state.heldMandatory],
  [null, undefined, undefined]
);

state.hold(nothingHeld.nextHeld);

expect(
  'hold keeps what diffActions says is held',
  [
    state.held === nothingHeld.nextHeld.held,
    state.heldKeys,
    state.heldMandatory,
  ],
  [true, nothingHeld.nextHeld.heldKeys, nothingHeld.nextHeld.heldMandatory]
);
expect(
  'held, the same lists do not go',
  diffActions(fresh, [fresh[2]], state).actions,
  undefined
);

state.forget();

expect(
  'forget lets go of the actions and both lists',
  [state.held, state.heldKeys, state.heldMandatory],
  [null, undefined, undefined]
);
expect(
  'forgotten, the same lists go again',
  [
    keysOf(diffActions(fresh, [fresh[2]], state).actions),
    keysOf(diffActions(fresh, [fresh[2]], state).mandatory),
  ],
  [['Fortify a', 'Fortify b', 'ChooseResearch null'], ['ChooseResearch null']]
);

// ActionsState: the unit with actions

const unit = (active: boolean, moves: number) =>
    ({
      active: () => active,
      moves: () => ({ value: () => moves }),
    } as unknown as Unit),
  ready = unit(true, 1),
  other = unit(true, 3),
  done = unit(true, 0),
  sleeping = unit(false, 1),
  units = new ActionsState(),
  previous: Unit[] = [];

expect(
  'no unit with actions: a unit that can act goes without them',
  units.sendsUnitActions(ready),
  false
);

units.setUnitWithActions(ready, (unit) => previous.push(unit));

expect('the first unit with actions hands back none', previous.length, 0);
expect(
  'the unit with actions goes with them while it can act',
  units.sendsUnitActions(ready),
  true
);
expect('another unit goes without them', units.sendsUnitActions(other), false);

units.setUnitWithActions(ready, (unit) => previous.push(unit));

expect('the same unit again hands back none', previous.length, 0);

units.setUnitWithActions(other, (unit) => previous.push(unit));

expect(
  'another unit hands back the one that had them',
  previous.length === 1 && previous[0] === ready,
  true
);
expect('which no longer goes with them', units.sendsUnitActions(ready), false);

units.setUnitWithActions(done, (unit) => previous.push(unit));

expect(
  'a unit with no moves left goes without them',
  units.sendsUnitActions(done),
  false
);

units.setUnitWithActions(sleeping, (unit) => previous.push(unit));

expect(
  'an inactive unit goes without them',
  units.sendsUnitActions(sleeping),
  false
);

units.answering = done;

expect(
  'the unit asked about goes with them whatever its state',
  units.sendsUnitActions(done),
  true
);

units.answering = null;

units.setUnitWithActions(null, (unit) => previous.push(unit));

expect(
  'no unit hands back the one that had them',
  previous.length === 4 && previous[3] === sleeping,
  true
);

units.setUnitWithActions(null, (unit) => previous.push(unit));

expect('no unit again hands back none', previous.length, 4);

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL clientActionsState (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS clientActionsState (${checks} checks)\n`);
