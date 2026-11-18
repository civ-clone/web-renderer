// The 3D map's ground layouts (docs/3d-renderer.md §3, plan 0.3), one for each grid. For each:
//  - every square's middle gives back that square, and so do points inside its outline, on the world and off its edges;
//  - its sizes are the spec's: a square of side 1, a diamond of side 1 turned through 45°, a regular hex 1 across its
//    flats;
//  - any point, however far out, and any point on an edge, is given a square whose outline holds it;
//  - every corner is shared by as many squares as the grid has meet at a corner;
//  - neighbours share an edge where the topology says they do (`topologyFor`), and a corner where they meet at one;
//  - one period along, a square's copy lies one period further on;
//  - its outline is the 2D map's, once foreshortened: the 2D projection's outline on the isometric and hexagonal grids,
//    and the footprint's box on the square grid.

import topologyFor, { Topology } from '@civ-clone/ui-client/lib/topologyFor';
import groundLayoutFor, {
  GroundLayout,
  GroundPoint,
} from '@civ-clone/ui-map-3d/layouts';
import HexProjection from '@civ-clone/ui-map-hex/HexProjection';
import IsoProjection from '@civ-clone/ui-map-isometric/IsoProjection';
import { Projection } from '@civ-clone/ui-map/lib/projection';
import SquareProjection from '@civ-clone/ui-map-square/SquareProjection';
import { TopologyId } from '@civ-clone/ui-protocol/topology';

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

// Points computed by different routes agree to well within this.
const EPSILON = 1e-9,
  same = ([u1, v1]: GroundPoint, [u2, v2]: GroundPoint): boolean =>
    Math.abs(u1 - u2) < EPSILON && Math.abs(v1 - v2) < EPSILON,
  // A point's key for counting, rounded well past any difference in how it was reached, and with `-0` as `0`: a corner
  //  reached as a hair below 0 is the one reached as 0.
  key = ([u, v]: GroundPoint): string =>
    `${Math.round(u * 1e6) + 0},${Math.round(v * 1e6) + 0}`;

// A world small enough to check every square of, with an even height, as the staggered and hexagonal grids need.
const width = 6,
  height = 4;

// How many squares meet at a corner of each grid.
const meetAtCorner: { [id in TopologyId]: number } = {
  square: 4,
  'staggered-iso': 4,
  'hex-odd-r': 3,
};

// The 2D projection of each grid, at a size its tileset might have: Civ1's square, Civ2's 2:1 diamond, and the pixel
//  art's hex, which is a whole number of pixels and so not quite regular.
const dimensions = { width: () => width, height: () => height },
  projections: { [id in TopologyId]: () => Projection } = {
    square: () => new SquareProjection(16, dimensions),
    'staggered-iso': () =>
      new IsoProjection({ width: 64, height: 32 }, dimensions),
    'hex-odd-r': () => new HexProjection({ width: 32, height: 36 }, dimensions),
  };

const ids: TopologyId[] = ['square', 'staggered-iso', 'hex-odd-r'];

