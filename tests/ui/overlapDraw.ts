// What the map layers leave on their canvases, pixel by pixel, on a software canvas (#91).
//
// A layer redraws a changed tile, and the strips a scroll uncovers, without redrawing the rest. What it leaves has to
//  be what drawing everything again would have left, or the map slowly fills with bits of things that have gone. So,
//  for every layer, over worlds that wrap (and stop at the poles), at more than one scale and with the world's seam on
//  the canvas:
//
//  - updating one tile, after changing it, leaves the canvas as a full redraw of the changed world would;
//  - every pixel the update changed is inside what the layer marked dirty, so the portal composites all of it;
//  - scrolling leaves the canvas as drawing it afresh at the new origin would.
//
// On the square grid a layer that draws each tile inside its own box clears a tile's box and draws it again on its
//  own. Four layers draw past the box: the copy behind a stack of units (`scale` px up and left), the city glyph
//  (`scale` px right and down), a row of six yield icons (to the right) and a city's name (well past it either side,
//  and below). Clearing only the box left the rest of what such a tile drew behind, and clearing a neighbour's box cut
//  into it (#486), so those layers declare how far they reach and are redrawn as regions, as the projections whose
//  tiles overlap are. On the square grid too, every layer has to leave exactly what a full redraw would.
//
// Where a projection's tiles overlap their neighbours, a tile can't be cleared and drawn again on its own: its box,
//  out to the layer's reach, is cleared once and everything reaching it is drawn again, back to front. Three test
//  projections go that way, and on each of them the three properties above hold exactly, for every layer:
//
//  - "square, through the overlap path": the square grid, drawn as if it overlapped, for every layer;
//  - "brick": rows half a tile apart, every other one shifted half a tile across, as a staggered isometric map is,
//    with diamond sprites so the tiles behind show through the corners of the ones in front;
//  - "tall": the square grid, with sprites half a tile taller than the box, reaching into the row above, as mountains
//    and cities do in many tilesets.
//
// A full render also has to put the tile in front on top, which a test layer of one sprite per tile checks against
//  the sprites drawn back to front here. And each of four mistakes the region path could make (drawing in the wrong
//  order, clearing each tile's box before drawing it, a reach too small for what a layer draws, and a layer that draws
//  past its box on the square grid declaring no reach, as all of them did before #486) fails a check by name.
//
// `--measure` prints what updating one tile costs on each projection, rather than running the checks.

// Must stay first: it gives the layers a `document` and the preloaded images to draw with.
import { FakeImage, preloadImage } from './lib/fakeCanvas';

import {
  Pixels,
  SoftwareCanvas,
  differences,
  mix,
  setSpriteMask,
  softwareCanvas,
  stringHash,
  useSoftwareCanvases,
} from './lib/softwareCanvas';
import ActiveUnit from '../../src/js/UI/components/Map/ActiveUnit';
import Cities from '../../src/js/UI/components/Map/Cities';
import CityNames from '../../src/js/UI/components/Map/CityNames';
import Fog from '../../src/js/UI/components/Map/Fog';
import Landscape from '../../src/js/UI/components/Map/Landscape';
import Map, { TilePlacement } from '../../src/js/UI/components/Map';
import {
  Placement,
  Projection,
  Reach,
  SquareProjection,
  TileSpan,
  WorldDimensions,
} from '../../src/js/UI/lib/projection';
import { Rect, mergeRects, rectArea } from '../../src/js/UI/lib/viewport';
import { Tile } from '../../src/js/UI/types';
import Units from '../../src/js/UI/components/Map/Units';
import Unworkable from '../../src/js/UI/components/Map/Unworkable';
import World from '../../src/js/UI/components/World';
import Yields from '../../src/js/UI/components/Map/Yields';
import i18next from 'i18next';

useSoftwareCanvases();

// With no translations loaded, a city's name is its own: without this, every one would be drawn as "undefined".
i18next.init({
  lng: 'en',
  defaultNS: 'default',
  ns: ['default'],
  initImmediate: false,
});

const failures: string[] = [],
  errors: string[] = [],
  measure = process.argv.includes('--measure');

// Where failed checks go: `failures`, except while a deliberately broken layer is checked.
let collect: string[] = failures;
let checks = 0,
  finished = false;

process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL overlapDraw: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// A layer catches what a tile throws and logs it (#32), so anything logged is a failure here.
console.error = (...args: unknown[]) =>
  errors.push(
    args.map((arg) => String((arg as Error)?.stack ?? arg)).join(' ')
  );

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    collect.push(
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
    collect.push(
      `${description}: ${misses.length} wrong, first ${misses
        .slice(0, 5)
        .join('; ')}`
    );
  }
};

// --- The software canvas itself -------------------------------------------------------------------------------------

