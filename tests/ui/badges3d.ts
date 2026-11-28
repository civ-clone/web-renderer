// What stands over units and cities on the 3D map, drawn all together (`markers/badges.ts`, #1424), without a GPU:
//  - every badge a marker draws is on the badges' layer, which the camera doesn't draw, but the pointer, which it does;
//  - those shown are gathered, in the order three.js would draw them as sprites of their own: far before near, and a
//    marker's in the order they're made;
//  - each as its sprite stands and is drawn: where, how big on the screen, the point of it that stands there, its
//    colour and how solid, faded or not, and its picture;
//  - their pictures in one atlas, each with room round it, the atlas copied afresh when one doesn't fit and grown when
//    they still don't;
//  - all drawn in one draw call, over all as the sprites were, after the cloud and the smoke, before the pointer.

import {
  Group,
  Object3D,
  PerspectiveCamera,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import {
  BADGES,
  MarkerKit,
  POINTED,
  drawMarker,
  fade,
} from '@civ-clone/ui-map-3d/markers/drawMarker';
import Badges, {
  BADGE_LAYER,
  BadgeAtlas,
  BadgeImage,
  Cell,
  Shelves,
  badgeInstances,
  badgeSprites,
} from '@civ-clone/ui-map-3d/markers/badges';
import { UnitMarker } from '@civ-clone/ui-map-3d/markers/markerFor';
import { CLOUD_ORDER, SMOKE_ORDER } from '@civ-clone/ui-map-3d/water';

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

// What's drawn on the page's canvases, as it's drawn: a context that measures every letter as 10 px, and a log of
//  what's copied into each.
type Drawn = { canvas: object; call: string; args: unknown[] };

const drawnOn: Drawn[] = [];

Object.assign(globalThis, {
  document: {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => context },
        log =
          (call: string) =>
          (...args: unknown[]) =>
            void drawnOn.push({ canvas, call, args }),
        context = {
          measureText: (text: string) => ({ width: text.length * 10 }),
          beginPath: () => undefined,
          roundRect: () => undefined,
          fill: () => undefined,
          fillText: () => undefined,
          moveTo: () => undefined,
          lineTo: () => undefined,
          closePath: () => undefined,
          stroke: () => undefined,
          clearRect: log('clearRect'),
          fillRect: log('fillRect'),
          drawImage: log('drawImage'),
        };

      return canvas;
    },
  },
});

const colours = ['#aa0000', '#ffffff'] as const,
  rivals = ['#0000aa', '#ffff00'] as const,
  kit = new MarkerKit();

const unit = (more: Partial<UnitMarker> = {}): UnitMarker => ({
  id: 'Unit-1',
  type: 'Musketman',
  kinds: [],
  colours,
  count: 1,
  active: false,
  busy: false,
  fortified: false,
  veteran: false,
  health: null,
  status: null,
  facing: 0,
  size: 1,
  ...more,
});

const spritesIn = (root: Object3D): Sprite[] => {
  const found: Sprite[] = [];

  root.traverse((object) => {
    if (object instanceof Sprite) {
      found.push(object);
    }
  });

  return found;
};

// A city with a hurt, veteran stack of two in it, awaiting orders: its name, and the unit's bar (back and front), flag,
//  label and pointer.
const garrison = drawMarker(kit, {
    city: { name: 'Roma', size: 3, colours, walled: true, disorder: false },
    unit: unit({ count: 2, veteran: true, health: 0.2, active: true }),
  }),
  all = spritesIn(garrison),
  pointer = all.find((sprite) => sprite.material === kit.pointer());

expect(
  'every badge a marker draws is on the badges’ layer alone, which the camera doesn’t draw, but the pointer, on the camera’s alone, drawn after them',
  [
    all.length,
    all
      .filter((sprite) => sprite !== pointer)
      .map((sprite) => [
        sprite.layers.isEnabled(BADGE_LAYER),
        sprite.layers.isEnabled(0),
        sprite.renderOrder,
      ]),
    [
      pointer?.layers.isEnabled(BADGE_LAYER),
      pointer?.layers.isEnabled(0),
      pointer?.renderOrder,
    ],
  ],
  [
    6,
    Array.from({ length: 5 }, () => [true, false, BADGES]),
    [false, true, POINTED],
  ]
);

// The world's matrices, as the stage works them out before it gathers.
const camera = new PerspectiveCamera(40, 1, 0.1, 100);

camera.position.set(0, 8, 8);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