ids.forEach((topologyId) => {
  const topology: Topology = topologyFor({ width, height, topologyId }),
    layout: GroundLayout = groundLayoutFor({
      width,
      height,
      topologyId,
      wrapsY: topology.wrapsY(),
    }),
    // Every square of the world, and of the copies of it all round, as far as one world past each edge.
    squares: [number, number][] = [];

  for (let y = -height; y < 2 * height; y++) {
    for (let x = -width; x < 2 * width; x++) {
      squares.push([x, y]);
    }
  }

  expect(
    `${topologyId}: the layout is for its grid`,
    layout.topologyId,
    topologyId
  );

  // Round trips: the middle, and points inside the outline a little in from each corner and from each edge's middle.
  expect(
    `${topologyId}: every square's middle gives back that square`,
    squares.filter(
      ([x, y]) => layout.tileAt(...layout.centre(x, y)).join() !== [x, y].join()
    ),
    []
  );

  const inside = (x: number, y: number): GroundPoint[] => {
    const [u, v] = layout.centre(x, y),
      corners = layout.outline(x, y),
      toward = ([cu, cv]: GroundPoint, by: number): GroundPoint => [
        u + (cu - u) * by,
        v + (cv - v) * by,
      ];

    return [
      ...corners.map((corner) => toward(corner, 0.99)),
      ...corners.map((corner, index) => {
        const next = corners[(index + 1) % corners.length];

        return toward(
          [(corner[0] + next[0]) / 2, (corner[1] + next[1]) / 2],
          0.99
        );
      }),
    ];
  };

  expect(
    `${topologyId}: every point inside a square's outline is in that square`,
    squares.flatMap(([x, y]) =>
      inside(x, y)
        .map((point) => layout.tileAt(...point))
        .filter((found) => found.join() !== [x, y].join())
        .map((found) => `${x},${y} gave ${found}`)
    ),
    []
  );

  // Every corner of a square well inside the window is shared by exactly as many squares as meet at a corner on this
  //  grid. With the outlines' order checked against the 2D map's below, the outlines tile the ground.
  const corners = new Map<string, number>();

  squares.forEach(([x, y]) =>
    layout.outline(x, y).forEach((corner) => {
      const at = key(corner);

      corners.set(at, (corners.get(at) ?? 0) + 1);
    })
  );

  expect(
    `${topologyId}: each corner is shared by ${meetAtCorner[topologyId]} squares`,
    Array.from(
      new Set(
        squares
          .filter(([x, y]) => x >= 0 && x < width && y >= 0 && y < height)
          .flatMap(([x, y]) =>
            layout.outline(x, y).map((corner) => corners.get(key(corner)))
          )
      )
    ),
    [meetAtCorner[topologyId]]
  );

  // Neighbours, as the topology has them: an edge shared with each it says shares one, and a corner with the others.
  const shared = (a: [number, number], b: [number, number]): number =>
    layout
      .outline(...a)
      .filter((corner) =>
        layout.outline(...b).some((other) => same(corner, other))
      ).length;

  expect(
    `${topologyId}: neighbours share an edge where the topology says, and a corner where not`,
    squares
      .filter(([x, y]) => x >= 0 && x < width && y >= 0 && y < height)
      .flatMap(([x, y]) =>
        topology.directions().flatMap((direction) => {
          const [dx, dy] = topology.offset(direction, x, y),
            neighbour: [number, number] = [x + dx, y + dy],
            expected = topology.edgeDirections().includes(direction) ? 2 : 1,
            wrapped = topology.neighbour(x, y, direction),
            found = shared([x, y], neighbour);

          return [
            ...(found === expected
              ? []
              : [
                  `${x},${y} ${direction}: ${found} corners shared, not ${expected}`,
                ]),
            // The step is the topology's own neighbour, before it's wrapped.
            ...(wrapped !== null &&
            (((neighbour[0] % width) + width) % width !== wrapped[0] ||
              ((neighbour[1] % height) + height) % height !== wrapped[1])
              ? [
                  `${x},${y} ${direction}: stepped to ${neighbour}, not ${wrapped}`,
                ]
              : []),
          ];
        })
      ),
    []
  );

  // Periods: the world repeats a whole world along, and down where it wraps over the poles.
  const { u: acrossPeriod, v: downPeriod } = layout.period();

  expect(
    `${topologyId}: it wraps over the poles as the topology does`,
    downPeriod !== null,
    topology.wrapsY()
  );
  expect(
    `${topologyId}: a square's copy a world along is a period further on`,
    squares.filter(([x, y]) => {
      const [u, v] = layout.centre(x, y),
        across = layout.centre(x + width, y),
        down = downPeriod === null ? null : layout.centre(x, y + height);

      return !(
        same(across, [u + acrossPeriod, v]) &&
        (down === null || same(down, [u, v + downPeriod!]))
      );
    }),
    []
  );

  // The 2D map's outline, once foreshortened: the ground scaled across and down by however much the 2D map's columns
  //  and rows are further apart than the layout's.
  const projection = projections[topologyId](),
    { x: columnStep, y: rowStep } = projection.tileStep(),
    scaleAcross =
      columnStep / (layout.centre(1, 0)[0] - layout.centre(0, 0)[0]),
    scaleDown = rowStep / (layout.centre(0, 1)[1] - layout.centre(0, 0)[1]),
    { width: boxWidth, height: boxHeight } = projection.footprint(),
    outline2D = projection.outline?.() ?? [
      // The square grid's is its footprint's box.
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    foreshortened = ([u, v]: GroundPoint): GroundPoint => [
      u * scaleAcross,
      v * scaleDown,
    ];

  expect(
    `${topologyId}: each square's middle and outline are the 2D map's, foreshortened`,
    squares.filter(([x, y]) => {
      const [px, py] = projection.tileToPixel(x, y),
        middle: GroundPoint = [px + boxWidth / 2, py + boxHeight / 2];

      return !(
        same(foreshortened(layout.centre(x, y)), middle) &&
        layout
          .outline(x, y)
          .every((corner, index) =>
            same(foreshortened(corner), [
              px + outline2D[index][0] * boxWidth,
              py + outline2D[index][1] * boxHeight,
            ])
          )
      );
    }),
    []
  );
});

// The sizes, which nothing above pins: a layout stretched one way and squashed the other would pass every check of how
//  its squares meet. Each grid's outline: the length of each edge, how far each corner is from the middle, and how far
//  the middles are apart along a row and to the next row.
const geometry = (layout: GroundLayout) => {
  const [u, v] = layout.centre(2, 2),
    outline = layout.outline(2, 2),
    round = (value: number) => Number(value.toFixed(9)),
    [acrossU, acrossV] = layout.centre(3, 2),
    [downU, downV] = layout.centre(2, 3);

  return {
    edges: Array.from(
      new Set(
        outline.map(([cu, cv], index) => {
          const [nu, nv] = outline[(index + 1) % outline.length];

          return round(Math.hypot(nu - cu, nv - cv));
        })
      )
    ),
    corners: Array.from(
      new Set(outline.map(([cu, cv]) => round(Math.hypot(cu - u, cv - v))))
    ),
    // Whether the first corner is due north of the middle: the diamonds' and the hexes' top points.
    pointNorth: round(outline[0][0] - u) === 0,
    along: [round(acrossU - u), round(acrossV - v)],
    down: [round(downU - u), round(downV - v)],
  };
};

expect(
  'the square grid: squares of side 1, square to the axes, a row 1 apart',
  geometry(
    groundLayoutFor({ width, height, topologyId: 'square', wrapsY: true })
  ),
  {
    edges: [1],
    corners: [Number((Math.SQRT2 / 2).toFixed(9))],
    pointNorth: false,
    along: [1, 0],
    down: [0, 1],
  }
);
expect(
  'the isometric grid: diamonds of side 1, turned through 45°, a diagonal along and half a diagonal down',
  geometry(
    groundLayoutFor({
      width,
      height,
      topologyId: 'staggered-iso',
      wrapsY: true,
    })
  ),
  {
    edges: [1],
    corners: [Number((Math.SQRT2 / 2).toFixed(9))],
    pointNorth: true,
    along: [Number(Math.SQRT2.toFixed(9)), 0],
    // Row 3 is shifted half a diagonal east of row 2.
    down: [
      Number((Math.SQRT2 / 2).toFixed(9)),
      Number((Math.SQRT2 / 2).toFixed(9)),
    ],
  }
);
expect(
  'the hex grid: regular hexes 1 across their flats, pointed north, rows √3/2 apart',
  geometry(
    groundLayoutFor({ width, height, topologyId: 'hex-odd-r', wrapsY: true })
  ),
  {
    edges: [Number((1 / Math.sqrt(3)).toFixed(9))],
    corners: [Number((1 / Math.sqrt(3)).toFixed(9))],
    pointNorth: true,
    along: [1, 0],
    down: [0.5, Number((Math.sqrt(3) / 2).toFixed(9))],
  }
);

// Any point is in the square it's given, checked against that square's outline, which shares no code with `tileAt`:
//  thousands of points, seeded, near the world and out to a thousand worlds away, where a constant a hair off puts
//  points in the wrong square. And points exactly on an edge or a corner, in one of the squares that share it.
let seed = 1;

const random = (): number => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;

    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);

    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  },
  // Inside or on a convex outline, clockwise as drawn with `v` growing south: never to the left of an edge.
  holds = (outline: readonly GroundPoint[], [u, v]: GroundPoint): boolean =>
    outline.every(([cu, cv], index) => {
      const [nu, nv] = outline[(index + 1) % outline.length],
        scale = Math.max(1, Math.abs(u), Math.abs(v));

      return (nu - cu) * (v - cv) - (nv - cv) * (u - cu) >= -1e-9 * scale;
    });

