// A city the engine has declared in civil disorder shows an unhappy citizen on
// the map in place of its size, as Civ1 draws it (#193). A city that would only
// riot as things stand, mid-turn, still shows its size.

// Must stay first: it gives the layer a canvas and a `document` to draw with.
import { fakeCanvas, preloadImage } from './lib/fakeCanvas';

import CityNames from '../../src/js/UI/components/Map/CityNames';
import { Tile } from '../../src/js/UI/types';

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

// Drawn at the top left of the canvas, once, wherever the tile is.
class TestCityNames extends CityNames {
  protected placements(): [number, number][] {
    return [[0, 0]];
  }
}

const unhappy = preloadImage('city/people_unhappy_m', 8, 16),
  draw = (
    civilDisorderDeclared: boolean,
    civilDisorder = civilDisorderDeclared
  ) => {
    const { calls, canvas } = fakeCanvas(320, 320),
      layer = new TestCityNames({} as any, 2, 16, canvas),
      tile = {
        x: 0,
        y: 0,
        city: {
          name: 'Babylon',
          civilDisorder,
          civilDisorderDeclared,
          growth: { size: 3 },
          player: { civilization: { _: 'Babylonian' } },
        },
      } as unknown as Tile;

    layer.renderTile(tile);

    return {
      calls,
      dirty: layer.dirtyRects(),
      texts: calls
        .filter(([name]) => name === 'fillText')
        .map(([, text]) => text),
      images: calls
        .filter(([name]) => name === 'drawImage')
        .map(([, image, ...rect]) => [image === unhappy, ...rect]),
    };
  };

const orderly = draw(false);

expect(
  'in order, the size is drawn with the name (shadow, then text)',
  orderly.texts.filter((text) => text === '3').length,
  2
);
expect('in order, no citizen is drawn', orderly.images, []);

const unrest = draw(false, true);

expect(
  'unrest the engine has not declared yet still shows the size',
  unrest.texts.filter((text) => text === '3').length,
  2
);
expect(
  'unrest the engine has not declared draws no citizen',
  unrest.images,
  []
);

const rioting = draw(true);

expect(
  'in disorder, the size is not drawn',
  rioting.texts.filter((text) => text === '3').length,
  0
);
expect(
  'in disorder, the name still is',
  rioting.texts.length,
  orderly.texts.length - 2
);
expect(
  'in disorder, the unhappy citizen sits on the city square at (5, 1), scaled',
  rioting.images,
  [[true, 10, 2, 16, 32]]
);
expect(
  'what is marked dirty covers the citizen',
  rioting.dirty.some(
    ({ x, y, width, height }) =>
      x <= 10 && y <= 2 && x + width >= 26 && y + height >= 34
  ),
  true
);

if (failures.length) {
  console.error(`FAIL city names\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS city names (${checks} checks)`);
