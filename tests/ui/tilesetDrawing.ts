// The map is drawn the way the tileset says (#56, #92). `Landscape` and `Fog` take every sprite name, which neighbours
//  each family looks at, how the directions are written, which terrains join up, the coast's bit order, the lone
//  road's dot and where specials go from the descriptor, and the directions themselves from the world's topology.
//  `renderUnit`, `Units`, `Cities` and `CityNames` take the unit and city sprites, which colours are swapped for which
//  of the player's, the fortified overlay, where the copy behind a stack goes, the city's box, and where the labels and
//  the busy letter go (#56 d3). Drawn with Civ1's descriptor they draw what Civ1 does; drawn with a descriptor that
//  renames and rearranges all of it they draw that one's, with no change to the code. The Civ1 expectations here are
//  written by hand from what the code drew before. That everything is still drawn where it was is
//  tests/ui/renderGeometry.ts's to prove; it leaves out the units' and cities' colours, which these checks cover.

// Must stay first: it gives the layers a `document` and the preloaded images to draw with.
import { FakeImage, preloadImage } from './lib/fakeCanvas';

import Cities from '../../src/js/UI/components/Map/Cities';
import CityNames from '../../src/js/UI/components/Map/CityNames';
import Fog from '../../src/js/UI/components/Map/Fog';
import Landscape from '../../src/js/UI/components/Map/Landscape';
import Units from '../../src/js/UI/components/Map/Units';
import i18next from 'i18next';
import { Tile } from '../../src/js/UI/types';
import { TilesetDescriptor } from '../../src/js/UI/tilesets/TilesetDescriptor';
import World from '../../src/js/UI/components/World';
import { drawUnitActionIcon } from '../../src/js/UI/lib/unitActionIcon';
import renderUnit from '../../src/js/UI/lib/renderUnit';
import { createTopology } from '@civ-clone/core-world/topologies';
import currentTileset from '../../src/js/UI/lib/tilesets';

const failures: string[] = [];
let checks = 0,
  finished = false;

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

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL tilesetDrawing: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

// The colours of each preloaded sprite's pixels, left to right, by its path: `replaceColours` reads them back from the
//  canvas it drew the sprite on.
const pixels: { [path: string]: string[] } = {};

const hex = (data: ArrayLike<number>, offset: number): string =>
  `#${Array.from({ length: 3 }, (_, index) =>
    data[offset + index].toString(16).padStart(2, '0')
  ).join('')}`;

// Every call a canvas's context is given, and every property set on it, as one line each. A canvas a sprite was drawn
//  on gives back that sprite's pixels, and the pixels put back on it are written as their colours.
const recordingCanvas = (width: number, height: number) => {
  const calls: string[] = [];
  let source: string[] = [];

  const context = new Proxy({} as { [key: string]: unknown }, {
    get: (target, name: string) => {
      if (name in target) {
        return target[name];
      }

      if (name === 'getImageData') {
        return () => ({
          data: Uint8ClampedArray.from(
            source.flatMap((colour) => [
              ...[1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)),
              255,
            ])
          ),
        });
      }

      if (name === 'putImageData') {
        return ({ data }: { data: Uint8ClampedArray }) =>
          calls.push(
            `putImageData(${Array.from(
              { length: data.length / 4 },
              (_, index) => hex(data, index * 4)
            ).join(',')})`
          );
      }

      return (...args: unknown[]) => {
        if (name === 'drawImage' && args[0] instanceof FakeImage) {
          source = pixels[(args[0] as FakeImage).path] ?? [];
        }

        calls.push(
          `${name}(${args
            .map((arg) =>
              typeof arg === 'number'
                ? arg
                : arg instanceof FakeImage
                ? arg.path
                : typeof arg
            )
            .join(',')})`
        );
      };
    },
    set: (target, name: string, value: unknown) => {
      calls.push(`${name}=${value}`);

      return true;
    },
  });

  return {
    calls,
    canvas: {
      width,
      height,
      getContext: () => context,
    } as unknown as HTMLCanvasElement,
  };
};

