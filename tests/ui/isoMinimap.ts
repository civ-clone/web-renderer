// The isometric grid's overview and minimap (#97, #867). The overview draws the whole world a flat brick a tile, in the
//  map's staggered rows, so it has the map's shape: one world across, the odd rows' last brick wrapping back on the
//  left. The minimap shows it with the active unit's brick marked and the map's viewport boxed, the box being the map's
//  world pixels scaled into the overview's, across the seam where it runs over; and a click centres the map on the
//  brick under it.

// Must stay first: it gives the layer a canvas and a `document` to draw with.
import { fakeCanvas } from './lib/fakeCanvas';
import './lib/artPacks';

import IsoMinimap from '@civ-clone/ui-map-isometric/Minimap';
import IsoProjection from '@civ-clone/ui-map-isometric/IsoProjection';
import Overview, { overviewCell } from '@civ-clone/ui-map-isometric/Overview';
import OverviewProjection from '@civ-clone/ui-map-isometric/OverviewProjection';
import { Tile } from '@civ-clone/ui-protocol/types';
import Portal from '@civ-clone/ui-map/components/Portal';
import { Projection } from '@civ-clone/ui-map/lib/projection';
import World from '@civ-clone/ui-map/components/World';

const failures: string[] = [];
let checks = 0,
  finished = false;

process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL isoMinimap: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

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

const dimensions = (width: number, height: number) => ({
  width: () => width,
  height: () => height,
});

// The overview's brick: the widest multiple of 4 px that fits 190 px, a quarter as tall, so a 2:1 diamond's row step
//  and the odd rows' shift are whole pixels.
expect(
  "a brick is a diamond's width and row step, as wide as fits the minimap",
  [5, 20, 40, 47, 48, 200].map(overviewCell),
  [
    { width: 36, height: 9 },
    { width: 8, height: 2 },
    { width: 4, height: 1 },
    { width: 4, height: 1 },
    { width: 4, height: 1 },
    { width: 4, height: 1 },
  ]
);

// Bricks fill the plane, one a tile: every pixel is the brick it is in, and the pixels around a brick are its
//  neighbours'.
[
  [5, 4],
  [40, 100],
  [7, 9],
].forEach(([width, height]) => {
  const cell = overviewCell(width!),
    projection = new OverviewProjection(cell, dimensions(width!, height!)),
    misses: string[] = [];

  for (let y = -2; y < Math.min(height!, 12) + 2; y++) {
    for (let x = -1; x <= Math.min(width!, 12); x++) {
      const [left, top] = projection.tileToPixel(x, y);

      for (let dy = 0; dy < cell.height; dy++) {
        for (let dx = 0; dx < cell.width; dx++) {
          const found = projection.pixelToTile(left + dx, top + dy).join(',');

          if (found !== `${x},${y}`) {
            misses.push(`${x},${y} +${dx},${dy} -> ${found}`);
          }
        }
      }

      if (left !== x * cell.width + (y & 1) * (cell.width / 2)) {
        misses.push(`${x},${y} at ${left}`);
      }
    }
  }

  expect(
    `${width}x${height}: every pixel of a brick is its tile, rows above the world and odd rows included`,
    misses.slice(0, 5),
    []
  );
  expect(
    `${width}x${height}: bricks don't overlap, and reach no further than themselves`,
    [projection.overlapsNeighbours(), projection.reach()],
    [false, { top: 0, right: 0, bottom: 0, left: 0 }]
  );
});

// A brick is the middle of its diamond: every diamond's centre on the map, scaled into the overview as the minimap
//  scales its box, lands in that tile's brick.
{
  const world = dimensions(9, 8),
    map = new IsoProjection({ width: 64, height: 32 }, world),
    cell = overviewCell(9),
    overview = new OverviewProjection(cell, world),
    misses: string[] = [];

  for (let y = -1; y <= 8; y++) {
    for (let x = -1; x <= 9; x++) {
      const [left, top] = map.tileToPixel(x, y),
        found = overview
          .pixelToTile(
            ((left + 32) * cell.width) / 64,
            ((top + 16) * cell.height) / 16 - cell.height / 2
          )
          .join(',');

      if (found !== `${x},${y}`) {
        misses.push(`${x},${y} -> ${found}`);
      }
    }
  }

  expect("every diamond's centre is in its own brick", misses, []);
}

