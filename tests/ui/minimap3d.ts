// The 3D map's minimap (docs/3d-renderer-plan.md 1.5), on a canvas that records what's drawn:
//  - it's as big as the world's ground, four px a world unit, whatever its grid;
//  - its overview: each seen square in its terrain's colour, none for squares never seen, and a dot for each city and
//    each stack, in its owner's colour;
//  - shown, it draws the overview, the unit awaiting orders, and the ground the camera sees at every copy it could show;
//  - a click moves the camera to that point on the ground; taken down, it hears no more;
//  - on a world that wraps over the poles, squares and the camera's patch are drawn a world up and down too.

import { Tile } from '@civ-clone/ui-protocol/types';
import { terrainEntry } from '@civ-clone/ui-models-builtin/terrain';
import Minimap3D from '@civ-clone/ui-map-3d/minimap/Minimap3D';
import groundLayoutFor from '@civ-clone/ui-map-3d/layouts';

const failures: string[] = [];
let checks = 0;

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

// A canvas whose context records what's drawn on it, in order.
type Drawn = { op: string; args: unknown[]; fill?: string; stroke?: string };

const fakeCanvas = () => {
  const drawn: Drawn[] = [],
    listeners = new Map<string, EventListener>(),
    context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as { [key: string]: unknown };

  [
    'fillRect',
    'clearRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'closePath',
    'fill',
    'stroke',
    'drawImage',
  ].forEach((op) => {
    context[op] = (...args: unknown[]) =>
      void drawn.push({
        op,
        args: op === 'drawImage' ? [] : args,
        fill: context['fillStyle'] as string,
        stroke: context['strokeStyle'] as string,
      });
  });

  return {
    drawn,
    listeners,
    canvas: {
      width: 0,
      height: 0,
      getContext: () => context,
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 160,
        height: 80,
      }),
      addEventListener: (type: string, listener: EventListener) =>
        void listeners.set(type, listener),
      removeEventListener: (type: string) => void listeners.delete(type),
    } as unknown as HTMLCanvasElement,
  };
};

// The overview's own canvas, which the minimap makes for itself.
const overviews: ReturnType<typeof fakeCanvas>[] = [];

Object.assign(globalThis, {
  document: {
    createElement: () => {
      const made = fakeCanvas();

      overviews.push(made);

      return made.canvas;
    },
  },
});

const width = 8,
  height = 4,
  owner = {
    civilization: {
      attributes: [{ name: 'colors', value: ['#aa0000', '#ffffff'] }],
    },
  },
  tileAt = (x: number, y: number): Tile =>
    ({
      x,
      y,
      terrain: { _: x === 7 ? 'Unknown' : y === 0 ? 'Ocean' : 'Grassland' },
      city: x === 2 && y === 2 ? { player: owner } : null,
      units:
        x === 4 && y === 1 ? [{ player: owner, defence: { value: 1 } }] : [],
    } as unknown as Tile),
  world = { width: () => width, height: () => height, get: tileAt },
  layout = groundLayoutFor({
    width,
    height,
    topologyId: 'square',
    wrapsY: false,
  }),
  picked: [number, number][] = [],
  shown = fakeCanvas(),
  minimap = new Minimap3D(shown.canvas, layout, world, height, (u, v) =>
    picked.push([u, v])
  ),
  overview = overviews[0]!;

expect(
  'it is as big as the world’s ground, four px a world unit',
  [shown.canvas.width, shown.canvas.height, overview.canvas.width],
  [32, 16, 32]
);

minimap.redraw();

const fills = overview.drawn.filter(({ op }) => op === 'fill'),
  dots = overview.drawn.filter(
    ({ op, fill }) => op === 'fillRect' && fill === '#aa0000'
  );

