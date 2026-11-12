// A busy unit's letter is written at the size the unit is shown at, as the city
// labels are, rather than into the sprite and enlarged with it (#352). The
// action buttons draw their pictures at the size the screen shows them at.

// Must stay first: it gives the layer a canvas and a `document` to draw with.
import { FakeImage, fakeCanvas, preloadImage } from './lib/fakeCanvas';

import i18next from 'i18next';
import { drawUnitActionIcon } from '@civ-clone/ui-assets/lib/unitActionIcon';
import Units from '@civ-clone/ui-map/components/Map/Units';
import HudUnit from '@civ-clone/ui-hud/components/Unit';
import currentTileset from '@civ-clone/ui-assets/lib/tilesets';
import { Tile, Unit } from '@civ-clone/ui-protocol/types';

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
i18next.init({ lng: 'en', resources: {}, initAsync: false });

preloadImage('map/city', 16, 16);

// Drawn at the top left of the canvas, once, with a stand-in for the sprite.
class TestUnits extends Units {
  drawAtOrigin(tile: Tile): void {
    this.drawTile(tile, 0, 0);
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

const draw = (
  scale: number,
  busy: string | null,
  tileSize = { width: 16, height: 16 }
) => {
  const { calls, canvas } = fakeCanvas(320, 320),
    written = texts(canvas, calls),
    // A square world: the layer draws with the square grid's tileset (#97).
    layer = new TestUnits(
      { topologyId: () => 'square' } as any,
      scale,
      tileSize,
      canvas
    ),
    tile = {
      x: 0,
      y: 0,
      units: [{ _: 'Settlers', busy: busy ? { _: busy } : null } as Unit],
    } as unknown as Tile;

  layer.drawAtOrigin(tile);

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
expect(
  'on a tile wider than it is tall, the letter is across by its width and down by its height',
  draw(2, 'Fortified', { width: 32, height: 16 }),
  [
    ['bold 16px sans-serif', 'F', 34, 24],
    ['bold 16px sans-serif', 'F', 32, 22],
  ]
);

// A unit as a window shows it is on a canvas the tileset's tile across and down, at the window's scale: a tile wider
//  than it is tall, put in place of Civ1's for the one check.
const hudCanvas = (tile: { width: number; height: number }, scale: number) => {
  const tileset = currentTileset(),
    native = tileset.tile,
    fakeDocument = (globalThis as any).document;

  tileset.tile = tile;
  // The hud's unit makes its canvases from markup (`s()`): each a fake canvas the size the markup says.
  fakeDocument.createElement = () => {
    let element: HTMLCanvasElement | null = null;

    return {
      set innerHTML(html: string) {
        const [, width = '0'] = /width="(\d+)"/.exec(html) ?? [],
          [, height = '0'] = /height="(\d+)"/.exec(html) ?? [];

        element = fakeCanvas(Number(width), Number(height)).canvas;
      },
      get firstElementChild() {
        return element;
      },
    };
  };

  try {
    const { width, height } = new HudUnit(
      {
        _: 'Settlers',
        busy: null,
        improvements: [],
        player: {
          civilization: { attributes: [{ name: 'colors', value: ['#fff'] }] },
        },
      } as unknown as Unit,
      scale
    ).element();

    return [width, height];
  } finally {
    tileset.tile = native;
    delete fakeDocument.createElement;
  }
};

expect(
  "a unit in a window is on a canvas the tile's width across and its height down, at the window's scale",
  [
    hudCanvas({ width: 16, height: 16 }, 2),
    hudCanvas({ width: 32, height: 16 }, 2),
  ],
  [
    [32, 32],
    [64, 32],
  ]
);

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
