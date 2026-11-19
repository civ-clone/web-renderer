// The map's zoom (#1063): each set's own option (`zoom.<id>`) and the map scale carried over into it once; its range
//  and default; the portal drawing at the whole scale at or above it with its canvas sized to be shown smaller; a click,
//  a drag and a tooltip's box converted between the page's px and the canvas's, on the square and isometric grids; the
//  Options slider; and the mouse wheel, a trackpad's pinch and the keys (#1101), about the pointer, a frame at a time.

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
import GameOptions, {
  unitSizeRow,
  walkRows,
} from '@civ-clone/ui-menus/components/GameOptions';
import {
  MAP3D_RIVALS_WALK_OPTION,
  MAP3D_UNIT_SIZE_OPTION,
  MAP3D_WALKS_OPTION,
} from '@civ-clone/ui-client/lib/map3dOptions';
import GamePortal from '@civ-clone/ui-game/GamePortal';
import MapPortal from '@civ-clone/ui-map/MapPortal';
import { scaleOfZoom } from '@civ-clone/ui-map/components/Portal';
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
// Frames are run by hand (`nextFrame`): a drag let go glides on, and the wheel's zoom waits for the next.
let frames: Array<(time: number) => void> = [];

(globalThis as any).window.requestAnimationFrame = (
  callback: (time: number) => void
): number => frames.push(callback);
(globalThis as any).window.cancelAnimationFrame = () => {};

// Runs what's waiting for the next frame, and drops any glide that asks for another.
const nextFrame = (): void => {
  const waiting = frames;

  frames = [];
  waiting.forEach((callback) => callback(0));
  frames = [];
};
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

// linkedom has no `WheelEvent`: one with what the portal reads, turned `deltaY` at `x`, `y` in the page's px over the
//  canvas. Whether it was default-prevented.
const wheel = (
  canvas: HTMLCanvasElement,
  deltaY: number,
  {
    ctrlKey = false,
    deltaMode = 0,
    timeStamp = 0,
    x = 60,
    y = 45,
  }: {
    ctrlKey?: boolean;
    deltaMode?: number;
    timeStamp?: number;
    x?: number;
    y?: number;
  } = {}
): boolean => {
  const event = new Event('wheel', { cancelable: true });

  Object.entries({
    ctrlKey,
    deltaMode,
    deltaX: 0,
    deltaY,
    offsetX: x,
    offsetY: y,
    timeStamp,
  }).forEach(([key, value]) => Object.defineProperty(event, key, { value }));

  canvas.dispatchEvent(event);

  return event.defaultPrevented;
};