// A coast square is put together on a canvas from `s('<canvas …>')`: what is drawn on each is kept here.
const madeCanvases: string[][] = [];

Object.assign((globalThis as any).document, {
  createElement: () => {
    let html = '';

    return {
      set innerHTML(value: string) {
        html = value;
      },
      get firstElementChild() {
        const size = (attribute: string): number =>
            Number(html.match(new RegExp(`${attribute}="(\\d+)"`))?.[1] ?? 0),
          { calls, canvas } = recordingCanvas(size('width'), size('height'));

        madeCanvases.push(calls);

        return canvas;
      },
    };
  },
});

// Civ1's descriptor, and one that names, joins and arranges everything differently.
const civ1 = currentTileset(),
  stub: TilesetDescriptor = {
    ...JSON.parse(JSON.stringify(civ1)),
    id: 'stub',
    names: {
      terrain: { Hills: 'hl' },
      special: { 'Forest:Game': 'deer' },
      unit: { Settlers: 'colonists' },
    },
    families: {
      base: { land: 'ground/land', ocean: 'ground/sea' },
      terrain: {
        method: 'bitmask',
        neighbours: 'edges',
        sprite: 'land/{terrain}/{dirs}',
        isolated: 'land/{terrain}/alone',
        join: '-',
        skip: ['Ocean', 'Desert'],
        matches: {
          River: ['River', '@water'],
          Plains: ['Plains', 'Grassland'],
        },
      },
      coast: {
        ...civ1.families.coast,
        strip: { sprite: 'ground/shore', cell: 16, quarter: 8 },
        order: [...civ1.families.coast.order].reverse(),
      },
      riverMouth: {
        method: 'edges',
        neighbours: 'edges',
        sprite: 'water/mouth-{dir}',
      },
      irrigation: { sprite: 'imp/water' },
      mine: { sprite: 'imp/dig' },
      pollution: { sprite: 'imp/smog' },
      road: {
        method: 'edges',
        neighbours: 'edges',
        sprite: 'ways/road/{dir}',
        isolated: { dot: '#123', size: 3 },
      },
      railroad: {
        method: 'edges',
        neighbours: 'edges',
        sprite: 'ways/rail/{dir}',
        isolated: 'ways/rail/alone',
      },
      fog: {
        method: 'bitmask',
        neighbours: 'edges',
        sprite: 'fog/{dirs}',
      },
      special: {
        sprite: 'spec/{special}',
        anchors: { Shield: { x: 1, y: 2 } },
      },
      hut: { sprite: 'spec/hut' },
    },
    units: {
      sprite: 'troops/{unit}',
      // The keys the other way round, and both swapped for the player's second colour.
      colouring: {
        mode: 'replaceColours',
        keys: ['#2C7800', '#60E064'],
        colours: [1, 1],
      },
      fortified: 'troops/dug-in',
      stackOffset: { x: 2, y: 1 },
      status: { x: 0.25, baseline: 0.5, fontSize: 6 },
    },
    cities: {
      mode: 'box',
      sprite: 'towns/city',
      inset: 3,
      occupied: '#444444',
      colouring: { mode: 'replaceColours', keys: ['#abcdef'], colours: [0] },
      labels: {
        x: 0.25,
        sizeBaseline: 0.5,
        nameBaseline: 1.25,
        fontSize: 6,
        disorderIcon: { x: 2, y: 3 },
      },
    },
  };

// Only the coast strips are preloaded: the other sprites are looked for and missed, which is all this needs to see, so
//  the lookup's report of each miss is kept quiet.
console.error = () => {};

// The coast strips, so a coast square can be cut from them.
preloadImage('terrain/coast_sprite', 128, 16);
preloadImage('ground/shore', 128, 16);

