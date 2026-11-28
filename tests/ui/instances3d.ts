// Units' and cities' meshes on the 3D map drawn as instances (`markers/instances.ts`, #1204), without a GPU:
//  - every mesh a marker draws, built-in or a model's, is on the instances' layer alone, in one solid material, so it
//    can be drawn so: none's left drawn by nothing;
//  - what's shown is gathered, the badges and the meshes, in one walk;
//  - each mesh is an instance of a batch of those of the same shape and material, casting shadows the same, where it
//    stands; those neither the camera sees nor the sun's shadows fall from aren't drawn;
//  - a marker fading has its own materials and casts no shadow under half solid: batches of its own;
//  - one that can't be drawn so is drawn as a mesh of its own, on the camera's layer;
//  - batches are kept from frame to frame, sent again and bounded round where their instances are now, for three.js to
//    cull them by, grown as more are drawn, hidden while none are and let go of after a few seconds, however many
//    frames come, and with the whole;
//  - two owners' models of a type, the same shape, are batches of their own, in their own colours.

import {
  BoxGeometry,
  Group,
  SkinnedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Texture,
  Vector3,
} from 'three';
import {
  MarkerKit,
  drawMarker,
  fade,
} from '@civ-clone/ui-map-3d/markers/drawMarker';
import MarkerInstances, {
  MARKER_LAYER,
  batchKey,
  batchable,
  gatherDrawn,
  instanced,
} from '@civ-clone/ui-map-3d/markers/instances';
import { BADGE_LAYER } from '@civ-clone/ui-map-3d/markers/badges';
import { LoadedModel } from '@civ-clone/ui-map-3d/models/loadModels';
import { UnitMarker } from '@civ-clone/ui-map-3d/markers/markerFor';

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

// Labels and the pointer are drawn on canvases: a context that measures every letter as 10 px and draws nothing.
Object.assign(globalThis, {
  document: {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        measureText: (text: string) => ({ width: text.length * 10 }),
        beginPath: () => undefined,
        roundRect: () => undefined,
        fill: () => undefined,
        fillText: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        closePath: () => undefined,
        stroke: () => undefined,
      }),
    }),
  },
});

const colours = ['#aa0000', '#ffffff'] as const,
  rivals = ['#0000aa', '#ffff00'] as const,
  kit = new MarkerKit(),
  // A model of two parts: one in its owner's colour, and one cut out by its alpha.
  model: LoadedModel = {
    parts: [
      {
        geometry: new BoxGeometry(1, 1, 1),
        map: new Texture(),
        tinted: true,
        cutout: false,
        doubleSided: false,
      },
      {
        geometry: new BoxGeometry(0.5, 0.5, 0.5),
        map: new Texture(),
        tinted: false,
        cutout: true,
        doubleSided: true,
      },
    ],
    scale: 0.1,
  };

kit.addModel('musketman', model);

