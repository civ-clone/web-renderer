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
import MapView3D, { keptCity } from '@civ-clone/ui-map-3d/MapView3D';
import { bannerPlaces } from '@civ-clone/ui-map-3d/banners';
import { RigFacts, STRIDE } from '@civ-clone/ui-map-3d/markers/clips';
import { SHOT_LOOKS } from '@civ-clone/ui-map-3d/shots';
import {
  applyInterface,
  interfaceMode,
} from '@civ-clone/ui-platform/lib/interfaceMode';
import {
  DISTANCE_MAX,
  DISTANCE_MIN,
  PITCH_MAX,
  PITCH_MIN,
  ZOOM_STEP,
  lowestPitch,
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
  cityBannersFor,
  forgetMap3D,
  loadMap3DScript,
  makeMapView,
  map3dAsked,
  yieldIconFrom,
  prepareMap3D,
} from '@civ-clone/ui-game/lib/map3d';
import { FLASH_SIZE, Stage } from '@civ-clone/ui-map-3d/stage';
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
import { OverlayMesh, ROOFS } from '@civ-clone/ui-map-3d/overlay/overlayMesh';
import {
  IN_FRONT_OF_CITY,
  UNIT_SCALE,
} from '@civ-clone/ui-map-3d/markers/drawMarker';
import { Color } from 'three';
import { cityName } from '@civ-clone/ui-client/components/lib/city';
import { unitStatus } from '@civ-clone/ui-assets/lib/renderUnit';
import { setBuild } from '@civ-clone/ui-client/lib/build';
import {
  ancientUnits,
  creditedUnits,
  realisticUnits,
} from '@civ-clone/ui-models-hosted';
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