// Each label's picture its own cell, by the order it's first asked for; a plain badge's, the white block's.
const PLAIN: Cell = [0.5, 0.5, 0, 0],
  cellsAsked = new Map<BadgeImage, Cell>(),
  cellOf = (image: BadgeImage | null): Cell => {
    if (image === null) {
      return PLAIN;
    }

    if (!cellsAsked.has(image)) {
      cellsAsked.set(image, [cellsAsked.size / 10, 0, 0.1, 0.1]);
    }

    return cellsAsked.get(image)!;
  };

// Markers along the camera's view, nearest first, one a copy of another, as the map copies them for the world's copies.
const world = new Group(),
  near = drawMarker(kit, { city: null, unit: unit({ status: 'F' }) }),
  middle = drawMarker(kit, {
    city: null,
    unit: unit({ colours: rivals, health: 0.6 }),
  }),
  far = garrison.clone(),
  hidden = drawMarker(kit, { city: null, unit: unit({ count: 3 }) });

near.position.set(0, 0, 2);
middle.position.set(0.5, 0, 0);
far.position.set(-0.5, 0, -2);
hidden.position.set(0, 0, 1);
hidden.visible = false;
world.add(near, middle, far, hidden);
world.updateMatrixWorld(true);

const gathered = badgeSprites(world),
  instances = badgeInstances(gathered, camera, cellOf);

// As three.js sorts what's see-through, drawn in the same order (`reversePainterSortStable`): by how deep each is on
//  the screen, the deepest first, and by its id where they're as deep.
const threeOrder = (sprites: readonly Sprite[]): Sprite[] => {
  const depth = (sprite: Sprite): number =>
    new Vector3().setFromMatrixPosition(sprite.matrixWorld).project(camera).z;

  return [...sprites].sort(
    (a, b) =>
      a.renderOrder - b.renderOrder || depth(b) - depth(a) || a.id - b.id
  );
};

const at = (sprite: Sprite): number[] =>
  new Vector3()
    .setFromMatrixPosition(sprite.matrixWorld)
    .toArray()
    .map((n) => Math.round(n * 1e4) / 1e4);

expect(
  'the badges shown are gathered, not the pointer, nor those of a marker hidden: in the order three.js would draw them as sprites of their own, far before near, and a marker’s in the order they’re made, a bar’s back before its front',
  [
    gathered.length,
    gathered.every((sprite) => sprite !== pointer),
    instances.length,
    instances.map(({ at }) => at.map((n) => Math.round(n * 1e4) / 1e4)),
    instances.map(({ colour, cell }) => [
      colour.map((n) => Math.round(n * 1000) / 1000),
      cell,
    ]),
  ],
  [
    // The garrison's copy: its name, bar (back and front), flag and label; the rival's bar (back and front) and flag;
    //  the near unit's flag and label.
    10,
    true,
    10,
    threeOrder(gathered).map(at),
    threeOrder(gathered).map((sprite) => {
      const { color, opacity, map } = sprite.material;

      return [
        [color.r, color.g, color.b, opacity].map(
          (n) => Math.round(n * 1000) / 1000
        ),
        cellOf((map?.image as BadgeImage | undefined) ?? null),
      ];
    }),
  ]
);

// The garrison's copy's, as made.
const farSprites = spritesIn(far).filter((sprite) =>
    sprite.layers.isEnabled(BADGE_LAYER)
  ),
  farInstances = instances.slice(0, farSprites.length);

expect(
  'each as its sprite stands and is drawn: where it stands, its size on the screen, the point of it that stands there, its colour and its picture',
  farInstances.map((instance) => [
    instance.at.map((n) => Math.round(n * 1e4) / 1e4),
    instance.size.map((n) => Math.round(n * 1e4) / 1e4),
    instance.centre.map((n) => Math.round(n * 1e4) / 1e4),
  ]),
  farSprites.map((sprite) => [
    at(sprite),
    [sprite.scale.x, sprite.scale.y].map((n) => Math.round(n * 1e4) / 1e4),
    [sprite.center.x, sprite.center.y].map((n) => Math.round(n * 1e4) / 1e4),
  ])
);

// A copy of the world drawn twice as big, and a marker faded out: as each would be drawn.
const scaled = new Group(),
  faded = drawMarker(kit, { city: null, unit: unit({ status: 'S' }) });

scaled.scale.setScalar(2);
scaled.add(faded);
scaled.updateMatrixWorld(true);
fade([faded], 0.25, new Map());

