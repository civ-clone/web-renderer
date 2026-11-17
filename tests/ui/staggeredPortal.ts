// The portal on a staggered isometric grid (#97): it centres, drags and culls by asking the projection, so on a grid
//  whose rows are half a tile apart, with every odd row shifted half a tile across, it does what it does on squares.
//
//  - Centring on a tile, on an even row or an odd one, puts the middle of its box at the middle of the canvas.
//  - Dragging moves the map by exactly the drag, and the centre is always the tile under the middle of the canvas:
//    down across a pair of rows, across the world's seam on an odd row, and over the poles where the world wraps.
//  - A drag a pixel at a time ends where one drag of the lot does, and dragging back comes back.
//  - Locked to the poles, the view stops at them, and its centre is still the tile under its middle.
//  - Tiles are counted in columns across and rows down, so twice as many rows fit as boxes would, and a tile on a
//    shifted row is half a column along.
//  - A layer places every tile whose box reaches the canvas, and no other, across both seams.
//
// The grid is a stand-in (`lib/staggered.ts`), with diamonds twice as wide as they are tall, as Civ2's are; with
//  `--iso` it is the isometric grid's own projection (`map-isometric`'s `IsoProjection`) instead, and with `--hex` the
//  hexagonal grid's (`map-hex`'s `HexProjection`, 32 × 36 hexes in rows 27 px apart, so a canvas holds fewer rows of
//  them), which `npm test` runs as well.

// Must stay first: it gives the layers a canvas and a `document` to draw with.
import { fakeCanvas } from './lib/fakeCanvas';
import './lib/grids';
import './lib/artPacks';

import Map from '@civ-clone/ui-map/components/Map';
import Portal from '@civ-clone/ui-map/components/Portal';
import { Projection } from '@civ-clone/ui-map/lib/projection';
import HexProjection from '@civ-clone/ui-map-hex/HexProjection';
import IsoProjection from '@civ-clone/ui-map-isometric/IsoProjection';
import Staggered from './lib/staggered';
import { Tile } from '@civ-clone/ui-protocol/types';
import World from '@civ-clone/ui-map/components/World';

// The stand-in, or with `--iso` or `--hex` the real thing.
const hex = process.argv.includes('--hex'),
  iso = process.argv.includes('--iso'),
  Grid: typeof Staggered | typeof IsoProjection | typeof HexProjection = hex
    ? HexProjection
    : iso
    ? IsoProjection
    : Staggered,
  suite = hex
    ? 'staggeredPortal --hex'
    : iso
    ? 'staggeredPortal --iso'
    : 'staggeredPortal';

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
    process.stderr.write(`FAIL ${suite}: stopped before the checks ran\n`);
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

// A layer on the staggered grid that draws nothing, and says where it would.
class Layer extends Map {
  #wrapVertical = true;

  protected drawTile(): void {}