// linkedom has no `GestureEvent`: Safari's trackpad pinch (#1138), its `type` (`gesturestart`, `gesturechange` or
//  `gestureend`), at `scale` times the size it began at, at `x`, `y` in the page's px from the window's corner (none,
//  as iOS's has none, where `x` is `null`). Whether it was default-prevented.
const gesture = (
  canvas: HTMLCanvasElement,
  type: string,
  scale: number,
  {
    timeStamp = 0,
    x = 110,
    y = 70,
  }: { timeStamp?: number; x?: number | null; y?: number } = {}
): boolean => {
  const event = new Event(type, { cancelable: true });

  Object.entries({
    scale,
    timeStamp,
    ...(x === null ? {} : { clientX: x, clientY: y }),
  }).forEach(([key, value]) => Object.defineProperty(event, key, { value }));

  canvas.dispatchEvent(event);

  return event.defaultPrevented;
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

// Whether the spot of the world at each anchor, in the page's px, is still under it once the map is zoomed from `from` to
//  `to` about it, centred on `centre`, to within a px: the ones that moved, and how far.
const anchorHolds = (
  topologyId: string,
  from: number,
  to: number,
  [centreX, centreY]: [number, number] = [6, 6],
  anchors: Array<[number, number]> = [
    [30, 20],
    [120, 90],
    [205, 160],
  ]
): string[] => {
  const moved: string[] = [];

  anchors.forEach(([x, y]) => {
    const { portal } = gameMap(topologyId, from);

    portal.setCenter(centreX, centreY);
    // Off the middle of a square, as a drag leaves it.
    portal.scrollBy(7, -5);

    const square = portal.squareAt(...portal.toCanvas(x, y))!,
      before = portal.toPage(square.box),
      // How far across and down its square the anchor is.
      across = (x - before.x) / before.width,
      down = (y - before.y) / before.height;

    portal.setZoom(to, { x, y });

    // The copy of the square under the anchor now: a canvas wider than the world shows a square more than once.
    const now = portal.squareAt(...portal.toCanvas(x, y))!;

    if (now.tile.x !== square.tile.x || now.tile.y !== square.tile.y) {
      moved.push(
        `${from} → ${to} at ${x},${y}: ${now.tile.x},${now.tile.y} is under it, not ${square.tile.x},${square.tile.y}`
      );

      return;
    }

    const after = portal.toPage(now.box),
      spotX = after.x + across * after.width,
      spotY = after.y + down * after.height;

    if (Math.abs(spotX - x) > 1 || Math.abs(spotY - y) > 1) {
      moved.push(
        `${from} → ${to} at ${x},${y}: the spot is at ${spotX.toFixed(
          1
        )},${spotY.toFixed(1)}`
      );
    }
  });

  return moved;
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
      } as unknown as MapPortal),
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

  // The size of the 3D map's units: only under `?3d=1`, from half life size to half as big again in quarters, at the
  //  size kept, saying what it's at; let go, the size is kept, which the 3D map draws its units at.
  {
    const unitSizes = (search: string) =>
        unitSizeRow(search).map(
          (row) => row.querySelector('input') as HTMLInputElement
        ),
      [slider] = unitSizes('?3d=1'),
      shown = () => slider?.parentElement?.querySelector('output')?.textContent,
      atFirst = [
        slider?.getAttribute('min'),
        slider?.getAttribute('max'),
        slider?.getAttribute('step'),
        slider?.value,
        shown(),
      ];

    slider!.value = '1.25';
    slider!.dispatchEvent(new Event('input'));

    const moving = [shown(), options.get(MAP3D_UNIT_SIZE_OPTION)];

    slider!.dispatchEvent(new Event('change'));

    expect(
      "Options has the 3D map's unit size under ?3d=1 only, from half to half as big again in quarters, at life size, kept once it's let go",
      [
        unitSizes('').length,
        unitSizes('?3d=0').length,
        atFirst,
        moving,
        [shown(), options.get(MAP3D_UNIT_SIZE_OPTION)],
        unitSizes('?3d=1')[0]?.value,
      ],
      [
        0,
        0,
        ['0.5', '1.5', '0.25', '1', '1×'],
        ['1.25×', 1],
        ['1.25×', 1.25],
        '1.25',
      ]
    );

    options.set(MAP3D_UNIT_SIZE_OPTION, 1);

    // How the 3D map's units move, and whether others' are shown moving: only under `?3d=1`, walking and shown as they
    //  come, and kept as they're chosen. A way the page doesn't know is walking.
    const walks = walkRows('?3d=1'),
      select = walks[0]?.querySelector('select') as HTMLSelectElement,
      rivals = walks[1]?.querySelector('input') as HTMLInputElement,
      asFirst = [
        [...select.querySelectorAll('option')].map(({ value }) => value),
        select.value,
        rivals.hasAttribute('checked'),
      ];

    // As the test's DOM keeps a select's choice: by the attribute.
    select.querySelectorAll('option').forEach((option) => {
      option.toggleAttribute('selected', option.value === 'fast');
    });
    select.dispatchEvent(new Event('change'));
    rivals.checked = false;
    rivals.dispatchEvent(new Event('change'));

    const chosen = [
      options.get(MAP3D_WALKS_OPTION),
      options.get(MAP3D_RIVALS_WALK_OPTION),
    ];

    // Opened again: as chosen.
    const reopened = walkRows('?3d=1'),
      asChosen = [
        reopened[0]?.querySelector('option[selected]')?.getAttribute('value'),
        reopened[1]?.querySelector('input')?.hasAttribute('checked'),
      ];

    options.set(MAP3D_WALKS_OPTION, 'sideways');

    const unknown = (
      walkRows('?3d=1')[0]?.querySelector('select') as
        | HTMLSelectElement
        | undefined
    )?.value;

    options.set(MAP3D_WALKS_OPTION, 'normal');
    options.set(MAP3D_RIVALS_WALK_OPTION, true);

    expect(
      "Options has how the 3D map's units move, and whether others' are shown moving, under ?3d=1 only: walking and shown at first, kept as chosen, and as chosen opened again; a way it doesn't know is walking",
      [walkRows('').length, walks.length, asFirst, chosen, asChosen, unknown],
      [
        0,
        2,
        [['normal', 'fast', 'off'], 'normal', true],
        ['fast', false],
        ['fast', false],
        'normal',
      ]
    );

    // The Options window has it on a page that asked for the 3D map, and not on one that didn't.
    const location = Object.getOwnPropertyDescriptor(globalThis, 'location'),
      windowFor = (search: string): boolean[] => {
        Object.defineProperty(globalThis, 'location', {
          configurable: true,
          value: { search },
        });

        const optionsWindow = new GameOptions(null),
          element = optionsWindow.element(),
          found = [
            element.querySelector('input[type="range"][step="0.25"]') !== null,
            // How units move: the select with walking, quickly and at once.
            [...element.querySelectorAll('select')].some((select) =>
              ['normal', 'fast', 'off'].every(
                (speed) =>
                  select.querySelector(`option[value="${speed}"]`) !== null
              )
            ),
          ];

        optionsWindow.close();

        return found;
      },
      inWindow = [windowFor('?3d=1'), windowFor('')];

    if (location === undefined) {
      delete (globalThis as { location?: unknown }).location;
    } else {
      Object.defineProperty(globalThis, 'location', location);
    }

    expect(
      "the Options window has the 3D map's unit size, and how its units move, where the page asked for the 3D map, and not otherwise",
      inWindow,
      [
        [true, true],
        [false, false],
      ]
    );
  }

  // Zoomed about a point (#1101): the spot of the world under it stays there, within a whole scale and across one.
  (
    [
      ['square', 1.5, 1.6],
      ['square', 1.6, 1.5],
      ['square', 1.9, 2.1],
      ['square', 2, 1],
      ['square', 3.1, 2.4],
      ['staggered-iso', 1.4, 1.5],
      ['staggered-iso', 1, 1.1],
      ['staggered-iso', 2, 1.9],
      ['staggered-iso', 1.9, 1],
      ['hex-odd-r', 1, 1.1],
      ['hex-odd-r', 1.5, 1.4],
      ['hex-odd-r', 2, 1.3],
    ] as Array<[string, number, number]>
  ).forEach(([topologyId, from, to]) =>
    expect(
      `zoomed from ${from} to ${to} about a point on the ${topologyId} grid, the spot under it stays there`,
      anchorHolds(topologyId, from, to),
      []
    )
  );

  // Centred on the first column, the left of the canvas is the far side of the world, across its seam.
  (
    [
      ['square', 1.5, 2.3],
      ['square', 2.3, 1.2],
      ['staggered-iso', 1.3, 2],
      ['hex-odd-r', 1.2, 1.7],
    ] as Array<[string, number, number]>
  ).forEach(([topologyId, from, to]) =>
    expect(
      `zoomed from ${from} to ${to} about a point across the world's seam on the ${topologyId} grid, the spot stays there`,
      anchorHolds(topologyId, from, to, [0, 6]),
      []
    )
  );

  {
    const { portal } = gameMap('square', 1.5);

    portal.setLockVerticalEdges(true);
    portal.setCenter(6, 0);

    expect(
      'locked to the poles, zoomed about a point by the top, the map stops at the pole, where the clamp puts it, and nothing throws',
      [
        thrown(() => portal.setZoom(2.6, { x: 30, y: 10 })),
        portal.zoom(),
        portal.squareAt(...portal.toCanvas(120, 1)) !== null,
      ],
      [null, 2.6, true]
    );
  }

  {
    const { portal } = gameMap('square', 1.5);

    portal.setCenter(6, 6);
    portal.setZoom(2.3);

    expect(
      'zoomed with no point to keep still, the same square stays in the middle',
      [portal.center(), portal.zoom()],
      [{ x: 6, y: 6 }, 2.3]
    );
  }

  // The mouse wheel, a trackpad and the keys (#1101).
  {
    const { storage } = memoryStorage({ 'zoom.civ1': 1.5 });

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    setOptionDefaults();

    const { portal, canvas, clicked } = gameMap('square', 1.5),
      zoomed: number[] = [],
      anchors: unknown[] = [],
      setZoom = portal.setZoom.bind(portal);

    portal.setZoom = (zoom: number, anchor?: { x: number; y: number }) => {
      zoomed.push(zoom);
      anchors.push(anchor ?? null);
      setZoom(zoom, anchor);
    };

    const turned = (action: () => unknown) => {
      zoomed.length = 0;
      anchors.length = 0;

      const result = action();

      nextFrame();

      return [result, [...zoomed], options.get('zoom.civ1')];
    };

    expect(
      "a notch of the wheel away from the player zooms in a tenth on the next frame, about the pointer, kept as the slider keeps it, and the page doesn't scroll",
      [
        (() => {
          const prevented = wheel(canvas, -100, { x: 200, y: 30 });

          return [prevented, portal.zoom()];
        })(),
        turned(() => null),
        anchors.splice(0),
      ],
      [[true, 1.5], [null, [1.6], 1.6], [{ x: 200, y: 30 }]]
    );

    expect(
      'towards the player, out',
      turned(() => wheel(canvas, 100)),
      [true, [1.5], 1.5]
    );

    expect(
      'five quick notches within a frame zoom half a step at once, drawn once, about the last place the pointer was',
      [
        turned(() =>
          [1, 2, 3, 4, 5].map((t) =>
            wheel(canvas, -100, { timeStamp: t, x: 50 + t, y: 40 })
          )
        ),
        anchors.splice(0),
      ],
      [[[true, true, true, true, true], [2], 2], [{ x: 55, y: 40 }]]
    );

    expect(
      "a trackpad's two-finger scroll makes a tenth as it starts, and adds up the rest until it has turned a notch's worth",
      [
        turned(() =>
          [1, 2, 3, 4, 5].map((t) => wheel(canvas, 12, { timeStamp: 100 + t }))
        ),
        turned(() => wheel(canvas, 12, { timeStamp: 106 })),
      ],
      [
        [[true, true, true, true, true], [1.9], 1.9],
        [true, [1.8], 1.8],
      ]
    );

    expect(
      "a slow notch, after a pause, makes a tenth however little it turns, as some browsers' wheels turn a few px; and so does one turned back the other way",
      [
        turned(() => wheel(canvas, 4, { timeStamp: 1000 })),
        turned(() => {
          wheel(canvas, 4, { timeStamp: 1100 });

          return frames.length;
        }),
        turned(() => wheel(canvas, -4, { timeStamp: 1110 })),
      ],
      [
        [true, [1.7], 1.7],
        [0, [], 1.7],
        [true, [1.8], 1.8],
      ]
    );

    expect(
      "a pinch, the wheel with Ctrl held, zooms on smaller deltas, and isn't the page's zoom",
      turned(() => [
        wheel(canvas, -5, { ctrlKey: true, timeStamp: 3000 }),
        wheel(canvas, -5, { ctrlKey: true, timeStamp: 3001 }),
        wheel(canvas, -5, { ctrlKey: true, timeStamp: 3002 }),
      ]),
      [[true, true, true], [2], 2]
    );

    expect(
      'a wheel counted in lines makes a tenth each time it turns',
      turned(() => [
        wheel(canvas, 3, { deltaMode: 1, timeStamp: 4000 }),
        wheel(canvas, 3, { deltaMode: 1, timeStamp: 4010 }),
      ]),
      [[true, true], [1.8], 1.8]
    );

    expect(
      'zooming by steps, as the keys do, is about the middle and kept the same way',
      turned(() => {
        portal.setCenter(6, 6);
        portal.zoomBy(3);

        return portal.center();
      }).concat([portal.center(), portal.zoom(), anchors.splice(0)]),
      [{ x: 6, y: 6 }, [2.1], 2.1, { x: 6, y: 6 }, 2.1, [null]]
    );

    expect(
      "the zoom stops at the set's largest, and past it nothing is asked for",
      [
        turned(() => portal.zoomBy(30)),
        turned(() => {
          portal.zoomBy(1);

          return frames.length;
        }),
      ],
      [
        [undefined, [4], 4],
        [0, [], 4],
      ]
    );

    expect(
      'and at its smallest',
      [
        turned(() => portal.zoomBy(-50)),
        turned(() => {
          wheel(canvas, 100, { timeStamp: 5000 });

          return frames.length;
        }),
      ],
      [
        [undefined, [1], 1],
        [0, [], 1],
      ]
    );

    expect(
      "a trackpad's flick, running on with no pause as it slows, zooms a whole scale at most, and the rest of it does nothing but isn't the page's (#1139)",
      [
        turned(() =>
          Array.from({ length: 60 }, (_, i) =>
            wheel(canvas, -(200 - i * 3), { timeStamp: 6000 + i * 16 })
          ).every((prevented) => prevented)
        ),
        turned(() => {
          wheel(canvas, -40, { timeStamp: 6000 + 60 * 16 });

          return frames.length;
        }),
      ],
      [
        [true, [2], 2],
        [0, [], 2],
      ]
    );

    expect(
      'after a pause the wheel zooms again, and turned back the other way a flick goes as far out',
      [
        turned(() => wheel(canvas, -100, { timeStamp: 8000 })),
        turned(() =>
          Array.from({ length: 30 }, (_, i) =>
            wheel(canvas, 150, { timeStamp: 8010 + i * 16 })
          )
        ).slice(1),
      ],
      [
        [true, [2.1], 2.1],
        [[1.1], 1.1],
      ]
    );

    expect(
      'a pinch, and a wheel counted in lines, go as far as they turn',
      [
        turned(() =>
          Array.from({ length: 15 }, (_, i) =>
            wheel(canvas, -8, { ctrlKey: true, timeStamp: 9000 + i })
          )
        ).slice(1),
        turned(() =>
          Array.from({ length: 12 }, (_, i) =>
            wheel(canvas, 3, { deltaMode: 1, timeStamp: 9100 + i * 16 })
          )
        ).slice(1),
      ],
      [
        [[2.6], 2.6],
        [[1.4], 1.4],
      ]
    );

    // Safari's pinch (#1138), on a canvas 10 px from the window's left and 20 from its top.
    canvas.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 240, height: 180 } as DOMRect);

    const pinch = (type: string, scale: number, timeStamp = 9500) =>
      gesture(canvas, type, scale, { timeStamp });

    expect(
      "Safari's pinch zooms with the fingers, from the zoom it began at, about where they are, and isn't the page's zoom",
      [
        turned(() => [pinch('gesturestart', 1), pinch('gesturechange', 1.02)]),
        turned(() => pinch('gesturechange', 1.5)),
        anchors.splice(0),
        turned(() => [pinch('gesturechange', 1.7), pinch('gesturechange', 2)]),
      ],
      [
        [[true, true], [], 1.4],
        [true, [2.1], 2.1],
        [{ x: 100, y: 50 }],
        [[true, true], [2.8], 2.8],
      ]
    );

    expect(
      'pinched past the smallest, it stops there, and zooms in again as soon as the fingers spread again',
      [
        turned(() => pinch('gesturechange', 0.5)),
        turned(() => pinch('gesturechange', 0.4)),
        turned(() => pinch('gesturechange', 0.6)),
      ],
      [
        [true, [1], 1],
        [true, [], 1],
        [true, [1.5], 1.5],
      ]
    );

    expect(
      'while it pinches, the wheel with Ctrl held, should Safari send it too, does nothing; once it ends, it zooms again, and a change to a pinch that began elsewhere does nothing',
      [
        turned(() => wheel(canvas, -100, { ctrlKey: true, timeStamp: 9600 })),
        turned(() => [
          pinch('gestureend', 0.6, 9610),
          wheel(canvas, -100, { ctrlKey: true, timeStamp: 11000 }),
        ]),
        turned(() => pinch('gesturechange', 3, 11010)),
      ],
      [
        [true, [], 1.5],
        [[true, true], [1.6], 1.6],
        [true, [], 1.6],
      ]
    );

    expect(
      'a pinch whose end never came stops swallowing the wheel once it has been still a moment',
      [
        turned(() => [
          pinch('gesturestart', 1, 12000),
          wheel(canvas, -100, { ctrlKey: true, timeStamp: 12100 }),
        ]),
        turned(() => wheel(canvas, -100, { ctrlKey: true, timeStamp: 13000 })),
      ],
      [
        [[true, true], [], 1.6],
        [true, [1.7], 1.7],
      ]
    );

    expect(
      "iOS's pinch, which says nowhere, zooms about the middle",
      [
        turned(() => [
          gesture(canvas, 'gesturestart', 1, { x: null }),
          gesture(canvas, 'gesturechange', 1.5, { x: null }),
          gesture(canvas, 'gestureend', 1.5, { x: null }),
        ]),
        anchors.splice(0),
      ],
      [[[true, true, true], [2.6], 2.6], [null]]
    );

    expect(
      'a pinch that begins while a zoom waits for the frame measures from that zoom',
      turned(() => {
        portal.zoomBy(-5);
        pinch('gesturestart', 1);
        pinch('gesturechange', 1.01);
        pinch('gestureend', 1.01);

        return null;
      }),
      [null, [2.1], 2.1]
    );

    expect(
      "a pinch on a touch screen is the first finger's too: let go, it isn't a click on the map",
      (() => {
        clicked.length = 0;
        pointer(canvas, 'pointerdown', 100, 100);
        pinch('gesturestart', 1);
        pinch('gestureend', 1);
        pointer(canvas, 'pointerup', 100, 100);

        return [...clicked];
      })(),
      []
    );

    turned(() => portal.zoomBy(-50));
    turned(() => portal.zoomBy(7));

    const optionsWindow = new GameOptions(portal as unknown as MapPortal),
      slider = optionsWindow
        .element()
        .querySelector('input[type="range"][step="0.1"]') as HTMLInputElement;

    expect(
      'Options opened after the wheel or the keys zoomed the map shows the zoom they left it at',
      [portal.zoom(), slider.value],
      [1.7, '1.7']
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