expect(
  'its overview fills each seen square in its terrain’s colour, at it and a world to the left, and none never seen',
  [
    fills.length,
    fills.filter(({ fill }) => fill === terrainEntry('Ocean').colour).length,
    fills.filter(({ fill }) => fill === terrainEntry('Grassland').colour)
      .length,
  ],
  [(width - 1) * height * 2, (width - 1) * 2, (width - 1) * (height - 1) * 2]
);
expect(
  'and a dot in its owner’s colour for the stack and for the city, bigger for the city, at their squares’ middles, row by row',
  dots.map(({ args }) => args),
  [
    [4.5 * 4 - 1.4, 1.5 * 4 - 1.4, 1.4 * 2, 1.4 * 2],
    [2.5 * 4 - 2.2, 2.5 * 4 - 2.2, 2.2 * 2, 2.2 * 2],
  ]
);

shown.drawn.length = 0;
minimap.show(
  [
    [1, 1],
    [3, 1],
    [3, 3],
    [1, 3],
  ],
  { x: 5, y: 0 }
);

const ops = shown.drawn.map(({ op }) => op),
  moves = shown.drawn
    .filter(({ op }) => op === 'moveTo')
    .map(({ args }) => args);

expect(
  'shown, it draws the overview, a white dot for the unit awaiting orders, and the camera’s patch at each copy',
  [
    ops.slice(0, 2),
    shown.drawn.find(({ op, fill }) => op === 'fillRect' && fill === '#ffffff')
      ?.args,
    moves,
    ops.filter((op) => op === 'stroke').length,
  ],
  [
    ['clearRect', 'drawImage'],
    [5.5 * 4 - 2, 0.5 * 4 - 2, 4, 4],
    [
      [(1 - width) * 4, 4],
      [4, 4],
      [(1 + width) * 4, 4],
    ],
    3,
  ]
);

shown.drawn.length = 0;
minimap.show(null, null);

expect(
  'with nothing to outline, only the overview',
  shown.drawn.map(({ op }) => op),
  ['clearRect', 'drawImage']
);

// A click a quarter across its box and half down: a quarter across the world, half down it.
shown.listeners.get('click')!({
  clientX: 10 + 40,
  clientY: 20 + 40,
} as unknown as Event);

minimap.dispose();

expect(
  'a click moves the camera to that point on the ground; taken down, it hears no more',
  [picked, shown.listeners.size],
  [[[width / 4, height / 2]], 0]
);

// A world that wraps over the poles.
overviews.length = 0;

const wrapping = fakeCanvas(),
  wrappingMinimap = new Minimap3D(
    wrapping.canvas,
    groundLayoutFor({ width, height, topologyId: 'square', wrapsY: true }),
    world,
    height,
    () => undefined
  ),
  wrappingOverview = overviews[0]!;

wrappingMinimap.redraw();
wrappingMinimap.show(
  [
    [1, 3],
    [3, 3],
    [3, 5],
    [1, 5],
  ],
  null
);

expect(
  'on a world that wraps over the poles, each seen square is drawn a world up too, and the camera’s patch, taken into the period, a world up and down as well as across',
  [
    wrappingOverview.drawn.filter(({ op }) => op === 'fill').length,
    wrapping.drawn.filter(({ op }) => op === 'moveTo').map(({ args }) => args),
  ],
  [
    (width - 1) * height * 4,
    [-height, 0, height].flatMap((down) =>
      [-width, 0, width].map((across) => [(1 + across) * 4, (3 + down) * 4])
    ),
  ]
);

// Far below the world, it is taken back into it.
wrapping.drawn.length = 0;
wrappingMinimap.show(
  [
    [1, 3 + height * 2],
    [3, 3 + height * 2],
    [3, 5 + height * 2],
  ],
  null
);

expect(
  'a patch a world or two away is drawn where it would be in the first',
  wrapping.drawn.find(({ op }) => op === 'moveTo')?.args,
  [(1 - width) * 4, (3 - height) * 4]
);

wrappingMinimap.dispose();

if (failures.length > 0) {
  process.stderr.write(
    `FAIL minimap3d: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS minimap3d (${checks} checks)\n`);
