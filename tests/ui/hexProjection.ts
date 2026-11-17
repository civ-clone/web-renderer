// The hexagonal grid's projection (#94): every pixel is in exactly one hex, the one whose outline it is inside; each
//  hex's middle is its own; the engine's neighbours are where the pixels say they are, across both seams; the world
//  repeats a period along; the tiles reaching a rectangle are all in its span; and the factory refuses geometry it
//  can't draw. And the overview's bricks line up under the map's hexes.

import './lib/grids';
import HexMinimap from '@civ-clone/ui-map-hex/Minimap';
import HexOddRTopology from '@civ-clone/core-world/HexOddRTopology';
import HexProjection from '@civ-clone/ui-map-hex/HexProjection';
import { overviewCell } from '@civ-clone/ui-map-hex/Overview';
import { hexProjection } from '@civ-clone/ui-map-hex';
import civ1Json from '@civ-clone/ui-tileset-civ1/civ1.json';
import validateDescriptor from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

const failures: string[] = [];
let checks = 0,
  finished = false;

process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL hexProjection: stopped before the checks ran\n');
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

// One check for a whole sweep, naming the first few places it failed.
const sweep = (description: string, misses: string[]) => {
  checks++;

  if (misses.length > 0) {
    failures.push(
      `${description}: ${misses.length} wrong, first ${misses
        .slice(0, 5)
        .join('; ')}`
    );
  }
};

const dimensions = (width: number, height: number) => ({
    width: () => width,
    height: () => height,
  }),
  // Tile sizes a hex tileset might be drawn at: a near-regular hex at three scales, a squat one, and the smallest.
  sizes: [number, number][] = [
    [32, 36],
    [64, 72],
    [16, 20],
    [24, 16],
    [2, 4],
  ],
  worlds: [number, number][] = [
    [1, 2],
    [5, 4],
    [8, 6],
  ];

// Whether a point, as fractions of the box, is inside or on a convex polygon's edge.
const inside = (
  outline: readonly (readonly [number, number])[],
  fx: number,
  fy: number
): boolean => {
  let sign = 0;

  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i],
      [bx, by] = outline[(i + 1) % outline.length],
      cross = (bx - ax) * (fy - ay) - (by - ay) * (fx - ax);

    if (cross === 0) {
      continue;
    }

    if (sign === 0) {
      sign = Math.sign(cross);
    } else if (Math.sign(cross) !== sign) {
      return false;
    }
  }

  return true;
};

sizes.forEach(([width, height]) =>
  worlds.forEach(([columns, rows]) => {
    const projection = new HexProjection(
        { width, height },
        dimensions(columns, rows)
      ),
      outline = projection.outline(),
      { x: periodX, y: periodY } = projection.wrapPeriod(),
      label = `${width}×${height} on ${columns}×${rows}`,
      outside: string[] = [],
      middles: string[] = [];

    // A period and a tile more each way, so the seams and the negative side are in it.
    for (let py = -height; py < periodY! + height; py++) {
      for (let px = -width; px < periodX + width; px++) {
        const [x, y] = projection.pixelToTile(px, py),
          [left, top] = projection.tileToPixel(x, y);

        if (
          !inside(outline, (px + 0.5 - left) / width, (py + 0.5 - top) / height)
        ) {
          outside.push(`${px},${py} → ${x},${y}`);
        }
      }
    }

    sweep(`${label}: every pixel is inside the hex it is given`, outside);

    for (let y = -2; y < rows + 2; y++) {
      for (let x = -2; x < columns + 2; x++) {
        const [left, top] = projection.tileToPixel(x, y),
          [backX, backY] = projection.pixelToTile(
            left + Math.trunc(width / 2),
            top + Math.trunc(height / 2)
          );

        if (backX !== x || backY !== y) {
          middles.push(`${x},${y} → ${backX},${backY}`);
        }
      }
    }

    sweep(`${label}: each hex's middle is its own`, middles);

    expect(
      `${label}: the world is half a hex wider than its columns, and a quarter hex taller than its rows' steps`,
      [projection.worldSize(), projection.wrapPeriod(), projection.tileStep()],
      [
        {
          width: columns * width + width / 2,
          height: (rows * 3 * height) / 4 + height / 4,
        },
        { x: columns * width, y: (rows * 3 * height) / 4 },
        { x: width, y: (3 * height) / 4 },
      ]
    );

    const repeats: string[] = [];

    for (let y = -1; y <= rows; y++) {
      for (let x = -1; x <= columns; x++) {
        const [px, py] = projection.tileToPixel(x, y),
          [alongX, alongY] = projection.tileToPixel(x + columns, y),
          [downX, downY] = projection.tileToPixel(x, y + rows);

        if (
          alongX - px !== periodX ||
          alongY !== py ||
          downX !== px ||
          downY - py !== periodY
        ) {
          repeats.push(`${x},${y}`);
        }
      }
    }

    sweep(`${label}: a world along, or down, is a period along`, repeats);
  })
);

