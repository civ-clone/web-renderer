// Square tiles through the `Projection` the map layers and the portal use (#90): a tile's pixel maps back to the tile,
//  every pixel of its sprite box does, and a world's width (or height, over the poles) along is the same tile once the
//  caller wraps it. And what the layers ask of it to draw tiles that overlap (#91), which square tiles don't: no reach,
//  a draw order that is a total order, and the tiles reaching a rectangle are the ones the square sums always gave.
//  And the same of the staggered isometric grid's diamonds (#97), whose boxes do overlap.

import './lib/grids';
import { Placement, tileBounds } from '@civ-clone/ui-map/lib/projection';
import { Map as MapLayer } from '@civ-clone/ui-map/components/Map';
import IsoMinimap from '@civ-clone/ui-map-isometric/Minimap';
import IsoOverview from '@civ-clone/ui-map-isometric/Overview';
import IsoProjection from '@civ-clone/ui-map-isometric/IsoProjection';
import StaggeredIsoTopology from '@civ-clone/core-world/StaggeredIsoTopology';
import Minimap from '@civ-clone/ui-map-square/Minimap';
import Overview from '@civ-clone/ui-map-square/Overview';
import SquareProjection from '@civ-clone/ui-map-square/SquareProjection';
import { tileRange, wrapIndices } from '@civ-clone/ui-map/lib/viewport';
import civ1Json from '@civ-clone/ui-assets/tilesets/civ1.json';
import currentTileset from '@civ-clone/ui-assets/lib/tilesets';
import projectionFor, {
  GridOverview,
  drawableGrids,
  overviewFor,
  registerGrid,
} from '@civ-clone/ui-map/lib/projectionFor';
import validateDescriptor from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

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
        fromTileset = projectionFor(
          civ1,
          world,
          { width: tileSize, height: tileSize },
          wrapVertical
        ),
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
  answers(projectionFor(stub32, world, { width: 32, height: 32 })),
  answers(projectionFor(civ1, world, { width: 32, height: 32 }))
);

