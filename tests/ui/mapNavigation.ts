// The maths behind moving around the map (#14): whether a tile is far enough
// inside the view that selecting a unit on it leaves the map where it is, and
// how fast a drag was going when it was let go. And where the view stops when
// it is locked to the poles (#13).

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

if (failures.length) {
  console.error(`FAIL map navigation\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS map navigation (${checks} checks)`);
