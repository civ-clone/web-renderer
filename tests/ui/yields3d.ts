// What each square yields on the 3D map (`y`): laid out as the 2D map lays them in its tile, fitted to each grid's
//  squares so a square's icons stay within it from above however the camera's turned, and their atlas.

import topologyFor, {
  TopologyName,
} from '@civ-clone/ui-client/lib/topologyFor';
import { tileYieldGrid } from '@civ-clone/ui-client/lib/yieldMap';
import { groundLayoutFor } from '@civ-clone/ui-map-3d/layouts';
import {
  YIELDS_FILL,
  innerOf,
  laidYields,
  yieldIconSize,
  yieldMesh,
  yieldSlots,
} from '@civ-clone/ui-map-3d/yields';
import { atlasCells, atlasPlaces } from '@civ-clone/ui-map-3d/yieldIcons';

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

const yields = (food: number, shields: number, trade: number) => [
  { _: 'Food', value: food },
  { _: 'Production', value: shields },
  { _: 'Trade', value: trade },
];

// The layout: as the 2D map's, centred.
expect(
  'a square’s icons are the 2D map’s, in its two rows and columns, centred on the block they make',
  [
    yieldSlots(yields(1, 0, 0)),
    yieldSlots(yields(2, 1, 0)),
    yieldSlots(yields(2, 1, 2)).slots.map(({ _, right, up }) => [_, right, up]),
    yieldSlots([]),
  ],
  [
    { columns: 2, slots: [{ _: 'Food', right: 0, up: 0 }] },
    {
      columns: 2,
      slots: [
        { _: 'Food', right: -0.5, up: 0.5 },
        { _: 'Food', right: 0.5, up: 0.5 },
        { _: 'Production', right: -0.5, up: -0.5 },
      ],
    },
    [
      ['Food', -1, 0.5],
      ['Food', 0, 0.5],
      ['Production', 1, 0.5],
      ['Trade', -1, -0.5],
      ['Trade', 0, -0.5],
    ],
    { columns: 2, slots: [] },
  ]
);

expect(
  'its icons are the 2D map’s, in its order',
  [yields(2, 1, 2), yields(3, 3, 6), yields(0, 0, 1)].map(
    (made) =>
      JSON.stringify(yieldSlots(made).slots.map(({ _ }) => _)) ===
      JSON.stringify(tileYieldGrid(made).icons.map(({ _ }) => _))
  ),
  [true, true, true]
);

// On each grid: the circle inside a square, and a block of icons that fits inside it from above, so it stays inside
//  its square turned any way. Seen from straight above, an icon is upright on the screen, so its block is turned with
//  the camera.
const grids: TopologyName[] = ['square', 'staggered-iso', 'hex-odd-r'];

// Whether point (u, v) is inside the convex outline `points` (clockwise from above, `v` south), on its edge or in it.
const inside = (
  [u, v]: readonly [number, number],
  points: readonly (readonly [number, number])[]
): boolean =>
  points.every(([au, av], index) => {
    const [bu, bv] = points[(index + 1) % points.length]!;

    return (bu - au) * (v - av) - (bv - av) * (u - au) >= -1e-9;
  });

grids.forEach((topologyId) => {
  const topology = topologyFor({ topologyId, width: 12, height: 10 }),
    layout = groundLayoutFor({
      topologyId,
      width: 12,
      height: 10,
      wrapsY: topology.wrapsY(),
    }),
    inner = innerOf(layout, topology),
    faults: string[] = [];

  [2, 3, 4, 5, 6].forEach((columns) => {
    const size = yieldIconSize(columns, inner),
      across = columns * size,
      down = 2 * size;

    if (Math.hypot(across, down) > YIELDS_FILL * inner + 1e-9) {
      faults.push(`${columns} columns: wider than the circle`);
    }

    [
      [4, 4],
      [5, 5],
    ].forEach(([x, y]) => {
      const [u, v] = layout.centre(x!, y!),
        outline = layout.outline(x!, y!);

      for (let degree = 0; degree < 360; degree += 7.5) {
        const turn = (degree * Math.PI) / 180,
          // Across the screen and up it, on the ground, as the camera's turned: up the screen is the way it looks.
          right = [Math.cos(turn), Math.sin(turn)],
          up = [Math.sin(turn), -Math.cos(turn)];

        [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ].forEach(([a, b]) => {
          const corner: [number, number] = [
            u + (a! * across * right[0]!) / 2 + (b! * down * up[0]!) / 2,
            v + (a! * across * right[1]!) / 2 + (b! * down * up[1]!) / 2,
          ];

          if (!inside(corner, outline)) {
            faults.push(
              `${columns} columns at (${x}, ${y}) turned ${degree}°: a corner outside the square`
            );
          }
        });
      }
    });
  });

  expect(
    `${topologyId}: a square’s icons fit inside it from above, turned any way, however many there are, smaller the more there are`,
    [
      faults.slice(0, 5),
      yieldIconSize(3, inner) < yieldIconSize(2, inner),
      yieldIconSize(6, inner) < yieldIconSize(3, inner),
    ],
    [[], true, true]
  );
});

