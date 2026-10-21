// Everything the map layers draw, and every number the portal works out, over a grid of worlds, scales, canvas sizes,
//  centres and drags, is the same as tests/ui/fixtures/render-geometry.json says. It was recorded before the tile and
//  pixel maths moved behind a `Projection` (#90), so it proves that move changed nothing anyone can see. `--update`
//  rewrites the fixture; set `RENDER_GEOMETRY_DUMP` to a path to write the whole recording there as well.

// Must stay first: it gives the layers a `document` and the preloaded images to draw with.
import { FakeImage, preloadImage } from './lib/fakeCanvas';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import i18next from 'i18next';
import ActiveUnit from '../../src/js/UI/components/Map/ActiveUnit';
import Cities from '../../src/js/UI/components/Map/Cities';
import CityNames from '../../src/js/UI/components/Map/CityNames';
import Fog from '../../src/js/UI/components/Map/Fog';
import Map from '../../src/js/UI/components/Map';
import Overview from '../../src/js/UI/components/Map/Overview';
import Portal from '../../src/js/UI/components/Portal';
import { Rect } from '../../src/js/UI/lib/viewport';
import { Tile } from '../../src/js/UI/types';
import Units from '../../src/js/UI/components/Map/Units';
import Unworkable from '../../src/js/UI/components/Map/Unworkable';
import World from '../../src/js/UI/components/World';
import Yields from '../../src/js/UI/components/Map/Yields';

const update = process.argv.includes('--update'),
  fixturePath = path.join(
    process.cwd(),
    'tests',
    'ui',
    'fixtures',
    'render-geometry.json'
  );

let passed = false;

