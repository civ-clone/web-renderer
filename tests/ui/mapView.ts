// The map's upkeep, out of `Renderer.ts` (#344): a tile a patch changed is drawn only once the world has it
//  (`releaseTiles`), whether by the next render or the blink tick, each compositing the map and redrawing the minimap;
//  the yields start hidden and `t`/`y` toggle the layers and composite the map; `c` centres; the minimap marker reads
//  the active unit live; a tick with no blink and no tile draws nothing, nor does a resize that changes no size; and
//  `dispose` stops the tick and the resize handler. The canvas also follows its parent when that changes size alone,
//  as when the top bar above it fills in (#697).

// Must stay first: it gives the map a `document`.
import './lib/dom';
import './lib/classicInterface';

import { Tile, Unit, World as WorldData } from '../../src/js/UI/types';
import CityBanners from '../../src/js/UI/components/Map/CityBanners';
import MapView from '../../src/js/UI/game/MapView';
import { unitMarkerMode } from '../../src/js/UI/components/Map/UnitMarker';
import { playerCityOpener } from '../../src/js/UI/lib/cityOpeners';
import Transport from '../../src/js/UI/Transport';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';

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
  activeUnitReads = 0,
  // The player's choice of how the unit awaiting orders is marked (#753): the theme's, until a test chooses.
  unitMarker = 'theme';

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
  options: {
    get: (key: string, defaultValue?: any) =>
      key === 'unitMarker' ? unitMarker : defaultValue,
  },
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

// The mode: the player's choice, or the theme's for "the theme's way" (or a choice it doesn't know), or failing a theme
//  that says, the blink.
expect(
  'the mode: chosen, or the theme’s, or the blink',
  [
    unitMarkerMode('both', () => 'ring'),
    unitMarkerMode('theme', () => 'ring'),
    unitMarkerMode('theme', () => 'both'),
    unitMarkerMode('theme', () => ''),
    unitMarkerMode('sparkle', () => 'nonsense'),
  ],
  ['both', 'ring', 'both', 'blink', 'blink']
);

// How the unit is marked (#753). The test's page has no theme, so the theme's way is the blink, as above, with no
//  ring. A ring alone: the unit is drawn throughout, nothing is drawn again for it, and the ring is round its square.
const rings = (): Array<[string, string, string, string]> =>
  mapView.marker().element().hidden
    ? []
    : Array.from(mapView.marker().element().children).map((ring) => {
        const { left, top, width, height } = (ring as HTMLElement).style;

        return [left, top, width, height];
      });

// Where the layer last drew the unit, as it says once it has (`tests/ui/activeUnit.ts` checks it does): drawing a
//  unit here would need its sprites.
let drawnAt = [{ x: 64, y: 96, width: 32, height: 32 }];

mapView.activeUnitLayer.squares = () => drawnAt;
mapView.activeUnitLayer.setActiveUnit(activeUnit);
mapView.activeUnitLayer.setVisible(true);
portal.render();

expect('the theme’s way, here the blink, draws no ring', rings(), []);

const squares = mapView.activeUnitLayer.squares();

expect('the unit’s square, once in view', squares.length, 1);

unitMarker = 'ring';
counted();
tick();

expect(
  'a ring alone: the unit stays drawn, and the map isn’t drawn again (the minimap is, once, for the ring)',
  [mapView.activeUnitLayer.isVisible(), counted()],
  [true, [0, 1]]
);
expect(
  'and the ring is round its square',
  rings(),
  squares.map(({ x, y, width, height }) => [
    `${x}px`,
    `${y}px`,
    `${width}px`,
    `${height}px`,
  ])
);

tick();

expect(
  'nor at the next',
  [mapView.activeUnitLayer.isVisible(), counted()],
  [true, [0, 0]]
);

// Chosen while the blink had it hidden: drawn again at once, and kept.
unitMarker = 'blink';
tick();

expect(
  'back to the blink: it blinks, with no ring',
  [mapView.activeUnitLayer.isVisible(), rings()],
  [false, []]
);

unitMarker = 'ring';
counted();
tick();

expect(
  'a ring chosen with the unit blinked out draws it again, the minimap following the ring',
  [mapView.activeUnitLayer.isVisible(), counted(), rings().length],
  [true, [1, 2], 1]
);

// The map panned under the same unit: the ring moves, but the minimap's marker doesn't, and the portal's own
//  `focus-changed` redraws the minimap for the pan.
drawnAt = [{ x: 96, y: 96, width: 32, height: 32 }];
counted();
portal.render();

expect(
  'the ring following a pan doesn’t redraw the minimap',
  [counted(), rings()[0]],
  [
    [1, 0],
    ['96px', '96px', '32px', '32px'],
  ]
);

