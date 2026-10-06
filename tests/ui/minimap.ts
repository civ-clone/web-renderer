// The minimap shows everything the player has explored as soon as the game
// appears (#270). Its layer covers the whole world, so it ignores the portal's
// viewport, and the only other way a tile reached it was a patch: a loaded
// game's explored tiles arrive in the first `gameData` and never as patches,
// so the minimap stayed black until something changed.

// Must stay first: it gives the layer a canvas and a `document` to draw with.
import { fakeCanvas } from './lib/fakeCanvas';

import Overview from '../../src/js/UI/components/Map/Overview';
import { Tile } from '../../src/js/UI/types';
import World from '../../src/js/UI/components/World';

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

const width = 5,
  height = 3,
  // Explored: the left three columns. The rest is still dark.
  explored = (x: number) => x < 3,
  tiles = new Array(width * height).fill(0).map(
    (value, i) =>
      ({
        x: i % width,
        y: Math.floor(i / width),
        city: null,
        isWater: false,
        terrain: { _: explored(i % width) ? 'Grassland' : 'Unknown' },
      } as unknown as Tile)
  ),
  world = new World({ width, height, tiles } as any),
  { calls, canvas } = fakeCanvas(0, 0),
  overview = new Overview(world, 2, 16, canvas),
  size = overview.tileSize(),
  filled = calls
    .filter(([name]) => name === 'fillRect')
    .map(([, x, y]) => `${x / size},${y / size}`)
    .sort();

expect(
  'the canvas is a world across at the overview tile size',
  [canvas.width, canvas.height],
  [width * size, height * size]
);

expect(
  'every explored tile is drawn as soon as the layer exists',
  filled,
  tiles
    .filter(({ x }) => explored(x))
    .map(({ x, y }) => `${x},${y}`)
    .sort()
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL minimap (${failures.length} of ${checks} checks)\n  ${failures.join(
      '\n  '
    )}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS minimap (${checks} checks)\n`);