const fail = (message: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL renderGeometry: ${message}${
      error ? `\n${(error as Error)?.stack ?? error}` : ''
    }\n`
  );

  process.exit(1);
};

process.on('exit', (code: number): void => {
  if (code === 0 && !passed) {
    process.stderr.write(
      'FAIL renderGeometry: stopped before the recording was compared\n'
    );
    process.exitCode = 1;
  }
});
process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

// A canvas whose context writes every call, and every property set, as one line. Images are written as their preload
// path and canvases as their name, so the recording is plain text and the same on every run.
const canvasNames = new WeakMap<object, string>(),
  canvasCalls = new WeakMap<object, string[]>(),
  errors: string[] = [];

const label = (value: unknown): string => {
  if (value instanceof FakeImage) {
    return `img:${value.path}`;
  }

  if (value !== null && typeof value === 'object') {
    return canvasNames.has(value)
      ? `canvas:${canvasNames.get(value)}`
      : JSON.stringify(value);
  }

  return String(value);
};

const recordingCanvas = (
  name: string,
  width: number,
  height: number
): HTMLCanvasElement => {
  const calls: string[] = [],
    state: { [key: string]: unknown } = {},
    context = new Proxy(
      {},
      {
        get: (target, property) => {
          if (typeof property !== 'string') {
            return undefined;
          }

          if (property in state) {
            return state[property];
          }

          return (...args: unknown[]) => {
            calls.push([property, ...args.map(label)].join(' '));

            if (property === 'measureText') {
              return { width: String(args[0]).length * 10 };
            }

            return undefined;
          };
        },
        set: (target, property, value) => {
          state[String(property)] = value;
          calls.push(`${String(property)}=${label(value)}`);

          return true;
        },
      }
    ),
    canvas = { width, height, getContext: () => context };

  canvasNames.set(canvas, name);
  canvasCalls.set(canvas, calls);

  return canvas as unknown as HTMLCanvasElement;
};

// What a canvas has had drawn on it since this was last asked, as one line per call.
const takeCalls = (canvas: HTMLCanvasElement): string[] => {
  const calls = canvasCalls.get(canvas)!,
    taken = [...calls];

  calls.length = 0;

  return taken;
};

let unnamedCanvases = 0;

// A layer the portal makes for itself gets its canvas from `s('<canvas></canvas>')`.
Object.assign((globalThis as any).document, {
  createElement: () => ({
    set innerHTML(_: string) {},
    get firstElementChild() {
      return recordingCanvas(`unnamed-${unnamedCanvases++}`, 0, 0);
    },
  }),
});

console.error = (...args: unknown[]) =>
  errors.push(args.map((arg) => String(arg)).join(' '));

// Every image a layer here asks for, so none of them falls back to the missing-image placeholder.
[
  ['map/plain', 16, 16],
  ['map/city', 16, 16],
  ['map/fog_n', 16, 16],
  ['map/fog_e', 16, 16],
  ['map/fog_s', 16, 16],
  ['map/fog_w', 16, 16],
  ['city/food', 8, 8],
  ['city/production', 8, 8],
  ['city/trade', 8, 8],
  ['city/people_unhappy_m', 8, 16],
].forEach(([path, width, height]) =>
  preloadImage(path as string, width as number, height as number)
);

// The layers, with what the recording needs of them in reach.
class Plain extends Map {
  origin(): [number, number] {
    return [this.originX(), this.originY()];
  }

  placementsOf(tile: Tile): [number, number][] {
    return this.placements(tile);
  }

  tilesWithin(rect: Rect): string[] {
    return this.tilesIn(rect).map(({ x, y }) => `${x},${y}`);
  }

  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    this.drawImage('map/plain', offsetX, offsetY);
  }
}

// Recolouring reads pixels back, which a recording canvas has none of; where the city goes is what matters here.
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

class TestPortal extends Portal {
  clamped(y: number, offset: number): [number, number] {
    return this.clampedCenterY(y, offset);
  }
}

const layerTypes = [
  Plain,
  Fog,
  TestCities,
  TestUnits,
  Unworkable,
  Yields,
  CityNames,
  TestActiveUnit,
  Overview,
];

const player = {
    id: 'Player-1',
    civilization: {
      _: 'Babylonian',
      attributes: [{ name: 'colors', value: ['#ff0000', '#00ff00'] }],
    },
  },
  ownCity = { id: 'City-A' },
  otherCity = { id: 'City-B' };

// The same world every run: nothing here is random, only a pattern in the co-ordinates.
const makeTiles = (width: number, height: number): Tile[] => {
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = x * 7 + y * 13,
        unknown = n % 11 === 3;

      tiles.push({
        _: 'Tile',
        id: `Tile-${x}-${y}`,
        x,
        y,
        city:
          !unknown && x % 5 === 2 && y % 4 === 1
            ? {
                id: `City-${x}-${y}`,
                name: `City ${x} ${y}`,
                civilDisorderDeclared: (x + y) % 3 === 0,
                growth: { size: ((x + y) % 9) + 1 },
                player,
              }
            : null,
        goodyHut: null,
        improvements: [],
        isCoast: false,
        isLand: n % 3 !== 0,
        isWater: n % 3 === 0,
        terrain: { _: unknown ? 'Unknown' : n % 3 === 0 ? 'Ocean' : 'Plains' },
        units:
          n % 6 === 4
            ? [
                { id: `Unit-${x}-${y}-a`, _: 'Warrior', busy: null, player },
                ...(n % 4 === 0
                  ? [{ id: `Unit-${x}-${y}-b`, _: 'Settlers', busy: null }]
                  : []),
              ]
            : [],
        workedBy: n % 5 === 1 ? otherCity : n % 5 === 2 ? ownCity : null,
        yields: [
          { _: 'Food', value: n % 3 },
          { _: 'Production', value: (n >> 1) % 3 },
          { _: 'Trade', value: n % 5 === 0 ? 4 : n % 2 },
        ],
      } as unknown as Tile);
    }
  }

  return tiles;
};

type Scenario = {
  width: number;
  height: number;
  lock: boolean;
  scale: number;
  canvas: [number, number];
};

const scenarios: Scenario[] = [];

[
  [8, 6],
  [13, 9],
  [40, 25],
].forEach(([width, height]) =>
  [false, true].forEach((lock) =>
    [1, 2, 3].forEach((scale) =>
      (
        [
          [64, 48],
          [75, 53],
          [200, 150],
        ] as [number, number][]
      ).forEach((canvas) =>
        scenarios.push({ width, height, lock, scale, canvas })
      )
    )
  )
);

// Run-length rows of `x,y` for every pixel of the canvas, or of every `step`th pixel of a bigger one.
const tilesUnderPixels = (portal: TestPortal, step: number): string[] => {
  const { width, height } = portal.canvas(),
    rows: string[] = [];

  for (let y = 0; y < height; y += step) {
    const runs: string[] = [];
    let last: string | null = null,
      count = 0;

    for (let x = 0; x < width; x += step) {
      const tile = portal.tileAt(x, y),
        key = tile === null ? '-' : `${tile.x},${tile.y}`;

      if (key === last) {
        count++;

        continue;
      }

      if (last !== null) {
        runs.push(`${last}x${count}`);
      }

      last = key;
      count = 1;
    }

    runs.push(`${last}x${count}`);
    rows.push(runs.join(' '));
  }

  return rows;
};

const digest = (lines: string[]): string =>
  createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12);

const record = (): { [key: string]: unknown } => {
  const recording: { [key: string]: unknown } = {};

  scenarios.forEach(({ width, height, lock, scale, canvas: [cw, ch] }) => {
    const key = `${width}x${height} ${
        lock ? 'locked' : 'wrapped'
      } scale ${scale} canvas ${cw}x${ch}`,
      world = new World({
        width,
        height,
        tiles: makeTiles(width, height),
      } as any),
      portalCanvas = recordingCanvas('portal', cw, ch),
      portal = new TestPortal(
        world,
        {} as any,
        portalCanvas,
        { playerId: player.id, scale, tileSize: 16, lockVerticalEdges: lock },
        ...(layerTypes as (typeof Map)[])
      ),
      layers = layerTypes.map((Type) => portal.getLayer(Type as any)!),
      plain = portal.getLayer(Plain)!,
      activeTile = world.get(1, 1),
      steps: unknown[] = [],
      // Every pixel of the small canvases, and a sample of the big one.
      pixelStep = cw > 100 ? 7 : 1,
      sampleTiles = [
        [0, 0],
        [width - 1, 0],
        [0, height - 1],
        [width - 1, height - 1],
        [Math.floor(width / 2), Math.floor(height / 2)],
        [1, 1],
      ],
      sampleRects: Rect[] = [
        { x: 0, y: 0, width: cw, height: ch },
        { x: 0, y: 0, width: 1, height: 1 },
        { x: 5, y: 7, width: 30, height: 20 },
        { x: -20, y: -15, width: 40, height: 30 },
        { x: cw - 3, y: ch - 3, width: 50, height: 50 },
      ];

    layers.forEach((layer) =>
      canvasNames.set(layer.canvas(), layer.constructor.name)
    );

    (portal.getLayer(Unworkable) as Unworkable).setCity(ownCity as any);
    (portal.getLayer(TestActiveUnit) as TestActiveUnit).setActiveUnit({
      ...activeTile.units[0],
      id: 'Unit-active',
      _: 'Catapult',
      busy: null,
      player,
      tile: { x: 1, y: 1 },
    } as any);

    // What the portal says about itself now, and what everything drew getting here.
    const snapshot = (step: string, extra: { [key: string]: unknown } = {}) => {
      const draws: { [key: string]: unknown } = {};

      [portalCanvas, ...layers.map((layer) => layer.canvas())].forEach(
        (canvas) => {
          const calls = takeCalls(canvas),
            name = canvasNames.get(canvas)!;

          draws[name] = calls;
        }
      );

      steps.push({
        step,
        center: { ...portal.center() },
        origin: plain.origin(),
        sizes: layers
          .map((layer) => `${layer.canvas().width}x${layer.canvas().height}`)
          .join(' '),
        visibleRange: portal.visibleRange(),
        rawVisibleRange: portal.rawVisibleRange(),
        visibleBounds: portal.visibleBounds(),
        isVisible: [0, 1, 3]
          .map((margin) =>
            sampleTiles
              .map(([x, y]) => (portal.isVisible(x, y, margin) ? '1' : '0'))
              .join('')
          )
          .join(' '),
        placements: sampleTiles.map(([x, y]) =>
          plain
            .placementsOf(world.get(x, y))
            .map(([px, py]) => `${px},${py}`)
            .join(' ')
        ),
        tilesIn: sampleRects.map((rect) => plain.tilesWithin(rect).join(' ')),
        ...extra,
        draws,
        errors: errors.splice(0),
      });
    };

    // How the view settles near the poles, which depends on the canvas, the scale and the world, not the centre.
    const clamping = () =>
      [-2, 0, 1, Math.floor(height / 2), height - 2, height - 1, height + 1]
        .map((y) =>
          [-20, -7, 0, 9, 25]
            .map((offset) => portal.clamped(y, offset).join(','))
            .join(' ')
        )
        .join(' | ');

    snapshot('constructed', { clamping: clamping() });

    (
      [
        [0, 0],
        [width - 1, height - 1],
        [Math.floor(width / 2), 1],
        [3, height - 2],
      ] as [number, number][]
    ).forEach(([x, y]) => {
      portal.setCenter(x, y);

      snapshot(`setCenter ${x},${y}`);
    });

    portal.setCenter(2, 2);
    snapshot('setCenter 2,2', {
      tileAt: tilesUnderPixels(portal, pixelStep),
    });

    const tileSize = 16 * scale;

    (
      [
        [5, 0],
        [0, -3],
        [tileSize * 0.6, -3],
        [-40, 25],
        [7.5, 7.5],
        [0, -tileSize * 3],
        [tileSize * width, 0],
        [-1000, 333],
        [3, tileSize * height],
      ] as [number, number][]
    ).forEach(([dx, dy]) => {
      portal.scrollBy(dx, dy);

      snapshot(`scrollBy ${dx},${dy}`);
    });

    snapshot('dragged', {
      tileAt: tilesUnderPixels(portal, pixelStep),
    });

    portal.build([world.get(1, 1), world.get(2, 1), world.get(width - 1, 0)]);
    portal.render();
    snapshot('build');

    portal.setScale(scale === 3 ? 1 : scale + 1);
    snapshot(`setScale ${portal.scale()}`, { clamping: clamping() });

    portal.setLockVerticalEdges(!lock);
    snapshot(`setLockVerticalEdges ${!lock}`, { clamping: clamping() });

    portal.setScale(scale);
    portal.setLockVerticalEdges(lock);
    portalCanvas.width = cw + 17;
    portalCanvas.height = ch + 9;
    portal.render();
    snapshot('resized', {
      clamping: clamping(),
      tileAt: tilesUnderPixels(portal, pixelStep),
    });

    recording[key] = steps;
  });

  // The city screen's map: a 7x7 world around the city, on a canvas five tiles across at the portal's scale.
  [1, 2, 3].forEach((scale) => {
    const world = new World({
        width: 7,
        height: 7,
        tiles: makeTiles(7, 7),
      } as any),
      size = 16 * scale,
      portalCanvas = recordingCanvas('portal', size * 5, size * 5),
      portal = new TestPortal(
        world,
        {} as any,
        portalCanvas,
        { playerId: player.id, scale, tileSize: 16 },
        Plain,
        Yields,
        Unworkable
      ),
      layers = [Plain, Yields, Unworkable].map(
        (Type) => portal.getLayer(Type as any)!
      );

    layers.forEach((layer) =>
      canvasNames.set(layer.canvas(), layer.constructor.name)
    );

    portal.setCenter(3, 3);
    portal.build(makeTiles(7, 7));
    (portal.getLayer(Unworkable) as Unworkable).setCity(ownCity as any);
    portal.getLayer(Yields)!.render(makeTiles(7, 7));
    portal.getLayer(Unworkable)!.render(makeTiles(7, 7));
    portal.render();

    recording[`city map scale ${scale}`] = {
      canvas: `${portalCanvas.width}x${portalCanvas.height}`,
      origin: (portal.getLayer(Plain) as Plain).origin(),
      draws: Object.fromEntries(
        [portalCanvas, ...layers.map((layer) => layer.canvas())].map(
          (canvas) => [canvasNames.get(canvas), takeCalls(canvas)]
        )
      ),
      tileAt: tilesUnderPixels(portal, 1),
      errors: errors.splice(0),
    };
  });

  return recording;
};

// The fixture keeps every number the portal works out as it is, and each run of draw calls, tile list and pixel map as
//  its length and a digest of it: every call is still pinned, and the file stays small enough to read. The dump has
//  them in full, so two of them, from before and after a change, can be diffed.
const bulky = ['draws', 'tilesIn', 'tileAt'];

const summarise = (value: unknown): unknown => {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return `${value.length} ${digest(value as string[])}`;
  }

  if (Array.isArray(value)) {
    return value.map(summarise);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, summarise(item)])
    );
  }

  return value;
};

const compact = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(compact);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        bulky.includes(key) ? summarise(item) : compact(item),
      ])
    );
  }

  return value;
};

// One line per step, so a difference reads as the step it is in.
const serialise = (recording: { [key: string]: unknown }): string =>
  `{\n${Object.entries(recording)
    .map(
      ([key, steps]) =>
        `${JSON.stringify(key)}: [\n${(Array.isArray(steps) ? steps : [steps])
          .map((step) => JSON.stringify(step))
          .join(',\n')}\n]`
    )
    .join(',\n')}\n}\n`;

// The first few places two recordings differ, by path.
const compare = (
  expected: unknown,
  actual: unknown,
  at: string = '',
  differences: string[] = []
): string[] => {
  if (differences.length >= 5) {
    return differences;
  }

  if (
    expected !== null &&
    actual !== null &&
    typeof expected === 'object' &&
    typeof actual === 'object'
  ) {
    const keys = [
      ...new Set([
        ...Object.keys(expected as object),
        ...Object.keys(actual as object),
      ]),
    ];

    keys.forEach((key) =>
      compare(
        (expected as any)[key],
        (actual as any)[key],
        `${at}${Array.isArray(expected) ? `[${key}]` : `.${key}`}`,
        differences
      )
    );

    return differences;
  }

  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    differences.push(
      `  ${at}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }

  return differences;
};

