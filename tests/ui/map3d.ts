// The 3D map's entry (docs/3d-renderer.md §2.4, plan 0.2):
//  - `?3d=1` asks for it; a browser without WebGL2, a script that won't load, or a 3D map that can't be made on the
//    map's canvas leaves the map 2D, and the player is told why once;
//  - the script is fetched by a tag versioned by the build, once however many starts ask, and given up after a while;
//  - a game drawn in 3D is given what the 2D map is, with the 2D art's sizes as the 2D map's portal has them, and the
//    art chosen mid-game followed;
//  - the 3D view takes the game's tiles and orders, opens cities and hands on a unit picked, draws once a frame however
//    often it's asked, is sized to its box only when that changes, and lets everything go when it's taken down;
//  - `dist/map3d.js` bundles three.js and its own code, and nothing that has state of its own; and nothing outside the 3D
//    map's package imports three.js or that package.

// Must stay first: it gives the map a `document`.
import './lib/dom';
import './lib/interfaces';
import './lib/grids';
import './lib/artPacks';

import {
  City,
  Tile,
  Unit,
  World as WorldData,
} from '@civ-clone/ui-protocol/types';
import {
  CreateMapView3D,
  MAP3D_GLOBAL,
  MapView3DDeps,
} from '@civ-clone/ui-map/MapView3DFactory';
import MapView2D from '@civ-clone/ui-game/MapView2D';
import MapView3D from '@civ-clone/ui-map-3d/MapView3D';
import {
  DISTANCE_MAX,
  DISTANCE_MIN,
  ZOOM_STEP,
} from '@civ-clone/ui-map-3d/camera/orbit';
import { instance as optionsRegistry } from '@civ-clone/ui-platform/GameOptionsRegistry';
import Transport from '@civ-clone/ui-client/Transport';
import World from '@civ-clone/ui-map/components/World';
import {
  chooseMapTileset,
  installTilesets,
  mapTileset,
  zoomOption,
} from '@civ-clone/ui-assets/lib/tilesets';
import {
  MAP3D_RIVALS_WALK_OPTION,
  MAP3D_UNIT_SIZE_OPTION,
  MAP3D_WALKS_OPTION,
} from '@civ-clone/ui-client/lib/map3dOptions';
import {
  MAP3D_DISTANCE_OPTION,
  forgetMap3D,
  loadMap3DScript,
  makeMapView,
  map3dAsked,
  yieldIconFrom,
  prepareMap3D,
} from '@civ-clone/ui-game/lib/map3d';
import { Stage } from '@civ-clone/ui-map-3d/stage';
import { movingKeys } from '@civ-clone/ui-client/lib/unitActionKeys';
import { YieldMesh, yieldIconSize } from '@civ-clone/ui-map-3d/yields';
import {
  onPreloadedImagesChanged,
  setSprites,
} from '@civ-clone/ui-assets/lib/getPreloadedImage';
import {
  interfaceArt,
  interfaceSpriteName,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import {
  TilesetDescriptor,
  spriteKey,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import markerFor, { TileMarker } from '@civ-clone/ui-map-3d/markers/markerFor';
import { OverlayMesh } from '@civ-clone/ui-map-3d/overlay/overlayMesh';
import { Color } from 'three';
import { cityName } from '@civ-clone/ui-client/components/lib/city';
import { unitStatus } from '@civ-clone/ui-assets/lib/renderUnit';
import { setBuild } from '@civ-clone/ui-client/lib/build';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import { sourcesUnder, specifiersOf } from './lib/imports';
import { createRequire } from 'module';
import { join } from 'path';
import { readFileSync } from 'fs';

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
    process.stderr.write(`FAIL map3d: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// linkedom's canvas has no context: one that ignores everything, for the 2D map the game is drawn on otherwise.
const context = (): CanvasRenderingContext2D =>
  new Proxy({} as { [key: string]: any }, {
    get: (target, name: string) =>
      name in target
        ? target[name]
        : name === 'measureText'
        ? (text: string) => ({ width: String(text).length * 10 })
        : name === 'getImageData'
        ? () => ({ data: new Uint8ClampedArray(4) })
        : () => {},
    set: (target, name: string, value) => {
      target[name] = value;

      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

(globalThis as any).HTMLCanvasElement.prototype.getContext = context;

// The 2D map's blink, which nothing here runs.
Object.assign(window, {
  setInterval: () => 0,
  clearInterval: () => {},
});

const width = 4,
  height = 4,
  tiles: Tile[] = [];

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    tiles.push({
      id: `Tile-${x}-${y}`,
      x,
      y,
      city: null,
      goodyHut: null,
      improvements: [],
      isCoast: false,
      isLand: true,
      isWater: false,
      terrain: { _: 'Grassland', features: [] },
      units: [],
      workedBy: null,
      yields: [],
    } as unknown as Tile);
  }
}

const worldData = {
    id: 'PlayerWorld-1',
    width,
    height,
    tiles,
  } as unknown as WorldData,
  transport = {
    send: () => {},
    receive: () => () => {},
  } as unknown as Transport;

document.body.insertAdjacentHTML(
  'beforeend',
  '<div id="map"><canvas></canvas></div><canvas id="minimap"></canvas>'
);

const mapCanvas = document.querySelector('#map canvas') as HTMLCanvasElement,
  minimapCanvas = document.querySelector('#minimap') as HTMLCanvasElement;

// The map's box, in the page's px: the DOM here has no layout, so it says.
const box = { width: 640, height: 480 };

Object.defineProperties(mapCanvas.parentElement, {
  offsetWidth: { get: () => box.width },
  offsetHeight: { get: () => box.height },
});

// What the stage was asked to do: the test's DOM has no WebGL to draw with.
const staged: string[] = [],
  // The land's chunks the stage was given, and where its camera looked last, apart from what's drawn.
  chunksSet = new Set<string>(),
  lookedAt: number[] = [],
  // How far down the world the stage was asked to draw it round, each time it was asked for a view.
  seenDown: (number | null | undefined)[] = [],
  // Every chunk of land built, in order, again or not.
  chunkBuilds: string[] = [],
  // What's laid on the land of each chunk made since, by `i,j`, or nothing.
  overlaysSet = new Map<string, OverlayMesh | null>(),
  // Each walker drawn, by its walk's id, as it was last drawn; every one drawn, in order, and taken away (`null`); and
  //  where each was put each frame: `u`, height and `v`, and the way it faced.
  walkers = new Map<string, TileMarker>(),
  walkersSet: [string, TileMarker | null][] = [],
  walkersPlaced = new Map<string, number[][]>(),
  // What's marked on each square, by `x,y`, and where it stands.
  markers = new Map<string, TileMarker>(),
  markedAt = new Map<string, readonly [number, number, number]>(),
  // What each square yields, each time the stage was given it.
  yieldsSet: (YieldMesh | null)[] = [],
  fakeStage = (): Stage => ({
    render: () => void staged.push('render'),
    resize: (stageWidth, stageHeight, ratio) =>
      void staged.push(`resize ${stageWidth}×${stageHeight}@${ratio}`),
    setChunk: (i, j) => {
      chunksSet.add(`${i},${j}`);
      chunkBuilds.push(`${i},${j}`);
    },
    setOverlay: (i, j, mesh) => void overlaysSet.set(`${i},${j}`, mesh),
    setMarker: (key, at, marker) => {
      if (marker === null) {
        markers.delete(key);
        markedAt.delete(key);

        return;
      }

      markers.set(key, marker);
      markedAt.set(key, at);
    },
    setWalker: (id, marker) => {
      walkersSet.push([id, marker]);

      if (marker === null) {
        walkers.delete(id);

        return;
      }

      walkers.set(id, marker);
    },
    placeWalker: (id, at, facing) =>
      void walkersPlaced.set(id, [
        ...(walkersPlaced.get(id) ?? []),
        [...at, facing],
      ]),
    setYields: (mesh) => void yieldsSet.push(mesh),
    view: (orbit, height, period) => {
      lookedAt.splice(0, 3, orbit.focus[0], orbit.focus[1], height);
      seenDown.push(period?.v);
    },
    stats: () => ({ drawCalls: 0, triangles: 0, geometries: 0 }),
    dispose: () => void staged.push('dispose'),
  });

// The options, as the page keeps them.
const kept: { [key: string]: unknown } = {},
  options = {
    get: (key: string, defaultValue?: any) =>
      key in kept ? kept[key] : defaultValue,
  };

const activated: string[] = [],
  opened: string[] = [],
  deps2D = {
    activateUnit: (unit: Unit) => void activated.push(unit.id),
    activeUnit: () => null,
    cityOpener: {
      opens: (city: City) => city.player.id === 'Player-1',
      open: (city: City, portal: unknown) =>
        void opened.push(`${city.id} from ${portal?.constructor.name}`),
    },
    coveredBy: [] as HTMLElement[],
    mapPortal: mapCanvas,
    minimapCanvas,
    options,
    playerId: 'Player-1',
    transport,
    world: worldData,
  };

// Civ1's art for the square grid, which the pixel art can be chosen over mid-game.
installTilesets({});
chooseMapTileset('square', '');

// The icon for a yield, as the 2D map picks it: the map's pack's own, where it has one and it's imported, the
//  interface's otherwise, and nothing where neither is.
{
  const pack = {
      ...mapTileset(),
      storage: { prefix: './pack/', ext: '.png' },
      yields: { names: { Food: 'grain' }, sprite: 'yields/{yield}' },
    } as unknown as TilesetDescriptor,
    packFood = { pack: 'food' } as unknown as CanvasImageSource,
    interfaceFood = { interface: 'food' } as unknown as CanvasImageSource,
    interfaceKey = spriteKey(
      interfaceArt(),
      interfaceSpriteName('city/food', interfaceArt())
    ),
    iconOf = yieldIconFrom(() => pack),
    picked = (sprites: [string, CanvasImageSource][]) => {
      setSprites(new Map(sprites));

      const icon = iconOf('Food');

      return icon === packFood
        ? 'pack'
        : icon === interfaceFood
        ? 'interface'
        : icon;
    };

  expect(
    "a yield's icon is the map's pack's own where it has one and it's imported, the interface's otherwise, and nothing where neither is",
    [
      picked([
        ['./pack/yields/grain.png', packFood],
        [interfaceKey, interfaceFood],
      ]),
      picked([[interfaceKey, interfaceFood]]),
      picked([]),
    ],
    ['pack', 'interface', null]
  );

  setSprites(new Map());
}

// The query string.

expect(
  '?3d=1 asks for the 3D map, and anything else not',
  ['?3d=1', '?3d=true', '?debug=1', '', '?3d=0'].map(map3dAsked),
  [true, true, false, false, false]
);

(async (): Promise<void> => {
  const told: string[] = [],
    say = (text: string) => void told.push(text);
  let loads = 0,
    // What the page last gave the 3D map.
    given: MapView3DDeps | null = null;

  const load = async (): Promise<CreateMapView3D> => {
      loads++;

      return (deps: MapView3DDeps) => {
        given = deps;

        return new MapView3D(deps, fakeStage);
      };
    },
    // A page as each case starts: nothing fetched, nothing said.
    fresh = (): void => {
      forgetMap3D();
      told.length = 0;
      loads = 0;
    };

  // Not asked for: nothing is fetched, nothing is said, and the map is 2D.
  await prepareMap3D({ say, search: '', webgl2: () => true, load });

  expect('not asked for, nothing is fetched or said', [loads, told], [0, []]);

  const notAsked = makeMapView(deps2D);

  expect(
    'and the game is drawn on the 2D map',
    notAsked instanceof MapView2D,
    true
  );

  notAsked.dispose();

  // Asked for, in a browser without WebGL2: said once, and drawn in 2D.
  fresh();

  await prepareMap3D({ say, search: '?3d=1', webgl2: () => false, load });
  await prepareMap3D({ say, search: '?3d=1', webgl2: () => false, load });

  expect(
    'without WebGL2, nothing is fetched, and the player is told why once',
    [loads, told.length],
    [0, 1]
  );

  const noWebGL2 = makeMapView(deps2D);

  expect('and the map is 2D', noWebGL2 instanceof MapView2D, true);

  noWebGL2.dispose();

  // Asked for, and its script won't load: said once, and drawn in 2D.
  fresh();

  const error = console.error;

  console.error = () => {};

  await prepareMap3D({
    say,
    search: '?3d=1',
    webgl2: () => true,
    load: () => Promise.reject(new Error('offline')),
  });

  expect('a script that will not load is said, once', told.length, 1);
  expect(
    'and the map is 2D',
    (() => {
      const view = makeMapView(deps2D);

      view.dispose();

      return view instanceof MapView2D;
    })(),
    true
  );

  // Its factory throws on the map's own canvas (WebGL2 refused there after all): said once, and drawn in 2D.
  fresh();

  await prepareMap3D({
    say,
    search: '?3d=1',
    webgl2: () => true,
    load: async () => () => {
      throw new Error('Error creating WebGL context.');
    },
  });

  const refused = makeMapView(deps2D);

  console.error = error;

  expect(
    'a 3D map that cannot be made leaves the game on the 2D map, and says why once',
    [refused instanceof MapView2D, told.length],
    [true, 1]
  );

  refused.dispose();

  // And if the attempt took a WebGL context on the map's canvas, which then gives no 2D one, the 2D map gets a fresh
  //  canvas in its place.
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div id="taken"><canvas width="320" height="200"></canvas></div>'
  );

  const taken = document.querySelector('#taken canvas') as HTMLCanvasElement;

  Object.defineProperty(taken, 'getContext', {
    value: (type: string) => (type === '2d' ? null : context()),
  });
  console.error = () => {};

  const onFresh = makeMapView({ ...deps2D, mapPortal: taken }),
    fresh2D = document.querySelector('#taken canvas') as HTMLCanvasElement;

  console.error = error;

  expect(
    'a canvas a WebGL context was taken on is replaced, the same size, for the 2D map',
    [
      onFresh instanceof MapView2D,
      taken.isConnected,
      fresh2D !== taken,
      [fresh2D.width, fresh2D.height],
    ],
    [true, false, true, [taken.width, taken.height]]
  );

  onFresh.dispose();

  // Asked for, with WebGL2: fetched once however many starts ask, and every game after is drawn in 3D.
  fresh();

  await Promise.all([
    prepareMap3D({ say, search: '?3d=1', webgl2: () => true, load }),
    prepareMap3D({ say, search: '?3d=1', webgl2: () => true, load }),
  ]);
  await prepareMap3D({ say, search: '?3d=1', webgl2: () => true, load });

  expect(
    'with WebGL2, fetched once for starts at once and after, and nothing said',
    [loads, told],
    [1, []]
  );

  kept[zoomOption(mapTileset('square'))] = 2.6;
  kept.lockVerticalEdges = true;

  // The 2D map, as it would be drawn with the same art and options: the city screen draws its map with that art, so
  //  the 3D map's portal says what the 2D map's does.
  const sizes = (portal: {
      zoom(): number;
      scale(): number;
      nativeTileSize(): { width: number; height: number };
    }) => [portal.zoom(), portal.scale(), portal.nativeTileSize()],
    shown2D = (): unknown[] => {
      const view2D = new MapView2D(deps2D),
        shown = sizes(view2D.portal);

      view2D.dispose();

      return shown;
    };

  const view = makeMapView(deps2D) as MapView3D;

  expect('the game is drawn on the 3D map', view instanceof MapView3D, true);
  expect(
    'its world is the player’s',
    [view.world instanceof World, view.world.width(), view.world.get(2, 3).id],
    [true, 4, 'Tile-2-3']
  );
  expect(
    'its portal has the 2D map art’s zoom, scale and tile, as the 2D map’s does',
    sizes(view.portal),
    shown2D()
  );
  expect(
    'it is given the page’s names for cities and letters for busy units, as its other maps and windows give them',
    // By identity: `expect` compares by JSON, which a function has none of.
    (given as MapView3DDeps | null)?.cityName === cityName &&
      (given as MapView3DDeps | null)?.unitStatus === unitStatus,
    true
  );
  expect('at the zoom kept', sizes(view.portal)[0], 2.6);

  // Options keeps the zoom, then tells the portal: read when asked, the new zoom is the city screen's.
  kept[zoomOption(mapTileset('square'))] = 1.4;

  expect(
    'a zoom chosen since is read when asked',
    sizes(view.portal),
    shown2D()
  );
  expect(
    'and whether the view stops at the poles is the option’s',
    view.portal.lockVerticalEdges(),
    true
  );

  // Other art chosen mid-game (#1118): the 3D map isn't drawn with it, but the unit panel and windows are.
  expect(
    'with the art as it was, nothing to redraw',
    view.redrawArt(),
    'unchanged'
  );

  chooseMapTileset('square', 'civ1-pixelart');

  expect(
    'other art chosen is redrawn, once, for the game to draw the panel and windows with it',
    [view.redrawArt(), view.redrawArt(), sizes(view.portal)],
    ['redrawn', 'unchanged', shown2D()]
  );

  chooseMapTileset('square', '');
  view.redrawArt();

  // The view: sized to its canvas's box, and drawn, as it starts; then its land built and drawn, wherever it's centred
  //  (at once, with no frames here).
  expect(
    'the stage is sized to the map’s box as it starts, and drawn at once, and its land built and drawn as it starts',
    [staged.splice(0), chunksSet.size > 0],
    [['resize 640×480@1', 'render', 'render'], true]
  );

  box.width = 800;
  window.dispatchEvent(new Event('resize'));

  expect('and again as the box changes size', staged.splice(0), [
    'resize 800×480@1',
    'render',
  ]);

  window.dispatchEvent(new Event('resize'));

  expect(
    'but not when it has not: sizing a canvas clears it',
    staged.splice(0),
    []
  );

  box.height = 0;
  window.dispatchEvent(new Event('resize'));
  box.height = 480;

  expect('nor while its box has no size', staged.splice(0), []);

  view.centre(tiles[5]);

  expect(
    'centring moves its focus and draws it',
    [view.portal.center(), staged.splice(0)],
    [{ x: 1, y: 1 }, ['render']]
  );
  expect(
    'and the camera looks at the middle of that square on the ground, no lower than the sea',
    [lookedAt[0], lookedAt[1], lookedAt[2]! >= 0],
    [1.5, 1.5, true]
  );

  // What's on the screen: the canvas's box, as the DOM here has no layout, and what floats over it.
  Object.defineProperties(mapCanvas, {
    setPointerCapture: { value: () => {}, configurable: true },
    clientWidth: { get: () => box.width, configurable: true },
    clientHeight: { get: () => box.height, configurable: true },
    getBoundingClientRect: {
      value: () => ({
        left: 0,
        top: 0,
        right: box.width,
        bottom: box.height,
        width: box.width,
        height: box.height,
      }),
      configurable: true,
    },
  });

  const onScreen = [
    view.portal.isVisible(1, 1),
    view.portal.isVisible(1, 1, 100),
  ];

  // A sidebar over the whole map.
  deps2D.coveredBy.push({
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: box.width,
      bottom: box.height,
    }),
    parentElement: null,
  } as unknown as HTMLElement);
  view.measureCovered();

  const covered = view.portal.isVisible(1, 1);

  deps2D.coveredBy.length = 0;
  view.measureCovered();

  expect(
    'the square it looks at is on the screen; not with a margin wider than the screen, nor under what floats over the map',
    [...onScreen, covered, view.portal.isVisible(1, 1)],
    [true, false, false, true]
  );

  // Close up, looking north, and a square in from the edges: the squares two along to the east and two down to the
  //  south are past the screen's right and bottom edges, the nearer copy of them either way round the world; the one
  //  looked at isn't.
  const before = view.orbit();

  view.setOrbit({ ...before, yaw: 0, distance: DISTANCE_MIN });

  const closeUp = [
    view.portal.isVisible(1, 1, 1),
    view.portal.isVisible(3, 1, 1),
    view.portal.isVisible(1, 3, 1),
  ];

  view.setOrbit(before);
  staged.splice(0);

  expect(
    'close up, squares past the screen’s right and bottom edges are off it',
    closeUp,
    [true, false, false]
  );

  expect(
    'every chunk of the land was built as it started',
    chunksSet.size > 0,
    true
  );

  view.portal.setCenter(1, 1);

  expect('the same square again draws nothing', staged.splice(0), []);

  // The camera: turned and zoomed at once, with no frames to glide over (slice 1.2).
  const yawOf = (): number => Math.round((view.orbit().yaw * 180) / Math.PI),
    distance = view.orbit().distance;

  view.turnBy(1);

  const turned = yawOf();

  view.turnBy(-2);

  const back = yawOf();

  view.faceNorth();

  expect(
    'the keys turn the camera an eighth of a turn either way, and back to north, and draw it',
    [turned, back, yawOf(), staged.splice(0)],
    [45, 315, 0, ['render', 'render', 'render']]
  );

  // How it's turned, for the keys that move a unit: the way it's turned to, and the way each of the grid's directions
  //  points on the land. Turned a quarter clockwise, up moves a unit east.
  view.turnBy(2);

  const quarter = view.heading();

  view.faceNorth();

  const north = view.heading(),
    pointing = Object.entries(quarter.directions)
      .map(([direction, [u, v]]) => `${direction} ${u} ${v}`)
      .sort();

  staged.splice(0);

  expect(
    "its heading is the camera's turn, and each way the grid points on the land, so up moves a unit up the screen: north unturned, east turned a quarter clockwise",
    [
      Math.round((quarter.turn * 180) / Math.PI),
      north.turn,
      pointing,
      movingKeys(view.world.topology(), north).ArrowUp,
      movingKeys(view.world.topology(), quarter).ArrowUp,
    ],
    [
      90,
      0,
      [
        'e 1 0',
        'n 0 -1',
        'ne 1 -1',
        'nw -1 -1',
        's 0 1',
        'se 1 1',
        'sw -1 1',
        'w -1 0',
      ],
      'n',
      'e',
    ]
  );

  view.zoomBy(2);

  const zoomedIn = view.orbit().distance;

  view.zoomBy(-2);

  expect(
    'zooming brings it nearer by the steps asked, and out again',
    [
      Math.abs(zoomedIn - distance / ZOOM_STEP ** 2) < 1e-9,
      Math.abs(view.orbit().distance - distance) < 1e-9,
      view.portal.center(),
    ],
    [true, true, { x: 1, y: 1 }]
  );

  staged.splice(0);

  // The tiles, as the 2D map takes them: queued, released once the world has them, and taken by a flush.
  view.queueTile(tiles[0]);
  view.queueTile(tiles[0]);
  view.queueTile(tiles[1]);

  expect('a queued tile waits for the world', view.tilesPending(), 0);

  chunksSet.clear();
  view.releaseTiles();

  expect(
    'released, they are taken on the next frame (at once, with no frames here), and drawn: with no terrain changed, no land is built again',
    [view.tilesPending(), chunksSet.size, staged.splice(0)],
    [0, 0, ['render']]
  );

  // A tile whose terrain the patch changed: its land is built again.
  (tiles[1] as { terrain: { _: string } }).terrain = { _: 'Mountains' };
  view.queueTile(tiles[1]);
  view.releaseTiles();

  expect(
    'a tile whose terrain changed has the land round it built again',
    [chunksSet.size > 0, staged.splice(0)],
    [true, ['render']]
  );

  // The world's terrain read again only when its tiles have been replaced: a whole new world, perhaps with none.
  const readAgain: boolean[] = [],
    land = view.land(),
    changed = land.changed.bind(land);

  land.changed = (squares, u, v, always = false): [number, number][] => {
    readAgain.push(always);

    return changed(squares, u, v, always);
  };

  view.flush();
  view.flush();

  const unchanged = readAgain.splice(0),
    known = view.world.tiles();

  chunksSet.clear();
  view.world.setTiles([], true);
  view.flush();

  const replaced = [readAgain.splice(0), chunksSet.size > 0];

  view.world.setTiles(known, true);
  view.flush();
  land.changed = changed;

  // Each flush takes the tiles, and so does the frame it draws (at once, with no frames here).
  expect(
    'flushed, the terrain is read again only once the world’s tiles are replaced, and the land built again then',
    [unchanged, replaced, readAgain],
    [
      [false, false, false, false],
      [[true, false], true],
      [true, false],
    ]
  );

  staged.splice(0);

  // The page's words from here on: a city's name in the locale, and a busy unit's letter.
  await i18next.init({ ...i18nOptions, lng: 'en' });
  i18next.addResource('en', 'city', 'Romans.Roma.name', 'Rome');
  i18next.addResource('en', 'unit', 'Busy.Fortified.icon', 'Fd');

  // A city and a stack on a square: marked, with the best defender on top, until `t` hides them, and the active unit
  //  on top, marked as active, even hidden.
  const owner = {
      id: 'Player-1',
      civilization: {
        attributes: [{ name: 'colors', value: ['#aa0000', '#ffffff'] }],
      },
    },
    town = tiles[2] as Tile,
    townKey = `${town.x},${town.y}`,
    warriors = {
      id: 'Unit-W',
      _: 'Warriors',
      defence: { value: 1 },
      player: owner,
      busy: null,
      tile: town,
    },
    phalanx = {
      id: 'Unit-P',
      _: 'Phalanx',
      __: ['Fortifiable', 'Land', 'Unit'],
      defence: { value: 2 },
      player: owner,
      busy: { _: 'Fortified' },
      improvements: [{ _: 'Fortified' }, { _: 'Veteran' }],
      hitPoints: { current: 6, max: 10 },
      tile: town,
    };

  const roma = {
      name: 'Roma',
      growth: { size: 3 },
      player: owner,
      originalPlayer: { civilization: { _: 'Romans' } },
      walled: true,
      civilDisorderDeclared: false,
    },
    // As the page names it, in the locale.
    romaName = 'Rome';

  Object.assign(town, {
    city: roma,
    units: [warriors, phalanx],
  });
  view.queueTile(town);
  view.releaseTiles();

  const marked = (): unknown => {
    const marker = markers.get(townKey);

    return marker === undefined
      ? null
      : [
          marker.city?.name ?? null,
          marker.unit?.type ?? null,
          marker.unit?.active ?? null,
        ];
  };

  expect(
    'a square with a city and a stack is marked: the city, its size, walls and colours, and its best defender with the stack’s size, its kinds, what its flag shows (fortified, a veteran, hurt, and the page’s letter for what it’s busy with)',
    [markers.get(townKey)?.city, markers.get(townKey)?.unit],
    [
      {
        name: romaName,
        size: 3,
        colours: ['#aa0000', '#ffffff'],
        walled: true,
        disorder: false,
      },
      {
        id: 'Unit-P',
        type: 'Phalanx',
        kinds: ['Fortifiable', 'Land', 'Unit'],
        colours: ['#aa0000', '#ffffff'],
        count: 2,
        active: false,
        busy: true,
        fortified: true,
        veteran: true,
        health: 0.6,
        // The page's letter for Fortified, in the locale.
        status: 'Fd',
        // Not seen to move yet: facing south.
        facing: 0,
        // Life size, as no other size is chosen.
        size: 1,
      },
    ]
  );

  view.setActiveUnit(warriors as unknown as Unit);

  const activeOnTop = marked();

  view.toggleUnits();

  const hiddenButActive = marked();

  view.setActiveUnit(null);

  const allHidden = marked();

  view.toggleUnits();

  expect(
    'the active unit is on top of its stack; t hides the rest, but not the active unit; shown again, all are back',
    [activeOnTop, hiddenButActive, allHidden, marked()],
    [
      [romaName, 'Warriors', true],
      [null, 'Warriors', true],
      null,
      [romaName, 'Phalanx', false],
    ]
  );

  // How big units are drawn, changed in Options as the game goes on: every square's unit drawn again at once, at the
  //  nearest size a player could choose, and life size again after.
  // Each change drawn at once, with no other reason for a frame: the map's idle.
  staged.splice(0);

  const sizeDrawn = (): [number | undefined, boolean] => [
      markers.get(townKey)?.unit?.size,
      staged.splice(0).includes('render'),
    ],
    sizesDrawn = [sizeDrawn()];

  optionsRegistry.set(MAP3D_UNIT_SIZE_OPTION, 1.5);
  sizesDrawn.push(sizeDrawn());
  optionsRegistry.set(MAP3D_UNIT_SIZE_OPTION, 9);
  sizesDrawn.push(sizeDrawn());
  optionsRegistry.set(MAP3D_UNIT_SIZE_OPTION, 0.6);
  sizesDrawn.push(sizeDrawn());
  optionsRegistry.set(MAP3D_UNIT_SIZE_OPTION, 'big');
  sizesDrawn.push(sizeDrawn());

  expect(
    'units are drawn at the size chosen in Options as soon as it changes, and the map drawn, the nearest size a player could choose, or life size',
    sizesDrawn,
    [
      [1, false],
      [1.5, true],
      // As it was: nothing drawn.
      [1.5, false],
      [0.5, true],
      [1, true],
    ]
  );

  // A size chosen before the game: its units are drawn at it from the start.
  optionsRegistry.set(MAP3D_UNIT_SIZE_OPTION, 1.25);
  // As the map shown re-marks it: only the new map's marking counts.
  markers.delete(townKey);

  const chosenBefore = makeMapView(deps2D) as MapView3D;

  chosenBefore.queueTile(town);
  chosenBefore.releaseTiles();

  const sizeAtStart = markers.get(townKey)?.unit?.size;

  chosenBefore.dispose();
  optionsRegistry.set(MAP3D_UNIT_SIZE_OPTION, 1);
  view.queueTile(town);
  view.releaseTiles();
  staged.splice(0);

  expect(
    'a size chosen before the game is the one its units are drawn at from the start',
    sizeAtStart,
    1.25
  );

  // A city and its units on a mountain, and a mountain made beside it, with only that square released: the land under
  //  the city moves, and the city's marked again on the land as it's drawn now, not left buried or floating. Here it's
  //  the neighbour's own relief that moves it, by a little, as the city's middle lies behind its peak each way; a ridge
  //  can move it by up to 0.04, and `relief` checks that it moves only the squares beside those `refresh` gives back.
  //  Each neighbour that isn't a mountain already, in turn, till one moves the land under the city; then as it was.
  {
    const land = view.land(),
      [townU, townV] = land.layout.centre(town.x, town.y),
      ground = (): number => Math.max(0, land.surfaceAt(townU, townV)),
      standing = (): number | undefined => markedAt.get(townKey)?.[1],
      raise = (tile: Tile, name: string): void => {
        (
          tile as unknown as { terrain: { _: string; features: never[] } }
        ).terrain = {
          _: name,
          features: [],
        };
        view.queueTile(tile);
        view.releaseTiles();
      };

    raise(town, 'Mountains');

    const onMountain = [standing() === ground()],
      neighbours = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [1, 1],
        [-1, 1],
      ].map(
        ([dx, dy]) =>
          tiles[
            ((town.y + dy! + height) % height) * width +
              ((town.x + dx! + width) % width)
          ] as Tile
      );
    let moved: boolean[] = [];

    for (const beside of neighbours) {
      const was = beside.terrain._,
        before = ground();

      if (was === 'Mountains') {
        continue;
      }

      raise(beside, 'Mountains');

      if (ground() !== before) {
        moved = [true, standing() === ground()];
        raise(beside, was);
        moved.push(standing() === ground());

        break;
      }

      raise(beside, was);
    }

    raise(town, 'Grassland');

    expect(
      'a city on a mountain stands on the land as it is when a mountain made beside it, the only square released, moves the land under it, and when that mountain goes again',
      [onMountain, moved, standing() === ground()],
      [[true], [true, true, true], true]
    );
  }

  // Listened to only while there's a map: none once it's taken down, and none from one whose stage can't be made, the
  //  game falling back to the 2D map.
  {
    const listening = new Set<() => void>(),
      unitSize = {
        get: (): number => 1,
        onChange: (changed: () => void): (() => void) => {
          listening.add(changed);

          return (): void => void listening.delete(changed);
        },
      },
      // And for the page's art changing, which the yields' icons are drawn from.
      artChanged = unitSize.onChange,
      counted = new MapView3D({ ...given!, unitSize, artChanged }, fakeStage),
      whileShown = listening.size;

    counted.dispose();

    const afterwards = listening.size;
    let refused = false;

    try {
      new MapView3D({ ...given!, unitSize, artChanged }, () => {
        throw new Error('WebGL2 refused');
      });
    } catch {
      refused = true;
    }

    expect(
      'it listens for a size chosen, and for the page’s art changing, only while it is shown: not once taken down, nor from a map whose stage could not be made',
      [whileShown, afterwards, refused, listening.size],
      [2, 0, true, 0]
    );
  }

  // The map's events: a unit faces the way it last moved, the short way round the world, and the way it attacked, and a
  //  defender faces its attacker. The town is at (2, 0), on a world 4 across that wraps.
  const facing = (): number | undefined => markers.get(townKey)?.unit?.facing,
    step = (from: [number, number], to: [number, number]) =>
      view.mapEvent({
        kind: 'moved',
        unit: {
          id: 'Unit-P',
          type: 'Phalanx',
          player: 'Player-1',
          tile: { x: from[0], y: from[1] },
        },
        from: { x: from[0], y: from[1] },
        to: { x: to[0], y: to[1] },
      }),
    round = (angle: number | undefined): number =>
      Math.round((angle ?? NaN) * 100) / 100,
    faced: number[] = [],
    // As the patch that follows a move does: the town's square released, and drawn.
    patched = (): void => {
      view.queueTile(town);
      view.releaseTiles();
      view.flush();
    };

  step([1, 0], [2, 0]);
  faced.push(round(facing()));
  step([3, 0], [2, 0]);
  faced.push(round(facing()));
  // Over the seam, from the last square to the first, going east the short way; and down and to the east.
  step([3, 0], [0, 0]);
  patched();
  faced.push(round(facing()));
  step([1, 0], [2, 1]);
  patched();
  faced.push(round(facing()));
  view.mapEvent({
    kind: 'battle',
    attacker: {
      id: 'Unit-P',
      type: 'Phalanx',
      player: 'Player-1',
      tile: { x: 2, y: 0 },
    },
    defender: {
      id: 'Unit-Rival',
      type: 'Warriors',
      player: 'Player-2',
      tile: { x: 2, y: 1 },
    },
    winner: 'attacker',
  });
  faced.push(round(facing()));
  // Attacked from the west, where it stands: it turns to face its attacker.
  view.mapEvent({
    kind: 'battle',
    attacker: {
      id: 'Unit-Rival',
      type: 'Warriors',
      player: 'Player-2',
      tile: { x: 1, y: 0 },
    },
    defender: {
      id: 'Unit-P',
      type: 'Phalanx',
      player: 'Player-1',
      tile: { x: 2, y: 0 },
    },
    winner: 'defender',
  });
  faced.push(round(facing()));

  expect(
    'a unit faces the way it last moved, and the way it attacked; a defender faces its attacker',
    faced,
    [
      round(Math.PI / 2),
      round(-Math.PI / 2),
      round(Math.PI / 2),
      round(Math.PI / 4),
      0,
      round(-Math.PI / 2),
    ]
  );

  expect(
    'a city is named as the page names it, or by its own name where the page gives none',
    [
      markerFor(town, null, true, { cityName: () => 'Rome' })?.city?.name,
      markerFor(town, null, true)?.city?.name,
    ],
    ['Rome', 'Roma']
  );

  // A road built on the square beside the town: what's laid on its chunk is made again, by the frames the view draws,
  //  without building the land again. On the town's own square, a city's lot, nothing's laid.
  overlaysSet.clear();

  const landBuilt = chunkBuilds.length,
    beside = tiles[1] as Tile;

  [beside, town].forEach((tile) => {
    tile.improvements = [{ _: 'Road' }] as Tile['improvements'];
    view.queueTile(tile);
  });
  view.releaseTiles();
  view.flush();

  // The points laid within `reach` of a square's middle, and whether any is in `colour`.
  const laidNear = (
    tile: Tile,
    reach: number
  ): { points: number; coloured: (colour: string) => boolean } => {
    const mesh = overlaysSet.get(view.land().overlayKeyOf(tile.x, tile.y)),
      [cu, cv] = view.land().layout.centre(tile.x, tile.y),
      near: number[] = [];

    for (let at = 0; mesh && at < mesh.positions.length; at += 3) {
      if (
        Math.hypot(
          mesh.positions[at]! + mesh.u - cu,
          mesh.positions[at + 2]! + mesh.v - cv
        ) < reach
      ) {
        near.push(at);
      }
    }

    return {
      points: near.length,
      coloured: (colour) => {
        const { r, g, b } = new Color(colour);

        return near.some(
          (at) =>
            Math.abs(mesh!.colours[at]! - r) < 1e-4 &&
            Math.abs(mesh!.colours[at + 1]! - g) < 1e-4 &&
            Math.abs(mesh!.colours[at + 2]! - b) < 1e-4
        );
      },
    };
  };

  expect(
    'a road built: what’s laid on its chunk made again, with the road, and no land built; none on a city’s lot',
    [
      overlaysSet.has(view.land().overlayKeyOf(beside.x, beside.y)),
      laidNear(beside, 0.3).coloured('#8c7a58'),
      view.land().overlaysPending(),
      chunkBuilds.length === landBuilt,
      laidNear(town, 0.3).points,
    ],
    [true, true, 0, true, 0]
  );

  staged.splice(0);

  view.flush();

  expect(
    'a flush with nothing released draws',
    [view.tilesPending(), staged.splice(0)],
    [0, ['render']]
  );

  // What the game asks of it, kept until it's shown (slices 1.2 and 1.3).
  const unit = { id: 'Unit-1' } as unknown as Unit;

  view.setActiveUnit(unit, { x: 1, y: 0 });
  view.toggleUnits();
  view.toggleYields();
  view.setWaiting(true);

  expect(
    'the active unit, the units and yields hidden or shown, and waiting are kept',
    [view.activeUnit().unit?.id, view.activeUnit().pendingTile, view.shown()],
    ['Unit-1', { x: 1, y: 0 }, { units: false, yields: true, waiting: true }]
  );

  // What each square yields, while `y` shows them: given to the stage as icons standing over each square's middle,
  //  laid out as the 2D map lays them, and taken away when they're hidden. A square's laid out again when it changes.
  {
    const yieldsOf = (food: number, trade: number) => [
        { _: 'Food', value: food },
        { _: 'Trade', value: trade },
      ],
      lastYields = (): YieldMesh | null | undefined =>
        yieldsSet[yieldsSet.length - 1],
      described = (mesh: YieldMesh | null | undefined) =>
        mesh === null || mesh === undefined
          ? mesh
          : {
              count: mesh.count,
              names: mesh.names,
              cells: [...mesh.cells],
              // Where each stands on the ground (u, v), and its place in its block, across and up.
              at: Array.from({ length: mesh.count }, (_, index) => [
                mesh.anchors[index * 3],
                mesh.anchors[index * 3 + 2],
                mesh.slots[index * 2],
                mesh.slots[index * 2 + 1],
              ]),
              sizes: [...new Set(mesh.sizes)].map(
                (size) => Math.round(size * 1000) / 1000
              ),
            };

    Object.assign(tiles[0]!, { yields: yieldsOf(2, 1) });
    Object.assign(tiles[5]!, { yields: yieldsOf(1, 0) });
    yieldsSet.splice(0);
    view.queueTile(tiles[0]!);
    view.queueTile(tiles[5]!);
    view.releaseTiles();

    const shown = described(lastYields()),
      setWhenShown = yieldsSet.length;

    // Nothing changed: nothing given again.
    view.flush();

    const unchanged = yieldsSet.length;

    // Square (1, 1) yields more trade now.
    Object.assign(tiles[5]!, { yields: yieldsOf(1, 2) });
    view.queueTile(tiles[5]!);
    view.releaseTiles();

    const changed = described(lastYields());

    // Worked by a city whose figures for it are its own (Civ2's, `squareYields`), then changed with no word of the
    //  square itself: laid out again the next time any square changes. And a square raised into mountains stands its
    //  icons higher.
    const heightOf = (mesh: YieldMesh | null | undefined, icon: number) =>
        mesh?.anchors[icon * 3 + 1] ?? -1,
      city = {
        squareYields: [{ x: 1, y: 1, yields: yieldsOf(1, 2) }],
      };

    Object.assign(tiles[5]!, { workedBy: city, yields: yieldsOf(0, 0) });
    view.queueTile(tiles[5]!);
    view.releaseTiles();
    // (3, 3), queued, is no neighbour of (1, 1).
    city.squareYields = [{ x: 1, y: 1, yields: yieldsOf(3, 0) }];
    view.queueTile(tiles[15]!);
    view.releaseTiles();

    const unspoken = described(lastYields()),
      flatHeight = heightOf(lastYields(), 0);

    Object.assign(tiles[0]!, {
      terrain: { _: 'Mountains', features: [] },
    });
    view.queueTile(tiles[0]!);
    view.releaseTiles();

    const raised = heightOf(lastYields(), 0);

    Object.assign(tiles[0]!, {
      terrain: { _: 'Grassland', features: [] },
    });
    view.queueTile(tiles[0]!);
    view.releaseTiles();

    expect(
      'a square worked by a city with figures of its own for it shows them, laid out again when they change with no word of the square, once any square changes; and a square raised into mountains has its icons higher',
      [
        unspoken?.count,
        unspoken?.cells.slice(3),
        unspoken?.at.slice(3),
        raised > flatHeight + 0.1,
      ],
      [
        6,
        // The city's three food, where its figure was a food and two trade, and the square's own none.
        [0, 0, 0],
        [
          [1.5, 1.5, -0.5, 0.5],
          [1.5, 1.5, 0.5, 0.5],
          [1.5, 1.5, -0.5, -0.5],
        ],
        true,
      ]
    );

    view.toggleYields();

    const hidden = [yieldsSet.length, lastYields()];

    view.flush();

    const stillHidden = yieldsSet.length;

    view.toggleYields();

    expect(
      'shown, each square’s yields are icons over its middle, as the 2D map lays them out, the same size on a square, made again only for a square that changes, and taken away when hidden',
      [
        shown,
        setWhenShown,
        unchanged,
        changed?.count,
        changed?.at[3],
        hidden,
        stillHidden,
        described(lastYields())?.count,
      ],
      [
        {
          count: 4,
          names: ['Food', 'Trade'],
          cells: [0, 0, 1, 0],
          at: [
            [0.5, 0.5, -0.5, 0.5],
            [0.5, 0.5, 0.5, 0.5],
            [0.5, 0.5, -0.5, -0.5],
            [1.5, 1.5, 0, 0],
          ],
          sizes: [Math.round(yieldIconSize(2, 1) * 1000) / 1000],
        },
        1,
        1,
        6,
        [1.5, 1.5, -0.5, 0.5],
        [7, null],
        7,
        6,
      ]
    );

    // What's laid out again, counted by the land's height read under it, with the yields hidden while the land changes
    //  and then shown: every square, the first time; none, shown again with nothing changed; a square whose land
    //  changed, and its eight neighbours; and for a square newly seen, the world handed over again, only that one.
    {
      const land = view.land(),
        surfaceAt = land.surfaceAt.bind(land);
      let read = 0;

      land.surfaceAt = (...args: Parameters<typeof surfaceAt>): number => {
        read++;

        return surfaceAt(...args);
      };

      // Every square yields something, so each one's laid out.
      tiles.forEach((tile) => Object.assign(tile, { yields: yieldsOf(1, 1) }));
      view.toggleYields();
      tiles.forEach((tile) => view.queueTile(tile));
      view.releaseTiles();

      const readWhenShown = (change: () => void): number => {
        change();
        view.releaseTiles();
        // A world handed over with nothing released is taken with the next frame: the land built for it then too.
        view.flush();
        read = 0;
        view.toggleYields();

        const count = read;

        view.toggleYields();

        return count;
      };

      const counts = [
        readWhenShown(() => {}),
        readWhenShown(() => {}),
        readWhenShown(() => {
          Object.assign(tiles[10]!, {
            terrain: { _: 'Mountains', features: [] },
          });
          view.queueTile(tiles[10]!);
        }),
        readWhenShown(() => {
          Object.assign(tiles[10]!, { yields: yieldsOf(2, 2) });
          view.queueTile(tiles[10]!);
        }),
        readWhenShown(() => {
          view.world.setTiles([...tiles], true);
          view.queueTile(tiles[3]!);
        }),
        // (2, 2) not seen, then seen: its land changes each time, and its neighbours' with it.
        readWhenShown(() => {
          view.world.setTiles(
            tiles.filter((tile) => tile !== tiles[10]),
            true
          );
        }),
        readWhenShown(() => {
          view.world.setTiles([...tiles], true);
        }),
      ];

      land.surfaceAt = surfaceAt;

      expect(
        'laid out once and kept: every square the first time, none again with nothing changed, a square whose land changed and its neighbours, one whose yields changed, one released with the world handed over again, and for a square no longer seen its neighbours, and seen again it and them, not the whole world again',
        counts,
        [16, 0, 9, 1, 1, 8, 9]
      );

      Object.assign(tiles[10]!, {
        terrain: { _: 'Grassland', features: [] },
      });
      view.queueTile(tiles[10]!);
    }

    // The world handed over again, its squares yielding something else, with none released and no land changed: the
    //  yields given to the stage again, as they are now.
    {
      // What's waiting taken first, so only the hand-over is seen.
      view.releaseTiles();
      view.toggleYields();
      view.flush();
      yieldsSet.splice(0);
      view.world.setTiles(
        tiles.map(
          (tile) => ({ ...tile, yields: yieldsOf(3, 0) } as unknown as Tile)
        ),
        true
      );
      view.flush();

      const handedOver = yieldsSet.splice(0).map((mesh) => mesh?.count);

      view.world.setTiles(tiles, true);
      view.flush();
      view.toggleYields();

      expect(
        'the world handed over again, yielding something else with nothing released, has its yields given to the stage again',
        handedOver,
        [16 * 3]
      );
    }

    // The page gives the map the icons as the 2D map picks them, and tells it when its art changes.
    {
      const food = { food: true } as unknown as CanvasImageSource;

      setSprites(
        new Map([
          [
            spriteKey(
              interfaceArt(),
              interfaceSpriteName('city/food', interfaceArt())
            ),
            food,
          ],
        ])
      );

      expect(
        "the page gives the map yields' icons as the 2D map picks them, and tells it when its art changes",
        [
          given!.yieldIcon?.('Food') === food,
          given!.artChanged === onPreloadedImagesChanged,
        ],
        [true, true]
      );

      setSprites(new Map());
    }

    // Other art chosen for the map mid-game (#1118): the yields' icons are its pack's own, where it has them, so they're
    //  given to the stage again.
    view.toggleYields();
    view.flush();
    yieldsSet.splice(0);
    chooseMapTileset('square', 'civ1-pixelart');
    view.redrawArt();
    view.flush();

    const givenForArt = yieldsSet.splice(0).length;

    chooseMapTileset('square', '');
    view.redrawArt();
    view.toggleYields();

    expect(
      'other art chosen for the map gives the yields to the stage again, from its pack',
      givenForArt,
      1
    );

    // The page's art changed (an import, or other art chosen): the yields' icons drawn again from it. Listened to only
    //  while there's a map.
    {
      const listening = new Set<() => void>(),
        artChanged = (changed: () => void): (() => void) => {
          listening.add(changed);

          return (): void => void listening.delete(changed);
        },
        drawn = new MapView3D({ ...given!, artChanged }, fakeStage);

      drawn.toggleYields();
      drawn.flush();
      yieldsSet.splice(0);
      listening.forEach((changed) => changed());

      const redrawn = yieldsSet.splice(0).length,
        whileShown = listening.size;

      drawn.dispose();

      expect(
        "when the page's art changes, the yields are given to the stage again, and nothing's listening once the map's taken down",
        [redrawn, whileShown, listening.size],
        [1, 1, 0]
      );
    }

    tiles.forEach((tile) =>
      Object.assign(tile, { yields: [], workedBy: null })
    );
    tiles.forEach((tile) => view.queueTile(tile));
    view.releaseTiles();
  }

  view.showActiveUnit([]);

  expect(
    'a unit to give orders to brings the units back, as on the 2D map',
    view.shown().units,
    true
  );

  // Choosing a square for a long-range order: a click on the map picks the square under it, if it's one taken. On a
  //  canvas of its own: the 2D maps made above leave their listeners on theirs.
  const ownBox = document.createElement('div'),
    ownCanvas = document.createElement('canvas');

  ownBox.append(ownCanvas);
  document.body.append(ownBox);
  Object.defineProperties(ownCanvas, {
    setPointerCapture: { value: () => {}, configurable: true },
    clientWidth: { get: () => box.width, configurable: true },
    clientHeight: { get: () => box.height, configurable: true },
    getBoundingClientRect: {
      value: () => ({ left: 0, top: 0, right: box.width, bottom: box.height }),
      configurable: true,
    },
  });

  const chooser = makeMapView({
      ...deps2D,
      mapPortal: ownCanvas,
    }) as MapView3D,
    picked: string[] = [],
    clickAt = (clientX: number, clientY: number): void =>
      ['pointerdown', 'pointerup'].forEach((type) =>
        ownCanvas.dispatchEvent(
          Object.assign(new Event(type), {
            clientX,
            clientY,
            button: 0,
            pointerId: 1,
            isPrimary: true,
            pointerType: 'mouse',
            timeStamp: 0,
          })
        )
      );

  chooser.centre(tiles[5] as Tile);
  chooser.pickTile(
    (tile) => tile.x !== 0,
    (tile) => void picked.push(`${tile.x},${tile.y}`),
    'Where?'
  );

  const choosing = [
    chooser.picking(),
    ownCanvas.classList.contains('picking-tile'),
    document.querySelectorAll('.pick-tile').length,
  ];

  // The middle of the canvas: the square the camera looks at.
  clickAt(box.width / 2, box.height / 2);

  expect(
    'choosing a square: a window says what for, and a click on the map picks the square under it; then it ends',
    [
      choosing,
      picked,
      chooser.picking(),
      ownCanvas.classList.contains('picking-tile'),
    ],
    [[true, true, 1], ['1,1'], false, false]
  );

  chooser.dispose();

  // The mouse resting on a square: its tooltip opens after a moment, through the page's own; a key closes it, and while
  //  the other players move none opens.
  const tooltips: string[] = [],
    tipper = new MapView3D(
      {
        activateUnit: () => {},
        art: {
          id: () => 'art',
          nativeTileSize: () => ({ width: 16, height: 16 }),
          scale: () => 1,
          zoom: () => 1,
        },
        cameraDistance: { get: () => null, set: () => {} },
        cityOpener: { opens: () => false, open: () => {} },
        coveredBy: [],
        lockVerticalEdges: false,
        mapCanvas: ownCanvas,
        minimapCanvas: null,
        playerId: 'Player-1',
        squares: {
          click: () => {},
          prompt: () => ({ close: () => {} }),
          menu: () => {},
          menuOnRightClick: () => false,
          menuOpen: () => false,
          tooltip: (over, tile) => {
            tooltips.push(`open ${tile.x},${tile.y}`);

            return true;
          },
          endTooltip: () => void tooltips.push('closed'),
        },
        transport,
        world: new World(worldData),
      },
      fakeStage
    ),
    restAt = (clientX: number, clientY: number): void =>
      void ownCanvas.dispatchEvent(
        Object.assign(new Event('pointermove'), {
          clientX,
          clientY,
          buttons: 0,
          pointerId: 1,
          isPrimary: true,
          pointerType: 'mouse',
        })
      ),
    pause = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms));

  tipper.centre(tiles[5] as Tile);
  restAt(box.width / 2, box.height / 2);

  const waited = [...tooltips];

  await pause(450);

  const tipsOpened = [...tooltips];

  document.dispatchEvent(new Event('keydown'));

  const closedByKey = tooltips.splice(0);

  restAt(box.width / 2, box.height / 2);
  tipper.setWaiting(true);
  // Resting again while they move: still none.
  restAt(box.width / 2 + 1, box.height / 2);
  await pause(450);

  const whileWaiting = tooltips.splice(0);

  tipper.setWaiting(false);
  restAt(box.width / 2, box.height / 2);
  await pause(450);

  const reopened = tooltips.splice(0);

  tipper.zoomBy(1);

  const closedByZoom = tooltips.splice(0);

  restAt(box.width / 2, box.height / 2);
  await pause(450);
  tooltips.splice(0);
  tipper.dispose();

  expect(
    'resting on a square opens its tooltip after a moment; a key, a zoom and taking the map down close it; while the other players move, none opens',
    [
      waited,
      tipsOpened,
      closedByKey,
      whileWaiting,
      reopened,
      closedByZoom,
      tooltips,
    ],
    [
      [],
      ['open 1,1'],
      ['open 1,1', 'closed'],
      [],
      ['open 1,1'],
      ['closed'],
      ['closed'],
    ]
  );

  ownBox.remove();
  staged.splice(0);

  view.pickTile(
    () => true,
    () => {},
    'Where?'
  );
  view.endPicking();

  expect('given up, nothing is being chosen', view.picking(), false);

  expect('nor are there view modes to flip', view.debugViewModes(), []);

  // A unit picked in a city screen, and a city opened from the HUD.
  view.portal.emit('activate-unit', { id: 'Unit-2' } as unknown as Unit);

  expect('a unit picked is handed to the game', activated, ['Unit-2']);

  const city = (id: string, player: string): City =>
    ({ id, player: { id: player } } as unknown as City);

  expect(
    'a city opens when it is one that opens, from the 3D map’s own portal',
    [
      view.portal.openCity(city('City-1', 'Player-1')),
      view.portal.openCity(city('City-2', 'Player-2')),
      opened,
    ],
    [true, false, ['City-1 from MapPortal3D']]
  );
  expect(
    'and the player and transport are the game’s',
    [view.portal.playerId(), view.portal.transport() === transport],
    ['Player-1', true]
  );

  // Taken down with the game.
  staged.splice(0);
  view.dispose();

  expect('dispose lets the stage go', staged.splice(0), ['dispose']);

  // Once taken down, a size chosen in Options draws nothing.
  const markedWhenDown = JSON.stringify([...markers]);

  optionsRegistry.set(MAP3D_UNIT_SIZE_OPTION, 1.5);

  expect(
    'nor is anything drawn again at a size chosen after',
    [JSON.stringify([...markers]) === markedWhenDown, staged.splice(0)],
    [true, []]
  );
  optionsRegistry.set(MAP3D_UNIT_SIZE_OPTION, 1);

  box.width = 900;
  window.dispatchEvent(new Event('resize'));

  expect('and stops following the window', staged.splice(0), []);

  // In a browser, drawing waits for a frame, and many asks in one are drawn once; taken down, a frame still to come is
  //  given up.
  const frames = new Map<number, () => void>();
  let nextFrame = 1;

  Object.assign(globalThis, {
    requestAnimationFrame: (callback: () => void): number => {
      frames.set(nextFrame, callback);

      return nextFrame++;
    },
    cancelAnimationFrame: (frame: number) => void frames.delete(frame),
  });

  const framed = makeMapView(deps2D) as MapView3D;

  staged.length = 0;
  framed.portal.render();
  framed.portal.setCenter(2, 2);
  framed.flush();

  expect(
    'asked to draw three times, it waits for one frame',
    [staged.splice(0), frames.size],
    [[], 1]
  );

  [...frames.values()].forEach((callback) => callback());
  frames.clear();

  expect('and draws once in it', staged.splice(0), ['render']);

  framed.portal.render();
  framed.dispose();

  expect(
    'taken down with a frame still to come, the frame is given up',
    [frames.size, staged.splice(0)],
    [0, ['dispose']]
  );

  framed.portal.render();

  expect('and nothing more is drawn', [frames.size, staged.splice(0)], [0, []]);

  // With frames, and a clock run by hand: the first centring puts the camera there at once; after that it glides, and
  //  the glide ends. Zoomed mid-glide, it carries on at the new distance rather than easing back.
  let now = 1000;

  const realNow = performance.now.bind(performance),
    runFrames = (limit = 300): number => {
      let count = 0;

      while (frames.size > 0 && count < limit) {
        const waiting = [...frames.values()];

        frames.clear();
        now += 16;
        waiting.forEach((callback) => callback());
        count++;
      }

      return count;
    };

  Object.defineProperty(performance, 'now', {
    value: () => now,
    configurable: true,
  });

  const glider = makeMapView(deps2D) as MapView3D,
    middleOf = (tile: Tile): [number, number] =>
      [...glider.land().layout.centre(tile.x, tile.y)] as [number, number];

  runFrames();
  glider.centre(tiles[5] as Tile);

  const first = [...glider.orbit().focus];

  glider.centre(tiles[10] as Tile);

  const stillThere = [...glider.orbit().focus];

  runFrames(1);
  glider.zoomBy(2);

  const zoomedTo = glider.orbit().distance;

  runFrames(1);

  const zoomedStill = glider.orbit().distance,
    framesToEnd = runFrames();

  expect(
    'the first centring is at once; the next glides, carries on at a distance zoomed to mid-glide, and ends where it was going',
    [
      first,
      stillThere,
      Math.abs(zoomedStill - zoomedTo) < 1e-9,
      framesToEnd < 300,
      frames.size,
      glider.orbit().focus,
    ],
    [
      middleOf(tiles[5] as Tile),
      middleOf(tiles[5] as Tile),
      true,
      true,
      0,
      middleOf(tiles[10] as Tile),
    ]
  );

  // Close up, gliding to the square two along, before a frame's moved it: what's on the screen is what will be once it's
  //  there, so the game doesn't move it again for a unit by the square it's leaving, nor leave one it's going to.
  glider.setOrbit({
    ...glider.orbit(),
    yaw: 0,
    distance: DISTANCE_MIN,
    focus: middleOf(tiles[1 * 4 + 1] as Tile),
  });
  glider.centre(tiles[1 * 4 + 3] as Tile);

  const midGlide = [
    glider.orbit().focus,
    glider.portal.isVisible(3, 1, 1),
    glider.portal.isVisible(1, 1, 1),
    glider.moving(),
  ];

  runFrames();

  expect(
    'mid-glide, what’s on the screen is what will be once the camera’s there; it’s moving until it is',
    [...midGlide, glider.moving()],
    [middleOf(tiles[1 * 4 + 1] as Tile), true, false, true, false]
  );

  // A unit stepping onto a square walks there (`walks.ts`), drawn on its own, from where it stood: off the square it set
  //  off from at once, and onto the one it's bound for once it's there, as the engine tells them: its move, then its
  //  patch.
  const groundAt = (x: number, y: number): number[] => {
      const [u, v] = middleOf(tiles[y * 4 + x] as Tile);

      return [u, Math.max(0, glider.land().surfaceAt(u, v)), v].map(
        (n) => Math.round(n * 100) / 100
      );
    },
    unitOf = (id: string, defence: number, player = 'Player-1') =>
      ({
        id,
        _: 'Phalanx',
        defence: { value: defence },
        busy: null,
        player: { id: player, civilization: { attributes: [] } },
      } as unknown as Tile['units'][number]),
    walker = unitOf('Unit-A', 1),
    guard = unitOf('Unit-B', 5),
    rival = unitOf('Unit-R', 1, 'Player-2'),
    // The engine's patch: who's on each square now; drawn on the frames that follow, or not.
    patch = (...squares: [number, number, Tile['units'][number][]][]) => {
      squares.forEach(([x, y, units]) => {
        const tile = tiles[y * 4 + x] as Tile;

        tile.units = units as Tile['units'];
        glider.queueTile(tile);
      });
      glider.releaseTiles();
    },
    repatched = (...squares: [number, number, Tile['units'][number][]][]) => {
      patch(...squares);

      return runFrames();
    },
    stepped = (
      unit: Tile['units'][number],
      from: [number, number],
      to: [number, number],
      player = 'Player-1'
    ) =>
      glider.mapEvent({
        kind: 'moved',
        unit: {
          id: unit.id,
          type: 'Phalanx',
          player,
          tile: { x: from[0], y: from[1] },
        },
        from: { x: from[0], y: from[1] },
        to: { x: to[0], y: to[1] },
      }),
    unitOn = (x: number, y: number) => {
      const marker = markers.get(`${x},${y}`)?.unit;

      return marker === undefined || marker === null
        ? null
        : [marker.id, marker.count];
    },
    // Every walker drawn since last asked: their ids, and the units on top of each, in order.
    drawnWalkers = () => {
      const set = walkersSet.splice(0);

      return {
        ids: [...new Set(set.map(([id]) => id))],
        units: set.map(([, marker]) => marker?.unit?.id ?? null),
      };
    },
    // Where each walker was put, frame by frame: `u`, height and `v`, and its facing, to two places.
    placedSince = (): number[][][] => {
      const placed = [...walkersPlaced.values()].map((frames) =>
        frames.map((frame) => frame.map((n) => Math.round(n * 100) / 100))
      );

      walkersPlaced.clear();

      return placed;
    };

  repatched([0, 3, [walker]]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  // A first step east: off the square it set off from at once; drawn walking, and not on the square it's bound for till
  //  it's there, facing east; then there.
  stepped(walker, [0, 3], [1, 3]);

  const leftAtOnce = unitOn(0, 3);

  patch([0, 3, []], [1, 3, [walker]]);
  runFrames(1);

  const whileWalking = [unitOn(1, 3), [...walkers.values()][0]?.unit?.id];

  runFrames();

  const firstStep = {
      arrived: unitOn(1, 3),
      walkers: drawnWalkers(),
      placed: placedSince(),
    },
    [firstWay] = firstStep.placed;

  // A GoTo's steps, as the engine sends them, each with its patch: one walk, through the middle of the square between.
  stepped(walker, [1, 3], [2, 3]);
  patch([1, 3, []], [2, 3, [walker]]);
  stepped(walker, [2, 3], [2, 2]);
  patch([2, 3, []], [2, 2, [walker]]);
  runFrames(1);

  const goToBetween = [unitOn(2, 3), unitOn(2, 2)];

  runFrames();

  const goTo = {
      arrived: [unitOn(2, 3), unitOn(2, 2)],
      walkers: drawnWalkers(),
      placed: placedSince(),
    },
    [goToWay] = goTo.placed,
    middle = groundAt(2, 3);

  // Onto a square under a stronger unit: it walks there, and joins the stack under it.
  repatched([3, 2, [guard]]);
  walkersSet.length = 0;
  stepped(walker, [2, 2], [3, 2]);
  repatched([2, 2, []], [3, 2, [guard, walker]]);

  const underneath = { walkers: drawnWalkers(), arrived: unitOn(3, 2) };

  walkersPlaced.clear();

  // Over the world's seam, from the last column to the first: the short way, from beside the guard where it stood.
  stepped(walker, [3, 2], [0, 2]);
  repatched([3, 2, [guard]], [0, 2, [walker]]);

  const [overTheSeam] = placedSince();

  expect(
    'a unit stepping walks there, drawn on its own: off the square it set off from at once, not on the one it’s bound for till it’s there, facing the way it goes, from where it stood to where it stands; a GoTo’s steps one walk through the square between; under a stronger unit, it joins the stack; over the seam, the short way',
    [
      leftAtOnce,
      whileWalking,
      firstStep.arrived,
      firstStep.walkers,
      firstWay!.length > 5,
      firstWay![0]!
        .slice(0, 3)
        .every((n, at) => Math.abs(n - groundAt(0, 3)[at]!) < 0.02),
      firstWay!.at(-1)!.slice(0, 3),
      firstWay!.every(([, , , facing]) => facing === 1.57),
      firstWay!.every(
        ([u, , v], at, way) =>
          at === 0 || (u! >= way[at - 1]![0]! && v === groundAt(0, 3)[2])
      ),
      goToBetween,
      goTo.arrived,
      goTo.walkers.ids.length,
      goToWay!.some(
        ([u, , v]) =>
          Math.abs(u! - middle[0]!) < 0.05 && Math.abs(v! - middle[2]!) < 0.05
      ),
      goToWay!.at(-1)!.slice(0, 3),
      underneath,
      overTheSeam!.every(([u]) => u! >= 3.4 || u! <= 0.6),
      overTheSeam!.at(-1)!.slice(0, 3),
    ],
    [
      null,
      [null, 'Unit-A'],
      ['Unit-A', 1],
      { ids: ['walk-1'], units: ['Unit-A', null] },
      true,
      true,
      groundAt(1, 3),
      true,
      true,
      [null, null],
      [null, ['Unit-A', 1]],
      1,
      true,
      groundAt(2, 2),
      {
        walkers: { ids: ['walk-3'], units: ['Unit-A', null] },
        arrived: ['Unit-B', 2],
      },
      true,
      groundAt(0, 2),
    ]
  );

  // Out of a city: from where it stood, in front of the buildings, at the height of the square's middle, where a unit in
  //  a city stands, though the land in front lies a little higher or lower; to the middle of the square it's bound for.
  const walled = tiles[1 * 4 + 1] as Tile,
    [cityU, cityV] = middleOf(walled),
    cityStands = Math.max(0, glider.land().surfaceAt(cityU, cityV)),
    inFront = Math.max(0, glider.land().surfaceAt(cityU, cityV + 0.26));

  walled.city = {
    id: 'City-W',
    name: 'Walkton',
    player: { civilization: { attributes: [] } },
    originalPlayer: { civilization: { _: 'Romans' } },
  } as unknown as Tile['city'];
  repatched([1, 1, [walker]]);
  walkersPlaced.clear();
  stepped(walker, [1, 1], [2, 1]);
  repatched([1, 1, []], [2, 1, [walker]]);

  const [outOfTown] = [...walkersPlaced.values()],
    [firstU, firstY, firstV] = outOfTown![0]!;

  walkersPlaced.clear();
  walled.city = null;
  repatched([1, 1, []], [2, 1, []]);

  expect(
    'out of a city, a unit sets off from in front of the buildings, at the height of the square’s middle, where it stood, though the land there lies higher or lower; and ends at the middle of the square it’s bound for',
    [
      Math.abs(cityStands - inFront) > 1e-5,
      Math.abs(firstU! - cityU) < 0.01 &&
        Math.abs(firstV! - (cityV + 0.26)) < 0.01,
      Math.abs(firstY! - cityStands) < Math.abs(cityStands - inFront) / 2,
      outOfTown!
        .at(-1)!
        .slice(0, 3)
        .map((n) => Math.round(n * 100) / 100),
    ],
    [true, true, true, groundAt(2, 1)]
  );

  // A rival's unit walks twice as fast as the player's own.
  const framesFor = (
    unit: Tile['units'][number],
    from: [number, number],
    to: [number, number],
    player: string
  ): number => {
    repatched([from[0], from[1], [unit]]);
    stepped(unit, from, to, player);

    const frames = repatched([from[0], from[1], []], [to[0], to[1], [unit]]);

    repatched([to[0], to[1], []]);

    return frames;
  };

  const ownFrames = framesFor(walker, [1, 1], [2, 1], 'Player-1'),
    rivalFrames = framesFor(rival, [1, 1], [2, 1], 'Player-2');

  expect(
    'a rival’s unit walks twice as fast as the player’s own',
    [rivalFrames < ownFrames * 0.7, rivalFrames > 2],
    [true, true]
  );

  walkersSet.length = 0;
  walkersPlaced.clear();

  // Not where the player has asked for less motion: on its square at once, not drawn walking.
  repatched([0, 2, [walker]]);
  Object.assign(window, {
    matchMedia: (query: string) => ({ matches: query.includes('reduce') }),
  });
  stepped(walker, [0, 2], [1, 2]);
  patch([0, 2, []], [1, 2, [walker]]);
  runFrames(1);

  const lessMotion = [unitOn(1, 2), drawnWalkers()];

  delete (window as { matchMedia?: unknown }).matchMedia;
  runFrames();

  // Units hidden (`t`): it walks unseen, and shown again mid-walk, it's drawn walking, then where it's arrived.
  glider.toggleUnits();
  stepped(walker, [1, 2], [2, 2]);
  patch([1, 2, []], [2, 2, [walker]]);
  runFrames(2);

  const hiddenWalking = drawnWalkers();

  glider.toggleUnits();
  runFrames();

  const shown = drawnWalkers(),
    shownAgain = [[shown.ids.length, shown.units], unitOn(2, 2)];

  // The world's tiles replaced mid-walk, as a square newly seen does: the walk goes on, and the unit's on its square once
  //  it's there.
  stepped(walker, [2, 2], [3, 2]);
  patch([2, 2, []], [3, 2, [guard, walker]]);
  runFrames(2);

  const midWalk = unitOn(3, 2);

  glider.world.setTiles([...glider.world.tiles()], true);
  glider.flush();

  const worldReplaced = [unitOn(3, 2), walkers.size];

  runFrames();
  worldReplaced.push(unitOn(3, 2));
  walkersSet.length = 0;

  expect(
    'asked for less motion, a unit’s on its square at once, not walking; with units hidden it walks unseen, and is drawn walking once shown; the world’s tiles replaced mid-walk, as by a square newly seen, it walks on, and is on its square once there',
    [lessMotion, hiddenWalking, shownAgain, midWalk, worldReplaced],
    [
      [['Unit-A', 1], { ids: [], units: [] }],
      { ids: [], units: [] },
      [
        [1, ['Unit-A', null]],
        ['Unit-A', 1],
      ],
      ['Unit-B', 1],
      [['Unit-B', 1], 1, ['Unit-B', 2]],
    ]
  );

  repatched([3, 2, []]);

  // With no frames for a while, as in a tab out of sight, the walk ends by the clock: the first frame drawn again has
  //  the unit on its square, not walking.
  repatched([1, 1, [walker]]);
  walkersSet.length = 0;
  stepped(walker, [1, 1], [2, 1]);
  patch([1, 1, []], [2, 1, [walker]]);
  now += 2000;
  runFrames(1);

  expect(
    'with no frames for a while, a walk ends by the clock: the first frame drawn again has the unit on its square, not walking',
    [unitOn(2, 1), drawnWalkers()],
    [['Unit-A', 1], { ids: [], units: [] }]
  );

  runFrames();
  repatched([2, 1, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  // A walk given up as its unit steps from elsewhere, as a rival does after a step it wasn't seen to take: taken off the
  //  stage, the unit walking once only.
  repatched([0, 1, [walker]]);
  walkersSet.length = 0;
  stepped(walker, [0, 1], [1, 1]);
  patch([0, 1, []], [1, 1, [walker]]);
  runFrames(1);
  stepped(walker, [2, 1], [3, 1]);
  patch([1, 1, []], [3, 1, [walker]]);
  runFrames(1);

  const givenUp: unknown[] = [walkers.size, [...walkers.values()][0]?.unit?.id];

  runFrames();
  givenUp.push(walkers.size, unitOn(3, 1), unitOn(1, 1));

  // Over before its patch has come, as when meeting a leader holds it: it stands where it ended, not back where it set
  //  off, until the patch comes, with no frames drawn meanwhile.
  repatched([3, 1, []], [0, 2, [walker]]);
  walkersSet.length = 0;
  walkersPlaced.clear();
  stepped(walker, [0, 2], [1, 2]);
  runFrames();

  const [unpatchedWay] = [...walkersPlaced.values()],
    unpatched = [
      unitOn(0, 2),
      unitOn(1, 2),
      walkers.size,
      unpatchedWay!
        .at(-1)!
        .slice(0, 3)
        .map((n) => Math.round(n * 100) / 100),
      runFrames(),
    ];

  patch([0, 2, []], [1, 2, [walker]]);
  runFrames();
  unpatched.push(unitOn(0, 2), unitOn(1, 2), walkers.size);

  expect(
    'a walk given up as its unit steps from elsewhere is taken off the stage, the unit walking once only; a walk over before its patch stands where it ended, not back where it set off, until the patch comes, with no frames drawn meanwhile',
    [givenUp, unpatched],
    [
      [1, 'Unit-A', 0, ['Unit-A', 1], null],
      [null, null, 1, groundAt(1, 2), 0, null, ['Unit-A', 1], 0],
    ]
  );

  // A GoTo of two steps whose patches are all held, as meeting a leader holds them: it stands where it ended, not back
  //  where it set off. Units hidden meanwhile, it's hidden too; shown again, it's back. Stepping on before the patches
  //  come, it walks on from where it stands: the walk that waited taken away, another walking, drawn once, not back
  //  where it set off when that's over; and it's on its square once the patches have come.
  repatched([0, 2, [walker]], [1, 2, []], [2, 2, []]);
  walkersSet.length = 0;
  stepped(walker, [0, 2], [1, 2]);
  stepped(walker, [1, 2], [2, 2]);
  runFrames();

  const heldGoTo: unknown[] = [unitOn(0, 2), unitOn(2, 2), walkers.size];

  glider.toggleUnits();
  runFrames();
  heldGoTo.push(walkers.size);
  glider.toggleUnits();
  runFrames();
  heldGoTo.push(walkers.size);
  walkersSet.length = 0;
  stepped(walker, [2, 2], [3, 2]);
  runFrames(1);
  heldGoTo.push(walkers.size, [...walkers.values()][0]?.unit?.id);

  // The walk that waited taken off the stage, and another drawn walking.
  const steppedOn = walkersSet.splice(0);

  heldGoTo.push(
    steppedOn.filter(([, marker]) => marker === null).length,
    new Set(steppedOn.map(([id]) => id)).size
  );
  runFrames();
  heldGoTo.push(unitOn(0, 2), walkers.size);
  patch([0, 2, []], [3, 2, [walker]]);
  runFrames();
  heldGoTo.push(unitOn(0, 2), unitOn(3, 2), walkers.size);
  repatched([3, 2, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  expect(
    'a GoTo whose patches are all held stands where it ended, not back where it set off, hidden with units hidden; stepping on, it walks on, the walk that waited taken away, drawn once, waiting again where it walked to; on its square once the patches come',
    heldGoTo,
    [null, null, 1, 0, 1, 1, 'Unit-A', 1, 2, null, 1, null, ['Unit-A', 1], 0]
  );

  // The patches it waited for put the unit elsewhere, as talks sending it home do: there, and walking no more. Held
  //  for one step, put on another square; held for two, put back where it set off; and, not held, moved elsewhere
  //  mid-walk, as a spy's escape does.
  const putElsewhere = (
    steps: [number, number][],
    held: boolean,
    to: [number, number]
  ): unknown[] => {
    repatched([steps[0]![0], steps[0]![1], [walker]]);
    walkersSet.length = 0;
    steps.slice(1).forEach((square, at) => {
      stepped(walker, steps[at]!, square);

      if (!held) {
        patch([...steps[at]!, []], [...square, [walker]]);
      }
    });
    runFrames(held ? 300 : 2);
    patch(
      ...steps.map(([x, y]): [number, number, Tile['units'][number][]] => [
        x,
        y,
        [],
      ]),
      [to[0], to[1], [walker]]
    );
    runFrames();

    const found = [unitOn(...to), walkers.size];

    repatched([to[0], to[1], []]);
    walkersSet.length = 0;
    walkersPlaced.clear();

    return found;
  };

  expect(
    'the patches it waited for put the unit elsewhere, or back where it set off, or a patch moves it mid-walk: it’s there, walking no more',
    [
      putElsewhere(
        [
          [0, 2],
          [1, 2],
        ],
        true,
        [3, 3]
      ),
      putElsewhere(
        [
          [0, 2],
          [1, 2],
          [2, 2],
        ],
        true,
        [0, 2]
      ),
      putElsewhere(
        [
          [0, 2],
          [1, 2],
        ],
        false,
        [3, 3]
      ),
    ],
    [
      [['Unit-A', 1], 0],
      [['Unit-A', 1], 0],
      [['Unit-A', 1], 0],
    ]
  );

  // A move typed ahead straight back: the patch for the step before, with both its squares, comes, not yet drawn, as
  //  the step back's event does, and that step's patch is held. It waits, at the square it went back to.
  repatched([0, 2, [walker]], [1, 2, []], [2, 2, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();
  stepped(walker, [0, 2], [1, 2]);
  patch([0, 2, []], [1, 2, [walker]]);
  stepped(walker, [1, 2], [0, 2]);
  runFrames();

  const [backWay] = [...walkersPlaced.values()],
    straightBack: unknown[] = [
      unitOn(0, 2),
      unitOn(1, 2),
      walkers.size,
      backWay!
        .at(-1)!
        .slice(0, 3)
        .map((n) => Math.round(n * 100) / 100),
    ];

  patch([1, 2, []], [0, 2, [walker]]);
  runFrames();
  straightBack.push(unitOn(0, 2), unitOn(1, 2), walkers.size);
  repatched([0, 2, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  expect(
    'a move typed ahead straight back waits for its own step’s patch, though the one before has both its squares, standing where it went back to',
    straightBack,
    [null, null, 1, groundAt(0, 2), ['Unit-A', 1], null, 0]
  );

  // A move typed ahead: the patch for the step before comes, not yet drawn, as the next step's event does, and that
  //  step's patch is held. The walk waits for its own step's patch, not the one before it, which has a square in common.
  //  And a held step whose patch touches only where it set off, as when the unit's lost there: over, the unit nowhere.
  repatched([0, 2, [walker]], [1, 2, []], [2, 2, []]);
  walkersSet.length = 0;
  stepped(walker, [0, 2], [1, 2]);
  patch([0, 2, []], [1, 2, [walker]]);
  stepped(walker, [1, 2], [2, 2]);
  runFrames();

  const typedAhead: unknown[] = [
    unitOn(0, 2),
    unitOn(1, 2),
    unitOn(2, 2),
    walkers.size,
  ];

  patch([1, 2, []], [2, 2, [walker]]);
  runFrames();
  typedAhead.push(unitOn(1, 2), unitOn(2, 2), walkers.size);
  repatched([2, 2, []], [0, 2, [walker]]);
  walkersSet.length = 0;
  stepped(walker, [0, 2], [1, 2]);
  runFrames();
  typedAhead.push(walkers.size);
  patch([0, 2, []]);
  runFrames();
  typedAhead.push(unitOn(0, 2), unitOn(1, 2), walkers.size);
  walkersSet.length = 0;
  walkersPlaced.clear();

  expect(
    'a move typed ahead waits for its own step’s patch, not the one before it, then is on its square; a held step whose patch touches only where it set off ends, the unit nowhere',
    typedAhead,
    [null, null, null, 1, null, ['Unit-A', 1], 0, 1, null, null, 0]
  );

  // Drawn walking as the unit's drawn standing: the active one with its ring, at the size the player chose.
  repatched([1, 2, []], [0, 3, [walker]]);
  glider.setActiveUnit({ ...walker, tile: tiles[3 * 4] } as unknown as Unit);
  optionsRegistry.set(MAP3D_UNIT_SIZE_OPTION, 1.5);
  walkersSet.length = 0;
  stepped(walker, [0, 3], [1, 3]);
  patch([0, 3, []], [1, 3, [walker]]);
  runFrames(1);

  const asDrawn = [
    walkers.size,
    [...walkers.values()][0]?.unit?.active,
    [...walkers.values()][0]?.unit?.size,
  ];

  runFrames();
  optionsRegistry.set(MAP3D_UNIT_SIZE_OPTION, 1);
  glider.setActiveUnit(null);
  repatched([1, 3, []]);
  walkersSet.length = 0;

  // With units and cities hidden (`t`), the active unit in a city stands at the square's middle, as it's drawn there,
  //  and sets off from there.
  const hiddenTown = tiles[1 * 4 + 1] as Tile,
    [hiddenU, hiddenV] = middleOf(hiddenTown);

  hiddenTown.city = {
    id: 'City-H',
    name: 'Hiddenton',
    player: { civilization: { attributes: [] } },
    originalPlayer: { civilization: { _: 'Romans' } },
  } as unknown as Tile['city'];
  repatched([1, 1, [walker]]);
  glider.setActiveUnit({ ...walker, tile: hiddenTown } as unknown as Unit);
  glider.toggleUnits();
  walkersPlaced.clear();
  stepped(walker, [1, 1], [2, 1]);
  patch([1, 1, []], [2, 1, [walker]]);
  runFrames(1);

  const [hiddenFirst] = [...walkersPlaced.values()].map((frames) => frames[0]!),
    fromHiddenCity = [
      Math.abs(hiddenFirst![0]! - hiddenU) < 0.01,
      Math.abs(hiddenFirst![2]! - hiddenV) < 0.01,
    ];

  runFrames();
  glider.toggleUnits();
  glider.setActiveUnit(null);
  hiddenTown.city = null;
  repatched([1, 1, []], [2, 1, []]);
  walkersPlaced.clear();
  walkersSet.length = 0;

  // A rival walking, hurt in a battle on the way, as a patch has it: drawn hurt, walking on.
  repatched([1, 1, [rival]]);
  stepped(rival, [1, 1], [2, 1], 'Player-2');
  patch([1, 1, []], [2, 1, [rival]]);
  runFrames(1);
  patch([
    2,
    1,
    [{ ...rival, hitPoints: { current: 5, max: 10 } } as Tile['units'][number]],
  ]);
  runFrames(1);

  const hurtWalking = [walkers.size, [...walkers.values()][0]?.unit?.health];

  runFrames();
  repatched([2, 1, []]);
  walkersSet.length = 0;

  // Less motion asked for mid-walk: the walk's over on the next frame, the unit on its square.
  repatched([1, 1, [walker]]);
  stepped(walker, [1, 1], [2, 1]);
  patch([1, 1, []], [2, 1, [walker]]);
  runFrames(1);
  Object.assign(window, {
    matchMedia: (query: string) => ({ matches: query.includes('reduce') }),
  });
  runFrames(1);

  const lessMotionMidWalk = [walkers.size, unitOn(2, 1)];

  delete (window as { matchMedia?: unknown }).matchMedia;
  runFrames();
  repatched([2, 1, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  expect(
    'with units hidden, the active unit sets off from a city square’s middle, where it’s drawn; a walker hurt on the way is drawn hurt; less motion asked for mid-walk ends it on the next frame',
    [fromHiddenCity, hurtWalking, lessMotionMidWalk],
    [
      [true, true],
      [1, 0.5],
      [0, ['Unit-A', 1]],
    ]
  );

  // A rival's unit stepping out of the dark, where the page doesn't have it: on its square at once, not walking.
  stepped(rival, [2, 2], [3, 2], 'Player-2');
  patch([3, 2, [rival]]);
  runFrames(1);

  const outOfTheDark = [unitOn(3, 2), drawnWalkers()];

  runFrames();
  repatched([3, 2, []]);

  // A rival's unit off the screen, the camera close in elsewhere: on its square at once, not walking.
  const lookedFrom = glider.orbit();

  glider.setOrbit({
    ...lookedFrom,
    focus: middleOf(tiles[0] as Tile),
    distance: 0,
  });
  runFrames();
  repatched([2, 2, [rival]]);
  walkersSet.length = 0;
  stepped(rival, [2, 2], [3, 2], 'Player-2');
  patch([2, 2, []], [3, 2, [rival]]);
  runFrames(1);

  const offScreen = [unitOn(3, 2), drawnWalkers()];

  glider.setOrbit(lookedFrom);
  runFrames();
  repatched([3, 2, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  expect(
    'a unit walking is drawn as it is standing, the active one ringed, at the size chosen; a rival’s stepping out of the dark, or off the screen, is on its square at once, not walking',
    [asDrawn, outOfTheDark, offScreen],
    [
      [1, true, 1.5],
      [['Unit-R', 1], { ids: [], units: [] }],
      [['Unit-R', 1], { ids: [], units: [] }],
    ]
  );

  // The game waits for the unit that was active to walk there (§8.2): the next unit's ring, and the camera going to it,
  //  wait till it's there. A key or a press on the map for it ends the walk at once; a key while the unit walking is
  //  still the active one doesn't. A rival's walk holds nothing.
  const placed = (unit: Tile['units'][number], x: number, y: number) =>
      ({ ...unit, tile: tiles[y * 4 + x] } as unknown as Unit),
    nextUnit = unitOf('Unit-N', 1),
    ringOn = (x: number, y: number) =>
      markers.get(`${x},${y}`)?.unit?.active ?? null,
    walkerRinged = () => [...walkers.values()][0]?.unit?.active ?? null,
    focusOn = (x: number, y: number) => {
      const [u, v] = middleOf(tiles[y * 4 + x] as Tile),
        [focusU, focusV] = glider.orbit().focus;

      return Math.hypot(focusU - u, focusV - v) < 0.01;
    },
    pickedNext = (from: [number, number], to: [number, number]) => {
      repatched([from[0], from[1], [walker]], [3, 3, [nextUnit]]);
      glider.setActiveUnit(placed(walker, ...from));
      glider.portal.setCenter(...from);
      runFrames();
      walkersSet.length = 0;
      stepped(walker, from, to);
      patch([from[0], from[1], []], [to[0], to[1], [walker]]);
      // As the game does when a unit's moves are spent: the next unit active, and the map centred on it.
      glider.setActiveUnit(placed(nextUnit, 3, 3));
      glider.portal.setCenter(3, 3);
      runFrames(2);
    };

  pickedNext([0, 0], [1, 0]);
  // A patch for the next unit's square meanwhile marks it again, still without the ring.
  patch([3, 3, [nextUnit]]);
  runFrames(1);

  const meanwhile = [walkerRinged(), ringOn(3, 3), focusOn(0, 0)];

  runFrames();

  const caughtUp = [unitOn(1, 0), ringOn(1, 0), ringOn(3, 3), focusOn(3, 3)];

  // A key for the next unit mid-walk: the walk's over at once, the ring and the camera with the next unit.
  pickedNext([1, 0], [2, 0]);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));

  const keyed = [unitOn(2, 0), [...walkers.keys()], ringOn(3, 3)];

  runFrames();

  const keyedThere = focusOn(3, 3);

  // Pressed on the map mid-walk: over at once too, but the camera stays where the player's looking.
  pickedNext([2, 0], [2, 1]);
  mapCanvas.dispatchEvent(new Event('pointerdown'));

  const pressed = [unitOn(2, 1), walkers.size, ringOn(3, 3)];

  runFrames();
  pressed.push(focusOn(2, 0));

  // A key for the next unit mid-walk, the walk's patch held: over at once, standing where it was bound, not mid-way.
  repatched([2, 1, []], [1, 1, [walker]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(walker, 1, 1));
  runFrames();
  walkersPlaced.clear();
  stepped(walker, [1, 1], [1, 2]);
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  runFrames(2);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
  runFrames(1);

  const [heldWay] = [...walkersPlaced.values()],
    keyedHeld: unknown[] = [
      walkers.size,
      heldWay!
        .at(-1)!
        .slice(0, 3)
        .map((n) => Math.round(n * 100) / 100),
    ];

  patch([1, 1, []], [1, 2, [walker]]);
  runFrames();
  keyedHeld.push(unitOn(1, 2), walkers.size);
  repatched([1, 2, []], [2, 1, [walker]]);
  walkersPlaced.clear();

  expect(
    'a key for the next unit mid-walk, the walk’s patch held: over at once, standing where it was bound until the patch comes',
    keyedHeld,
    [1, groundAt(1, 2), ['Unit-A', 1], 0]
  );

  // A key while the unit walking is still the active one: it walks on.
  repatched([2, 1, [walker]]);
  glider.setActiveUnit(placed(walker, 2, 1));
  runFrames();
  stepped(walker, [2, 1], [1, 1]);
  patch([2, 1, []], [1, 1, [walker]]);
  glider.setActiveUnit(placed(walker, 1, 1));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  runFrames(1);

  const stillWalking = [unitOn(1, 1), walkers.size];

  runFrames();

  // A rival's walk: the ring and the camera go to the next unit at once.
  repatched([1, 1, []], [0, 2, [rival]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(walker, 1, 1));
  glider.portal.setCenter(1, 2);
  runFrames();
  stepped(rival, [0, 2], [1, 2], 'Player-2');
  patch([0, 2, []], [1, 2, [rival]]);
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  glider.portal.setCenter(3, 3);
  runFrames(2);

  const rivalWalking = [walkers.size, ringOn(3, 3), !focusOn(1, 2)];

  runFrames();

  expect(
    'the next unit’s ring and the camera wait for the player’s own unit walking, then go to it; a key for it ends the walk at once, a press on the map too but the camera stays; a key while the unit walking is active doesn’t; a rival’s walk holds nothing',
    [
      meanwhile,
      caughtUp,
      keyed,
      keyedThere,
      pressed,
      stillWalking,
      rivalWalking,
    ],
    [
      [true, false, true],
      [['Unit-A', 1], false, true, true],
      [['Unit-A', 1], [], true],
      true,
      [['Unit-A', 1], 0, true, true],
      [null, 1],
      [1, true, true],
    ]
  );

  repatched([1, 2, []], [3, 3, []], [1, 1, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  // The active unit moved on and on, near the screen's edge: the camera follows it at once, not when it stops.
  repatched([0, 0, [walker]]);
  glider.setActiveUnit(placed(walker, 0, 0));
  glider.portal.setCenter(0, 0);
  runFrames();
  stepped(walker, [0, 0], [1, 0]);
  patch([0, 0, []], [1, 0, [walker]]);
  glider.setActiveUnit(placed(walker, 1, 0));
  glider.portal.setCenter(1, 0);
  runFrames(3);

  const followed = [walkers.size, !focusOn(0, 0)];

  runFrames();
  repatched([1, 0, []]);

  // Another chosen while the unit walking would still be offered, with moves (`w`): its walk's over at once, the ring on
  //  the next.
  const mover = {
    ...unitOf('Unit-M', 1),
    moves: { value: 1 },
  } as unknown as Tile['units'][number];

  repatched([0, 0, [mover]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(mover, 0, 0));
  runFrames();
  walkersSet.length = 0;
  stepped(mover, [0, 0], [1, 0]);
  patch([0, 0, []], [1, 0, [mover]]);
  runFrames(1);
  glider.setActiveUnit(placed(nextUnit, 3, 3));

  const switched = [unitOn(1, 0), walkers.size, ringOn(3, 3)];

  runFrames();
  repatched([1, 0, []]);

  // One no longer active, as one boarding a ship is asleep aboard, isn't offered, whatever its moves: the game's chosen
  //  the next, and the ring waits for it.
  const boarder = {
    ...unitOf('Unit-S', 1),
    moves: { value: 1 },
    active: false,
  } as unknown as Tile['units'][number];

  repatched([0, 0, [boarder]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(boarder, 0, 0));
  runFrames();
  stepped(boarder, [0, 0], [1, 0]);
  patch([0, 0, []], [1, 0, [boarder]]);
  runFrames(1);
  glider.setActiveUnit(placed(nextUnit, 3, 3));

  const boarded = [walkers.size, ringOn(3, 3)];

  runFrames();
  boarded.push(ringOn(3, 3));
  repatched([1, 0, []]);

  // The next unit walks too before the last's there: once both are, one ring, on the next unit where it walked to.
  repatched([0, 0, [walker]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(walker, 0, 0));
  runFrames();
  stepped(walker, [0, 0], [1, 0]);
  patch([0, 0, []], [1, 0, [walker]]);
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  runFrames(5);
  stepped(nextUnit, [3, 3], [3, 2]);
  patch([3, 3, []], [3, 2, [nextUnit]]);
  glider.setActiveUnit(placed(nextUnit, 3, 2));
  runFrames();

  const rings = [...markers.entries()]
    .filter(([, marker]) => marker.unit?.active)
    .map(([key]) => key);

  repatched([1, 0, []], [3, 2, []]);

  // The walk over before its patch, the ring moves on: the walker that waits is drawn again without it.
  repatched([0, 0, [walker]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(walker, 0, 0));
  runFrames();
  stepped(walker, [0, 0], [1, 0]);
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  runFrames();

  const waitingUnringed = [walkers.size, walkerRinged(), ringOn(3, 3)];

  patch([0, 0, []], [1, 0, []]);
  runFrames();
  repatched([3, 3, []]);

  expect(
    'the camera follows the active unit walking on and on; another chosen while it has moves ends its walk at once; the next walking too, one ring once both are there; a walker waiting for its patch drawn again without the ring',
    [followed, switched, boarded, rings, waitingUnringed],
    [
      [1, true],
      [['Unit-M', 1], 0, true],
      [1, false, true],
      ['3,2'],
      [1, false, true],
    ]
  );

  // Keys that aren't for a unit: typed in a field, a modifier alone, or with Ctrl or Alt, leave the walk to go on.
  const field = document.createElement('input');

  document.body.append(field);
  repatched([0, 0, [walker]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(walker, 0, 0));
  runFrames();
  stepped(walker, [0, 0], [1, 0]);
  patch([0, 0, []], [1, 0, [walker]]);
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  runFrames(1);
  field.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'w', bubbles: true })
  );
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
  // With Ctrl, then Alt, held: the test's DOM doesn't take them from the event's init, so they're set on it.
  ['ctrlKey', 'altKey'].forEach((modifier) => {
    const event = new KeyboardEvent('keydown', { key: 'w' });

    Object.defineProperty(event, modifier, { value: true });
    document.dispatchEvent(event);
  });
  runFrames(1);

  const notForAUnit = [walkers.size, ringOn(3, 3)];

  runFrames();
  field.remove();
  repatched([1, 0, []], [3, 3, []]);

  // While the ring waits, what the camera will see is where it's to go: the square it looks at now, well in from the
  //  screen's edges, isn't in sight from there, so the game centres on it rather than leave it off the screen once the
  //  ring moves on.
  const viewedFrom = glider.orbit();

  glider.setOrbit({
    ...viewedFrom,
    focus: middleOf(tiles[0] as Tile),
    distance: 0,
  });
  runFrames();
  repatched([0, 0, [walker]], [2, 2, [nextUnit]]);
  glider.setActiveUnit(placed(walker, 0, 0));
  runFrames();

  const inSightBefore = glider.portal.isVisible(0, 0, 1);

  stepped(walker, [0, 0], [1, 0]);
  patch([0, 0, []], [1, 0, [walker]]);
  glider.setActiveUnit(placed(nextUnit, 2, 2));
  glider.portal.setCenter(2, 2);

  const inSightAfter = glider.portal.isVisible(0, 0, 1);

  // The unit walking made active again before it's there: where the camera was to go is for no one now, and what's in
  //  sight is as the camera looks.
  glider.setActiveUnit(placed(walker, 1, 0));

  const inSightAgain = glider.portal.isVisible(0, 0, 1);

  runFrames();
  glider.setOrbit(viewedFrom);
  runFrames();
  repatched([1, 0, []], [2, 2, []]);

  // Another of the player's units walking, not the one that was active, as a GoTo at the turn's start: it holds nothing.
  const goer = unitOf('Unit-G', 1);

  repatched([0, 2, [goer]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  runFrames();
  stepped(goer, [0, 2], [1, 2]);
  patch([0, 2, []], [1, 2, [goer]]);
  glider.setActiveUnit(null);
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  glider.portal.setCenter(1, 1);
  runFrames(3);

  const elsewhere = [walkers.size, ringOn(3, 3), !focusOn(3, 3)];

  runFrames();
  glider.setActiveUnit(null);
  repatched([1, 2, []], [3, 3, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  expect(
    'keys typed in a field, a modifier alone, or with Ctrl or Alt, leave the walk to go on; while the ring waits, a square is in sight as the camera will look, and as it looks once the unit walking is active again; another unit of the player’s walking holds nothing',
    [notForAUnit, [inSightBefore, inSightAfter, inSightAgain], elsewhere],
    [
      [1, false],
      [true, false, true],
      [1, true, true],
    ]
  );

  // As the player chose in Options: walking quickly, the player's own units take half as long as walking; moving at
  //  once, there's no walk, the unit on its square at once; with others' units' moves not shown, a rival's on the
  //  screen doesn't walk. Read at each move.
  glider.setActiveUnit(null);
  glider.portal.setCenter(1, 1);
  runFrames();

  const walkFrames = framesFor(walker, [1, 1], [2, 1], 'Player-1');

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'fast');

  const quickFrames = framesFor(walker, [1, 1], [2, 1], 'Player-1'),
    quickRival = framesFor(rival, [1, 1], [2, 1], 'Player-2');

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'off');
  walkersSet.length = 0;
  repatched([1, 1, [walker]]);
  stepped(walker, [1, 1], [2, 1]);
  patch([1, 1, []], [2, 1, [walker]]);
  runFrames(1);

  const atOnce = [unitOn(2, 1), drawnWalkers()];

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');
  optionsRegistry.set(MAP3D_RIVALS_WALK_OPTION, false);
  runFrames();
  repatched([2, 1, []], [1, 1, [rival]]);
  walkersSet.length = 0;
  stepped(rival, [1, 1], [2, 1], 'Player-2');
  patch([1, 1, []], [2, 1, [rival]]);
  runFrames(1);

  const rivalsHidden = [unitOn(2, 1), drawnWalkers()];

  optionsRegistry.set(MAP3D_RIVALS_WALK_OPTION, true);
  runFrames();
  repatched([2, 1, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  // A rival walking already when others' moves are turned off: it walks on, as one walk, to where it's bound.
  repatched([1, 1, [rival]]);
  walkersPlaced.clear();
  stepped(rival, [1, 1], [2, 1], 'Player-2');
  patch([1, 1, []], [2, 1, [rival]]);
  runFrames(2);
  optionsRegistry.set(MAP3D_RIVALS_WALK_OPTION, false);
  stepped(rival, [2, 1], [2, 2], 'Player-2');
  patch([2, 1, []], [2, 2, [rival]]);
  runFrames(1);

  const rivalWalksOn: unknown[] = [unitOn(2, 2), drawnWalkers().ids.length];

  runFrames();

  const [rivalWay] = [...walkersPlaced.values()];

  rivalWalksOn.push(
    unitOn(2, 2),
    rivalWay!
      .at(-1)!
      .slice(0, 3)
      .every((n, at) => Math.abs(n - groundAt(2, 2)[at]!) < 0.05)
  );
  optionsRegistry.set(MAP3D_RIVALS_WALK_OPTION, true);
  repatched([2, 2, []]);

  // Moving at once chosen mid-walk: the walk's over on the next frame, and the next step isn't walked.
  repatched([1, 1, [walker]]);
  stepped(walker, [1, 1], [2, 1]);
  patch([1, 1, []], [2, 1, [walker]]);
  runFrames(3);
  optionsRegistry.set(MAP3D_WALKS_OPTION, 'off');
  runFrames(1);

  const offMidWalk = [walkers.size, unitOn(2, 1)];

  stepped(walker, [2, 1], [3, 1]);
  patch([2, 1, []], [3, 1, [walker]]);
  runFrames(1);
  offMidWalk.push(unitOn(3, 1), walkers.size);
  optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');
  runFrames();
  repatched([3, 1, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  expect(
    'walking quickly takes half as long, a rival’s too, walking still; moving at once, the unit’s on its square at once, not walking, and chosen mid-walk ends it on the next frame; with others’ moves not shown, a rival’s on the screen doesn’t walk, but one walking already walks on',
    [
      quickFrames < walkFrames * 0.7,
      quickRival < quickFrames && quickRival > 2,
      atOnce,
      offMidWalk,
      rivalsHidden,
      rivalWalksOn,
    ],
    [
      true,
      true,
      [['Unit-A', 1], { ids: [], units: [] }],
      [0, ['Unit-A', 1], ['Unit-A', 1], 0],
      [['Unit-R', 1], { ids: [], units: [] }],
      [null, 1, ['Unit-R', 1], true],
    ]
  );

  // Turns, frame by frame: how far the camera turns in all, the way it turns, each frame's step taken the short way.
  const turnedFrameByFrame = (between: () => void): number => {
    let turned = 0,
      last = glider.orbit().yaw;
    const step = (): void => {
      const yaw = glider.orbit().yaw;

      turned += shortWay(yaw - last);
      last = yaw;
    };

    for (let frame = 0; frame < 3 && runFrames(1) > 0; frame++) {
      step();
    }

    between();

    while (runFrames(1) > 0) {
      step();
    }

    return Math.round((turned / (Math.PI / 4)) * 1000) / 1000;
  };
  const shortWay = (delta: number): number =>
    delta - Math.PI * 2 * Math.round(delta / (Math.PI * 2));

  // A second turn pressed between frames, mid-glide: the camera ends two eighths round exactly, not short of it, nor a
  //  whole turn past it; anticlockwise from north too, crossing it as it goes. And centred on a square mid-turn, it
  //  finishes the turn under way, no more.
  {
    const eighth = Math.PI / 4;

    // Clockwise from an eighth short of north, across it.
    glider.setOrbit({ ...glider.orbit(), yaw: eighth * 7 });
    glider.turnBy(1);

    const clockwise = turnedFrameByFrame(() => {
      now += 8;
      glider.turnBy(1);
    });
    const endedAt = Math.round((glider.orbit().yaw - eighth) * 1e6);

    glider.setOrbit({ ...glider.orbit(), yaw: 0 });
    glider.turnBy(-1);

    const anticlockwise = turnedFrameByFrame(() => {
      now += 8;
      glider.turnBy(-1);
    });

    glider.setOrbit({ ...glider.orbit(), yaw: 0 });
    glider.turnBy(-1);

    const thenCentred = turnedFrameByFrame(() =>
      glider.centre(tiles[2 * 4 + 2] as Tile)
    );

    expect(
      'a second turn pressed between frames ends two eighths round exactly, either way, across north; centred mid-turn, the turn ends as it would',
      [endedAt, clockwise, anticlockwise, thenCentred],
      [0, 2, -2, -1]
    );
  }

  // Five quick turns clockwise, before a frame's drawn: the camera turns clockwise all the way, five eighths of a turn,
  //  never back the short way round. Then north, the short way from there.
  const turn = Math.PI / 4,
    toTurn = (angle: number): number =>
      Math.round(
        (((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000
      ) / 1000,
    clockwise = (from: number, to: number): number =>
      Math.round(
        ((((to - from) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000
      ) / 1000;

  // Mid-turn, the keys that move a unit follow the way it's turning to, not the way it's drawn so far: the player
  //  pressed the turn before the arrow.
  glider.setOrbit({ ...glider.orbit(), yaw: 0 });
  glider.turnBy(2);
  runFrames(2);

  const midTurn = [
    Math.round((glider.orbit().yaw * 180) / Math.PI) < 90,
    Math.round((glider.heading().turn * 180) / Math.PI),
  ];

  runFrames();

  expect("mid-turn, its heading is the way it's turning to", midTurn, [
    true,
    90,
  ]);

  glider.setOrbit({ ...glider.orbit(), yaw: 0 });

  const startYaw = glider.orbit().yaw;

  [1, 2, 3, 4, 5].forEach(() => glider.turnBy(1));
  runFrames(4);

  const turning = clockwise(startYaw, glider.orbit().yaw);

  runFrames();

  const turnedTo = toTurn(glider.orbit().yaw);

  glider.faceNorth();
  runFrames(4);

  const northward = glider.orbit().yaw;

  runFrames();

  expect(
    'five quick turns turn the camera clockwise all the way, five eighths round; north then the short way',
    [
      turning > 0 && turning < Math.PI,
      turnedTo,
      // From five eighths round, north is three eighths on, clockwise.
      clockwise(turn * 5, northward) > 0 &&
        clockwise(turn * 5, northward) < Math.PI,
      toTurn(glider.orbit().yaw),
    ],
    [true, toTurn(turn * 5), true, 0]
  );

  glider.dispose();
  Object.defineProperty(performance, 'now', {
    value: realNow,
    configurable: true,
  });

  // The camera's distance, kept as an option: not saved before the player changes it, saved once they do, read back by
  //  the next map, and kept within the camera's range whatever's kept.
  // None chosen (the default, 0), whatever the zooming above kept.
  optionsRegistry.set(MAP3D_DISTANCE_OPTION, 0);

  const distanceKept = (): unknown =>
      optionsRegistry.get(MAP3D_DISTANCE_OPTION, 'none'),
    keeper = makeMapView(deps2D) as MapView3D;

  runFrames();

  const unsaved = distanceKept();

  // Its first centring is at once: the next glides.
  keeper.centre(tiles[5] as Tile);
  runFrames();
  keeper.zoomBy(2);
  runFrames();

  // Not every frame of a zoom or a pinch: once it's stayed the same a moment, however many frames are drawn meanwhile.
  const notYet = distanceKept();

  for (let wait = 0; wait < 7; wait++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    keeper.portal.render();
    runFrames();
  }

  const saved = distanceKept();

  // At once, as the map's taken down, even mid-glide: the distance it's gliding at.
  keeper.zoomBy(1);
  runFrames();
  keeper.centre(tiles[6] as Tile);
  keeper.dispose();

  const atDispose = distanceKept(),
    readBack = makeMapView(deps2D) as MapView3D,
    readDistance = readBack.orbit().distance;

  readBack.dispose();

  const rangeOf = (kept: number): number => {
    optionsRegistry.set(MAP3D_DISTANCE_OPTION, kept);

    const view = makeMapView(deps2D) as MapView3D,
      { distance } = view.orbit();

    view.dispose();

    return distance;
  };

  expect(
    'the camera’s distance is kept once the player changes it and it’s stayed the same a moment, or the map’s taken down, read back by the next map, and kept within its range',
    [
      unsaved,
      notYet,
      typeof saved === 'number' && saved > 0 && saved < 24,
      typeof atDispose === 'number' &&
        typeof saved === 'number' &&
        atDispose < saved,
      readDistance === atDispose,
      rangeOf(5000),
      rangeOf(-5),
    ],
    [0, 0, true, true, true, DISTANCE_MAX, 24]
  );

  optionsRegistry.set(MAP3D_DISTANCE_OPTION, 0);

  // Stopped at the poles, as the player can ask: the camera stays within the world's rows, rather than going round.
  kept.lockVerticalEdges = true;

  const locked = makeMapView(deps2D) as MapView3D,
    beyond = (view: MapView3D): number => {
      view.setOrbit({ ...view.orbit(), focus: [1, 1000] });

      return view.orbit().focus[1];
    },
    lockedAt = beyond(locked),
    // The square it looks at, past the pole: the last row's, not the first's.
    lockedCentre = locked.portal.center();

  // A glide from the top row to the bottom goes down the world, not over the pole it's stopped at: on the clock run by
  //  hand again.
  Object.defineProperty(performance, 'now', {
    value: () => now,
    configurable: true,
  });
  locked.centre(tiles[2] as Tile);
  locked.centre(tiles[14] as Tile);
  runFrames();
  Object.defineProperty(performance, 'now', {
    value: realNow,
    configurable: true,
  });

  const glidedTo = locked.orbit().focus,
    bottom = locked.land().layout.centre(2, 3),
    lockedDown = seenDown[seenDown.length - 1];

  locked.dispose();
  kept.lockVerticalEdges = false;

  const wrapping = makeMapView(deps2D) as MapView3D,
    wrappedAt = beyond(wrapping);

  runFrames();

  const wrappingDown = seenDown[seenDown.length - 1];

  wrapping.dispose();

  expect(
    'stopped at the poles, the camera stays at the world’s last row, looking at a square in it, glides down the world to a square, and nothing is drawn past them; otherwise it goes round, and so is the world drawn',
    [
      lockedAt === locked.land().extentV(),
      lockedCentre,
      glidedTo,
      lockedDown,
      wrappedAt < locked.land().extentV(),
      wrappingDown,
    ],
    [true, { x: 1, y: 3 }, bottom, null, true, 4]
  );

  delete (globalThis as any).requestAnimationFrame;
  delete (globalThis as any).cancelAnimationFrame;

  // The script itself: a tag versioned by the build, whose factory is what it puts on the page.
  setBuild({ version: '0.1.0@abc', musicWorkletUrl: '' });

  const lastScript = (): HTMLScriptElement =>
      [...document.head.querySelectorAll('script')].pop() as HTMLScriptElement,
    factory3D: CreateMapView3D = (deps) => new MapView3D(deps, fakeStage),
    loaded = loadMap3DScript();

  expect(
    'the script is asked for by a tag versioned by the build',
    lastScript().getAttribute('src'),
    'dist/map3d.js?v=0.1.0%40abc'
  );

  (window as any)[MAP3D_GLOBAL] = { createMapView3D: factory3D };
  lastScript().dispatchEvent(new Event('load'));

  expect(
    'loaded, it gives the factory it put on the page',
    // By identity: `expect` compares by JSON, which a function has none of.
    (await loaded) === factory3D,
    true
  );

  delete (window as any)[MAP3D_GLOBAL];

  const outcome = (promise: Promise<unknown>): Promise<string> =>
      promise.then(
        () => 'resolved',
        (failure: Error) => failure.message
      ),
    empty = loadMap3DScript();

  lastScript().dispatchEvent(new Event('load'));

  const failing = loadMap3DScript();

  lastScript().dispatchEvent(new Event('error'));

  expect(
    'one that puts nothing on the page, or can’t be fetched, or takes too long, is refused',
    [
      await outcome(empty),
      await outcome(failing),
      await outcome(loadMap3DScript(5)),
    ],
    [
      'dist/map3d.js put no map on the page',
      'dist/map3d.js could not be fetched',
      'dist/map3d.js took too long to fetch',
    ]
  );

  // One that arrived after a start stopped waiting for it is there for the next: not fetched again.
  const tags = (): number => document.head.querySelectorAll('script').length,
    tagsBefore = tags();

  (window as any)[MAP3D_GLOBAL] = { createMapView3D: factory3D };

  expect(
    'a script that arrived late is taken as it is, with no second tag',
    [(await loadMap3DScript()) === factory3D, tags() - tagsBefore],
    [true, 0]
  );

  delete (window as any)[MAP3D_GLOBAL];

  // `dist/map3d.js`: three.js and the 3D map's own code, and from the rest only what has no state (the factory's name,
  //  whether the player has asked for less motion, and the gestures the 2D map shares with it), so no registry or
  //  singleton the page's bundle has is bundled again with its own state. One more here is one to check has none.
  //  The suites run from the repository's root, and esbuild is loaded from there rather than bundled into this one.
  const { build } = createRequire(join(process.cwd(), 'package.json'))(
      'esbuild'
    ),
    { metafile } = await build({
      entryPoints: ['packages/map-3d/map3d.ts'],
      bundle: true,
      write: false,
      metafile: true,
      logLevel: 'silent',
      tsconfig: 'tsconfig.json',
      outdir: 'unused',
    }),
    inputs = Object.keys(metafile.inputs),
    others = inputs.filter(
      (path: string) =>
        !path.startsWith('packages/map-3d/') &&
        !path.startsWith('packages/models-builtin/') &&
        !/node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?three\//.test(path) &&
        !/@dom111\/typed-event-emitter\//.test(path)
    );

  expect(
    'map3d.js bundles three.js, its own code, the built-in model set, the emitter, and from the rest only the factory’s name, reduced motion, the shared gestures and the yields’ layout, none with state of its own',
    others.sort(),
    [
      'packages/client/lib/instanceOf.ts',
      'packages/client/lib/yieldMap.ts',
      'packages/map/MapView3DFactory.ts',
      'packages/map/lib/reducedMotion.ts',
      'packages/widgets/lib/drag.ts',
      'packages/widgets/lib/mapGestures.ts',
    ]
  );
  expect(
    'and three.js is in it',
    inputs.some((path: string) => /three\/build\//.test(path)),
    true
  );

  // And the page's own bundle can't take three.js in: nothing outside the 3D map's package imports it, or that package.
  const root = process.cwd(),
    importers = [
      ...sourcesUnder(join(root, 'packages')).filter(
        (path) => !path.startsWith(join(root, 'packages', 'map-3d') + '/')
      ),
      ...sourcesUnder(join(root, 'src')),
    ].filter((path) =>
      specifiersOf(readFileSync(path, 'utf8')).some(
        (specifier) =>
          specifier === 'three' ||
          specifier.startsWith('three/') ||
          specifier.startsWith('@civ-clone/ui-map-3d')
      )
    );

  expect(
    'nothing outside the 3D map imports three.js or the 3D map',
    importers.map((path) => path.slice(root.length + 1)),
    []
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL map3d: ${
        failures.length
      } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS map3d (${checks} checks)\n`);
})();
