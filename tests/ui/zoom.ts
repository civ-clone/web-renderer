// The map's zoom (#1063): each set's own option (`zoom.<id>`) and the map scale carried over into it once; its range
//  and default; the portal drawing at the whole scale at or above it with its canvas sized to be shown smaller; a click,
//  a drag and a tooltip's box converted between the page's px and the canvas's, on the square and isometric grids; and
//  the Options slider.

// Must stay first: `GamePortal` reaches windows that read `document.body` as they load.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/classicInterface';
import './lib/grids';
import './lib/artPacks';

import {
  defaultZoom,
  mapTileset,
  nativeTileSize,
  zoomFor,
  zoomOption,
  zoomOptionFromMapScale,
  zoomRange,
} from '@civ-clone/ui-assets/lib/tilesets';
import GameOptionsRegistry, {
  OptionStorage,
  instance as options,
} from '@civ-clone/ui-platform/GameOptionsRegistry';
import GameOptions from '@civ-clone/ui-menus/components/GameOptions';
import GamePortal from '@civ-clone/ui-game/GamePortal';
import { IPortal, scaleOfZoom } from '@civ-clone/ui-map/components/Portal';
import World from '@civ-clone/ui-map/components/World';
import { applyInterface } from '@civ-clone/ui-platform/lib/interfaceMode';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import civ1Json from '@civ-clone/ui-tileset-civ1/civ1.json';
import i18next from 'i18next';
import setOptionDefaults from '@civ-clone/ui-game/app/options';
import { validateDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL zoom: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const thrown = (action: () => unknown): string | null => {
  try {
    action();

    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

// linkedom has no canvas context: one that draws nothing, and reads back blank pixels for a unit's colours.
const blank = (width: number, height: number) => ({
  data: new Uint8ClampedArray(Math.max(1, width * height) * 4),
  width,
  height,
});

(globalThis as any).HTMLCanvasElement.prototype.getContext = () =>
  new Proxy(
    {
      getImageData: (x: number, y: number, w: number, h: number) => blank(w, h),
      createImageData: blank,
      measureText: (text: string) => ({ width: String(text).length * 6 }),
    } as {
      [key: string]: unknown;
    },
    {
      get: (target, key: string) => (key in target ? target[key] : () => {}),
      set: (target, key: string, value) => {
        target[key] = value;

        return true;
      },
    }
  );
(document as any).elementFromPoint = () => null;
// A drag let go glides on: not here, where nothing draws frames.
(globalThis as any).window.requestAnimationFrame = () => 0;
(globalThis as any).window.cancelAnimationFrame = () => {};
(globalThis as any).MouseEvent ??= Event;

// No assets: nothing is drawn.
assetStore.spriteURL = () => new Promise(() => {});
assetStore.shownAtURL = () => new Promise(() => {});

const memoryStorage = (initial: { [key: string]: unknown } = {}) => {
  const items: { [key: string]: string } = {
    gameOptions: JSON.stringify(initial),
  };

  return {
    stored: (): { [key: string]: unknown } =>
      JSON.parse(items.gameOptions ?? '{}'),
    storage: {
      getItem: (key: string) => items[key] ?? null,
      setItem: (key: string, value: string) => {
        items[key] = value;
      },
    } as OptionStorage,
  };
};

// A canvas shown in a box `width` × `height` in the page's px, as the page lays it out: linkedom does no layout.
const shownCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas') as HTMLCanvasElement;

  canvas.width = width;
  canvas.height = height;
  canvas.setPointerCapture = () => {};
  Object.defineProperty(canvas, 'clientWidth', { get: () => width });
  Object.defineProperty(canvas, 'clientHeight', { get: () => height });

  return canvas;
};

const tiles = (width: number, height: number): any[] => {
  const tiles: any[] = [];

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      tiles.push({ x, y, yields: [], improvements: [], city: null, units: [] });
    }
  }

  return tiles;
};

// linkedom has no `PointerEvent`: an event with what the portal reads, at `x`, `y` in the page's px over the canvas.
const pointer = (
  canvas: HTMLCanvasElement,
  type: string,
  x: number,
  y: number
): void => {
  const event = new Event(type, { cancelable: true });

  Object.entries({
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x,
    clientY: y,
    isPrimary: true,
    offsetX: x,
    offsetY: y,
    pageX: x,
    pageY: y,
    pointerId: 7,
    pointerType: 'touch',
    timeStamp: 0,
    x,
    y,
  }).forEach(([key, value]) => Object.defineProperty(event, key, { value }));

  canvas.dispatchEvent(event);
};