// Another unit made active, with no blink to redraw the minimap: the ring moving does.
activeUnit = { id: 'Unit-2', tile: tiles[12] } as unknown as Unit;
drawnAt = [{ x: 128, y: 32, width: 32, height: 32 }];
counted();
portal.render();

expect(
  'the ring moving to another unit redraws the minimap',
  [counted(), rings()[0]],
  [
    [1, 1],
    ['128px', '32px', '32px', '32px'],
  ]
);

counted();
portal.render();

expect('and not again, the ring where it was', counted(), [1, 0]);

unitMarker = 'both';
tick();

expect(
  'both: it blinks, ringed',
  [mapView.activeUnitLayer.isVisible(), rings().length],
  [false, 1]
);

tick();

expect(
  'and back, still ringed',
  [mapView.activeUnitLayer.isVisible(), rings().length],
  [true, 1]
);

// Whether the minimap, drawn now, marks the unit awaiting orders' square.
const minimapMarks = (): boolean => {
  const { x, y } = activeUnit!.tile,
    size = mapView.overviewLayer.canvas().width / width;

  minimapFills.length = 0;
  mapView.minimap.update();

  return minimapFills.some(
    ([left, top]) => left === x * size && top === y * size
  );
};

// `t` hides the unit awaiting orders and its ring with the other units, in every way of marking it, so the square under
//  it can be seen (#804); and brings them back.
for (const marker of ['ring', 'both', 'blink'] as const) {
  unitMarker = marker;
  tick();
  mapView.toggleUnits();

  expect(
    `${marker}: t hides the unit awaiting orders and its ring`,
    [mapView.activeUnitLayer.isVisible(), rings()],
    [false, []]
  );
  expect(
    `${marker}: but the minimap, an overview, still marks it`,
    minimapMarks(),
    true
  );

  counted();
  tick();
  tick();

  expect(
    `${marker}: and it stays hidden, with nothing drawn for it`,
    [mapView.activeUnitLayer.isVisible(), rings(), counted()[0]],
    [false, [], 0]
  );
  expect(`${marker}: and the minimap's marker steady`, minimapMarks(), true);

  mapView.toggleUnits();

  expect(
    `${marker}: t again shows it, ringed unless it blinks`,
    [mapView.activeUnitLayer.isVisible(), rings().length],
    [true, marker === 'blink' ? 0 : 1]
  );
}

// Hidden, then the units brought back by the unit awaiting orders moving (`ActiveUnitController#render` shows them):
//  the cities, their names and the ring follow at the next tick.
unitMarker = 'ring';
tick();
mapView.toggleUnits();
mapView.unitsLayer.setVisible(true);
mapView.activeUnitLayer.setVisible(true);
tick();

expect(
  'units shown again by a move bring back the cities, their names and the ring',
  [
    mapView.citiesLayer.isVisible(),
    mapView.cityNamesLayer.isVisible(),
    rings().length,
  ],
  [true, true, 1]
);

mapView.toggleUnits();

expect(
  'and t hides them all again',
  [
    mapView.unitsLayer.isVisible(),
    mapView.citiesLayer.isVisible(),
    mapView.activeUnitLayer.isVisible(),
    rings(),
  ],
  [false, false, false, []]
);

mapView.toggleUnits();

mapView.activeUnitLayer.setActiveUnit(null);
drawnAt = [];
portal.render();

expect('no unit awaiting orders, no ring', rings(), []);

unitMarker = 'theme';
mapView.activeUnitLayer.setVisible(true);

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

// The interface decides how the cities are named on the map: the classic labels, or the new interface's banners
//  (#747), which the classic theme draws as the labels.
applyInterface('new', null);

const withBanners = new MapView({
  activateUnit: () => {},
  cityOpener: playerCityOpener(),
  activeUnit: () => null,
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

expect(
  'the classic interface names cities with labels, the new one with banners',
  [
    mapView.cityNamesLayer instanceof CityBanners,
    withBanners.cityNamesLayer instanceof CityBanners,
  ],
  [false, true]
);

// The yields (y) hide the banners, wide enough to cover a row of them, without undoing t: with the yields gone they're
//  back only if the units are.
const shown = (): boolean[] => [
  withBanners.yieldsLayer.isVisible(),
  withBanners.unitsLayer.isVisible(),
  withBanners.cityNamesLayer.isVisible(),
];

withBanners.toggleYields();

expect('y hides the banners with the yields shown', shown(), [
  true,
  true,
  false,
]);

withBanners.toggleUnits();
withBanners.toggleYields();

expect('with the units hidden, y off leaves the banners hidden', shown(), [
  false,
  false,
  false,
]);

withBanners.toggleUnits();

expect('t brings them back with the units', shown(), [false, true, true]);

mapView.toggleYields();

expect(
  "the classic interface's labels stay with the yields shown, as before",
  mapView.cityNamesLayer.isVisible(),
  true
);

mapView.toggleYields();

withBanners.dispose();
applyInterface('classic', null);

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