const main = (): void => {
  try {
    const full = record(),
      actual = compact(full) as { [key: string]: unknown },
      text = serialise(actual),
      steps = text.split('\n').length - 2,
      dump = (file: string) => fs.writeFileSync(file, serialise(full));

    if (process.env.RENDER_GEOMETRY_DUMP) {
      dump(process.env.RENDER_GEOMETRY_DUMP);
    }

    if (update) {
      fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
      fs.writeFileSync(fixturePath, text);

      passed = true;

      console.log(
        `UPDATED renderGeometry: ${
          scenarios.length
        } portals and 3 city maps, ${steps} lines, written to ${path.relative(
          process.cwd(),
          fixturePath
        )}`
      );

      process.exit(0);
    }

    if (!fs.existsSync(fixturePath)) {
      fail(`there is no fixture at ${fixturePath}: run with --update`);
    }

    const expected = fs.readFileSync(fixturePath, 'utf8');

    if (expected !== text) {
      const file = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), 'render-geometry-')),
        'render-geometry.json'
      );

      dump(file);

      const differences = compare(JSON.parse(expected), actual);

      fail(
        `what the map drew or worked out changed (all of it, in full, is in ${file}):\n${
          differences.length > 0
            ? differences.join('\n')
            : '  the same values, written differently'
        }`
      );
    }

    passed = true;

    console.log(
      `PASS renderGeometry (${scenarios.length} portals and 3 city maps, ${steps} lines, are as they were)`
    );

    process.exit(0);
  } catch (error) {
    fail('the recording threw', error);
  }
};

// Started, so a city's name is its name rather than `undefined`.
i18next
  .init({ lng: 'en', defaultNS: 'default', ns: ['default'] })
  .then(main, (error) => fail('i18next did not start', error));
