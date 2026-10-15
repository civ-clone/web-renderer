// A map layer that can't draw one square still draws the rest, and the layers after it still move with the map. A
//  layer that threw used to stop the portal pointing the later layers at the new view, so the cities, units and names
//  stayed where they were while the land moved under them (#32).

// Must stay first: it gives the layers a canvas and a `document` to draw with.
import { fakeCanvas } from './lib/fakeCanvas';

import Map from '../../src/js/UI/components/Map';
import Portal from '../../src/js/UI/components/Portal';
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

// A layer the portal makes for itself gets its canvas from `s('<canvas></canvas>')`.
Object.assign((globalThis as any).document, {
  createElement: () => ({
    set innerHTML(_: string) {},
    get firstElementChild() {
      return fakeCanvas(0, 0).canvas;
    },
  }),
});

const errors: unknown[][] = [];

console.error = (...args: unknown[]) => errors.push(args);

const size = 8,
  tiles: Tile[] = [];

for (let x = 0; x < size; x++) {
  for (let y = 0; y < size; y++) {
    tiles.push({ x, y, yields: [], units: [], improvements: [] } as any);
  }
}

const drawn: string[] = [],
  viewports: [number, number][] = [];

// Can't draw the square at 4,4.
class Broken extends Map {
  protected drawTile(tile: Tile): void {
    if (tile.x === 4 && tile.y === 4) {
      throw new TypeError('cannot draw');
    }

    drawn.push(`${tile.x},${tile.y}`);
  }
}

// Drawn after the broken layer, and remembers where the portal points it.
class After extends Map {
  setViewport(
    originX: number,
    originY: number,
    width: number,
    height: number
  ): void {
    viewports.push([originX, originY]);

    super.setViewport(originX, originY, width, height);
  }
}

// Fails outright whenever it is pointed somewhere new.
class Throws extends Map {
  setViewport(): void {
    throw new TypeError('cannot move');
  }
}

const { canvas } = fakeCanvas(48, 48),
  portal = new Portal(
    new World({ width: size, height: size, tiles } as any),
    {} as any,
    canvas,
    { playerId: null, scale: 1, tileSize: 16 },
    Broken,
    Throws,
    After
  );

portal.setCenter(1, 1);
drawn.length = 0;
viewports.length = 0;
errors.length = 0;

portal.setCenter(4, 4);

expect(
  'the squares around the broken one are still drawn',
  ['3,3', '5,5', '3,5', '5,3'].every((tile) => drawn.includes(tile)),
  true
);
expect('the broken square is not', drawn.includes('4,4'), false);
expect('the layers after a failing one still move with the map', viewports, [
  [48, 48],
]);
expect('each failure is reported', errors.length, 2);

if (failures.length) {
  process.stderr.write(
    `FAIL layerFailures\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS layerFailures (${checks} checks)`);