// The layer: the world drawn as soon as it exists, explored tiles only, a world across.
const width = 5,
  height = 4,
  explored = (x: number, y: number) => x < 3 || (x === 4 && y === 1),
  tiles = new Array(width * height).fill(0).map(
    (value, i) =>
      ({
        x: i % width,
        y: Math.floor(i / width),
        city: null,
        isWater: false,
        terrain: {
          _: explored(i % width, Math.floor(i / width))
            ? 'Grassland'
            : 'Unknown',
        },
      } as unknown as Tile)
  ),
  world = new World({ width, height, tiles } as any),
  { calls, canvas } = fakeCanvas(0, 0),
  layer = new Overview(world, 2, { width: 64, height: 32 }, canvas),
  cell = layer.tileSize(),
  filled = calls
    .filter(([name]) => name === 'fillRect')
    .map(([, x, y, w, h]) => `${x},${y} ${w}x${h}`)
    .sort();

expect(
  'the canvas is a world of bricks across, and its rows down, whatever the map tile and scale',
  [cell, canvas.width, canvas.height],
  [{ width: 36, height: 9 }, width * 36, height * 9]
);
expect(
  'every explored tile is drawn as soon as the layer exists, the last of an odd row on both edges',
  filled,
  [
    ...tiles
      .filter(({ x, y }) => explored(x, y))
      .map(({ x, y }) => `${x * 36 + (y & 1) * 18},${y * 9} 36x9`),
    `-18,9 36x9`,
  ].sort()
);

// The minimap, over a portal showing a 64 × 32 isometric map: a stand-in that says where the map is.
type Recorded = [string, ...unknown[]];

const minimapCalls: Recorded[] = [],
  listeners: { [type: string]: ((event: any) => void)[] } = {},
  element = {
    width: 0,
    height: 0,
    offsetWidth: 360,
    offsetHeight: 72,
    getContext: () =>
      new Proxy(
        {},
        {
          get:
            (target, name) =>
            (...args: unknown[]) =>
              minimapCalls.push([String(name), ...args]),
          set: () => true,
        }
      ),
    addEventListener: (type: string, listener: (event: any) => void) =>
      (listeners[type] ??= []).push(listener),
  },
  mapProjection = new IsoProjection({ width: 64, height: 32 }, world),
  centred: [number, number][] = [],
  portal = {
    viewport: { x: 128, y: 16 },
    locked: false,
    projection: () => mapProjection,
    canvas: () => ({ width: 128, height: 32 }),
    lockVerticalEdges: () => portal.locked,
    // A tile's box on the canvas: its world px less the viewport's origin.
    boxOf: ({ x, y }: { x: number; y: number }) => {
      const [left, top] = mapProjection.tileToPixel(x, y);

      return {
        x: left - portal.viewport.x,
        y: top - portal.viewport.y,
        width: 64,
        height: 32,
      };
    },
    setCenter: (x: number, y: number) => centred.push([x, y]),
  };

let active: { x: number; y: number } | null = { x: 4, y: 1 };

const minimap = new IsoMinimap(
    element as unknown as HTMLCanvasElement,
    world,
    portal as any,
    layer,
    () => active
  ),
  drawn = (name: string) =>
    minimapCalls
      .filter(([call]) => call === name)
      .map(([, ...args]) => args.join(','));

minimapCalls.length = 0;
minimap.update();

expect(
  'the minimap is the overview, one to one',
  [element.width, element.height, drawn('drawImage').length],
  [180, 36, 1]
);
expect(
  "the active unit's brick is marked, on both edges for the last of an odd row",
  drawn('fillRect'),
  ['162,9,36,9', '-18,9,36,9']
);
// The map's 128 × 32 px from 128, 16 is 72 × 18 px of bricks 36 × 9 to a 64 px column and a 16 px row, from 72, 9 less
//  half a brick.
expect('the viewport is boxed where the map shows', drawn('rect'), [
  '72,4,72,18',
]);

// Off the left edge, and over the top: the box comes back on the right, and at the bottom.
portal.viewport = { x: -64, y: -16 };
active = null;
minimapCalls.length = 0;
minimap.update();

expect(
  'a box over the seam is drawn on both sides of it, across and down',
  [drawn('fillRect'), drawn('rect')],
  [[], ['144,22,72,18', '144,-14,72,18', '-36,22,72,18', '-36,-14,72,18']]
);

// With the poles locked the box is cut to the world's rows.
portal.locked = true;
minimapCalls.length = 0;
minimap.update();

expect('with the poles locked, the box stops at the top', drawn('rect'), [
  '144,0,72,4',
  '-36,0,72,4',
]);

// A click centres the map on the brick clicked, in the canvas's own px, whatever size it is shown at, wrapped into the
//  world.
[
  [0, 0],
  [17, 1],
  [9, 9],
  [359, 71],
  [180, 20],
].forEach(([offsetX, offsetY]) =>
  listeners.click!.forEach((listener) => listener({ offsetX, offsetY }))
);