  protected override projection(): Projection {
    return new Grid(this.tileSize(), this.world(), this.#wrapVertical);
  }

  override setWrapVertical(wrap: boolean): void {
    this.#wrapVertical = wrap;

    super.setWrapVertical(wrap);
  }

  /** Every place a tile in view lands on the canvas, as `x,y@px,py`. */
  placed(): string[] {
    return this.visibleTiles()
      .flatMap((tile) =>
        this.placements(tile).map(
          ([px, py]) => `${tile.x},${tile.y}@${px},${py}`
        )
      )
      .sort();
  }

  /** As far past the canvas as the layer draws a tile from. */
  reachesFrom(): number {
    return this.overhang();
  }
}

class StaggeredPortal extends Portal {
  protected override createProjection(): Projection {
    return new Grid(this.tileSize(), this.world(), !this.lockVerticalEdges());
  }
}

// Diamonds twice as wide as they are tall; hexes `2/√3` as tall as wide, as near as whole sizes (even width, height a
//  multiple of four) get, whose rows are three quarters of their height apart.
const tile = hex ? { width: 32, height: 36 } : { width: 32, height: 16 },
  // An odd size, whose shifted rows are half a pixel along; a hex's can't be, so it gets another even size.
  oddTile = hex ? { width: 34, height: 20 } : { width: 33, height: 17 },
  worldWidth = 12,
  worldHeight = 16,
  canvasWidth = 160,
  // 80 px is ten of the stand-in's and iso's rows; 216 is eight of the hex's (and 6 boxes), as many as they make room for.
  canvasHeight = hex ? 216 : 80,
  tiles: Tile[] = [];

for (let y = 0; y < worldHeight; y++) {
  for (let x = 0; x < worldWidth; x++) {
    tiles.push({ x, y, yields: [], units: [], improvements: [] } as any);
  }
}

const world = new World({
    width: worldWidth,
    height: worldHeight,
    tiles,
  } as any),
  makePortal = (
    lockVerticalEdges: boolean = false,
    tileSize: { width: number; height: number } = tile
  ) => {
    const portal = new StaggeredPortal(
      world,
      {} as any,
      fakeCanvas(canvasWidth, canvasHeight).canvas,
      { playerId: null, scale: 1, tileSize, lockVerticalEdges },
      Layer
    );

    return { portal, layer: portal.getLayer(Layer)! as Layer };
  },
  middle = [Math.trunc(canvasWidth / 2), Math.trunc(canvasHeight / 2)] as const,
  name = ({ x, y }: { x: number; y: number }) => `${x},${y}`,
  // The tile under the middle of the canvas.
  underMiddle = (portal: Portal) => {
    const found = portal.tileAt(...middle);

    return found === null ? '-' : name(found);
  },
  // Where the middle of `at`'s box is on the canvas.
  middleOf = (portal: Portal, at: { x: number; y: number }) => {
    const box = portal.boxOf(at);

    return [
      box.x + Math.trunc(box.width / 2),
      box.y + Math.trunc(box.height / 2),
    ];
  };

// The stand-in keeps to the rules the portal leans on: a tile's middle is its own, everywhere, rows above and below
//  the world included.
{
  const projection = new Grid(tile, world, true),
    // An odd-sized tile too, whose middle is a half pixel off its diamond's, as the portal takes it (`Math.trunc`).
    odd = new Grid(oddTile, world, true),
    wrong: string[] = [];

  [projection, odd].forEach((grid) => {
    const { width, height } = grid.footprint();

    for (let y = -3; y < worldHeight + 3; y++) {
      for (let x = -2; x < worldWidth + 2; x++) {
        const [px, py] = grid.tileToPixel(x, y),
          found = grid.pixelToTile(
            px + Math.trunc(width / 2),
            py + Math.trunc(height / 2)
          );

        if (found[0] !== x || found[1] !== y) {
          wrong.push(`${width}×${height} ${x},${y} -> ${found}`);
        }
      }
    }
  });

  expect("the stand-in's tile middles are their own", wrong, []);

  // Every pixel of a block two rows down and two tiles across is in the tile it is said to be on.
  const outside: string[] = [],
    [, blockTop] = projection.tileToPixel(0, 2),
    [, blockBottom] = projection.tileToPixel(0, 4),
    // Whether a point is in a tile's shape: for a diamond, within 1 half diagonal of its middle; for a hex, within its
    //  sides and its zigzag, which climbs a quarter of the box over half its width.
    within = (atX: number, atY: number, left: number, top: number) => {
      const acrossBy = Math.abs(atX - (left + tile.width / 2)),
        downBy = Math.abs(atY - (top + tile.height / 2));

      return hex
        ? acrossBy <= tile.width / 2 &&
            downBy <=
              tile.height / 2 -
                ((tile.height / 4) * acrossBy) / (tile.width / 2)
        : acrossBy / (tile.width / 2) + downBy / (tile.height / 2) <= 1;
    };

  for (let py = blockTop; py < blockBottom; py++) {
    for (let px = 0; px < tile.width * 2; px++) {
      const [x, y] = projection.pixelToTile(px, py),
        [left, top] = projection.tileToPixel(x, y);

      // The pixel's corner (the stand-in's test) or its middle (`IsoProjection`'s and `HexProjection`'s, which `--iso`
      //  and `--hex` run) is in it.
      if (
        !within(px, py, left, top) &&
        !within(px + 0.5, py + 0.5, left, top)
      ) {
        outside.push(`${px},${py} -> ${x},${y}`);
      }
    }
  }

  expect(
    `every pixel of a two-row block is in the ${
      hex ? 'hex' : 'diamond'
    } it is on`,
    outside,
    []
  );

  if (!hex) {
    expect(
      "the stand-in's corners belong to the neighbours",
      [
        projection.pixelToTile(1, 1),
        projection.pixelToTile(31, 1),
        projection.pixelToTile(1, 15),
        projection.pixelToTile(31, 15),
      ],
      [
        [-1, -1],
        [0, -1],
        [-1, 1],
        [0, 1],
      ]
    );
  } else {
    // A hex's top corners belong to the rows' neighbours up and to either side, its sides' middles to itself.
    expect(
      "a hex's zigzag corners belong to the neighbours above and below, its sides to itself",
      [
        projection.pixelToTile(1, 1),
        projection.pixelToTile(30, 1),
        projection.pixelToTile(1, 35),
        projection.pixelToTile(30, 35),
        projection.pixelToTile(1, 18),
        projection.pixelToTile(30, 18),
      ],
      [
        [-1, -1],
        [0, -1],
        [-1, 1],
        [0, 1],
        [0, 0],
        [0, 0],
      ]
    );
  }
}

// The step the portal counts in, and the box it centres on.
if (hex) {
  const projection = new Grid(tile, world, true);

  expect(
    "a hex's step is a column across and three quarters of its height down, its footprint the box",
    [projection.tileStep(), projection.footprint()],
    [{ x: 32, y: 27 }, tile]
  );
}

// Centring.
{
  const { portal } = makePortal();

  (
    [
      [4, 6],
      [4, 7],
      [0, 0],
      [11, 15],
      [11, 1],
    ] as [number, number][]
  ).forEach(([x, y]) => {
    portal.setCenter(x, y);

    expect(
      `centred on ${x},${y}, its middle is the canvas's, and it is under it`,
      [middleOf(portal, { x, y }), underMiddle(portal)],
      [middle, `${x},${y}`]
    );
  });
}

// Dragging: by exactly the drag, with the centre the tile under the middle all the way.
const drag = (
  start: [number, number],
  moves: [number, number][],
  lockVerticalEdges: boolean = false,
  tileSize: { width: number; height: number } = tile
) => {
  const { portal } = makePortal(lockVerticalEdges, tileSize),
    centres: string[] = [],
    lost: string[] = [],
    // Tile 0,0's box: on a row that isn't shifted, so its corner is a whole pixel whatever the tile's size.
    reference = { x: 0, y: 0 };

  portal.setCenter(...start);
  portal.on('focus-changed', (x, y) => centres.push(`${x},${y}`));

  const [startX, startY] = middleOf(portal, reference);
  let movedX = 0,
    movedY = 0;

  moves.forEach(([dx, dy]) => {
    portal.scrollBy(dx, dy);

    movedX += dx;
    movedY += dy;

    const box = portal.boxOf(reference);

    // The canvas is drawn at whole pixels, wherever the drag has got to.
    if (!Number.isInteger(box.x) || !Number.isInteger(box.y)) {
      lost.push(`after ${movedX},${movedY} the map is at ${box.x},${box.y}`);
    }

    // Once the drag adds up to whole pixels, nothing is rounded: the centre is the tile drawn under the middle. In
    //  between, within half a pixel of a tile's edge, it can be the one beside, as on the square grid.
    if (
      Number.isInteger(movedX) &&
      Number.isInteger(movedY) &&
      underMiddle(portal) !== name(portal.center())
    ) {
      lost.push(
        `after ${movedX},${movedY} the centre is ${name(
          portal.center()
        )} but ${underMiddle(portal)} is under the middle`
      );
    }
  });

  // Where the starting tile's nearest copy is now, a world's width (and height) away at most.
  const [nowX, nowY] = middleOf(portal, reference),
    period = portal.projection().wrapPeriod(),
    near = (value: number, span: number | null) =>
      span === null ? value : ((value % span) + span) % span;

  return {
    portal,
    centres,
    lost,
    moved: [
      near(startX - movedX - nowX, period.x),
      near(startY - movedY - nowY, period.y),
    ],
  };
};

const pixels = (count: number, step: [number, number]): [number, number][] =>
  Array.from({ length: count }, () => step);

(
  [
    // Down across a pair of rows, from an even row and from an odd one.
    ['down across a row pair, from an even row', [4, 6], pixels(20, [0, 1])],
    ['down across a row pair, from an odd row', [4, 7], pixels(20, [0, 1])],
    ['up across a row pair', [4, 6], pixels(20, [0, -1])],
    // Diagonally, which a staggered grid steps by half a tile across and a row down.
    ['diagonally', [4, 6], pixels(40, [1, 1])],
    // Across the world's seam, on an odd row and on an even one.
    ['right across the seam on an odd row', [11, 5], pixels(48, [1, 0])],
    ['left across the seam on an odd row', [0, 5], pixels(48, [-1, 0])],
    ['left across the seam on an even row', [0, 4], pixels(48, [-1, 0])],
    // Over the poles, which wrap.
    ['down over the bottom pole', [3, 15], pixels(24, [0, 1])],
    ['up over the top pole', [3, 0], pixels(24, [0, -1])],
    ['diagonally over both seams', [11, 15], pixels(30, [1, 1])],
  ] as [string, [number, number], [number, number][]][]
).forEach(([description, start, moves]) => {
  const { portal, lost, moved, centres } = drag(start, moves),
    once = drag(start, [
      moves.reduce(([x, y], [dx, dy]) => [x + dx, y + dy], [0, 0]),
    ]),
    back = drag(start, [
      ...moves,
      ...moves.map(([dx, dy]): [number, number] => [-dx, -dy]),
    ]);

  expect(
    `${description}: the centre is the tile under the middle all the way`,
    lost,
    []
  );
  expect(`${description}: the map moves by exactly the drag`, moved, [0, 0]);
  expect(
    `${description}: the centre moves, and is always in the world`,
    [
      centres.length > 0,
      centres.every((centre) => {
        const [x, y] = centre.split(',').map(Number) as [number, number];

        return x >= 0 && x < worldWidth && y >= 0 && y < worldHeight;
      }),
    ],
    [true, true]
  );
  expect(
    `${description}: a pixel at a time ends where one drag does`,
    [name(portal.center()), portal.boxOf(portal.center())],
    [name(once.portal.center()), once.portal.boxOf(once.portal.center())]
  );
  expect(
    `${description}: and dragging back comes back`,
    [name(back.portal.center()), middleOf(back.portal, back.portal.center())],
    [`${start[0]},${start[1]}`, middle]
  );
});

// An odd-sized tile, whose shifted rows are half a pixel along: the map is still drawn at whole pixels, moves by
//  exactly the drag, and is centred on the tile under its middle.
(
  [
    ['down across a row pair, from an even row', [4, 6], pixels(20, [0, 1])],
    ['down across a row pair, from an odd row', [4, 7], pixels(20, [0, 1])],
    ['diagonally', [4, 6], pixels(40, [1, 1])],
    ['right across the seam on an odd row', [11, 5], pixels(50, [1, 0])],
    ['up over the top pole', [3, 0], pixels(24, [0, -1])],
    ['in one drag down a row', [4, 6], [[0, 9]]],
  ] as [string, [number, number], [number, number][]][]
).forEach(([description, start, moves]) => {
  const { lost, moved } = drag(start, moves, false, oddTile);

  expect(
    `${oddTile.width}×${oddTile.height}, ${description}: whole pixels, centred all the way`,
    lost,
    []
  );
  expect(
    `${oddTile.width}×${oddTile.height}, ${description}: the map moves by exactly the drag`,
    moved,
    [0, 0]
  );
});

// Drags of a fraction of a pixel: drawn at whole pixels, and centred on the tile under the middle whenever they add up
//  to whole ones.
(
  [
    ['half a pixel at a time down a row pair', [4, 6], pixels(40, [0, 0.5])],
    ['a quarter of a pixel at a time', [4, 7], pixels(80, [0.25, -0.25])],
    [
      'seven and a half pixels, then half',
      [4, 6],
      [
        [0, 7.5],
        [0, 0.5],
        [7.5, 0],
        [0.5, 0],
      ],
    ],
  ] as [string, [number, number], [number, number][]][]
).forEach(([description, start, moves]) => {
  [tile, oddTile].forEach((size) => {
    const { lost, moved } = drag(start, moves, false, size);

    expect(
      `${size.width}×${size.height}, ${description}: whole pixels, centred when the drag is`,
      [lost, moved],
      [[], [0, 0]]
    );
  });
});

// The same drags by a fraction of a pixel at a time add up.
{
  const slow = drag([4, 6], pixels(64, [0.25, 0.25])),
    once = drag([4, 6], [[16, 16]]);

  expect(
    'a quarter of a pixel at a time adds up to the drag',
    [name(slow.portal.center()), slow.portal.boxOf({ x: 4, y: 6 })],
    [name(once.portal.center()), once.portal.boxOf({ x: 4, y: 6 })]
  );
}

// Locked to the poles: the view stops at them, still centred on the tile under its middle.
{
  const top = drag([5, 0], pixels(60, [0, -1]), true),
    bottom = drag([5, 15], pixels(60, [0, 1]), true),
    worldPixels = top.portal.projection().worldSize().height;

  expect(
    'locked, a drag past the top pole stops at it',
    [
      top.portal.boxOf({ x: 5, y: 0 }).y,
      top.lost,
      top.portal.center().y >= 0 && top.portal.center().y < worldHeight,
    ],
    [0, [], true]
  );
  expect(
    'locked, a drag past the bottom pole stops at it',
    [
      bottom.portal.boxOf({ x: 5, y: 0 }).y + worldPixels,
      bottom.lost,
      bottom.portal.center().y >= 0 && bottom.portal.center().y < worldHeight,
    ],
    [canvasHeight, [], true]
  );

  const { portal } = makePortal(true);

  portal.setCenter(5, 1);
  portal.render();

  expect(
    'locked, centring by the pole stops at it, on the tile under the middle',
    [
      portal.boxOf({ x: 5, y: 0 }).y,
      underMiddle(portal) === name(portal.center()),
    ],
    [0, true]
  );
  expect(
    'locked, a tile by the pole the view is as close to as it gets counts as in view',
    [portal.isVisible(5, 0, 3), portal.isVisible(5, 1, 3)],
    [true, true]
  );
}

// Counted in columns and rows: 160 px is 5 columns, so 2 either side, and the canvas is as many rows as it is steps
//  tall (80 px is 10 rows for the diamonds, 216 is 8 for the hexes), so 5 (4) above and below.
{
  const { portal } = makePortal(),
    // Rows counted in, from the centre: those closer than half the canvas's rows, less one for the centre's own.
    rowReach = hex ? 4 : 5,
    rows = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    range = hex ? [3, 11] : [2, 12];

  portal.setCenter(5, 7);

  expect(
    'in view: the rows above and below, and the shifted rows half a column along',
    [
      rows.map((y) => portal.isVisible(5, y)),
      [2, 3, 4, 5, 6, 7].map((x) => portal.isVisible(x, 7)),
      [2, 3, 4, 5, 6, 7].map((x) => portal.isVisible(x, 6)),
      [3, 4, 5, 6].map((x) => portal.isVisible(x, 6, 1)),
    ],
    [
      rows.map((y) => Math.abs(y - 7) < rowReach),
      [false, false, true, true, true, false],
      [false, false, true, true, true, true],
      [false, false, true, true],
    ]
  );
  expect(
    'the range in view is counted in columns and rows',
    [portal.rawVisibleRange(), portal.visibleRange()],
    [
      [
        { x: 3, y: range[0] },
        { x: 7, y: range[1] },
      ],
      [
        { x: 3, y: range[0] },
        { x: 7, y: range[1] },
      ],
    ]
  );

  portal.setCenter(0, 1);

  expect('the range in view wraps across both seams', portal.visibleRange(), [
    { x: 10, y: hex ? 13 : 12 },
    { x: 2, y: hex ? 5 : 6 },
  ]);

  portal.setCovered([{ x: 0, y: 0, width: 40, height: canvasHeight }]);
  portal.setCenter(5, 7);

  expect(
    'a tile under the interface is out of view, one row down beside it is not',
    [portal.isVisible(4, 7), portal.isVisible(5, 8), portal.isVisible(4, 8, 1)],
    [false, true, false]
  );
}

// Culling: a layer places every tile whose box reaches the canvas, or as far past it as the layer draws from, and no
//  other, wherever the view is.
{
  const { portal, layer } = makePortal(),
    projection = new Grid(tile, world, true),
    period = projection.wrapPeriod(),
    reach = layer.reachesFrom(),
    expected = () => {
      const [originX, originY] = (() => {
          const box = portal.boxOf({ x: 0, y: 0 }),
            [px, py] = projection.tileToPixel(0, 0);

          return [px - box.x, py - box.y];
        })(),
        placed: string[] = [];

      for (let y = 0; y < worldHeight; y++) {
        for (let x = 0; x < worldWidth; x++) {
          const [px, py] = projection.tileToPixel(x, y);

          for (let copyY = -2; copyY <= 2; copyY++) {
            for (let copyX = -2; copyX <= 2; copyX++) {
              const left = px + copyX * period.x - originX,
                top = py + copyY * period.y! - originY;

              if (
                left > -tile.width - reach &&
                left < canvasWidth + reach &&
                top > -tile.height - reach &&
                top < canvasHeight + reach
              ) {
                placed.push(`${x},${y}@${left},${top}`);
              }
            }
          }
        }
      }

      return placed.sort();
    };

  (
    [
      [5, 7],
      [0, 0],
      [11, 15],
      [0, 15],
      [11, 0],
    ] as [number, number][]
  ).forEach(([x, y]) => {
    portal.setCenter(x, y);

    expect(
      `centred on ${x},${y}, the layer places what reaches the canvas`,
      layer.placed(),
      expected()
    );

    portal.scrollBy(13, 5);

    expect(
      `dragged from ${x},${y}, the layer places what reaches the canvas`,
      layer.placed(),
      expected()
    );
  });
}

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL ${suite}\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS ${suite} (${checks} checks)`);