{
  const sprite = new FakeImage('check/sprite', 4, 4),
    pixel = (canvas: SoftwareCanvas, x: number, y: number): number =>
      canvas.ids[y * canvas.width + x],
    spritePixel = (x: number, y: number): number =>
      mix(stringHash('check/sprite'), x, y);

  const plain = new SoftwareCanvas(12, 12),
    context = plain.getContext();

  context.drawImage(sprite, 2, 3);
  expect(
    'drawImage(image, x, y) puts the sprite at its own size',
    [pixel(plain, 2, 3), pixel(plain, 5, 6), pixel(plain, 6, 3)],
    [spritePixel(0, 0), spritePixel(3, 3), 0]
  );

  const scaled = new SoftwareCanvas(12, 12);

  scaled.getContext().drawImage(sprite, 1, 1, 8, 8);
  expect(
    'drawImage(image, x, y, w, h) scales it, pixel by pixel',
    [pixel(scaled, 1, 1), pixel(scaled, 2, 2), pixel(scaled, 3, 1)],
    [spritePixel(0, 0), spritePixel(0, 0), spritePixel(1, 0)]
  );

  const sliced = new SoftwareCanvas(12, 12);

  sliced.getContext().drawImage(sprite, 2, 1, 2, 2, 5, 5, 2, 2);
  expect(
    'drawImage with nine arguments takes a slice of the image',
    [pixel(sliced, 5, 5), pixel(sliced, 6, 6), pixel(sliced, 4, 5)],
    [spritePixel(2, 1), spritePixel(3, 2), 0]
  );

  const copied = new SoftwareCanvas(12, 12),
    copyContext = copied.getContext();

  copyContext.drawImage(sprite, 0, 0);
  copyContext.globalCompositeOperation = 'copy';
  copyContext.drawImage(copied, 3, 2);
  copyContext.globalCompositeOperation = 'source-over';
  expect(
    'a canvas copied onto itself moves what it held and clears what it uncovered',
    [pixel(copied, 3, 2), pixel(copied, 6, 5), pixel(copied, 0, 0)],
    [spritePixel(0, 0), spritePixel(3, 3), 0]
  );

  const clipped = new SoftwareCanvas(10, 10),
    clipContext = clipped.getContext();

  clipContext.save();
  clipContext.beginPath();
  clipContext.rect(2, 2, 3, 3);
  clipContext.clip();
  clipContext.fillStyle = '#fff';
  clipContext.fillRect(0, 0, 10, 10);
  clipContext.clearRect(4, 4, 6, 6);
  clipContext.restore();
  expect(
    'drawing and clearing stay inside the clip',
    [clipped.counters.paintedPixels, clipped.counters.clearedPixels],
    [9, 1]
  );

  clipContext.fillRect(0, 0, 10, 10);
  expect('restore takes the clip away', clipped.counters.paintedPixels, 109);

  const blend = (styles: string[]): number => {
    const canvas = new SoftwareCanvas(1, 1),
      blendContext = canvas.getContext();

    styles.forEach((style) => {
      blendContext.fillStyle = style;
      blendContext.fillRect(0, 0, 1, 1);
    });

    return canvas.ids[0];
  };

  expect(
    'see-through fills mix in an order that shows',
    blend(['rgba(1, 2, 3, 0.5)', 'rgba(4, 5, 6, 0.5)']) ===
      blend(['rgba(4, 5, 6, 0.5)', 'rgba(1, 2, 3, 0.5)']),
    false
  );
  expect(
    'a see-through fill drawn twice is not the same as once',
    blend(['rgba(1, 2, 3, 0.5)', 'rgba(1, 2, 3, 0.5)']) ===
      blend(['rgba(1, 2, 3, 0.5)']),
    false
  );
  expect(
    'an opaque fill drawn twice is the same as once',
    blend(['#123', '#123']) === blend(['#123']),
    true
  );

  const fractional = new SoftwareCanvas(4, 1);

  fractional.getContext().fillRect(0.4, 0, 1, 1);
  expect(
    'a pixel is drawn when its centre is',
    Array.from(fractional.alpha),
    [255, 0, 0, 0]
  );

  plain.width = 6;
  expect(
    'resizing clears the canvas and keeps its context',
    [Array.from(plain.alpha).some((alpha) => alpha > 0), plain.getContext()],
    [false, context]
  );
}

// --- The world ------------------------------------------------------------------------------------------------------

const terrains = [
    'Grassland',
    'Hills',
    'Forest',
    'River',
    'Plains',
    'Desert',
    'Mountains',
  ],
  edgeDirections = ['n', 'e', 's', 'w'],
  allDirections = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

// Every image a layer here asks for, at its size in the Civ1 tileset, so none falls back to the placeholder.
[
  ['map/city', 16, 16],
  ['map/hut', 15, 15],
  ['city/people_unhappy_m', 8, 16],
  ['city/food', 7, 7],
  ['city/production', 7, 7],
  ['city/trade', 7, 7],
  ['terrain/shield', 7, 7],
  ['terrain/coast_sprite', 128, 16],
  ...allDirections.map((direction) => [`map/fog_${direction}`, 16, 16]),
  ...[
    'terrain/land',
    'terrain/ocean',
    'improvements/irrigation',
    'improvements/mine',
    'improvements/pollution',
    'terrain/doe',
    'terrain/oasis',
    ...edgeDirections.map((direction) => `terrain/river_mouth_${direction}`),
    ...allDirections.flatMap((direction) => [
      `improvements/road_${direction}`,
      `improvements/railroad_${direction}`,
    ]),
    ...terrains.flatMap((terrain) =>
      new Array(16)
        .fill(null)
        .map(
          (_, mask) =>
            `terrain/${terrain.toLowerCase()}${
              mask === 0
                ? ''
                : `_${edgeDirections
                    .filter((direction, bit) => mask & (1 << bit))
                    .join('')}`
            }`
        )
    ),
  ].map((path) => [path, 16, 16]),
].forEach(([path, width, height]) =>
  preloadImage(path as string, width as number, height as number)
);

const player = {
    id: 'Player-1',
    civilization: {
      _: 'Babylonian',
      attributes: [{ name: 'colors', value: ['#ff0000', '#00ff00'] }],
    },
  },
  ownCity = { id: 'City-A' },
  otherCity = { id: 'City-B' };

const makeUnit = (id: string, x: number, y: number, defence: number = 1) => ({
  id,
  _: defence > 1 ? 'Phalanx' : 'Warrior',
  busy: null,
  defence: { value: defence },
  improvements: [],
  player,
  tile: { x, y },
});

const makeCity = (x: number, y: number) => ({
  id: `City-${x}-${y}`,
  name: `City ${x} ${y}`,
  civilDisorderDeclared: false,
  growth: { size: 3 },
  player,
});

// Twelve icons, which is six columns, the widest a square's yields are drawn.
const manyYields = [
    { _: 'Food', value: 4 },
    { _: 'Production', value: 4 },
    { _: 'Trade', value: 4 },
  ],
  fewYields = [
    { _: 'Food', value: 2 },
    { _: 'Trade', value: 1 },
  ];

