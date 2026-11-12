// What a map layer draws on the staggered isometric grid (#97), and every number it works out, over a grid of worlds,
//  scales, viewports and tile updates, is the same as tests/ui/fixtures/render-geometry-iso.json says: the isometric
//  counterpart of renderGeometry, so later work on the map can show it moved nothing on this grid either.
//
// It is recorded at the layer, over viewports given by hand, and at the portal, which centres, drags and culls by
//  asking the projection; the portal still takes Civ1's tileset unless told otherwise, so here it is given this one.
//  The tileset is a synthetic one, 64 × 32 diamonds carrying sprites 64 × 48 drawn 16 px up, as Civ2's units and
//  cities are; no Civ2 art is used. With them: the isometric overview, the whole world in bricks.
//
// `--update` rewrites the fixture.

// Must stay first: it gives the layers a `document` and a canvas to draw with.
import { Call, FakeImage, fakeCanvas } from './lib/fakeCanvas';
import './lib/grids';

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import Map from '@civ-clone/ui-map/components/Map';
import Overview from '@civ-clone/ui-map-isometric/Overview';
import Portal from '@civ-clone/ui-map/components/Portal';
import { Projection } from '@civ-clone/ui-map/lib/projection';
import projectionFor from '@civ-clone/ui-map/lib/projectionFor';
import { Rect } from '@civ-clone/ui-map/lib/viewport';
import { Tile } from '@civ-clone/ui-protocol/types';
import World from '@civ-clone/ui-map/components/World';
import civ1Json from '@civ-clone/ui-assets/tilesets/civ1.json';
import validateDescriptor from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

const update = process.argv.includes('--update'),
  fixturePath = path.join(
    process.cwd(),
    'tests',
    'ui',
    'fixtures',
    'render-geometry-iso.json'
  );

let finished = false;

process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL isoRenderGeometry: stopped before the recording was compared\n'
    );
    process.exitCode = 1;
  }
});

const errors: string[] = [];

console.error = (...args: unknown[]) =>
  errors.push(args.map((arg) => String(arg)).join(' '));

// Civ1's descriptor, on the isometric grid with 64 × 32 diamonds whose sprites reach 16 px above the box.
const isoTileset = validateDescriptor({
  ...JSON.parse(JSON.stringify(civ1Json)),
  id: 'iso-synthetic',
  name: 'A synthetic isometric tileset',
  grid: 'staggered-iso',
  tile: { width: 64, height: 32 },
  geometry: {
    columnStep: 64,
    rowStep: 16,
    oddRowShift: 32,
    anchor: { x: 0, y: -16 },
    overhang: { top: 16, right: 0, bottom: 0, left: 0 },
  },
});

// One tall sprite a tile, at the descriptor's anchor, with the layer's own numbers in reach.
class TallPlain extends Map {
  protected override tileset() {
    return isoTileset;
  }

  origin(): [number, number] {
    return [this.originX(), this.originY()];
  }

  placementsAt(tile: Tile): [number, number][] {
    return this.placements(tile);
  }

  reachOf() {
    return this.reach();
  }

  tilesWithin(rect: Rect): string[] {
    return this.tilesIn(rect).map(({ x, y }) => `${x},${y}`);
  }

  pixelTile(px: number, py: number): string {
    return this.projection().pixelToTile(px, py).join(',');
  }

  protected override drawTile(
    tile: Tile,
    offsetX: number,
    offsetY: number
  ): void {
    const variant = (tile as any).variant;

    if (variant === 0) {
      return;
    }

    this.putImage(
      new FakeImage(
        `tall/${tile.x}_${tile.y}_${variant}`,
        64,
        48
      ) as unknown as CanvasImageSource,
      offsetX,
      offsetY - 16 * this.scale()
    );
  }
}

// The portal, drawing this tileset rather than Civ1's.
class IsoPortal extends Portal {
  protected override createProjection(): Projection {
    return projectionFor(
      isoTileset,
      this.world(),
      this.tileSize(),
      !this.lockVerticalEdges()
    );
  }
}

// A layer the portal makes for itself gets its canvas from `s('<canvas></canvas>')`: one that records, kept by name.
const portalCalls: Call[][] = [];

Object.assign((globalThis as any).document, {
  createElement: () => ({
    set innerHTML(_: string) {},
    get firstElementChild() {
      const { calls, canvas } = fakeCanvas(0, 0);

      portalCalls.push(calls);

      return canvas;
    },
  }),
});

const makeTiles = (width: number, height: number): Tile[] => {
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = x * 7 + y * 13;

      tiles.push({
        x,
        y,
        city: null,
        isWater: n % 3 === 0,
        terrain: {
          _: n % 11 === 3 ? 'Unknown' : n % 3 === 0 ? 'Ocean' : 'Plains',
        },
        variant: n % 5 === 0 ? 0 : (n % 2) + 1,
      } as unknown as Tile);
    }
  }

  return tiles;
};

