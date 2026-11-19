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
  MAP3D_DISTANCE_OPTION,
  forgetMap3D,
  loadMap3DScript,
  makeMapView,
  map3dAsked,
  prepareMap3D,
} from '@civ-clone/ui-game/lib/map3d';
import { Stage } from '@civ-clone/ui-map-3d/stage';
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
  // Each marker slid into its place, and where from: `x,y`, then `u`, height and `v`, to two places.
  slid: (string | number)[][] = [],
  // How many more frames the last slide takes: a slide's frames are drawn until it's done.
  slideFrames = { left: 0 },
  // What's marked on each square, by `x,y`, and where it stands.
  markers = new Map<string, TileMarker>(),
  markedAt = new Map<string, readonly [number, number, number]>(),
  // The units `markerAt` was asked after, in order.
  askedAfter: string[] = [],
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
    slideMarker: (key, from) => {
      slid.push([key, ...from.map((n) => Math.round(n * 100) / 100)]);
      slideFrames.left = 6;
    },
    // Where each marker stands, for its own unit or another: none slides here. Which unit's asked after.
    markerAt: (key, unit) => {
      askedAfter.push(unit);

      const at = markedAt.get(key);

      return at === undefined ? null : [...at];
    },
    sliding: () => slideFrames.left-- > 0,
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

  land.changed = (squares, u, v, always = false): void => {
    readAgain.push(always);
    changed(squares, u, v, always);
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

  // A unit stepping onto a square slides there from where it was drawn as it set off, once the patch that follows its
  //  move draws it there, as the engine tells them: its move, then its patch.
  const groundAt = (x: number, y: number): number[] => {
      const [u, v] = middleOf(tiles[y * 4 + x] as Tile);

      return [u, Math.max(0, glider.land().surfaceAt(u, v)), v].map(
        (n) => Math.round(n * 100) / 100
      );
    },
    unitOf = (id: string, defence: number) =>
      ({
        id,
        _: 'Phalanx',
        defence: { value: defence },
        busy: null,
        player: { civilization: { attributes: [] } },
      } as unknown as Tile['units'][number]),
    walker = unitOf('Unit-A', 1),
    guard = unitOf('Unit-B', 5),
    // The engine's patch: who's on each square now.
    repatched = (...squares: [number, number, Tile['units'][number][]][]) => {
      squares.forEach(([x, y, units]) => {
        const tile = tiles[y * 4 + x] as Tile;

        tile.units = units as Tile['units'];
        glider.queueTile(tile);
      });
      glider.releaseTiles();

      return runFrames();
    },
    stepped = (
      unit: Tile['units'][number],
      from: [number, number],
      to: [number, number]
    ) =>
      glider.mapEvent({
        kind: 'moved',
        unit: {
          id: unit.id,
          type: 'Phalanx',
          player: 'Player-1',
          tile: { x: from[0], y: from[1] },
        },
        from: { x: from[0], y: from[1] },
        to: { x: to[0], y: to[1] },
      });

  repatched([0, 3, [walker]]);
  slid.length = 0;
  askedAfter.length = 0;

  // A first step east: it turns to face the way it goes, marked again where it stands, and slides only once it's on
  //  the square it went to, from where the stage draws that unit.
  stepped(walker, [0, 3], [1, 3]);
  runFrames();

  const beforeThePatch = slid.splice(0),
    askedAfterIt = askedAfter.splice(0);

  const slideDrawn = repatched([0, 3, []], [1, 3, [walker]]),
    firstStep = slid.splice(0);

  // Two steps before a patch: from where it's still drawn, both squares.
  stepped(walker, [1, 3], [2, 3]);
  stepped(walker, [2, 3], [2, 2]);
  repatched([1, 3, []], [2, 2, [walker]]);

  const twoSteps = slid.splice(0);

  // Onto a square under a stronger unit, not on top: no slide, nor later, when the stronger one goes and it's on top.
  repatched([3, 2, [guard]]);
  slid.length = 0;
  stepped(walker, [2, 2], [3, 2]);
  repatched([2, 2, []], [3, 2, [guard, walker]]);
  stepped(guard, [3, 2], [3, 1]);
  repatched([3, 2, [walker]], [3, 1, [guard]]);

  const underneath = slid.splice(0);

  // Over the world's seam, from the copy of its old square beside its new one.
  stepped(walker, [3, 2], [0, 2]);
  repatched([3, 2, []], [0, 2, [walker]]);

  const overTheSeam = slid.splice(0);

  // Not where the player has asked for less motion.
  Object.assign(window, {
    matchMedia: (query: string) => ({ matches: query.includes('reduce') }),
  });
  stepped(walker, [0, 2], [1, 2]);
  repatched([0, 2, []], [1, 2, [walker]]);
  delete (window as { matchMedia?: unknown }).matchMedia;

  expect(
    'a unit slides onto a square once the patch draws it there, from where it was drawn as it set off, with frames till it’s there: turned on a first step, across two steps, over the seam from beside it; not onto a square under another unit, then or later; and not asked for less motion',
    [
      beforeThePatch,
      askedAfterIt,
      firstStep,
      slideDrawn >= 6,
      twoSteps,
      underneath,
      overTheSeam,
      slid.splice(0),
    ],
    [
      [],
      ['Unit-A'],
      [['1,3', ...groundAt(0, 3)]],
      true,
      [['2,2', ...groundAt(1, 3)]],
      [['3,1', ...groundAt(3, 2)]],
      [['0,2', -0.5, ...groundAt(3, 2).slice(1)]],
      [],
    ]
  );

  repatched([1, 2, []], [3, 1, []]);

  // A unit moving while units are hidden (`t`) doesn't slide, nor when they're shown again; nor one whose patch comes
  //  after its slide's been given up.
  slid.length = 0;
  glider.toggleUnits();
  stepped(walker, [1, 2], [2, 2]);
  repatched([2, 2, [walker]]);
  glider.toggleUnits();
  runFrames();

  const whileHidden = slid.splice(0);

  stepped(walker, [2, 2], [3, 2]);
  now += 2500;
  repatched([2, 2, []], [3, 2, [walker]]);

  expect(
    'a unit moving while units are hidden doesn’t slide, nor once they’re shown; nor one whose patch comes too late',
    [whileHidden, slid.splice(0)],
    [[], []]
  );

  repatched([3, 2, []]);

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
    'map3d.js bundles three.js, its own code, the built-in model set, the emitter, and from the rest only the factory’s name, reduced motion and the shared gestures',
    others.sort(),
    [
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