// A game's map on `topologyId`'s grid, `width` × `height` squares, at `zoom`, its canvas shown in a 240 × 180 box.
const gameMap = (
  topologyId: string,
  zoom: number,
  width = 12,
  height = 12
): { portal: GamePortal; canvas: HTMLCanvasElement; clicked: string[] } => {
  const tileset = mapTileset(topologyId),
    canvas = shownCanvas(240, 180),
    clicked: string[] = [],
    portal = new GamePortal(
      new World({
        width,
        height,
        topologyId,
        tiles: tiles(width, height),
      } as any),
      { send: () => {}, receive: () => () => {} } as any,
      canvas,
      {
        playerId: 'Player-1',
        scale: tileset.defaultScale,
        zoom,
        tileSize: nativeTileSize(tileset),
      }
    );

  portal.fit(240, 180);
  portal.on('tile-clicked', (x: number, y: number) =>
    clicked.push(`${x},${y}`)
  );

  return { portal, canvas, clicked };
};

// The square each click lands on, clicked in the page's px at the middle of where it's shown, for each square drawn
//  well inside the canvas: the ones it should be.
const clicksLand = (topologyId: string, zoom: number): string[] => {
  const { portal, canvas, clicked } = gameMap(topologyId, zoom),
    wrong: string[] = [];

  for (let x = 4; x <= 8; x++) {
    for (let y = 4; y <= 8; y++) {
      // A click on a square centres the map on it: back to the same middle for each.
      portal.setCenter(6, 6);

      const box = portal.boxOf({ x, y }),
        { x: left, y: top, width, height } = portal.toPage(box),
        pageX = left + width / 2,
        pageY = top + height / 2;

      if (pageX < 0 || pageY < 0 || pageX >= 240 || pageY >= 180) {
        continue;
      }

      clicked.length = 0;
      pointer(canvas, 'pointerdown', pageX, pageY);
      pointer(canvas, 'pointerup', pageX, pageY);

      if (clicked.join() !== `${x},${y}`) {
        wrong.push(`${x},${y} → ${clicked.join()}`);
      }
    }
  }

  return wrong;
};