const unit = (type: string, more: Partial<UnitMarker> = {}): UnitMarker => ({
  id: `Unit-${type}`,
  type,
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

const meshesIn = (root: Object3D): Mesh[] => {
  const found: Mesh[] = [];

  root.traverse((object) => {
    if ((object as Mesh).isMesh) {
      found.push(object as Mesh);
    }
  });

  return found;
};

// Every look a marker draws: on foot, mounted, a ship, an aircraft, fortified, awaiting orders with its ring, a
//  model's, in a walled city.
const markers = [
    drawMarker(kit, { city: null, unit: unit('Spearman') }),
    drawMarker(kit, { city: null, unit: unit('Knights') }),
    drawMarker(kit, {
      city: null,
      unit: unit('Trireme', { kinds: ['Naval'] }),
    }),
    drawMarker(kit, { city: null, unit: unit('Bomber', { kinds: ['Air'] }) }),
    drawMarker(kit, {
      city: null,
      unit: unit('Musketman', { fortified: true }),
    }),
    drawMarker(kit, { city: null, unit: unit('Settlers', { active: true }) }),
    drawMarker(kit, {
      city: null,
      unit: unit('Musketman', { model: 'musketman' }),
    }),
    drawMarker(kit, {
      city: { name: 'Roma', size: 3, colours, walled: true, disorder: false },
      unit: unit('Musketman', { model: 'musketman', active: true }),
    }),
    drawMarker(
      kit,
      { city: null, unit: unit('Bomber', { kinds: ['Air'] }) },
      true
    ),
  ],
  everyMesh = markers.flatMap(meshesIn);

expect(
  'every mesh a marker draws, built-in or a model’s, its stand, wall and ring, a city’s walls and an aircraft drawn to fly, is on the instances’ layer alone, in one solid material: none’s left drawn by nothing',
  [
    everyMesh.length > 15,
    everyMesh.every(
      (mesh) =>
        mesh.layers.isEnabled(MARKER_LAYER) &&
        !mesh.layers.isEnabled(0) &&
        batchable(mesh)
    ),
  ],
  [true, true]
);

// A world of markers, their badges and meshes.
const camera = new PerspectiveCamera(40, 1, 0.1, 100),
  sun = new OrthographicCamera(-4, 4, 4, -4, 0.5, 100),
  world = new Group(),
  place = (marker: Object3D, x: number, z: number): Object3D => {
    marker.position.set(x, 0, z);
    // Casting shadows on the land, as the stage draws markers (`markerOf`).
    marker.traverse((object) => {
      object.castShadow = (object as Mesh).isMesh === true;
    });
    world.add(marker);

    return marker;
  },
  // Two the same, near the middle; one in a rival's colours; one far off to the side, the sun's shadows falling over
  //  it but out of the camera's sight; one far behind both.
  first = place(drawMarker(kit, { city: null, unit: unit('Spearman') }), 0, 0),
  second = place(
    drawMarker(kit, { city: null, unit: unit('Spearman', { status: 'F' }) }),
    1,
    0.5
  ),
  rival = place(
    drawMarker(kit, {
      city: null,
      unit: unit('Spearman', { colours: rivals }),
    }),
    -1,
    0
  ),
  shaded = place(
    drawMarker(kit, { city: null, unit: unit('Spearman') }),
    -12,
    0
  ),
  away = place(drawMarker(kit, { city: null, unit: unit('Spearman') }), 60, 60),
  hidden = place(
    drawMarker(kit, { city: null, unit: unit('Spearman') }),
    0.5,
    -0.5
  );

hidden.visible = false;
// The world's copy a little along, so where each stands in the world isn't where it stands in its copy.
world.position.set(0.25, 0, 0);
camera.position.set(0, 8, 8);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
// The sun's shadow camera over the camera's view and off to its side, as far as the marker out of its sight.
sun.position.set(-4, 10, 0);
sun.lookAt(-4, 0, 0);
sun.left = -10;
sun.right = 10;
sun.updateProjectionMatrix();
sun.updateMatrixWorld();
world.updateMatrixWorld(true);

const drawn = gatherDrawn(world);

expect(
  'what’s shown is gathered in one walk: the badges on their layer and the meshes on theirs, none of a marker hidden',
  [
    drawn.sprites.every((sprite) => sprite.layers.isEnabled(BADGE_LAYER)),
    drawn.meshes.every((mesh) => mesh.layers.isEnabled(MARKER_LAYER)),
    drawn.meshes.length,
    meshesIn(hidden).some((mesh) => drawn.meshes.includes(mesh)),
  ],
  // The first, second, rival, shaded and away markers' figures (with their stands, one mesh each).
  [true, true, 5, false]
);

const instances = new MarkerInstances(),
  // The batches drawn now: those with none in them are kept hidden a while.
  shown = () =>
    [...instances.batches.values()].filter((batch) => batch.visible),
  count = instances.draw(drawn.meshes, camera, sun),
  meshOf = (marker: Object3D): Mesh => meshesIn(marker)[0]!,
  batchOf = (marker: Object3D) =>
    instances.batches.get(batchKey(meshOf(marker))),
  ours = batchOf(first),
  matricesOf = (batch: typeof ours): number[][] =>
    batch === undefined
      ? []
      : Array.from({ length: batch.count }, (_, index) =>
          Array.from(
            batch.instanceMatrix.array.slice(index * 16, index * 16 + 16)
          ).map((n) => Math.round(n * 1e4) / 1e4)
        ),
  worldOf = (marker: Object3D): number[] =>
    Array.from(meshOf(marker).matrixWorld.elements).map(
      (n) => Math.round(n * 1e4) / 1e4
    );

expect(
  'each mesh an instance of a batch of those of the same shape and material, where it stands; one in other colours a batch of its own; one the sun’s shadows fall from but the camera can’t see drawn, for its shadow; one neither sees not drawn',
  [
    count,
    instances.batches.size,
    ours === batchOf(second) && ours === batchOf(shaded),
    batchOf(rival) !== ours && batchOf(rival)?.count,
    matricesOf(ours),
    instances.group.children.length,
  ],
  [4, 2, true, 1, [worldOf(first), worldOf(second), worldOf(shaded)], 2]
);

expect(
  'a batch casts and takes shadows as its meshes do, in their order, and is bounded round where its instances are, for three.js to cull it by',
  [
    ours?.castShadow,
    ours?.receiveShadow,
    ours?.renderOrder,
    ours?.frustumCulled,
    [first, second, shaded].every((marker) =>
      ours?.boundingSphere?.containsPoint(
        new Vector3().setFromMatrixPosition(meshOf(marker).matrixWorld)
      )
    ),
  ],
  [
    meshOf(first).castShadow,
    meshOf(first).receiveShadow,
    meshOf(first).renderOrder,
    true,
    true,
  ]
);

// The next frame: the rival gone, and a marker fading out, under half solid.
world.remove(rival);
fade([second], 0.3, new Map());
world.updateMatrixWorld(true);

const before = ours,
  again = instances.draw(gatherDrawn(world).meshes, camera, sun),
  fadedBatch = batchOf(second);

const rivalBatch = instances.batches.get(batchKey(meshOf(rival)));

expect(
  'next frame: a batch still drawn is kept, one none are in is kept hidden, and a marker fading, with its own materials and no shadow under half solid, is a batch of its own',
  [
    again,
    batchOf(first) === before,
    batchOf(first)?.count,
    shown().length,
    [rivalBatch?.visible, rivalBatch?.count],
    fadedBatch !== undefined && fadedBatch !== before,
    fadedBatch?.castShadow,
  ],
  [3, true, 2, 2, [false, 0], true, false]
);

// One that can't be drawn as an instance, on their layer: drawn as a mesh of its own.
const glass = new MeshStandardMaterial({ transparent: true, opacity: 0.5 }),
  pane = instanced(new Mesh(new BoxGeometry(0.2, 0.2, 0.2), glass)),
  spare = new Group();

spare.add(pane);
spare.updateMatrixWorld(true);
instances.draw(gatherDrawn(spare).meshes, camera, sun);

expect(
  'one on the instances’ layer that can’t be drawn so, see-through, is drawn as a mesh of its own, on the camera’s layer too; drawn as instances again, a mesh is taken off it',
  [
    batchable(pane),
    pane.layers.isEnabled(0),
    shown().length,
    (() => {
      meshOf(first).layers.enable(0);
      instances.draw([meshOf(first)], camera, sun);

      return meshOf(first).layers.isEnabled(0);
    })(),
  ],
  [false, true, 0, false]
);

// The same shape and material, one casting no shadow: batches of their own.
const lit = drawMarker(kit, { city: null, unit: unit('Spearman') }),
  unlit = drawMarker(kit, { city: null, unit: unit('Spearman') }),
  pair = new Group();

meshOf(lit).castShadow = true;
meshOf(unlit).castShadow = false;

// And the same again, one taking shadows, and one drawn later.
const taking = drawMarker(kit, { city: null, unit: unit('Spearman') }),
  later = drawMarker(kit, { city: null, unit: unit('Spearman') });

meshOf(taking).castShadow = true;
meshOf(taking).receiveShadow = true;
meshOf(later).castShadow = true;
meshOf(later).renderOrder = 1;
pair.add(taking, later);
pair.add(lit, unlit);
pair.updateMatrixWorld(true);
instances.draw(gatherDrawn(pair).meshes, camera, sun);

expect(
  'the same shape and material, one casting a shadow and one not, one taking shadows, one drawn later: a batch each, casting, taking and drawn as its meshes are',
  [
    shown().length,
    shown()
      .map(
        ({ castShadow, receiveShadow, renderOrder, count }) =>
          `${castShadow} ${receiveShadow} ${renderOrder} ${count}`
      )
      .sort(),
  ],
  [4, ['false false 0 1', 'true false 0 1', 'true false 1 1', 'true true 0 1']]
);

// Many the same: room made for them all.
const crowd = new Group();

for (let index = 0; index < 40; index++) {
  const marker = drawMarker(kit, { city: null, unit: unit('Spearman') });

  marker.position.set(
    (index % 8) * 0.5 - 2,
    0,
    Math.floor(index / 8) * 0.5 - 1
  );
  crowd.add(marker);
}

crowd.updateMatrixWorld(true);

const outgrown = batchOf(crowd.children[0]!);
let outgrownLetGo = false;

outgrown?.addEventListener('dispose', () => {
  outgrownLetGo = true;
});

const crowdDrawn = instances.draw(gatherDrawn(crowd).meshes, camera, sun),
  grown = batchOf(crowd.children[0]!);

expect(
  'more than a batch had room for: room made for them all, in a batch made afresh, the one outgrown let go of and gone',
  [
    crowdDrawn,
    shown().length,
    grown?.count,
    (grown?.instanceMatrix.count ?? 0) >= 40,
    grown !== outgrown,
    outgrownLetGo,
    instances.group.children.includes(outgrown!),
    instances.group.children.length === instances.batches.size,
    grown?.instanceMatrix.updateRanges.map(({ start, count }) => [
      start,
      count,
    ]),
  ],
  [40, 1, 40, true, true, true, false, true, [[0, 40 * 16]]]
);

// A marker moved: where it is now sent again, and its batch bounded round it there.
const mover = crowd.children[0]!,
  version = grown?.instanceMatrix.version ?? 0;

mover.position.set(1.8, 0, 1.4);
crowd.updateMatrixWorld(true);
instances.draw(gatherDrawn(crowd).meshes, camera, sun);

expect(
  'a marker moved: where it is now is sent again, and its batch is bounded round it there',
  [
    (grown?.instanceMatrix.version ?? 0) > version,
    grown?.boundingSphere?.containsPoint(
      new Vector3().setFromMatrixPosition(meshOf(mover).matrixWorld)
    ),
  ],
  [true, true]
);

// Two owners' models: the same shape, in their own colours.
const owners = new Group(),
  ourModel = drawMarker(kit, {
    city: null,
    unit: unit('Musketman', { model: 'musketman' }),
  }),
  theirModel = drawMarker(kit, {
    city: null,
    unit: unit('Musketman', { model: 'musketman', colours: rivals }),
  });

theirModel.position.set(1, 0, 0);
owners.add(ourModel, theirModel);
owners.updateMatrixWorld(true);
instances.draw(gatherDrawn(owners).meshes, camera, sun);

const tintedPart = (marker: Object3D): Mesh =>
  meshesIn(marker).find(
    (mesh) => (mesh.material as { isTintedMaterial?: boolean }).isTintedMaterial
  )!;

expect(
  'two owners’ models of a type, the same shape: a batch each, in their own colours',
  [
    tintedPart(ourModel).geometry === tintedPart(theirModel).geometry,
    tintedPart(ourModel).material !== tintedPart(theirModel).material,
    batchOf(ourModel) !== undefined &&
      instances.batches.get(batchKey(tintedPart(ourModel))) !==
        instances.batches.get(batchKey(tintedPart(theirModel))),
    instances.batches.get(batchKey(tintedPart(theirModel)))?.material ===
      tintedPart(theirModel).material,
  ],
  [true, true, true, true]
);

// One casting no shadow that only the sun's shadow map covers, out of the camera's sight: not drawn.
const unseenUnlit = drawMarker(kit, { city: null, unit: unit('Spearman') }),
  unseenGroup = new Group();

unseenUnlit.position.set(-12, 0, 0);
meshOf(unseenUnlit).castShadow = false;
unseenGroup.add(unseenUnlit);
unseenGroup.updateMatrixWorld(true);

// A skinned mesh put on their layer: drawn as a mesh of its own.
const skinned = instanced(
    new SkinnedMesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshStandardMaterial())
  ),
  skinnedGroup = new Group();

skinnedGroup.add(skinned);
skinnedGroup.updateMatrixWorld(true);

expect(
  'one casting no shadow that only the sun’s shadow map covers isn’t drawn; a skinned one is drawn as a mesh of its own',
  [
    instances.draw(gatherDrawn(unseenGroup).meshes, camera, sun),
    instances.draw(gatherDrawn(skinnedGroup).meshes, camera, sun),
    skinned.layers.isEnabled(0),
  ],
  [0, 0, true]
);

// None drawn for a while: the batches kept hidden for a few seconds, however many frames come, then let go of.
const idling = new MarkerInstances();

// Well into the page's life, as the clock is in a browser.
const T = 100000;

idling.draw(gatherDrawn(owners).meshes, camera, sun, T + 1000);

const kept = [...idling.batches.values()];
let letGo = 0;

kept.forEach((batch) =>
  batch.addEventListener('dispose', () => {
    letGo++;
  })
);

// Two hundred frames over the next two seconds, none drawn.
for (let frame = 1; frame <= 200; frame++) {
  idling.draw([], camera, sun, T + 1000 + frame * 10);
}

const keptAfterFrames = [
  letGo,
  idling.batches.size === kept.length,
  kept.every((batch) => !batch.visible),
];

// Drawn again at 3.1 s, then none for 2.9 s more: kept, its clock started afresh.
idling.draw(gatherDrawn(owners).meshes, camera, sun, T + 3100);

for (let frame = 1; frame <= 290; frame++) {
  idling.draw([], camera, sun, T + 3100 + frame * 10);
}

const keptAfterReturn = [letGo, idling.batches.size === kept.length];

idling.draw([], camera, sun, T + 6500);

const afterLetGo = [letGo, idling.batches.size, idling.group.children.length];

// Made afresh for one frame, then none: the new ones kept.
idling.draw(gatherDrawn(owners).meshes, camera, sun, T + 7000);
idling.draw([], camera, sun, T + 7010);

const keptAfterRemake = idling.batches.size === kept.length;

expect(
  'with none drawn in them, the batches are kept hidden for a few seconds however many frames come, their clock started afresh as they’re drawn again, then let go of; made afresh, kept again',
  [
    kept.length > 0,
    keptAfterFrames,
    keptAfterReturn,
    afterLetGo,
    keptAfterRemake,
  ],
  [true, [0, true, true], [0, true], [kept.length, 0, 0], true]
);

// Let go of while it still draws: its batches let go of with it.
const live = new MarkerInstances(),
  odd = drawMarker(kit, { city: null, unit: unit('Spearman') }),
  oddGroup = new Group();

meshOf(odd).receiveShadow = true;
meshOf(odd).renderOrder = 2;
oddGroup.add(odd);
oddGroup.updateMatrixWorld(true);
live.draw(gatherDrawn(oddGroup).meshes, camera, sun);

const oddBatch = live.batches.get(batchKey(meshOf(odd)));
let liveLetGo = 0;

live.batches.forEach((batch) =>
  batch.addEventListener('dispose', () => {
    liveLetGo++;
  })
);

const liveBatches = live.batches.size;

live.dispose();

expect(
  'a batch takes shadows and is drawn in the order its meshes are; let go of while it still draws, its batches are let go of with it, and it draws nothing',
  [
    oddBatch?.receiveShadow,
    oddBatch?.renderOrder,
    liveBatches,
    liveLetGo,
    live.batches.size,
    live.group.children.length,
  ],
  [true, 2, 1, 1, 0, 0]
);

instances.dispose();

if (failures.length > 0) {
  process.stderr.write(
    `FAIL instances3d: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS instances3d (${checks} checks)\n`);
