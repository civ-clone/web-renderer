// The flush of the client's patches (#321, #449), checked with a stub transport and plain data: a flush sends what is
//  queued as one patch and empties the queue, sends nothing while held, and a hold is let go of when what it holds for
//  is done, whether that returned or threw.

import ActionsState from '../../src/js/Engine/Client/ActionsState';
import { DataFilter } from '../../src/js/Engine/Client/visibilityFilter';
import type { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import PlayerPatches from '../../src/js/Engine/Client/PlayerPatches';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';

const failures: string[] = [];

// A patch's value, which the queue carries without looking inside.
const patchValue = (value: number) => ({ value } as unknown as ObjectMap);
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
      'FAIL clientPlayerPatches: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

const sent: [string, unknown][] = [],
  transport = {
    send: (channel: string, data: unknown) => sent.push([channel, data]),
  },
  // Nothing here is filtered: each value is plain already.
  dataFilter = (() => (object: any) => object) as unknown as DataFilter,
  patches = new PlayerPatches(
    transport as any,
    dataFilter,
    new ActionsState(),
    () => ({} as Player)
  ),
  patch = (id: string, value: unknown) => ({
    [id]: { type: 'update', index: null, value },
  }),
  // Only its id and how it serialises are read.
  research = {
    id: () => 'research',
    toPlainObject: () => ({ progress: 1 }),
  } as unknown as PlayerResearch,
  tick = () => new Promise((resolve) => setTimeout(resolve, 0));

(async () => {
  // Not held

  patches.flush();

  expect('an empty queue still sends one patch', sent, [['gameDataPatch', []]]);

  sent.splice(0);

  patches.update('a', patchValue(1));
  patches.flush();
  patches.flush();

  expect('a flush sends what is queued, and empties the queue', sent, [
    ['gameDataPatch', [patch('a', { value: 1 })]],
    ['gameDataPatch', []],
  ]);

  sent.splice(0);

  patches.playerObject(research);
  patches.playerObject(research);
  patches.flush();
  patches.playerObject(research);
  patches.flush();

  expect('a part goes once a flush, and again after one', sent, [
    ['gameDataPatch', [patch('research', { progress: 1 })]],
    ['gameDataPatch', [patch('research', { progress: 1 })]],
  ]);

  sent.splice(0);

  // Held

  const returned = await patches.hold(async () => {
    patches.update('b', patchValue(2));
    patches.flush();

    // Across an await, as an action's talks are.
    await tick();

    patches.update('c', patchValue(3));
    patches.flush();

    expect('nothing is sent while held', sent.length, 0);

    return 'handled';
  });

  expect('a hold gives back what it held for', returned, 'handled');
  expect('nothing is sent when the hold is let go of', sent.length, 0);

  patches.flush();

  expect('the next flush sends everything queued while held, as one', sent, [
    ['gameDataPatch', [patch('b', { value: 2 }), patch('c', { value: 3 })]],
  ]);

  sent.splice(0);

  // Held, and what it held for throws

  let thrown: unknown = null;

  try {
    await patches.hold(async () => {
      patches.update('d', patchValue(4));
      patches.flush();

      await tick();

      throw new Error('refused');
    });
  } catch (error) {
    thrown = error;
  }

  expect(
    'a hold passes on what was thrown',
    thrown instanceof Error && thrown.message,
    'refused'
  );
  expect('nothing was sent before the throw', sent.length, 0);

  patches.flush();

  expect('a throw lets go of the hold', sent, [
    ['gameDataPatch', [patch('d', { value: 4 })]],
  ]);

  sent.splice(0);

  // A patch whose value throws as it is built is left out, and the rest go, then and after (#470).
  const logged = console.error;

  console.error = () => {};

  patches.update('e', patchValue(5));
  patches.update('broken', () => {
    throw new Error('half destroyed');
  });
  patches.update('f', patchValue(6));
  patches.flush();
  patches.update('g', patchValue(7));
  patches.flush();

  console.error = logged;

  expect('a value that throws is left out, and the rest go', sent, [
    ['gameDataPatch', [patch('e', { value: 5 }), patch('f', { value: 6 })]],
    ['gameDataPatch', [patch('g', { value: 7 })]],
  ]);

  sent.splice(0);

  // A patch that can't be sent is let go of all the same, so the next goes.
  const send = transport.send;

  transport.send = () => {
    throw new Error('could not be cloned');
  };
  patches.update('h', patchValue(8));

  try {
    patches.flush();
  } catch (error) {
    // Passed on, as the caller's to report.
  }

  transport.send = send;
  patches.update('i', patchValue(9));
  patches.flush();

  expect('a patch that could not be sent is not sent again', sent, [
    ['gameDataPatch', [patch('i', { value: 9 })]],
  ]);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL clientPlayerPatches (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS clientPlayerPatches (${checks} checks)\n`);
})();