// The units and cities, each pixel a colour key or one that is left alone, and the overlays.
(
  [
    ['units/settlers', ['#60E064', '#2C7800', '#123456']],
    ['troops/colonists', ['#60E064', '#2C7800', '#123456']],
    ['map/city', ['#000000', '#123456']],
    ['towns/city', ['#abcdef', '#123456']],
  ] as [string, string[]][]
).forEach(([path, colours]) => {
  preloadImage(path, colours.length, 1);
  pixels[path] = colours;
});
preloadImage('map/fortify', 3, 1);
preloadImage('troops/dug-in', 3, 1);
preloadImage('city/people_unhappy_m', 3, 3);

// No translations: a busy state's letter is the capitals of its name.
i18next.init({ lng: 'en', resources: {}, initImmediate: false } as any);

// A player whose civilization's colours are red and blue.
const player = {
  id: 'Player-1',
  civilization: {
    attributes: [{ name: 'colors', value: ['#ff0000', '#0000ff'] }],
  },
};

type TileChanges = {
  terrain?: string;
  features?: string[];
  improvements?: string[];
  goodyHut?: boolean;
  city?: boolean | { size: number; disorder?: boolean };
  units?: { _: string; busy?: string; fortified?: boolean }[];
};

const water = ['Ocean'];

// A world `width` × `height` on `topologyId`'s grid, all Grassland but for the tiles `changes` names by `x,y`.
const makeWorld = (
  width: number,
  height: number,
  changes: { [at: string]: TileChanges },
  topologyId: string = 'square'
): World => {
  const tiles: Tile[] = [],
    isLandAt = (x: number, y: number): boolean =>
      !water.includes(changes[`${x},${y}`]?.terrain ?? 'Grassland');

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const {
          terrain = 'Grassland',
          features = [],
          improvements = [],
          goodyHut = false,
          city = false,
          units = [],
        } = changes[`${x},${y}`] ?? {},
        isLand = isLandAt(x, y);

      tiles.push({
        _: 'Tile',
        id: `Tile-${x}-${y}`,
        x,
        y,
        city: city
          ? {
              id: `City-${x}-${y}`,
              name: `City ${x} ${y}`,
              player,
              civilDisorderDeclared: city !== true && !!city.disorder,
              growth: { size: city === true ? 1 : city.size },
            }
          : null,
        units: units.map(({ _, busy, fortified }, index) => ({
          id: `Unit-${x}-${y}-${index}`,
          _,
          player,
          busy: busy ? { _: busy } : null,
          defence: { value: 1 },
          improvements: fortified ? [{ _: 'Fortified' }] : [],
        })),
        goodyHut: goodyHut ? {} : null,
        improvements: improvements.map((_) => ({ _ })),
        isCoast:
          !isLand &&
          [-1, 0, 1].some((dy) =>
            [-1, 0, 1].some((dx) =>
              isLandAt((x + dx + width) % width, (y + dy + height) % height)
            )
          ),
        isLand,
        isWater: !isLand,
        terrain: { _: terrain, features: features.map((_) => ({ _ })) },
      } as unknown as Tile);
    }
  }

  return new World({ width, height, tiles, topologyId } as any);
};

// What a layer draws for one tile at 0,0 at 2×: each sprite with where it goes, and anything else it does to the
//  canvas.
const drawn = (
  Layer:
    | typeof Landscape
    | typeof Fog
    | typeof Units
    | typeof Cities
    | typeof CityNames,
  tileset: TilesetDescriptor,
  world: World,
  x: number,
  y: number
): string[] => {
  const { calls, canvas } = recordingCanvas(200, 200),
    sprites: string[] = [];

  class Recording extends (Layer as typeof Landscape) {
    tileset(): TilesetDescriptor {
      return tileset;
    }

    protected drawImage(
      path: string,
      offsetX: number,
      offsetY: number,
      options: { offsetX?: number; offsetY?: number } = {}
    ): void {
      sprites.push(
        `${path}@${offsetX + (options.offsetX ?? 0)},${
          offsetY + (options.offsetY ?? 0)
        }`
      );

      super.drawImage(path, offsetX, offsetY, options);
    }

    draw(tile: Tile): void {
      this.drawTile(tile, 0, 0);
    }
  }

  new Recording(world, 2, 16, canvas).draw(world.get(x, y));

  // A sprite that is not in the preload container draws nothing, so only the dots and the coast reach the canvas.
  return [
    ...sprites,
    ...calls.filter((call) => !call.startsWith('imageSmoothingEnabled')),
  ];
};

