// Square tiles through the `Projection` the map layers and the portal use (#90): a tile's pixel maps back to the tile,
//  every pixel of its sprite box does, and a world's width (or height, over the poles) along is the same tile once the
//  caller wraps it. And what the layers ask of it to draw tiles that overlap (#91), which square tiles don't: no reach,
//  a draw order that is a total order, and the tiles reaching a rectangle are the ones the square sums always gave.

import {
  Placement,
  SquareProjection,
  tileBounds,
} from '../../src/js/UI/lib/projection';
import { tileRange, wrapIndices } from '../../src/js/UI/lib/viewport';
import civ1Json from '../../src/js/UI/tilesets/civ1.json';
import currentTileset from '../../src/js/UI/lib/tilesets';
import projectionFor from '../../src/js/UI/lib/projectionFor';
import validateDescriptor from '../../src/js/UI/tilesets/TilesetDescriptor';

const failures: string[] = [];
let checks = 0,
  finished = false;

process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL projection: stopped before the checks ran\n');
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

// One check for a whole sweep, naming the first few tiles it failed on.
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
});

const worlds: [number, number][] = [
    [1, 1],
    [5, 3],
    [8, 6],
    [13, 9],
    [40, 25],
    [80, 50],
  ],
  sizes = [1, 3, 16, 17, 32, 48];

worlds.forEach(([width, height]) =>
  sizes.forEach((size) =>
    [true, false].forEach((wrapVertical) => {
      const projection = new SquareProjection(
          size,
          dimensions(width, height),
          wrapVertical
        ),
        name = `${width}x${height} at ${size}px${
          wrapVertical ? '' : ', stopping at the poles'
        }`,
        period = projection.wrapPeriod(),
        roundTrip: string[] = [],
        inside: string[] = [],
        outside: string[] = [],
        seam: string[] = [],
        // Every pixel of every box is a lot of pixels on the big worlds; their corners and middles say as much there.
        everyPixel = width * height * size * size <= 200_000,
        offsets = everyPixel
          ? Array.from({ length: size }, (_, index) => index)
          : [...new Set([0, Math.floor(size / 2), size - 1])];

      expect(`${name}: the footprint`, projection.footprint(), {
        width: size,
        height: size,
      });
      expect(`${name}: the world`, projection.worldSize(), {
        width: width * size,
        height: height * size,
      });
      expect(`${name}: the wrap`, period, {
        x: width * size,
        y: wrapVertical ? height * size : null,
      });
      expect(
        `${name}: the tile past the last one starts where the world ends`,
        projection.tileToPixel(width, height),
        [width * size, height * size]
      );

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const [px, py] = projection.tileToPixel(x, y),
            tile = `${x},${y}`,
            at = (pixel: [number, number]) => pixel.join(',');

          if (at(projection.pixelToTile(px, py)) !== tile) {
            roundTrip.push(`${tile} -> ${at(projection.pixelToTile(px, py))}`);
          }

          offsets.forEach((dy) =>
            offsets.forEach((dx) => {
              const found = at(projection.pixelToTile(px + dx, py + dy));

              if (found !== tile) {
                inside.push(`${tile} +${dx},${dy} -> ${found}`);
              }
            })
          );

          // The pixels just outside the box belong to the neighbours.
          [
            [-1, 0, x - 1, y],
            [size, 0, x + 1, y],
            [0, -1, x, y - 1],
            [0, size, x, y + 1],
          ].forEach(([dx, dy, nx, ny]) => {
            const found = at(projection.pixelToTile(px + dx, py + dy));

            if (found !== `${nx},${ny}`) {
              outside.push(`${tile} ${dx},${dy} -> ${found}`);
            }
          });

          // A world along, either way, is a world's width of columns along: wrapping that is the caller's job.
          [1, -1].forEach((direction) => {
            const across = at(
              projection.pixelToTile(px + direction * period.x, py)
            );

            if (across !== `${x + direction * width},${y}`) {
              seam.push(`${tile} across ${direction} -> ${across}`);
            }

            if (period.y === null) {
              return;
            }

            const over = at(
              projection.pixelToTile(px, py + direction * period.y)
            );

            if (over !== `${x},${y + direction * height}`) {
              seam.push(`${tile} over ${direction} -> ${over}`);
            }
          });
        }
      }

      sweep(`${name}: every tile's pixel is the tile`, roundTrip);
      sweep(`${name}: every pixel of a tile's box is the tile`, inside);
      sweep(
        `${name}: the pixels around a tile's box are its neighbours`,
        outside
      );
      sweep(`${name}: a world along is the same tile, wrapped`, seam);
    })
  )
);

// The city screen's map is the five by five block around the city, sized from that block's bounds.
[1, 2, 3].forEach((scale) => {
  const size = 16 * scale,
    projection = new SquareProjection(size, dimensions(7, 7)),
    block: { x: number; y: number }[] = [];

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      block.push({ x: 3 + dx, y: 3 + dy });
    }
  }

  expect(
    `at scale ${scale} the city's block is five tiles across and down`,
    tileBounds(projection, block),
    { x: size, y: size, width: size * 5, height: size * 5 }
  );
});