// A tileset the map can't draw is refused, saying why, rather than drawn wrong: there is no hex projection yet, and
//  the isometric one (#97) refuses Civ1's square steps.
expect(
  'there is no projection for hex grids yet, and an isometric tileset needs isometric steps',
  (['staggered-iso', 'hex-odd-r'] as const).map((grid) =>
    thrown(() =>
      projectionFor(tilesetWith({ id: grid, grid }), world, {
        width: 32,
        height: 32,
      })
    )
  ),
  [
    'Tileset "staggered-iso": a staggered isometric grid\'s tiles are as far apart as they are wide, in rows half a tile apart with odd rows half a tile across, not 16 × 16 tiles 16 × 16 apart with odd rows 0 across.',
    'Tileset "hex-odd-r": no projection is loaded for the hex-odd-r grid (hex comes with #94).',
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
      { width: 32, height: 32 }
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

// --- The staggered isometric grid (#97) -----------------------------------------------------------------------------
//
// Diamonds in rows half a tile apart, every odd row shifted half a tile across. Each tile's box is the diamond's
//  bounding box, and its four corner triangles are the four edge neighbours'. Checked against the diamond itself, as
//  an inequality on each pixel's centre, rather than against the projection's own sums: every pixel in a diamond maps
//  back to its tile, every pixel of the box outside it to the neighbour on that side, and every pixel is in exactly one
//  diamond. On rows above row 0, across the seam either way, and over the poles where the world wraps there.

// The four edge neighbours, as the engine's `StaggeredIsoTopology` steps to them, not wrapped, for rows of either
//  parity, above the world included.
const isoTopology = new StaggeredIsoTopology(2, 2),
  isoNeighbour = (
    x: number,
    y: number,
    direction: 'ne' | 'se' | 'sw' | 'nw'
  ): string => {
    const [dx, dy] = isoTopology.offset(direction, x, y);

    return `${x + dx},${y + dy}`;
  };

// How far a pixel's centre is from the diamond at `left`, `top` (its box's corner), in half diagonals: under 1 inside.
const diamondDistance = (
  px: number,
  py: number,
  left: number,
  top: number,
  width: number,
  height: number
): number =>
  Math.abs(px + 0.5 - (left + width / 2)) / (width / 2) +
  Math.abs(py + 0.5 - (top + height / 2)) / (height / 2);

const isoSizes: [number, number][] = [
    [4, 2],
    [8, 4],
    [16, 8],
    [64, 32],
    [128, 64],
  ],
  isoWorlds: [number, number][] = [
    [1, 2],
    [5, 4],
    [8, 6],
    [6, 7],
    [13, 9],
  ];

isoSizes.forEach(([tileWidth, tileHeight]) =>
  isoWorlds
    // Every pixel of a 128px tile over the bigger worlds is millions of pixels; the small worlds say as much.
    .filter(([width, height]) => tileWidth < 128 || width * height <= 20)
    .forEach(([width, height]) =>
      [true, false].forEach((wrapVertical) => {
        const projection = new IsoProjection(
            { width: tileWidth, height: tileHeight },
            dimensions(width, height),
            wrapVertical
          ),
          name = `isometric ${width}x${height} at ${tileWidth}x${tileHeight}px${
            wrapVertical ? '' : ', stopping at the poles'
          }`,
          period = projection.wrapPeriod(),
          rowStep = tileHeight / 2,
          at = (pixel: [number, number]) => pixel.join(','),
          placed: string[] = [],
          inDiamond: string[] = [],
          corners: string[] = [],
          once: string[] = [],
          seam: string[] = [];

        expect(
          `${name}: the footprint is the diamond's box`,
          projection.footprint(),
          {
            width: tileWidth,
            height: tileHeight,
          }
        );
        expect(
          `${name}: the world is its columns and half a tile across, and its rows and half a row down`,
          projection.worldSize(),
          {
            width: width * tileWidth + tileWidth / 2,
            height: height * rowStep + rowStep,
          }
        );
        expect(
          `${name}: it wraps a world across, and a world of rows down only on an even number of rows`,
          period,
          {
            x: width * tileWidth,
            y: wrapVertical && height % 2 === 0 ? height * rowStep : null,
          }
        );
        expect(
          `${name}: its diamonds overlap, and reach no further than their boxes`,
          [projection.overlapsNeighbours(), projection.reach()],
          [true, { top: 0, right: 0, bottom: 0, left: 0 }]
        );

        // Two rows above the world and below it, and a column either side, so negative rows and columns are covered.
        for (let y = -2; y < height + 2; y++) {
          for (let x = -1; x <= width; x++) {
            const [left, top] = projection.tileToPixel(x, y),
              tile = `${x},${y}`;

            if (
              left !== x * tileWidth + (y & 1) * (tileWidth / 2) ||
              top !== y * rowStep
            ) {
              placed.push(`${tile} at ${left},${top}`);
            }

            for (let dy = 0; dy < tileHeight; dy++) {
              for (let dx = 0; dx < tileWidth; dx++) {
                const px = left + dx,
                  py = top + dy,
                  found = at(projection.pixelToTile(px, py)),
                  distance = diamondDistance(
                    px,
                    py,
                    left,
                    top,
                    tileWidth,
                    tileHeight
                  );

                if (distance < 1) {
                  if (found !== tile) {
                    inDiamond.push(`${tile} +${dx},${dy} -> ${found}`);
                  }
                } else {
                  // A corner triangle: the neighbour on that side.
                  const side = `${dy < tileHeight / 2 ? 'n' : 's'}${
                      dx < tileWidth / 2 ? 'w' : 'e'
                    }` as 'ne' | 'se' | 'sw' | 'nw',
                    wanted = isoNeighbour(x, y, side);

                  if (found !== wanted) {
                    corners.push(
                      `${tile} +${dx},${dy} (${side}) -> ${found}, not ${wanted}`
                    );
                  }
                }

                // In exactly one diamond: its own, or one of the four whose boxes overlap this one's.
                const containing = [
                  [x, y],
                  ...(['ne', 'se', 'sw', 'nw'] as const).map((direction) =>
                    isoNeighbour(x, y, direction).split(',').map(Number)
                  ),
                  [x, y - 2],
                  [x, y + 2],
                  [x - 1, y],
                  [x + 1, y],
                ].filter(([cx, cy]) => {
                  const [cLeft, cTop] = projection.tileToPixel(cx!, cy!);

                  return (
                    diamondDistance(
                      px,
                      py,
                      cLeft,
                      cTop,
                      tileWidth,
                      tileHeight
                    ) < 1
                  );
                });

                if (containing.length !== 1) {
                  once.push(
                    `${tile} +${dx},${dy} is in ${containing.length} diamonds`
                  );
                }

                // A world along is the same diamond, a world's columns (or rows) along; wrapping it is the caller's.
                if (dx === Math.floor(tileWidth / 2) || dy === rowStep) {
                  const [fx, fy] = projection.pixelToTile(px, py);

                  [1, -1].forEach((direction) => {
                    const across = at(
                      projection.pixelToTile(px + direction * period.x, py)
                    );

                    if (across !== `${fx + direction * width},${fy}`) {
                      seam.push(
                        `${tile} +${dx},${dy} across ${direction} -> ${across}`
                      );
                    }

                    if (period.y === null) {
                      return;
                    }

                    const over = at(
                      projection.pixelToTile(px, py + direction * period.y)
                    );

                    if (over !== `${fx},${fy + direction * height}`) {
                      seam.push(
                        `${tile} +${dx},${dy} over ${direction} -> ${over}`
                      );
                    }
                  });
                }
              }
            }
          }
        }

        sweep(`${name}: every tile's box is where the stagger puts it`, placed);
        sweep(`${name}: every pixel of a diamond is its tile`, inDiamond);
        sweep(
          `${name}: every pixel of a box's corner triangles is the neighbour on that side`,
          corners
        );
        sweep(`${name}: every pixel is in exactly one diamond`, once);
        sweep(`${name}: a world along is the same tile, a world along`, seam);
      })
    )
);

// The tiles reaching a rectangle: none whose box, grown by the overhang, meets it is left out, at any offset, across
//  the seam and above the world.
[
  [4, 2],
  [16, 8],
  [64, 32],
].forEach(([tileWidth, tileHeight]) => {
  const projection = new IsoProjection(
      { width: tileWidth!, height: tileHeight! },
      dimensions(9, 8)
    ),
    name = `isometric at ${tileWidth}x${tileHeight}px`,
    missed: string[] = [];

  [
    -3 * tileWidth! - 1,
    -tileWidth!,
    -1,
    0,
    1,
    tileWidth! / 2 + 1,
    5 * tileWidth! + 3,
  ].forEach((start) =>
    [0, 1, tileHeight! / 2, tileWidth!, 3 * tileWidth! + 2].forEach((length) =>
      [0, 1, tileHeight!, tileWidth!].forEach((overhang) => {
        const rect = {
            x: start,
            y: start + 3,
            width: length,
            height: Math.ceil(length / 2),
          },
          { columns, rows } = projection.tileSpan(rect, overhang);

        for (let y = rows[0] - 6; y < rows[1] + 6; y++) {
          for (let x = columns[0] - 3; x < columns[1] + 3; x++) {
            const [left, top] = projection.tileToPixel(x, y),
              meets =
                left - overhang < rect.x + rect.width &&
                left + tileWidth! + overhang > rect.x &&
                top - overhang < rect.y + rect.height &&
                top + tileHeight! + overhang > rect.y,
              spanned =
                x >= columns[0] &&
                x < columns[1] &&
                y >= rows[0] &&
                y < rows[1];

            if (meets && !spanned) {
              missed.push(
                `${x},${y} for ${JSON.stringify(rect)} over ${overhang}`
              );
            }
          }
        }
      })
    )
  );

  sweep(`${name}: every tile reaching a rectangle is in its span`, missed);

  // The draw order is a total order on places, top to bottom and then left to right, so a row goes in front of the
  //  one above, whose diamonds' lower corners it covers.
  const placements: Placement[] = [],
    order: string[] = [];

  for (let y = -1; y < 5; y++) {
    for (let x = -1; x < 5; x++) {
      const [px, py] = projection.tileToPixel(x, y);

      [-1, 0, 1].forEach((repeat) =>
        placements.push({ x, y, px: px + repeat * 9 * tileWidth!, py })
      );
    }
  }

  const inOrder = [...placements].sort((a, b) =>
    projection.compareDrawOrder(a, b)
  );

  inOrder.forEach((a, index) =>
    inOrder.slice(index + 1).forEach((b) => {
      if (
        projection.compareDrawOrder(a, b) >= 0 ||
        projection.compareDrawOrder(b, a) <= 0 ||
        b.py < a.py ||
        (b.py === a.py && b.px <= a.px)
      ) {
        order.push(`${JSON.stringify(a)} before ${JSON.stringify(b)}`);
      }
    })
  );

  sweep(
    `${name}: in draw order, each place is above, or level and left of, every one after it`,
    order
  );
});

// An isometric tileset's projection (#92): diamonds as wide as its columns are apart, at the size asked for, each axis
//  scaled on its own, with its sprites reaching up out of their boxes as far as its anchor and overhang say. Civ2's
//  64 × 32 diamonds carry 64 × 48 units and cities, drawn 16px up.
const isoStub = (geometry: { [key: string]: unknown } = {}) =>
    tilesetWith({
      id: 'iso-stub',
      grid: 'staggered-iso',
      tile: { width: 64, height: 32 },
      geometry: {
        columnStep: 64,
        rowStep: 16,
        oddRowShift: 32,
        anchor: { x: 0, y: -16 },
        overhang: { top: 16, right: 0, bottom: 0, left: 0 },
        ...geometry,
      },
    }),
  isoWorld = dimensions(40, 100);

[
  [{ width: 64, height: 32 }, 1],
  [{ width: 128, height: 64 }, 2],
].forEach(([tileSize, scale]) => {
  const size = tileSize as { width: number; height: number },
    fromTileset = projectionFor(isoStub(), isoWorld, size),
    byHand = new IsoProjection(size, isoWorld);

  expect(
    `an isometric tileset at ${scale}× is the diamonds made by hand, reaching ${
      16 * (scale as number)
    }px up`,
    [
      fromTileset instanceof IsoProjection,
      fromTileset.footprint(),
      fromTileset.worldSize(),
      fromTileset.wrapPeriod(),
      fromTileset.tileToPixel(7, 3),
      fromTileset.pixelToTile(250, 77),
      fromTileset.reach(),
    ],
    [
      true,
      byHand.footprint(),
      byHand.worldSize(),
      byHand.wrapPeriod(),
      byHand.tileToPixel(7, 3),
      byHand.pixelToTile(250, 77),
      { top: 16 * (scale as number), right: 0, bottom: 0, left: 0 },
    ]
  );
});

expect(
  'an isometric reach is the overhang, or the anchor where that moves a sprite further, at the scale drawn',
  [
    projectionFor(
      isoStub({ overhang: { top: 0, right: 0, bottom: 0, left: 0 } }),
      isoWorld,
      { width: 128, height: 64 }
    ).reach(),
    projectionFor(
      isoStub({
        anchor: { x: 3, y: 2 },
        overhang: { top: 4, right: 1, bottom: 0, left: 5 },
      }),
      isoWorld,
      { width: 128, height: 64 }
    ).reach(),
    projectionFor(
      isoStub(),
      isoWorld,
      { width: 64, height: 32 },
      false
    ).wrapPeriod().y,
  ],
  [
    { top: 32, right: 0, bottom: 0, left: 0 },
    { top: 8, right: 6, bottom: 4, left: 10 },
    null,
  ]
);

expect(
  "an isometric grid's tiles are as far apart as they are wide, in rows half a tile apart, drawn at whole half tiles",
  [
    thrown(() =>
      projectionFor(isoStub({ rowStep: 32 }), isoWorld, {
        width: 64,
        height: 32,
      })
    ),
    thrown(() =>
      projectionFor(isoStub({ oddRowShift: 0 }), isoWorld, {
        width: 64,
        height: 32,
      })
    ),
    thrown(() =>
      projectionFor(isoStub({ columnStep: 32 }), isoWorld, {
        width: 64,
        height: 32,
      })
    ),
    thrown(() => projectionFor(isoStub(), isoWorld, { width: 66, height: 33 })),
    thrown(() => projectionFor(isoStub(), isoWorld, { width: 64, height: 64 })),
    thrown(() =>
      projectionFor(
        tilesetWith({
          ...isoStub({ rowStep: 32 }),
          tile: { width: 64, height: 64 },
        }),
        isoWorld,
        { width: 64, height: 64 }
      )
    ),
  ],
  [
    'Tileset "iso-stub": a staggered isometric grid\'s tiles are as far apart as they are wide, in rows half a tile apart with odd rows half a tile across, not 64 × 32 tiles 64 × 32 apart with odd rows 32 across.',
    'Tileset "iso-stub": a staggered isometric grid\'s tiles are as far apart as they are wide, in rows half a tile apart with odd rows half a tile across, not 64 × 32 tiles 64 × 16 apart with odd rows 0 across.',
    'Tileset "iso-stub": a staggered isometric grid\'s tiles are as far apart as they are wide, in rows half a tile apart with odd rows half a tile across, not 64 × 32 tiles 32 × 16 apart with odd rows 32 across.',
    'Tileset "iso-stub": a staggered isometric tile is drawn an even number of px across and down, not 66 × 33.',
    'Tileset "iso-stub": a staggered isometric tile is drawn in its own 64 × 32 shape, not 64 × 64.',
    'Tileset "iso-stub": a staggered isometric tile is twice as wide as it is tall, for now, not 64 × 64.',
  ]
);

// A layer culls far enough out for what the projection's sprites reach: a whole tile, the longer side, or further
//  where a sprite reaches further (#97). Civ1's squares reach nothing, so a tile it stays.
{
  const reachOf = (top: number) =>
      tilesetWith({
        id: 'iso-stub',
        grid: 'staggered-iso',
        tile: { width: 64, height: 32 },
        geometry: {
          columnStep: 64,
          rowStep: 16,
          oddRowShift: 32,
          anchor: { x: 0, y: 0 },
          overhang: { top, right: 0, bottom: 0, left: 0 },
        },
      }),
    overhangs = (tileset: ReturnType<typeof tilesetWith>, scale: number) => {
      const Layer = class extends MapLayer {
        protected override tileset() {
          return tileset;
        }

        margin(): number {
          return this.overhang();
        }
      };

      return new Layer(
        { width: () => 8, height: () => 8 } as any,
        scale,
        tileset.tile,
        { getContext: () => ({}) } as unknown as HTMLCanvasElement
      ).margin();
    };

  expect(
    "a layer's culling margin covers the projection's reach, and is at least a tile",
    [
      overhangs(reachOf(16), 1),
      overhangs(reachOf(96), 1),
      overhangs(reachOf(96), 2),
      overhangs(civ1, 1),
      overhangs(civ1, 3),
    ],
    [64, 96, 192, 16, 48]
  );
}

// The isometric grid brings its own overview and minimap (#867).
expect(
  'the isometric grid brings its overview and minimap',
  [
    overviewFor(isoStub()).layer === IsoOverview,
    overviewFor(isoStub()).minimap === IsoMinimap,
  ],
  [true, true]
);

// A grid's own code makes it drawable (#825): the map asks whichever projection is registered for the tileset's grid.
//  These stay last: the registry is the suite's own, and the checks above want hex unregistered.
const hexStub = tilesetWith({ id: 'hex-stub', grid: 'hex-odd-r' }),
  hexAsked: unknown[] = [],
  // Stand-ins: only which ones the registry hands back is checked.
  hexOverview = { layer: Overview, minimap: Minimap } as GridOverview,
  hexOverviewAgain = { layer: Overview, minimap: Minimap } as GridOverview;

// The minimap comes from the grid too (#867): the square grid's own, and none for a grid nothing has registered.
expect(
  'the square grid brings its overview and minimap, and an unregistered grid is refused',
  [
    overviewFor(civ1).layer === Overview,
    overviewFor(civ1).minimap === Minimap,
    thrown(() => overviewFor(hexStub)),
  ],
  [
    true,
    true,
    'Tileset "hex-stub": no projection is loaded for the hex-odd-r grid (hex comes with #94).',
  ]
);

registerGrid(
  'hex-odd-r',
  (tileset, world, tileSize, wrapVertical) => {
    hexAsked.push([tileset.id, tileSize, wrapVertical]);

    return new SquareProjection(tileSize.width, world, wrapVertical);
  },
  hexOverview
);

expect(
  'a registered grid is drawable, its projection is the one the map gets, and it is asked for the tile across and down',
  [
    drawableGrids().sort(),
    projectionFor(hexStub, world, { width: 24, height: 12 }, false).footprint(),
    hexAsked,
    overviewFor(hexStub) === hexOverview,
  ],
  [
    ['hex-odd-r', 'square', 'staggered-iso'],
    { width: 24, height: 24 },
    [['hex-stub', { width: 24, height: 12 }, false]],
    true,
  ]
);

registerGrid(
  'hex-odd-r',
  (tileset, world, tileSize, wrapVertical) => {
    hexAsked.push(['again', tileset.id, tileSize, wrapVertical]);

    return new SquareProjection(tileSize.width * 2, world, wrapVertical);
  },
  hexOverviewAgain
);

expect(
  'a grid registered again is listed once, and the map gets the latest projection',
  [
    drawableGrids().sort(),
    projectionFor(hexStub, world, { width: 16, height: 16 }).footprint(),
    hexAsked.slice(1),
    overviewFor(hexStub) === hexOverviewAgain,
  ],
  [
    ['hex-odd-r', 'square', 'staggered-iso'],
    { width: 32, height: 32 },
    [['again', 'hex-stub', { width: 16, height: 16 }, true]],
    true,
  ]
);

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL projection\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS projection (${checks} checks)`);
