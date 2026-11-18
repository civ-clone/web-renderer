// The 3D map's entry (docs/3d-renderer.md §2.4, plan 0.2):
//  - `?3d=1` asks for it, a browser without WebGL2 or a script that won't load leaves the map 2D, and the player is told
//    why once;
//  - a game drawn in 3D is given what the 2D map is, with the 2D art's sizes as the 2D map's portal has them;
//  - the 3D view takes the game's tiles and orders, opens cities and hands on a unit picked, and draws when asked;
//  - `dist/map3d.js` bundles three.js and its own code, and nothing that has state of its own.

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
  MapView3DDeps,
} from '@civ-clone/ui-map/MapView3DFactory';
import MapView2D from '@civ-clone/ui-game/MapView2D';
import MapView3D from '@civ-clone/ui-map-3d/MapView3D';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import World from '@civ-clone/ui-map/components/World';
import {
  defaultZoom,
  mapTileset,
  nativeTileSize,
  zoomFor,
  zoomOption,
} from '@civ-clone/ui-assets/lib/tilesets';
import {
  forgetMap3D,
  makeMapView,
  map3dAsked,
  prepareMap3D,
} from '@civ-clone/ui-game/lib/map3d';
import { Stage } from '@civ-clone/ui-map-3d/stage';
import { createRequire } from 'module';
import { join } from 'path';

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
  fakeStage = (): Stage => ({
    render: () => void staged.push('render'),
    resize: (stageWidth, stageHeight, ratio) =>
      void staged.push(`resize ${stageWidth}×${stageHeight}@${ratio}`),
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
    mapPortal: mapCanvas,
    minimapCanvas,
    options,
    playerId: 'Player-1',
    transport,
    world: worldData,
  };

// The query string.

expect(
  '?3d=1 asks for the 3D map, and anything else not',
  ['?3d=1', '?3d=true', '?debug=1', '', '?3d=0'].map(map3dAsked),
  [true, true, false, false, false]
);

(async (): Promise<void> => {
  // Not asked for: nothing is fetched, nothing is said, and the map is 2D.
  const told: string[] = [];
  let loads = 0;
  const load = async (): Promise<CreateMapView3D> => {
    loads++;

    return (deps: MapView3DDeps) => new MapView3D(deps, fakeStage);
  };

  await prepareMap3D((text) => told.push(text), {
    search: '',
    webgl2: () => true,
    load,
  });

  expect('not asked for, nothing is fetched or said', [loads, told], [0, []]);

  const notAsked = makeMapView(deps2D);

  expect(
    'and the game is drawn on the 2D map',
    notAsked instanceof MapView2D,
    true
  );

  notAsked.dispose();

  // Asked for, in a browser without WebGL2: said once, and drawn in 2D.
  forgetMap3D();

  await prepareMap3D((text) => told.push(text), {
    search: '?3d=1',
    webgl2: () => false,
    load,
  });
  await prepareMap3D((text) => told.push(text), {
    search: '?3d=1',
    webgl2: () => false,
    load,
  });

  expect(
    'without WebGL2, nothing is fetched, and the player is told why once',
    [loads, told.length],
    [0, 1]
  );

  const noWebGL2 = makeMapView(deps2D);

  expect('and the map is 2D', noWebGL2 instanceof MapView2D, true);

  noWebGL2.dispose();

  // Asked for, and its script won't load: said once, and drawn in 2D.
  forgetMap3D();
  told.length = 0;

  const error = console.error;

  console.error = () => {};

  await prepareMap3D((text) => told.push(text), {
    search: '?3d=1',
    webgl2: () => true,
    load: () => Promise.reject(new Error('offline')),
  });

  console.error = error;

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

  // Asked for, with WebGL2: fetched once, and every game after is drawn in 3D.
  forgetMap3D();
  told.length = 0;

  await prepareMap3D((text) => told.push(text), {
    search: '?3d=1',
    webgl2: () => true,
    load,
  });
  await prepareMap3D((text) => told.push(text), {
    search: '?3d=1',
    webgl2: () => true,
    load,
  });

  expect('with WebGL2, fetched once, and nothing said', [loads, told], [1, []]);

  kept[zoomOption(mapTileset('square'))] = 2.6;
  kept.lockVerticalEdges = true;

  const view = makeMapView({ ...deps2D, coveredBy: [] }) as MapView3D;

  expect('the game is drawn on the 3D map', view instanceof MapView3D, true);
  expect(
    'its world is the player’s',
    [view.world instanceof World, view.world.width(), view.world.get(2, 3).id],
    [true, 4, 'Tile-2-3']
  );

  // The 2D map's portal, as the 2D map makes it for the same art and options (`MapView2D`): the city screen draws its
  //  map with that art, so the 3D map's portal says what that one says.
  const portal2D = (): Portal => {
    const tileset = mapTileset('square');

    return new Portal(
      new World(worldData),
      transport,
      document.createElement('canvas'),
      {
        cityOpener: null,
        lockVerticalEdges: false,
        playerId: 'Player-1',
        scale: tileset.defaultScale,
        zoom: zoomFor(
          tileset,
          options.get(zoomOption(tileset), defaultZoom(tileset))
        ),
        tileSize: nativeTileSize(tileset),
      }
    );
  };

  const sizes = (portal: {
      zoom(): number;
      scale(): number;
      nativeTileSize(): { width: number; height: number };
    }) => [portal.zoom(), portal.scale(), portal.nativeTileSize()],
    shown2D = sizes(portal2D());

  expect(
    'the 3D map’s portal has the 2D map art’s zoom, scale and tile, as the 2D map’s portal does',
    sizes(view.portal),
    shown2D
  );
  expect('at the zoom kept', shown2D[0], 2.6);

  // Options keeps the zoom, then tells the portal: read when asked, the new zoom is the city screen's.
  kept[zoomOption(mapTileset('square'))] = 1.4;

  expect(
    'a zoom chosen since is read when asked',
    sizes(view.portal),
    sizes(portal2D())
  );
  expect(
    'and whether the view stops at the poles is the option’s',
    view.portal.lockVerticalEdges(),
    true
  );

  // The view: sized to its canvas's box, and drawn when asked.
  expect(
    'the stage is sized to the map’s box as it starts, and drawn',
    staged.splice(0),
    ['resize 640×480@1', 'render']
  );

  box.width = 800;
  window.dispatchEvent(new Event('resize'));

  expect('and again as the window is resized', staged.splice(0), [
    'resize 800×480@1',
    'render',
  ]);

  view.centre(tiles[5]);

  expect(
    'centring moves its focus and draws it',
    [view.portal.center(), staged.splice(0)],
    [{ x: 1, y: 1 }, ['render']]
  );

  view.portal.setCenter(1, 1);

  expect('the same square again draws nothing', staged.splice(0), []);

  // The tiles, as the 2D map takes them: queued, released once the world has them, and taken by a flush.
  view.queueTile(tiles[0]);
  view.queueTile(tiles[0]);
  view.queueTile(tiles[1]);

  expect('a queued tile waits for the world', view.tilesPending(), 0);

  view.releaseTiles();

  expect('released, each square once', view.tilesPending(), 2);

  view.flush();

  expect(
    'a flush takes them, and draws',
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

  view.pickTile(
    () => true,
    () => {},
    'Where?'
  );

  expect(
    'no square can be picked yet, and nothing is being chosen',
    view.picking(),
    false
  );
  expect('nor are there view modes to flip', view.debugViewModes(), []);
  expect('nor art of its own to redraw', view.redrawArt(), 'unchanged');

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
  view.dispose();

  expect('dispose lets the stage go', staged.splice(0), ['dispose']);

  window.dispatchEvent(new Event('resize'));

  expect('and stops following the window', staged.splice(0), []);

  // `dist/map3d.js`: three.js and the 3D map's own code, and from the rest only what has no state (the factory's name),
  //  so no registry or singleton the page's bundle has is bundled again with its own state.
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
        !/node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?three\//.test(path) &&
        !/@dom111\/typed-event-emitter\//.test(path)
    );

  expect(
    'map3d.js bundles three.js, its own code, the emitter, and the factory’s name alone',
    others,
    ['packages/map/MapView3DFactory.ts']
  );
  expect(
    'and three.js is in it',
    inputs.some((path: string) => /three\/build\//.test(path)),
    true
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