const run = async (): Promise<void> => {
  applyInterface('classic', null);

  const civ1 = mapTileset('square'),
    civ2 = mapTileset('staggered-iso');

  // Each set's own zoom, its range and its default.
  expect(
    "each set's zoom is its own option, with no special case for Civ1's",
    [zoomOption(civ1), zoomOption(civ2)],
    ['zoom.civ1', 'zoom.civ2']
  );
  expect(
    'the zoom runs from the smallest scale to the largest: Civ1 from 1 to 4, Civ2 from 1 to 2',
    [zoomRange(civ1), zoomRange(civ2)],
    [
      { min: 1, max: 4 },
      { min: 1, max: 2 },
    ]
  );
  expect(
    "each set names its default: Civ1's 2, Civ2's 1.4",
    [defaultZoom(civ1), defaultZoom(civ2)],
    [2, 1.4]
  );
  expect(
    'a zoom kept is held within the range and to a tenth, and one that is not a number is the default',
    [
      zoomFor(civ1, 2.5),
      zoomFor(civ1, 2.04),
      zoomFor(civ1, 1.2000000001),
      zoomFor(civ1, 5),
      zoomFor(civ1, 0.5),
      zoomFor(civ2, 3),
      zoomFor(civ1, '3'),
      zoomFor(civ1, NaN),
      zoomFor(civ2, null),
    ],
    [2.5, 2, 1.2, 4, 1, 2, 2, 2, 1.4]
  );

  // A set's descriptor can name a default zoom between its scales, in tenths.
  const civ1With = (changes: object): unknown => ({
    ...JSON.parse(JSON.stringify(civ1Json)),
    ...changes,
  });

  expect(
    'a default zoom within the scales, in tenths, is read; one past them, or between tenths, is refused',
    [
      validateDescriptor(civ1With({ defaultZoom: 2.7 })).defaultZoom,
      thrown(() => validateDescriptor(civ1With({ defaultZoom: 4.5 }))),
      thrown(() => validateDescriptor(civ1With({ defaultZoom: 1.25 }))),
    ],
    [
      2.7,
      'Tileset "civ1": defaultZoom 4.5 is not a tenth from the smallest of scales to the largest.',
      'Tileset "civ1": defaultZoom 1.25 is not a tenth from the smallest of scales to the largest.',
    ]
  );

  // The map scale carried over into the zoom, once.
  expect(
    "the map scale's options become the zooms': Civ1's `mapScale`, and another set's `mapScale.<id>`",
    [
      zoomOptionFromMapScale('mapScale'),
      zoomOptionFromMapScale('mapScale.civ2'),
      zoomOptionFromMapScale('mapScale.hex-pixelart'),
      zoomOptionFromMapScale('autosave'),
    ],
    ['zoom.civ1', 'zoom.civ2', 'zoom.hex-pixelart', null]
  );

  {
    const { storage, stored } = memoryStorage({
      mapScale: 3,
      'mapScale.civ2': 2,
      'mapScale.hex-pixelart': 2,
      autosave: '1',
    });

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    setOptionDefaults();

    expect(
      'the scales a player chose are their zooms on the first start after, and the old options are gone, the others as they were',
      [options.get('zoom.civ1'), options.get('zoom.civ2'), stored()],
      [
        3,
        2,
        {
          autosave: '1',
          'zoom.civ1': 3,
          'zoom.civ2': 2,
          'zoom.hex-pixelart': 2,
        },
      ]
    );

    options.set('zoom.civ1', 2.6);
    setOptionDefaults();

    expect(
      'once carried over, a zoom chosen since stays on the next start',
      options.get('zoom.civ1'),
      2.6
    );
  }

  {
    const { storage, stored } = memoryStorage({
      mapScale: 3,
      'zoom.civ1': 1.5,
    });
    const registry = new GameOptionsRegistry(() => storage);

    registry.rename(zoomOptionFromMapScale);

    expect(
      'a zoom kept already wins over a map scale left behind, which goes',
      stored(),
      { 'zoom.civ1': 1.5 }
    );

    const blocked = new GameOptionsRegistry(() => {
      throw new Error('blocked');
    });

    expect(
      'with storage blocked, there is nothing to carry over, and nothing throws',
      thrown(() => blocked.rename(zoomOptionFromMapScale)),
      null
    );
  }

  {
    const { storage } = memoryStorage({});

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    setOptionDefaults();

    expect(
      'a set with no zoom kept starts at its default',
      [options.get('zoom.civ1'), options.get('zoom.civ2')],
      [2, 1.4]
    );
  }

  // The whole scale the map is drawn at.
  expect(
    'a whole zoom is drawn at itself, and one between at the next whole scale up',
    [1, 1.1, 1.4, 2, 2.0000000001, 2.1, 3.9, 4].map(scaleOfZoom),
    [1, 2, 2, 2, 2, 3, 4, 4]
  );

  // The portal, its canvas and the page.
  {
    const { portal, canvas } = gameMap('square', 1.5),
      resized: number[] = [];

    portal.on('resized', () => resized.push(canvas.width));

    expect(
      'at 1.5 the map is drawn at 2, its canvas a third bigger than its box, to be shown smaller',
      [portal.zoom(), portal.scale(), canvas.width, canvas.height],
      [1.5, 2, 320, 240]
    );
    expect(
      "the page's px to the canvas's, and a box on the canvas back to the page's",
      [
        portal.toCanvas(30, 15),
        portal.toPage({ x: 40, y: 20, width: 32, height: 32 }),
      ],
      [[40, 20], { x: 30, y: 15, width: 24, height: 24 }]
    );

    portal.setZoom(1.8);
    const at18 = [portal.scale(), canvas.width, canvas.height];

    portal.setZoom(2);
    const at2 = [portal.scale(), canvas.width, canvas.height];

    portal.setZoom(2.1);
    const at21 = [portal.scale(), canvas.width, canvas.height];

    portal.setZoom(2.1000000001);

    expect(
      'each new zoom sizes the canvas again, drawn at the same whole scale or the next: whole, the canvas is its box',
      [at18, at2, at21, [portal.scale(), canvas.width, canvas.height]],
      [
        [2, 267, 200],
        [2, 240, 180],
        [3, 343, 257],
        [3, 343, 257],
      ]
    );
    expect('and says so each time, before it draws', resized, [267, 240, 343]);

    portal.setScale(1);

    expect(
      'a whole scale set is that zoom, the canvas its box',
      [portal.zoom(), portal.scale(), canvas.width],
      [1, 1, 240]
    );

    expect(
      'refitted to a box of the same size, the canvas is left alone; to another, it follows',
      [portal.fit(240, 180), portal.fit(300, 150), canvas.width, canvas.height],
      [false, true, 300, 150]
    );
  }

  {
    const canvas = shownCanvas(64, 64),
      portal = new GamePortal(
        new World({ width: 4, height: 4, tiles: tiles(4, 4) } as any),
        { send: () => {}, receive: () => () => {} } as any,
        canvas,
        { playerId: null, scale: 3, tileSize: { width: 16, height: 16 } }
      );

    expect(
      "a portal given a scale and no zoom (the city screen's) is zoomed to its scale, and nothing converts",
      [portal.zoom(), portal.scale(), portal.toCanvas(10, 20)],
      [3, 3, [10, 20]]
    );
  }

  // A click lands on the square shown under it, at whole zooms and between them, on both grids.
  [1, 1.3, 1.5, 2, 2.7, 3.1].forEach((zoom) =>
    expect(
      `a click on the square grid at ${zoom} lands on the square under it`,
      clicksLand('square', zoom),
      []
    )
  );
  [1, 1.2, 1.4, 1.8, 2].forEach((zoom) =>
    expect(
      `a click on the isometric grid at ${zoom} lands on the square under it`,
      clicksLand('staggered-iso', zoom),
      []
    )
  );

  // A drag moves the map as far on the page as the pointer moves.
  {
    const { portal, canvas } = gameMap('square', 1.5);

    portal.setCenter(6, 6);

    const before = portal.toPage(portal.boxOf({ x: 6, y: 6 }));

    pointer(canvas, 'pointerdown', 100, 100);
    pointer(canvas, 'pointermove', 112, 100);
    pointer(canvas, 'pointermove', 130, 109);
    pointer(canvas, 'pointerup', 130, 109);

    const after = portal.toPage(portal.boxOf({ x: 6, y: 6 }));

    expect(
      "a drag of 30 × 9 of the page's px moves the square under it as far on the page",
      [after.x - before.x, after.y - before.y],
      [30, 9]
    );
  }

  // The Options slider.
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('./lib/strings');

  {
    const { storage } = memoryStorage({ 'zoom.civ1': 1.5 });

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    setOptionDefaults();

    const zoomed: number[] = [],
      optionsWindow = new GameOptions({
        lockVerticalEdges: () => false,
        scale: () => 2,
        zoom: () => 1.5,
        setZoom: (zoom: number) => zoomed.push(zoom),
      } as unknown as IPortal),
      slider = optionsWindow
        .element()
        .querySelector('input[type="range"][step="0.1"]') as HTMLInputElement,
      shown = () => slider.parentElement?.querySelector('output')?.textContent;

    expect(
      "Options has a slider in tenths over the set's scales, at the zoom kept, saying what it's at",
      // linkedom reflects only `value` of these.
      [
        slider.getAttribute('min'),
        slider.getAttribute('max'),
        slider.value,
        shown(),
      ],
      ['1', '4', '1.5', '1.5×']
    );

    slider.value = '2.7';
    slider.dispatchEvent(new Event('input'));

    const moving = [shown(), zoomed.length, options.get('zoom.civ1')];

    slider.dispatchEvent(new Event('change'));

    expect(
      "moved, it says the zoom as it goes, and once it's let go the map is zoomed and the zoom kept",
      [moving, [shown(), zoomed, options.get('zoom.civ1')]],
      [
        ['2.7×', 0, 1.5],
        ['2.7×', [2.7], 2.7],
      ]
    );

    optionsWindow.close();
  }

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL zoom (${failures.length} of ${checks} checks)\n  ${failures.join(
        '\n  '
      )}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS zoom (${checks} checks)\n`);
};

run().catch((error) => {
  process.stderr.write(`FAIL zoom: ${error?.stack ?? error}\n`);
  process.exit(1);
});
