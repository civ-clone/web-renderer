// The land's surfaces (docs/3d-renderer.md §4.3): the detail made for each, and how much of each the land's mesh says
//  the ground is at its points.
//  - Each surface's texture is the same every time it's made, tiles seamlessly, and is its own.
//  - It lightens and darkens the land's colour by 1 on average, and tilts it nowhere on average.
//  - Its repeat fits the world's period exactly, across and down, so the world's copies have the same detail.
//  - A chunk's points carry the relief's surfaces, as bytes.

import topologyFor from '@civ-clone/ui-client/lib/topologyFor';
import groundLayoutFor from '@civ-clone/ui-map-3d/layouts';
import createRelief from '@civ-clone/ui-map-3d/terrain/relief';
import { buildChunk, chunkGrid } from '@civ-clone/ui-map-3d/terrain/chunks';
import surfaceTextures, {
  SURFACE_SIZE,
  SURFACE_TILE,
} from '@civ-clone/ui-map-3d/terrain/surfaces';
import { surfaceTile } from '@civ-clone/ui-map-3d/landMaterial';
import { SURFACES } from '@civ-clone/ui-models-builtin/terrain';

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

// Small, so the suite's quick: the recipes scale with the size, their bumps as steep.
const size = 64,
  made = surfaceTextures(size),
  again = surfaceTextures(size),
  // A texel's channel, in layer `layer`, round the texture's edges.
  texel = (layer: number, x: number, y: number, channel: number): number =>
    made[
      layer * size * size * 4 +
        (((y + size) % size) * size + ((x + size) % size)) * 4 +
        channel
    ] ?? 0;

expect(
  'every surface has a texture, a layer each, four bytes a texel, the same every time it’s made',
  [
    made.length === size * size * 4 * SURFACES.length,
    made.every((value, at) => value === again[at]),
    surfaceTextures().length ===
      SURFACE_SIZE * SURFACE_SIZE * 4 * SURFACES.length,
  ],
  [true, true, true]
);

// Tiling: the steps from the last column to the first, and the last row to the first, are on average no bigger than
//  the steps within, in every channel of every layer. A texture that didn't tile would step there as far as any two
//  texels apart do.
const seams: string[] = [];

SURFACES.forEach((surface, layer) => {
  [0, 1, 2, 3].forEach((channel) => {
    let within = 0,
      across = 0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const right = Math.abs(
            texel(layer, x + 1, y, channel) - texel(layer, x, y, channel)
          ),
          below = Math.abs(
            texel(layer, x, y + 1, channel) - texel(layer, x, y, channel)
          );

        if (x === size - 1) {
          across += right;
        } else {
          within += right;
        }

        if (y === size - 1) {
          across += below;
        } else {
          within += below;
        }
      }
    }

    const acrossMean = across / (size * 2),
      withinMean = within / (size * (size - 1) * 2);

    if (acrossMean > withinMean * 1.5 + 0.5) {
      seams.push(
        `${surface} channel ${channel}: ${acrossMean.toFixed(
          1
        )} > ${withinMean.toFixed(1)}`
      );
    }
  });
});

expect(
  'each surface’s texture tiles: its steps from one edge to the other are, on average, as small as those within it',
  seams,
  []
);

// Exactly: made starting further along, the texture is the same, rolled round by as far: every texel within a byte
//  of its own, as only rounding differs.
{
  const [shiftX, shiftY] = [5, 11],
    shifted = surfaceTextures(size, [shiftX, shiftY]),
    off: string[] = [];

  SURFACES.forEach((surface, layer) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        [0, 1, 2, 3].forEach((channel) => {
          const there =
            shifted[layer * size * size * 4 + (y * size + x) * 4 + channel] ??
            0;

          if (
            Math.abs(there - texel(layer, x + shiftX, y + shiftY, channel)) > 1
          ) {
            off.push(`${surface} ${x},${y} channel ${channel}`);
          }
        });
      }
    }
  });

  expect(
    'each surface’s texture made starting further along is the same, rolled round: it repeats exactly',
    off.slice(0, 3),
    []
  );
}

// On average: the colour as it is (a scale of 1, 127.5), and no tilt (127.5); and each layer its own.
const averages = SURFACES.map((_, layer) =>
  [0, 1, 2].map((channel) => {
    let total = 0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        total += texel(layer, x, y, channel);
      }
    }

    return total / (size * size);
  })
);

expect(
  'each surface lightens and darkens the colour by 1 on average, tilts it nowhere on average, and is its own',
  [
    averages
      .map(([shade], layer) => [SURFACES[layer], shade])
      .filter(([, shade]) => Math.abs((shade as number) - 127.5) > 8),
    averages
      .map(([, across, down], layer) => [SURFACES[layer], across, down])
      .filter(
        ([, across, down]) =>
          Math.abs((across as number) - 127.5) > 3 ||
          Math.abs((down as number) - 127.5) > 3
      ),
    SURFACES.every((_, a) =>
      SURFACES.every(
        (__, b) =>
          a === b ||
          made
            .subarray(a * size * size * 4, (a + 1) * size * size * 4)
            .some((value, at) => value !== made[b * size * size * 4 + at])
      )
    ),
  ],
  [[], [], true]
);

