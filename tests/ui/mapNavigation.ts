// The maths behind moving around the map (#14): whether a tile is far enough
// inside the view that selecting a unit on it leaves the map where it is, and
// how fast a drag was going when it was let go. And where the view stops when
// it is locked to the poles (#13). And that a press on the map is the map's
// until it is let go, wherever that is, while one that started elsewhere
// isn't a click on it (#490), with the real `GamePortal` under linkedom.

// Must stay first: `GamePortal` reaches windows that read `document.body` as
//  they load.
import { document } from './lib/dom';

import GamePortal from '../../src/js/UI/components/GamePortal';
import World from '../../src/js/UI/components/World';
import {
  clampOrigin,
  isWithinView,
  wrappedDelta,
} from '../../src/js/UI/lib/viewport';
import { releaseVelocity } from '../../src/js/UI/lib/drag';

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

expect('no step to itself', wrappedDelta(5, 5, 80), 0);
expect('a step forward', wrappedDelta(5, 8, 80), 3);
expect('a step back', wrappedDelta(8, 5, 80), -3);
expect('forward across the seam', wrappedDelta(78, 1, 80), 3);
expect('back across the seam', wrappedDelta(1, 78, 80), -3);
expect('half way is forward', wrappedDelta(0, 40, 80), 40);

// 21 tiles across puts 10 either side of the centre, and the old test was
// `|delta| < 10`, which a margin of 0 has to keep.
expect('centre is in view', isWithinView(40, 40, 21, 80), true);
expect('last whole tile is in view', isWithinView(49, 40, 21, 80), true);
expect('edge tile is not', isWithinView(50, 40, 21, 80), false);
expect('left edge wraps', isWithinView(71, 0, 21, 80), true);
expect('past the left edge wraps', isWithinView(70, 0, 21, 80), false);
expect('a margin pulls the edge in', isWithinView(48, 40, 21, 80, 2), false);
expect('inside the margin is fine', isWithinView(47, 40, 21, 80, 2), true);
expect('the whole world is in view', isWithinView(70, 0, 80, 80, 5), true);
expect(
  'a huge margin keeps the centre',
  isWithinView(40, 40, 21, 80, 99),
  true
);
expect('a huge margin keeps only it', isWithinView(41, 40, 21, 80, 99), false);

expect('one sample is still', releaseVelocity([{ x: 0, y: 0, time: 0 }], 0), {
  x: 0,
  y: 0,
});
expect(
  'a steady drag',
  releaseVelocity(
    [
      { x: 0, y: 0, time: 0 },
      { x: 10, y: -5, time: 10 },
      { x: 20, y: -10, time: 20 },
    ],
    20
  ),
  { x: 1, y: -0.5 }
);
expect(
  'a drag that stopped before it was let go',
  releaseVelocity(
    [
      { x: 0, y: 0, time: 0 },
      { x: 50, y: 0, time: 10 },
    ],
    500
  ),
  { x: 0, y: 0 }
);
expect(
  'only the tail counts',
  releaseVelocity(
    [
      { x: 0, y: 0, time: 0 },
      { x: 500, y: 0, time: 100 },
      { x: 510, y: 0, time: 200 },
      { x: 520, y: 0, time: 210 },
    ],
    210
  ),
  { x: 1, y: 0 }
);

// A 60-row world of 32px tiles is 1920px tall; a 963px canvas on it.
expect('a view in the middle is left alone', clampOrigin(500, 963, 1920), 500);
expect('a view past the top stops at it', clampOrigin(-40, 963, 1920), 0);
expect('a view past the bottom stops at it', clampOrigin(1500, 963, 1920), 957);
expect(
  'a world shorter than the view is centred',
  clampOrigin(0, 963, 640),
  -161
);

// A press on the map, and where it is let go.

// linkedom has no canvas context: one that draws nothing.
(globalThis as any).HTMLCanvasElement.prototype.getContext = () =>
  new Proxy({} as { [key: string]: unknown }, {
    get: (target, key: string) => (key in target ? target[key] : () => {}),
    set: (target, key: string, value) => {
      target[key] = value;

      return true;
    },
  });

(document as any).elementFromPoint = () => null;

const tiles: any[] = [];

for (let x = 0; x < 8; x++) {
  for (let y = 0; y < 8; y++) {
    tiles.push({ x, y, yields: [], units: [], improvements: [], city: null });
  }
}

const canvas = document.createElement('canvas') as HTMLCanvasElement,
  captured: number[] = [],
  clicked: string[] = [];

canvas.width = 128;
canvas.height = 128;
canvas.setPointerCapture = (pointerId: number) => captured.push(pointerId);

const portal = new GamePortal(
  new World({ width: 8, height: 8, tiles } as any),
  {} as any,
  canvas,
  { playerId: 'Player-1', scale: 1, tileSize: 16 }
);

portal.on('tile-clicked', (x: number, y: number) => clicked.push(`${x},${y}`));

// linkedom has no `PointerEvent`: an event with what the portal reads.
const pointer = (type: string, x: number, y: number): void => {
  const event = new Event(type, { cancelable: true });

  Object.entries({
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x,
    clientY: y,
    isPrimary: true,
    offsetX: x,
    offsetY: y,
    pageX: x,
    pageY: y,
    pointerId: 7,
    x,
    y,
  }).forEach(([key, value]) => Object.defineProperty(event, key, { value }));

  canvas.dispatchEvent(event);
};

pointer('pointerdown', 40, 40);

expect(
  'a press on the map holds the pointer at once, before it moves far enough to drag',
  captured,
  [7]
);

pointer('pointerup', 40, 40);

expect('let go where it was pressed, it is a click', clicked.length, 1);

pointer('pointerup', 40, 40);

expect(
  'one let go on the map that was pressed somewhere else is not',
  clicked.length,
  1
);

if (failures.length) {
  console.error(`FAIL map navigation\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS map navigation (${checks} checks)`);

// The long-press timer and the portal's own.
process.exit(0);
