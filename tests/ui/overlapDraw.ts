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
// On the square grid a tile is drawn into its own box, cleared first, so a tile's update is that box alone. Three
//  layers draw a few pixels past the box, which an update of a neighbour then clears without redrawing (#486): the
//  copy behind a stack of units (`scale` px up and left), the city glyph (`scale` px right and down) and a row of six
//  yield icons (to the right). For those layers the redraw may differ from a full one only in a strip that wide along
//  the edges of a box; everywhere else, and for every other layer, it has to be the same.

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
import Fog from '../../src/js/UI/components/Map/Fog';
import Landscape from '../../src/js/UI/components/Map/Landscape';
import Map from '../../src/js/UI/components/Map';
import { Rect } from '../../src/js/UI/lib/viewport';
import { Tile } from '../../src/js/UI/types';
import Units from '../../src/js/UI/components/Map/Units';
import Unworkable from '../../src/js/UI/components/Map/Unworkable';
import World from '../../src/js/UI/components/World';
import Yields from '../../src/js/UI/components/Map/Yields';

useSoftwareCanvases();

const failures: string[] = [],
  errors: string[] = [];
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
    failures.push(
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
    failures.push(
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

// Every sprite has a scattering of see-through pixels, as real ones do, so what is under it shows.
setSpriteMask((path, x, y) => (mix(stringHash(path), x, y) % 5 === 0 ? 0 : 1));

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

type Reach = { top: number; right: number; bottom: number; left: number };

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
  // How far past a tile's square box the layer draws on the square grid (#486).
  squareStrip: (scale: number) => Reach;
};

const layerSpecs: LayerSpec[] = [
  {
    name: 'Plain',
    Type: Plain,
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
    // Moving the active unit to the tile: `apply` is given the layer's tile and the layers to tell.
    mutations: [{ name: 'the active unit moves here', apply: () => () => {} }],
    squareStrip: () => noReach,
  },
];

// How a layer is drawn: the projection it is given (none: the layer's own square one), and the reach the test
//  allows it on that projection.
type ProjectionSpec = {
  name: string;
  make: ((layer: Map) => any) | null;
  strip: (spec: LayerSpec, scale: number) => Reach;
};

const projectionSpecs: ProjectionSpec[] = [
  {
    name: 'square',
    make: null,
    strip: (spec, scale) => spec.squareStrip(scale),
  },
];

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
    #make: ((layer: Map) => any) | null = null;
    #projection: any = null;
    drawn = 0;

    useProjection(make: ((layer: Map) => any) | null): void {
      this.#make = make;
      this.#projection = null;
    }

    origin(): [number, number] {
      return [this.originX(), this.originY()];
    }

    protected projection(): any {
      if (this.#make === null) {
        return super.projection();
      }

      if (this.#projection === null) {
        this.#projection = this.#make(this as unknown as Map);
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

// Whether a canvas pixel is in a strip `reach` wide along the edge of a square tile's box: where a sprite drawn past
//  its own box lands in its neighbour's, or where its neighbour's lands in it.
const inStrip = (
  canvas: Pixels,
  index: number,
  [originX, originY]: [number, number],
  tileSize: number,
  reach: Reach
): boolean => {
  const x =
      ((((index % canvas.width) + originX) % tileSize) + tileSize) % tileSize,
    y =
      (((Math.floor(index / canvas.width) + originY) % tileSize) + tileSize) %
      tileSize;

  return (
    x < reach.right ||
    x >= tileSize - reach.left ||
    y < reach.bottom ||
    y >= tileSize - reach.top
  );
};

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

// The strip pixels each layer was allowed to differ by, for the summary.
const stripPixels: { [layer: string]: number } = {};

// The differing pixels that aren't in a strip the layer is allowed to differ in, counting the ones that are.
const outsideStrips = (
  spec: LayerSpec,
  canvas: Pixels,
  differing: number[],
  origin: [number, number],
  tileSize: number,
  strip: Reach
): number[] =>
  differing.filter((index) => {
    if (!inStrip(canvas, index, origin, tileSize, strip)) {
      return true;
    }

    stripPixels[spec.name] = (stripPixels[spec.name] ?? 0) + 1;

    return false;
  });

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
        (x * 3 + y * 5) % 7 === 0
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
    tileSize = 16 * scale,
    strip = projection.strip(spec, scale),
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
          wrong = outsideStrips(
            spec,
            after,
            differences(after, redrawn),
            origin,
            tileSize,
            strip
          ),
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
    tileSize = 16 * scale,
    strip = projection.strip(spec, scale),
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
      wrong = outsideStrips(
        spec,
        after,
        differences(after, fresh),
        [originX, originY],
        tileSize,
        strip
      );

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

projectionSpecs.forEach((projection) =>
  layerSpecs.forEach((spec) =>
    scenarios.forEach((scenario) => {
      updateMatchesRedraw(projection, spec, scenario);
      scrollMatchesRedraw(projection, spec, scenario);
    })
  )
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

console.log(
  `PASS overlapDraw (${checks} checks; on the square grid the strips past a tile's box (#486) differed by ${
    Object.entries(stripPixels)
      .map(([layer, pixels]) => `${layer} ${pixels} px`)
      .join(', ') || 'nothing'
  })`
);
