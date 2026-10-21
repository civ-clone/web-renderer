// Square tiles through the `Projection` the map layers and the portal use (#90): a tile's pixel maps back to the tile,
//  every pixel of its sprite box does, and a world's width (or height, over the poles) along is the same tile once the
//  caller wraps it.

import { SquareProjection, tileBounds } from '../../src/js/UI/lib/projection';

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

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL projection\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS projection (${checks} checks)`);