{
  const square = topologyFor({ topologyId: 'square', width: 12, height: 10 }),
    hex = topologyFor({ topologyId: 'hex-odd-r', width: 12, height: 10 }),
    layoutOf = (topology: typeof square, topologyId: TopologyName) =>
      groundLayoutFor({
        topologyId,
        width: 12,
        height: 10,
        wrapsY: topology.wrapsY(),
      });

  expect(
    'the circle inside a square is a square’s width on the square grid, and as far as a hex’s neighbours across an edge on the hex grid',
    [
      innerOf(layoutOf(square, 'square'), square),
      Math.round(innerOf(layoutOf(hex, 'hex-odd-r'), hex) * 1000) ===
        Math.round(
          Math.hypot(
            ...(() => {
              const layout = layoutOf(hex, 'hex-odd-r'),
                [u, v] = layout.centre(4, 4),
                [eu, ev] = layout.centre(5, 4);

              return [eu - u, ev - v];
            })()
          ) * 1000
        ),
    ],
    [1, true]
  );
}

// Every icon, as the stage takes them.
{
  const laid = [
      laidYields({ at: [0.5, 0.2, 0.5], yields: yields(1, 1, 0) }, 1),
      laidYields({ at: [1.5, 0, 0.5], yields: yields(0, 0, 0) }, 1),
      laidYields({ at: [2.5, 0.1, 0.5], yields: yields(0, 0, 2) }, 1),
    ],
    mesh = yieldMesh(
      laid.flatMap((square) => (square === null ? [] : [square]))
    );

  expect(
    'a square that yields nothing has no icons; the rest are each where their square stands, in their place in its block, as big as its icons are, in the cell of their kind',
    [
      laid[1],
      mesh.count,
      mesh.names,
      [...mesh.cells],
      [...mesh.anchors],
      [...mesh.slots],
      [...new Set(mesh.sizes)].map((size) => Math.round(size * 1000)),
    ],
    [
      null,
      4,
      ['Food', 'Production', 'Trade'],
      [0, 1, 2, 2],
      [0.5, 0.2, 0.5, 0.5, 0.2, 0.5, 2.5, 0.1, 0.5, 2.5, 0.1, 0.5].map((n) =>
        Math.fround(n)
      ),
      [-0.5, 0, 0.5, 0, -0.5, 0, 0.5, 0],
      [Math.round(yieldIconSize(2, 1) * 1000)],
    ]
  );
}

// The atlas: as square as it gets, each icon in a cell of its own with room round it, keeping its shape.
{
  const places = atlasPlaces(
    ['Food', 'Production', 'Trade', 'Luxuries', 'Science'],
    (name) =>
      name === 'Production'
        ? null
        : name === 'Trade'
        ? [16, 8]
        : name === 'Science'
        ? [8, 16]
        : [8, 8]
  );

  expect(
    'the atlas is as square as it gets, and each icon is drawn in its own cell, centred with room round it, keeping its shape; one without art is left out',
    [
      [1, 2, 3, 4, 5, 9, 10].map(atlasCells),
      places.map(({ _, x, y, width, height }) => [_, x, y, width, height]),
    ],
    [
      [
        [1, 1],
        [2, 1],
        [2, 2],
        [2, 2],
        [3, 2],
        [3, 3],
        [4, 3],
      ],
      [
        ['Food', 8, 8, 48, 48],
        ['Trade', 136, 20, 48, 24],
        ['Luxuries', 8, 72, 48, 48],
        ['Science', 84, 72, 24, 48],
      ],
    ]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL yields3d (${failures.length} of ${checks} checks)\n  ${failures.join(
      '\n  '
    )}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS yields3d (${checks} checks)\n`);
