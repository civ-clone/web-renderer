// The map's upkeep, out of `Renderer.ts` (#344): a tile a patch changed is drawn only once the world has it
//  (`releaseTiles`), whether by the next render or the blink tick, each compositing the map and redrawing the minimap;
//  the yields start hidden and `t`/`y` toggle the layers and composite the map; `c` centres; the minimap marker reads
//  the active unit live; a tick with no blink and no tile draws nothing, nor does a resize that changes no size; and
//  `dispose` stops the tick and the resize handler. The canvas also follows its parent when that changes size alone,
//  as when the top bar above it fills in (#697).

// Must stay first: it gives the map a `document`.
import './lib/dom';

import { Tile, Unit, World as WorldData } from '../../src/js/UI/types';
import MapView from '../../src/js/UI/game/MapView';
import { playerCityOpener } from '../../src/js/UI/lib/cityOpeners';
import Transport from '../../src/js/UI/Transport';

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
    process.stderr.write('FAIL mapView: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// linkedom's canvas has no context: one that records the minimap's marker and ignores the rest.
const minimapFills: number[][] = [],
  context = (canvas: HTMLCanvasElement): CanvasRenderingContext2D =>
    new Proxy({} as { [key: string]: any }, {
      get: (target, name: string) =>
        name in target
          ? target[name]
          : name === 'measureText'
          ? (text: string) => ({ width: String(text).length * 10 })
          : name === 'getImageData'
          ? () => ({ data: new Uint8ClampedArray(4) })
          : name === 'fillRect' && canvas.id === 'minimap'
          ? (...args: number[]) => minimapFills.push(args)
          : () => {},
      set: (target, name: string, value) => {
        target[name] = value;

        return true;
      },
    }) as unknown as CanvasRenderingContext2D;

(globalThis as any).HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement
) {
  return context(this);
};

// The blink tick, run by hand.
const ticks: Array<() => void> = [],
  cleared: number[] = [];

Object.assign(window, {
  setInterval: (handler: () => void) => ticks.push(handler),
  clearInterval: (reference: number) => cleared.push(reference),
});

const tick = () => ticks.forEach((handler) => handler());

const width = 8,
  height = 8,
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
      terrain: { _: 'Unknown', features: [] },
      units: [],
      workedBy: null,
      yields: [],
    } as unknown as Tile);
  }
}

document.body.insertAdjacentHTML(
  'beforeend',
  '<div id="map"><canvas></canvas></div><canvas id="minimap"></canvas>'
);

// The DOM here has no `ResizeObserver`: this one records what it watches, so the test can say when it changed size.
const observed: Array<{ callback: () => void; targets: Element[] }> = [];

