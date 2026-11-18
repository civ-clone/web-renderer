// What a press, the wheel and a pinch do to a map, on their own (docs/3d-renderer-plan.md 0.1b): the 2D map's portal
//  uses them (the `zoom` and `mapNavigation` suites check it does, through its events), and the 3D map's camera will.
//  - a press is a click until it moves 8 px, then a drag that moves the view the other way, and knows how fast it was
//    let go;
//  - a glide carries on, slowing, no faster than 3 px per ms, until it's stopped or slow enough to end;
//  - the wheel makes a tenth a notch, or a tenth each 50 px (8 for a pinch), at most ten a turn in px;
//  - Safari's pinch follows the fingers in steps, turning back at either end.

import {
  DRAG_THRESHOLD,
  Glide,
  Pinch,
  Press,
  WHEEL_PAUSE,
  WheelTurn,
} from '@civ-clone/ui-widgets/lib/mapGestures';

const failures: string[] = [];
let checks = 0;

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

// The frames a glide asks for, run by hand.
const frames = new Map<number, (now: number) => void>();
let nextFrame = 1;

Object.assign(globalThis, {
  window: {
    requestAnimationFrame: (callback: (now: number) => void): number => {
      frames.set(nextFrame, callback);

      return nextFrame++;
    },
    cancelAnimationFrame: (frame: number): void => void frames.delete(frame),
  },
});

const runFrame = (now: number): void => {
  const waiting = [...frames.entries()];

  frames.clear();
  waiting.forEach(([, callback]) => callback(now));
};

// A press.
{
  const at = (
      clientX: number,
      clientY: number,
      timeStamp: number,
      pointerId = 1
    ) => ({
      pointerId,
      clientX,
      clientY,
      timeStamp,
    }),
    press = new Press(at(100, 100, 0));

  expect(
    'a press is not a drag until it moves the threshold',
    [press.move(at(100 + DRAG_THRESHOLD - 1, 100, 10)), press.dragging()],
    [null, false]
  );
  expect(
    'another pointer moves nothing',
    press.move(at(200, 200, 10, 2)),
    null
  );
  expect(
    'moved the threshold, it is a drag, and the view moves the other way from where it was pressed',
    [press.move(at(100 + DRAG_THRESHOLD, 100, 20)), press.dragging()],
    [{ dx: -DRAG_THRESHOLD, dy: 0, started: true }, true]
  );
  expect('then each move from the last', press.move(at(130, 90, 30)), {
    dx: -(130 - 100 - DRAG_THRESHOLD),
    dy: 10,
    started: false,
  });
  expect(
    'let go, it was moving as fast as its last moments',
    press.releaseVelocity(30),
    // From where it was pressed, (100, 100) at 0 ms, to (130, 90) at 30 ms: every moment within 100 ms of letting go.
    { x: (130 - 100) / 30, y: -10 / 30 }
  );
}

// A glide.
{
  const moved: [number, number][] = [],
    glide = new Glide((dx, dy) => void moved.push([dx, dy]));

  glide.start({ x: 1, y: 0 });

  expect('a glide waits for a frame', [moved, glide.gliding()], [[], true]);

  runFrame(1000);
  runFrame(1016);

  expect(
    'each frame moves the view against the glide, slowing',
    moved.map(([dx, dy]) => [Number(dx.toFixed(4)), dy + 0]),
    [
      [-16, 0],
      [-14.72, 0],
    ]
  );

  glide.stop();

  expect(
    'stopped, it asks for no more frames',
    [frames.size, glide.gliding()],
    [0, false]
  );

  moved.length = 0;
  glide.start({ x: 30, y: 40 });
  runFrame(2000);

  expect(
    'a flick faster than 3 px per ms glides at 3',
    moved.map(([dx, dy]) => [Number(dx.toFixed(4)), Number(dy.toFixed(4))]),
    [[-28.8, -38.4]]
  );

  glide.start({ x: 0.01, y: 0 });
  runFrame(3000);

  expect(
    'too slow to move, it ends at its first frame',
    [glide.gliding(), frames.size],
    [false, 0]
  );
}

// The wheel.
{
  const wheel = new WheelTurn(),
    turn = (
      deltaY: number,
      timeStamp: number,
      deltaMode = 0,
      ctrlKey = false
    ) => wheel.turned({ deltaMode, deltaY, ctrlKey, timeStamp }, null);

  expect(
    'the first turn makes a tenth at once, away in and towards out',
    [turn(-3, 0), turn(3, 1000)],
    [1, -1]
  );
  expect(
    'then a tenth for each 50 px turned the same way',
    [turn(3, 1010), turn(40, 1020), turn(10, 1030)],
    [0, 0, -1]
  );
  expect(
    'a pinch, sent as the wheel with Ctrl, a tenth for each 8 px',
    [turn(-1, 5000, 0, true), turn(-5, 5010, 0, true), turn(-3, 5020, 0, true)],
    [1, 0, 1]
  );
  expect(
    'a wheel counted in lines makes a tenth each time it turns',
    [turn(1, 9000, 1), turn(1, 9010, 1), turn(1, 9020, 1)],
    [-1, -1, -1]
  );

  let made = 0;

  for (let at = 20000; at < 21000; at += 10) {
    made += Math.abs(turn(60, at));
  }

  expect('a flick in px makes ten tenths at most', made, 10);
  expect(
    'and after a pause the next turn makes them again',
    turn(60, 21000 + WHEEL_PAUSE + 1),
    -1
  );
  expect(
    'the wheel with Ctrl is a pinch Safari zooms already, while its gesture moves',
    wheel.turned(
      { deltaMode: 0, deltaY: -40, ctrlKey: true, timeStamp: 30000 },
      30000 - WHEEL_PAUSE
    ),
    0
  );
  expect('and nothing for no turn at all', turn(0, 40000), 0);
}

// Safari's pinch, measured in tenths between 1 and 4.
{
  const pinch = new Pinch<string>(),
    clamp = (zoom: number) =>
      Math.min(4, Math.max(1, Math.round(zoom * 10) / 10)),
    change = (scale: number, asked: number, measure = 'art', timeStamp = 0) =>
      pinch.change({ scale, timeStamp }, asked, measure, clamp, 0.1);

  expect('a change to a pinch not begun here is nothing', change(2, 2), 0);

  pinch.start(100, 2, 'art');

  expect('begun, it says when it last moved', pinch.at(), 100);
  expect(
    'spread to one and a half times, it zooms from 2 to 3',
    change(1.5, 2),
    10
  );
  expect(
    'past the end it stops at 4, and turns back as soon as the fingers do',
    [change(3, 3), change(2.9, 4)],
    [10, -1]
  );
  expect(
    'measured in other art since it began, it starts afresh from that zoom',
    [change(1, 1.5, 'other art'), change(2, 1.5, 'other art')],
    [0, 15]
  );

  pinch.end();

  expect('ended, it has no moment', pinch.at(), null);
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL mapGestures: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS mapGestures (${checks} checks)\n`);
