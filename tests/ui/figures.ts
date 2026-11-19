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
import {
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Object3D,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import {
  UnitLook,
  unitLook,
  unitTable,
} from '@civ-clone/ui-models-builtin/units';
import {
  MarkerKit,
  UNIT_PART,
  drawMarker,
} from '@civ-clone/ui-map-3d/markers/drawMarker';
import Water, { Clouds } from '@civ-clone/ui-map-3d/water';
import {
  Placed,
  SLIDE,
  carriedSlide,
  slideAlong,
  unitDrawnAt,
} from '@civ-clone/ui-map-3d/stage';
import {
  Part,
  figureGeometry,
  figureParts,
  partMatrix,
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

// A ground for a cloud to be made over, to know its order.
const ground = {
  columns: 8,
  rows: 8,
  spacingU: 0.5,
  spacingV: 0.5,
  wrapsV: false,
};

// How much bigger the map draws units than their figures are made.
const DRAWN = 1.5;

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

  // Drawn half as big again: on its square, standing on it (a submarine a little under the water), no taller than
  //  half a square and no more than a third of one from its middle, so it stays in its square in front of a city.
  if (
    box === null ||
    box.min.y * DRAWN < -0.03 ||
    box.max.y * DRAWN > 0.6 ||
    Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) * DRAWN > 0.36
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

// Every type looks unlike every other: its points and colours, as drawn.
const drawnAs = new Map<string, string[]>();

Object.entries(unitTable).forEach(([type, look]) => {
  const geometry = figureGeometry(look, colours),
    key = [
      ...Array.from(geometry.getAttribute('position').array, (n) =>
        n.toFixed(4)
      ),
      '|',
      ...Array.from(geometry.getAttribute('color').array, (n) => n.toFixed(3)),
    ].join(',');

  drawnAs.set(key, [...(drawnAs.get(key) ?? []), type]);
  geometry.dispose();
});

expect(
  'no two unit types look the same: settlers, a caravan and a chariot, a cruiser and a battleship, and the rest',
  [...drawnAs.values()].filter((types) => types.length > 1),
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

// A soldier turned in its squad turns its tilted shield with it: the shield's face turned as the soldier is, not rolled.
const shield = figureParts(
    { ...unitTable['Spearman']!, squad: 3 },
    colours
  ).parts.find(({ turn }) => turn !== undefined && turn[0] === Math.PI / 2),
  faceOf = (part: Part | undefined): Vector3 =>
    part === undefined
      ? new Vector3()
      : new Vector3(0, 1, 0).transformDirection(partMatrix(part)),
  turned = faceOf(shield),
  // The same shield on a soldier not turned, then turned about the vertical as the soldier is.
  expectedFace = faceOf(
    shield === undefined ? undefined : { ...shield, yaw: 0 }
  ).applyAxisAngle(new Vector3(0, 1, 0), shield?.yaw ?? 0);

expect(
  'a soldier turned in its squad turns its tilted shield with it',
  [Math.abs(shield?.yaw ?? 0) > 0, turned.distanceTo(expectedFace) < 1e-9],
  [true, true]
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
  disposed: unknown[] = [];

[spearmen, kit.figure(unitTable['Spearman']!, others)].forEach((geometry) =>
  geometry.addEventListener('dispose', () => void disposed.push(geometry))
);
// And a flag's material, and the pointer's, and its picture.
[kit.plain(colours[0]), kit.pointer(), kit.pointer().map!].forEach((made) =>
  made.addEventListener('dispose', () => void disposed.push(made))
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
  spriteOf = (
    found: Object3D[],
    material: SpriteMaterial
  ): Sprite | undefined =>
    found.find(
      (object): object is Sprite =>
        object instanceof Sprite && object.material === material
    ),
  { stand, bank, ring } = kit.geometries;

const soldiers = drawn(unit('Spearman')),
  soldiersFigure = figureOf(soldiers),
  soldiersFlag = spriteOf(soldiers, kit.plain(colours[0])),
  soldiersTop =
    (soldiersFigure?.position.y ?? 0) +
    (soldiersFigure?.geometry.boundingBox?.max.y ?? 0) *
      (soldiersFigure?.scale.y ?? 1);

expect(
  'a unit is its figures on a stand in its owner’s second colour, its owner’s flag over them, the same size on the screen however far away and never culled, and nothing else',
  [
    soldiersFigure?.geometry === spearmen,
    meshOf(soldiers, stand)?.material === kit.material(colours[1]),
    (soldiersFigure?.position.y ?? 0) > 0,
    soldiersFlag?.material.sizeAttenuation === false &&
      soldiersFlag?.frustumCulled === false,
    (soldiersFlag?.position.y ?? 0) > soldiersTop,
    soldiers.length,
  ],
  [true, true, true, true, true, 3]
);

expect(
  'its figures face the way it last went',
  figureOf(drawn(unit('Spearman', { facing: 1.25 })))?.rotation.y,
  1.25
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
  (spriteOf(fighter, kit.plain(colours[0]))?.position.y ?? 0) >
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
  label = spriteOf(veterans, kit.label('3 F ★', colours[0], '#ffffff')),
  back = spriteOf(veterans, kit.plain('#202020')),
  front = spriteOf(veterans, kit.plain('#d04030')),
  veteransFlag = spriteOf(veterans, kit.plain(colours[0])),
  // In a copy of the marker, as the stage draws one at each copy of the world: the front still made after the back.
  afterItsBack = (): boolean => {
    const copied: Object3D[] = [];

    drawMarker(kit, {
      city: null,
      unit: unit('Musketman', { health: 0.2 }),
    })
      .clone()
      .traverse((object) => void copied.push(object));

    const copiedBack = spriteOf(copied, kit.plain('#202020')),
      copiedFront = spriteOf(copied, kit.plain('#d04030'));

    return (
      copiedBack !== undefined &&
      copiedFront !== undefined &&
      copiedFront.id > copiedBack.id
    );
  },
  // Where a sprite's ends are, across the screen and up it, from the point it stands at, in ten-thousandths of the
  //  screen's units: a sprite's `center` is that point.
  ends = (sprite: Sprite | undefined): [number, number] => [
    Math.round(-(sprite?.center.x ?? 0) * (sprite?.scale.x ?? 0) * 10000),
    Math.round((1 - (sprite?.center.x ?? 0)) * (sprite?.scale.x ?? 0) * 10000),
  ],
  span = (sprite: Sprite | undefined): [number, number] => [
    -(sprite?.center.y ?? 0) * (sprite?.scale.y ?? 0),
    (1 - (sprite?.center.y ?? 0)) * (sprite?.scale.y ?? 0),
  ],
  // Whether each of `sprites` starts above the last ends, up the screen from the same point.
  stacked = (...sprites: (Sprite | undefined)[]): boolean =>
    sprites.every(
      (sprite, index) =>
        sprite !== undefined &&
        sprite.position.equals(sprites[0]!.position) &&
        (index === 0 || span(sprite)[0] >= span(sprites[index - 1])[1])
    );

expect(
  'fortified, behind a low wall; its flag’s label says the stack’s size, its letter and a veteran’s star; a short red bar for few hit points, from the bar’s left, drawn over it, all from one point up the screen: the bar, the flag, the label',
  [
    meshOf(veterans, bank) !== undefined,
    label !== undefined,
    ends(back),
    ends(front),
    // Drawn after its back: at the same depth and order, as it's made after it, and when the map copies it.
    front?.renderOrder === back?.renderOrder &&
      (front?.id ?? 0) > (back?.id ?? 0) &&
      front?.position.equals(back!.position),
    afterItsBack(),
    span(front)[0] >= span(back)[0] && span(front)[1] <= span(back)[1],
    stacked(back, veteransFlag, label),
  ],
  [true, true, [-90, 90], [-90, -54], true, true, true, true]
);

expect(
  'unhurt, alone and idle: no bar, no label, no wall',
  [
    soldiers.filter((object) => object instanceof Sprite).length,
    meshOf(soldiers, bank),
  ],
  // Its flag alone.
  [1, undefined]
);

const active = drawn(unit('Spearman', { active: true, count: 2 })),
  activeFlag = spriteOf(active, kit.plain(colours[0])),
  activeLabel = spriteOf(active, kit.label('2', colours[0], '#ffffff')),
  pointer = spriteOf(active, kit.pointer());

expect(
  'the unit awaiting orders has a ring at its feet, and a pointer the same size on the screen however far away, over its flag and label from the same point, drawn over them',
  [
    meshOf(active, ring) !== undefined,
    pointer?.material.sizeAttenuation,
    stacked(activeFlag, activeLabel, pointer),
    (pointer?.renderOrder ?? 0) > (activeLabel?.renderOrder ?? 0),
  ],
  [true, false, true, true]
);

// In a city: the unit's flag, label and pointer stand over the city's name from the same point on the land, so the two
//  never cross, whichever way the camera's turned.
const garrisoned = drawMarker(kit, {
    city: {
      name: 'Roma',
      size: 3,
      colours,
      walled: false,
      disorder: false,
    },
    unit: unit('Spearman', { count: 2, active: true, health: 0.5 }),
  }),
  inCity: Object3D[] = [];

// Its unit's part, which slides as the unit steps onto the square, the city staying put: named, in front of the city.
expect(
  'in a city, the unit is a part of its own, in front of the buildings, which slides alone',
  [
    garrisoned.getObjectByName(UNIT_PART)?.position.z,
    garrisoned.children.filter((child) => child.name === UNIT_PART).length,
    drawMarker(kit, { city: null, unit: unit('Spearman') }).getObjectByName(
      UNIT_PART
    )?.position.z,
  ],
  [0.26, 1, 0]
);

// The stage's slides, on markers as they're drawn: only the unit's part moves, in every copy, eased, and it's put in its
//  place once there. A marker made again mid-slide with the same unit on top goes on from where it's drawn; one with
//  another unit, or once the slide's over, doesn't.
{
  const placedAt = (
      at: [number, number, number],
      group: Group,
      id: string | null
    ): Placed => ({
      at,
      make: () => group.clone(),
      drawn: [group.clone(), group.clone()],
      ...(id === null
        ? {}
        : {
            unit: {
              id,
              at: group.getObjectByName(UNIT_PART)!.position.toArray() as [
                number,
                number,
                number
              ],
            },
          }),
    }),
    partsAt = (placed: Placed, name: string): number[][] =>
      placed.drawn.map((copy) =>
        (copy.getObjectByName(name) ?? copy).position
          .toArray()
          .map((n) => Math.round(n * 1000) / 1000)
      ),
    cityOf = (group: Group): Object3D =>
      group.children.find((child) => child.name !== UNIT_PART)!,
    walled = drawMarker(kit, {
      city: { name: 'Roma', size: 3, colours, walled: false, disorder: false },
      unit: unit('Spearman'),
    }),
    sliding = placedAt([5, 0, 5], walled, 'Unit-1'),
    cityAt = cityOf(sliding.drawn[0] as Group).position.toArray();

  sliding.slide = { from: [-1, 0, 0], started: 1000 };

  const atStart = (slideAlong(sliding, 1000), partsAt(sliding, UNIT_PART)),
    quarter =
      (slideAlong(sliding, 1000 + SLIDE / 4), partsAt(sliding, UNIT_PART)),
    cityStill = cityOf(sliding.drawn[1] as Group).position.toArray(),
    drawnMidway = unitDrawnAt(sliding, 1000 + SLIDE / 2),
    // Made again mid-slide, the same unit on top; then another unit; then once the slide's over.
    again = placedAt(
      [5, 0, 5],
      drawMarker(kit, { city: null, unit: unit('Spearman') }),
      'Unit-1'
    ),
    carried = carriedSlide(sliding, again, 1000 + SLIDE / 2),
    other = carriedSlide(
      sliding,
      placedAt([5, 0, 5], walled, 'Unit-2'),
      1000 + SLIDE / 2
    ),
    over = carriedSlide(sliding, again, 1000 + SLIDE),
    stillGoing = slideAlong(sliding, 1000 + SLIDE / 2),
    ended = slideAlong(sliding, 1000 + SLIDE),
    atEnd = partsAt(sliding, UNIT_PART);

  again.slide = carried;

  expect(
    'a slide moves only the unit’s part, in every copy, eased in and out, and puts it in its place at the end; made again mid-slide with the same unit, it goes on from where it’s drawn, but not for another unit, or once it’s over',
    [
      atStart,
      // Smoothstep at a quarter: 0.15625 of the way.
      quarter,
      cityStill.join() === cityAt.join(),
      [stillGoing, ended, sliding.slide === undefined],
      atEnd,
      carried !== undefined &&
        unitDrawnAt(again, 1000 + SLIDE / 2)
          .map((n) => Math.round(n * 1000))
          .join() === drawnMidway.map((n) => Math.round(n * 1000)).join(),
      carried?.started,
      [other, over],
      unitDrawnAt(placedAt([2, 0, 3], walled, null), 0),
    ],
    [
      [
        [-1, 0, 0.26],
        [-1, 0, 0.26],
      ],
      [
        [-0.844, 0, 0.26],
        [-0.844, 0, 0.26],
      ],
      true,
      [true, false, true],
      [
        [0, 0, 0.26],
        [0, 0, 0.26],
      ],
      true,
      1000 + SLIDE / 2,
      [undefined, undefined],
      [2, 0, 3],
    ]
  );
}

garrisoned.updateMatrixWorld(true);
garrisoned.traverse((object) => void inCity.push(object));

const cityName = spriteOf(inCity, kit.label('Roma  3', colours[0], '#ffffff')),
  over = [
    spriteOf(inCity, kit.plain('#202020')),
    spriteOf(inCity, kit.plain(colours[0])),
    spriteOf(inCity, kit.label('2', colours[0], '#ffffff')),
    spriteOf(inCity, kit.pointer()),
  ],
  where = (sprite: Sprite | undefined): string =>
    sprite === undefined
      ? 'none'
      : sprite
          .getWorldPosition(new Vector3())
          .toArray()
          .map((n) => n.toFixed(6))
          .join();

expect(
  'in a city, the unit’s bar, flag, label and pointer stand over the city’s name, from the same point on the land, in that order up the screen',
  [
    cityName !== undefined && over.every((sprite) => sprite !== undefined),
    over.every((sprite) => where(sprite) === where(cityName)),
    span(over[0])[0] >= span(cityName)[1],
    over.every(
      (sprite, index) =>
        index === 0 || span(sprite)[0] >= span(over[index - 1])[1]
    ),
  ],
  [true, true, true, true]
);

// What stands over units and cities is drawn after the cloud, which it would otherwise be under at the edge of what's
//  been seen, and over the land, as tests of depth would cut it off behind a hill.
const sea = new Water(ground, new Color('#9fb3c4')),
  cloud = new Clouds(sea.texture(), ground),
  badges = inCity.filter(
    (object): object is Sprite => object instanceof Sprite
  );

expect(
  'what stands over units and cities is drawn after the cloud, and over the land',
  [
    badges.length,
    badges.every((sprite) => sprite.renderOrder > cloud.mesh.renderOrder),
    badges.every((sprite) => sprite.material.depthTest === false),
  ],
  // The city's name, and the unit's bar (back and front), flag, label and pointer.
  [6, true, true]
);
cloud.dispose();
sea.dispose();

kit.dispose();

expect(
  'taken down, the kit lets every figure it made go, and its flags’ materials, and the pointer’s and its picture',
  disposed.length,
  5
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL figures: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS figures (${checks} checks)\n`);