// Both descriptors over the same tile: what each draws.
const both = (
  Layer:
    | typeof Landscape
    | typeof Fog
    | typeof Units
    | typeof Cities
    | typeof CityNames,
  world: World,
  x: number,
  y: number
) => [drawn(Layer, civ1, world, x, y), drawn(Layer, stub, world, x, y)];

expect(
  'the stub descriptor is one the renderer reads',
  (() => {
    try {
      require('../../src/js/UI/tilesets/TilesetDescriptor').validateDescriptor(
        stub
      );

      return null;
    } catch (error) {
      return (error as Error).message;
    }
  })(),
  null
);

expect(
  'land: the base sprite, then the terrain joined to its own kind on each edge, written as the tileset joins them',
  both(
    Landscape,
    makeWorld(5, 5, {
      '2,2': { terrain: 'Hills' },
      '2,1': { terrain: 'Hills' },
      '3,2': { terrain: 'Hills' },
      // Only the edges count for this family: a corner of the same terrain is not a join.
      '3,3': { terrain: 'Hills' },
    }),
    2,
    2
  ),
  [
    ['terrain/land@0,0', 'terrain/hills_ne@0,0'],
    ['ground/land@0,0', 'land/hl/n-e@0,0'],
  ]
);

expect(
  'a terrain that joins nothing is drawn alone, as the tileset names that',
  both(Landscape, makeWorld(5, 5, { '2,2': { terrain: 'Hills' } }), 2, 2),
  [
    ['terrain/land@0,0', 'terrain/hills@0,0'],
    ['ground/land@0,0', 'land/hl/alone@0,0'],
  ]
);

expect(
  'what a terrain joins is what the tileset says: here Plains joins Grassland too',
  both(
    Landscape,
    makeWorld(5, 5, {
      '2,2': { terrain: 'Plains' },
      '2,1': { terrain: 'Plains' },
      '1,2': { terrain: 'Plains' },
    }),
    2,
    2
  ),
  [
    ['terrain/land@0,0', 'terrain/plains_nw@0,0'],
    ['ground/land@0,0', 'land/plains/n-e-s-w@0,0'],
  ]
);

expect(
  'and a terrain it skips has no terrain sprite',
  both(Landscape, makeWorld(5, 5, { '2,2': { terrain: 'Desert' } }), 2, 2),
  [['terrain/land@0,0', 'terrain/desert@0,0'], ['ground/land@0,0']]
);

expect(
  'a River joins water as well as River, as both tilesets say',
  both(
    Landscape,
    makeWorld(5, 5, {
      '2,2': { terrain: 'River' },
      '1,2': { terrain: 'Ocean' },
    }),
    2,
    2
  ),
  [
    ['terrain/land@0,0', 'terrain/river_w@0,0'],
    ['ground/land@0,0', 'land/river/w@0,0'],
  ]
);

// Coast squares are cached by tileset and bitmask for the session, so this is the only check to draw these two (Civ1's
//  17 and the stub's 136): another drawing either first would leave nothing to look at below.
madeCanvases.length = 0;