ids.forEach((topologyId) => {
  const layout = groundLayoutFor({
      width: 80,
      height: 50,
      topologyId,
      wrapsY: true,
    }),
    points: GroundPoint[] = [];

  seed = 1;

  for (let index = 0; index < 20000; index++) {
    // Half near the world, half anywhere out to about a thousand worlds away.
    const reach = index % 2 === 0 ? 200 : 80000;

    points.push([(random() * 2 - 1) * reach, (random() * 2 - 1) * reach]);
  }

  // Exactly on the edges and at the corners of squares near and far.
  [
    [0, 0],
    [3, 7],
    [-5, -9],
    [40001, -30001],
  ].forEach(([x, y]) => {
    const outline = layout.outline(x, y);

    outline.forEach((corner, index) => {
      const next = outline[(index + 1) % outline.length];

      [0, 0.25, 0.5, 0.75].forEach((along) =>
        points.push([
          corner[0] + (next[0] - corner[0]) * along,
          corner[1] + (next[1] - corner[1]) * along,
        ])
      );
    });
  });

  expect(
    `${topologyId}: any point, near or far or on an edge, is in the square it's given`,
    points
      .filter(
        (point) => !holds(layout.outline(...layout.tileAt(...point)), point)
      )
      .slice(0, 3)
      .map(([u, v]) => `${u},${v} gave ${layout.tileAt(u, v)}`),
    []
  );
});