// The page's styles, which the DOM here doesn't work out: none, so the interface's layer paints no banners for the 3D
//  map, which then names its cities itself, as before, but where a check gives it a painter of its own.
(globalThis as any).getComputedStyle ??= () => ({ getPropertyValue: () => '' });

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
  // How high each walker was flown off its stand each frame it was put, by its id: an aircraft's.
  walkersAloft = new Map<string, number[]>(),
  // How each walker's figures were posed each frame it was put, by its id: the clip's role, or none, and how far in.
  walkersPosed = new Map<string, [string | null, number][]>(),
  // The puffs of smoke drawn now, by id, where each bursts from and how far through it is; and every puff drawn since
  //  last cleared, by id, how far through it was each time.
  puffs = new Map<string, { at: readonly number[]; through: number }>(),
  // The wakes drawn now, by id, where each is and how many corners its foam has; and every wake drawn since last
  //  cleared.
  wakesDrawn = new Map<string, { at: readonly number[]; corners: number }>(),
  wakesEver = new Set<string>(),
  puffsPlaced = new Map<string, number[]>(),
  // How solid each walker was last drawn, by its id, from 1 down to 0, once it's been faded.
  walkersFaded = new Map<string, number>(),
  // How solid each square's unit was last drawn, by the square, once it's been faded: marked again, it's solid.
  markersFaded = new Map<string, number>(),
  // What's marked on each square, by `x,y`, and where it stands.
  markers = new Map<string, TileMarker>(),
  markedAt = new Map<string, readonly [number, number, number]>(),
  // What each square yields, each time the stage was given it.
  yieldsSet: (YieldMesh | null)[] = [],
  // The square whose unit's drawn under the pointer, as the stage would say, if any.
  unitUnderPointer: { key: string | null } = { key: null },
  // What each unit, by its id, plays where it's drawn with a rigged copy, as the stage would say: none by default.
  rigFactsFor = new Map<string, RigFacts>(),
  // Every shot drawn since last cleared, by id, where it was each frame, `null` taken away; and the nodes asked where
  //  they are, by walker, figure and node, the stage saying a fifth of a square over where the walker was last put.
  shotsDrawn = new Map<string, (readonly number[] | null)[]>(),
  // Each clip a walker's figures were posed in with what they play till their own time in it comes.
  walkersBefore = new Set<string>(),
  // What each shot was last drawn as, and every way it pointed; and each puff's size and whether it flashed.
  shotLooks = new Map<string, { kind: string; headings: number[][] }>(),
  puffLooks = new Map<string, { size: number; flash: number | null }>(),
  jointsAsked: [string, number, string][] = [],
  // Each time the stage was asked which units idle: the squares, in order, and how far in, by the clock; and whether it
  //  says some do, as a stage whose models have idle clips would.
  idleAsked: [string[], number][] = [],
  idleSays = { idling: false },
  fakeStage = (): Stage => ({
    render: () => void staged.push('render'),
    unitAt: () => unitUnderPointer.key,
    resize: (stageWidth, stageHeight, ratio) =>
      void staged.push(`resize ${stageWidth}×${stageHeight}@${ratio}`),
    setChunk: (i, j) => {
      chunksSet.add(`${i},${j}`);
      chunkBuilds.push(`${i},${j}`);
    },
    setOverlay: (i, j, mesh) => void overlaysSet.set(`${i},${j}`, mesh),
    setMarker: (key, at, marker) => {
      markersFaded.delete(key);

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
      walkersFaded.delete(id);

      if (marker === null) {
        walkers.delete(id);

        return;
      }

      walkers.set(id, marker);
    },
    placeWalker: (id, at, facing, aloft = 0) => {
      walkersPlaced.set(id, [
        ...(walkersPlaced.get(id) ?? []),
        [...at, facing],
      ]);
      walkersAloft.set(id, [...(walkersAloft.get(id) ?? []), aloft]);
    },
    poseWalker: (id, role, seconds, before) => {
      walkersPosed.set(id, [...(walkersPosed.get(id) ?? []), [role, seconds]]);

      if (before !== undefined) {
        walkersBefore.add(`${role} after ${before.role}`);
      }
    },
    rigFacts: (marker) => rigFactsFor.get(marker.unit?.id ?? '') ?? null,
    idle: (keys, seconds) => {
      idleAsked.push([[...keys].sort(), seconds]);

      return idleSays.idling && keys.size > 0;
    },
    jointAt: (id, figure, joint) => {
      const placed = walkersPlaced.get(id)?.at(-1);

      jointsAsked.push([id, figure, joint]);

      return placed === undefined
        ? null
        : [placed[0]!, placed[1]! + 0.2, placed[2]!];
    },
    shot: (id, at, _through, kind = 'bottle', heading = [0, -1, 0]) => {
      shotsDrawn.set(id, [...(shotsDrawn.get(id) ?? []), at]);

      if (at !== null) {
        shotLooks.set(id, {
          kind,
          headings: [...(shotLooks.get(id)?.headings ?? []), [...heading]],
        });
      }
    },
    fadeMarker: (key, opacity) => {
      if (opacity < 1 || markersFaded.has(key)) {
        markersFaded.set(key, opacity);
      }
    },
    wake: (id, at, shape = []) => {
      if (at === null) {
        wakesDrawn.delete(id);

        return;
      }

      wakesDrawn.set(id, { at, corners: shape.length / 3 });
      wakesEver.add(id);
    },
    puff: (id, at, through = 0, size = 1, flash = null) => {
      if (at === null) {
        puffs.delete(id);

        return;
      }

      puffs.set(id, { at, through });
      puffLooks.set(id, { size, flash });
      puffsPlaced.set(id, [...(puffsPlaced.get(id) ?? []), through]);
    },
    fadeWalker: (id, opacity) => {
      if (opacity < 1 || walkersFaded.has(id)) {
        walkersFaded.set(id, opacity);
      }
    },
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
        // Twice life size, as the map draws units, as no other size is chosen.
        size: UNIT_SCALE,
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
  //  nearest size a player could choose, and as the map draws them again after; all `UNIT_SCALE` times life size, as
  //  units are drawn twice life size.
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
    'units are drawn at the size chosen in Options as soon as it changes, and the map drawn, the nearest size a player could choose, or as the map draws them; all twice life size',
    [UNIT_SCALE, sizesDrawn],
    [
      2,
      [
        [UNIT_SCALE, false],
        [1.5 * UNIT_SCALE, true],
        // As it was: nothing drawn.
        [1.5 * UNIT_SCALE, false],
        [0.5 * UNIT_SCALE, true],
        [UNIT_SCALE, true],
      ],
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
    1.25 * UNIT_SCALE
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
  //  without building the land again. On the town's own square, a city's lot, its sprawl, now with a street out to it.
  const beside = tiles[1] as Tile,
    // How many points of paving are laid on the town's square out towards `other`'s, past its plaza: a street.
    streetToward = (other: Tile): number => {
      const mesh = overlaysSet.get(view.land().overlayKeyOf(town.x, town.y)),
        [cu, cv] = view.land().layout.centre(town.x, town.y),
        [ou, ov] = view.land().layout.centre(other.x, other.y),
        length = Math.hypot(ou - cu, ov - cv),
        { r, g, b } = new Color('#a39a88');
      let found = 0;

      for (let at = 0; mesh && at < mesh.positions.length; at += 3) {
        const pu = mesh.positions[at]! + mesh.u - cu,
          pv = mesh.positions[at + 2]! + mesh.v - cv,
          along = (pu * (ou - cu) + pv * (ov - cv)) / length,
          across = Math.abs(pu * (ov - cv) - pv * (ou - cu)) / length;

        if (
          along > 0.15 &&
          along < 0.5 &&
          across < 0.03 &&
          Math.abs(mesh.colours[at]! - r) < 1e-4 &&
          Math.abs(mesh.colours[at + 1]! - g) < 1e-4 &&
          Math.abs(mesh.colours[at + 2]! - b) < 1e-4
        ) {
          found++;
        }
      }

      return found;
    },
    streetBefore = streetToward(beside),
    laidBefore = overlaysSet.has(view.land().overlayKeyOf(town.x, town.y));

  overlaysSet.clear();

  const landBuilt = chunkBuilds.length;

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
    'a road built: what’s laid on its chunk made again, with the road, and no land built; on a city’s lot, its sprawl, not the road',
    [
      overlaysSet.has(view.land().overlayKeyOf(beside.x, beside.y)),
      laidNear(beside, 0.3).coloured('#8c7a58'),
      view.land().overlaysPending(),
      chunkBuilds.length === landBuilt,
      laidNear(town, 0.3).coloured('#8c7a58'),
      [laidBefore, streetBefore, streetToward(beside) > 0],
    ],
    [true, true, 0, true, false, [true, 0, true]]
  );

  staged.splice(0);

  view.flush();

  expect(
    'a flush with nothing released draws',
    [view.tilesPending(), staged.splice(0)],
    [0, ['render']]
  );

  // A city grown: what's laid round it is made again as its houses spread further onto the squares round it, and only
  //  then. At sizes 14 and 15 it builds the same on its own square, but its houses reach further round it; at 15 and
  //  16, the same everywhere.
  const grownTo = (size: number): number => {
    roma.growth.size = size;
    overlaysSet.clear();
    view.queueTile(town);
    view.releaseTiles();
    view.flush();

    return overlaysSet.size;
  };

  grownTo(14);

  const spread = [grownTo(15) > 0, grownTo(16)];

  grownTo(3);
  staged.splice(0);

  expect(
    'a city grown: what’s laid round it made again as its houses spread further, and not when they don’t',
    spread,
    [true, 0]
  );

  // `t`: the towns hidden with the units, so the land shows as it is. What's laid on a city's square and round it is
  //  made again without its buildings or the houses round it, and with them when they're shown again, by `t` or for a
  //  unit to give orders to.
  {
    // The square south of the town: open grassland.
    const below = tiles[town.x + width] as Tile,
      roofed = (tile: Tile, reach: number): boolean =>
        ROOFS.some((colour) => laidNear(tile, reach).coloured(colour)),
      seen = () => [roofed(town, 0.45), roofed(below, 0.5)];

    grownTo(8);

    const shown = seen();

    overlaysSet.clear();
    view.toggleUnits();
    view.flush();

    const hidden = [seen(), overlaysSet.size > 0, view.shown().units];

    // Back for a unit to give orders to, as `t` brings them back.
    view.showActiveUnit([]);
    view.flush();

    const forOrders = seen();

    view.toggleUnits();
    view.flush();
    view.toggleUnits();
    view.flush();

    const back = seen();

    grownTo(3);
    staged.splice(0);

    expect(
      't hides the towns with the units: what’s laid on a city’s square and round it made again without its buildings or the houses round it, and with them shown again, by t or for orders',
      [shown, hidden, forOrders, back],
      [
        [true, true],
        [[false, false], true, false],
        [true, true],
        [true, true],
      ]
    );
  }

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

  // A unit's figures under the pointer, standing over the ground of another square: the click picks the unit's square.
  chooser.pickTile(
    () => true,
    (tile) => void picked.push(`${tile.x},${tile.y}`),
    'Where?'
  );
  unitUnderPointer.key = '2,0';
  clickAt(box.width / 2, box.height / 2);
  unitUnderPointer.key = null;

  expect(
    'a click on a unit’s figures picks its square, not the ground behind them',
    picked,
    ['1,1', '2,0']
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
  const frames = new Map<number, (time?: number) => void>();
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
        // Each given when its frame began, as a browser gives it.
        waiting.forEach((callback) => callback(now));
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

  walkersPosed.clear();
  patch([0, 3, []], [1, 3, [walker]]);
  runFrames(1);

  const whileWalking = [unitOn(1, 3), [...walkers.values()][0]?.unit?.id];

  runFrames();

  // As it went, its figures walking (plan 2.2), their legs keeping up with how far it's gone: from the start of their
  //  walk, never back, to a square's width over the stride when it's there.
  const posed = [...walkersPosed.values()].flat(),
    walkedTo = posed.map(([, seconds]) => seconds);

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

  expect(
    'as it walks, its figures play their walk, their legs keeping up with how far it’s gone: from the start, never back, a square over the stride by the time it’s there',
    [
      posed.length > 2,
      posed.every(([role]) => role === 'move'),
      walkedTo.every(
        (seconds, index) => index === 0 || seconds >= walkedTo[index - 1]!
      ),
      Math.round(walkedTo[0]! * 100),
      // The last frame before it's there, all but there.
      Math.round(Math.max(...walkedTo) * STRIDE * 10) / 10,
    ],
    [true, true, true, 0, 1]
  );

  // Along a road, between two squares with one: the unit walks along it as it bends (`Land#roadPath`), not straight
  //  across, from one middle to the other.
  (tiles[3 * 4 + 0] as Tile).improvements = [{ _: 'Road' }] as never;
  (tiles[3 * 4 + 1] as Tile).improvements = [{ _: 'Road' }] as never;
  repatched([0, 3, [walker]], [1, 3, []]);
  walkersPlaced.clear();
  stepped(walker, [0, 3], [1, 3]);
  repatched([0, 3, []], [1, 3, [walker]]);

  const [roadWay] = [...walkersPlaced.values()],
    lane = glider.land().roadPath(0, 3, 1, 3)!,
    [laneU, , laneV] = groundAt(1, 3),
    // How far a point on the ground is from the road's way.
    fromLane = (u: number, v: number): number =>
      Math.min(
        ...lane.slice(1).map((b, index) => {
          const a = lane[index]!,
            au = a[0] + laneU!,
            av = a[1] + laneV!,
            du = b[0] - a[0],
            dv = b[1] - a[1],
            t = Math.max(
              0,
              Math.min(1, ((u - au) * du + (v - av) * dv) / (du * du + dv * dv))
            );

          return Math.hypot(u - au - du * t, v - av - dv * t);
        })
      ),
    // How far the walker went off the straight way between the middles, at most.
    offStraight = Math.max(...roadWay!.map(([, , v]) => Math.abs(v! - laneV!)));

  // An aircraft flying the same step: straight over the road, not along its bends.
  const roadFighter = {
    ...unitOf('Unit-RF', 1),
    _: 'Fighter',
    __: ['Air', 'Unit'],
  } as unknown as Tile['units'][number];

  repatched([0, 3, [roadFighter]], [1, 3, []]);
  walkersPlaced.clear();

  const aloftBefore = new Set(walkersAloft.keys());

  stepped(roadFighter, [0, 3], [1, 3]);
  repatched([0, 3, []], [1, 3, [roadFighter]]);

  const [flownOver] = [...walkersPlaced.values()],
    flewStraight = flownOver!.every(([, , v]) => Math.abs(v! - laneV!) < 1e-6);

  // Its flight's heights aside: those after are of units on foot.
  [...walkersAloft.keys()]
    .filter((id) => !aloftBefore.has(id))
    .forEach((id) => walkersAloft.delete(id));

  (tiles[3 * 4 + 0] as Tile).improvements = [];
  (tiles[3 * 4 + 1] as Tile).improvements = [];
  repatched([0, 3, []], [1, 3, []]);

  expect(
    'between two squares with a road, a unit walks along it as it bends, not straight across; an aircraft flies straight over it',
    [
      roadWay!.length > 5,
      roadWay!.every(([u, , v]) => fromLane(u!, v!) < 0.02),
      offStraight > 0.02,
      flewStraight,
    ],
    [true, true, true, true]
  );

  // An aircraft flying two squares, as a GoTo's steps come: it climbs off its stand and comes down to land on the
  //  square it's bound for; the units walking so far, on foot, flew none of the way.
  const onFoot = [...walkersAloft.values()].flat(),
    fighter = {
      ...unitOf('Unit-F', 1),
      _: 'Fighter',
      __: ['Air', 'Unit'],
    } as unknown as Tile['units'][number];

  repatched([0, 0, [fighter]]);
  walkersAloft.clear();
  walkersPlaced.clear();
  stepped(fighter, [0, 0], [1, 0]);
  patch([0, 0, []], [1, 0, [fighter]]);
  stepped(fighter, [1, 0], [2, 0]);
  repatched([1, 0, []], [2, 0, [fighter]]);

  const [flight] = [...walkersAloft.values()],
    [flightWay] = placedSince();

  expect(
    'an aircraft flies off its stand and lands on the square it’s bound for; units on foot fly none of the way',
    [
      onFoot.length > 0 && onFoot.every((aloft) => aloft === 0),
      flight!.length > 5,
      flight![0]! < 0.05,
      Math.max(...flight!) > 0.25,
      flight!.at(-1)! < 0.005,
      flightWay!.at(-1)![0],
    ],
    [true, true, true, true, true, groundAt(2, 0)[0]]
  );

  // A ship sailing two squares leaves a wake: foam behind it as it goes, on the sea, though the land under it's higher,
  //  as where it comes into port; thinning away once it's there, the frames going on till it's gone. A unit on foot
  //  leaves none; nor does a ship moved at once. One carrying a stronger unit, shown on top, leaves one too. Units
  //  hidden mid-sail, it's no longer laid, and thins away.
  const ship = {
    ...unitOf('Unit-S', 1),
    _: 'Trireme',
    __: ['Naval', 'Unit'],
  } as unknown as Tile['units'][number];

  repatched([0, 0, []], [2, 0, []], [0, 1, [ship]]);
  wakesEver.clear();
  stepped(ship, [0, 1], [1, 1]);
  patch([0, 1, []], [1, 1, [ship]]);
  stepped(ship, [1, 1], [2, 1]);
  patch([1, 1, []], [2, 1, [ship]]);
  runFrames(10);

  const sailing = [...wakesDrawn.values()],
    // The frames go on till the wake's gone, and then stop.
    calm = runFrames(),
    sailed: unknown[] = [wakesEver.size, wakesDrawn.size, calm < 300];

  // Moving at once chosen mid-sail: the wake's gone on the next frame.
  repatched([2, 1, []], [0, 1, [ship]]);
  stepped(ship, [0, 1], [1, 1]);
  patch([0, 1, []], [1, 1, [ship]]);
  runFrames(5);
  sailed.push(wakesDrawn.size);
  optionsRegistry.set(MAP3D_WALKS_OPTION, 'off');
  runFrames(1);
  sailed.push(wakesDrawn.size);
  optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');
  runFrames();
  repatched([1, 1, []], [2, 1, [ship]]);

  wakesEver.clear();
  repatched([2, 1, []], [0, 1, [walker]]);
  stepped(walker, [0, 1], [1, 1]);
  repatched([0, 1, []], [1, 1, [walker]]);

  const footWake = wakesEver.size;

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'off');
  repatched([1, 1, []], [0, 1, [ship]]);
  stepped(ship, [0, 1], [1, 1]);
  repatched([0, 1, []], [1, 1, [ship]]);
  optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');
  repatched([1, 1, []]);

  const shipAtOnce = wakesEver.size,
    // A stronger unit aboard, shown on top: the ship still leaves a wake.
    soldier = unitOf('Unit-P', 5);

  repatched([0, 1, [ship, soldier]]);
  wakesEver.clear();
  stepped(ship, [0, 1], [1, 1]);
  stepped(soldier, [0, 1], [1, 1]);
  patch([0, 1, []], [1, 1, [ship, soldier]]);
  runFrames(3);

  const carrying = [
    [...walkers.values()].map((marker) => marker.unit?.id),
    wakesEver.size,
  ];

  runFrames();

  // Units hidden mid-sail: it's laid no further, and thins away.
  wakesEver.clear();
  stepped(ship, [1, 1], [2, 1]);
  stepped(soldier, [1, 1], [2, 1]);
  patch([1, 1, []], [2, 1, [ship, soldier]]);
  runFrames(4);
  glider.toggleUnits();

  const hiddenFrom = [...wakesDrawn.values()][0]?.corners ?? 0;

  runFrames(4);

  const hiddenSince = [...wakesDrawn.values()][0]?.corners ?? 0,
    hiddenCalm = runFrames();

  glider.toggleUnits();
  repatched([2, 1, []]);

  expect(
    'a ship sailing leaves a wake, foam behind it on the sea, though the land under it’s higher; thinning away once it’s there, the frames stopping once it’s gone; moving at once chosen mid-sail, it’s gone; a unit on foot leaves none, nor a ship moved at once; one carrying a stronger unit leaves one; units hidden mid-sail, it’s laid no further and thins away',
    [
      sailing.length,
      (sailing[0]?.corners ?? 0) > 0,
      sailing[0]?.at[1],
      groundAt(1, 1)[1]! > 0,
      sailed,
      footWake,
      shipAtOnce,
      carrying,
      hiddenFrom > 0 && hiddenSince <= hiddenFrom,
      [hiddenCalm < 300, wakesDrawn.size],
    ],
    [
      1,
      true,
      0,
      true,
      [1, 0, true, 1, 0],
      0,
      0,
      [['Unit-P'], 1],
      true,
      [true, 0],
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
  walkersPosed.clear();
  stepped(walker, [0, 2], [1, 2]);
  runFrames();

  // Its figures walked, then, waiting, stand (plan 2.2).
  const [poses] = [...walkersPosed.values()],
    waitingPose = [
      poses?.some(([role]) => role === 'move'),
      poses?.at(-1)?.[0],
    ];
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

  expect(
    'a walk over before its patch has its figures walk as it goes, and stand once it’s there',
    waitingPose,
    [true, null]
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

  // With units hidden, and cities' walls and names (`t`), the active unit in a city stands in front of its buildings,
  //  or where they'd stand with the towns hidden, as it's drawn there, and sets off from there.
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

  const hiddenMarker = markers.get(`${hiddenTown.x},${hiddenTown.y}`),
    markedHidden = [
      hiddenMarker?.city ?? null,
      hiddenMarker?.unit?.id,
      hiddenMarker?.inCity,
    ];

  walkersPlaced.clear();
  stepped(walker, [1, 1], [2, 1]);
  patch([1, 1, []], [2, 1, [walker]]);
  runFrames(1);

  const [hiddenFirst] = [...walkersPlaced.values()].map((frames) => frames[0]!),
    fromHiddenCity = [
      Math.abs(hiddenFirst![0]! - hiddenU) < 0.01,
      Math.abs(hiddenFirst![2]! - (hiddenV + IN_FRONT_OF_CITY)) < 0.01,
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
    'with units hidden, the active unit in a city is marked in front of its buildings, with no walls or name, and sets off from there; a walker hurt on the way is drawn hurt; less motion asked for mid-walk ends it on the next frame',
    [markedHidden, fromHiddenCity, hurtWalking, lessMotionMidWalk],
    [
      [null, 'Unit-A', true],
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
      [1, true, 1.5 * UNIT_SCALE],
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

  // A battle (§6.4, `battles.ts`): the attacker lunges to the edge between the squares and goes back, or fades away
  //  there if it lost; the loser fades away where it stood. The square attacked shows what was on it till the blow,
  //  though the battle's patch has come; the attacker's off its square till it's back.
  const fought = (
      attacker: Tile['units'][number],
      from: [number, number],
      defender: Tile['units'][number],
      to: [number, number],
      winner: 'attacker' | 'defender',
      players: [string, string] = ['Player-1', 'Player-2']
    ) =>
      glider.mapEvent({
        kind: 'battle',
        attacker: {
          id: attacker.id,
          type: 'Phalanx',
          player: players[0],
          tile: { x: from[0], y: from[1] },
        },
        defender: {
          id: defender.id,
          type: 'Phalanx',
          player: players[1],
          tile: { x: to[0], y: to[1] },
        },
        winner,
      }),
    // What's drawn of each battle under way: its walkers' kinds, the unit on top of each and the stack's size, and how
    //  solid each is.
    kind = (id: string) => id.replace(/-\d+/, ''),
    fighters = () =>
      [...walkers.entries()].map(([id, marker]) => [
        kind(id),
        marker.unit?.id ?? null,
        marker.unit?.count ?? null,
        Math.round((walkersFaded.get(id) ?? 1) * 10) / 10,
      ]),
    // Whether the walker `id` was first put at the middle of the square (`x`, `y`).
    setOffFrom = (id: string, x: number, y: number) =>
      (walkersPlaced.get(id)?.[0] ?? [])
        .slice(0, 3)
        .every((n, at) => Math.abs(n - groundAt(x, y)[at]!) < 0.05),
    rivalMate = unitOf('Unit-T', 0, 'Player-2');

  glider.setActiveUnit(null);
  glider.portal.setCenter(1, 1);
  runFrames();
  repatched([1, 1, [walker]], [2, 1, [rival, rivalMate]]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  // Won: the stack attacked dies with its defender, as Civ1 has it.
  fought(walker, [1, 1], rival, [2, 1], 'attacker');

  const wonAtOnce = [unitOn(1, 1), unitOn(2, 1)];

  patch([1, 1, [walker]], [2, 1, []]);
  runFrames(1);

  const beforeBlow = [unitOn(1, 1), unitOn(2, 1), fighters()];

  // A fifth of a second in, the blow.
  runFrames(12);

  const atBlow = [unitOn(2, 1), fighters()];

  runFrames(10);

  const fading = [unitOn(2, 1), fighters()],
    // The puff where the stack fell: where it stood, as far through as it's faded.
    fallenAt = [...walkersPlaced.entries()]
      .find(([id]) => kind(id) === 'battle-fallen')?.[1]
      .at(-1),
    wonPuff = [...puffs.entries()].map(([id, { at, through }]) => [
      kind(id),
      Math.round(through * 10) / 10,
      at.every((n, i) => Math.abs(n - groundAt(2, 1)[i]!) < 0.05),
      // Just where what fell is drawn, on the land there.
      at.every((n, i) => Math.abs(n - fallenAt![i]!) < 1e-9),
    ]),
    wonPuffs = [...puffsPlaced.values()];

  runFrames();

  const [lunge] = placedSince(),
    // How far along the way to the square attacked the attacker is, from its square's middle.
    [startU, , startV] = groundAt(1, 1),
    [toU, , toV] = groundAt(2, 1),
    along = (point: number[]) =>
      Math.round(
        (((point[0]! - startU!) * (toU! - startU!) +
          (point[2]! - startV!) * (toV! - startV!)) /
          ((toU! - startU!) ** 2 + (toV! - startV!) ** 2)) *
          100
      ) / 100;

  expect(
    'won: the attacker’s off its square at once, lunging to the edge and back, facing the square attacked; that square shows its stack till the blow, the patch notwithstanding; then what fell fades where it stood, the stack’s size with it, in a puff of smoke there, through as it fades, gone with the battle',
    [
      wonAtOnce,
      beforeBlow,
      atBlow,
      fading,
      [unitOn(1, 1), unitOn(2, 1), walkers.size],
      [
        along(lunge![0]!),
        Math.max(...lunge!.map(along)),
        along(lunge!.at(-1)!),
      ],
      lunge!.every((point) => point[3] === 1.57),
      wonPuff,
      wonPuffs.length === 1 &&
        wonPuffs[0]!.every(
          (through, at, all) => at === 0 || through >= all[at - 1]!
        ),
      puffs.size,
    ],
    [
      [null, ['Unit-R', 2]],
      [null, ['Unit-R', 2], [['battle', 'Unit-A', 1, 1]]],
      [
        null,
        [
          ['battle', 'Unit-A', 1, 1],
          ['battle-fallen', 'Unit-R', 2, 1],
        ],
      ],
      [
        null,
        [
          ['battle', 'Unit-A', 1, 1],
          ['battle-fallen', 'Unit-R', 2, 0.7],
        ],
      ],
      [['Unit-A', 1], null, 0],
      [0, 0.45, 0],
      true,
      [['battle-puff', 0.3, true, true]],
      true,
      0,
    ]
  );

  // Lost: the attacker fades away at the edge, and never comes back; the defender stands.
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  walkersSet.length = 0;
  walkersPlaced.clear();
  fought(walker, [1, 1], rival, [2, 1], 'defender');
  patch([1, 1, []], [2, 1, [rival]]);
  runFrames(13);

  const lostAtBlow = [unitOn(1, 1), unitOn(2, 1), fighters()];

  runFrames(18);

  const lostFading = fighters(),
    lostAt = [...walkersPlaced.values()][0]?.at(-1),
    lostPuff = [...puffs.entries()].map(([id, { at, through }]) => [
      kind(id),
      Math.round(through * 10) / 10,
      along(at as number[]),
      // Just where the attacker's drawn fading, on the land there.
      at.every((n, i) => Math.abs(n - lostAt![i]!) < 1e-9),
    ]);

  runFrames();

  expect(
    'lost: the attacker fades away at the edge, in a puff of smoke there, and isn’t back; the defender stands where it was',
    [
      lostAtBlow,
      lostFading,
      lostPuff,
      [unitOn(1, 1), unitOn(2, 1), walkers.size, puffs.size],
    ],
    [
      [null, ['Unit-R', 1], [['battle', 'Unit-A', 1, 1]]],
      [['battle', 'Unit-A', 1, 0.5]],
      [['battle-puff', 0.5, 0.45, true]],
      [null, ['Unit-R', 1], 0, 0],
    ]
  );

  // Moving at once chosen, or less motion asked for, or two other players' battle with their moves not shown, or one
  //  off the screen: how it went, at once. Others' shown, it's fought.
  const atOnceWhen = (
    setUp: () => () => void,
    players?: [string, string],
    from: [number, number] = [1, 1],
    to: [number, number] = [2, 1]
  ) => {
    repatched([...from, [walker]], [...to, [rival]]);
    walkersSet.length = 0;
    puffsPlaced.clear();

    const undo = setUp();

    fought(walker, from, rival, to, 'attacker', players);

    // On its square as the battle comes, or off it, lunging.
    const standing = unitOn(...from);

    patch([...from, [walker]], [...to, []]);
    runFrames(1);

    const shown: unknown[] = [
      standing,
      drawnWalkers().ids.map(kind),
      unitOn(...from),
      unitOn(...to),
    ];

    undo();
    runFrames();
    repatched([...from, []]);
    // Puffs drawn: none, unless it was fought.
    shown.push(puffsPlaced.size);

    return shown;
  };

  const offAtOnce = atOnceWhen(() => {
      optionsRegistry.set(MAP3D_WALKS_OPTION, 'off');

      return () => optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');
    }),
    lessMotionBattle = atOnceWhen(() => {
      Object.assign(window, {
        matchMedia: (query: string) => ({ matches: query.includes('reduce') }),
      });

      return () => delete (window as { matchMedia?: unknown }).matchMedia;
    }),
    othersHidden = atOnceWhen(() => {
      optionsRegistry.set(MAP3D_RIVALS_WALK_OPTION, false);

      return () => optionsRegistry.set(MAP3D_RIVALS_WALK_OPTION, true);
    }, ['Player-3', 'Player-2']),
    othersShown = atOnceWhen(() => () => undefined, ['Player-3', 'Player-2']),
    offTheScreen = atOnceWhen(
      () => {
        const lookedFrom = glider.orbit();

        glider.setOrbit({
          ...lookedFrom,
          focus: middleOf(tiles[0] as Tile),
          distance: 0,
        });
        runFrames();

        return () => glider.setOrbit(lookedFrom);
      },
      undefined,
      [2, 2],
      [3, 2]
    );

  runFrames();

  expect(
    'moving at once, less motion, two other players’ battle with their moves not shown, or one off the screen: how it went at once; others’ shown, it’s fought',
    [offAtOnce, lessMotionBattle, othersHidden, othersShown, offTheScreen],
    [
      [['Unit-A', 1], [], ['Unit-A', 1], null, 0],
      [['Unit-A', 1], [], ['Unit-A', 1], null, 0],
      // Not fought, but the loser, gone with no move, fades out where it stood.
      [['Unit-A', 1], ['fade'], ['Unit-A', 1], null, 0],
      [null, ['battle'], null, ['Unit-R', 1], 1],
      [['Unit-A', 1], [], ['Unit-A', 1], null, 0],
    ]
  );

  // Chosen mid-battle, moving at once ends it on the next frame, what fell gone with it, and its puff of smoke.
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);
  runFrames(14);

  const puffedMidBattle = puffs.size;

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'off');
  runFrames(1);

  const offMidBattle = [
    walkers.size,
    unitOn(1, 1),
    unitOn(2, 1),
    puffedMidBattle,
    puffs.size,
  ];

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');
  runFrames();
  repatched([1, 1, []]);

  // A step after the blow, won: the attacker walks on at once, and the loser falls as it would, its puff of smoke going
  //  on till it's over (#1334).
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);
  runFrames(14);
  offMidBattle.push(puffs.size);
  stepped(walker, [1, 1], [1, 2]);
  patch([1, 1, []], [1, 2, [walker]]);
  runFrames(1);
  offMidBattle.push(puffs.size, [...walkers.keys()].map(kind).sort());
  runFrames();
  offMidBattle.push(puffs.size);
  repatched([1, 2, []]);

  // With units hidden (`t`), nothing's drawn falling, and no puff of smoke either, won or lost.
  glider.toggleUnits();
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  puffsPlaced.clear();
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);
  runFrames();
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  fought(walker, [1, 1], rival, [2, 1], 'defender');
  patch([1, 1, []], [2, 1, [rival]]);
  runFrames();
  offMidBattle.push(puffsPlaced.size);
  glider.toggleUnits();
  repatched([1, 1, []]);

  // The attacker walking as it attacks, as a step and an attack come together: it walks there, and then lunges from its
  //  square, the square attacked shown as it was till the blow. A step mid-battle ends the battle at once, and it walks
  //  on from its square.
  repatched([0, 1, [walker]], [2, 1, [rival]]);
  walkersSet.length = 0;
  walkersPlaced.clear();
  stepped(walker, [0, 1], [1, 1]);
  patch([0, 1, []], [1, 1, [walker]]);
  runFrames(3);
  fought(walker, [1, 1], rival, [2, 1], 'attacker');

  const walkedThenFought: unknown[] = [
    [...walkers.keys()].map(kind),
    unitOn(1, 1),
  ];

  patch([1, 1, [walker]], [2, 1, []]);
  runFrames(1);
  walkedThenFought.push([...walkers.keys()].map(kind), unitOn(2, 1));

  for (
    let frame = 0;
    frame < 60 && [...walkers.keys()].some((id) => kind(id) === 'walk');
    frame++
  ) {
    runFrames(1);
  }

  runFrames(1);

  const lunging = [...walkers.keys()];

  walkedThenFought.push(
    lunging.map(kind),
    setOffFrom(lunging[0]!, 1, 1),
    unitOn(2, 1)
  );
  runFrames(3);
  walkersPlaced.clear();
  stepped(walker, [1, 1], [2, 1]);

  const steppedMidBattle: unknown[] = [walkers.size, unitOn(2, 1)];

  patch([1, 1, []], [2, 1, [walker]]);
  runFrames(1);

  const walkingOn = [...walkers.keys()];

  steppedMidBattle.push(walkingOn.map(kind), setOffFrom(walkingOn[0]!, 1, 1));
  runFrames();
  steppedMidBattle.push(unitOn(2, 1), walkers.size);
  repatched([2, 1, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();

  expect(
    'moving at once chosen mid-battle ends it on the next frame, its puff with it; with units hidden, no puff, won or lost; a step after the blow walks on, the loser falling and its puff going on till it’s over; walking as it attacks, it walks there, then lunges from its square, the square attacked as it was; a step mid-battle ends the battle, and it walks from its square',
    [offMidBattle, walkedThenFought, steppedMidBattle],
    [
      [0, ['Unit-A', 1], null, 1, 0, 1, 1, ['battle-fallen', 'walk'], 0, 0],
      [
        ['walk'],
        null,
        ['walk'],
        ['Unit-R', 1],
        ['battle'],
        true,
        ['Unit-R', 1],
      ],
      [0, null, ['walk'], true, ['Unit-A', 1], 0],
    ]
  );

  // Drawn with rigged copies (plan 2.2), a battle's paced for their clips (`clipPace`): the attacker, throwing, stands
  //  where it is, playing `fight` from the start, drawn till its clip's over; the blow falls as its throw lands, half a
  //  second in and its flight after; the loser plays `die` from the blow, solid till its last figure's fallen, then
  //  fades in its puff of smoke.
  rigFactsFor.set('Unit-A', {
    figures: 1,
    stagger: 0.13,
    clips: {
      fight: { duration: 1.5, shots: [{ at: 0.5, joint: 'prop' }] },
      die: { duration: 1.6, shots: [] },
    },
  });
  rigFactsFor.set('Unit-R', {
    figures: 2,
    stagger: 0.13,
    clips: { die: { duration: 1.6, shots: [] } },
  });
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  walkersSet.length = 0;
  walkersPlaced.clear();
  walkersPosed.clear();
  puffsPlaced.clear();
  shotsDrawn.clear();
  jointsAsked.length = 0;

  const thrownAt = now,
    // Each frame: how long since it was fought, in ms; the attacker's pose; and the loser's, how solid it is, and how
    //  far through its puff is, once it's drawn.
    thrown: [
      number,
      [string | null, number] | null,
      [string | null, number] | null,
      number | null,
      number | null
    ][] = [],
    // Each frame a shot was drawn or taken away: how long since it was fought, its id, numbers taken out, and where it
    //  was; and each frame the puff where it lands was drawn, how far through it was, and where.
    shotFrames: [number, string, readonly number[] | null][] = [],
    hitFrames: [number, number, readonly number[]][] = [],
    shorn = (id: string) => id.replace(/-\d+/g, '');

  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);

  for (
    let frame = 0;
    frame < 400 && (frame === 0 || walkers.size > 0);
    frame++
  ) {
    runFrames(1);

    const ids = [...walkersPosed.keys()],
      attackerId = ids.find((id) => kind(id) === 'battle'),
      fallenId = ids.find((id) => kind(id) === 'battle-fallen'),
      lastPose = (id: string | undefined): [string | null, number] | null => {
        const pose =
          id === undefined ? undefined : walkersPosed.get(id)?.at(-1);

        return pose === undefined
          ? null
          : [pose[0], Math.round(pose[1] * 1000)];
      };

    thrown.push([
      now - thrownAt,
      lastPose(attackerId),
      lastPose(fallenId),
      fallenId === undefined || !walkers.has(fallenId)
        ? null
        : Math.round((walkersFaded.get(fallenId) ?? 1) * 100) / 100,
      [...puffs.entries()].find(([id]) => kind(id) === 'battle-puff')?.[1]
        .through ?? null,
    ]);
    shotsDrawn.forEach((points, id) =>
      points.forEach((at) => shotFrames.push([now - thrownAt, shorn(id), at]))
    );
    shotsDrawn.clear();
    puffs.forEach(({ at, through }, id) => {
      if (shorn(id) === 'battle-shot-hit') {
        hitFrames.push([now - thrownAt, through, at]);
      }
    });
    walkersPosed.clear();
  }

  const askedWhere = jointsAsked.map(([id, figure, joint]) => [
      kind(id),
      figure,
      joint,
    ]),
    [stood] = placedSince(),
    firstFallen = thrown.find(([, , fell]) => fell !== null),
    fadingFrom = thrown.find(([, , , solid]) => solid !== null && solid < 1),
    lastAttacker = thrown.filter(([, attacking]) => attacking !== null).at(-1),
    over = thrown.find(
      ([, attacking, fell]) => attacking === null && fell === null
    );

  expect(
    'drawn with rigged copies, the attacker throwing stands where it is, playing its fight from the start; the blow falls as its throw lands, 0.85 s in; the loser plays its fall from the blow, solid as it falls, 1.73 s with its second figure, then fades in a puff; and the attacker stands till its clip and the fall are over',
    [
      stood!.every((point) => along(point) === 0),
      thrown[0]![1],
      [
        firstFallen![0] > 850 && firstFallen![0] <= 866,
        firstFallen![2],
        firstFallen![3],
      ],
      thrown
        .filter(([at, , fell]) => fell !== null && at <= 850 + 1730)
        .every(([, , , solid, through]) => solid === 1 && (through ?? 0) === 0),
      fadingFrom![0] > 850 + 1730 && fadingFrom![0] <= 850 + 1730 + 16,
      [
        lastAttacker![1]![0],
        lastAttacker![0] > 3160 && lastAttacker![0] <= 3180,
      ],
      over![0] > 3180 && over![0] <= 3196,
      [unitOn(1, 1), unitOn(2, 1), walkers.size, puffs.size],
    ],
    [
      true,
      ['fight', 16],
      [true, ['die', firstFallen![0] - 850], 1],
      true,
      true,
      ['fight', true],
      true,
      [['Unit-A', 1], null, 0, 0],
    ]
  );

  // A rigged attacker attacking again at once, its first battle three seconds long: the second waits for the first, not
  //  ending it, as it's no more than two of them behind.
  repatched([1, 1, [walker]], [2, 1, [rival]], [1, 2, [rivalMate]]);
  rigFactsFor.set('Unit-T', rigFactsFor.get('Unit-R')!);
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);
  fought(walker, [1, 1], rivalMate, [1, 2], 'attacker');
  patch([1, 1, [walker]], [1, 2, []]);
  runFrames(1);

  const againAtOnce = [unitOn(2, 1), unitOn(1, 2)];

  runFrames();
  rigFactsFor.clear();
  repatched([1, 1, []], [2, 1, []], [1, 2, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();
  walkersPosed.clear();

  const inFlight = shotFrames.filter(([, , at]) => at !== null),
    [left, landed] = [inFlight[0]!, inFlight.at(-1)!],
    takenAway = shotFrames.find(([, , at]) => at === null),
    highest = Math.max(...inFlight.map(([, , at]) => at![1]!)),
    handAt = groundAt(1, 1).map((n, index) => (index === 1 ? n + 0.2 : n)),
    near = (at: readonly number[], to: readonly number[], by: number) =>
      at.every((n, index) => Math.abs(n - to[index]!) < by);

  expect(
    'its throw: one shot, from the node its clip names on its one figure, leaving half a second in where the figure’s hand is, flying in an arc, rising over both ends, to the square attacked, landing at the blow, and bursting in a puff there that’s gone half a second later',
    [
      askedWhere,
      [...new Set(shotFrames.map(([, id]) => id))],
      left[0] >= 500 && left[0] < 516,
      near(left[2]!, handAt, 0.05),
      landed[0] >= 834 && landed[0] < 850,
      near(landed[2]!, groundAt(2, 1), 0.12),
      highest > left[2]![1]! && highest > landed[2]![1]!,
      takenAway![0] >= 850 && takenAway![0] < 866,
      [
        hitFrames[0]![0] >= 850 && hitFrames[0]![0] < 866,
        // Landed at the blow itself, as its clip let it go, though the frame was later.
        Math.abs(hitFrames[0]![1] - (hitFrames[0]![0] - 850) / 500) < 1e-9,
        hitFrames.every(
          ([, through], at) => at === 0 || through > hitFrames[at - 1]![1]
        ),
        near(hitFrames[0]![2], groundAt(2, 1), 0.06),
        hitFrames.at(-1)![0] >= 850 + 500 - 16 &&
          hitFrames.at(-1)![0] < 850 + 500 &&
          hitFrames.at(-1)![1] < 1,
      ],
    ],
    [
      [['battle', 0, 'prop']],
      ['battle-shot'],
      true,
      true,
      true,
      true,
      true,
      true,
      [true, true, true, true, true],
    ]
  );

  expect(
    'a rigged attacker attacking again at once: the second battle waits for the first, rather than ending it',
    againAtOnce,
    [
      ['Unit-R', 1],
      ['Unit-T', 1],
    ]
  );

  // Thrown over the world's seam, a shot flies the short way, a square west, not three east; and a step while it's in
  //  flight ends the battle at once, the shot with it.
  rigFactsFor.set('Unit-A', {
    figures: 1,
    stagger: 0.13,
    clips: { fight: { duration: 1.5, shots: [{ at: 0.5, joint: 'prop' }] } },
  });
  rigFactsFor.set('Unit-R', {
    figures: 1,
    stagger: 0.13,
    clips: { die: { duration: 1.6, shots: [] } },
  });
  repatched([0, 1, [walker]], [3, 1, [rival]]);
  shotsDrawn.clear();
  fought(walker, [0, 1], rival, [3, 1], 'attacker');
  patch([0, 1, [walker]], [3, 1, []]);
  runFrames(40);

  const [westU] = groundAt(0, 1),
    overSeam = [...shotsDrawn.values()]
      .flat()
      .flatMap((at) => (at === null ? [] : [at[0]!]));

  shotsDrawn.clear();
  stepped(walker, [0, 1], [0, 2]);
  patch([0, 1, []], [0, 2, [walker]]);
  runFrames(1);

  const cutMidFlight = [...shotsDrawn.values()].map((points) => points.at(-1));

  shotsDrawn.clear();
  runFrames();

  const drawnAfter = shotsDrawn.size;

  rigFactsFor.clear();
  repatched([0, 2, []], [3, 1, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();
  walkersPosed.clear();

  expect(
    'thrown over the world’s seam, a shot flies the short way, a square west; a step while it’s in flight ends the battle, the shot taken away with it',
    [
      overSeam.length > 0 &&
        overSeam.every((u) => u <= westU! + 0.01 && u >= westU! - 1.05),
      cutMidFlight,
      drawnAfter,
    ],
    [true, [null], 0]
  );

  // Twice as quick, a squad's throws and the puffs where they land are over with their battle, none left drawn once the
  //  frames stop.
  rigFactsFor.set('Unit-A', {
    figures: 3,
    stagger: 0.13,
    clips: { fight: { duration: 1.5, shots: [{ at: 0.5, joint: 'prop' }] } },
  });
  optionsRegistry.set(MAP3D_WALKS_OPTION, 'fast');
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  shotsDrawn.clear();
  puffsPlaced.clear();
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);
  runFrames();

  const hitsThrough = [...puffsPlaced.entries()]
      .filter(([id]) => id.endsWith('-hit'))
      .map(([, through]) => Math.max(...through)),
    quickOver = [
      hitsThrough.length,
      // Each burst all but whole before it's gone, as quick as its battle.
      hitsThrough.every((through) => through > 0.9),
      [...shotsDrawn.values()].map((points) => points.at(-1)),
      puffs.size,
    ];

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');

  // With units hidden (`t`) mid-flight, the shot's taken away, and none's thrown while they're hidden; but the one
  //  ringed, drawn still, throws.
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  shotsDrawn.clear();
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);
  runFrames(40);

  const beforeHidden = shotsDrawn.size;

  shotsDrawn.clear();
  glider.toggleUnits();
  runFrames(1);

  const hiddenMidFlight = [...shotsDrawn.values()].map((points) =>
    points.at(-1)
  );

  shotsDrawn.clear();
  runFrames();

  const thrownHidden = [...shotsDrawn.values()]
    .flat()
    .filter((at) => at !== null).length;

  glider.toggleUnits();

  // The one ringed is drawn with units hidden, throwing: its throws fly.
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  shotsDrawn.clear();
  glider.setActiveUnit({
    ...walker,
    tile: tiles[1 * 4 + 1],
  } as unknown as Unit);
  glider.toggleUnits();
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);
  runFrames();

  // Each drawn in flight, not only taken away.
  const ringedThrows = [...shotsDrawn.values()].filter((points) =>
    points.some((at) => at !== null)
  ).length;

  glider.toggleUnits();
  glider.setActiveUnit(null);

  // An attacker with no clip that's beaten a Partisan, falling for 1.9 s, attacking again at once a unit with no clip:
  //  the second battle waits for the first, though it's short, rather than ending the first and its fall.
  rigFactsFor.clear();
  rigFactsFor.set('Unit-R', {
    figures: 2,
    stagger: 0.13,
    clips: { die: { duration: 1.6, shots: [] } },
  });
  repatched([1, 1, [walker]], [2, 1, [rival]], [1, 2, [rivalMate]]);
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);
  fought(walker, [1, 1], rivalMate, [1, 2], 'attacker');
  patch([1, 1, [walker]], [1, 2, []]);
  runFrames(1);

  const shortAfterLong = [unitOn(2, 1), unitOn(1, 2)];

  runFrames();
  rigFactsFor.clear();
  repatched([1, 1, []], [2, 1, []], [1, 2, []]);
  walkersSet.length = 0;
  walkersPlaced.clear();
  walkersPosed.clear();
  shotsDrawn.clear();

  expect(
    'twice as quick, a squad’s throws and their puffs are over with their battle; units hidden mid-flight, the shot’s taken away, and none’s thrown while they’re hidden, but the one ringed throws; a short battle after a long one by the same attacker waits for it',
    [
      quickOver,
      [beforeHidden, hiddenMidFlight, thrownHidden, ringedThrows],
      shortAfterLong,
    ],
    [
      [3, true, [null, null, null], 0],
      [2, [null, null], 0, 3],
      [
        ['Unit-R', 1],
        ['Unit-T', 1],
      ],
    ]
  );

  // A rifleman's bullet (`SHOT_LOOKS`): drawn as a bullet, flying straight, pointing the way it goes; a flash and smoke
  //  where it leaves, from the node its clip names, as big as a muzzle's; landing as quick as a bullet flies, the blow
  //  then, its puff as small as a bullet's; the battle drawn till its smoke and its puff are over. A frame drawn after
  //  it's both left and landed still shows its smoke where it left. A shell's burst flashes, and it flies slower.
  const shooter = (kind: 'bullet' | 'shell', figures = 1, volleys = [0.4]) =>
      rigFactsFor.set('Unit-A', {
        figures,
        stagger: 0.13,
        clips: {
          fight: {
            duration: 1.2,
            shots: volleys.map((at) => ({ at, joint: 'muzzle', kind })),
          },
          die: { duration: 1.5, shots: [] },
        },
      }),
    looksAfter = (
      between?: () => void,
      winner: 'attacker' | 'defender' = 'attacker'
    ) => {
      repatched([1, 1, [walker]], [2, 1, [rival]]);
      shotsDrawn.clear();
      shotLooks.clear();
      puffsPlaced.clear();
      puffLooks.clear();
      jointsAsked.length = 0;

      const firedAt = now;

      fought(walker, [1, 1], rival, [2, 1], winner);
      patch(
        ...((winner === 'attacker'
          ? [
              [1, 1, [walker]],
              [2, 1, []],
            ]
          : [
              [1, 1, []],
              [2, 1, [rival]],
            ]) as [number, number, Tile['units'][number][]][])
      );

      if (between !== undefined) {
        while (now - firedAt < 380 && runFrames(1) > 0);

        between();
      }

      // Each frame the shot was drawn in flight: how long since it was fought, and where it was.
      const inFlight: number[] = [],
        path: (readonly number[])[] = [];

      for (let frame = 0; frame < 400 && runFrames(1) > 0; frame++) {
        const drawn = [...shotsDrawn.values()].at(-1)?.at(-1);

        if (drawn !== undefined && drawn !== null) {
          inFlight.push(now - firedAt);
          path.push(drawn);
        }

        shotsDrawn.forEach((points) => (points.length = 0));
      }

      const [id] = [...shotLooks.keys()],
        look = id === undefined ? undefined : shotLooks.get(id),
        ended = now - firedAt;

      return {
        kind: look?.kind ?? null,
        // Straight, the same way all its flight, one long, and towards the square attacked, a square east.
        straight:
          look === undefined
            ? null
            : look.headings.every(
                (heading) =>
                  heading.every(
                    (n, axis) => Math.abs(n - look.headings[0]![axis]!) < 1e-9
                  ) &&
                  Math.abs(Math.hypot(...heading) - 1) < 1e-9 &&
                  heading[0]! > 0.5
              ),
        inFlight: inFlight.length === 0 ? null : [inFlight[0], inFlight.at(-1)],
        // Where it was, from where it was first drawn, along the ground and up: as far up for each step along, a
        //  straight line, or not, an arc.
        level: (() => {
          const [first] = path,
            slopes = path.slice(1).map((point) => {
              const along = Math.hypot(
                point[0]! - first![0]!,
                point[2]! - first![2]!
              );

              return (point[1]! - first![1]!) / along;
            });

          return slopes.length < 2
            ? null
            : slopes.every((slope) => Math.abs(slope - slopes[0]!) < 1e-6);
        })(),
        muzzle: [...puffLooks.entries()]
          .filter(([key]) => key.endsWith('-muzzle'))
          .map(([, puff]) => puff),
        hit: [...puffLooks.entries()]
          .filter(([key]) => key.endsWith('-hit'))
          .map(([, puff]) => puff),
        joints: [...new Set(jointsAsked.map(([, , joint]) => joint))],
        // How many landed, each with its puff.
        landed: [...puffLooks.keys()].filter((key) => key.endsWith('-hit'))
          .length,
        ended,
        puffsLeft: puffs.size,
      };
    };

  rigFactsFor.clear();
  shooter('bullet');

  const bullet = looksAfter();

  // Leaving and landing between one frame and the next.
  const skipped = looksAfter(() => {
    now += 150;
  });

  shooter('shell');

  const shell = looksAfter();

  // A squad of three that loses falls at the blow, its first bullet landing before the others have left: they still
  //  leave, as its clip has them. Twice as quick, a bullet flies half as long.
  shooter('bullet', 3);
  walkersBefore.clear();

  const lostSquad = looksAfter(undefined, 'defender'),
    // Falling, its figures were posed fighting till each one's own fall began.
    fellFighting = [...walkersBefore];

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'fast');

  const lostQuick = looksAfter(undefined, 'defender');

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');

  // Firing twice, the second volley after the blow: lost, its figures have fallen by then, and fire none of it; won,
  //  they fire both.
  shooter('bullet', 3, [0.4, 1]);

  const lostVolleys = looksAfter(undefined, 'defender'),
    wonVolleys = looksAfter();

  shooter('bullet');
  optionsRegistry.set(MAP3D_WALKS_OPTION, 'fast');

  const quickBullet = looksAfter();

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');

  rigFactsFor.clear();
  repatched([1, 1, []], [2, 1, []]);

  expect(
    'a bullet’s drawn as one, straight, from the node its clip names, its smoke a muzzle’s and its flash at the muzzle, landing as quick as a bullet flies, its puff a bullet’s, the battle over once they are; leaving and landing between frames, its smoke’s still drawn; a shell flies slower, its burst flashing on the ground; a squad that loses fires every bullet before it falls, none after; twice as quick, a bullet flies half as long',
    [
      bullet.kind,
      [bullet.straight, bullet.level],
      bullet.joints,
      bullet.muzzle,
      bullet.hit,
      // Leaving 0.4 s in, and in flight no longer than a bullet flies, a frame either side.
      bullet.inFlight !== null &&
        bullet.inFlight[0]! >= 400 &&
        bullet.inFlight[1]! - bullet.inFlight[0]! < SHOT_LOOKS.bullet.flight,
      bullet.puffsLeft,
      [skipped.inFlight, skipped.muzzle, skipped.hit],
      [shell.kind, shell.hit, shell.straight, shell.level],
      shell.inFlight !== null &&
        shell.inFlight[1]! - shell.inFlight[0]! >=
          SHOT_LOOKS.shell.flight - 2 * 16,
      [lostSquad.landed, lostSquad.puffsLeft, fellFighting, lostQuick.landed],
      [lostVolleys.landed, wonVolleys.landed],
      quickBullet.inFlight !== null &&
        quickBullet.inFlight[1]! - quickBullet.inFlight[0]! <
          SHOT_LOOKS.bullet.flight / 2,
    ],
    [
      'bullet',
      [true, true],
      ['muzzle'],
      [{ size: SHOT_LOOKS.bullet.muzzle, flash: 0 }],
      [{ size: SHOT_LOOKS.bullet.hit, flash: null }],
      true,
      0,
      [
        null,
        [{ size: SHOT_LOOKS.bullet.muzzle, flash: 0 }],
        [{ size: SHOT_LOOKS.bullet.hit, flash: null }],
      ],
      [
        'shell',
        [{ size: SHOT_LOOKS.shell.hit, flash: FLASH_SIZE }],
        false,
        false,
      ],
      true,
      [3, 0, ['die after fight'], 3],
      [3, 6],
      true,
    ]
  );

  // Attacking a square twice, the second waiting, and stepping on just after the first's blow, before a frame's told
  //  it: the first's blow is told first, and its loser drawn falling; the second's over at once (#1334).
  repatched([1, 1, [walker]], [2, 1, [rival, rivalMate]]);
  walkersSet.length = 0;

  const twiceFrom = now;

  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, [rivalMate]]);
  fought(walker, [1, 1], rivalMate, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);

  // To just before the first's blow, then past it with no frame between.
  while (now - twiceFrom < 180 && runFrames(1) > 0);

  now += 40;
  stepped(walker, [1, 1], [1, 2]);
  patch([1, 1, []], [1, 2, [walker]]);
  runFrames(1);

  const toldInOrder = [
    [...walkers.keys()].map(kind).sort(),
    // What's drawn falling is what fell in the first: the one unit, not the second's too, its blow told first.
    [...walkers.entries()]
      .filter(([id]) => kind(id) === 'battle-fallen')
      .map(([, marker]) => [marker.unit?.id, marker.unit?.count]),
    unitOn(2, 1),
  ];

  runFrames();
  repatched([1, 2, []], [2, 1, []]);

  expect(
    'attacking a square twice, a step just after the first blow, before a frame’s told it: its loser’s drawn falling, alone, its blow told first; the walk drawn; the second over, the square empty',
    toldInOrder,
    [['battle-fallen', 'walk'], [['Unit-R', 1]], null]
  );

  // Stepping on right after its blow, a squad's bottles still in flight land, each bursting where it lands, and the
  //  loser falls as it would (#1334).
  rigFactsFor.set('Unit-A', {
    figures: 3,
    stagger: 0.13,
    clips: { fight: { duration: 1.5, shots: [{ at: 0.5, joint: 'prop' }] } },
  });
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  puffLooks.clear();
  shotsDrawn.clear();

  const thrownFrom = now;

  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);

  while (now - thrownFrom < 880 && runFrames(1) > 0);

  const inFlightAtStep = [...shotsDrawn.values()].filter(
    (points) => points.at(-1) !== null
  ).length;

  stepped(walker, [1, 1], [1, 2]);
  patch([1, 1, []], [1, 2, [walker]]);
  runFrames();

  const landedAfterStep = [
    inFlightAtStep,
    [...puffLooks.keys()].filter((key) => key.endsWith('-hit')).length,
    puffs.size,
  ];

  rigFactsFor.clear();
  repatched([1, 2, []]);

  expect(
    'stepping on right after its blow, a squad’s bottles in flight land, each bursting, all gone once over',
    landedAfterStep,
    [2, 3, 0]
  );

  // The active unit attacks with its last move, and the game chooses the next: the ring and the camera wait till the
  //  battle's over. A key while they wait ends it at once, and they go to the next.
  const attackedLast = () => {
    repatched([1, 1, [walker]], [2, 1, [rival]], [3, 3, [nextUnit]]);
    glider.setActiveUnit(placed(walker, 1, 1));
    glider.portal.setCenter(1, 1);
    runFrames();
    fought(walker, [1, 1], rival, [2, 1], 'attacker');
    patch([1, 1, [walker]], [2, 1, []]);
    glider.setActiveUnit(placed(nextUnit, 3, 3));
    glider.portal.setCenter(3, 3);
    runFrames(2);
  };

  repatched([0, 1, [rivalMate]]);
  attackedLast();

  const heldForBattle: unknown[] = [
    walkerRinged(),
    ringOn(3, 3),
    focusOn(1, 1),
  ];

  // Another's walk over meanwhile, a rival's: the ring and the camera still wait for the battle.
  stepped(rivalMate, [0, 1], [0, 2], 'Player-2');
  patch([0, 1, []], [0, 2, [rivalMate]]);
  runFrames(12);
  heldForBattle.push(unitOn(0, 2), walkerRinged(), ringOn(3, 3), focusOn(1, 1));
  runFrames();
  repatched([0, 2, []]);

  const afterBattle = [unitOn(1, 1), ringOn(1, 1), ringOn(3, 3), focusOn(3, 3)];

  attackedLast();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));

  const keyedBattle = [unitOn(1, 1), unitOn(2, 1), walkers.size, ringOn(3, 3)];

  runFrames();
  keyedBattle.push(focusOn(3, 3));

  // A key after the blow: the ring and the camera go to the next at once, the attacker back on its square, and the
  //  loser falls as it would, its puff of smoke going on till it's over (#1334).
  attackedLast();
  runFrames(12);
  keyedBattle.push(puffs.size);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
  runFrames(1);
  keyedBattle.push(puffs.size, ringOn(3, 3), unitOn(1, 1));
  runFrames();
  keyedBattle.push(puffs.size);

  // Lost with its last move: the ring and the camera wait till it's faded away, then go to the next.
  repatched([1, 1, [walker]], [2, 1, [rival]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(walker, 1, 1));
  glider.portal.setCenter(1, 1);
  runFrames();
  fought(walker, [1, 1], rival, [2, 1], 'defender');
  patch([1, 1, []], [2, 1, [rival]]);
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  glider.portal.setCenter(3, 3);
  runFrames(2);

  const diedRinged: unknown[] = [walkerRinged(), ringOn(3, 3), focusOn(1, 1)];

  runFrames();
  diedRinged.push(unitOn(1, 1), ringOn(3, 3), focusOn(3, 3));

  // Lost, a key while it falls: the ring goes to the next at once, and it falls on as it would (#1334).
  repatched([1, 1, [walker]], [2, 1, [rival]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(walker, 1, 1));
  glider.portal.setCenter(1, 1);
  runFrames();
  fought(walker, [1, 1], rival, [2, 1], 'defender');
  patch([1, 1, []], [2, 1, [rival]]);
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  glider.portal.setCenter(3, 3);
  runFrames(20);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
  runFrames(1);
  diedRinged.push(ringOn(3, 3), [...walkers.keys()].map(kind));
  runFrames();
  diedRinged.push(walkers.size);
  glider.setActiveUnit(null);
  repatched([1, 1, []], [2, 1, []], [3, 3, []]);

  expect(
    'the active unit attacking with its last move holds the ring and the camera till the battle’s over, then they go to the next; a key meanwhile ends it at once; after the blow, they go to the next, the loser falling on, its puff till it’s over; lost, they wait till it’s gone, or, a key, go at once, it falling on',
    [heldForBattle, afterBattle, keyedBattle, diedRinged],
    [
      [true, false, true, ['Unit-T', 1], true, false, true],
      [['Unit-A', 1], false, true, true],
      [['Unit-A', 1], null, 0, true, true, 1, 1, true, ['Unit-A', 1], 0],
      [true, false, true, null, true, true, true, ['battle'], 0],
    ]
  );

  // The battle's patch held, as meeting a leader holds it: once the battle's over, the winner stands where it stood till
  //  it comes, and the loser's left off.
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  walkersSet.length = 0;
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  runFrames();

  const heldPatch: unknown[] = [
    unitOn(1, 1),
    unitOn(2, 1),
    [...walkers.keys()].map(kind),
  ];

  repatched([1, 1, [walker]], [2, 1, []]);
  heldPatch.push(unitOn(1, 1), walkers.size);

  // Lost, its patch held: once it's faded away, it's left off its square till the patch comes.
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  fought(walker, [1, 1], rival, [2, 1], 'defender');
  runFrames();
  heldPatch.push(unitOn(1, 1), unitOn(2, 1), walkers.size);
  repatched([1, 1, []], [2, 1, []]);

  // Its patch held, the ringed unit attacking with its last move, a key after the blow: the ring goes on at once, the
  //  winner stands where it fought from till its patch comes, and the loser falls as it would; once the battle's over,
  //  the winner still stands there (#1334).
  repatched([1, 1, [walker]], [2, 1, [rival]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(walker, 1, 1));
  glider.portal.setCenter(1, 1);
  runFrames();
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  glider.portal.setCenter(3, 3);
  runFrames(14);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
  runFrames(1);
  // The winner's walker standing where it fought from, not lunging: at the middle of its square.
  const [standingId] = [...walkers.keys()].filter(
      (id) => kind(id) === 'battle'
    ),
    stoodAt = walkersPlaced.get(standingId ?? '')?.at(-1) ?? [],
    [fromU, , fromV] = groundAt(1, 1);

  heldPatch.push(
    ringOn(3, 3),
    [...walkers.keys()].map(kind).sort(),
    Math.abs(stoodAt[0]! - fromU!) < 0.01 &&
      Math.abs(stoodAt[2]! - fromV!) < 0.01
  );
  runFrames();
  heldPatch.push([...walkers.keys()].map(kind));
  repatched([1, 1, [walker]], [2, 1, []]);
  heldPatch.push(unitOn(1, 1), walkers.size);
  glider.setActiveUnit(null);
  repatched([1, 1, []], [3, 3, []]);

  // Two attacks on one square at once, two units holding it, as in a city, where one falls at a time: fought together,
  //  the square as it was till the blows, what fell in each fading alone.
  repatched([1, 1, [walker]], [3, 1, [guard]], [2, 1, [rival, rivalMate]]);
  walkersSet.length = 0;
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, [rivalMate]]);
  fought(guard, [3, 1], rivalMate, [2, 1], 'attacker');
  patch([3, 1, [guard]], [2, 1, []]);
  runFrames(13);

  const firstBlow = [unitOn(2, 1), fighters()];

  // Both over at 800 ms.
  runFrames(50);

  const secondBlow = [unitOn(2, 1), fighters()];

  runFrames();

  const twoOver = [unitOn(1, 1), unitOn(2, 1), unitOn(3, 1), walkers.size];

  repatched([3, 1, []]);

  // In a tab out of sight, with no frames: the first frame drawn again ends the battle, nothing of it drawn.
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  walkersSet.length = 0;
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);
  now += 5000;
  runFrames(1);

  const outOfSight = [
    unitOn(1, 1),
    unitOn(2, 1),
    drawnWalkers().ids,
    walkers.size,
  ];

  runFrames();
  repatched([1, 1, []]);

  expect(
    'its patch held, the winner stands where it stood once the battle’s over, and the loser’s left off, till it comes; hurried on after the blow, the ring goes on, the winner standing there till its patch, the loser falling on; two attacks on one square, fought together, what fell in each fading alone; with no frames, the first drawn again ends it',
    [heldPatch, firstBlow, secondBlow, twoOver, outOfSight],
    [
      [
        null,
        null,
        ['battle'],
        ['Unit-A', 1],
        0,
        null,
        ['Unit-R', 1],
        0,
        true,
        ['battle', 'battle-fallen'],
        true,
        ['battle'],
        ['Unit-A', 1],
        0,
      ],
      [
        null,
        [
          ['battle', 'Unit-A', 1, 1],
          ['battle', 'Unit-B', 1, 1],
          ['battle-fallen', 'Unit-R', 1, 1],
          ['battle-fallen', 'Unit-T', 1, 1],
        ],
      ],
      [null, []],
      [['Unit-A', 1], null, ['Unit-B', 1], 0],
      [['Unit-A', 1], null, [], 0],
    ]
  );

  // As a rival's turn sends them, the page's world rebuilt and the tiles released once a frame (`GameState`): a rival's
  //  step and its attack in one burst walk there, then fight; two attacks on one square in one burst, together, each on
  //  what the last left; and one unit attacking twice is drawn once.
  const square = (x: number, y: number) => tiles[y * 4 + x] as Tile,
    raider = unitOf('Unit-X', 1, 'Player-2'),
    otherRaider = unitOf('Unit-Y', 1, 'Player-2'),
    mine = unitOf('Unit-M', 1),
    rivals: [string, string] = ['Player-2', 'Player-1'];

  repatched([0, 1, [raider]], [1, 1, []], [2, 1, [mine]]);
  walkersSet.length = 0;
  walkersPlaced.clear();
  stepped(raider, [0, 1], [1, 1], 'Player-2');
  glider.queueTile(square(0, 1));
  glider.queueTile(square(1, 1));
  fought(raider, [1, 1], mine, [2, 1], 'attacker', rivals);
  glider.queueTile(square(1, 1));
  glider.queueTile(square(2, 1));
  // The next frame: the world rebuilt, and the tiles released.
  square(0, 1).units = [] as Tile['units'];
  square(1, 1).units = [raider] as Tile['units'];
  square(2, 1).units = [] as Tile['units'];
  glider.releaseTiles();
  runFrames(1);

  const burst: unknown[] = [[...walkers.keys()].map(kind), unitOn(2, 1)];

  for (
    let frame = 0;
    frame < 60 && [...walkers.keys()].some((id) => kind(id) === 'walk');
    frame++
  ) {
    runFrames(1);
  }

  runFrames(1);
  burst.push([...walkers.keys()].map(kind), unitOn(2, 1));
  runFrames(13);
  burst.push(fighters(), unitOn(2, 1));
  runFrames();
  burst.push(unitOn(1, 1), unitOn(2, 1), walkers.size);
  repatched([1, 1, []]);

  // Two attacks in one burst on a square three of mine hold, as in a city, each killing one.
  const best = unitOf('Unit-M1', 5),
    next = unitOf('Unit-M2', 3),
    last = unitOf('Unit-M3', 1);

  repatched(
    [1, 1, [raider]],
    [3, 1, [otherRaider]],
    [2, 1, [best, next, last]]
  );
  walkersSet.length = 0;
  fought(raider, [1, 1], best, [2, 1], 'attacker', rivals);
  glider.queueTile(square(1, 1));
  glider.queueTile(square(2, 1));
  fought(otherRaider, [3, 1], next, [2, 1], 'attacker', rivals);
  glider.queueTile(square(3, 1));
  glider.queueTile(square(2, 1));
  square(2, 1).units = [last] as Tile['units'];
  glider.releaseTiles();
  runFrames(1);

  const twoInABurst: unknown[] = [unitOn(2, 1)];

  runFrames(12);
  twoInABurst.push(unitOn(2, 1), fighters());
  runFrames(50);
  twoInABurst.push(unitOn(2, 1), fighters());
  runFrames();
  twoInABurst.push(unitOn(2, 1), walkers.size);
  repatched([1, 1, []], [3, 1, []], [2, 1, []]);

  // One unit attacking twice, its second attack before its first battle's over.
  const knight = unitOf('Unit-K', 1),
    firstFoe = unitOf('Unit-F1', 1, 'Player-2'),
    secondFoe = unitOf('Unit-F2', 1, 'Player-2');

  repatched([1, 1, [knight]], [2, 1, [firstFoe, secondFoe]]);
  walkersSet.length = 0;
  fought(knight, [1, 1], firstFoe, [2, 1], 'attacker');
  patch([1, 1, [knight]], [2, 1, [secondFoe]]);
  runFrames(3);
  fought(knight, [1, 1], secondFoe, [2, 1], 'attacker');
  patch([1, 1, [knight]], [2, 1, []]);
  runFrames(1);

  const attackedTwice: unknown[] = [fighters()];

  runFrames(60);
  attackedTwice.push(fighters());
  runFrames();
  attackedTwice.push(unitOn(1, 1), unitOn(2, 1), walkers.size);
  repatched([1, 1, []]);

  expect(
    'a rival’s step and attack in one burst: it walks there, then lunges, the square attacked as it was till the blow; two attacks in one burst on one square, together, each on what the last left, what fell in each fading alone; a unit attacking twice is drawn once, in each battle in turn',
    [burst, twoInABurst, attackedTwice],
    [
      [
        ['walk'],
        ['Unit-M', 1],
        ['battle'],
        ['Unit-M', 1],
        [
          ['battle', 'Unit-X', 1, 1],
          ['battle-fallen', 'Unit-M', 1, 1],
        ],
        null,
        ['Unit-X', 1],
        null,
        0,
      ],
      [
        ['Unit-M1', 3],
        ['Unit-M3', 1],
        [
          ['battle', 'Unit-X', 1, 1],
          ['battle', 'Unit-Y', 1, 1],
          ['battle-fallen', 'Unit-M1', 1, 1],
          ['battle-fallen', 'Unit-M2', 1, 1],
        ],
        ['Unit-M3', 1],
        [],
        ['Unit-M3', 1],
        0,
      ],
      [
        [['battle', 'Unit-K', 1, 1]],
        [
          ['battle', 'Unit-K', 1, 1],
          ['battle-fallen', 'Unit-F2', 1, 1],
        ],
        ['Unit-K', 1],
        null,
        0,
      ],
    ]
  );

  // Patches held, as meeting a leader holds them: one standing where it walked to, waiting for its step's patch, fights
  //  from there, drawn once; and one walking there as it attacks, its battle's patch held, is drawn once, fighting, once
  //  it's there.
  const fightingKinds = () =>
    [...walkers.keys()].map(kind).filter((id) => id !== 'battle-fallen');

  repatched([0, 1, [walker]], [2, 1, [rival]]);
  walkersSet.length = 0;
  stepped(walker, [0, 1], [1, 1]);
  runFrames();

  const heldStep: unknown[] = [fightingKinds()];

  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  runFrames(1);
  heldStep.push(fightingKinds());
  patch([0, 1, []], [1, 1, [walker]], [2, 1, []]);
  runFrames();
  heldStep.push(unitOn(1, 1), unitOn(2, 1), walkers.size);

  repatched([0, 1, [walker]], [2, 1, [rival]]);
  walkersSet.length = 0;
  stepped(walker, [0, 1], [1, 1]);
  patch([0, 1, []], [1, 1, [walker]]);
  runFrames(2);
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  runFrames(22);

  const heldBattle: unknown[] = [fightingKinds()];

  patch([1, 1, [walker]], [2, 1, []]);
  runFrames();
  heldBattle.push(unitOn(1, 1), unitOn(2, 1), walkers.size);
  repatched([1, 1, []]);

  expect(
    'patches held: one standing where it walked to fights from there, drawn once; one walking there as it attacks, its battle’s patch held, is drawn once, fighting, once it’s there',
    [heldStep, heldBattle],
    [
      [['walk'], ['battle'], ['Unit-A', 1], null, 0],
      [['battle'], ['Unit-A', 1], null, 0],
    ]
  );

  // In the player's own turn, the world's patched before the next attack: a defender hurt in the first battle, as under
  //  Civ2's rounds, is hurt as the second finds it, and falls so. Hurt as the page has it, in place: what's kept of it as
  //  the battle came isn't.
  const holder = {
    ...unitOf('Unit-H', 1, 'Player-2'),
    hitPoints: { current: 10, max: 10 },
  } as Tile['units'][number] & { hitPoints: { current: number; max: number } };

  repatched([1, 1, [walker]], [3, 1, [guard]], [2, 1, [holder]]);
  fought(walker, [1, 1], holder, [2, 1], 'defender');
  holder.hitPoints.current = 5;
  patch([1, 1, []], [2, 1, [holder]]);
  fought(guard, [3, 1], holder, [2, 1], 'attacker');
  patch([3, 1, [guard]], [2, 1, []]);
  runFrames(13);

  const hurtBetween = [
    [...walkers.entries()].find(([id]) => kind(id) === 'battle-fallen')?.[1]
      .unit?.health,
  ];

  runFrames();
  repatched([3, 1, []]);

  // A defender hurt in place before the blow, the page filling what it holds: shown as it was till then.
  const scarred = {
    ...unitOf('Unit-S', 1, 'Player-2'),
    hitPoints: { current: 10, max: 10 },
  } as Tile['units'][number] & { hitPoints: { current: number; max: number } };

  repatched([1, 1, [walker]], [2, 1, [scarred]]);
  fought(walker, [1, 1], scarred, [2, 1], 'defender');
  scarred.hitPoints.current = 5;
  patch([1, 1, []], [2, 1, [scarred]]);
  runFrames(1);
  hurtBetween.push(markers.get('2,1')?.unit?.health);
  runFrames(13);
  hurtBetween.push(markers.get('2,1')?.unit?.health);
  runFrames();
  repatched([2, 1, []]);

  expect(
    'in the player’s own turn, a second attack on a square finds it as the first’s patch left it, its defender hurt, and it falls so; one hurt in place before the blow is shown as it was till then',
    hurtBetween,
    [0.5, null, 0.5]
  );

  // Walking quickly, the blow falls in half the time. And the square attacked shows its city as it was till the blow, as
  //  its units are, its town laid with the land too: a city shrunk by the battle shows its new size then, and one gone,
  //  its town till then.
  optionsRegistry.set(MAP3D_WALKS_OPTION, 'fast');
  const battleton = {
    id: 'City-B',
    name: 'Battleton',
    player: { civilization: { attributes: [] } },
    originalPlayer: { civilization: { _: 'Romans' } },
    growth: { size: 3 },
  };

  // How many points of roof are laid on the square attacked: its town's houses.
  const roofsOn = (): number => {
    const mesh = overlaysSet.get(glider.land().overlayKeyOf(2, 1)),
      [cu, cv] = middleOf(square(2, 1)),
      roofs = ROOFS.map((css) => new Color(css));
    let found = 0;

    for (let at = 0; mesh && at < mesh.positions.length; at += 3) {
      if (
        Math.hypot(
          mesh.positions[at]! + mesh.u - cu,
          mesh.positions[at + 2]! + mesh.v - cv
        ) < 0.5 &&
        roofs.some(
          ({ r, g, b }) =>
            Math.abs(mesh.colours[at]! - r) < 1e-4 &&
            Math.abs(mesh.colours[at + 1]! - g) < 1e-4 &&
            Math.abs(mesh.colours[at + 2]! - b) < 1e-4
        )
      ) {
        found++;
      }
    }

    return found;
  };

  square(2, 1).city = battleton as unknown as Tile['city'];
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  walkersSet.length = 0;

  const roofsBefore = roofsOn();

  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  // Shrunk in place, as the page fills what it holds.
  battleton.growth.size = 2;
  patch([1, 1, [walker]], [2, 1, []]);
  runFrames(1);

  const cityBefore = [
    markers.get('2,1')?.city?.size,
    unitOn(2, 1),
    roofsOn() === roofsBefore,
  ];

  runFrames(6);

  const quickBlow = [
    markers.get('2,1')?.city?.size,
    unitOn(2, 1),
    fighters().map(([id]) => id),
  ];

  runFrames();

  const shrunk = roofsOn() < roofsBefore;

  // A city of 1 its defender's beaten in: gone in the battle's patch, its town laid till the blow, then none.
  const hamlet = {
    ...battleton,
    id: 'City-H',
    name: 'Hamlet',
    growth: { size: 1 },
  };

  square(2, 1).city = hamlet as unknown as Tile['city'];
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  walkersSet.length = 0;
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  square(2, 1).city = null;
  patch([1, 1, [walker]], [2, 1, []]);
  runFrames(1);

  const hamletTillTheBlow = [markers.get('2,1')?.city?.size, roofsOn() > 0];

  runFrames();

  const hamletAfter = [markers.get('2,1')?.city ?? null, roofsOn()];

  // A city of 4 its defender's beaten in, shrinking to 3: its houses on the squares round it (not another city's own)
  //  laid till the blow, as its marker and town are, then gone.
  const roofsBeside = (): number => {
      const land = glider.land(),
        roofs = ROOFS.map((css) => new Color(css)),
        keys = new Set<string>();
      let found = 0;

      for (let y = 0; y <= 2; y++) {
        for (let x = 1; x <= 3; x++) {
          keys.add(land.overlayKeyOf(x, y));
        }
      }

      keys.forEach((key) => {
        const mesh = overlaysSet.get(key);

        for (let at = 0; mesh && at < mesh.positions.length; at += 3) {
          const [tx, ty] = land.layout.tileAt(
            mesh.positions[at]! + mesh.u,
            mesh.positions[at + 2]! + mesh.v
          );

          if (
            Math.abs(tx - 2) <= 1 &&
            Math.abs(ty - 1) <= 1 &&
            !(tx === 2 && ty === 1) &&
            // Not another city's own town.
            !square(tx, ty).city &&
            roofs.some(
              ({ r, g, b }) =>
                Math.abs(mesh.colours[at]! - r) < 1e-4 &&
                Math.abs(mesh.colours[at + 1]! - g) < 1e-4 &&
                Math.abs(mesh.colours[at + 2]! - b) < 1e-4
            )
          ) {
            found++;
          }
        }
      });

      return found;
    },
    outskirts = {
      ...battleton,
      id: 'City-O',
      name: 'Outskirts',
      growth: { size: 4 },
    };

  square(2, 1).city = outskirts as unknown as Tile['city'];
  repatched([1, 1, [walker]], [2, 1, [rival]]);
  walkersSet.length = 0;

  const besideBefore = roofsBeside();

  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  outskirts.growth.size = 3;
  patch([1, 1, [walker]], [2, 1, []]);
  runFrames(1);

  const besideTillTheBlow = roofsBeside();

  runFrames();

  const besideAfter = roofsBeside();

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');
  square(2, 1).city = null;
  repatched([1, 1, []], [2, 1, []]);

  expect(
    'a city of 4 shrinking to 3 in a battle: its houses round it laid till the blow, then gone',
    [besideBefore > 0, besideTillTheBlow === besideBefore, besideAfter],
    [true, true, 0]
  );

  expect(
    'walking quickly, the blow falls in half the time; the square attacked shows its city as it was till the blow, its town too, then as it is; a city taken and gone, its town till the blow',
    [
      cityBefore,
      quickBlow,
      shrunk,
      roofsBefore > 0,
      hamletTillTheBlow,
      hamletAfter,
    ],
    [
      [3, ['Unit-R', 1], true],
      [2, null, ['battle', 'battle-fallen']],
      true,
      true,
      [1, true],
      [null, 0],
    ]
  );

  // More as a rival's turn sends them, one burst at a time:
  //  - a rival's attack, then its step onto the square it emptied: the battle's shown, and it's on its new square once
  //    it's over;
  //  - a rival stepping out of the dark and attacking: drawn fighting once the page has it, a frame later;
  //  - with others' moves not shown, its step isn't walked, but its attack on the player's unit is fought.
  const burstThen = (
    ...squares: [number, number, Tile['units'][number][]][]
  ) => {
    squares.forEach(([x, y, units]) => {
      square(x, y).units = units as Tile['units'];
    });
    glider.releaseTiles();
  };

  repatched([1, 1, [raider]], [2, 1, [mine]]);
  walkersSet.length = 0;
  fought(raider, [1, 1], mine, [2, 1], 'attacker', rivals);
  glider.queueTile(square(1, 1));
  glider.queueTile(square(2, 1));
  stepped(raider, [1, 1], [2, 1], 'Player-2');
  glider.queueTile(square(1, 1));
  glider.queueTile(square(2, 1));
  burstThen([1, 1, []], [2, 1, [raider]]);
  runFrames(13);

  const movedIn: unknown[] = [fighters(), unitOn(1, 1), unitOn(2, 1)];

  runFrames();
  movedIn.push(unitOn(1, 1), unitOn(2, 1), walkers.size);
  repatched([2, 1, []]);

  const outOfTheDarkAttack = (
    hidden: boolean,
    from: Tile['units'][number][]
  ) => {
    optionsRegistry.set(MAP3D_RIVALS_WALK_OPTION, !hidden);
    repatched([0, 1, from], [1, 1, []], [2, 1, [mine]]);
    walkersSet.length = 0;
    stepped(raider, [0, 1], [1, 1], 'Player-2');
    glider.queueTile(square(0, 1));
    glider.queueTile(square(1, 1));
    fought(raider, [1, 1], mine, [2, 1], 'attacker', rivals);
    glider.queueTile(square(1, 1));
    glider.queueTile(square(2, 1));
    burstThen([0, 1, []], [1, 1, [raider]], [2, 1, []]);
    runFrames(1);

    const seen: unknown[] = [fighters(), unitOn(2, 1)];

    runFrames(12);
    seen.push(fighters());
    runFrames();
    seen.push(unitOn(1, 1), unitOn(2, 1));
    optionsRegistry.set(MAP3D_RIVALS_WALK_OPTION, true);
    repatched([1, 1, []]);

    return seen;
  };

  const fromTheDark = outOfTheDarkAttack(false, []),
    movesHidden = outOfTheDarkAttack(true, [raider]);

  // The view's frame before the world's rebuilt, as on the page, where the view asks for its frame first: nothing of the
  //  attacker drawn yet, the square attacked as it was; drawn once the world has it.
  repatched([0, 1, []], [1, 1, []], [2, 1, [mine]]);
  walkersSet.length = 0;
  stepped(raider, [0, 1], [1, 1], 'Player-2');
  glider.queueTile(square(0, 1));
  glider.queueTile(square(1, 1));
  fought(raider, [1, 1], mine, [2, 1], 'attacker', rivals);
  glider.queueTile(square(1, 1));
  glider.queueTile(square(2, 1));
  runFrames(1);

  const frameFirst: unknown[] = [fighters(), unitOn(2, 1)];

  burstThen([0, 1, []], [1, 1, [raider]], [2, 1, []]);
  runFrames(1);
  frameFirst.push(fighters(), unitOn(2, 1));
  runFrames();
  repatched([1, 1, []]);

  // A rival's step and attack on a city, and another rival's attack on it straight from beside it, in one burst: the
  //  second's blow falls with the first's, once the first's attacker's walked there, each defender falling once.
  const holders = [1, 2, 3].map((n) => unitOf(`Unit-Q${n}`, 4 - n));

  repatched(
    [0, 1, [raider]],
    [1, 1, []],
    [3, 1, [otherRaider]],
    [2, 1, holders]
  );
  walkersSet.length = 0;
  stepped(raider, [0, 1], [1, 1], 'Player-2');
  glider.queueTile(square(0, 1));
  glider.queueTile(square(1, 1));
  fought(raider, [1, 1], holders[0]!, [2, 1], 'attacker', rivals);
  glider.queueTile(square(1, 1));
  glider.queueTile(square(2, 1));
  fought(otherRaider, [3, 1], holders[1]!, [2, 1], 'attacker', rivals);
  glider.queueTile(square(3, 1));
  glider.queueTile(square(2, 1));
  burstThen([0, 1, []], [1, 1, [raider]], [2, 1, [holders[2]!]]);

  const inOrder: unknown[] = [];
  const fallenSoFar = new Set<string>();

  for (let frame = 0; frame < 80 && walkers.size + frames.size > 0; frame++) {
    runFrames(1);

    const fallen = fighters().filter(([id]) => id === 'battle-fallen');

    fallen.forEach(([, unit, count]) => fallenSoFar.add(`${unit}×${count}`));

    if (fallen.length > 0 && inOrder.length === 0) {
      inOrder.push(
        unitOn(2, 1),
        fallen.map(([, unit]) => unit)
      );
    }
  }

  inOrder.push([...fallenSoFar], unitOn(1, 1), unitOn(2, 1), unitOn(3, 1));
  repatched([1, 1, []], [3, 1, []], [2, 1, []]);

  // The same, but the second attacker attacks three times more elsewhere, its battles more than two seconds behind: its
  //  first, at the city, is over at once, and the walking one's there with it, blows in order, each defender falling
  //  once, unseen; the walking one walks on.
  const spares = [
    [3, 0],
    [3, 2],
    [2, 2],
  ].map(([x, y], n) => [x!, y!, unitOf(`Unit-P${n}`, 1)] as const);
  // And a third rival attacking the city after, in the same burst: fought on what's left there, not on those fallen
  //  already, whose patch hasn't come.
  const zed = unitOf('Unit-Z', 1, 'Player-2');

  repatched(
    [0, 1, [raider]],
    [1, 1, []],
    [3, 1, [otherRaider]],
    [2, 1, holders],
    [2, 0, [zed]],
    ...spares.map(([x, y, unit]): [number, number, Tile['units'][number][]] => [
      x,
      y,
      [unit],
    ])
  );
  walkersSet.length = 0;
  stepped(raider, [0, 1], [1, 1], 'Player-2');
  glider.queueTile(square(0, 1));
  glider.queueTile(square(1, 1));
  fought(raider, [1, 1], holders[0]!, [2, 1], 'attacker', rivals);
  glider.queueTile(square(1, 1));
  glider.queueTile(square(2, 1));
  fought(otherRaider, [3, 1], holders[1]!, [2, 1], 'attacker', rivals);
  glider.queueTile(square(3, 1));
  glider.queueTile(square(2, 1));
  spares.forEach(([x, y, unit]) => {
    fought(otherRaider, [3, 1], unit, [x, y], 'attacker', rivals);
    glider.queueTile(square(3, 1));
    glider.queueTile(square(x, y));
  });
  fought(zed, [2, 0], holders[2]!, [2, 1], 'attacker', rivals);
  glider.queueTile(square(2, 0));
  glider.queueTile(square(2, 1));
  burstThen(
    [0, 1, []],
    [1, 1, [raider]],
    [2, 1, []],
    ...spares.map(([x, y]): [number, number, Tile['units'][number][]] => [
      x,
      y,
      [],
    ])
  );
  runFrames(1);

  const cutInOrder: unknown[] = [unitOn(2, 1), [...walkers.keys()].map(kind)];
  const fallenAfterCut = new Set<string>();

  for (let frame = 0; frame < 120 && walkers.size + frames.size > 0; frame++) {
    runFrames(1);
    fighters()
      .filter(([id]) => id === 'battle-fallen')
      .forEach(([, unit, count]) => fallenAfterCut.add(`${unit}×${count}`));
  }

  cutInOrder.push(
    [...fallenAfterCut],
    unitOn(1, 1),
    unitOn(2, 1),
    walkers.size
  );
  repatched(
    [1, 1, []],
    [3, 1, []],
    [2, 1, []],
    [2, 0, []],
    ...spares.map(([x, y]): [number, number, Tile['units'][number][]] => [
      x,
      y,
      [],
    ])
  );

  expect(
    'a rival’s attack and its step onto the square it emptied, in one burst: the battle’s shown, and it’s on its new square once it’s over; one stepping out of the dark and attacking, or with others’ moves not shown, is drawn fighting once the page has it, not before; a walk-then-attack and a direct attack on one square fall together, each defender once, and so when the second’s battles are too far behind and over at once, a third attack after fought on what’s left',
    [movedIn, fromTheDark, movesHidden, frameFirst, inOrder, cutInOrder],
    [
      [
        [
          ['battle', 'Unit-X', 1, 1],
          ['battle-fallen', 'Unit-M', 1, 1],
        ],
        null,
        null,
        null,
        ['Unit-X', 1],
        0,
      ],
      [
        [['battle', 'Unit-X', 1, 1]],
        ['Unit-M', 1],
        [
          ['battle', 'Unit-X', 1, 1],
          ['battle-fallen', 'Unit-M', 1, 1],
        ],
        ['Unit-X', 1],
        null,
      ],
      [
        [['battle', 'Unit-X', 1, 1]],
        ['Unit-M', 1],
        [
          ['battle', 'Unit-X', 1, 1],
          ['battle-fallen', 'Unit-M', 1, 1],
        ],
        ['Unit-X', 1],
        null,
      ],
      [[], ['Unit-M', 1], [['battle', 'Unit-X', 1, 1]], ['Unit-M', 1]],
      [
        ['Unit-Q3', 1],
        ['Unit-Q1', 'Unit-Q2'],
        ['Unit-Q1×1', 'Unit-Q2×1'],
        ['Unit-X', 1],
        ['Unit-Q3', 1],
        ['Unit-Y', 1],
      ],
      [
        ['Unit-Q3', 1],
        ['walk', 'battle', 'battle'],
        ['Unit-P2×1', 'Unit-Q3×1'],
        ['Unit-X', 1],
        null,
        0,
      ],
    ]
  );

  // A counterattack on a unit still lunging in its own attack, as when the player ends the turn just after attacking:
  //  fought once its attack's over, the unit back on its square meanwhile. A unit arriving on a square shown as it was,
  //  as one built there, is drawn there at once. And a unit's battles falling more than two seconds behind are over at
  //  once, the last fought.
  repatched([1, 1, [walker]], [2, 1, [rivalMate]], [0, 1, [rival]]);
  walkersSet.length = 0;
  fought(walker, [1, 1], rivalMate, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);
  runFrames(3);
  fought(rival, [0, 1], walker, [1, 1], 'attacker', rivals);
  patch([0, 1, [rival]], [1, 1, []]);
  runFrames(1);

  const counterattacked: unknown[] = [unitOn(1, 1), fighters()];

  runFrames(50);
  counterattacked.push(unitOn(1, 1), fighters());
  runFrames(13);
  counterattacked.push(unitOn(1, 1), fighters());
  runFrames();
  counterattacked.push(unitOn(0, 1), unitOn(1, 1), walkers.size);
  repatched([0, 1, []]);

  const newcomer = unitOf('Unit-N2', 0);

  repatched([1, 1, [raider]], [2, 1, [mine]]);
  fought(raider, [1, 1], mine, [2, 1], 'defender', rivals);
  patch([1, 1, []], [2, 1, [mine, newcomer]]);
  runFrames(1);

  const arrived = [unitOn(2, 1)];

  runFrames();
  arrived.push(unitOn(2, 1));
  repatched([2, 1, []]);

  const foes = [1, 2, 3, 4].map((n) => unitOf(`Unit-F${n}`, 1, 'Player-2'));

  repatched([1, 1, [knight]], [2, 1, foes]);
  walkersSet.length = 0;
  foes.forEach((foe, n) => {
    fought(knight, [1, 1], foe, [2, 1], 'attacker');
    patch([1, 1, [knight]], [2, 1, foes.slice(n + 1)]);
  });
  runFrames(13);

  const farBehind: unknown[] = [fighters(), unitOn(2, 1)];

  runFrames();
  farBehind.push(unitOn(1, 1), unitOn(2, 1), walkers.size);
  repatched([1, 1, []]);

  expect(
    'a counterattack on a unit still lunging is fought once its attack’s over, the unit on its square meanwhile; a unit arriving on a square shown as it was is drawn there; a unit’s battles more than two seconds behind are over at once, the last fought',
    [counterattacked, arrived, farBehind],
    [
      [
        null,
        [
          ['battle', 'Unit-A', 1, 1],
          ['battle', 'Unit-R', 1, 1],
        ],
        ['Unit-A', 1],
        [['battle', 'Unit-R', 1, 1]],
        null,
        [
          ['battle', 'Unit-R', 1, 1],
          ['battle-fallen', 'Unit-A', 1, 0.9],
        ],
        ['Unit-R', 1],
        null,
        0,
      ],
      [
        ['Unit-M', 2],
        ['Unit-M', 2],
      ],
      [
        [
          ['battle', 'Unit-K', 1, 1],
          ['battle-fallen', 'Unit-F4', 1, 1],
        ],
        null,
        ['Unit-K', 1],
        null,
        0,
      ],
    ]
  );

  // Units arriving or leaving with no move fade in and out (§6.4, `fades.ts`): one disbanded, lost, or gone out of sight
  //  fades out where it stood, as it was; one built, or come into sight, fades in on its square. Never solid in two
  //  places at once.
  const solidTwice = () => {
      const onSquares = [...markers.entries()]
          .filter(([key]) => (markersFaded.get(key) ?? 1) >= 1)
          .map(([, marker]) => marker.unit?.id)
          .filter((id): id is string => id !== undefined),
        onWalkers = [...walkers.entries()]
          .filter(([id]) => (walkersFaded.get(id) ?? 1) >= 1)
          .map(([, marker]) => marker.unit?.id);

      return onWalkers.filter(
        (id): id is string => id !== undefined && onSquares.includes(id)
      );
    },
    // Frame by frame till it's all over: what fades on each square, out and in, and anything solid twice.
    fadesSeen = () => {
      const seen = { out: new Set<string>(), in: new Set<string>() },
        twice = new Set<string>(solidTwice());

      for (let frame = 0; frame < 60 && frames.size > 0; frame++) {
        runFrames(1);
        [...walkers.entries()]
          .filter(([id]) => kind(id) === 'fade')
          .forEach(([, marker]) => seen.out.add(marker.unit?.id ?? '?'));
        [...markersFaded.entries()]
          .filter(([, opacity]) => opacity < 1)
          .forEach(([key]) =>
            seen.in.add(`${key} ${markers.get(key)?.unit?.id}`)
          );
        solidTwice().forEach((id) => twice.add(id));
      }

      return {
        out: [...seen.out],
        in: [...seen.in],
        twice: [...twice],
        left: walkers.size,
      };
    },
    recruit = unitOf('Unit-J', 1),
    veteran = unitOf('Unit-V', 9);

  repatched([1, 1, [recruit]], [2, 1, []]);
  walkersSet.length = 0;
  markersFaded.clear();

  // Disbanded: it fades out where it stood. As the game sends it: the patch, then the next unit made active straight
  //  after, before a frame, which marks the squares again.
  glider.setActiveUnit(placed(recruit, 1, 1));
  runFrames();
  walkersSet.length = 0;
  patch([1, 1, []]);
  glider.setActiveUnit(null);
  runFrames(1);

  const disbanded: unknown[] = [unitOn(1, 1), fighters()];

  disbanded.push(fadesSeen());

  // Built, and made the active unit, as the game does: it fades in on its square.
  patch([1, 1, [recruit]]);
  glider.setActiveUnit(placed(recruit, 1, 1));
  runFrames(1);

  const built: unknown[] = [unitOn(1, 1), markersFaded.get('1,1')];

  built.push(fadesSeen(), markersFaded.get('1,1') ?? 1);
  glider.setActiveUnit(null);
  runFrames();

  // A stronger one built where it stands: on top at once, the one beneath staying; neither fades. That one beneath
  //  disbanded, unseen, goes unseen.
  patch([1, 1, [recruit, veteran]]);
  runFrames(1);

  const overIt: unknown[] = [unitOn(1, 1)];

  overIt.push(fadesSeen());
  patch([1, 1, [veteran]]);
  runFrames(1);
  overIt.push(unitOn(1, 1), fadesSeen());
  repatched([1, 1, []]);

  // One fading in that walks off, another come in its place in the same batch: the new one fades in, not cut solid as
  //  the first's fade ends.
  const newcomerHere = unitOf('Unit-K2', 1);

  patch([1, 1, [recruit]]);
  runFrames(2);
  stepped(recruit, [1, 1], [2, 1]);
  patch([1, 1, [newcomerHere]], [2, 1, [recruit]]);
  runFrames(1);

  const inItsPlace: unknown[] = [
    unitOn(1, 1),
    (markersFaded.get('1,1') ?? 1) < 0.1,
  ];

  runFrames();
  inItsPlace.push(markersFaded.get('1,1') ?? 1);
  repatched([1, 1, []], [2, 1, []]);

  expect(
    'a unit disbanded fades out where it stood, the next made active at once; one built and made active fades in, solid once it’s in; a stronger one built over another is on top at once, and one beneath going goes unseen; one fading in that walks off, another come in its place, the new one fades in; never solid in two places',
    [disbanded, built, overIt, inItsPlace],
    [
      [
        null,
        [['fade', 'Unit-J', 1, 1]],
        { out: ['Unit-J'], in: [], twice: [], left: 0 },
      ],
      [
        ['Unit-J', 1],
        0,
        { out: [], in: ['1,1 Unit-J'], twice: [], left: 0 },
        1,
      ],
      [
        ['Unit-V', 2],
        { out: [], in: [], twice: [], left: 0 },
        ['Unit-V', 1],
        { out: [], in: [], twice: [], left: 0 },
      ],
      [['Unit-K2', 1], true, 1],
    ]
  );

  // In a stack, the active unit disbanded, the next made active at once as the game does: the one shown, it fades out,
  //  ringed as it was. A lone Settlers founding a city fades out where it stood, not in front of the new city. Many
  //  coming and going as an observer's view changes, the world replaced: none fade.
  repatched([1, 1, [recruit, veteran]]);
  glider.setActiveUnit(placed(recruit, 1, 1));
  runFrames();
  walkersSet.length = 0;
  patch([1, 1, [veteran]]);
  glider.setActiveUnit(placed(veteran, 1, 1));
  runFrames(1);

  const stackDisbanded: unknown[] = [
    unitOn(1, 1),
    [...walkers.entries()]
      .filter(([id]) => kind(id) === 'fade')
      .map(([, marker]) => [marker.unit?.id, marker.unit?.active]),
  ];

  stackDisbanded.push(fadesSeen());
  glider.setActiveUnit(null);
  repatched([1, 1, []]);

  repatched([1, 1, [recruit]]);
  walkersPlaced.clear();
  square(1, 1).city = {
    id: 'City-F',
    name: 'Foundton',
    player: { civilization: { attributes: [] } },
    originalPlayer: { civilization: { _: 'Romans' } },
    growth: { size: 1 },
  } as unknown as Tile['city'];
  patch([1, 1, []]);
  runFrames(1);

  const [, , middleV] = groundAt(1, 1),
    founded = [...walkersPlaced.entries()]
      .filter(([id]) => kind(id) === 'fade')
      .map(([, placed]) => Math.abs(placed[0]![2]! - middleV!) < 0.05);

  runFrames();
  square(1, 1).city = null;
  repatched([1, 1, []]);

  repatched([1, 1, [recruit]]);
  glider.world.setTiles([...glider.world.tiles()], true);
  square(1, 1).units = [] as Tile['units'];
  square(2, 2).units = [veteran] as Tile['units'];
  tiles.forEach((tile) => glider.queueTile(tile as Tile));
  glider.releaseTiles();
  runFrames(1);

  const viewChanged = fadesSeen();

  repatched([2, 2, []]);

  // Hurt and gone in the same patch, the page filling the unit it holds in place: it fades out as it was drawn.
  const scratched = {
    ...unitOf('Unit-W', 1),
    hitPoints: { current: 10, max: 10 },
  } as Tile['units'][number] & { hitPoints: { current: number; max: number } };

  repatched([1, 1, [scratched]]);
  scratched.hitPoints.current = 5;
  patch([1, 1, []]);
  runFrames(1);

  const hurtAndGone = [...walkers.entries()]
    .filter(([id]) => kind(id) === 'fade')
    .map(([, marker]) => [marker.unit?.id, marker.unit?.health]);

  runFrames();

  // A rival gone into the fog, back within half a second over a stack-mate: its fade out's over, drawn where it's come.
  repatched([2, 1, [rival]], [3, 1, [rivalMate]]);
  patch([2, 1, []]);
  runFrames(3);

  const cameBack: unknown[] = [walkers.size];

  patch([3, 1, [rivalMate, rival]]);
  runFrames(1);
  cameBack.push(walkers.size, unitOn(3, 1));
  runFrames();
  repatched([3, 1, []]);

  // Walking, its walk ended by a key between its square's release and the frame: it's walked there, so doesn't fade in.
  repatched([1, 1, [walker]], [3, 3, [nextUnit]]);
  glider.setActiveUnit(placed(walker, 1, 1));
  runFrames();
  stepped(walker, [1, 1], [2, 1]);
  patch([1, 1, []], [2, 1, [walker]]);
  glider.setActiveUnit(placed(nextUnit, 3, 3));
  runFrames(3);
  patch([2, 1, [walker]]);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));

  const hurried = fadesSeen();

  glider.setActiveUnit(null);
  repatched([2, 1, []], [3, 3, []]);

  expect(
    'in a stack, the active unit disbanded fades out ringed, the next made active at once; a lone Settlers founding a city fades out where it stood; an observer’s change of view fades none; one hurt and gone in one patch fades as it was drawn; a rival back from the fog ends its fade out; a walk hurried between release and frame fades nothing in',
    [stackDisbanded, founded, viewChanged, hurtAndGone, cameBack, hurried],
    [
      [
        ['Unit-V', 1],
        [['Unit-J', true]],
        { out: ['Unit-J'], in: [], twice: [], left: 0 },
      ],
      [true],
      { out: [], in: [], twice: [], left: 0 },
      [['Unit-W', null]],
      [1, 0, ['Unit-R', 2]],
      { out: [], in: [], twice: [], left: 0 },
    ]
  );

  // A rival's step not shown (others' moves hidden), from one square to the next in one batch: on its new square at once,
  //  fading at neither. Into the fog, a square the player doesn't know: it fades out where it was. Out of the dark: it
  //  fades in where it's come, the view's frame before the world's rebuilt drawing nothing of it.
  optionsRegistry.set(MAP3D_RIVALS_WALK_OPTION, false);
  repatched([1, 1, [rival]]);
  walkersSet.length = 0;
  stepped(rival, [1, 1], [2, 1], 'Player-2');
  patch([1, 1, []], [2, 1, [rival]]);
  runFrames(1);

  const notWalked: unknown[] = [unitOn(2, 1)];

  notWalked.push(fadesSeen());
  optionsRegistry.set(MAP3D_RIVALS_WALK_OPTION, true);

  // Into the fog: the patch has its square empty, and nowhere it's gone.
  patch([2, 1, []]);
  runFrames(1);

  const intoTheFog: unknown[] = [unitOn(2, 1)];

  intoTheFog.push(fadesSeen());

  // Out of the dark, as a rival's turn sends it: its step, a frame, then the world rebuilt.
  stepped(rival, [3, 3], [2, 1], 'Player-2');
  glider.queueTile(square(2, 1));
  runFrames(1);

  const outOfTheDarkFade: unknown[] = [unitOn(2, 1), markersFaded.get('2,1')];

  burstThen([2, 1, [rival]]);
  runFrames(1);
  outOfTheDarkFade.push(unitOn(2, 1), markersFaded.get('2,1'));
  outOfTheDarkFade.push(fadesSeen());
  repatched([2, 1, []]);

  expect(
    'a rival’s step not shown fades at neither square; one gone into the fog fades out where it was; one out of the dark fades in where it’s come, once the world has it',
    [notWalked, intoTheFog, outOfTheDarkFade],
    [
      [['Unit-R', 1], { out: [], in: [], twice: [], left: 0 }],
      [null, { out: ['Unit-R'], in: [], twice: [], left: 0 }],
      [
        null,
        undefined,
        ['Unit-R', 1],
        0,
        { out: [], in: ['2,1 Unit-R'], twice: [], left: 0 },
      ],
    ]
  );

  // A stack killed fades once, as what fell in the battle, not again as gone. Its patch held past the blow, as meeting a
  //  leader holds it, the rest of the stack stays till the patch comes: then it fades out.
  repatched([1, 1, [walker]], [2, 1, [rival, rivalMate]]);
  walkersSet.length = 0;
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  patch([1, 1, [walker]], [2, 1, []]);

  const stackKilled = fadesSeen();

  repatched([1, 1, [walker]], [2, 1, [rival, rivalMate]]);
  walkersSet.length = 0;
  fought(walker, [1, 1], rival, [2, 1], 'attacker');
  runFrames();

  const heldStack: unknown[] = [unitOn(2, 1)];

  patch([1, 1, [walker]], [2, 1, []]);
  runFrames(1);
  heldStack.push(unitOn(2, 1), fadesSeen());
  repatched([1, 1, []]);

  expect(
    'a stack killed fades once, as what fell; its patch held past the blow, the rest of the stack fades out when the patch comes',
    [stackKilled, heldStack],
    [
      { out: [], in: [], twice: [], left: 0 },
      [['Unit-T', 1], null, { out: ['Unit-T'], in: [], twice: [], left: 0 }],
    ]
  );

  // A unit fading in that steps at once, as one built and moved: its fade's over, and it walks from its square. Moving
  //  at once chosen mid-fade, or less motion asked for, ends every fade on the next frame. In a tab out of sight, the
  //  first frame drawn again ends them. Many coming and going at once, as a turn handed over sends, come and go at once.
  repatched([1, 1, []]);
  patch([1, 1, [recruit]]);
  runFrames(2);
  stepped(recruit, [1, 1], [2, 1]);
  patch([1, 1, []], [2, 1, [recruit]]);
  runFrames(1);

  const steppedIn: unknown[] = [
    markersFaded.get('1,1') ?? 1,
    [...walkers.keys()].map(kind),
  ];

  steppedIn.push(fadesSeen());
  repatched([2, 1, []]);

  patch([1, 1, [recruit]]);
  runFrames(2);
  optionsRegistry.set(MAP3D_WALKS_OPTION, 'off');
  runFrames(1);

  const offMidFade = [markersFaded.get('1,1') ?? 1, frames.size];

  optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');
  repatched([1, 1, []]);
  walkersSet.length = 0;

  patch([1, 1, [recruit]]);
  runFrames(1);
  now += 5000;
  runFrames(1);

  const outOfSightFade = [
    markersFaded.get('1,1') ?? 1,
    drawnWalkers().ids,
    frames.size,
  ];

  repatched([1, 1, []]);

  const crowdOf = (name: string) =>
      [0, 1, 2, 3].flatMap((x) =>
        [0, 1, 2].map(
          (y) => [x, y, [unitOf(`Unit-${name}${x}${y}`, 1)]] as const
        )
      ),
    firstCrowd = crowdOf('C'),
    crowd = crowdOf('D');

  repatched(
    ...firstCrowd.map(
      ([x, y, units]): [number, number, Tile['units'][number][]] => [
        x,
        y,
        [...units],
      ]
    )
  );
  // Each replaced by another: one going and one coming on every square.
  patch(
    ...crowd.map(([x, y, units]): [number, number, Tile['units'][number][]] => [
      x,
      y,
      [...units],
    ])
  );
  runFrames(1);

  const crowded = fadesSeen();

  repatched(
    ...crowd.map(([x, y]): [number, number, Tile['units'][number][]] => [
      x,
      y,
      [],
    ])
  );

  // As many arriving on empty squares, as a stretch of the map coming into sight sends: they come at once.
  patch(
    ...crowd.map(([x, y, units]): [number, number, Tile['units'][number][]] => [
      x,
      y,
      [...units],
    ])
  );
  runFrames(1);

  const crowdArrived: unknown[] = [unitOn(1, 1)];

  crowdArrived.push(fadesSeen());

  repatched(
    ...crowd.map(([x, y]): [number, number, Tile['units'][number][]] => [
      x,
      y,
      [],
    ])
  );

  // One arriving off the screen, the camera close in elsewhere: it doesn't fade in.
  const lookedFromHere = glider.orbit();

  glider.setOrbit({
    ...lookedFromHere,
    focus: middleOf(tiles[0] as Tile),
    distance: 0,
  });
  runFrames();
  patch([3, 2, [recruit]]);
  runFrames(1);

  const arrivedOffScreen: unknown[] = [unitOn(3, 2)];

  arrivedOffScreen.push(fadesSeen());

  glider.setOrbit(lookedFromHere);
  runFrames();
  repatched([3, 2, []]);

  // A rival gone into the fog, back within half a second on an empty square: its fade out's over, and it's there at
  //  once, not fading in, as it was being drawn.
  repatched([2, 1, [rival]]);
  patch([2, 1, []]);
  runFrames(3);
  patch([3, 1, [rival]]);
  runFrames(1);

  const backOnEmpty: unknown[] = [unitOn(3, 1)];

  backOnEmpty.push(fadesSeen());
  repatched([3, 1, []]);

  // A stack gone into the fog, the one beneath back alone: it wasn't drawn, so it fades in.
  repatched([2, 1, [rival, rivalMate]]);
  patch([2, 1, []]);
  runFrames(3);
  patch([3, 1, [rivalMate]]);
  runFrames(1);
  backOnEmpty.push(unitOn(3, 1), (markersFaded.get('3,1') ?? 1) < 1);
  runFrames();

  repatched([3, 1, []]);

  expect(
    'a unit fading in that steps at once walks, its fade over; moving at once chosen mid-fade ends it; a tab out of sight ends it on the first frame; many going, or many arriving, at once come and go at once; one arriving off the screen, or back from the fog onto an empty square, doesn’t fade in',
    [
      steppedIn,
      offMidFade,
      outOfSightFade,
      crowded,
      crowdArrived,
      arrivedOffScreen,
      backOnEmpty,
    ],
    [
      [1, ['walk'], { out: [], in: [], twice: [], left: 0 }],
      [1, 0],
      [1, [], 0],
      { out: [], in: [], twice: [], left: 0 },
      [['Unit-D11', 1], { out: [], in: [], twice: [], left: 0 }],
      [['Unit-J', 1], { out: [], in: [], twice: [], left: 0 }],
      [
        ['Unit-R', 1],
        { out: [], in: [], twice: [], left: 0 },
        ['Unit-T', 1],
        true,
      ],
    ]
  );

  // With units hidden (`t`), nothing fades, and hiding them mid-fade ends it. Walking quickly, a fade takes half as long.
  //  One fading out faces the way it last went. A view not yet drawn takes its first tiles as they are, fading nothing.
  glider.toggleUnits();
  walkersSet.length = 0;
  patch([1, 1, [recruit]]);
  runFrames(1);

  const hiddenFade: unknown[] = [
    markersFaded.get('1,1') ?? 1,
    drawnWalkers().ids,
  ];

  glider.toggleUnits();
  repatched([1, 1, [recruit]]);
  patch([1, 1, []]);
  runFrames(2);
  hiddenFade.push(walkers.size);
  glider.toggleUnits();
  runFrames(1);
  hiddenFade.push(walkers.size);
  // Shown again within the half-second: it's over, not drawn again.
  glider.toggleUnits();
  runFrames(1);
  hiddenFade.push(walkers.size);
  runFrames();

  // The active unit's ghost is drawn with units hidden, as the active unit is: it fades on.
  repatched([1, 1, [recruit]]);
  glider.setActiveUnit(placed(recruit, 1, 1));
  runFrames();
  patch([1, 1, []]);
  glider.setActiveUnit(null);
  runFrames(1);
  glider.toggleUnits();
  runFrames(1);
  hiddenFade.push(walkers.size);
  glider.toggleUnits();
  runFrames();

  const fadeFrames = (speed: string) => {
    optionsRegistry.set(MAP3D_WALKS_OPTION, speed);
    repatched([1, 1, [recruit]]);
    patch([1, 1, []]);

    let count = 0;

    for (; count < 60 && runFrames(1) > 0 && walkers.size > 0; count++);

    optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal');
    runFrames();

    return count;
  };

  const normalFade = fadeFrames('normal'),
    quickFade = fadeFrames('fast');

  repatched([0, 1, [recruit]]);
  stepped(recruit, [0, 1], [1, 1]);
  repatched([0, 1, []], [1, 1, [recruit]]);
  walkersPlaced.clear();
  patch([1, 1, []]);
  runFrames(2);

  const facedAway = [...walkersPlaced.entries()]
    .filter(([id]) => kind(id) === 'fade')
    .map(([, placed]) => Math.round(placed[0]![3]! * 100) / 100);

  runFrames();

  const undrawn = makeMapView(deps2D) as MapView3D;

  (tiles[1 * 4 + 2] as Tile).units = [recruit] as Tile['units'];
  undrawn.queueTile(tiles[1 * 4 + 2] as Tile);
  undrawn.releaseTiles();
  markersFaded.clear();
  walkersSet.length = 0;
  runFrames(1);

  const firstTaken = [markersFaded.get('2,1') ?? 1, drawnWalkers().ids];

  undrawn.dispose();
  (tiles[1 * 4 + 2] as Tile).units = [] as Tile['units'];
  // What it marked on the stage the tests share, let go of.
  markers.delete('2,1');
  markedAt.delete('2,1');
  runFrames();

  expect(
    'with units hidden nothing fades, and hiding them mid-fade ends it; walking quickly, a fade takes half as long; one fading out faces the way it last went; a view not yet drawn fades nothing',
    [
      hiddenFade,
      quickFade < normalFade * 0.7 && quickFade > 5,
      facedAway,
      firstTaken,
    ],
    [[1, [], 1, 0, 0, 1], true, [1.57], [1, []]]
  );

  // Units idle (plan 2.2) near the camera, close in: each whole frame asks the stage to pose those on the squares near
  //  its focus and on the screen, by the clock. While it says some idle, frames go on for them, about 30 a second, each
  //  only posing and drawing them, the camera not looked through again; one asked for meanwhile is drawn whole, at
  //  once. Once none idle, the frames stop.
  repatched([1, 1, [walker]], [2, 1, [guard]]);
  glider.setOrbit({
    ...glider.orbit(),
    focus: middleOf(tiles[1 * 4 + 1] as Tile),
    distance: 5,
  });
  runFrames();
  idleAsked.length = 0;
  idleSays.idling = true;
  glider.portal.render();
  runFrames(1);

  const idleStarted = now,
    firstIdle = idleAsked.splice(0),
    // Each whole frame looks through the camera.
    wholeBefore = seenDown.length,
    // Each 60th of a second, ten of them: whether a frame was drawn, and whether the stage was asked to pose them.
    idleFrames: [boolean, boolean][] = [],
    idleTimes: number[] = [];

  staged.length = 0;

  for (let frame = 0; frame < 10; frame++) {
    runFrames(1);

    const asked = idleAsked.splice(0);

    idleFrames.push([staged.splice(0).includes('render'), asked.length > 0]);
    asked.forEach(([, seconds]) =>
      idleTimes.push(Math.round((seconds * 1000 - idleStarted) / 16))
    );
  }

  const wholeWhileIdling = seenDown.length - wholeBefore;

  // A 60th of a second after one drawn for them, none's drawn; asked for, one's drawn whole.
  runFrames(1);

  const between = staged.splice(0).includes('render');

  runFrames(1);
  staged.length = 0;
  glider.portal.render();
  runFrames(1);

  const askedWhole = [
    staged.splice(0).includes('render'),
    seenDown.length - wholeBefore,
  ];

  idleSays.idling = false;

  const framesAfter = runFrames();

  expect(
    'units near the camera idle: the stage’s asked to pose them by the clock; while some idle, frames go on for them alone, about 30 a second, the camera not looked through again; one asked for meanwhile is drawn whole at once; once none idle, the frames stop',
    [
      firstIdle,
      idleFrames,
      idleTimes,
      wholeWhileIdling,
      between,
      askedWhole,
      framesAfter <= 2,
      frames.size,
    ],
    [
      [[['1,1', '2,1'], idleStarted / 1000]],
      [
        [false, false],
        [true, true],
        [false, false],
        [true, true],
        [false, false],
        [true, true],
        [false, false],
        [true, true],
        [false, false],
        [true, true],
      ],
      [2, 4, 6, 8, 10],
      0,
      false,
      [true, 1],
      true,
      0,
    ]
  );

  // None idle where the player has asked for less motion, nor with units' moves not shown: the stage's asked to pose
  //  none, and the frames stop, whether that's so from the start or comes once they're going. Drawn back, none start,
  //  and those idling stop once it's drawn back further.
  const idleUnder = (
    change: () => void,
    undo: () => void,
    going: boolean
  ): [string[], boolean] => {
    idleSays.idling = true;

    if (!going) {
      change();
    }

    idleAsked.length = 0;
    glider.portal.render();
    runFrames(3);

    if (going) {
      change();
      idleAsked.length = 0;
    }

    const stopped = runFrames(10) <= 2,
      asked = idleAsked.splice(0).at(-1)?.[0] ?? ['none asked'];

    undo();
    idleSays.idling = false;
    runFrames();
    idleAsked.length = 0;

    return [asked, stopped];
  };

  const reduceMotion = (): void =>
      void Object.assign(window, {
        matchMedia: (query: string) => ({ matches: query.includes('reduce') }),
      }),
    allowMotion = (): void =>
      void delete (window as { matchMedia?: unknown }).matchMedia,
    movesOff = (): void => optionsRegistry.set(MAP3D_WALKS_OPTION, 'off'),
    movesOn = (): void => optionsRegistry.set(MAP3D_WALKS_OPTION, 'normal'),
    zoomTo = (distance: number) => (): void =>
      glider.setOrbit({ ...glider.orbit(), distance });

  expect(
    'none idle with motion reduced, nor with units’ moves not shown, and the frames stop; drawn back, none start, and those idling stop once it’s drawn back further',
    [
      idleUnder(reduceMotion, allowMotion, false),
      idleUnder(reduceMotion, allowMotion, true),
      idleUnder(movesOff, movesOn, false),
      idleUnder(movesOff, movesOn, true),
      idleUnder(zoomTo(13), zoomTo(5), false),
      idleUnder(zoomTo(13), zoomTo(5), true),
      idleUnder(zoomTo(15), zoomTo(5), true),
    ],
    [
      [[], true],
      [[], true],
      [[], true],
      [[], true],
      [[], true],
      [['1,1', '2,1'], false],
      [[], true],
    ]
  );

  // Asked, but none idling (their models have no idle clip, say), none go on further: drawn back to 13, none are asked.
  // A unit leaving its square isn't asked again. Taken down with a frame for them to come, the frame's given up.
  idleSays.idling = false;
  glider.portal.render();
  runFrames();
  zoomTo(13)();
  runFrames();

  const noneGoOn = idleAsked.splice(0).at(-1)?.[0];

  zoomTo(5)();
  idleSays.idling = true;
  repatched([2, 1, []]);

  const leftSquare = idleAsked.splice(0).at(-1)?.[0];

  idleSays.idling = false;
  runFrames();
  repatched([2, 1, [guard]]);

  const idleTakenDown = makeMapView(deps2D) as MapView3D;

  idleSays.idling = true;
  idleTakenDown.setOrbit({
    ...idleTakenDown.orbit(),
    focus: middleOf(tiles[1 * 4 + 1] as Tile),
    distance: 5,
  });
  runFrames(4);

  const pendingBefore = frames.size;

  idleTakenDown.dispose();
  staged.length = 0;

  const framesAfterDown = runFrames();

  idleSays.idling = false;

  expect(
    'asked but none idling, none go on further; a unit that’s left its square isn’t asked; taken down with a frame for its units to come, it’s given up',
    [
      noneGoOn,
      leftSquare,
      pendingBefore,
      framesAfterDown,
      staged.includes('render'),
    ],
    [[], ['1,1'], 1, 0, false]
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

  // The interface's banners (docs/3d-renderer.md §7.5): each city's painted alone by the page as its square's marked,
  //  laid out at the 2D art's scale, as dense as the 2D map shows it on this screen, and drawn below its square on a
  //  canvas over the map's, where `banners.ts` places it, with no name over the city then; the name back where the
  //  page paints none. None with the units hidden (`t`), nor with the yields shown where they give way to them. All
  //  painted again as the theme or fonts change, other art is chosen, its zoom changes or the screen's pixels do; and
  //  the canvas, and what tells of those, let go with the map.
  {
    const painted: string[] = [],
      restyles = new Set<() => void>(),
      // Each image drawn on the banners' canvas, where, and how solid.
      drawn: [unknown, number, number, number][] = [],
      // The cities whose banners can't be painted, as on a browser short of what the interface draws with.
      throwing = new Set<string>(),
      // Who's told of the page's art changing.
      artListeners = new Set<() => void>(),
      // Each city's its own, so Ur's can be told from the other cities' on the world.
      images = new Map<string, CanvasImageSource>(),
      imageOf = (name: string): CanvasImageSource => {
        const image =
          images.get(name) ??
          ({ banner: name } as unknown as CanvasImageSource);

        images.set(name, image);

        return image;
      },
      // The art, which can change under the map: chosen mid-game, or its zoom changed in Options.
      art = { id: 'set-1', zoom: given!.art.zoom() };
    let paints = true;

    const cityBanners = {
        paint: (tile: Tile, density: number) => {
          painted.push(
            `${tile.city?.name} ${tile.city?.growth.size} ×${density}`
          );

          if (throwing.has(tile.city?.name ?? '')) {
            throw new Error('roundRect is not a function');
          }

          return paints
            ? {
                image: imageOf(tile.city?.name ?? ''),
                width: 60,
                height: 12,
                centre: 25,
              }
            : null;
        },
        // What its banner says: here, its name and size, which the checks change.
        key: (tile: Tile) => `${tile.city?.name} ${tile.city?.growth.size}`,
        giveWayToYields: true,
        restyled: (changed: () => void): (() => void) => {
          restyles.add(changed);

          return (): void => void restyles.delete(changed);
        },
      },
      bannered = new MapView3D(
        {
          ...given!,
          art: {
            ...given!.art,
            id: () => art.id,
            zoom: () => art.zoom,
            scale: () => Math.ceil(art.zoom),
          },
          artChanged: (changed: () => void): (() => void) => {
            artListeners.add(changed);

            return (): void => void artListeners.delete(changed);
          },
          cityBanners,
        },
        fakeStage
      ),
      overlay = mapCanvas.nextElementSibling as HTMLCanvasElement,
      site = tiles[1 * width + 1] as Tile,
      key = `${site.x},${site.y}`,
      // As many of the screen's pixels to each of the 2D map's as it shows them: drawn at the whole scale at or above
      //  its zoom, and shown at the zoom.
      density = (ratio = 1) => (ratio * art.zoom) / Math.ceil(art.zoom),
      patch = (city: object | null): void => {
        Object.assign(site, { city, units: [] });
        bannered.queueTile(site);
        bannered.releaseTiles();
        bannered.flush();
      },
      ur = (size: number) => ({
        name: 'Ur',
        growth: { size },
        player: owner,
        originalPlayer: { civilization: { _: 'Sumerians' } },
        walled: false,
        civilDisorderDeclared: false,
      }),
      // Ur's banner, where it's drawn now.
      urs = () => drawn.filter(([what]) => what === imageOf('Ur')),
      // What's drawn after a frame: the canvas cleared, as each frame clears it, and Ur's banner drawn again.
      shown = () => {
        bannered.flush();

        return urs().length;
      },
      // What was painted for Ur since `from`, once each.
      paintedFor = (from: number) => [
        ...new Set(painted.slice(from).filter((what) => what.startsWith('Ur'))),
      ],
      // Where Ur's banner should be drawn at each copy, on a canvas with `ratio` of its pixels to each of the page's,
      //  as `banners.ts` places it for the camera as the stage was last told it, a step down from the square.
      expectedAt = (ratio: number) => {
        const [u, v] = bannered.land().layout.centre(site.x, site.y),
          up = Math.max(0, bannered.land().surfaceAt(u, v)),
          gap = Math.round(Math.ceil(art.zoom) * density(ratio));

        return bannerPlaces(
          [
            {
              key,
              centre: [u, up, v],
              outline: bannered
                .land()
                .layout.outline(site.x, site.y)
                .map(
                  ([ou, ov]) =>
                    [
                      ou,
                      Math.max(0, bannered.land().surfaceAt(ou, ov)),
                      ov,
                    ] as const
                ),
            },
          ],
          {
            orbit: bannered.orbit(),
            look: lookedAt[2]!,
            width: box.width,
            height: box.height,
            period: bannered.land().layout.period(),
            reach: 60,
          }
        ).map(({ x, y, clear }) => [
          Math.round(x * ratio - 25),
          Math.round(y * ratio) + gap,
          clear,
        ]);
      },
      drawnAt = () => urs().map(([, x, y, alpha]) => [x, y, alpha]);

    const context2d = {
      globalAlpha: 1,
      // How many times it's been cleared.
      clears: 0,
      clearRect: () => {
        drawn.length = 0;
        context2d.clears++;
      },
      drawImage: (what: unknown, x: number, y: number) =>
        void drawn.push([what, x, y, context2d.globalAlpha]),
    };

    Object.assign(overlay, { getContext: () => context2d });
    bannered.setOrbit({
      ...bannered.orbit(),
      focus: bannered.land().layout.centre(site.x, site.y),
      distance: DISTANCE_MIN,
    });
    patch(ur(2));

    expect(
      'a city’s banner is painted by the page as its square’s marked, as dense as the 2D map shows it, on a canvas after the map’s, with clicks going through',
      [
        paintedFor(0),
        overlay.className,
        overlay.style.pointerEvents,
        overlay.previousElementSibling === mapCanvas,
      ],
      [[`Ur 2 ×${density()}`], 'map3d-banners', 'none', true]
    );
    expect(
      'and drawn where `banners.ts` places it at each copy in sight, a step down from its square, there being no name over the city',
      [drawnAt().length > 0, drawnAt(), markers.get(key)?.city?.unnamed],
      [true, expectedAt(1), true]
    );

    const before = painted.length;

    patch(ur(3));
    paints = false;
    patch(ur(4));

    expect(
      'painted again as it changes; and where the page paints none, its name is over it again, and nothing’s drawn',
      [paintedFor(before), markers.get(key)?.city?.unnamed, shown()],
      [[`Ur 3 ×${density()}`, `Ur 4 ×${density()}`], undefined, 0]
    );

    // As the theme changes back to one with banners: each painted again.
    paints = true;
    restyles.forEach((changed) => changed());
    bannered.toggleUnits();

    const hidden = shown(),
      // A frame more with none to draw: the canvas, cleared already, left as it is.
      clearsBefore = context2d.clears;

    shown();

    const idleClears = context2d.clears - clearsBefore;

    bannered.toggleUnits();

    const back = shown();

    bannered.toggleYields();

    const withYields = shown();

    bannered.toggleYields();

    expect(
      'none with the units hidden, nor with the yields shown, as they give way to them, the canvas not cleared again with none on it; and back after',
      [hidden, idleClears, back > 0, withYields, shown() > 0],
      [0, 0, true, 0, true]
    );

    const restyledFrom = painted.length;

    restyles.forEach((changed) => changed());

    expect(
      'painted again as the theme or the fonts loaded change',
      paintedFor(restyledFrom),
      [`Ur 4 ×${density()}`]
    );

    // Other art chosen mid-game, and the zoom changed in Options, though nothing's marked: each paints them all again,
    //  at the next frame, before they're drawn.
    const artFrom = painted.length,
      firstDensity = density();

    art.id = 'set-2';
    shown();

    const forArt = paintedFor(artFrom),
      zoomFrom = painted.length;

    art.zoom = 1.5;
    shown();

    expect(
      'painted again for other art chosen, and for its zoom changed, as dense as the 2D map shows it at that zoom, and drawn where they hang',
      [forArt, paintedFor(zoomFrom), drawnAt()],
      [[`Ur 4 ×${firstDensity}`], [`Ur 4 ×${density()}`], expectedAt(1)]
    );

    // The land under it raised: drawn where it hangs over the land as it is now. And worked out once: a frame with
    //  nothing changed doesn't measure the land under it again.
    Object.assign(site, { terrain: { _: 'Mountains', features: [] } });
    patch(ur(4));

    const raised = drawnAt(),
      land = bannered.land(),
      measure = land.surfaceAt.bind(land);
    let measured = 0;

    land.surfaceAt = (...args: Parameters<typeof land.surfaceAt>) => {
      measured++;

      return measure(...args);
    };
    shown();
    delete (land as { surfaceAt?: unknown }).surfaceAt;

    expect(
      'the land under a city raised, its banner hangs from the land as it is now; and a frame with nothing changed measures the land under none',
      [raised, measured],
      [expectedAt(1), 0]
    );

    // The window moved to a screen with twice the pixels: the canvas as many again, drawn on at once as sizing it
    //  cleared it, the banners painted again twice as dense, as sharp as the map, and drawn where they were on the
    //  page. The pixels told of before the canvas is sized for them aren't painted at.
    const ratioFrom = painted.length;

    (window as unknown as { devicePixelRatio: number }).devicePixelRatio = 2;
    window.dispatchEvent(new Event('resize'));

    const onResize = drawnAt();

    shown();

    const resized = [paintedFor(ratioFrom), drawnAt()],
      untoldFrom = painted.length;

    (window as unknown as { devicePixelRatio: number }).devicePixelRatio = 3;
    shown();

    expect(
      'on a screen with twice the pixels, the canvas has twice as many and is drawn on as it’s sized, the banners are painted again twice as dense, and drawn at the same places on the page; till it’s sized again, at the same density',
      [
        overlay.width,
        overlay.style.width,
        onResize,
        resized,
        paintedFor(untoldFrom),
      ],
      [
        box.width * 2,
        `${box.width}px`,
        expectedAt(2),
        [[`Ur 4 ×${density(2)}`], expectedAt(2)],
        [],
      ]
    );

    delete (window as unknown as { devicePixelRatio?: number })
      .devicePixelRatio;
    window.dispatchEvent(new Event('resize'));
    shown();

    // Marked again with nothing changed: not painted again.
    const unchangedFrom = painted.length;

    patch(ur(4));

    const unchanged = paintedFor(unchangedFrom);

    // The land beside it raised: its outline's corners with it.
    const beside = tiles[1 * width + 2] as Tile;

    Object.assign(beside, { terrain: { _: 'Mountains', features: [] } });
    bannered.queueTile(beside);
    bannered.releaseTiles();
    bannered.flush();

    expect(
      'marked again with nothing changed, not painted again; the land beside it raised, it hangs from its square as the land is now; faded as far into the haze as it is',
      [unchanged, drawnAt()],
      [[], expectedAt(1)]
    );

    // Where the banners don't give way to the yields, drawn with them.
    cityBanners.giveWayToYields = false;
    bannered.toggleYields();

    const besideYields = shown();

    bannered.toggleYields();
    cityBanners.giveWayToYields = true;

    // The page's art loaded again, and the zoom changed in Options: each painting them again at once.
    const loadedFrom = painted.length;

    artListeners.forEach((changed) => changed());

    const loaded = paintedFor(loadedFrom),
      zoomedFrom = painted.length;

    art.zoom = 2;
    bannered.portal.setZoom();

    expect(
      'drawn with the yields where they don’t give way to them; painted again as the page’s art is loaded again, and as the zoom’s changed in Options, at once',
      [besideYields > 0, loaded, paintedFor(zoomedFrom)],
      [true, [`Ur 4 ×${(1 * 1.5) / 2}`], [`Ur 4 ×${density()}`]]
    );

    // A banner that can't be painted (a browser short of what the interface draws with): its city named over it, the
    //  others painted as ever, the squares released with it all marked, and said once.
    const bad = tiles[2 * width + 2] as Tile,
      good = tiles[2 * width + 3] as Tile,
      errors: unknown[] = [],
      log = console.error;

    console.error = (error: unknown) => void errors.push(error);
    throwing.add('Bad');
    Object.assign(bad, { city: { ...ur(2), name: 'Bad' }, units: [] });
    Object.assign(good, { city: { ...ur(2), name: 'Good' }, units: [] });
    bannered.queueTile(bad);
    bannered.queueTile(good);

    let failed = false;

    try {
      bannered.releaseTiles();
      bannered.flush();
      Object.assign(bad, { city: { ...ur(3), name: 'Bad' } });
      bannered.queueTile(bad);
      bannered.releaseTiles();
      bannered.flush();
      // Marked again, unchanged: not tried again.
      bannered.queueTile(bad);
      bannered.releaseTiles();
      bannered.flush();
    } catch {
      failed = true;
    }

    console.error = log;

    const triedForBad = painted.filter((what) => what.startsWith('Bad'));

    expect(
      'a banner that can’t be painted leaves its city named, the others painted and marked as ever, and is said once; tried again only as its city changes',
      [
        failed,
        markers.get(`${bad.x},${bad.y}`)?.city?.name,
        markers.get(`${bad.x},${bad.y}`)?.city?.unnamed,
        markers.get(`${good.x},${good.y}`)?.city?.unnamed,
        errors.length,
        triedForBad,
      ],
      [
        false,
        'Bad',
        undefined,
        true,
        1,
        [`Bad 2 ×${density()}`, `Bad 3 ×${density()}`],
      ]
    );

    Object.assign(bad, { city: null });
    Object.assign(good, { city: null });
    bannered.queueTile(bad);
    bannered.queueTile(good);
    bannered.releaseTiles();
    bannered.flush();
    patch(null);

    expect('a city gone, its banner goes', shown(), 0);

    bannered.dispose();

    expect(
      'taken down, the canvas goes, and nothing tells it of the theme',
      [overlay.isConnected, restyles.size],
      [false, 0]
    );
  }

  // Clicks and the mouse resting on a city's banner (docs/3d-renderer.md §7.5), as on the 2D map: a click on one is for
  //  its city as well as the square under it, and its tooltip opens over the banner, about its city's square; of
  //  banners that overlap, the one drawn on top takes them. None for a banner more than half faded into the haze, which
  //  lets them through to the land as faded as it is, nor with the units hidden, nor once its city has gone; and a
  //  square being chosen takes the click as ever. On a canvas of its own, away from the page's corner.
  {
    const corner = { left: 30, top: 40 },
      holder = document.createElement('div'),
      own = document.createElement('canvas'),
      // Each click, as the page was told it: the square under it, and the city whose banner it was on.
      clicks: [string | null, string | null][] = [],
      // Each tooltip opened, about which square and over where on the page, and closed.
      tips: string[] = [],
      // Each image drawn on the banners' canvas, where, and how solid.
      drawn: [unknown, number, number, number][] = [],
      // How tall each city's banner is, in the 2D map's px, as painted: Ur's reaches down over the banner below it.
      tall = new Map<string, number>([['Ur', 600]]),
      images = new Map<string, CanvasImageSource>(),
      // How big each city's banner was last painted, in the canvas's px.
      sizes = new Map<unknown, { width: number; height: number }>(),
      // What's told of the theme or the fonts changing.
      restyles = new Set<() => void>(),
      imageOf = (name: string): CanvasImageSource => {
        const image =
          images.get(name) ??
          ({ banner: name } as unknown as CanvasImageSource);

        images.set(name, image);

        return image;
      },
      context2d = {
        globalAlpha: 1,
        clearRect: () => void (drawn.length = 0),
        drawImage: (what: unknown, x: number, y: number) =>
          void drawn.push([what, x, y, context2d.globalAlpha]),
      };

    holder.append(own);
    document.body.append(holder);
    Object.defineProperties(holder, {
      offsetWidth: { get: () => box.width },
      offsetHeight: { get: () => box.height },
    });
    Object.defineProperties(own, {
      setPointerCapture: { value: () => {}, configurable: true },
      clientWidth: { get: () => box.width, configurable: true },
      clientHeight: { get: () => box.height, configurable: true },
      getBoundingClientRect: {
        value: () => ({
          ...corner,
          right: corner.left + box.width,
          bottom: corner.top + box.height,
        }),
        configurable: true,
      },
    });

    const view = new MapView3D(
        {
          ...given!,
          // So a banner can hang past the pole the camera stops at.
          lockVerticalEdges: true,
          mapCanvas: own,
          cityBanners: {
            paint: (tile: Tile, density: number) => {
              const name = tile.city!.name,
                image = imageOf(name),
                size = {
                  width: Math.ceil(60 * density),
                  height: Math.ceil((tall.get(name) ?? 12) * density),
                };

              sizes.set(image, size);

              return { image, ...size, centre: 30 * density };
            },
            key: (tile: Tile) =>
              `${tile.city?.name} ${tall.get(tile.city?.name ?? '') ?? 12}`,
            giveWayToYields: true,
            restyled: (changed: () => void) => {
              restyles.add(changed);

              return (): void => void restyles.delete(changed);
            },
          },
          squares: {
            ...given!.squares,
            click: (_portal, tile, bannerCity) =>
              void clicks.push([
                tile && `${tile.x},${tile.y}`,
                bannerCity?.name ?? null,
              ]),
            prompt: () => ({ close: () => {} }),
            menuOpen: () => false,
            tooltip: (_over, tile, _playerId, { left, top, bottom }) => {
              tips.push(`open ${tile.x},${tile.y} ${left} ${top} ${bottom}`);

              return true;
            },
            endTooltip: () => void tips.push('closed'),
          },
        },
        fakeStage
      ),
      overlay = own.nextElementSibling as HTMLCanvasElement,
      ur = tiles[1 * width + 1] as Tile,
      kish = tiles[2 * width + 1] as Tile,
      city = (name: string) => ({
        name,
        growth: { size: 2 },
        player: owner,
        originalPlayer: { civilization: { _: 'Sumerians' } },
        walled: false,
        civilDisorderDeclared: false,
      }),
      patch = (...squares: [Tile, string | null][]): void => {
        squares.forEach(([tile, name]) =>
          Object.assign(tile, { city: name && city(name), units: [] })
        );
        squares.forEach(([tile]) => view.queueTile(tile));
        view.releaseTiles();
        view.flush();
      },
      // Where each of `name`'s banners was drawn the last frame, on the page, and how solid.
      boxesOf = (name: string) => {
        const ratio = overlay.width / box.width,
          image = imageOf(name),
          size = sizes.get(image)!;

        return drawn
          .filter(([what]) => what === image)
          .map(([, x, y, alpha]) => ({
            left: corner.left + x / ratio,
            top: corner.top + y / ratio,
            right: corner.left + (x + size.width) / ratio,
            bottom: corner.top + (y + size.height) / ratio,
            alpha,
          }));
      },
      // The one of `name`'s banners nearest the middle of the screen across.
      nearest = (name: string) =>
        boxesOf(name).sort(
          (a, b) =>
            Math.abs((a.left + a.right) / 2 - corner.left - box.width / 2) -
            Math.abs((b.left + b.right) / 2 - corner.left - box.width / 2)
        )[0]!,
      pointer = (type: string, clientX: number, clientY: number): void =>
        void own.dispatchEvent(
          Object.assign(new Event(type), {
            clientX,
            clientY,
            button: 0,
            buttons: 0,
            pointerId: 1,
            isPrimary: true,
            pointerType: 'mouse',
            timeStamp: 0,
          })
        ),
      clickAt = (clientX: number, clientY: number): void =>
        ['pointerdown', 'pointerup'].forEach((type) =>
          pointer(type, clientX, clientY)
        ),
      // A click, and what the page was told of it.
      clicked = (clientX: number, clientY: number) => {
        clicks.length = 0;
        clickAt(clientX, clientY);

        return clicks.splice(0);
      },
      pause = (ms: number): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, ms));

    Object.assign(overlay, { getContext: () => context2d });
    view.setOrbit({
      ...view.orbit(),
      focus: view.land().layout.centre(ur.x, ur.y),
      distance: DISTANCE_MIN,
    });
    patch([ur, 'Ur'], [kish, 'Kish']);

    const urs = nearest('Ur'),
      kishes = nearest('Kish'),
      // On Ur's banner above where Kish's hangs, on Kish's (over Ur's too), and beside both.
      onUr = [(urs.left + urs.right) / 2, (urs.top + kishes.top) / 2] as const,
      onKish = [
        (kishes.left + kishes.right) / 2,
        (kishes.top + kishes.bottom) / 2,
      ] as const,
      beside = [urs.left - 5, onKish[1]] as const,
      onEach = [clicked(...onUr), clicked(...onKish), clicked(...beside)];

    expect(
      'a click on a city’s banner is for its city and the square under it, which isn’t the city’s own; of two that overlap, the one drawn over the other’s; beside them, for the square alone',
      [
        urs.top < kishes.top && urs.bottom > kishes.bottom,
        onEach.map((each) => each.map(([, name]) => name)),
        onEach.every((each) => each[0]?.[0] !== null),
        onEach[0]![0]![0] === `${ur.x},${ur.y}`,
      ],
      [true, [['Ur'], ['Kish'], [null]], true, false]
    );

    // Resting on Ur's banner: its tooltip, about Ur's square, over the banner on the page. Moved off it onto the land
    //  beside: that closes, and the square's opens over the mouse.
    pointer('pointermove', ...onUr);
    await pause(450);

    const overBanner = tips.splice(0);

    pointer('pointermove', ...beside);
    await pause(450);

    const offBanner = tips.splice(0),
      // Above the banner, on Ur's own square.
      onSquare = [onUr[0], urs.top - 15] as const;

    pointer('pointermove', ...onUr);
    await pause(450);
    tips.length = 0;
    pointer('pointermove', ...onSquare);
    await pause(450);

    const ontoSquare = tips.splice(0);

    // Ur gone from the world, though no frame's drawn since: resting on its banner is resting on the land under it.
    Object.assign(ur, { city: null });
    pointer('pointermove', ...onUr);
    await pause(450);

    const overGone = tips.splice(0);

    Object.assign(ur, { city: city('Ur') });

    expect(
      'resting on a city’s banner opens its city’s tooltip over the banner; moving off it onto the land, or onto its city’s own square, the square’s over the mouse; its city gone, the land’s under it',
      [
        overBanner,
        offBanner.length,
        offBanner[0],
        offBanner[1]?.endsWith(
          ` ${beside[0] - 10} ${beside[1] - 10} ${beside[1] + 10}`
        ),
        offBanner[1]?.startsWith(`open ${ur.x},${ur.y} `),
        ontoSquare,
        overGone.length,
        overGone
          .at(-1)
          ?.endsWith(` ${onUr[0] - 10} ${onUr[1] - 10} ${onUr[1] + 10}`),
        overGone.at(-1)?.startsWith(`open ${ur.x},${ur.y} `),
      ],
      [
        [`open ${ur.x},${ur.y} ${urs.left} ${urs.top} ${urs.bottom}`],
        2,
        'closed',
        true,
        false,
        [
          'closed',
          `open ${ur.x},${ur.y} ${onSquare[0] - 10} ${onSquare[1] - 10} ${
            onSquare[1] + 10
          }`,
        ],
        2,
        true,
        false,
      ]
    );

    document.dispatchEvent(new Event('keydown'));
    tips.length = 0;

    // Resting on Ur's banner, its tooltip open, and Ur's banner painted again taller: its tooltip's shown again over it
    //  as it's drawn now. Painted again too short to reach the mouse: its tooltip goes.
    pointer('pointermove', ...onUr);
    await pause(450);
    tips.length = 0;
    tall.set('Ur', 700);
    patch([ur, 'Ur']);

    const taller = nearest('Ur'),
      followed = tips.splice(0);

    tall.set('Ur', 12);
    patch([ur, 'Ur']);

    const shrunk = tips.splice(0);

    // Its tooltip open again, and the banners painted again as the theme changes, with nothing on its square changed:
    //  shown again over it as it's drawn now. The units hidden (`t`), or the yields shown, by something other than a
    //  key: it goes.
    tall.set('Ur', 600);
    patch([ur, 'Ur']);
    pointer('pointermove', ...onUr);
    await pause(450);
    tips.length = 0;
    tall.set('Ur', 650);
    restyles.forEach((changed) => changed());
    view.flush();

    const restyled = nearest('Ur'),
      followedRestyle = tips.splice(0);

    view.toggleUnits();
    view.flush();

    const closedByHiding = tips.splice(0);

    view.toggleUnits();
    view.flush();
    pointer('pointermove', ...onUr);
    await pause(450);
    tips.length = 0;
    view.toggleYields();
    view.flush();

    const closedByYields = tips.splice(0);

    view.toggleYields();
    tall.set('Ur', 600);
    patch([ur, 'Ur']);
    document.dispatchEvent(new Event('keydown'));
    tips.length = 0;

    expect(
      'an open tooltip over a banner painted again, as its city changes or the theme does, is shown over it as it’s drawn now, or goes if it no longer reaches the mouse; and goes with the banners hidden by the units or the yields',
      [
        taller.bottom > urs.bottom,
        followed,
        shrunk,
        restyled.bottom > urs.bottom && restyled.bottom < taller.bottom,
        followedRestyle,
        closedByHiding,
        closedByYields,
      ],
      [
        true,
        [`open ${ur.x},${ur.y} ${taller.left} ${taller.top} ${taller.bottom}`],
        ['closed'],
        true,
        [
          `open ${ur.x},${ur.y} ${restyled.left} ${restyled.top} ${restyled.bottom}`,
        ],
        ['closed'],
        ['closed'],
      ]
    );

    // On a screen with twice the pixels: the banners where they were on the page, taking clicks there.
    (window as unknown as { devicePixelRatio: number }).devicePixelRatio = 2;
    window.dispatchEvent(new Event('resize'));
    view.flush();

    const doubled = [
      overlay.width,
      nearest('Kish'),
      clicked(...onKish),
      // Just past Kish's banner's right, and just under it, on Ur's.
      clicked(kishes.right + 1, onKish[1]),
      clicked(onKish[0], kishes.bottom + 1),
    ];

    delete (window as unknown as { devicePixelRatio?: number })
      .devicePixelRatio;
    window.dispatchEvent(new Event('resize'));
    view.flush();

    expect(
      'on a screen with twice the pixels, a banner is where it was on the page, as big, and a click there is for its city',
      [
        doubled[0],
        // As high up, as far across and as big, but for where its corner and its size round to on each canvas: within
        //  a pixel.
        (['left', 'top', 'right', 'bottom'] as const).every(
          (edge) =>
            Math.abs((doubled[1] as typeof kishes)[edge] - kishes[edge]) <= 1
        ),
        ...doubled
          .slice(2)
          .map((each) => (each as typeof clicks).map(([, name]) => name)),
      ],
      [box.width * 2, true, ['Kish'], [null], ['Ur']]
    );

    // With the units hidden (`t`), no banners: a click where one was is for the square alone. Ur gone from the world,
    //  though no frame's drawn since: a click on its banner is for the square alone.
    view.toggleUnits();
    view.flush();

    const hidden = clicked(...onKish);

    view.toggleUnits();
    view.flush();
    Object.assign(ur, { city: null });

    const gone = clicked(...onUr);

    patch([ur, 'Ur']);
    // Kish gone, though no frame's drawn since: a click on its banner is for Ur's, beneath it.
    Object.assign(kish, { city: null });

    const goneAbove = clicked(...onKish);

    Object.assign(kish, { city: city('Kish') });

    // A square being chosen for a long-range order: a click on a banner picks the square under it, as on the 2D map.
    const picked: string[] = [];

    view.pickTile(
      () => true,
      (tile) => void picked.push(`${tile.x},${tile.y}`),
      'Where?'
    );

    const whilePicking = clicked(...onKish);

    expect(
      'none with the units hidden, nor once its city has gone, which lets a click through to a banner beneath; and while a square’s being chosen, a click on a banner picks the square under it',
      [
        hidden.map(([, name]) => name),
        gone.map(([, name]) => name),
        goneAbove.map(([, name]) => name),
        whilePicking,
        picked,
      ],
      [[null], [null], ['Ur'], [], [onEach[1]![0]![0]]]
    );

    // Looking low across the world as it repeats: Ur's banners, faded the further into the haze. One faded more than
    //  half lets a click through to the land; one less faded takes it.
    tall.delete('Ur');
    patch([kish, null], [ur, 'Ur']);

    const faded = [0, 1, 2, 3]
      .map((quarter) => {
        view.setOrbit({
          ...view.orbit(),
          focus: view.land().layout.centre(ur.x, ur.y),
          distance: DISTANCE_MIN,
          pitch: PITCH_MIN,
          yaw: (quarter * Math.PI) / 2,
        });
        view.flush();

        const all = boxesOf('Ur'),
          alone = all.filter(
            (one) =>
              !all.some(
                (other) =>
                  other !== one &&
                  other.left < one.right &&
                  other.right > one.left &&
                  other.top < one.bottom &&
                  other.bottom > one.top
              ) &&
              one.left >= corner.left &&
              one.right <= corner.left + box.width &&
              one.top >= corner.top &&
              one.bottom <= corner.top + box.height
          );

        return {
          quarter,
          faint: alone.find(({ alpha }) => alpha > 0 && alpha < 0.45),
          clear: alone.find(({ alpha }) => alpha > 0.55 && alpha < 1),
        };
      })
      .find(({ faint, clear }) => faint && clear);

    if (faded !== undefined) {
      view.setOrbit({
        ...view.orbit(),
        pitch: PITCH_MIN,
        yaw: (faded.quarter * Math.PI) / 2,
      });
      view.flush();
    }

    const middle = (of?: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    }) =>
      [
        ((of?.left ?? 0) + (of?.right ?? 0)) / 2,
        ((of?.top ?? 0) + (of?.bottom ?? 0)) / 2,
      ] as const;

    expect(
      'a banner faded more than half into the haze lets a click through to the land; one less faded takes it',
      faded === undefined
        ? 'none found'
        : [
            clicked(...middle(faded.faint)).map(([, name]) => name),
            clicked(...middle(faded.clear)).map(([, name]) => name),
          ],
      [[null], ['Ur']]
    );

    // A city on the last row before the pole the camera stops at: its banner hangs past it, where there's no square,
    //  and a click on it is for its city alone.
    const lagash = tiles[(height - 1) * width + 1] as Tile;

    patch([ur, null], [lagash, 'Lagash']);
    view.setOrbit({
      ...view.orbit(),
      focus: view.land().layout.centre(lagash.x, lagash.y),
      distance: DISTANCE_MIN,
      pitch: PITCH_MAX,
      yaw: 0,
    });
    view.flush();

    expect(
      'a click on a banner hanging past the pole the camera stops at is for its city, with no square under it',
      clicked(...middle(nearest('Lagash'))),
      [[null, 'Lagash']]
    );

    patch([lagash, null]);
    view.dispose();
    holder.remove();
  }

  // Drawn back from a wide world (#1316), the camera looks down at least as far as its distance needs, so the world
  //  isn't seen repeating to the horizon: as far as the world's period, across and down where it wraps, says, which
  //  stopping at the poles changes. Brought in again, it looks down as it did until it's tilted. On the small world the
  //  rest of these use, which repeats wherever it looks, it looks as low as ever.
  {
    const across = 64,
      down = 40,
      wideTiles = Array.from({ length: across * down }, (_, index) => ({
        ...(tiles[0] as Tile),
        id: `Tile-${index % across}-${Math.floor(index / across)}`,
        x: index % across,
        y: Math.floor(index / across),
      })) as unknown as Tile[],
      wide = new MapView3D(
        {
          ...given!,
          world: new World({
            ...worldData,
            width: across,
            height: down,
            tiles: wideTiles,
          } as unknown as WorldData),
        },
        fakeStage
      ),
      put = (pitch: number, distance: number) => {
        wide.setOrbit({ ...wide.orbit(), pitch, distance });

        return wide.orbit().pitch;
      },
      zoomTo = (distance: number) => {
        // As the keys zoom it, a step at a time, to as near `distance` as a step comes.
        const steps = Math.round(
          Math.log(wide.orbit().distance / distance) / Math.log(ZOOM_STEP)
        );

        wide.zoomBy(steps);

        return wide.orbit();
      },
      round = (value: number) => Math.round(value * 1000) / 1000,
      // How far round the world repeats as the camera goes: down only where it isn't stopped at the poles.
      period = (locked: boolean) => {
        const { u, v } = wide.land().layout.period();

        return { u, v: locked ? null : v };
      },
      wraps = wide.land().layout.period().v !== null;

    wide.portal.setLockVerticalEdges(false);

    const drawnBack = put(PITCH_MIN, DISTANCE_MAX),
      broughtIn = zoomTo(DISTANCE_MIN),
      tiltedLow = put(PITCH_MIN, DISTANCE_MIN),
      chosenHigh = put(1.2, DISTANCE_MIN),
      outHigh = zoomTo(DISTANCE_MAX);

    expect(
      'drawn back from a wide world, the camera looks down further than it can close in, as far as its distance needs on the world as it repeats',
      [wraps, drawnBack > PITCH_MIN + 0.1, round(drawnBack)],
      [true, true, round(lowestPitch(DISTANCE_MAX, period(false)))]
    );

    expect(
      'brought in, it looks down as it did until it is tilted; tilted close in, it looks as low as ever; a pitch above what its distance needs is kept as it draws back',
      [
        round(broughtIn.pitch),
        round(tiltedLow),
        round(chosenHigh),
        round(outHigh.pitch),
      ],
      [round(drawnBack), round(PITCH_MIN), 1.2, 1.2]
    );

    // Stopped at the poles, the world repeats only across, further round, so drawn back it needn't look down as far;
    //  let go of them, it repeats down too, and looks down further at once.
    wide.portal.setLockVerticalEdges(true);

    const stopped = put(PITCH_MIN, DISTANCE_MAX);

    wide.portal.setLockVerticalEdges(false);

    const letGo = wide.orbit().pitch;

    expect(
      'stopped at the poles, drawn back it looks down as far as the world repeating only across needs; let go of them, further at once',
      [round(stopped), round(letGo), stopped < letGo],
      [
        round(lowestPitch(DISTANCE_MAX, period(true))),
        round(lowestPitch(DISTANCE_MAX, period(false))),
        true,
      ]
    );

    wide.dispose();

    // The small world, drawn back: as low as ever.
    const small = new MapView3D(given!, fakeStage);

    small.setOrbit({
      ...small.orbit(),
      pitch: PITCH_MIN,
      distance: DISTANCE_MAX,
    });

    expect(
      'on a world too small to keep from repeating, it looks as low as ever, however far back',
      round(small.orbit().pitch),
      round(PITCH_MIN)
    );

    small.dispose();
  }

  // Sets of models (docs/3d-renderer.md §10): the stage asked to load each set the page asks for, and each unit type a
  //  model's loaded for marked again with it as it arrives, the rest as they were; a set that can't be loaded said
  //  once, the units left as they are; nothing marked for one arriving after the map's taken down. The stage isn't
  //  asked where the page asks for none. Where there are several, a type is drawn by the first set's model for it.
  {
    // Asked for no set, the page asks for the ones that ship with civ.one: 0 A.D.'s ancient units, then the realistic
    //  units made for civ.one, then those adapted from their authors'.
    expect(
      'asked for no set, the page draws units with the ones that ship with civ.one, 0 A.D.’s first',
      given!.models,
      [
        { url: ancientUnits.manifest },
        { url: realisticUnits.manifest },
        { url: creditedUnits.manifest },
      ]
    );

    const asked: string[] = [],
      warned: unknown[][] = [],
      warn = console.warn;
    let told: ((id: string, types: readonly string[]) => void) | null = null,
      reject: (error: unknown) => void = () => {};

    const withLoading = (): Stage => ({
        ...fakeStage(),
        loadModels: (url, loaded) => {
          asked.push(url);
          told = loaded;

          return new Promise<void>((_, rejected) => {
            reject = rejected;
          });
        },
      }),
      spear = tiles[1 * width + 1] as Tile,
      bow = tiles[1 * width + 2] as Tile,
      unitOf = (id: string, type: string) => ({
        id,
        _: type,
        __: ['Land'],
        defence: { value: 1 },
        player: owner,
        busy: null,
        improvements: [],
      }),
      modelled = new MapView3D(
        { ...given!, models: [{ url: '/sets/0ad/manifest.json' }] },
        withLoading
      ),
      modelAt = (tile: Tile) =>
        markers.get(`${tile.x},${tile.y}`)?.unit?.model ?? null;

    Object.assign(spear, { city: null, units: [unitOf('Unit-S', 'Spearman')] });
    Object.assign(bow, { city: null, units: [unitOf('Unit-A', 'Archer')] });
    [spear, bow].forEach((tile) => modelled.queueTile(tile));
    modelled.releaseTiles();
    modelled.flush();

    const before = [modelAt(spear), modelAt(bow)];

    told!('hoplite', ['Spearman', 'Phalanx']);
    modelled.flush();

    const after = [modelAt(spear), modelAt(bow)];

    console.warn = (...args: unknown[]) => void warned.push(args);
    reject(new Error('404'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.warn = warn;

    // Taken down, and a model arriving after: nothing marked with it.
    modelled.dispose();
    told!('archer', ['Archer']);

    const afterDown = modelAt(bow),
      // Where the page asks for no set.
      none = new MapView3D({ ...given!, models: undefined }, withLoading);

    none.dispose();

    expect(
      'the stage is asked for the set the page asks for, and each type marked again with its model as it arrives, the rest as they were; one that can’t be loaded is said once; none marked after the map’s taken down, and none asked for where the page asks for none',
      [asked, before, after, warned.length, String(warned[0]?.[1]), afterDown],
      [
        ['/sets/0ad/manifest.json'],
        [null, null],
        ['hoplite', null],
        1,
        'Error: 404',
        null,
      ]
    );

    // Two sets, the first first: each told of its models in any order.
    const tellers = new Map<
        string,
        (id: string, types: readonly string[]) => void
      >(),
      layered = new MapView3D(
        {
          ...given!,
          models: [{ url: '/sets/first.json' }, { url: '/sets/second.json' }],
        },
        () => ({
          ...fakeStage(),
          loadModels: (url, loaded) => {
            tellers.set(url, loaded);

            return new Promise<void>(() => {});
          },
        })
      ),
      marked: (string | null)[][] = [],
      tell = (url: string, id: string, types: string[]): void => {
        tellers.get(url)!(id, types);
        layered.flush();
        marked.push([modelAt(spear), modelAt(bow)]);
      };

    [spear, bow].forEach((tile) => layered.queueTile(tile));
    layered.releaseTiles();
    layered.flush();

    tell('/sets/second.json', 'second-spear', ['Spearman']);
    tell('/sets/first.json', 'first-spear', ['Spearman']);
    tell('/sets/second.json', 'second-spear-again', ['Spearman']);
    tell('/sets/second.json', 'second-both', ['Spearman', 'Archer']);

    expect(
      'each set asked for, in order; a type drawn by a later set’s model till the first’s arrives, then by the first’s, whatever arrives after; a later model that draws it and a type only its set has draws only that type',
      [[...tellers.keys()], marked],
      [
        ['/sets/first.json', '/sets/second.json'],
        [
          ['second-spear', null],
          ['first-spear', null],
          ['first-spear', null],
          ['first-spear', 'second-both'],
        ],
      ]
    );
    layered.dispose();

    // Plants (#1335): each set's laid again once, as all its models have been tried, not as each arrives; a later set's
    //  plant drawn till an earlier set's of it arrives; and a kind on a terrain of its own drawn with its own model only
    //  where no earlier set draws the kind.
    const growers = new Map<
        string,
        {
          grown: (id: string, plants: readonly string[]) => void;
          done: () => void;
        }
      >(),
      growing = new MapView3D(
        {
          ...given!,
          models: [{ url: '/sets/first.json' }, { url: '/sets/second.json' }],
        },
        () => ({
          ...fakeStage(),
          loadModels: (url, _loaded, grown) =>
            new Promise<void>((done) =>
              growers.set(url, { grown: grown!, done })
            ),
        })
      ),
      laidWith: [string, string][][] = [],
      settled = () => new Promise((resolve) => setTimeout(resolve, 0)),
      landGrowing = growing.land(),
      growWith = landGrowing.growWith.bind(landGrowing);

    landGrowing.growWith = (models, u, v) => {
      laidWith.push([...models].sort());
      growWith(models, u, v);
    };

    growers.get('/sets/second.json')!.grown('teak', ['Jungle:broadleaf']);
    growers.get('/sets/second.json')!.grown('pine', ['conifer', 'broadleaf']);

    const beforeDone = laidWith.length;

    growers.get('/sets/second.json')!.done();
    await settled();
    growers.get('/sets/first.json')!.grown('beech', ['broadleaf']);
    growers.get('/sets/first.json')!.done();
    await settled();
    growing.dispose();

    expect(
      'a set’s plants laid once it’s loaded; an earlier set’s plant drawn over a later’s, and over a later’s on a terrain of its own',
      [beforeDone, laidWith],
      [
        0,
        [
          [
            ['Jungle:broadleaf', 'teak'],
            ['broadleaf', 'pine'],
            ['conifer', 'pine'],
          ],
          [
            ['broadleaf', 'beech'],
            ['conifer', 'pine'],
          ],
        ],
      ]
    );

    // A set the page asks to try out: drawn with instead of the ones that ship, not beside them.
    fresh();
    await prepareMap3D({
      say,
      search: '?3d=1&models=/sets/try/manifest.json',
      webgl2: () => true,
      load,
    });

    const trying = makeMapView(deps2D),
      triedWith = (given as MapView3DDeps | null)?.models;

    trying.dispose();
    // The page as it was, for what follows.
    fresh();
    await prepareMap3D({ say, search: '?3d=1', webgl2: () => true, load });

    expect(
      'asked to try a set, the page draws units with it alone, not beside the ones that ship',
      triedWith,
      [{ url: '/sets/try/manifest.json' }]
    );

    [spear, bow].forEach((tile) => Object.assign(tile, { units: [] }));
  }

  // A city kept as it was before a battle, as its banner and marker show it: the page fills its objects in place as
  //  patches come, so what's shown of it (what it's building and how far, how it grows, what it yields) is copied.
  {
    const live = {
        name: 'Ur',
        player: owner,
        growth: { size: 3, progress: { value: 10 }, cost: { value: 40 } },
        build: {
          building: { item: { _: 'Warriors' } },
          progress: { value: 4 },
          cost: { value: 20 },
          held: ['a rule'],
        },
        yields: [{ _: 'Food', value: 2 }],
      },
      kept = keptCity(
        live as unknown as Tile['city']
      ) as unknown as typeof live;

    Object.assign(live.growth, { size: 4 });
    Object.assign(live.growth.progress, { value: 30 });
    Object.assign(live.build.progress, { value: 12 });
    live.build.held.push('another');
    Object.assign(live.yields[0]!, { value: -1 });

    expect(
      'a city kept before a battle stays as it was, though the page fills its objects in place',
      [
        kept.growth.size,
        kept.growth.progress.value,
        kept.build.progress.value,
        kept.build.held,
        kept.yields[0]!.value,
        kept.player === owner,
      ],
      [3, 10, 4, ['a rule'], 2, true]
    );
  }

  // The page's own painter, with the new interface's banners (the theme's form `full`): a city's banner painted by the
  //  interface's layer, twice as many pixels across and down, and as far across to the square's middle, for twice the
  //  density; and painted again as the theme changes, till it's told no more.
  {
    const was = interfaceMode(),
      computed = (globalThis as { getComputedStyle?: unknown })
        .getComputedStyle;

    applyInterface('modern', null);
    (globalThis as { getComputedStyle?: unknown }).getComputedStyle = () => ({
      getPropertyValue: (name: string) =>
        name === '--ui-city-banner' ? 'full' : '',
    });

    const painter = cityBannersFor(
        new World(worldData),
        () => mapTileset(),
        () => 2
      )!,
      tile = {
        ...(tiles[0] as Tile),
        city: {
          name: 'Ur',
          growth: { size: 3 },
          player: owner,
          originalPlayer: { civilization: { _: 'Sumerians' } },
          civilDisorderDeclared: false,
        },
      } as unknown as Tile,
      once = painter.paint(tile, 1),
      twice = painter.paint(tile, 2),
      // What it says: the same again, and not once it's grown.
      keys = [
        painter.key(tile),
        painter.key(tile),
        painter.key({
          ...tile,
          city: { ...tile.city!, growth: { size: 4 } },
        } as unknown as Tile),
      ];
    let told = 0;

    // The browser's light or dark, as the page asks after it, switched (the DOM here has none of its own).
    const schemes = new Set<() => void>(),
      matchMedia = (window as { matchMedia?: unknown }).matchMedia;

    (window as { matchMedia?: unknown }).matchMedia = () => ({
      addEventListener: (_: string, changed: () => void) =>
        void schemes.add(changed),
      removeEventListener: (_: string, changed: () => void) =>
        void schemes.delete(changed),
    });

    const stop = painter.restyled(() => told++);

    schemes.forEach((changed) => changed());
    stop();
    schemes.forEach((changed) => changed());
    (window as { matchMedia?: unknown }).matchMedia = matchMedia;
    // Through the view, with the page's own key and painter, on a city shaped as the page has it (an id on every part)
    //  and filled in place as patches come: painted again as what its banner says changes, and only then.
    const site = tiles[3 * width + 3] as Tile,
      painting: string[] = [],
      real = cityBannersFor(
        given!.world,
        () => mapTileset(),
        () => 2
      )!,
      keyed = new MapView3D(
        {
          ...given!,
          cityBanners: {
            ...real,
            paint: (shown: Tile, density: number) => {
              painting.push(String(shown.city?.growth.size));

              return real.paint(shown, density);
            },
          },
        },
        fakeStage
      ),
      production = (value: number) => ({
        _: 'Production',
        __: ['Production', 'Yield'],
        id: `Production-${value}-${painting.length}`,
        value,
      }),
      food = (value: number) => ({
        _: 'Food',
        __: ['Food', 'Yield'],
        id: `Food-${value}-${painting.length}`,
        value,
      }),
      city = {
        id: 'City-K',
        name: 'Kish',
        player: owner,
        originalPlayer: { id: 'Player-1', civilization: { _: 'Sumerians' } },
        civilDisorderDeclared: false,
        celebrateLeader: false,
        growth: {
          id: 'CityGrowth-K',
          size: 3,
          progress: { id: 'Progress-K', value: 10 },
          cost: { id: 'Cost-K', value: 40 },
        },
        build: {
          id: 'CityBuild-K',
          building: { id: 'BuildItem-K', item: { _: 'Warriors' } },
          progress: { id: 'Progress-B', value: 4 },
          cost: { id: 'Cost-B', value: 20 },
        },
        yields: [production(4), food(2)],
      },
      // The square released and drawn, and whether its banner was painted again for it.
      repainted = (change: () => void) => {
        const from = painting.length;

        change();
        keyed.queueTile(site);
        keyed.releaseTiles();
        keyed.flush();

        return painting.length > from;
      };

    Object.assign(site, { city, units: [] });

    const first = repainted(() => undefined),
      unchanged = repainted(() => undefined),
      // As the worker sends a build alone: filled in place, the city's square queued for its banner.
      turns = repainted(() => void (city.build.progress.value = 12)),
      sameCost = repainted(
        () => void (city.build.building.item = { _: 'Phalanx' })
      ),
      grown = repainted(() => void (city.growth.progress.value = 30)),
      yieldsAnew = repainted(
        () => void (city.yields = [production(4), food(2)])
      ),
      starving = repainted(
        () => void (city.yields = [production(4), food(-1)])
      ),
      disorder = repainted(() => void (city.civilDisorderDeclared = true));

    keyed.dispose();
    Object.assign(site, { city: null });

    expect(
      'through the view, with the page’s own key, a city shaped and filled in place as the page has it: painted again for the turns to finish, its growth, starving and disorder; not for nothing changed, another item at the same cost, or its yields sent anew the same',
      {
        first,
        unchanged,
        turns,
        sameCost,
        grown,
        yieldsAnew,
        starving,
        disorder,
      },
      {
        first: true,
        unchanged: false,
        turns: true,
        sameCost: false,
        grown: true,
        yieldsAnew: false,
        starving: true,
        disorder: true,
      }
    );

    (globalThis as { getComputedStyle?: unknown }).getComputedStyle = computed;
    applyInterface(was, null);

    expect(
      'the page paints a city’s banner by the interface’s layer, twice as big for twice the density, says what it says (the same for the same, otherwise not), and paints them again as the theme changes, till it’s told no more',
      [
        once !== null && once.width > 0 && once.height > 0,
        twice?.width === (once?.width ?? 0) * 2,
        twice?.height === (once?.height ?? 0) * 2,
        twice?.centre === (once?.centre ?? 0) * 2,
        keys[0] !== null && keys[0] === keys[1] && keys[1] !== keys[2],
        told,
      ],
      [true, true, true, true, true, 1]
    );
  }

  // An interface whose labels paint no banners (the classic one) gives the 3D map none, which names its cities itself;
  //  the new one does.
  {
    const was = interfaceMode(),
      world = new World(worldData),
      painters = (['classic', 'modern'] as const).map((mode) => {
        applyInterface(mode, null);

        return (
          cityBannersFor(
            world,
            () => mapTileset(),
            () => 2
          ) !== undefined
        );
      });

    applyInterface(was, null);

    expect(
      'the classic interface gives the 3D map no banners; the new one does',
      painters,
      [false, true]
    );
  }

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
