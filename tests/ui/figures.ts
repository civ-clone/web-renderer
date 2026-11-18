// The built-in set's units on the 3D map (docs/3d-renderer-plan.md 2.1), without a GPU:
//  - every unit type Civ1 and Civ2 name has an entry, as do the debug page's, and a type the table doesn't know is
//    drawn by its kind;
//  - each look's figures are one geometry, with a colour for every point, standing on its square and within it, in
//    its owner's colours; a squad is as many figures as it says (D6);
//  - the marker kit makes each look in each pair of colours once, and lets them all go when taken down;
//  - a unit's marker: its figures on a stand (a ship without one), behind a low wall when fortified, under its flag
//    with the stack's size, its letter and a veteran's star, a bar for its hit points when hurt, and a ring and a
//    pointer when it awaits orders.

import * as Civ1Units from '@civ-clone/civ1-unit/Units';
import * as Civ2Units from '@civ-clone/civ2-unit/Units';
import { BufferGeometry, Color, Group, Mesh, Object3D, Sprite } from 'three';
import {
  UnitLook,
  unitLook,
  unitTable,
} from '@civ-clone/ui-models-builtin/units';
import { MarkerKit, drawMarker } from '@civ-clone/ui-map-3d/markers/drawMarker';
import {
  figureGeometry,
  figureParts,
} from '@civ-clone/ui-map-3d/markers/figures';
import { UnitMarker } from '@civ-clone/ui-map-3d/markers/markerFor';
import { landTypes, seaTypes } from '@civ-clone/ui-map-3d/debug/populate';

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

// Labels are drawn on canvases: a context that measures every letter as 10 px and draws nothing.
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
      }),
    }),
  },
});

const colours = ['#aa0000', '#ffffff'] as const,
  others = ['#0000aa', '#ffff00'] as const;

// Every unit type the engine's Civ1 and Civ2 rules name.
const named = [
  ...new Set([...Object.keys(Civ1Units), ...Object.keys(Civ2Units)]),
].sort();

expect(
  'every unit type Civ1 and Civ2 name has an entry in the built-in set',
  [named.length > 40, named.filter((name) => !(name in unitTable))],
  [true, []]
);

expect(
  'the debug page’s units are all ones the built-in set draws by name',
  [...landTypes, ...seaTypes].filter((type) => !(type in unitTable)),
  []
);

expect(
  'a type the table doesn’t know is drawn by its kind: a ship, an aircraft, or soldiers on foot; one it knows, as it says',
  [
    unitLook('Zeppelin', ['Air', 'Unit']).shape,
    unitLook('Coracle', ['NavalTransport', 'Naval', 'Unit']).shape,
    unitLook('Coracle', ['Naval', 'Unit']).shape,
    unitLook('Hoplite', ['Fortifiable', 'Land', 'Unit']).shape,
    unitLook('toString').shape,
    unitLook('Trireme', ['Air']).hull,
  ],
  ['aircraft', 'ship', 'ship', 'foot', 'foot', 'oars']
);

// The colours a geometry's points carry, as CSS hex.
const coloursIn = (geometry: BufferGeometry): Set<string> => {
  const attribute = geometry.getAttribute('color'),
    found = new Set<string>(),
    colour = new Color();

  for (let point = 0; point < attribute.count; point++) {
    colour.setRGB(
      attribute.getX(point),
      attribute.getY(point),
      attribute.getZ(point)
    );
    found.add(`#${colour.getHexString()}`);
  }

  return found;
};

// What's wrong with a look's geometry, if anything.
const faultsOf = (type: string, look: UnitLook): string[] => {
  const geometry = figureGeometry(look, colours),
    points = geometry.getAttribute('position')?.count ?? 0,
    box = geometry.boundingBox,
    found = coloursIn(geometry),
    faults: string[] = [];

  if (points === 0) {
    faults.push(`${type}: no points`);
  }

  if (
    geometry.getAttribute('color')?.count !== points ||
    geometry.getAttribute('normal')?.count !== points
  ) {
    faults.push(`${type}: not a colour and a normal for every point`);
  }

  // On its square, standing on it (a submarine a little under the water), and no taller than half a square.
  if (
    box === null ||
    box.min.y < -0.03 ||
    box.max.y > 0.5 ||
    Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) > 0.3
  ) {
    faults.push(`${type}: outside its square`);
  }

  if (!found.has(colours[0]) && !found.has(colours[1])) {
    faults.push(`${type}: none of its owner’s colours`);
  }

  geometry.dispose();

  return faults;
};

expect(
  'each look’s figures are one geometry, a colour and a normal for every point, standing on its square within it, in its owner’s colours',
  Object.entries(unitTable).flatMap(([type, look]) => faultsOf(type, look)),
  []
);

const one = (look: UnitLook): number => figureParts(look, colours).parts.length;

expect(
  'a squad is as many figures as it says: three soldiers, two riders, one ship',
  [
    one({ ...unitTable['Spearman']!, squad: 3 }) /
      one({ ...unitTable['Spearman']!, squad: 1 }),
    one({ ...unitTable['Knight']!, squad: 2 }) /
      one({ ...unitTable['Knight']!, squad: 1 }),
    unitTable['Spearman']!.squad,
    unitTable['Knight']!.squad,
    unitTable['Battleship']!.squad,
  ],
  [3, 2, 3, 2, 1]
);

