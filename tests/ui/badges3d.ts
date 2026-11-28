// What stands over units and cities on the 3D map, drawn all together (`markers/badges.ts`, #1424), without a GPU:
//  - every badge a marker draws is on the badges' layer, which the camera doesn't draw, but the pointer, which it does;
//  - those shown are gathered, in the order three.js would draw them as sprites of their own: far before near, and a
//    marker's in the order they're made;
//  - each as its sprite stands and is drawn: where, how big on the screen, the point of it that stands there, its
//    colour and how solid, faded or not, and its picture;
//  - their pictures in one atlas, each with room round it and its edges drawn on into it, sent again as it changes; the
//    atlas copied afresh when one doesn't fit or it holds many no longer drawn, and grown when they still don't fit or
//    would take most of it; at its most, holding as many as fit and not copied afresh again for the same; a label it
//    can't hold drawn as a sprite of its own;
//  - all drawn in one draw call, over all as the sprites were, after the cloud and the smoke, before the pointer.

import {
  Group,
  Object3D,
  PerspectiveCamera,
  SRGBColorSpace,
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
    drawnOn
      .filter(
        ({ call, args }) =>
          call === 'drawImage' && args.length === 9 && args[0] === first
      )
      .map(({ args }) => args.slice(1)),
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
    // Each a strip of its edge, or its corner's pixel, stretched over the room beside it: its sides, its top and
    //  bottom, its corners.
    (([w, h]) => [
      [0, 0, 1, h, 0, 28, 4, h],
      [w - 1, 0, 1, h, 4 + w, 28, 4, h],
      [0, 0, w, 1, 4, 24, w, 4],
      [0, h - 1, w, 1, 4, 28 + h, w, 4],
      [0, 0, 1, 1, 0, 24, 4, 4],
      [w - 1, 0, 1, 1, 4 + w, 24, 4, 4],
      [0, h - 1, 1, 1, 0, 28 + h, 4, 4],
      [w - 1, h - 1, 1, 1, 4 + w, 28 + h, 4, 4],
    ])([first.width, first.height]),
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

// A label more, with room for it: copied in alone, and sent again.
const third = label('Roma  4');

drawnOn.length = 0;
atlas.hold([first, second, third]);

expect(
  'a label more, with room for it: copied in alone, the rest left as they are, and the atlas sent again',
  [
    drawnOn.filter(({ call }) => call === 'clearRect').length,
    drawnOn.filter(({ call }) => call === 'drawImage').length,
    atlas.cellOf(third) !== null && atlas.cellOf(first) !== null,
    (atlas.texture?.version ?? 0) > version,
  ],
  [0, 9, true, true]
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

// Labels as wide as a row: one to a row, 48 px tall with the room round it, under the white block's row of 24.
const wide = (index: number): BadgeImage =>
    label(`${String(index).padStart(3, '0')}${'W'.repeat(94)}`),
  heightOf = (held: BadgeAtlas): number =>
    (held.texture?.image as { height: number } | undefined)?.height ?? 0;

const roomy = new BadgeAtlas(),
  fewWide = [0, 1, 2].map(wide);

drawnOn.length = 0;
roomy.hold(fewWide);

const roomyHeight = heightOf(roomy);

const nextWide = [3, 4, 5, 6].map(wide);

drawnOn.length = 0;
roomy.hold(nextWide);

expect(
  'copied afresh, an atlas whose rows would take most of it is grown, so a label more doesn’t copy it all again',
  [
    roomyHeight,
    drawnOn.filter(({ call }) => call === 'clearRect').length > 0,
    heightOf(roomy),
    nextWide.every((image) => roomy.cellOf(image) !== null),
    fewWide.every((image) => roomy.cellOf(image) === null),
  ],
  // Four rows of 48 under the white block's 24 take 216 of 256: grown, rather than kept nearly full.
  [256, true, 512, true, true]
);

// More than it holds at its most, behind one too wide to hold at all.
const crowded = new BadgeAtlas(),
  tooWide = label('X'.repeat(110)),
  hundred = Array.from({ length: 100 }, (_, index) => wide(index));

drawnOn.length = 0;
crowded.hold([tooWide, ...hundred]);

const crowdedHeight = heightOf(crowded),
  heldOfHundred = hundred.filter((image) => crowded.cellOf(image) !== null),
  crowdedVersion = crowded.texture?.version;

drawnOn.length = 0;
crowded.hold([tooWide, ...hundred]);

const againDrawn = drawnOn.length,
  againVersion = crowded.texture?.version;

drawnOn.length = 0;
crowded.hold(hundred.slice(1));

expect(
  'more than it holds at its most: as many as fit held, none stopped by one too wide to hold at all; asked for the same again, not copied afresh nor sent again; asked for others, copied afresh',
  [
    crowdedHeight,
    crowded.cellOf(tooWide),
    // Rows of 48 under the white block's 24, in 4,096.
    heldOfHundred.length,
    heldOfHundred.every((image, index) => image === hundred[index]),
    againDrawn,
    againVersion === crowdedVersion,
    drawnOn.filter(({ call }) => call === 'clearRect').length,
  ],
  [4096, null, Math.floor((4096 - 24) / 48), true, 0, true, 1]
);

// Labels no marker shows any more: once many more are held than drawn, copied afresh with those drawn.
const sweeping = new BadgeAtlas(),
  shown = Array.from({ length: 80 }, (_, index) => label(`Town ${index}`));

sweeping.hold(shown);
drawnOn.length = 0;
sweeping.hold(shown.slice(0, 5));

expect(
  'once many more labels are held than drawn, the atlas is copied afresh with those drawn',
  [
    drawnOn.filter(({ call }) => call === 'clearRect').length,
    shown.slice(0, 5).every((image) => sweeping.cellOf(image) !== null),
    shown.slice(5).every((image) => sweeping.cellOf(image) === null),
  ],
  [1, true, true]
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

const written = (name: string, width: number): number[] =>
    Array.from(
      mesh.geometry.getAttribute(name).array.slice(0, count * width)
    ).map((n) => Math.round(n * 1e4) / 1e4),
  expected = badgeInstances(badgeSprites(world), camera, (image) =>
    image === null ? badges.atlas.plain : badges.atlas.cellOf(image)
  ),
  rounded = (values: readonly number[]): number[] =>
    values.map((n) => Math.round(n * 1e4) / 1e4);

expect(
  'gathered, each badge one instance, where it stands, how big, the point of it there, its colour and its cell, in the order it’s drawn, drawn from the atlas',
  [
    count,
    drawnInstances,
    anchors,
    written('size', 2),
    written('centre', 2),
    written('colour', 4),
    written('cell', 4),
    badges.material.uniforms['atlas']!.value === badges.atlas.texture &&
      badges.atlas.texture !== null,
  ],
  [
    10,
    10,
    instances.flatMap(({ at }) => at.map((n) => Math.round(n * 1e4) / 1e4)),
    rounded(expected.flatMap(({ size }) => size)),
    rounded(expected.flatMap(({ centre }) => centre)),
    rounded(expected.flatMap(({ colour }) => colour)),
    rounded(expected.flatMap(({ cell }) => cell)),
    true,
  ]
);

// Each drawn together off the camera's layer, at the badges' order; written afresh, as far as they're drawn.
expect(
  'gathered, those drawn together are off the camera’s layer, in the badges’ order; what’s written is sent again as far as it’s drawn; the atlas is read as the labels were',
  [
    badgeSprites(world).every(
      (sprite) => !sprite.layers.isEnabled(0) && sprite.renderOrder === BADGES
    ),
    (['anchor', 'size', 'centre', 'colour', 'cell'] as const).map((name) => {
      const attribute = mesh.geometry.getAttribute(name) as unknown as {
        version: number;
        itemSize: number;
        updateRanges: { start: number; count: number }[];
      };

      return [
        attribute.version > 0,
        attribute.updateRanges.map(({ start, count }) => [
          start,
          count / attribute.itemSize,
        ]),
      ];
    }),
    badges.atlas.texture?.colorSpace,
  ],
  [true, Array.from({ length: 5 }, () => [true, [[0, 10]]]), SRGBColorSpace]
);

// A badge whose label's too wide for the atlas: drawn as a sprite of its own, as they all were, the rest together.
const overflowing = new Group(),
  long = drawMarker(kit, {
    city: null,
    unit: unit({ status: 'X'.repeat(110) }),
  }),
  [longFlag, longLabel] = spritesIn(long);

overflowing.add(long);
overflowing.updateMatrixWorld(true);

expect(
  'a badge whose label won’t fit in the atlas is drawn as a sprite of its own, on the camera’s layer too; the rest together',
  [
    badges.gather(overflowing, camera),
    longLabel!.layers.isEnabled(0),
    longLabel!.layers.isEnabled(BADGE_LAYER),
    longFlag!.layers.isEnabled(0),
    // Not grown for it, as it would never fit.
    heightOf(badges.atlas) < 4096,
  ],
  [1, true, true, false, true]
);

// More labels than the atlas holds at its most: those it can't hold drawn as sprites of their own, under the rest;
//  drawn with fewer, held again, and drawn together.
const flipping = new Badges(BADGES),
  rows = Array.from({ length: 100 }, (_, index) => {
    const marker = drawMarker(kit, {
      city: null,
      unit: unit({
        status: `${String(index).padStart(3, '0')}${'W'.repeat(94)}`,
      }),
    });

    marker.position.set(index % 10, 0, Math.floor(index / 10));

    return marker;
  }),
  labelOf = (marker: Object3D): Sprite =>
    spritesIn(marker).find((sprite) => sprite.material.map !== null)!,
  allRows = new Group(),
  lastRows = new Group();

allRows.add(...rows);
allRows.updateMatrixWorld(true);

const drawnAll = flipping.gather(allRows, camera),
  apart = rows.filter((marker) => labelOf(marker).layers.isEnabled(0)),
  apartUnder = apart.every(
    (marker) =>
      labelOf(marker).renderOrder < BADGES &&
      labelOf(marker).renderOrder > SMOKE_ORDER
  );

// Drawn as they are, but with the rest gone.
lastRows.add(...apart);
lastRows.updateMatrixWorld(true);

const drawnApart = flipping.gather(lastRows, camera);

expect(
  'more labels than the atlas holds: those it can’t hold drawn as sprites of their own, under the rest; drawn again with fewer, held, and drawn together',
  [
    drawnAll,
    apart.length,
    apartUnder,
    drawnApart,
    apart.every(
      (marker) =>
        !labelOf(marker).layers.isEnabled(0) &&
        labelOf(marker).renderOrder === BADGES
    ),
  ],
  // Each row's flag, and the labels held: 84 rows of 48 under the white block's 24, in 4,096.
  [100 + 84, 16, true, 32, true]
);

flipping.dispose();

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