// Land and sea, the same every run: patches of each terrain two tiles across, coasts, roads, cities, units (some
//  stacked), every width of yields, worked squares and a scattering of unseen tiles. `variant` is what the test layers
//  below draw: nothing, or one of two sprites of the tile's own.
const makeWorld = (width: number, height: number): World => {
  const wrap = (value: number, size: number): number =>
      ((value % size) + size) % size,
    landAt = (x: number, y: number): boolean => {
      const wx = wrap(x, width),
        wy = wrap(y, height);

      return (wx * 3 + wy * 5 + ((wx * wy) % 3)) % 8 < 5;
    },
    tiles: Tile[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = x * 7 + y * 13,
        unknown = n % 17 === 5,
        isLand = landAt(x, y),
        terrain = isLand
          ? terrains[
              (Math.floor(x / 2) + Math.floor(y / 2) * 3) % terrains.length
            ]
          : 'Ocean',
        road = isLand && (x + y) % 3 !== 0,
        neighbours = [-1, 0, 1].flatMap((dy) =>
          [-1, 0, 1].map((dx) => landAt(x + dx, y + dy))
        );

      tiles.push({
        _: 'Tile',
        id: `Tile-${x}-${y}`,
        x,
        y,
        variant: n % 5 === 0 ? 0 : 1 + (n % 2),
        city:
          isLand && !unknown && x % 4 === 1 && y % 3 === 1
            ? makeCity(x, y)
            : null,
        goodyHut: isLand && n % 13 === 4 ? {} : null,
        improvements: [
          ...(road ? [{ _: 'Road' }] : []),
          ...(road && x % 2 === 0 ? [{ _: 'Railroad' }] : []),
          ...(isLand && (x * y) % 5 === 1 ? [{ _: 'Irrigation' }] : []),
          ...(terrain === 'Hills' && x % 2 === 1 ? [{ _: 'Mine' }] : []),
        ],
        isCoast: !isLand && neighbours.includes(true),
        isLand,
        isWater: !isLand,
        terrain: {
          _: unknown ? 'Unknown' : terrain,
          features:
            terrain === 'Grassland' && (x + y) % 2 === 0
              ? [{ _: 'Shield' }]
              : terrain === 'Forest' && x % 3 === 0
              ? [{ _: 'Game' }]
              : terrain === 'Desert'
              ? [{ _: 'Oasis' }]
              : [],
        },
        units:
          n % 4 === 1
            ? [
                makeUnit(`Unit-${x}-${y}-a`, x, y),
                ...(n % 8 === 1 ? [makeUnit(`Unit-${x}-${y}-b`, x, y, 2)] : []),
              ]
            : [],
        workedBy: n % 5 === 1 ? otherCity : n % 5 === 2 ? ownCity : null,
        yields: n % 3 === 0 ? manyYields : n % 3 === 1 ? fewYields : [],
      } as unknown as Tile);
    }
  }

  return new World({ width, height, tiles } as any);
};

// --- The layers -----------------------------------------------------------------------------------------------------

// One sprite a tile, of the tile's own, so the wrong tile on top shows as surely as a tile in the wrong place.
class Plain extends Map {
  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    const variant = (tile as any).variant;

    if (variant === 0) {
      return;
    }

    this.putImage(
      new FakeImage(`plain/${tile.x}_${tile.y}_${variant}`, 16, 16) as any,
      offsetX,
      offsetY
    );
  }
}

// Recolouring reads pixels back; the city's place is what matters here.
class TestCities extends Cities {
  protected replaceColours(image: CanvasImageSource): HTMLCanvasElement {
    return image as HTMLCanvasElement;
  }
}

class TestUnits extends Units {
  protected renderUnit(unit: any): CanvasImageSource {
    return new FakeImage(`units/${unit._.toLowerCase()}`, 16, 16) as any;
  }
}

class TestActiveUnit extends ActiveUnit {
  protected renderUnit(unit: any): CanvasImageSource {
    return new FakeImage(`units/${unit._.toLowerCase()}`, 16, 16) as any;
  }
}

// One sprite a tile, half a tile taller than the box, reaching into the row above.
class TallPlain extends Map {
  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    const variant = (tile as any).variant;

    if (variant === 0) {
      return;
    }

    this.putImage(
      new FakeImage(`tall/${tile.x}_${tile.y}_${variant}`, 16, 24) as any,
      offsetX,
      offsetY - 8 * this.scale()
    );
  }
}

// Broken on purpose, each of them, to show the checks catch it.

// Clears each tile's box before drawing it, as the square grid does.
class ClearsEachTile extends Plain {
  protected paint(placement: TilePlacement): void {
    const { width, height } = this.projection().footprint();

    this.context().clearRect(placement.px, placement.py, width, height);

    super.paint(placement);
  }
}

// Draws taller than the box but says it doesn't.
class ReachTooSmall extends TallPlain {
  protected reach(): Reach {
    return noReach;
  }
}

// Draws the copy behind a stack past the box but says it doesn't, so on the square grid each tile is cleared and drawn
//  in its own box, as every layer was before #486.
class UnitsWithoutReach extends TestUnits {
  protected reach(): Reach {
    return noReach;
  }
}

const noReach: Reach = { top: 0, right: 0, bottom: 0, left: 0 };

type Mutation = {
  name: string;
  // Changes the tile, and gives back what undoes it.
  apply: (tile: any) => () => void;
};

// Swaps one of a tile's properties for another value, and back.
const swap =
  (property: string, value: (tile: any) => unknown) =>
  (tile: any): (() => void) => {
    const previous = tile[property];

    tile[property] = value(tile);

    return () => {
      tile[property] = previous;
    };
  };

type LayerSpec = {
  name: string;
  Type: typeof Map;
  mutations: Mutation[];
  // How far past a tile's square box the layer draws on the square grid, which its reach has to cover (#486).
  squareStrip: (scale: number) => Reach;
  // The projections it is checked on, if not all of them.
  projections?: string[];
  // The sprite a tile is, for the layers simple enough to draw back to front here: where it goes from the top left of
  //  the tile's box.
  sprite?: (tile: any, scale: number) => [FakeImage, number, number] | null;
};