const line = ([name, ...args]: Call): string =>
    [
      name,
      ...args.map((arg) =>
        arg instanceof FakeImage ? `img:${arg.path}` : String(arg)
      ),
    ].join(' '),
  digest = (lines: string[]): string =>
    createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12),
  // A run of calls as its length and a digest, so every call is pinned and the file stays small.
  summarise = (calls: Call[]): string => {
    const lines = calls.map(line);

    calls.length = 0;

    return `${lines.length} ${digest(lines)}`;
  };

const record = (): { [key: string]: unknown } => {
  const recording: { [key: string]: unknown } = {};

  (
    [
      [6, 4],
      [9, 8],
    ] as [number, number][]
  ).forEach(([width, height]) =>
    [true, false].forEach((wrapVertical) =>
      [1, 2].forEach((scale) =>
        (
          [
            [150, 110],
            [400, 230],
          ] as [number, number][]
        ).forEach(([canvasWidth, canvasHeight]) => {
          const key = `${width}x${height} ${
              wrapVertical ? 'wrapped' : 'locked'
            } scale ${scale} canvas ${canvasWidth}x${canvasHeight}`,
            tiles = makeTiles(width, height),
            world = new World({
              width,
              height,
              tiles,
              topologyId: 'staggered-iso',
            } as any),
            { calls, canvas } = fakeCanvas(0, 0),
            layer = new TallPlain(
              world,
              scale,
              { width: 64, height: 32 },
              canvas
            ),
            tileWidth = 64 * scale,
            steps: unknown[] = [],
            sampleTiles = [
              [0, 0],
              [width - 1, 0],
              [0, height - 1],
              [width - 1, height - 1],
              [1, 1],
            ],
            sampleRects: Rect[] = [
              { x: 0, y: 0, width: canvasWidth, height: canvasHeight },
              { x: 0, y: 0, width: 1, height: 1 },
              { x: 5, y: 7, width: 30, height: 20 },
              { x: -20, y: -15, width: 40, height: 30 },
            ];

          layer.setWrapVertical(wrapVertical);

          const snapshot = (step: string) =>
            steps.push({
              step,
              origin: layer.origin(),
              size: `${canvas.width}x${canvas.height}`,
              placements: sampleTiles.map(([x, y]) =>
                layer
                  .placementsAt(world.get(x!, y!))
                  .map(([px, py]) => `${px},${py}`)
                  .join(' ')
              ),
              tilesIn: sampleRects.map((rect) =>
                digest(layer.tilesWithin(rect))
              ),
              dirty: digest(
                layer
                  .dirtyRects()
                  .map(
                    ({ x, y, width, height }) => `${x},${y},${width},${height}`
                  )
              ),
              draws: summarise(calls),
              errors: errors.splice(0),
            });

          layer.setViewport(0, 0, canvasWidth, canvasHeight);
          snapshot('viewport 0,0');

          (
            [
              [-tileWidth / 2, -8 * scale],
              [tileWidth * width - 40, 13],
              [17, 16 * scale * height - 5],
              [-3 * tileWidth - 7, -50],
            ] as [number, number][]
          ).forEach(([x, y]) => {
            layer.clearDirty();
            layer.setViewport(x, y, canvasWidth, canvasHeight);
            snapshot(`viewport ${x},${y}`);
          });

          layer.clearDirty();
          layer.update([world.get(1, 1), world.get(width - 1, 0)]);
          snapshot('update');

          // Which tile every 3rd pixel of the world is on, in run-length rows.
          const rows: string[] = [];

          for (let py = -16; py < 16 * scale * (height + 1); py += 3) {
            const runs: string[] = [];
            let last: string | null = null,
              count = 0;

            for (let px = -32; px < tileWidth * (width + 1); px += 3) {
              const found = layer.pixelTile(px, py);

              if (found === last) {
                count++;

                continue;
              }

              if (last !== null) {
                runs.push(`${last}x${count}`);
              }

              last = found;
              count = 1;
            }

            runs.push(`${last}x${count}`);
            rows.push(runs.join(' '));
          }

          recording[key] = {
            reach: layer.reachOf(),
            pixelToTile: digest(rows),
            steps,
          };
        })
      )
    )
  );

  // The portal: centred on tiles of both row parities, dragged across both seams, and asked what is under each pixel
  //  and what is in view, wrapping and locked to the poles.
  (
    [
      [6, 4],
      [9, 8],
    ] as [number, number][]
  ).forEach(([width, height]) =>
    [false, true].forEach((lock) =>
      [1, 2].forEach((scale) => {
        const key = `portal ${width}x${height} ${
            lock ? 'locked' : 'wrapped'
          } scale ${scale}`,
          world = new World({
            width,
            height,
            tiles: makeTiles(width, height),
            topologyId: 'staggered-iso',
          } as any),
          { calls, canvas } = fakeCanvas(300, 170),
          portal = new IsoPortal(
            world,
            {} as any,
            canvas,
            {
              playerId: null,
              scale,
              tileSize: { width: 64, height: 32 },
              lockVerticalEdges: lock,
            },
            TallPlain
          ),
          layerCalls = portalCalls[portalCalls.length - 1]!,
          layer = portal.getLayer(TallPlain)! as TallPlain,
          steps: unknown[] = [],
          sampleTiles = [
            [0, 0],
            [width - 1, 0],
            [0, height - 1],
            [width - 1, height - 1],
            [1, 1],
            [2, 3],
          ];

        const snapshot = (step: string, extra: object = {}) => {
          portal.render();

          steps.push({
            step,
            center: { ...portal.center() },
            origin: layer.origin(),
            visibleRange: portal.visibleRange(),
            rawVisibleRange: portal.rawVisibleRange(),
            isVisible: [0, 1, 3]
              .map((margin) =>
                sampleTiles
                  .map(([x, y]) => (portal.isVisible(x!, y!, margin) ? 1 : 0))
                  .join('')
              )
              .join(' '),
            boxes: sampleTiles.map(([x, y]) => {
              const { x: left, y: top } = portal.boxOf({ x: x!, y: y! });

              return `${left},${top}`;
            }),
            ...extra,
            portal: summarise(calls),
            layer: summarise(layerCalls),
            errors: errors.splice(0),
          });
        };

        // Which tile every 5th pixel of the canvas is on.
        const under = () => {
          const found: string[] = [];

          for (let y = 0; y < canvas.height; y += 5) {
            for (let x = 0; x < canvas.width; x += 5) {
              const tile = portal.tileAt(x, y);

              found.push(tile === null ? '-' : `${tile.x},${tile.y}`);
            }
          }

          return digest(found);
        };

        snapshot('constructed');

        (
          [
            [0, 0],
            [width - 1, 1],
            [Math.floor(width / 2), height - 1],
            [2, 3],
          ] as [number, number][]
        ).forEach(([x, y]) => {
          portal.setCenter(x, y);
          snapshot(`setCenter ${x},${y}`, { tileAt: under() });
        });

        (
          [
            [5, 0],
            [0, -7],
            [40 * scale, 9 * scale],
            [-64 * scale * width, 0],
            [-3, 16 * scale * height + 5],
            [7.5, -7.5],
          ] as [number, number][]
        ).forEach(([dx, dy]) => {
          portal.scrollBy(dx, dy);
          snapshot(`scrollBy ${dx},${dy}`, { tileAt: under() });
        });

        portal.build([world.get(1, 1), world.get(width - 1, 0)]);
        snapshot('build');

        recording[key] = steps;
      })
    )
  );

  // The overview: the whole world in bricks, and a tile changed.
  (
    [
      [6, 4],
      [9, 8],
      [40, 100],
    ] as [number, number][]
  ).forEach(([width, height]) => {
    const world = new World({
        width,
        height,
        tiles: makeTiles(width, height),
        topologyId: 'staggered-iso',
      } as any),
      { calls, canvas } = fakeCanvas(0, 0),
      layer = new Overview(world, 2, { width: 64, height: 32 }, canvas),
      constructed = summarise(calls);

    layer.update([world.get(0, 1), world.get(width - 1, 1)]);

    recording[`overview ${width}x${height}`] = {
      cell: layer.tileSize(),
      size: `${canvas.width}x${canvas.height}`,
      constructed,
      update: summarise(calls),
      errors: errors.splice(0),
    };
  });

  return recording;
};

const serialise = (recording: { [key: string]: unknown }): string =>
  `{\n${Object.entries(recording)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n')}\n}\n`;

const text = serialise(record());

if (update) {
  fs.writeFileSync(fixturePath, text);
  finished = true;
  console.log(`PASS isoRenderGeometry (recorded ${fixturePath})`);
  process.exit(0);
}

if (!fs.existsSync(fixturePath)) {
  process.stderr.write(
    `FAIL isoRenderGeometry: there is no fixture at ${fixturePath}: run with --update\n`
  );
  process.exit(1);
}

const expected = fs.readFileSync(fixturePath, 'utf8').split('\n'),
  actual = text.split('\n'),
  different = actual
    .map((row, index) => [index, row, expected[index]] as const)
    .filter(([, row, wanted]) => row !== wanted)
    .slice(0, 3);

finished = true;

if (different.length > 0 || expected.length !== actual.length) {
  process.stderr.write(
    `FAIL isoRenderGeometry: the recording differs from ${fixturePath}\n${different
      .map(
        ([index, row, wanted]) =>
          `  line ${index + 1}\n    expected: ${wanted}\n    actual:   ${row}`
      )
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS isoRenderGeometry (${actual.length - 3} recordings)`);