(globalThis as any).ResizeObserver = class {
  #entry: { callback: () => void; targets: Element[] };

  constructor(callback: () => void) {
    this.#entry = { callback, targets: [] };
    observed.push(this.#entry);
  }

  observe(target: Element): void {
    this.#entry.targets.push(target);
  }

  disconnect(): void {
    this.#entry.targets = [];
  }
};

const mapPortal = document.querySelector('#map canvas') as HTMLCanvasElement,
  minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement,
  activated: string[] = [];

// A section floating over the map, in the sidebar that scrolls it (#697). The DOM here has no layout, so each says
//  where it is: nowhere, until the test places it.
type Box = { left: number; top: number; right: number; bottom: number };

const boxes = new Map<Element, Box>(),
  place = (element: Element, box: Box | null): void => {
    if (box === null) {
      boxes.delete(element);

      return;
    }

    boxes.set(element, box);
  },
  sidebar = document.createElement('div'),
  section = document.createElement('section');

sidebar.append(section);
document.body.append(sidebar);

[mapPortal, sidebar, section].forEach((element) => {
  (element as any).getBoundingClientRect = () => {
    const { left, top, right, bottom } = boxes.get(element) ?? {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    };

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  };
});

let activeUnit: Unit | null = null,
  activeUnitReads = 0;

const mapView = new MapView({
  activateUnit: (unit) => activated.push(unit.id),
  cityOpener: playerCityOpener(),
  coveredBy: [section],
  activeUnit: () => {
    activeUnitReads++;

    return activeUnit;
  },
  mapPortal,
  minimapCanvas,
  options: { get: (key: string, defaultValue?: any) => defaultValue },
  playerId: 'Player-1',
  transport: {
    send: () => {},
    receive: () => () => {},
  } as unknown as Transport,
  world: { id: 'PlayerWorld-1', width, height, tiles } as unknown as WorldData,
});

const { portal } = mapView,
  built: string[][] = [],
  build = portal.build.bind(portal);

portal.build = (updated: Tile[]): void => {
  built.push(updated.map(({ x, y }) => `${x},${y}`));

  build(updated);
};

const builtTiles = () => built.flat();

// How often the map is composited and the minimap redrawn, since the last `counted()`.
const counts = { renders: 0, minimapUpdates: 0 },
  render = portal.render.bind(portal),
  updateMinimap = mapView.minimap.update.bind(mapView.minimap);

portal.render = (): void => {
  counts.renders++;

  render();
};
mapView.minimap.update = (): void => {
  counts.minimapUpdates++;

  updateMinimap();
};

const counted = (): [number, number] => {
  const taken: [number, number] = [counts.renders, counts.minimapUpdates];

  counts.renders = 0;
  counts.minimapUpdates = 0;

  return taken;
};

// The queue.

mapView.queueTile(tiles[9]);
mapView.queueTile(tiles[9]);
mapView.queueTile(tiles[10]);

expect('a queued tile waits for the world', mapView.tilesPending(), 0);

mapView.flush();

expect('a render before the release builds nothing', builtTiles(), []);

tick();

expect('nor does the tick', builtTiles(), []);

mapView.releaseTiles();

expect(
  'once released, each square once however often it was queued',
  mapView.tilesPending(),
  2
);

counted();
mapView.flush();

expect('the next render builds them', builtTiles(), ['1,1', '2,1']);
expect(
  'and composites the map and redraws the minimap, once each',
  counted(),
  [1, 1]
);
expect('and takes them', mapView.tilesPending(), 0);

built.length = 0;
mapView.flush();

expect('a render with nothing released builds nothing', builtTiles(), []);

mapView.queueTile(tiles[20]);
tick();

expect('the tick leaves a tile that is not released', builtTiles(), []);

counted();
mapView.releaseTiles();
tick();

expect('the tick builds a released tile', builtTiles(), ['4,2']);
expect('and draws it, with the minimap', counted(), [1, 1]);
expect('and takes it', mapView.tilesPending(), 0);

expect('the queue is empty after the release', mapView.takeTiles(), []);

// The layers.

expect('the yields start hidden', mapView.yieldsLayer.isVisible(), false);

counted();
mapView.toggleYields();

expect(
  'y shows the yields, and composites the map',
  [mapView.yieldsLayer.isVisible(), counted()[0]],
  [true, 1]
);

mapView.toggleYields();

expect('y hides them again', mapView.yieldsLayer.isVisible(), false);

counted();
mapView.toggleUnits();

expect('t composites the map', counted()[0], 1);

expect(
  't hides the units, cities and city names',
  [
    mapView.unitsLayer.isVisible(),
    mapView.citiesLayer.isVisible(),
    mapView.cityNamesLayer.isVisible(),
  ],
  [false, false, false]
);

mapView.toggleUnits();

expect(
  't shows them again',
  [
    mapView.unitsLayer.isVisible(),
    mapView.citiesLayer.isVisible(),
    mapView.cityNamesLayer.isVisible(),
  ],
  [true, true, true]
);

expect(
  'the layers are the portal’s',
  [
    mapView.activeUnitLayer,
    mapView.citiesLayer,
    mapView.cityNamesLayer,
    mapView.overviewLayer,
    mapView.unitsLayer,
    mapView.yieldsLayer,
  ].every((layer) => portal.getLayers(layer.constructor as any)[0] === layer),
  true
);

expect('the world is the portal’s', portal.world() === mapView.world, true);

// Centring, and the minimap following.

const readsBeforeCentre = activeUnitReads;

mapView.centre(tiles[27]);

expect('c centres the map on the tile', portal.center(), { x: 3, y: 3 });
expect(
  'and the minimap is redrawn, reading the active unit',
  activeUnitReads > readsBeforeCentre,
  true
);

// The marker is read live: a unit made active after the map was built is the one marked.
activeUnit = { id: 'Unit-1', tile: tiles[45] } as unknown as Unit;
mapView.activeUnitLayer.setVisible(true);
minimapFills.length = 0;
mapView.minimap.update();

const size = mapView.overviewLayer.canvas().width / width;

expect(
  'the minimap marks the unit active now',
  minimapFills.some(([x, y]) => x === 5 * size && y === 5 * size),
  true
);

mapView.activeUnitLayer.setVisible(false);
minimapFills.length = 0;
mapView.minimap.update();

expect(
  'and not in the blink’s off phase',
  minimapFills.some(([x, y]) => x === 5 * size && y === 5 * size),
  false
);

// The portal's events.

const readsBeforeFocus = activeUnitReads;

portal.setCenter(1, 1);

expect(
  'a change of focus redraws the minimap',
  activeUnitReads > readsBeforeFocus,
  true
);

portal.emit('activate-unit', { id: 'Unit-2' } as unknown as Unit);

expect('a unit picked on the map is handed on', activated, ['Unit-2']);

// The blink.

mapView.activeUnitLayer.setActiveUnit(activeUnit);
mapView.activeUnitLayer.setVisible(true);
counted();
tick();

expect(
  'the tick blinks the active unit',
  mapView.activeUnitLayer.isVisible(),
  false
);
expect('and draws the blink, on the map and the minimap', counted(), [1, 1]);

tick();

expect('and back', mapView.activeUnitLayer.isVisible(), true);

mapView.activeUnitLayer.setActiveUnit(null);
counted();
tick();

expect(
  'with no active unit the tick leaves the layer alone',
  mapView.activeUnitLayer.isVisible(),
  true
);
expect('and, with no tile to draw, draws nothing', counted(), [0, 0]);

// Resizing, and the teardown.

const parent = mapPortal.parentElement as HTMLElement;

let parentHeight = 200;

Object.defineProperty(parent, 'offsetWidth', { value: 320 });
Object.defineProperty(parent, 'offsetHeight', { get: () => parentHeight });

counted();
window.dispatchEvent(new Event('resize'));

expect(
  'a resize sizes the map to its parent',
  [mapPortal.width, mapPortal.height],
  [320, 200]
);
expect('and draws it again, with the minimap', counted(), [1, 1]);

// Setting a canvas's size clears it, even to the size it already is.
let canvasCleared = 0;

Object.defineProperty(mapPortal, 'width', {
  configurable: true,
  get: () => 320,
  set: () => canvasCleared++,
});

window.dispatchEvent(new Event('resize'));

expect(
  'a resize that changes nothing leaves the canvas alone, and draws nothing',
  [canvasCleared, counted()],
  [0, [0, 0]]
);

delete (mapPortal as any).width;

// The top bar above the map filling in, or wrapping, makes the map shorter with no window resize (#697).
expect(
  "the map's parent is watched for its own size",
  observed.flatMap(({ targets }) => targets).includes(parent),
  true
);

parentHeight = 160;
observed.forEach(({ callback, targets }) => targets.length && callback());

expect(
  'so the canvas follows it when it changes alone',
  [mapPortal.width, mapPortal.height],
  [320, 160]
);

// The sidebar's sections float over the map (#697): a tile under one is in view but hidden, so the active unit is
//  brought out from under it as from an edge.
{
  const { portal } = mapView,
    size = portal.tileSize(),
    // Six tiles square, smaller than the eight-tile world, so each tile is shown once.
    side = size * 6;

  mapPortal.width = side;
  mapPortal.height = side;
  portal.setCenter(4, 4);

  const under = portal.tileAt(Math.floor(side / 4), Math.floor(side / 2))!,
    clear = portal.tileAt(Math.floor((side * 3) / 4), Math.floor(side / 2))!;

  expect(
    'with nothing over the map, a tile in view is visible',
    [portal.isVisible(under.x, under.y), portal.isVisible(clear.x, clear.y)],
    [true, true]
  );

  portal.setCovered([{ x: 0, y: 0, width: side / 2, height: side }]);

  expect(
    'under a section, it is not',
    [portal.isVisible(under.x, under.y), portal.isVisible(clear.x, clear.y)],
    [false, true]
  );

  portal.setCovered([{ x: 0, y: 0, width: size, height: side }]);

  expect(
    'and within the edge margin of one, it is not either',
    [portal.isVisible(under.x, under.y), portal.isVisible(under.x, under.y, 1)],
    [true, false]
  );

  // Covering only the tile's edge, 2px of it, still covers it: the tile's box is what's compared.
  let leftEdge = Math.floor(side / 4);

  while (leftEdge > 0) {
    const tile = portal.tileAt(leftEdge - 1, Math.floor(side / 2));

    if (tile?.x !== under.x || tile?.y !== under.y) {
      break;
    }

    leftEdge--;
  }

  portal.setCovered([
    { x: leftEdge - size + 2, y: 0, width: size, height: side },
  ]);

  expect(
    'a section over just the edge of a tile covers it',
    portal.isVisible(under.x, under.y),
    false
  );

  portal.setCovered([{ x: 0, y: 0, width: side, height: side }]);

  expect(
    'a section over the middle of the map hides nothing, as recentring could not help',
    portal.isVisible(under.x, under.y),
    true
  );

  // Measured from where the section is on the page, against the map's canvas there.
  place(mapPortal, {
    left: 100,
    top: 50,
    right: 100 + side,
    bottom: 50 + side,
  });
  place(sidebar, { left: 0, top: 0, right: 1000, bottom: 1000 });
  place(section, {
    left: 100,
    top: 50,
    right: 100 + side / 2,
    bottom: 50 + side,
  });
  mapView.measureCovered();

  expect(
    'a section measured over the left of the map covers the tile there',
    [portal.isVisible(under.x, under.y), portal.isVisible(clear.x, clear.y)],
    [false, true]
  );

  place(sidebar, { left: 0, top: 0, right: 100, bottom: 1000 });
  mapView.measureCovered();

  expect(
    'a section scrolled out of its sidebar covers nothing',
    portal.isVisible(under.x, under.y),
    true
  );

  place(sidebar, { left: 0, top: 0, right: 1000, bottom: 1000 });
  place(section, null);
  mapView.measureCovered();

  expect('nor does a hidden one', portal.isVisible(under.x, under.y), true);

  place(mapPortal, null);
  place(sidebar, null);

  // The whole world in view, and more: another copy of the tile is in sight.
  mapPortal.width = size * 20;
  mapPortal.height = size * 20;
  portal.setCovered([{ x: 0, y: 0, width: size * 10, height: size * 20 }]);

  expect(
    'a view bigger than the world shows the tile again, so a section hides nothing',
    portal.isVisible(under.x, under.y),
    true
  );

  portal.setCovered([]);
}

mapView.dispose();

expect(
  'dispose stops watching it',
  observed.flatMap(({ targets }) => targets),
  []
);

expect('dispose stops the tick', cleared.length, 1);

mapPortal.width = 10;
window.dispatchEvent(new Event('resize'));

expect('and the resize handler', mapPortal.width, 10);

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL mapView (${failures.length} of ${checks} checks)\n  ${failures.join(
      '\n  '
    )}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS mapView (${checks} checks)\n`);