// The coast square's four quarters are cut from the strip's columns that the bitmask picks: with land to the west and
//  the east, that is bits 0 and 4 in Civ1's order (17: columns 1, 4, 1, 4) and bits 7 and 3 in the reversed one (136:
//  columns 0, 2, 0, 2).
expect(
  'water: the base sprite, a coast square cut by the bit order the tileset gives, and river mouths by edge',
  both(
    Landscape,
    makeWorld(5, 5, {
      '2,2': { terrain: 'Ocean' },
      '1,2': { terrain: 'Hills' },
      '3,2': { terrain: 'River' },
      '2,1': { terrain: 'Ocean' },
      '2,3': { terrain: 'Ocean' },
      '1,1': { terrain: 'Ocean' },
      '3,1': { terrain: 'Ocean' },
      '1,3': { terrain: 'Ocean' },
      '3,3': { terrain: 'Ocean' },
    }),
    2,
    2
  ),
  [
    [
      'terrain/ocean@0,0',
      'terrain/river_mouth_e@0,0',
      'drawImage(object,0,0,32,32)',
    ],
    ['ground/sea@0,0', 'water/mouth-e@0,0', 'drawImage(object,0,0,32,32)'],
  ]
);
expect(
  'and the quarters come from the columns the order picks',
  madeCanvases.map((calls) =>
    calls
      .filter((call) => call.startsWith('drawImage'))
      .map((call) => Number(call.split(',')[1]) / 8)
  ),
  [
    // Each quarter is `column × 2`, plus one for a right-hand quarter, in quarters across the strip.
    [2, 9, 3, 8],
    [0, 5, 1, 4],
  ]
);

expect(
  'irrigation, mines, pollution, specials and huts by the names the tileset gives, specials where it anchors them',
  both(
    Landscape,
    makeWorld(5, 5, {
      '2,2': {
        terrain: 'Grassland',
        features: ['Shield'],
        improvements: ['Irrigation', 'Mine', 'Pollution'],
        goodyHut: true,
      },
    }),
    2,
    2
  ).concat(
    both(
      Landscape,
      makeWorld(5, 5, { '2,2': { terrain: 'Forest', features: ['Game'] } }),
      2,
      2
    ).map((sprites) => sprites.slice(-1))
  ),
  [
    [
      'terrain/land@0,0',
      'improvements/irrigation@0,0',
      'terrain/grassland_nesw@0,0',
      'improvements/mine@0,0',
      'improvements/pollution@0,0',
      'terrain/shield@8,8',
      'map/hut@0,0',
    ],
    [
      'ground/land@0,0',
      'imp/water@0,0',
      'land/grassland/n-e-s-w@0,0',
      'imp/dig@0,0',
      'imp/smog@0,0',
      'spec/shield@2,4',
      'spec/hut@0,0',
    ],
    ['terrain/doe@0,0'],
    ['spec/deer@0,0'],
  ]
);

expect(
  'roads and railroads join the neighbours each family looks at, no road under a railroad going the same way',
  both(
    Landscape,
    makeWorld(5, 5, {
      '2,2': { improvements: ['Road', 'Railroad'] },
      '2,1': { improvements: ['Road'] },
      '3,2': { improvements: ['Road', 'Railroad'] },
      '3,1': { improvements: ['Road', 'Railroad'] },
    }),
    2,
    2
  ),
  [
    [
      'terrain/land@0,0',
      'terrain/grassland_nesw@0,0',
      'improvements/road_n@0,0',
      'improvements/railroad_ne@0,0',
      'improvements/railroad_e@0,0',
    ],
    [
      'ground/land@0,0',
      'land/grassland/n-e-s-w@0,0',
      'ways/road/n@0,0',
      'ways/rail/e@0,0',
    ],
  ]
);

expect(
  "a road that joins nothing the family looks at is the tileset's dot, here a 3px one",
  both(
    Landscape,
    makeWorld(5, 5, {
      '2,2': { improvements: ['Road'] },
      // Civ1's roads look at the corners too; the stub's only at the edges.
      '3,1': { improvements: ['Road'] },
    }),
    2,
    2
  ),
  [
    [
      'terrain/land@0,0',
      'terrain/grassland_nesw@0,0',
      'improvements/road_ne@0,0',
    ],
    [
      'ground/land@0,0',
      'land/grassland/n-e-s-w@0,0',
      'fillStyle=#123',
      'beginPath()',
      'rect(13,13,6,6)',
      'fill()',
    ],
  ]
);