// The engine's neighbours are the hexes the pixels say: a step from a hex's middle, in each direction, lands in the
//  neighbour's hex, which, wrapped, is the one the topology names, across the seams as well.
{
  const [width, height] = [32, 36],
    [columns, rows] = [6, 4],
    projection = new HexProjection(
      { width, height },
      dimensions(columns, rows)
    ),
    topology = new HexOddRTopology(columns, rows),
    rowStep = (3 * height) / 4,
    steps: { [direction: string]: [number, number] } = {
      e: [width, 0],
      w: [-width, 0],
      ne: [width / 2, -rowStep],
      nw: [-width / 2, -rowStep],
      se: [width / 2, rowStep],
      sw: [-width / 2, rowStep],
    },
    wrap = (value: number, size: number) => ((value % size) + size) % size,
    misses: string[] = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const [left, top] = projection.tileToPixel(x, y);

      topology.directions().forEach((direction) => {
        const [dx, dy] = steps[direction],
          [nx, ny] = projection.pixelToTile(
            left + width / 2 + dx,
            top + height / 2 + dy
          ),
          neighbour = topology.neighbour(x, y, direction);

        if (
          neighbour === null ||
          neighbour[0] !== wrap(nx, columns) ||
          neighbour[1] !== wrap(ny, rows)
        ) {
          misses.push(
            `${x},${y} ${direction}: pixels say ${wrap(nx, columns)},${wrap(
              ny,
              rows
            )}, the topology ${neighbour}`
          );
        }
      });
    }
  }

  sweep(
    "a step in each of the engine's six directions lands on its neighbour",
    misses
  );
}

// Every tile whose box reaches a rectangle, grown by the overhang, is in the span the projection gives for it.
{
  const projection = new HexProjection(
      { width: 32, height: 36 },
      dimensions(8, 6)
    ),
    misses: string[] = [];

  for (let rectY = -40; rectY < 120; rectY += 7) {
    for (let rectX = -40; rectX < 120; rectX += 11) {
      const rect = { x: rectX, y: rectY, width: 45, height: 30 },
        overhang = rectX % 2 === 0 ? 0 : 9,
        {
          columns: [firstColumn, lastColumn],
          rows: [firstRow, lastRow],
        } = projection.tileSpan(rect, overhang);

      for (let y = -4; y < 12; y++) {
        for (let x = -4; x < 12; x++) {
          const [left, top] = projection.tileToPixel(x, y),
            reaches =
              left < rect.x + rect.width + overhang &&
              left + 32 > rect.x - overhang &&
              top < rect.y + rect.height + overhang &&
              top + 36 > rect.y - overhang,
            within =
              x >= firstColumn &&
              x < lastColumn &&
              y >= firstRow &&
              y < lastRow;

          if (reaches && !within) {
            misses.push(
              `${x},${y} reaches ${JSON.stringify(rect)}+${overhang}`
            );
          }
        }
      }
    }
  }

  sweep('every tile reaching a rectangle is in its span', misses);
}

// The factory draws hex geometry at a size that keeps the hex's shape in whole pixels, and refuses anything else.
{
  const hex = (tile: [number, number], geometry: [number, number, number]) =>
      validateDescriptor({
        ...JSON.parse(JSON.stringify(civ1Json)),
        id: 'hex-test',
        grid: 'hex-odd-r',
        tile: { width: tile[0], height: tile[1] },
        geometry: {
          columnStep: geometry[0],
          rowStep: geometry[1],
          oddRowShift: geometry[2],
          anchor: { x: 0, y: -4 },
          overhang: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      }),
    thrown = (fn: () => unknown): string | null => {
      try {
        fn();

        return null;
      } catch (error) {
        return (error as Error).message;
      }
    },
    world = dimensions(6, 4),
    good = hex([32, 36], [32, 27, 16]),
    drawn = hexProjection(good, world, { width: 64, height: 72 }, true);

  expect(
    'a 32 × 36 hex tileset drawn at twice its size',
    [drawn.footprint(), drawn.tileStep(), drawn.reach()],
    [
      { width: 64, height: 72 },
      { x: 64, y: 54 },
      { top: 8, right: 0, bottom: 0, left: 0 },
    ]
  );

  expect(
    "hex geometry that isn't a hex's, a shape that isn't the tileset's, and sizes off the whole pixels are refused",
    [
      thrown(() =>
        hexProjection(
          hex([32, 36], [32, 36, 16]),
          world,
          { width: 32, height: 36 },
          true
        )
      ),
      thrown(() => hexProjection(good, world, { width: 32, height: 32 }, true)),
      thrown(() => hexProjection(good, world, { width: 16, height: 18 }, true)),
    ],
    [
      'Tileset "hex-test": a hexagonal grid\'s tiles are as far apart as they are wide, in rows three quarters of a tile apart with odd rows half a tile across, not 32 × 36 tiles 32 × 36 apart with odd rows 16 across.',
      'Tileset "hex-test": a hexagonal tile is drawn in its own 32 × 36 shape, not 32 × 32.',
      'Tileset "hex-test": a hexagonal tile is drawn an even number of px across and a multiple of 4 px down, not 16 × 18.',
    ]
  );
}

// The overview's bricks are whole pixels, three quarters as tall as wide, and the minimap's box lines up with them: a
//  hex's middle on the map lands on its brick's middle on the overview.
{
  expect(
    'overview bricks are a multiple of 4 px across and three quarters as tall',
    [1, 10, 47, 74, 400].map((width) => overviewCell(width)),
    [
      { width: 188, height: 141 },
      { width: 16, height: 12 },
      { width: 4, height: 3 },
      { width: 4, height: 3 },
      { width: 4, height: 3 },
    ]
  );

  class Probe extends HexMinimap {
    offset(rowHeight: number): number {
      return this.brickOffset(rowHeight);
    }
  }

  const offset = Probe.prototype.offset.call(
      Object.create(Probe.prototype),
      12
    ),
    // A 32 × 36 hex: rows 27 px apart on the map, 12 on the overview.
    misses: string[] = [];

  for (let row = 0; row < 6; row++) {
    const middle = row * 27 + 18,
      onOverview = middle * (12 / 27) - offset,
      brickMiddle = row * 12 + 6;

    if (Math.abs(onOverview - brickMiddle) > 1e-9) {
      misses.push(`row ${row}: ${onOverview} not ${brickMiddle}`);
    }
  }

  sweep("a hex's middle lands on its brick's middle", misses);
}

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL hexProjection\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS hexProjection (${checks} checks)`);