expect(
  "one tile's bounds are its box",
  tileBounds(new SquareProjection(32, dimensions(10, 10)), [{ x: 4, y: 7 }]),
  { x: 128, y: 224, width: 32, height: 32 }
);

// What drawing tiles that overlap needs, which square tiles answer with nothing to do (#91).
worlds.forEach(([width, height]) =>
  sizes.forEach((size) => {
    const projection = new SquareProjection(size, dimensions(width, height)),
      name = `${width}x${height} at ${size}px`,
      spans: string[] = [];

    expect(
      `${name}: squares don't overlap their neighbours`,
      projection.overlapsNeighbours(),
      false
    );
    expect(`${name}: nothing reaches past its box`, projection.reach(), {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });

    // The tiles reaching a rectangle are the ones `tileRange` gave before there was a projection, in the same order,
    //  so the layers draw the same tiles in the same order on the square grid.
    [-3 * size - 1, -size, -1, 0, 1, size - 1, size, 5 * size + 3].forEach(
      (start) =>
        [0, 1, size, 3 * size + 2, width * size, 2 * width * size + 1].forEach(
          (length) =>
            [0, 1, size, 3 * size].forEach((overhang) => {
              const { columns, rows } = projection.tileSpan(
                  { x: start, y: start + 1, width: length, height: length },
                  overhang
                ),
                found = [
                  wrapIndices(...columns, width),
                  wrapIndices(...rows, height),
                ],
                wanted = [
                  tileRange(start, length, size, overhang, width),
                  tileRange(start + 1, length, size, overhang, height),
                ];

              if (JSON.stringify(found) !== JSON.stringify(wanted)) {
                spans.push(
                  `${start}+${length} over ${overhang}: ${JSON.stringify(
                    found
                  )}, not ${JSON.stringify(wanted)}`
                );
              }
            })
        )
    );

    sweep(`${name}: the tiles reaching a rectangle are tileRange's`, spans);

    // Every tile, and a copy of each a world along either way, as the seam draws them.
    const placements: Placement[] = [],
      order: string[] = [],
      sorted: string[] = [];

    for (let y = 0; y < Math.min(height, 8); y++) {
      for (let x = 0; x < Math.min(width, 8); x++) {
        const [px, py] = projection.tileToPixel(x, y);

        [-1, 0, 1].forEach((repeat) =>
          placements.push({
            x,
            y,
            px: px + repeat * width * size,
            py,
          })
        );
      }
    }

    const sign = (value: number): number => Math.sign(value) || 0;

    placements.forEach((a) =>
      placements.forEach((b) => {
        const ab = projection.compareDrawOrder(a, b),
          ba = projection.compareDrawOrder(b, a),
          same = a === b;

        if (sign(ab) !== -sign(ba) || (ab === 0) !== same) {
          order.push(`${JSON.stringify(a)} against ${JSON.stringify(b)}`);
        }
      })
    );

    const inOrder = [...placements].sort((a, b) =>
      projection.compareDrawOrder(a, b)
    );

    inOrder.forEach((a, index) =>
      inOrder.slice(index + 1).forEach((b) => {
        if (
          projection.compareDrawOrder(a, b) > 0 ||
          b.py < a.py ||
          (b.py === a.py && b.px <= a.px)
        ) {
          sorted.push(`${JSON.stringify(a)} before ${JSON.stringify(b)}`);
        }
      })
    );

    sweep(
      `${name}: the draw order puts any two places one way round, and only the same place level`,
      order
    );
    sweep(
      `${name}: in draw order, a place is above, or level and left of, every one after it`,
      sorted
    );
  })
);

expect('wrapping across the seam', wrapIndices(-2, 2, 40), [38, 39, 0, 1]);
expect(
  'a world or more is every tile once',
  wrapIndices(-3, 5, 8),
  [0, 1, 2, 3, 4, 5, 6, 7]
);
expect('no tiles', wrapIndices(3, 3, 8), []);

// The map's projection comes from the tileset (#92): Civ1's square grid gives the squares the map always had, the same
//  at every tile of every world, at every scale, wrapping or not.
const civ1 = currentTileset();