expect(
  "Civ1's lone road is its 2px brown dot",
  drawn(
    Landscape,
    civ1,
    makeWorld(5, 5, { '2,2': { improvements: ['Road'] } }),
    2,
    2
  ),
  [
    'terrain/land@0,0',
    'terrain/grassland_nesw@0,0',
    'fillStyle=#8c5828',
    'beginPath()',
    'rect(14,14,4,4)',
    'fill()',
  ]
);

expect(
  "and a lone railroad is Civ1's 2px black dot, or the stub's sprite",
  both(
    Landscape,
    makeWorld(5, 5, { '2,2': { improvements: ['Road', 'Railroad'] } }),
    2,
    2
  ),
  [
    [
      'terrain/land@0,0',
      'terrain/grassland_nesw@0,0',
      'fillStyle=#000',
      'beginPath()',
      'rect(14,14,4,4)',
      'fill()',
    ],
    ['ground/land@0,0', 'land/grassland/n-e-s-w@0,0', 'ways/rail/alone@0,0'],
  ]
);

expect(
  'fog: one sprite per unknown edge for Civ1, one for all of them for the stub',
  both(
    Fog,
    makeWorld(5, 5, {
      '2,1': { terrain: 'Unknown' },
      '1,2': { terrain: 'Unknown' },
      '1,1': { terrain: 'Unknown' },
    }),
    2,
    2
  ),
  [['map/fog_n@0,0', 'map/fog_w@0,0'], ['fog/nw@0,0']]
);

// On another grid the directions are that grid's: a hexagonal world's six, in the order its topology gives them. River
//  mouths are only drawn on a coast, and Civ1's coast is cut for square tiles, so they wait for a hexagonal pack's
//  coast (#94/#97).
const hexTopology = createTopology('hex-odd-r', 6, 4),
  hexDirections = hexTopology.directions(),
  // A hexagonal world with `changes` on 2,1 and every tile around it.
  hexWorld = (changes: TileChanges): World =>
    makeWorld(
      6,
      4,
      Object.fromEntries([
        ['2,1', changes],
        ...hexDirections.map((direction) => [
          hexTopology.neighbour(2, 1, direction)!.join(','),
          changes,
        ]),
      ]),
      'hex-odd-r'
    );

expect("a hexagonal grid's directions", hexDirections, [
  'ne',
  'e',
  'se',
  'sw',
  'w',
  'nw',
]);
expect(
  'fog on a hexagonal world is named for its six edges',
  drawn(
    Fog,
    civ1,
    makeWorld(
      6,
      4,
      Object.fromEntries(
        hexDirections.map((direction) => [
          hexTopology.neighbour(2, 1, direction)!.join(','),
          { terrain: 'Unknown' },
        ])
      ),
      'hex-odd-r'
    ),
    2,
    1
  ),
  hexDirections.map((direction) => `map/fog_${direction}@0,0`)
);
expect(
  'and so are its roads',
  drawn(Landscape, civ1, hexWorld({ improvements: ['Road'] }), 2, 1).filter(
    (sprite) => sprite.startsWith('improvements/')
  ),
  hexDirections.map((direction) => `improvements/road_${direction}@0,0`)
);

