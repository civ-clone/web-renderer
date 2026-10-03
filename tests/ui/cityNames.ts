// A city in civil disorder shows an unhappy citizen on the map in place of its
// size, as Civ1 draws it, and its tile is redrawn whenever the city is sent
// (#193).

// Must stay first: it gives the layer a canvas and a `document` to draw with.
import { fakeCanvas, preloadImage } from './lib/fakeCanvas';

import CityNames from '../../src/js/UI/components/Map/CityNames';
import { Tile } from '../../src/js/UI/types';
import tileToRender from '../../src/js/UI/lib/tileToRender';

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
  draw = (civilDisorder: boolean) => {
    const { calls, canvas } = fakeCanvas(320, 320),
      layer = new TestCityNames({} as any, 2, 16, canvas),
      tile = {
        x: 0,
        y: 0,
        city: {
          name: 'Babylon',
          civilDisorder,
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
  'in disorder, the unhappy citizen fills the city square, centred across it',
  rioting.images,
  [[true, 8, 0, 16, 32]]
);
expect(
  'what is marked dirty covers the citizen',
  rioting.dirty.some(
    ({ x, y, width, height }) =>
      x <= 8 && y <= 0 && x + width >= 24 && y + height >= 32
  ),
  true
);

const objects = {
  t1: { _: 'PlayerTile', id: 't1', x: 4, y: 7 },
  c1: { _: 'City', id: 'c1', tile: { '#ref': 't1' } },
};

expect(
  'a tile is redrawn when it is sent',
  tileToRender(objects.t1, objects),
  objects.t1
);
expect(
  "a city's tile is redrawn when the city is sent",
  tileToRender(objects.c1, objects),
  objects.t1
);
expect(
  'a city whose tile is sent in place too',
  tileToRender({ _: 'City', tile: objects.t1 }, {}),
  objects.t1
);
expect(
  'a city whose tile ref is not known yet redraws nothing',
  tileToRender({ _: 'City', tile: { '#ref': 'missing' } }, objects),
  null
);
expect(
  'anything else redraws nothing',
  tileToRender({ _: 'Unit', tile: { '#ref': 't1' } }, objects),
  null
);

if (failures.length) {
  console.error(`FAIL city names\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS city names (${checks} checks)`);
