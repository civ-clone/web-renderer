// What the portal composites after its layers change (#488). A change of government redraws every known square on
//  every layer, and the portal used to merge every rectangle they marked, the hidden Yields layer's included, before
//  finding there were too many and compositing the whole canvas anyway: 105–222 ms at 1920×1080. It now gives up on
//  merging past a count or an area, and leaves out what a layer that was already hidden redraws, which changes nothing
//  on the canvas. A layer hidden since the last composite still counts, as its pixels have to go.

// Must stay first: it gives the layers a canvas and a `document` to draw with.
import { fakeCanvas } from './lib/fakeCanvas';

import Map from '../../src/js/UI/components/Map';
import Portal from '../../src/js/UI/components/Portal';
import { Rect, mergeRects } from '../../src/js/UI/lib/viewport';
import { Tile } from '../../src/js/UI/types';
import World from '../../src/js/UI/components/World';

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
      'FAIL portalDirtyRegions: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

// A layer the portal makes for itself gets its canvas from `s('<canvas></canvas>')`.
Object.assign((globalThis as any).document, {
  createElement: () => ({
    set innerHTML(_: string) {},
    get firstElementChild() {
      return fakeCanvas(0, 0).canvas;
    },
  }),
});

// A layer that draws nothing, and marks what the test tells it to.
class Layer extends Map {
  protected drawTile(): void {}

  mark({ x, y, width, height }: Rect): void {
    this.markDirty(x, y, width, height);
  }
}

class Landscape extends Layer {}

class Fog extends Layer {}

class Yields extends Layer {}

// `dirtyRegions` is what this is about, and it is protected.
class TestPortal extends Portal {
  regions(): Rect[] {
    return this.dirtyRegions();
  }
}

const width = 1920,
  height = 1080,
  // At scale 2, as the issue measured.
  tileSize = 32,
  size = 80,
  tiles: Tile[] = [];

for (let x = 0; x < size; x++) {
  for (let y = 0; y < size; y++) {
    tiles.push({ x, y, yields: [], units: [], improvements: [] } as any);
  }
}

const { canvas, calls } = fakeCanvas(width, height),
  portal = new TestPortal(
    new World({ width: size, height: size, tiles } as any),
    {} as any,
    canvas,
    { playerId: null, scale: 2, tileSize: 16 },
    Landscape,
    Fog,
    Yields
  ),
  landscape = portal.getLayer(Landscape)!,
  fog = portal.getLayer(Fog)!,
  yields = portal.getLayer(Yields)!,
  whole = [{ x: 0, y: 0, width, height }],
  // Every square in view, as a change of government redraws them.
  everySquare: Rect[] = [];

for (let x = 0; x < width; x += tileSize) {
  for (let y = 0; y < height; y += tileSize) {
    everySquare.push({ x, y, width: tileSize, height: tileSize });
  }
}

const filled = (): Rect[] =>
  calls
    .filter(([name]) => name === 'fillRect')
    .map(([, x, y, width, height]) => ({ x, y, width, height }));

const composite = (): Rect[] => {
  calls.length = 0;

  portal.render();

  return filled();
};

const time = (fn: () => void): number => {
  const start = performance.now();

  fn();

  return performance.now() - start;
};

yields.setVisible(false);
calls.length = 0;
portal.setCenter(40, 40);

expect('the first render composites the whole canvas', filled(), whole);

// A unit moving: a handful of squares, merged as before.

const step = [
  { x: 320, y: 320, width: 32, height: 32 },
  { x: 352, y: 320, width: 32, height: 32 },
];

step.forEach((rect) => {
  landscape.mark(rect);
  fog.mark(rect);
});

expect(
  'a few squares are composited as the regions they merge into',
  portal.regions(),
  mergeRects([...step, ...step])
);
expect(
  'and that is what is composited',
  composite(),
  mergeRects([...step, ...step])
);

// A hidden layer redrawing, as the yields do on a change of government.

yields.mark({ x: 0, y: 0, width: 32, height: 32 });

expect(
  'what a layer already hidden at the last composite redraws composites nothing',
  portal.regions(),
  []
);

composite();

everySquare.forEach((rect) => yields.mark(rect));

expect('nor does it when it redraws every square', portal.regions(), []);

composite();

// Hiding a layer: its pixels have to go.

landscape.setVisible(false);

expect(
  'a layer hidden since the last composite composites what it covered',
  composite(),
  whole
);

landscape.mark(step[0]);

expect(
  'once composited hidden, what it redraws composites nothing',
  portal.regions(),
  []
);

landscape.setVisible(true);

expect('showing it again composites all of it', composite(), whole);

// A change of government: every square, on every layer.

[landscape, fog, yields].forEach((layer) =>
  everySquare.forEach((rect) => layer.mark(rect))
);

// What it used to merge: the hidden Yields layer's as well.
const all = [...everySquare, ...everySquare, ...everySquare];

let regions: Rect[] = [],
  merged: Rect[] = [];

const after = time(() => (regions = portal.regions())),
  before = time(() => (merged = mergeRects(all)));

expect('every square composites the whole canvas', regions, whole);
expect(
  'which is what merging them all came to',
  merged.length > 8 ? whole : merged,
  whole
);
expect(
  `working that out takes under 25 ms (took ${after.toFixed(1)} ms)`,
  after < 25,
  true
);

composite();

// Many small rectangles in one corner: too many to merge, however little they cover.

const corner: Rect[] = [];

for (let index = 0; index < 300; index++) {
  corner.push({
    x: index % 10,
    y: Math.floor(index / 10),
    width: 1,
    height: 1,
  });
}

corner.forEach((rect) => landscape.mark(rect));

expect(
  'past 256 rectangles the whole canvas is composited',
  portal.regions(),
  whole
);

composite();

// A large area in few rectangles.

landscape.mark({ x: 0, y: 0, width: width, height: height / 2 + 2 });

expect(
  'more than half the canvas in one rectangle composites the whole canvas',
  portal.regions(),
  whole
);

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL portalDirtyRegions\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(
  `PASS portalDirtyRegions (${checks} checks; ${
    everySquare.length
  } squares on 3 layers at ${width}×${height}: ${after.toFixed(
    2
  )} ms, against ${before.toFixed(1)} ms merging all ${
    all.length
  } rectangles first, as it used to)`
);