// What the canvases a draw made had put on them: the sprites drawn on them and the pixels recoloured on them.
const madeDraws = (draw: () => unknown): string[] => {
  madeCanvases.length = 0;

  draw();

  return madeCanvases
    .flat()
    .filter(
      (call) =>
        call.startsWith('putImageData') ||
        /^drawImage\([a-z-]+\/[a-z_-]+,/.test(call)
    );
};

const stackWorld = () =>
  makeWorld(5, 5, {
    '2,2': {
      units: [
        { _: 'Settlers', busy: 'Fortified', fortified: true },
        { _: 'Settlers' },
      ],
    },
  });

// At 2× on 16px tiles: Civ1's copy behind a stack goes a step up and left, and the letter is centred three quarters of
//  the way down in 16px; the stub's copy goes two steps right and one down, and its letter a quarter across and half
//  way down in 12px.
expect(
  'a stack: the copy behind it where the tileset moves it, the unit, and its busy letter where the tileset puts it',
  both(Units, stackWorld(), 2, 2),
  [
    [
      'drawImage(object,-2,-2,6,2)',
      'drawImage(object,0,0,6,2)',
      'font=bold 16px sans-serif',
      'textAlign=center',
      'fillStyle=black',
      'fillText(string,18,24)',
      'fillStyle=white',
      'fillText(string,16,22)',
    ],
    [
      'drawImage(object,4,2,6,2)',
      'drawImage(object,0,0,6,2)',
      'font=bold 12px sans-serif',
      'textAlign=center',
      'fillStyle=black',
      'fillText(string,10,16)',
      'fillStyle=white',
      'fillText(string,8,14)',
    ],
  ]
);

// A player of its own, green and yellow, so these are drawn afresh rather than found in the cache the stack above
//  filled.
const fortifiedSettlers = {
  _: 'Settlers',
  player: {
    ...player,
    civilization: {
      attributes: [{ name: 'colors', value: ['#00ff00', '#ffff00'] }],
    },
  },
  improvements: [{ _: 'Fortified' }],
} as any;

expect(
  "a unit is the tileset's sprite, its keys swapped for the player's colours the tileset names, under its overlay",
  [civ1, stub].map((tileset) =>
    madeDraws(() => renderUnit(fortifiedSettlers, tileset))
  ),
  [
    [
      'drawImage(units/settlers,0,0,3,1)',
      // Civ1's keys take the player's colours in order.
      'putImageData(#00ff00,#ffff00,#123456)',
      'drawImage(map/fortify,0,0)',
    ],
    [
      'drawImage(troops/colonists,0,0,3,1)',
      // Both of the stub's take the second.
      'putImageData(#ffff00,#ffff00,#123456)',
      'drawImage(troops/dug-in,0,0)',
    ],
  ]
);

expect(
  'and the copy behind a stack reaches past the tile on the sides the tileset moves it to',
  [civ1, stub].map((tileset) => {
    class Reaching extends Units {
      tileset(): TilesetDescriptor {
        return tileset;
      }

      reachNow() {
        return this.reach();
      }
    }

    return new Reaching(
      stackWorld(),
      2,
      16,
      recordingCanvas(200, 200).canvas
    ).reachNow();
  }),
  [
    { top: 2, right: 0, bottom: 0, left: 2 },
    { top: 0, right: 4, bottom: 2, left: 0 },
  ]
);

// A player of their own each, so nothing is found in a cache an earlier check filled.
const playerWith = (colours: string[]) => ({
  ...player,
  civilization: { attributes: [{ name: 'colors', value: colours }] },
});

expect(
  'a civilization with fewer colours than the keys take, or a key taking a colour past its last, gets its first',
  [
    madeDraws(() =>
      renderUnit(
        {
          _: 'Settlers',
          player: playerWith(['#00ffff']),
          improvements: [],
        } as any,
        civ1
      )
    ),
    madeDraws(() =>
      renderUnit(
        {
          _: 'Settlers',
          player: playerWith(['#ff00ff', '#888888']),
          improvements: [],
        } as any,
        {
          ...stub,
          id: 'past-the-end',
          units: {
            ...stub.units,
            colouring: {
              mode: 'replaceColours',
              keys: ['#60E064', '#2C7800'],
              colours: [5, 1],
            },
          },
        }
      )
    ),
  ].map((draws) => draws.filter((call) => call.startsWith('putImageData'))),
  [
    ['putImageData(#00ffff,#00ffff,#123456)'],
    ['putImageData(#ff00ff,#888888,#123456)'],
  ]
);

// The city in the action buttons is drawn as the map draws it: on the civilization's first colour, a pixel in, with
//  its black swapped for the second.
expect(
  "the action buttons' city: the civilization's first colour inset as the tileset says, and its keys swapped",
  (() => {
    const { calls, canvas } = recordingCanvas(16, 16);

    Object.assign(canvas, { clientWidth: 16 });
    (globalThis as any).devicePixelRatio = 1;

    const made = madeDraws(() =>
      drawUnitActionIcon(canvas, [
        { type: 'city', text: null, colours: ['#00ff00', '#ff00ff'] },
      ])
    );

    return [
      calls.filter((call) => /^(fillStyle|fillRect|drawImage)/.test(call)),
      made.filter((call) => call.startsWith('putImageData')),
    ];
  })(),
  [
    ['fillStyle=#00ff00', 'fillRect(1,1,14,14)', 'drawImage(object,1,1)'],
    ['putImageData(#ff00ff,#123456)'],
  ]
);

const cityWorld = (disorder = false) =>
  makeWorld(5, 5, {
    '2,2': { city: { size: 3, disorder }, units: [{ _: 'Settlers' }] },
  });

madeCanvases.length = 0;

// Civ1's city is on black when it has units, in a box of the player's first colour a pixel in, with its black swapped
//  for the player's second colour; the stub's is on grey, three pixels in, with its key swapped for the first.
expect(
  "a city with units in it: the tileset's occupied colour, the player's box inset as it says, and its sprite",
  both(Cities, cityWorld(), 2, 2),
  [
    [
      'map/city@2,2',
      'fillStyle=#000',
      'fillRect(0,0,32,32)',
      'fillStyle=#ff0000',
      'fillRect(2,2,28,28)',
      'drawImage(object,2,2,4,2)',
    ],
    [
      'towns/city@6,6',
      'fillStyle=#444444',
      'fillRect(0,0,32,32)',
      'fillStyle=#ff0000',
      'fillRect(6,6,20,20)',
      'drawImage(object,6,6,4,2)',
    ],
  ]
);
expect(
  "with the city's colour keys swapped for the player's colours the tileset names",
  madeCanvases.flat().filter((call) => call.startsWith('putImageData')),
  ['putImageData(#0000ff,#123456)', 'putImageData(#ff0000,#123456)']
);

// Civ1's size is centred three quarters of the way down and its name hangs 1.6 tiles down, in 16px; the stub's are a
//  quarter across, half way and a tile and a quarter down, in 12px.
expect(
  "a city's labels go where the tileset puts them, in its font size",
  both(CityNames, cityWorld(), 2, 2),
  [
    [
      'font=bold 16px sans-serif',
      'textAlign=center',
      'fillStyle=black',
      'fillText(string,18,24)',
      'fillText(string,18,51.2)',
      'fillStyle=white',
      'fillText(string,16,22)',
      'fillText(string,16,49.2)',
    ],
    [
      'font=bold 12px sans-serif',
      'textAlign=center',
      'fillStyle=black',
      'fillText(string,10,16)',
      'fillText(string,10,40)',
      'fillStyle=white',
      'fillText(string,8,14)',
      'fillText(string,8,38)',
    ],
  ]
);
expect(
  "and a city in disorder's unhappy citizen goes where the tileset puts it, in place of the size",
  both(CityNames, cityWorld(true), 2, 2).map((calls) =>
    calls.filter((call) => call.startsWith('drawImage'))
  ),
  [
    ['drawImage(city/people_unhappy_m,10,2,6,6)'],
    ['drawImage(city/people_unhappy_m,4,6,6,6)'],
  ]
);

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL tilesetDrawing (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS tilesetDrawing (${checks} checks)\n`);