// A world that doesn't wrap over the poles has no period down. (The engine builds every grid to wrap, but the layout
//  follows the topology it's given.)
expect(
  'a world that does not wrap over the poles has no period down',
  ids.map(
    (topologyId) =>
      groundLayoutFor({ width, height, topologyId, wrapsY: false }).period().v
  ),
  [null, null, null]
);

expect(
  'a square on the square grid is 1 across, and the others have the same area',
  [
    groundLayoutFor({ width, height, topologyId: 'square', wrapsY: true }),
    groundLayoutFor({
      width,
      height,
      topologyId: 'staggered-iso',
      wrapsY: true,
    }),
    groundLayoutFor({ width, height, topologyId: 'hex-odd-r', wrapsY: true }),
  ].map((layout) => {
    // The shoelace formula, over the outline.
    const outline = layout.outline(2, 2);

    return Number(
      Math.abs(
        outline.reduce((sum, [u, v], index) => {
          const [nextU, nextV] = outline[(index + 1) % outline.length];

          return sum + u * nextV - nextU * v;
        }, 0) / 2
      ).toFixed(6)
    );
  }),
  // A regular hex 1 across its flats is √3/2 in area, a little less than the square's: the hex grid's squares are 1
  //  across, as its tileset draws them, and the land's scale doesn't hang on the area.
  [1, 1, Number((Math.sqrt(3) / 2).toFixed(6))]
);

const refusal = (topologyId: string, worldHeight: number = height): string => {
  try {
    groundLayoutFor({
      width,
      height: worldHeight,
      topologyId: topologyId as TopologyId,
      wrapsY: true,
    });
  } catch (error) {
    return (error as Error).message;
  }

  return 'not refused';
};

expect(
  'a grid with no layout is refused, by name, even one named as an object has something',
  ['triangles', 'constructor', 'toString'].map((topologyId) =>
    refusal(topologyId)
  ),
  [
    'No ground layout for the triangles grid.',
    'No ground layout for the constructor grid.',
    'No ground layout for the toString grid.',
  ]
);
expect(
  'as is a staggered or hexagonal world wrapping over the poles with an odd number of rows, as its topology would',
  [refusal('square', 5), refusal('staggered-iso', 5), refusal('hex-odd-r', 5)],
  [
    'not refused',
    "The staggered-iso grid can't wrap over the poles with an odd number of rows (5).",
    "The hex-odd-r grid can't wrap over the poles with an odd number of rows (5).",
  ]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL groundLayouts: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS groundLayouts (${checks} checks)\n`);