// How rough each surface is, on average: snow and mud shinier, rock a little. And their bumps as steep made small as
//  made at the usual size: the spread of each surface's tilt within two fifths of the usual's. Not closer, as the
//  finest bumps (grass's, a couple of texels across made small) are too fine to measure alike; unscaled, they'd be
//  twice as steep.
{
  const shipped = surfaceTextures(),
    spread = (data: Uint8Array, side: number, layer: number): number => {
      let total = 0,
        squares = 0;

      for (let at = 0; at < side * side; at++) {
        const value = data[layer * side * side * 4 + at * 4 + 1] ?? 0;

        total += value;
        squares += value * value;
      }

      const mean = total / (side * side);

      return Math.sqrt(squares / (side * side) - mean * mean);
    },
    rough = SURFACES.map((_, layer) => {
      let total = 0;

      for (let at = 0; at < SURFACE_SIZE * SURFACE_SIZE; at++) {
        total +=
          shipped[layer * SURFACE_SIZE * SURFACE_SIZE * 4 + at * 4 + 3] ?? 0;
      }

      return (
        Math.round((total / (SURFACE_SIZE * SURFACE_SIZE) / 255) * 100) / 100
      );
    });

  expect(
    'each surface is as rough as it should be, on average; and its bumps are as steep made small as at the usual size',
    [
      rough,
      SURFACES.filter((_, layer) => {
        const small = spread(made, size, layer),
          usual = spread(shipped, SURFACE_SIZE, layer);

        return Math.abs(small - usual) > usual * 0.4;
      }),
    ],
    [[0.9, 0.92, 0.88, 0.75, 0.55, 0.9, 0.65, 0.9], []]
  );
}

// Its repeat fits the period: a whole number of times across, and down where the world wraps over the poles; about
//  `SURFACE_TILE`.
expect(
  'the surfaces’ repeat fits the world’s period a whole number of times, across and down, about as often as asked',
  [
    { u: 80, v: 50 },
    { u: 80 * Math.SQRT2, v: 25 * Math.SQRT2 },
    { u: 61, v: null },
  ].map((period) => {
    const [tileU, tileV] = surfaceTile(period),
      whole = (value: number): boolean =>
        Math.abs(value - Math.round(value)) < 1e-9;

    return [
      whole(period.u / tileU),
      period.v === null ? tileV === SURFACE_TILE : whole(period.v / tileV),
      Math.abs(tileU - SURFACE_TILE) < SURFACE_TILE * 0.05 &&
        Math.abs(tileV - SURFACE_TILE) < SURFACE_TILE * 0.05,
    ];
  }),
  [
    [true, true, true],
    [true, true, true],
    [true, true, true],
  ]
);

// A chunk's points carry the relief's surfaces, as bytes from 0 to 255, the first four, then the rest.
{
  const width = 12,
    height = 10,
    terrains = ['Grassland', 'Mountains', 'Ocean', 'Desert', 'Forest', 'Swamp'],
    topology = topologyFor({ width, height, topologyId: 'square' }),
    layout = groundLayoutFor({
      width,
      height,
      topologyId: 'square',
      wrapsY: topology.wrapsY(),
    }),
    relief = createRelief({
      layout,
      source: {
        width,
        height,
        wrapsY: topology.wrapsY(),
        terrainAt: (x, y) => terrains[(x * 3 + y * 5) % terrains.length]!,
        waterAt: (x, y) =>
          terrains[(x * 3 + y * 5) % terrains.length] === 'Ocean',
        neighbours: (x, y) =>
          topology
            .directions()
            .map((direction) => topology.neighbour(x, y, direction))
            .filter((square): square is [number, number] => square !== null),
      },
    }),
    grid = chunkGrid(layout, height, { size: 6, perUnit: 4 }),
    chunk = buildChunk(grid, relief, 0, 0),
    wrong: string[] = [];

  for (let b = 0; b <= grid.stepsV; b++) {
    for (let a = 0; a <= grid.stepsU; a++) {
      const point = b * (grid.stepsU + 1) + a,
        { surfaces } = relief.sample(
          chunk.u + a * grid.spacingU,
          chunk.v + b * grid.spacingV
        ),
        carried = [
          ...chunk.surfacesA.subarray(point * 4, point * 4 + 4),
          ...chunk.surfacesB.subarray(point * 4, point * 4 + 4),
        ];

      if (
        carried.some(
          (value, at) => value !== Math.round((surfaces[at] ?? 0) * 255)
        )
      ) {
        wrong.push(`${a},${b}: ${carried.join(',')}`);
      }
    }
  }

  expect(
    'a chunk’s points carry the relief’s surfaces, as bytes',
    [SURFACES.length <= 8, wrong.slice(0, 3)],
    [true, []]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL surfaces: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS surfaces (${checks} checks)\n`);