expect('a click centres the map on the brick under it', centred, [
  [0, 0],
  [0, 0],
  // 4.5, 4.5 in the canvas: row 0, column 0.
  [0, 0],
  // 179.5, 35.5: row 3, odd, so the brick from 162 is column 4.
  [4, 3],
  // 90, 10: row 1, odd, so the brick from 90 is column 2.
  [2, 1],
]);
expect(
  'and a pixel off the left of an odd row is the last brick of that row, wrapped',
  [minimap.tileAt(-1, 10), minimap.tileAt(179, 10), minimap.tileAt(17, 10)],
  [
    [4, 1],
    [4, 1],
    [4, 1],
  ]
);

// On a real portal over a world bigger than its canvas: wherever it is centred and dragged to, the middle of the box
//  is on the brick of the tile the portal is centred on, the one under the middle of its canvas.
{
  // A layer the portal makes for itself gets its canvas from `s('<canvas></canvas>')`.
  Object.assign((globalThis as any).document, {
    createElement: () => ({
      set innerHTML(_: string) {},
      get firstElementChild() {
        return fakeCanvas(0, 0).canvas;
      },
    }),
  });

  class IsoPortal extends Portal {
    protected override createProjection(): Projection {
      return new IsoProjection(
        this.tileSize(),
        this.world(),
        !this.lockVerticalEdges()
      );
    }
  }

  const bigWidth = 20,
    bigHeight = 40,
    bigWorld = new World({
      width: bigWidth,
      height: bigHeight,
      tiles: new Array(bigWidth * bigHeight).fill(0).map(
        (value, i) =>
          ({
            x: i % bigWidth,
            y: Math.floor(i / bigWidth),
            city: null,
            isWater: false,
            terrain: { _: 'Grassland' },
          } as unknown as Tile)
      ),
    } as any),
    misses: string[] = [];

  [1, 2].forEach((scale) => {
    const portal = new IsoPortal(
        bigWorld,
        {} as any,
        fakeCanvas(300, 170).canvas,
        {
          playerId: null,
          scale,
          tileSize: { width: 64, height: 32 },
          lockVerticalEdges: false,
        },
        Overview
      ),
      overview = portal.getLayer(Overview)!,
      rects: Recorded[] = [],
      bigElement = {
        ...element,
        width: 0,
        height: 0,
        getContext: () =>
          new Proxy(
            {},
            {
              get:
                (target, name) =>
                (...args: unknown[]) =>
                  name === 'rect' ? rects.push(['rect', ...args]) : undefined,
              set: () => true,
            }
          ),
      },
      bigMinimap = new IsoMinimap(
        bigElement as unknown as HTMLCanvasElement,
        bigWorld,
        portal,
        overview
      ),
      bricks = new OverviewProjection(
        overview.tileSize(),
        dimensions(bigWidth, bigHeight)
      );

    (
      [
        [7, 13],
        [10, 20],
        [0, 1],
        [19, 38],
      ] as [number, number][]
    ).forEach(([x, y]) =>
      (
        [
          [0, 0],
          [10.5, -6.5],
          [-37, 21],
          [64 * scale * 3 + 5, 16 * scale * 5 - 3],
        ] as [number, number][]
      ).forEach(([dx, dy]) => {
        portal.setCenter(x, y);
        portal.scrollBy(dx, dy);
        rects.length = 0;
        bigMinimap.update();

        const [, left, top, boxWidth, boxHeight] = rects[0] as number[],
          { x: centreX, y: centreY } = portal.center(),
          [brickLeft, brickTop] = bricks.tileToPixel(centreX, centreY),
          { width: brickWidth, height: brickHeight } = bricks.footprint(),
          middleX = left! + boxWidth! / 2,
          middleY = top! + boxHeight! / 2,
          wrapped = (value: number, size: number) =>
            ((value % size) + size) % size,
          // Within the brick, give or take the pixel the box's edges are rounded to.
          inside = (
            value: number,
            start: number,
            length: number,
            size: number
          ) => wrapped(value - start + 1, size) <= length + 2;

        if (
          !inside(middleX, brickLeft, brickWidth, bigWidth * brickWidth) ||
          !inside(middleY, brickTop, brickHeight, bigHeight * brickHeight)
        ) {
          misses.push(
            `scale ${scale} ${x},${y} by ${dx},${dy}: centre ${centreX},${centreY} (brick ${brickLeft},${brickTop}), box middle ${middleX},${middleY}`
          );
        }
      })
    );
  });

  expect(
    "on a real portal, the box's middle is on the brick of the tile the map is centred on",
    misses,
    []
  );
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL isoMinimap (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS isoMinimap (${checks} checks)\n`);