const fadedInstances = badgeInstances(badgeSprites(scaled), camera, cellOf),
  flag = spritesIn(faded).find(
    (sprite) => (sprite.material as SpriteMaterial).map === null
  );

expect(
  'a badge faded out is drawn as see-through as its sprite, in its own colour; one in a part drawn bigger, as much bigger on the screen as three.js would draw it',
  [
    fadedInstances.map(({ colour }) => colour[3]),
    fadedInstances.find(({ cell }) => cell === PLAIN)?.size,
    [flag!.scale.x * 2, flag!.scale.y * 2],
    fadedInstances
      .find(({ cell }) => cell === PLAIN)
      ?.colour.slice(0, 3)
      .map((n) => Math.round(n * 1000)),
    [
      flag!.material.color.r,
      flag!.material.color.g,
      flag!.material.color.b,
    ].map((n) => Math.round(n * 1000)),
  ],
  [
    [0.25, 0.25],
    [flag!.scale.x * 2, flag!.scale.y * 2],
    [flag!.scale.x * 2, flag!.scale.y * 2],
    [
      flag!.material.color.r,
      flag!.material.color.g,
      flag!.material.color.b,
    ].map((n) => Math.round(n * 1000)),
    // `#aa0000` worked with as it's drawn, not as it's written.
    [402, 0, 0],
  ]
);

expect(
  'a badge whose picture isn’t in the atlas isn’t drawn',
  badgeInstances(badgeSprites(world), camera, (image) =>
    image === null ? PLAIN : null
  ).length,
  // The plain ones: the garrison's bar (back and front) and flag, the rival's, and the near unit's flag.
  7
);

// A badge whose material is hidden, as three.js wouldn't draw it.
const unseen = drawMarker(kit, { city: null, unit: unit({ status: 'G' }) }),
  [unseenFlag, unseenLabel] = spritesIn(unseen);

unseenFlag!.material = unseenFlag!.material.clone();
unseenFlag!.material.visible = false;
unseen.updateMatrixWorld(true);

expect(
  'a badge whose material is hidden isn’t gathered, as three.js wouldn’t draw it',
  badgeSprites(unseen).map((sprite) => sprite === unseenLabel),
  [true]
);

// The atlas's rows.
const shelves = new Shelves(100, 60, 2);

expect(
  'pictures are put in rows, each as tall as the first in it, with room round each; another row for one a different height; none where there’s no room',
  [
    shelves.place(30, 10),
    shelves.place(30, 10),
    shelves.place(30, 20),
    shelves.place(30, 10),
    shelves.place(40, 10),
    shelves.place(97, 10),
    shelves.place(30, 20),
    shelves.place(30, 20),
  ],
  [
    [2, 2],
    [36, 2],
    [2, 16],
    // The first row's full: another as tall, below.
    [2, 40],
    [36, 40],
    // Too wide for any.
    null,
    [36, 16],
    // The second row's full, and there's no room below.
    null,
  ]
);

// An atlas of labels.
const label = (text: string): BadgeImage =>
  kit.label(text, colours[0], '#ffffff').map!.image as BadgeImage;

const atlas = new BadgeAtlas(),
  first = label('Roma  3'),
  second = label('2 ★');

drawnOn.length = 0;
atlas.hold([first, second, first]);

const atlasCanvas = drawnOn.find(({ call }) => call === 'clearRect')?.canvas as
    | { width: number; height: number }
    | undefined,
  version = atlas.texture?.version ?? -1,
  [plainU, plainV, plainWidth, plainHeight] = atlas.plain,
  [firstU, firstV, firstWidth, firstHeight] = atlas.cellOf(first)!,
  [secondU, secondV] = atlas.cellOf(second)!,
  px = (cell: Cell, width: number, height: number): number[] => [
    Math.round(cell[0] * width),
    Math.round((1 - cell[1] - cell[3]) * height),
    Math.round(cell[2] * width),
    Math.round(cell[3] * height),
  ];