const layerSpecs: LayerSpec[] = [
  {
    name: 'Plain',
    Type: Plain,
    sprite: (tile) =>
      tile.variant === 0
        ? null
        : [
            new FakeImage(`plain/${tile.x}_${tile.y}_${tile.variant}`, 16, 16),
            0,
            0,
          ],
    mutations: [
      {
        name: 'another sprite',
        apply: swap('variant', (tile) => (tile.variant % 2) + 1),
      },
      { name: 'no sprite', apply: swap('variant', () => 0) },
    ],
    squareStrip: () => noReach,
  },
  {
    name: 'TallPlain',
    Type: TallPlain,
    projections: ['tall'],
    sprite: (tile, scale) =>
      tile.variant === 0
        ? null
        : [
            new FakeImage(`tall/${tile.x}_${tile.y}_${tile.variant}`, 16, 24),
            0,
            -8 * scale,
          ],
    mutations: [
      {
        name: 'another sprite',
        apply: swap('variant', (tile) => (tile.variant % 2) + 1),
      },
      { name: 'no sprite', apply: swap('variant', () => 0) },
    ],
    squareStrip: () => noReach,
  },
  {
    name: 'Landscape',
    Type: Landscape,
    mutations: [
      {
        name: 'land becomes sea',
        apply: (tile) => {
          const undo = ['isLand', 'isWater', 'terrain', 'improvements'].map(
            (property) => swap(property, (tile) => tile[property])(tile)
          );

          tile.isLand = !tile.isLand;
          tile.isWater = !tile.isWater;
          tile.terrain = {
            _: tile.isLand ? 'Hills' : 'Ocean',
            features: [],
          };
          tile.improvements = tile.isLand ? [{ _: 'Road' }] : [];

          return () => undo.forEach((step) => step());
        },
      },
      {
        name: 'a road',
        apply: swap('improvements', (tile) =>
          tile.improvements.some((improvement: any) => improvement._ === 'Road')
            ? []
            : [{ _: 'Road' }, { _: 'Mine' }]
        ),
      },
    ],
    squareStrip: () => noReach,
  },
  {
    name: 'Fog',
    Type: Fog,
    mutations: [
      {
        name: 'seen or unseen',
        apply: swap('terrain', (tile) => ({
          _: tile.terrain._ === 'Unknown' ? 'Plains' : 'Unknown',
          features: [],
        })),
      },
    ],
    squareStrip: () => noReach,
  },
  {
    name: 'Units',
    Type: TestUnits,
    mutations: [
      {
        name: 'a stack',
        apply: swap('units', (tile) => [
          makeUnit(`Added-${tile.x}-${tile.y}-a`, tile.x, tile.y),
          makeUnit(`Added-${tile.x}-${tile.y}-b`, tile.x, tile.y, 2),
        ]),
      },
      { name: 'no units', apply: swap('units', () => []) },
    ],
    squareStrip: (scale) => ({ top: scale, right: 0, bottom: 0, left: scale }),
  },
  {
    name: 'Cities',
    Type: TestCities,
    mutations: [
      {
        name: 'a city, with units',
        apply: (tile) => {
          const undoCity = swap('city', (tile) =>
              tile.city ? null : makeCity(tile.x, tile.y)
            )(tile),
            undoUnits = swap('units', (tile) => [
              makeUnit(`Garrison-${tile.x}-${tile.y}`, tile.x, tile.y),
            ])(tile);

          return () => {
            undoCity();
            undoUnits();
          };
        },
      },
    ],
    squareStrip: (scale) => ({ top: 0, right: scale, bottom: scale, left: 0 }),
  },
  {
    name: 'Yields',
    Type: Yields,
    mutations: [
      {
        name: 'more yields',
        apply: swap('yields', (tile) =>
          tile.yields === manyYields ? fewYields : manyYields
        ),
      },
      { name: 'no yields', apply: swap('yields', () => []) },
    ],
    // Six columns of 7px icons: the last starts five sixths of the way across.
    squareStrip: (scale) => ({
      top: 0,
      right: Math.ceil((16 * scale * 5) / 6 + 7 * scale - 16 * scale),
      bottom: 0,
      left: 0,
    }),
  },
  {
    name: 'CityNames',
    Type: CityNames,
    mutations: [
      {
        name: 'a city',
        apply: swap('city', (tile) =>
          tile.city ? null : makeCity(tile.x, tile.y)
        ),
      },
      // One of the widest in the city lists, so it overlaps its neighbours' names and reaches nearly as far as a name
      //  can.
      {
        name: 'a long name',
        apply: swap('city', (tile) => ({
          ...makeCity(tile.x, tile.y),
          name: 'Augusta Praetoria Salassorum',
        })),
      },
      {
        name: 'civil disorder',
        apply: swap('city', (tile) => ({
          ...makeCity(tile.x, tile.y),
          civilDisorderDeclared: true,
        })),
      },
    ],
    // The longest name here, "Augusta Praetoria Salassorum", centred on the tile, with its shadow a scale step right;
    //  and the name's baseline 0.6 of a tile below the box, the software canvas's text falling a quarter of its 8px size
    //  below that.
    squareStrip: (scale) => {
      const across = (28 * 8 * scale * 0.6) / 2 - 8 * scale;

      return {
        top: 0,
        right: Math.ceil(across + scale),
        bottom: Math.ceil(16 * scale * 0.6 + 8 * scale * 0.25),
        left: Math.ceil(across),
      };
    },
  },
  {
    name: 'Unworkable',
    Type: Unworkable,
    mutations: [
      {
        name: 'worked by another city',
        apply: swap('workedBy', (tile) =>
          tile.workedBy === otherCity ? null : otherCity
        ),
      },
    ],
    squareStrip: () => noReach,
  },
  {
    name: 'ActiveUnit',
    Type: TestActiveUnit,
    // The checks move the active unit to the tile themselves.
    mutations: [{ name: 'the active unit moves here', apply: () => () => {} }],
    squareStrip: () => noReach,
  },
];

// The square grid, drawn as if its tiles overlapped.
class OverlappingSquare extends SquareProjection {
  overlapsNeighbours(): boolean {
    return true;
  }
}

// The square grid with sprites half a tile taller than the box, reaching into the row above.
class Tall extends OverlappingSquare {
  #reach: Reach;

  constructor(size: number, world: WorldDimensions, wrapVertical: boolean) {
    super(size, world, wrapVertical);

    this.#reach = { top: size / 2, right: 0, bottom: 0, left: 0 };
  }