const theirs = figureGeometry(unitTable['Musketman']!, others),
  ours = figureGeometry(unitTable['Musketman']!, colours);

expect(
  'another owner’s are in their colours, not ours',
  [
    coloursIn(theirs).has(others[0]),
    coloursIn(theirs).has(colours[0]),
    coloursIn(ours).has(colours[0]),
  ],
  [true, false, true]
);
theirs.dispose();
ours.dispose();

// The kit: each look in each pair of colours made once, and all let go together.
const kit = new MarkerKit(),
  spearmen = kit.figure(unitTable['Spearman']!, colours),
  disposed: BufferGeometry[] = [];

[spearmen, kit.figure(unitTable['Spearman']!, others)].forEach((geometry) =>
  geometry.addEventListener('dispose', () => void disposed.push(geometry))
);

expect(
  'the kit makes each look in each pair of colours once',
  [
    kit.figure(unitTable['Spearman']!, colours) === spearmen,
    kit.figure(unitTable['Spearman']!, others) === spearmen,
  ],
  [true, false]
);

// A unit's marker, and what's in it.
const unit = (type: string, more: Partial<UnitMarker> = {}): UnitMarker => ({
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
    ...more,
  }),
  drawn = (marker: UnitMarker): Object3D[] => {
    const group = drawMarker(kit, { city: null, unit: marker }),
      found: Object3D[] = [];

    group.traverse((object) => {
      if (!(object instanceof Group)) {
        found.push(object);
      }
    });

    return found;
  },
  meshOf = (found: Object3D[], geometry: BufferGeometry): Mesh | undefined =>
    found.find(
      (object): object is Mesh =>
        object instanceof Mesh && object.geometry === geometry
    ),
  figureOf = (found: Object3D[]): Mesh | undefined =>
    found.find(
      (object): object is Mesh =>
        object instanceof Mesh && object.material === kit.figureMaterial
    ),
  { stand, bank, flag, bar, ring, pointer } = kit.geometries;

const soldiers = drawn(unit('Spearman')),
  soldiersFigure = figureOf(soldiers),
  soldiersFlag = meshOf(soldiers, flag),
  soldiersTop =
    (soldiersFigure?.position.y ?? 0) +
    (soldiersFigure?.geometry.boundingBox?.max.y ?? 0) *
      (soldiersFigure?.scale.y ?? 1);

expect(
  'a unit is its figures on a stand in its owner’s second colour, its owner’s flag over them, and nothing else',
  [
    soldiersFigure?.geometry === spearmen,
    meshOf(soldiers, stand)?.material === kit.material(colours[1]),
    (soldiersFigure?.position.y ?? 0) > 0,
    soldiersFlag?.material === kit.material(colours[0]),
    (soldiersFlag?.position.y ?? 0) > soldiersTop,
    soldiers.length,
  ],
  [true, true, true, true, true, 3]
);

const trireme = drawn(unit('Trireme'));

expect(
  'a ship rides the water without a stand',
  [meshOf(trireme, stand), figureOf(trireme)?.position.y],
  [undefined, 0]
);

const fighter = drawn(unit('Fighter')),
  fighterFigure = figureOf(fighter);

expect(
  'an aircraft’s flag flies over it, high as it is',
  (meshOf(fighter, flag)?.position.y ?? 0) >
    (fighterFigure?.geometry.boundingBox?.max.y ?? 1) *
      (fighterFigure?.scale.y ?? 1) +
      (fighterFigure?.position.y ?? 0),
  true
);

const veterans = drawn(
    unit('Musketman', {
      count: 3,
      busy: true,
      fortified: true,
      veteran: true,
      status: 'F',
      health: 0.2,
    })
  ),
  label = veterans.find((object): object is Sprite => object instanceof Sprite),
  bars = veterans.filter(
    (object): object is Mesh =>
      object instanceof Mesh && object.geometry === bar
  );

expect(
  'fortified, behind a low wall; its flag says the stack’s size, its letter and a veteran’s star; a short red bar for few hit points',
  [
    meshOf(veterans, bank) !== undefined,
    label?.material === kit.label('3 F ★', colours[0], '#ffffff'),
    bars.length,
    bars[1]?.material === kit.material('#d04030'),
    Math.round((bars[1]?.scale.x ?? 0) * 1000),
  ],
  [true, true, 2, true, 22]
);

expect(
  'unhurt, alone and idle: no bar, no label, no wall',
  [
    soldiers.some((object) => object instanceof Sprite),
    meshOf(soldiers, bar),
    meshOf(soldiers, bank),
  ],
  [false, undefined, undefined]
);

const active = drawn(unit('Spearman', { active: true })),
  activeFlag = meshOf(active, flag);

expect(
  'the unit awaiting orders has a ring at its feet and a pointer over its flag',
  [
    meshOf(active, ring) !== undefined,
    (meshOf(active, pointer)?.position.y ?? 0) > (activeFlag?.position.y ?? 1),
  ],
  [true, true]
);

kit.dispose();

expect('taken down, the kit lets every figure it made go', disposed.length, 2);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL figures: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS figures (${checks} checks)\n`);
