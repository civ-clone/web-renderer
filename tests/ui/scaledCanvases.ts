// Unit action icons drawn again when what they're shown at changes (#358): the browser zoomed or the window moved to
//  another screen, or the button resized, and only those whose drawing no longer fits. And the Corruption column's icon
//  (#792), the Trade picture with the white of its top arrow turned black.

// Must stay first: the components read `document` as they load.
import './lib/dom';
import './lib/interfaces';

import { darkenTopArrow } from '../../src/js/UI/components/lib/corruptionIcon';
import ScaledCanvases from '../../src/js/UI/lib/scaledCanvases';

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

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL scaled-canvases: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

// What the page says of its pixel ratio, and the one media query it's watched through.
let changed: (() => void) | null = null;
const queries: string[] = [],
  resized: (() => void)[] = [];

(globalThis as any).devicePixelRatio = 1;
(globalThis as any).matchMedia = (query: string) => {
  queries.push(query);

  return {
    addEventListener: (_: string, listener: () => void) => {
      changed = listener;
    },
  };
};
(globalThis as any).ResizeObserver = class {
  constructor(callback: () => void) {
    resized.push(callback);
  }

  observe(): void {}

  disconnect(): void {}
};

const canvas = (shownAt: number) => {
    const element = document.createElement('canvas');

    Object.defineProperty(element, 'clientWidth', {
      configurable: true,
      get: () => shownAt,
    });

    return element;
  },
  // As `drawUnitActionIcon` does: a drawing the size it's shown at.
  drawing = (draws: string[], name: string) => (element: HTMLCanvasElement) => {
    draws.push(name);
    element.width = element.clientWidth * (globalThis.devicePixelRatio || 1);
  };

{
  const canvases = new ScaledCanvases(),
    draws: string[] = [],
    one = canvas(32),
    two = canvas(16);

  canvases.add(one, drawing(draws, 'one'));
  canvases.add(two, drawing(draws, 'two'));

  expect('drawn as they’re added', draws, ['one', 'two']);
  expect('watching the ratio as it is', queries, ['(resolution: 1dppx)']);

  draws.length = 0;
  resized[0]();
  expect('nothing changed: nothing drawn', draws, []);

  (globalThis as any).devicePixelRatio = 2;
  changed!();
  expect(
    'zoomed: both drawn again',
    [draws, one.width, two.width],
    [['one', 'two'], 64, 32]
  );
  expect('and the new ratio watched', queries, [
    '(resolution: 1dppx)',
    '(resolution: 2dppx)',
  ]);

  draws.length = 0;
  Object.defineProperty(one, 'clientWidth', { get: () => 48 });
  resized[0]();
  expect(
    'a button resized: that one drawn again',
    [draws, one.width],
    [['one'], 96]
  );

  draws.length = 0;
  canvases.clear();
  (globalThis as any).devicePixelRatio = 3;
  changed!();
  expect('cleared: none left to draw', draws, []);
}

{
  const pixel = (r: number, g: number, b: number, a: number = 255) => [
      r,
      g,
      b,
      a,
    ],
    white = pixel(255, 255, 255),
    gold = pixel(220, 180, 40),
    clear = pixel(255, 255, 255, 0),
    black = pixel(0, 0, 0),
    grid = (...rows: number[][][]) => rows.flat(2),
    pixels = new Uint8ClampedArray(
      grid(
        [white, gold, clear],
        [clear, white, gold],
        [clear, white, clear],
        [clear, white, clear],
        [clear, clear, clear],
        [white, clear, gold]
      )
    );

  darkenTopArrow(pixels, 3, 6);

  expect(
    'the top arrow\u2019s white turned black, its tail too; the other colours, what\u2019s see-through and any white apart from it left',
    Array.from(pixels),
    grid(
      [black, gold, clear],
      [clear, black, gold],
      [clear, black, clear],
      [clear, black, clear],
      [clear, clear, clear],
      [white, clear, gold]
    )
  );
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL scaled-canvases: ${
      failures.length
    } of ${checks} checks\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS scaled-canvases: ${checks} checks\n`);
process.exit(0);