  reach(): Reach {
    return this.#reach;
  }
}

// Rows half a tile apart, every other one shifted half a tile across: a staggered isometric map's boxes. The world
//  has to be an even number of rows high to wrap over the poles.
class Brick implements Projection {
  #size: number;
  #world: WorldDimensions;
  #wrapVertical: boolean;

  constructor(size: number, world: WorldDimensions, wrapVertical: boolean) {
    this.#size = size;
    this.#world = world;
    this.#wrapVertical = wrapVertical;
  }

  compareDrawOrder(a: Placement, b: Placement): number {
    return a.py - b.py || a.px - b.px || a.y - b.y || a.x - b.x;
  }

  footprint() {
    return { width: this.#size, height: this.#size };
  }

  overlapsNeighbours(): boolean {
    return true;
  }

  pixelToTile(px: number, py: number): [number, number] {
    const row = Math.floor(py / (this.#size / 2));

    return [
      Math.floor((px - (row % 2 === 0 ? 0 : this.#size / 2)) / this.#size),
      row,
    ];
  }

  reach(): Reach {
    return noReach;
  }

  tileSpan({ x, y, width, height }: Rect, overhang: number): TileSpan {
    const size = this.#size,
      step = size / 2;

    return {
      // Odd rows start half a tile across.
      columns: [
        Math.floor((x - overhang - step) / size),
        Math.ceil((x + width + overhang) / size),
      ],
      // A row's boxes are a whole tile high, so the row a tile above still reaches down into the rectangle.
      rows: [
        Math.floor((y - overhang - size) / step) + 1,
        Math.ceil((y + height + overhang) / step),
      ],
    };
  }

  tileToPixel(x: number, y: number): [number, number] {
    return [
      x * this.#size + (y % 2 === 0 ? 0 : this.#size / 2),
      (y * this.#size) / 2,
    ];
  }

  worldSize() {
    return {
      width: this.#world.width() * this.#size + this.#size / 2,
      height: ((this.#world.height() + 1) * this.#size) / 2,
    };
  }

  wrapPeriod() {
    return {
      x: this.#world.width() * this.#size,
      y: this.#wrapVertical ? (this.#world.height() * this.#size) / 2 : null,
    };
  }
}

// Brick, drawn column by column as the square grid used to be.
class BrickByColumn extends Brick {
  compareDrawOrder(a: Placement, b: Placement): number {
    return a.px - b.px || a.py - b.py || a.x - b.x || a.y - b.y;
  }
}

// Every sprite has a scattering of see-through pixels, as real ones do, so what is under it shows.
const scatteredMask = (path: string, x: number, y: number): number =>
    mix(stringHash(path), x, y) % 5 === 0 ? 0 : 1,
  // And, on the brick grid, is a diamond, as an isometric tile is.
  diamondMask = (
    path: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): number =>
    Math.abs(x + 0.5 - width / 2) / (width / 2) +
      Math.abs(y + 0.5 - height / 2) / (height / 2) >
    1
      ? 0
      : scatteredMask(path, x, y);

// How a layer is drawn: the projection it is given (none: the layer's own square one), and the sprites' see-through
//  pixels.
type ProjectionSpec = {
  name: string;
  make: ((layer: any) => Projection) | null;
  mask: typeof diamondMask;
};

const projectionSpecs: ProjectionSpec[] = [
  {
    name: 'square',
    make: null,
    mask: scatteredMask,
  },
  {
    name: 'square, through the overlap path',
    make: (layer) =>
      new OverlappingSquare(layer.tileSize(), layer.world(), layer.wraps()),
    mask: scatteredMask,
  },
  {
    name: 'brick',
    make: (layer) => new Brick(layer.tileSize(), layer.world(), layer.wraps()),
    mask: diamondMask,
  },
  {
    name: 'tall',
    make: (layer) => new Tall(layer.tileSize(), layer.world(), layer.wraps()),
    mask: scatteredMask,
  },
];

const brokenOrder: ProjectionSpec = {
  name: 'brick, drawn column by column',
  make: (layer) =>
    new BrickByColumn(layer.tileSize(), layer.world(), layer.wraps()),
  mask: diamondMask,
};

let mask: ProjectionSpec['mask'] | null = null;

// A layer of `Type`, on a software canvas, with its projection, pointed at a viewport.
const makeLayer = (
  spec: LayerSpec,
  projection: ProjectionSpec,
  world: World,
  scale: number,
  wrapVertical: boolean,
  [width, height]: [number, number],
  [originX, originY]: [number, number],
  activeUnit: any = null
): { layer: any; canvas: SoftwareCanvas } => {
  if (mask !== projection.mask) {
    mask = projection.mask;

    setSpriteMask(mask);
  }

  const canvas = softwareCanvas(0, 0),
    Probe = probe(spec.Type),
    layer = new Probe(world, scale, 16, canvas);

  layer.useProjection(projection.make);
  layer.setWrapVertical(wrapVertical);

  if (layer instanceof Unworkable) {
    layer.setCity(ownCity as any);
  }

  if (layer instanceof Units) {
    layer.setActiveUnit(activeUnit);
  }

  layer.setViewport(originX, originY, width, height);

  return { layer, canvas };
};

// What the checks need of a layer: its origin, a given projection in place of its own, and a count of the tiles drawn.
const probes = new WeakMap<object, any>();

const probe = (Type: typeof Map): any => {
  if (probes.has(Type)) {
    return probes.get(Type);
  }

  const Probe = class extends (Type as any) {
    #make: ((layer: any) => Projection) | null = null;
    #projection: any = null;
    #wraps = true;
    drawn = 0;

    useProjection(make: ((layer: any) => Projection) | null): void {
      this.#make = make;
      this.#projection = null;
    }

    setWrapVertical(wrap: boolean): void {
      this.#wraps = wrap;
      this.#projection = null;

      super.setWrapVertical(wrap);
    }

    wraps(): boolean {
      return this.#wraps;
    }

    reachOf(): Reach {
      return this.reach();
    }

    overhangOf(): number {
      return this.overhang();
    }

    origin(): [number, number] {
      return [this.originX(), this.originY()];
    }

    protected projection(): any {
      if (this.#make === null) {
        return super.projection();
      }

      if (this.#projection === null) {
        this.#projection = this.#make(this);
      }

      return this.#projection;
    }

    protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
      this.drawn++;

      super.drawTile(tile, offsetX, offsetY);
    }
  };

  probes.set(Type, Probe);

  return Probe;
};

// --- The checks -----------------------------------------------------------------------------------------------------

const at = (canvas: Pixels, index: number): string =>
  `${index % canvas.width},${Math.floor(index / canvas.width)}`;

const inside = (canvas: Pixels, index: number, rects: Rect[]): boolean => {
  const x = index % canvas.width,
    y = Math.floor(index / canvas.width);

  return rects.some(
    (rect) =>
      x >= rect.x &&
      x < rect.x + rect.width &&
      y >= rect.y &&
      y < rect.y + rect.height
  );
};

type Scenario = {
  world: [number, number];
  scale: number;
  wrapVertical: boolean;
  canvas: [number, number];
  origin: [number, number];
  scrolls: [number, number][];
};

const scenarios: Scenario[] = [];

[
  [9, 8],
  [14, 10],
].forEach(([width, height]) =>
  [1, 2].forEach((scale) =>
    [true, false].forEach((wrapVertical) => {
      const tile = 16 * scale;

      scenarios.push(
        // From the top left of the world, with the seam off the canvas unless the world is narrower than it.
        {
          world: [width, height],
          scale,
          wrapVertical,
          canvas: [200, 150],
          origin: [0, 0],
          scrolls: [
            [7, 0],
            [0, -13],
            [-tile, tile / 2],
            [53, 31],
            [-300, 0],
          ],
        },
        // Straddling the seam both ways, on a canvas that isn't a whole number of tiles.
        {
          world: [width, height],
          scale,
          wrapVertical,
          canvas: [133, 97],
          origin: [-41, -tile - 5],
          scrolls: [
            [-9, 4],
            [tile * 2, 0],
            [-5, -tile],
          ],
        }
      );
    })
  )
);

const describe = (
  projection: ProjectionSpec,
  spec: LayerSpec,
  { world: [width, height], scale, wrapVertical, canvas, origin }: Scenario
): string =>
  `${spec.name} on ${projection.name}, ${width}x${height}${
    wrapVertical ? '' : ' stopping at the poles'
  } at scale ${scale}, ${canvas.join('x')} from ${origin.join(',')}`;

// The tiles to update: the corners and middle of the world (so its seams) and a spread of the rest.
const sampleTiles = (world: World): Tile[] =>
  world
    .tiles()
    .filter(
      ({ x, y }) =>
        ((x === 0 || x === world.width() - 1) &&
          (y === 0 || y === world.height() - 1)) ||
        (x * 3 + y * 5) % 9 === 0
    );

const updateMatchesRedraw = (
  projection: ProjectionSpec,
  spec: LayerSpec,
  scenario: Scenario
): void => {
  const name = describe(projection, spec, scenario),
    {
      world: [width, height],
      scale,
      wrapVertical,
      canvas: size,
      origin,
    } = scenario,
    world = makeWorld(width, height),
    isActiveUnit = spec.Type === TestActiveUnit;

  let activeUnit: any = isActiveUnit ? makeUnit('Active', 1, 1) : null;

  const updated = makeLayer(
      spec,
      projection,
      world,
      scale,
      wrapVertical,
      size,
      origin,
      activeUnit
    ),
    redrawMisses: string[] = [],
    dirtyMisses: string[] = [];

  sampleTiles(world).forEach((tile) =>
    spec.mutations.forEach((mutation) => {
      const previousActiveUnit = activeUnit,
        undo = isActiveUnit
          ? () => {
              activeUnit = previousActiveUnit;
            }
          : mutation.apply(tile);

      if (isActiveUnit) {
        activeUnit = makeUnit('Active', tile.x, tile.y);
      }

      [undo, null].forEach((next) => {
        const before = updated.canvas.snapshot();

        updated.layer.clearDirty();

        if (isActiveUnit) {
          updated.layer.setActiveUnit(activeUnit);
          updated.layer.update();
        } else {
          updated.layer.update([tile]);
        }

        const after = updated.canvas.snapshot(),
          redrawn = makeLayer(
            spec,
            projection,
            world,
            scale,
            wrapVertical,
            size,
            origin,
            activeUnit
          ).canvas.snapshot(),
          step = `${tile.x},${tile.y} ${mutation.name}${
            next === null ? ' undone' : ''
          }`,
          wrong = differences(after, redrawn),
          dirty = updated.layer.dirtyRects(),
          unmarked = differences(before, after).filter(
            (index) => !inside(after, index, dirty)
          );

        if (wrong.length > 0) {
          redrawMisses.push(
            `${step}: ${wrong.length} px, first at ${at(after, wrong[0])}`
          );
        }

        if (unmarked.length > 0) {
          dirtyMisses.push(
            `${step}: ${unmarked.length} px, first at ${at(after, unmarked[0])}`
          );
        }

        if (next !== null) {
          next();
        }
      });
    })
  );

  sweep(
    `${name}: updating a tile leaves what a full redraw would`,
    redrawMisses
  );
  sweep(`${name}: every pixel an update changes is marked dirty`, dirtyMisses);
};

const scrollMatchesRedraw = (
  projection: ProjectionSpec,
  spec: LayerSpec,
  scenario: Scenario
): void => {
  const name = describe(projection, spec, scenario),
    {
      world: [width, height],
      scale,
      wrapVertical,
      canvas: size,
      origin,
      scrolls,
    } = scenario,
    world = makeWorld(width, height),
    activeUnit = spec.Type === TestActiveUnit ? makeUnit('Active', 1, 1) : null,
    scrolled = makeLayer(
      spec,
      projection,
      world,
      scale,
      wrapVertical,
      size,
      origin,
      activeUnit
    ),
    misses: string[] = [];

  let [originX, originY] = origin;

  scrolls.forEach(([dx, dy]) => {
    originX += dx;
    originY += dy;

    scrolled.layer.setViewport(originX, originY, size[0], size[1]);

    const after = scrolled.canvas.snapshot(),
      fresh = makeLayer(
        spec,
        projection,
        world,
        scale,
        wrapVertical,
        size,
        [originX, originY],
        activeUnit
      ).canvas.snapshot(),
      wrong = differences(after, fresh);

    if (wrong.length > 0) {
      misses.push(
        `by ${dx},${dy} to ${originX},${originY}: ${
          wrong.length
        } px, first at ${at(after, wrong[0])}`
      );
    }
  });

  sweep(`${name}: scrolling leaves what drawing afresh would`, misses);
};

// A full render puts the tile in front on top: the same as drawing each tile's sprite, at every place it lands, from
//  the top of the canvas down and then from the left, here rather than by the projection's own order.
const fullRenderIsBackToFront = (
  projection: ProjectionSpec,
  spec: LayerSpec,
  scenario: Scenario
): void => {
  const {
      world: [width, height],
      scale,
      wrapVertical,
      canvas: [canvasWidth, canvasHeight],
      origin: [originX, originY],
    } = scenario,
    world = makeWorld(width, height),
    { layer, canvas } = makeLayer(
      spec,
      projection,
      world,
      scale,
      wrapVertical,
      [canvasWidth, canvasHeight],
      [originX, originY]
    ),
    grid: Projection = projection.make
      ? projection.make(layer)
      : new SquareProjection(16 * scale, world, wrapVertical),
    period = grid.wrapPeriod(),
    sprites: [Placement, FakeImage, number, number][] = [];

  world.tiles().forEach((tile) => {
    const sprite = spec.sprite!(tile, scale);

    if (sprite === null) {
      return;
    }

    const [image, dx, dy] = sprite,
      [tileX, tileY] = grid.tileToPixel(tile.x, tile.y);

    [-2, -1, 0, 1, 2].forEach((across) =>
      (period.y === null ? [0] : [-2, -1, 0, 1, 2]).forEach((down) => {
        const px = tileX + across * period.x - originX,
          py = tileY + down * (period.y ?? 0) - originY;

        if (
          px + dx < canvasWidth &&
          px + dx + image.naturalWidth * scale > 0 &&
          py + dy < canvasHeight &&
          py + dy + image.naturalHeight * scale > 0
        ) {
          sprites.push([{ x: tile.x, y: tile.y, px, py }, image, dx, dy]);
        }
      })
    );
  });

  const expected = new SoftwareCanvas(canvasWidth, canvasHeight),
    context = expected.getContext();

  sprites
    .sort(([a], [b]) => a.py - b.py || a.px - b.px || a.y - b.y || a.x - b.x)
    .forEach(([{ px, py }, image, dx, dy]) =>
      context.drawImage(
        image,
        px + dx,
        py + dy,
        image.naturalWidth * scale,
        image.naturalHeight * scale
      )
    );

  const wrong = differences(canvas.snapshot(), expected.snapshot());

  sweep(
    `${describe(
      projection,
      spec,
      scenario
    )}: a full render draws back to front`,
    wrong.length === 0
      ? []
      : [`${wrong.length} px, first at ${at(expected.snapshot(), wrong[0])}`]
  );
};

// The reach a layer declares covers what it draws past its box on the square grid (#486), and the margin it culls
//  tiles by covers its reach, or a tile just off the canvas that reaches on to it would never be drawn.
const reachIsCovered = (
  projection: ProjectionSpec,
  spec: LayerSpec,
  scenario: Scenario
): void => {
  const {
      world: [width, height],
      scale,
      wrapVertical,
      canvas,
      origin,
    } = scenario,
    { layer } = makeLayer(
      spec,
      projection,
      makeWorld(width, height),
      scale,
      wrapVertical,
      canvas,
      origin
    ),
    reach: Reach = layer.reachOf(),
    strip = spec.squareStrip(scale),
    sides = ['top', 'right', 'bottom', 'left'] as (keyof Reach)[],
    name = describe(projection, spec, scenario);

  expect(
    `${name}: the overhang covers the reach`,
    sides.filter((side) => reach[side] > layer.overhangOf()),
    []
  );
  expect(
    `${name}: the reach covers the square grid's strips`,
    sides.filter((side) => strip[side] > reach[side]),
    []
  );
};

const checkLayer = (
  projection: ProjectionSpec,
  spec: LayerSpec,
  scenario: Scenario
): void => {
  updateMatchesRedraw(projection, spec, scenario);
  scrollMatchesRedraw(projection, spec, scenario);

  if (spec.sprite) {
    fullRenderIsBackToFront(projection, spec, scenario);
  }
};

const checksOn = (projection: ProjectionSpec, spec: LayerSpec): boolean =>
  spec.projections === undefined || spec.projections.includes(projection.name);

// Checks a layer broken on purpose, and expects `check` to fail.
const caught = (
  description: string,
  projection: ProjectionSpec,
  spec: LayerSpec,
  check: string
): void => {
  const missed: string[] = [],
    counted = checks;

  collect = missed;

  scenarios
    .filter(({ scale, canvas }) => scale === 1 && canvas[0] === 200)
    .forEach((scenario) => checkLayer(projection, spec, scenario));

  collect = failures;
  checks = counted;

  expect(
    `${description} fails "${check}"`,
    missed.some((failure) => failure.includes(`: ${check}`)),
    true
  );
};

// What updating the tile in the middle of a big world costs a layer: the tiles drawn, the draw calls, the pixels
//  cleared and drawn, and the area the portal is told to composite.
const measureUpdate = (
  projection: ProjectionSpec,
  spec: LayerSpec,
  scale: number
): string[] => {
  const world = makeWorld(40, 26),
    canvas: [number, number] = [200, 150],
    tile = world.get(20, 12) as any,
    { layer: probeLayer } = makeLayer(
      spec,
      projection,
      world,
      scale,
      true,
      canvas,
      [0, 0]
    ),
    grid: Projection = probeLayer.projection(),
    [tileX, tileY] = grid.tileToPixel(20, 12),
    { width, height } = grid.footprint(),
    origin: [number, number] = [
      tileX + width / 2 - canvas[0] / 2,
      tileY + height / 2 - canvas[1] / 2,
    ],
    { layer, canvas: pixels } = makeLayer(
      spec,
      projection,
      world,
      scale,
      true,
      canvas,
      origin
    );

  layer.clearDirty();
  pixels.resetCounters();
  layer.drawn = 0;

  const undo = spec.mutations[0].apply(tile);

  layer.update([tile]);
  undo();

  const { calls, clearedPixels, paintedPixels } = pixels.counters;

  return [
    spec.name,
    projection.name,
    String(scale),
    String(layer.drawn),
    String(
      ['drawImage', 'fillRect', 'fillText', 'fill'].reduce(
        (total, method) => total + (calls[method] ?? 0),
        0
      )
    ),
    String(calls.clearRect ?? 0),
    String(clearedPixels),
    String(paintedPixels),
    String(
      mergeRects(layer.dirtyRects()).reduce(
        (total: number, rect: Rect) => total + rectArea(rect),
        0
      )
    ),
  ];
};

if (measure) {
  const rows = [
    [
      'Layer',
      'Projection',
      'Scale',
      'Tiles drawn',
      'Draw calls',
      'clearRect calls',
      'Cleared px',
      'Painted px',
      'Dirty px',
    ],
  ];

  [
    'Plain',
    'TallPlain',
    'Landscape',
    'Units',
    'Cities',
    'Yields',
    'CityNames',
  ].forEach((layerName) =>
    projectionSpecs.forEach((projection) =>
      [1, 2, 3].forEach((scale) => {
        const spec = layerSpecs.find(({ name }) => name === layerName)!;

        if (checksOn(projection, spec)) {
          rows.push(measureUpdate(projection, spec, scale));
        }
      })
    )
  );

  console.log(
    rows
      .map((row, index) =>
        [
          `| ${row.join(' | ')} |`,
          ...(index === 0 ? [`|${row.map(() => '---').join('|')}|`] : []),
        ].join('\n')
      )
      .join('\n')
  );

  finished = true;

  process.exit(errors.length ? 1 : 0);
}

projectionSpecs.forEach((projection) =>
  layerSpecs
    .filter((spec) => checksOn(projection, spec))
    .forEach((spec) =>
      scenarios.forEach((scenario) => {
        checkLayer(projection, spec, scenario);

        if (scenario === scenarios[0] || scenario === scenarios[2]) {
          reachIsCovered(projection, spec, scenario);
        }
      })
    )
);

const plain = layerSpecs.find(({ name }) => name === 'Plain')!,
  tallPlain = layerSpecs.find(({ name }) => name === 'TallPlain')!,
  units = layerSpecs.find(({ name }) => name === 'Units')!,
  square = projectionSpecs.find(({ name }) => name === 'square')!,
  brick = projectionSpecs.find(({ name }) => name === 'brick')!,
  tall = projectionSpecs.find(({ name }) => name === 'tall')!;

caught(
  'drawing brick tiles column by column',
  brokenOrder,
  plain,
  'a full render draws back to front'
);
caught(
  "clearing each brick tile's box before drawing it",
  brick,
  { ...plain, name: 'ClearsEachTile', Type: ClearsEachTile },
  'a full render draws back to front'
);
caught(
  'a tall layer with no reach',
  tall,
  { ...tallPlain, name: 'ReachTooSmall', Type: ReachTooSmall },
  'updating a tile leaves what a full redraw would'
);
caught(
  'units on the square grid with no reach, each tile cleared in its own box',
  square,
  { ...units, name: 'UnitsWithoutReach', Type: UnitsWithoutReach },
  'updating a tile leaves what a full redraw would'
);

// A city can go while the map scrolls, before the update that says so reaches the layer: the strip the scroll uncovers
//  is drawn from the world, without the city, and clears only its own part of the name. The update still has to clear
//  the rest.
const cityGoesWhileScrolling = (
  projection: ProjectionSpec,
  scenario: Scenario
): void => {
  const spec = layerSpecs.find(({ name }) => name === 'CityNames')!,
    {
      world: [width, height],
      scale,
      wrapVertical,
      canvas: size,
      origin,
    } = scenario,
    world = makeWorld(width, height),
    tileSize = 16 * scale,
    misses: string[] = [];

  world
    .tiles()
    .filter((tile) => tile.city)
    .forEach((tile) =>
      [
        [tileSize * 2, 0],
        [-tileSize * 2, 0],
        [0, tileSize],
        [7, -5],
      ].forEach(([dx, dy]) => {
        const { layer, canvas } = makeLayer(
            spec,
            projection,
            world,
            scale,
            wrapVertical,
            size,
            origin
          ),
          moved: [number, number] = [origin[0] + dx, origin[1] + dy],
          undo = swap('city', () => null)(tile);

        layer.setViewport(...moved, ...size);
        layer.update([{ ...tile }]);

        const after = canvas.snapshot(),
          wrong = differences(
            after,
            makeLayer(
              spec,
              projection,
              world,
              scale,
              wrapVertical,
              size,
              moved
            ).canvas.snapshot()
          );

        if (wrong.length > 0) {
          misses.push(
            `${tile.x},${tile.y} by ${dx},${dy}: ${
              wrong.length
            } px, first at ${at(after, wrong[0])}`
          );
        }

        undo();
      })
    );

  sweep(
    `${describe(
      projection,
      spec,
      scenario
    )}: a city that goes while the map scrolls has all of its name cleared`,
    misses
  );
};

projectionSpecs.forEach((projection) =>
  scenarios.forEach((scenario) => cityGoesWhileScrolling(projection, scenario))
);

sweep('nothing a layer drew was logged as an error', errors);

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL overlapDraw\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  // Not `process.exit(1)`: that drops whatever of the report has not been
  // flushed yet (macOS cuts it at 128 KiB), so a long failure list lost its
  // tail. The exit code is set and node exits once the write has drained.
  process.exitCode = 1;
}

console.log(`PASS overlapDraw (${checks} checks)`);