expect(
  'a label’s picture is copied into the atlas once, with its edges drawn on round it; a plain badge’s colour from the middle of a white block; each where it’s said to be',
  [
    atlasCanvas?.width,
    atlasCanvas?.height,
    drawnOn.filter(({ call }) => call === 'fillRect').map(({ args }) => args),
    drawnOn
      .filter(({ call, args }) => call === 'drawImage' && args.length === 3)
      .map(({ args }) => [
        args[0] === first ? 'first' : 'second',
        ...args.slice(1),
      ]),
    drawnOn.filter(
      ({ call, args }) => call === 'drawImage' && args.length === 9
    ).length,
    [plainU, plainV, plainWidth, plainHeight].map((n) => Math.round(n * 1e4)),
    px(atlas.cellOf(first)!, 1024, 256),
    px(atlas.cellOf(second)!, 1024, 256),
    [firstWidth, firstHeight].every((n) => n > 0),
    secondU > firstU && secondV === firstV,
    version > 0,
  ],
  [
    1024,
    256,
    // The white block, in the first row.
    [[4, 4, 16, 16]],
    [
      // In the second row, as it's taller: past the white block's row (16 and room round it, 4 a side).
      ['first', 4, 28],
      ['second', 4 + first.width + 8, 28],
    ],
    // Eight edges and corners for each.
    16,
    [Math.round((12 / 1024) * 1e4), Math.round((1 - 12 / 256) * 1e4), 0, 0],
    [4, 28, first.width, first.height],
    [4 + first.width + 8, 28, second.width, second.height],
    true,
    true,
    true,
  ]
);

// Held again with nothing new: nothing copied, nothing sent again.
drawnOn.length = 0;
atlas.hold([second, first]);

expect(
  'held again with nothing new, nothing’s copied in and it isn’t sent again',
  [drawnOn.length, atlas.texture?.version === version],
  [0, true]
);

// More than the atlas holds at its first size: copied afresh, those held now alone, then on an atlas twice as tall.
const many = Array.from({ length: 120 }, (_, index) => label(`Label ${index}`)),
  before = atlas.texture;

drawnOn.length = 0;
atlas.hold(many);

const grown = drawnOn.filter(({ call }) => call === 'clearRect').at(-1)
    ?.canvas as { width: number; height: number } | undefined,
  cells = many.map((image) => atlas.cellOf(image)),
  overlaps = cells.some((a, i) =>
    cells.some(
      (b, j) =>
        i !== j &&
        a !== null &&
        b !== null &&
        a[0] < b[0] + b[2] &&
        b[0] < a[0] + a[2] &&
        a[1] < b[1] + b[3] &&
        b[1] < a[1] + a[3]
    )
  );

expect(
  'more than fit: the atlas copied afresh, twice as tall and more, those held now in it alone, none over another; a new texture for it',
  [
    (grown?.height ?? 0) > 256,
    cells.every((cell) => cell !== null),
    atlas.cellOf(first),
    overlaps,
    atlas.texture !== before && atlas.texture !== null,
  ],
  [true, true, null, false, true]
);

// All drawn together.
const badges = new Badges(BADGES),
  { mesh } = badges;

expect(
  'all drawn in one mesh, over all as the sprites were, after the cloud and the smoke and before the pointer, casting no shadow, its quads placed in the shader',
  [
    mesh.renderOrder === BADGES,
    BADGES > CLOUD_ORDER && BADGES > SMOKE_ORDER && BADGES < POINTED,
    badges.material.depthTest,
    badges.material.depthWrite,
    badges.material.transparent,
    badges.material.fog,
    mesh.frustumCulled,
    mesh.castShadow,
  ],
  [true, true, false, false, true, true, false, false]
);

const count = badges.gather(world, camera),
  drawnInstances = (mesh.geometry as unknown as { instanceCount: number })
    .instanceCount,
  anchors = Array.from(
    mesh.geometry.getAttribute('anchor').array.slice(0, count * 3)
  ).map((n) => Math.round(n * 1e4) / 1e4);

expect(
  'gathered, each badge one instance, where it stands, in the order it’s drawn',
  [count, drawnInstances, anchors],
  [
    10,
    10,
    instances.flatMap(({ at }) => at.map((n) => Math.round(n * 1e4) / 1e4)),
  ]
);

// More than there's room for at first.
const crowd = new Group();

for (let index = 0; index < 300; index++) {
  const marker = drawMarker(kit, { city: null, unit: unit() });

  marker.position.set(index % 20, 0, Math.floor(index / 20));
  crowd.add(marker);
}

crowd.updateMatrixWorld(true);

expect(
  'more badges than there was room for: room made for them all',
  [
    badges.gather(crowd, camera),
    (mesh.geometry as unknown as { instanceCount: number }).instanceCount,
    mesh.geometry.getAttribute('anchor').count >= 300,
  ],
  [300, 300, true]
);

badges.dispose();

if (failures.length > 0) {
  process.stderr.write(
    `FAIL badges3d: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS badges3d (${checks} checks)\n`);