worlds.forEach(([width, height]) =>
  [16, 32, 48, 64, 17].forEach((tileSize) =>
    [true, false].forEach((wrapVertical) => {
      const world = dimensions(width, height),
        fromTileset = projectionFor(civ1, world, tileSize, wrapVertical),
        byHand = new SquareProjection(tileSize, world, wrapVertical),
        name = `Civ1 on ${width}x${height} at ${tileSize}px${
          wrapVertical ? '' : ', stopping at the poles'
        }`,
        misses: string[] = [];

      expect(
        `${name}: the same whole-world answers as squares made by hand`,
        [
          fromTileset instanceof SquareProjection,
          fromTileset.footprint(),
          fromTileset.worldSize(),
          fromTileset.wrapPeriod(),
          fromTileset.overlapsNeighbours(),
          fromTileset.reach(),
        ],
        [
          true,
          byHand.footprint(),
          byHand.worldSize(),
          byHand.wrapPeriod(),
          byHand.overlapsNeighbours(),
          byHand.reach(),
        ]
      );

      for (let y = -1; y <= height; y++) {
        for (let x = -1; x <= width; x++) {
          const [px, py] = byHand.tileToPixel(x, y),
            pixels: [number, number][] = [
              [px, py],
              [px + tileSize - 1, py + tileSize - 1],
              [px + Math.floor(tileSize / 2), py - 1],
            ],
            found = [
              fromTileset.tileToPixel(x, y),
              ...pixels.map(([pixelX, pixelY]) =>
                fromTileset.pixelToTile(pixelX, pixelY)
              ),
              fromTileset.tileSpan(
                { x: px, y: py, width: tileSize * 2 + 1, height: 1 },
                tileSize
              ),
            ],
            wanted = [
              [px, py],
              ...pixels.map(([pixelX, pixelY]) =>
                byHand.pixelToTile(pixelX, pixelY)
              ),
              byHand.tileSpan(
                { x: px, y: py, width: tileSize * 2 + 1, height: 1 },
                tileSize
              ),
            ];

          if (JSON.stringify(found) !== JSON.stringify(wanted)) {
            misses.push(
              `${x},${y}: ${JSON.stringify(found)}, not ${JSON.stringify(
                wanted
              )}`
            );
          }
        }
      }

      sweep(`${name}: every tile and its pixels are where they were`, misses);
    })
  )
);

// A tileset's own tile size: a 32px square tileset drawn 32px across is the squares Civ1 gives at 2×.
const tilesetWith = (changes: { [key: string]: unknown }) =>
    validateDescriptor({
      ...JSON.parse(JSON.stringify(civ1Json)),
      ...changes,
    }),
  thrown = (fn: () => unknown): string | null => {
    try {
      fn();

      return null;
    } catch (error) {
      return (error as Error).message;
    }
  },
  stub32 = tilesetWith({
    id: 'stub-32',
    tile: { width: 32, height: 32 },
    geometry: { ...civ1.geometry, columnStep: 32, rowStep: 32 },
  }),
  world = dimensions(13, 9),
  answers = (projection: ReturnType<typeof projectionFor>) => [
    projection.footprint(),
    projection.worldSize(),
    projection.wrapPeriod(),
    projection.tileToPixel(5, 7),
    projection.pixelToTile(170, 230),
  ];

expect(
  'a 32px tileset at 32px is the same squares as Civ1 at 32px',
  answers(projectionFor(stub32, world, 32)),
  answers(projectionFor(civ1, world, 32))
);

// A tileset the map can't draw yet is refused, saying why, rather than drawn wrong.
expect(
  'there is no projection for isometric or hex grids yet',
  (['staggered-iso', 'hex-odd-r'] as const).map((grid) =>
    thrown(() => projectionFor(tilesetWith({ id: grid, grid }), world, 32))
  ),
  [
    'Tileset "staggered-iso": there is no projection for the staggered-iso grid yet (#94/#97).',
    'Tileset "hex-odd-r": there is no projection for the hex-odd-r grid yet (#94/#97).',
  ]
);

const squareGeometry = (
  geometry: { [key: string]: unknown },
  tile = { width: 16, height: 16 }
) =>
  thrown(() =>
    projectionFor(
      tilesetWith({
        id: 'odd',
        tile,
        geometry: { ...civ1.geometry, ...geometry },
      }),
      world,
      32
    )
  );

expect(
  "a square grid's tiles are as far apart as they are big, and no row is shifted",
  [
    squareGeometry({ oddRowShift: 8 }),
    squareGeometry({ rowStep: 12 }),
    squareGeometry({ columnStep: 24 }),
    squareGeometry({ columnStep: 24, rowStep: 16 }, { width: 24, height: 16 }),
  ],
  [
    'Tileset "odd": a square grid\'s tiles are as far apart as they are wide and tall, and no row is shifted, not 16 × 16 tiles 16 × 16 apart with odd rows 8 across.',
    'Tileset "odd": a square grid\'s tiles are as far apart as they are wide and tall, and no row is shifted, not 16 × 16 tiles 16 × 12 apart with odd rows 0 across.',
    'Tileset "odd": a square grid\'s tiles are as far apart as they are wide and tall, and no row is shifted, not 16 × 16 tiles 24 × 16 apart with odd rows 0 across.',
    'Tileset "odd": a square grid\'s tiles are as far apart as they are wide and tall, and no row is shifted, not 24 × 16 tiles 24 × 16 apart with odd rows 0 across.',
  ]
);

const noSpill =
  'Tileset "odd": a square grid\'s sprites sit in their own tile, with no anchor or overhang, for now.';

expect(
  "a square grid's sprites stay in their tile",
  [
    squareGeometry({ anchor: { x: 0, y: 2 } }),
    squareGeometry({ overhang: { top: 16, right: 0, bottom: 0, left: 0 } }),
    squareGeometry({ overhang: { top: 0, right: 0, bottom: 0, left: 1 } }),
  ],
  [noSpill, noSpill, noSpill]
);

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL projection\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS projection (${checks} checks)`);
