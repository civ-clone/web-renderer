// A busy unit's letter is written at the size the unit is shown at, as the city
// labels are, rather than into the sprite and enlarged with it (#352). The
// action buttons draw their pictures at the size the screen shows them at.

// Must stay first: it gives the layer a canvas and a `document` to draw with.
import { FakeImage, fakeCanvas, preloadImage } from './lib/fakeCanvas';

import i18next from 'i18next';
import { drawUnitActionIcon } from '../../src/js/UI/lib/unitActionIcon';
import Units from '../../src/js/UI/components/Map/Units';
import { Tile, Unit } from '../../src/js/UI/types';

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

// No translations: a busy state's letter is the capitals of its name.
i18next.init({ lng: 'en', resources: {}, initImmediate: false } as any);

preloadImage('map/city', 16, 16);

// Drawn at the top left of the canvas, once, with a stand-in for the sprite.
class TestUnits extends Units {
  protected placements(): [number, number][] {
    return [[0, 0]];
  }

  protected renderUnit(): CanvasImageSource {
    return new FakeImage('units/settlers', 16, 16) as any;
  }
}

// The font each letter was written in, alongside where.
const texts = (canvas: HTMLCanvasElement, calls: any[][]) => {
  const context = canvas.getContext('2d') as any,
    fillText = context.fillText;

  context.fillText = (...args: any[]) => {
    calls.push(['font', context.font]);

    fillText(...args);
  };

  return () =>
    calls.flatMap(([name, ...args], index) =>
      name === 'fillText' ? [[calls[index - 1][1], ...args]] : []
    );
};

const draw = (scale: number, busy: string | null) => {
  const { calls, canvas } = fakeCanvas(320, 320),
    written = texts(canvas, calls),
    layer = new TestUnits({} as any, scale, 16, canvas),
    tile = {
      x: 0,
      y: 0,
      units: [{ _: 'Settlers', busy: busy ? { _: busy } : null } as Unit],
    } as unknown as Tile;

  layer.renderTile(tile);

  return written();
};

expect(
  'at scale 2, the letter is written on the map at 16px, over the middle of the tile, shadow first',
  draw(2, 'Fortified'),
  [
    ['bold 16px sans-serif', 'F', 18, 24],
    ['bold 16px sans-serif', 'F', 16, 22],
  ]
);
expect('at scale 3, at 24px', draw(3, 'Fortified'), [
  ['bold 24px sans-serif', 'F', 27, 36],
  ['bold 24px sans-serif', 'F', 24, 33],
]);
expect('a unit with nothing to do has no letter', draw(2, null), []);

// The action buttons.
const icon = (clientWidth: number, devicePixelRatio: number) => {
  const { calls, canvas } = fakeCanvas(16, 16),
    context = canvas.getContext('2d') as any;

  context.setTransform = (...args: any[]) =>
    calls.push(['setTransform', ...args]);
  (canvas as any).clientWidth = clientWidth;
  (globalThis as any).devicePixelRatio = devicePixelRatio;

  drawUnitActionIcon(canvas, [{ type: 'city', text: 'S', colours: null }]);

  return {
    size: [canvas.width, canvas.height],
    transform: calls.find(([name]) => name === 'setTransform'),
    text: calls.find(([name]) => name === 'fillText'),
  };
};

expect(
  'a 40px button on a 2x screen is drawn 80 pixels across, the picture 5 times over',
  icon(40, 2),
  {
    size: [80, 80],
    transform: ['setTransform', 5, 0, 0, 5, 0, 0],
    text: ['fillText', 'S', 9, 12],
  }
);
expect(
  'a button not laid out yet is drawn at the picture size, for the screen',
  icon(0, 1),
  {
    size: [16, 16],
    transform: ['setTransform', 1, 0, 0, 1, 0, 0],
    text: ['fillText', 'S', 9, 12],
  }
);

if (failures.length) {
  console.error(`FAIL unit status\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS unit status (${checks} checks)`);
