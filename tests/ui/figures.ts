// The built-in set's units on the 3D map (docs/3d-renderer-plan.md 2.1), without a GPU:
//  - every unit type Civ1 and Civ2 name has an entry, as do the debug page's, and a type the table doesn't know is
//    drawn by its kind;
//  - each look's figures are one geometry, with a colour for every point, standing on its square and within it, in
//    its owner's colours; a squad is as many figures as it says (D6);
//  - the marker kit makes each look in each pair of colours once, and lets them all go when taken down;
//  - a unit's marker: its figures on a stand (a ship without one), behind a low wall when fortified, under its flag
//    with the stack's size, its letter and a veteran's star, a bar for its hit points when hurt, and a ring and a
//    pointer when it awaits orders;
//  - an aircraft drawn to fly, as a walker is: its figures and all over them a part of their own, off its stand and
//    ring;
//  - fading, its figures, stand and ring dithered, and its flag and labels see-through;
//  - a puff of smoke where a unit falls: grey blobs bursting out, rising and spreading, swelling and shrinking away;
//  - a ship out at sea in rings of ripples, and not in front of a city's buildings;
//  - picked by what's drawn of it: a unit's figures standing over the ground of the square behind are its square's.

import * as Civ1Units from '@civ-clone/civ1-unit/Units';
import * as Civ2Units from '@civ-clone/civ2-unit/Units';
import {
  Box3,
  BufferGeometry,
  Color,
  Group,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import unitUnder from '@civ-clone/ui-map-3d/markers/pickUnit';
import { UNIT_SCALE } from '@civ-clone/ui-map-3d/markers/drawMarker';
import {
  UnitLook,
  unitLook,
  unitTable,
} from '@civ-clone/ui-models-builtin/units';
import {
  ALOFT_PART,
  FIGURES_PART,
  Faded,
  IN_FRONT_OF_CITY,
  MarkerKit,
  SHADOW_GONE,
  UNIT_PART,
  drawMarker,
  fade,
  unfade,
  unfaded,
} from '@civ-clone/ui-map-3d/markers/drawMarker';
import { PUFF_BLOBS, puffAt } from '@civ-clone/ui-map-3d/markers/puff';
import Water, { Clouds } from '@civ-clone/ui-map-3d/water';
import {
  Part,
  figureGeometry,
  figureParts,
  partMatrix,
} from '@civ-clone/ui-map-3d/markers/figures';
import { UnitMarker } from '@civ-clone/ui-map-3d/markers/markerFor';
import { UNIT_SIZES } from '@civ-clone/ui-client/lib/map3dOptions';
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

// The biggest the map draws units, as a player can choose: still within their squares.
const DRAWN = UNIT_SIZES.max;

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

  // Drawn as big as a player can choose: standing on its square (a submarine a little under the water), no taller than
  //  0.6 of a square, and no more than 0.36 of one from its middle. In front of a city it stands 0.26 south of the
  //  middle, so there the biggest reach a little past the square's edge.
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
  'a squad is as many figures as it says: three soldiers, two riders, one ship, and one parachutist, whose canopy three would cut through',
  [
    one({ ...unitTable['Spearman']!, squad: 3 }) /
      one({ ...unitTable['Spearman']!, squad: 1 }),
    one({ ...unitTable['Knight']!, squad: 2 }) /
      one({ ...unitTable['Knight']!, squad: 1 }),
    unitTable['Spearman']!.squad,
    unitTable['Knight']!.squad,
    unitTable['Battleship']!.squad,
    unitTable['Paratrooper']!.squad,
  ],
  [3, 2, 3, 2, 1, 1]
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

[
  spearmen,
  kit.figure(unitTable['Spearman']!, others),
  kit.body(unitTable['Spearman']!, colours, false),
].forEach((geometry) =>
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
    kit.body(unitTable['Spearman']!, colours, false) ===
      kit.body(unitTable['Spearman']!, colours, false),
  ],
  [true, false, true]
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
    size: 1,
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
  { ring } = kit.geometries,
  // How many points a geometry has.
  pointsIn = (geometry: BufferGeometry | undefined): number =>
    geometry?.getAttribute('position').count ?? 0,
  look = (type: string) => unitTable[type]!;

const soldiers = drawn(unit('Spearman')),
  soldiersFigure = figureOf(soldiers),
  soldiersFlag = spriteOf(soldiers, kit.plain(colours[0])),
  soldiersTop = soldiersFigure?.geometry.boundingBox?.max.y ?? 0,
  soldiersBox = soldiersFigure?.geometry.boundingBox;

expect(
  'a unit is one mesh, its figures life size on a stand on the ground, its owner’s flag over them, the same size on the screen however far away and never culled, and nothing else',
  [
    soldiersFigure?.geometry === kit.body(look('Spearman'), colours, false),
    pointsIn(soldiersFigure?.geometry) > pointsIn(spearmen),
    Math.round((soldiersBox?.min.y ?? 1) * 1000),
    Math.round(
      ((soldiersBox?.max.y ?? 0) - 0.03 - (spearmen.boundingBox?.max.y ?? 0)) *
        1000
    ),
    soldiersFlag?.material.sizeAttenuation === false &&
      soldiersFlag?.frustumCulled === false,
    (soldiersFlag?.position.y ?? 0) > soldiersTop,
    soldiers.length,
  ],
  [true, true, 0, 0, true, true, 2]
);

expect(
  'its figures face the way it last went',
  figureOf(drawn(unit('Spearman', { facing: 1.25 })))?.rotation.y,
  1.25
);

const trireme = drawn(unit('Trireme'));

const tFigure = kit.figure(look('Trireme'), colours),
  tBody = figureOf(trireme)?.geometry,
  // Its body but for the rings of ripples round it, out at sea.
  tHull = kit.body(look('Trireme'), colours, false);

expect(
  'a ship rides the water without a stand: only its figure, life size, on the water, in its ripples',
  [
    tBody === kit.body(look('Trireme'), colours, false, 1, 'whole', true),
    pointsIn(tHull) === pointsIn(tFigure),
    Math.round((tHull.boundingBox?.min.y ?? 1) * 1000) ===
      Math.round((tFigure.boundingBox?.min.y ?? 0) * 1000),
  ],
  [true, true, true]
);

// As big as the player chooses: the figures that many times life size, on the same stand, its flag over them, and a
//  body made for each size.
{
  const big = drawn(unit('Spearman', { size: 1.5 })),
    bigFigure = figureOf(big),
    bigBox = bigFigure?.geometry.boundingBox,
    bigShip = figureOf(drawn(unit('Trireme', { size: 0.5 })))?.geometry,
    // Its body but for its ripples.
    bigHull = kit.body(look('Trireme'), colours, false, 0.5),
    flagOf = (found: Object3D[]) =>
      spriteOf(found, kit.plain(colours[0]))?.position.y ?? 0;

  expect(
    'a unit chosen bigger or smaller is drawn that many times life size on the same stand, its flag over it, a body for each size',
    [
      bigFigure?.geometry === kit.body(look('Spearman'), colours, false, 1.5),
      bigFigure?.geometry !== soldiersFigure?.geometry,
      Math.round((bigBox?.min.y ?? 1) * 1000),
      Math.round(
        ((bigBox?.max.y ?? 0) -
          0.03 -
          (spearmen.boundingBox?.max.y ?? 0) * 1.5) *
          1000
      ),
      flagOf(big) > (bigBox?.max.y ?? Infinity),
      flagOf(big) > flagOf(soldiers),
      bigShip ===
        kit.body(look('Trireme'), colours, false, 0.5, 'whole', true) &&
        Math.round((bigHull.boundingBox?.min.y ?? 1) * 1000) ===
          Math.round((tFigure.boundingBox?.min.y ?? 0) * 0.5 * 1000),
    ],
    [true, true, 0, 0, true, true, true]
  );
}

// A unit's body is made for each pair of colours, its stand in the second. A city's walls are one, for every city: its
//  buildings are laid with the land, roofed in no owner's colours (`overlay/sprawl.ts`).
const pointsColoured = (geometry: BufferGeometry, css: string): number => {
    const attribute = geometry.getAttribute('color'),
      colour = new Color();
    let count = 0;

    for (let point = 0; point < attribute.count; point++) {
      colour.setRGB(
        attribute.getX(point),
        attribute.getY(point),
        attribute.getZ(point)
      );
      count += `#${colour.getHexString()}` === css ? 1 : 0;
    }

    return count;
  },
  spearLook = look('Spearman'),
  ourBody = kit.body(spearLook, colours, false),
  theirBody = kit.body(spearLook, others, false);

expect(
  'a unit’s body is made for each pair of colours, its stand in the second; a city’s walls are one, for every city',
  [
    ourBody !== theirBody,
    pointsColoured(ourBody, colours[1]) >
      pointsColoured(kit.figure(spearLook, colours), colours[1]),
    pointsColoured(theirBody, others[1]) >
      pointsColoured(kit.figure(spearLook, others), others[1]),
    kit.walls() === kit.walls(),
  ],
  [true, true, true, true]
);

const fighter = drawn(unit('Fighter')),
  fighterFigure = figureOf(fighter);

expect(
  'an aircraft’s flag flies over it, high as it is',
  (spriteOf(fighter, kit.plain(colours[0]))?.position.y ?? 0) >
    (fighterFigure?.geometry.boundingBox?.max.y ?? 1),
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
    pointsIn(figureOf(veterans)?.geometry) >
      pointsIn(kit.body(look('Musketman'), colours, false)),
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
    soldiersFigure?.geometry === kit.body(look('Spearman'), colours, false),
  ],
  // Its flag alone; and its body with no wall.
  [1, true]
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

// A city: its buildings and walls one mesh, its name a label, and walls more of the mesh.
const cityParts = (walled: boolean, unnamed?: true): Object3D[] => {
  const found: Object3D[] = [];

  drawMarker(kit, {
    city: { name: 'Roma', size: 7, colours, walled, disorder: false, unnamed },
    unit: null,
  }).traverse((object) => {
    if (!(object instanceof Group)) {
      found.push(object);
    }
  });

  return found;
};

expect(
  'a city’s marker is its walls, if it has them, one mesh, and its name: its buildings are laid with the land',
  [
    cityParts(false).map((object) => object.type),
    cityParts(true).map((object) => object.type),
    (cityParts(true)[0] as Mesh).geometry === kit.walls(),
  ],
  [['Sprite'], ['Mesh', 'Sprite'], true]
);
expect(
  'with its banner hung below it instead (the 3D map’s, from the page), no name over it',
  [
    cityParts(false, true).map((object) => object.type),
    cityParts(true, true).map((object) => object.type),
  ],
  [[], ['Mesh']]
);

// A city's label is made for each size it reaches, so the kit lets go of those no marker uses, once it holds enough of
//  them.
const sweeping = new MarkerKit(),
  romeAt = (size: number): Group =>
    drawMarker(sweeping, {
      city: { name: 'Roma', size, colours, walled: false, disorder: false },
      unit: null,
    }),
  // A drawn city's buildings and its label's material and picture.
  madeFor = (city: Group): object[] => {
    const found: object[] = [];

    city.traverse((object) => {
      if (object instanceof Mesh) {
        found.push(object.geometry);
      }

      if (object instanceof Sprite) {
        found.push(
          object.material,
          ...(object.material.map === null ? [] : [object.material.map])
        );
      }
    });

    return found;
  },
  stillDrawn = romeAt(1),
  outgrown = romeAt(9),
  sweptAway: object[] = [];

[...madeFor(stillDrawn), ...madeFor(outgrown)].forEach((made) =>
  (made as BufferGeometry).addEventListener('dispose', () =>
    sweptAway.push(made)
  )
);

const dueEarly = sweeping.sweepDue;

for (let size = 10; size <= 300; size++) {
  romeAt(size);
}

const dueLater = sweeping.sweepDue;

sweeping.sweep([stillDrawn]);

expect(
  'a city’s outgrown labels are let go once there are enough of them, not those still drawn, and made again if they’re wanted',
  [
    dueEarly,
    dueLater,
    madeFor(outgrown).every((made) => sweptAway.includes(made)),
    madeFor(stillDrawn).some((made) => sweptAway.includes(made)),
    sweeping.sweepDue,
    madeFor(romeAt(9))[0] === madeFor(outgrown)[0],
    madeFor(romeAt(1))[0] === madeFor(stillDrawn)[0],
  ],
  [false, true, true, false, false, false, true]
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

// Its unit's part: named, in front of the city, where a unit walking there arrives (`IN_FRONT_OF_CITY`), the city's
//  marker shown or hidden; and its figures, a part of their own, turned the way it faces, which a walker turns as it
//  goes.
const facingEast = drawMarker(kit, {
  city: null,
  unit: unit('Spearman', { facing: Math.PI / 2 }),
});

expect(
  'in a city, the unit is a part of its own, in front of the buildings, as far as a unit walking there arrives; its figures a part of their own, turned the way it faces, alone of all it has',
  [
    garrisoned.getObjectByName(UNIT_PART)?.position.z,
    IN_FRONT_OF_CITY,
    garrisoned.children.filter((child) => child.name === UNIT_PART).length,
    drawMarker(kit, { city: null, unit: unit('Spearman') }).getObjectByName(
      UNIT_PART
    )?.position.z,
    facingEast.getObjectByName(FIGURES_PART)?.rotation.y,
    (() => {
      const turned: string[] = [];

      facingEast.traverse((part) => {
        if (part.rotation.y !== 0) {
          turned.push(part.name);
        }
      });

      return turned;
    })(),
    // Its city hidden (`t`), still in front of where its buildings stand, with nothing of the city.
    (() => {
      const hidden = drawMarker(kit, {
        city: null,
        unit: unit('Spearman'),
        inCity: true,
      });

      return [
        hidden.getObjectByName(UNIT_PART)?.position.z,
        hidden.children.length,
      ];
    })(),
  ],
  [0.26, 0.26, 1, 0, Math.PI / 2, [FIGURES_PART], [0.26, 1]]
);

// Drawn to fly, as a walker is: an aircraft's figures, its hit points' bar, flag and label, and the pointer over it,
//  are a part of their own, to climb off its stand and the ring at its feet, which stay on the ground; its figures as
//  high on their own as on the stand, and the two together all of it. On its square, or a unit on foot drawn to fly,
//  one part as ever.
{
  const flier = unit('Fighter', {
      kinds: ['Air'],
      count: 2,
      active: true,
      health: 0.5,
    }),
    flying = drawMarker(kit, { city: null, unit: flier }, true),
    part = flying.getObjectByName(UNIT_PART)!,
    aloft = flying.getObjectByName(ALOFT_PART),
    kinds = (objects: readonly Object3D[]): string[] =>
      objects.map((object) =>
        object === aloft
          ? 'aloft'
          : object instanceof Sprite
          ? 'sprite'
          : object instanceof Mesh
          ? object.name === FIGURES_PART
            ? 'figures'
            : 'mesh'
          : 'other'
      ),
    look = unitLook('Fighter', ['Air']),
    whole = kit.body(look, colours, false, 1),
    figures = kit.body(look, colours, false, 1, 'figures'),
    base = kit.body(look, colours, false, 1, 'base'),
    count = (geometry: BufferGeometry): number =>
      geometry.getAttribute('position').count,
    rounded = (n: number | undefined): number =>
      Math.round((n ?? NaN) * 1000) / 1000;

  expect(
    'drawn to fly, an aircraft’s figures, flag, label and pointer climb as a part of their own, off its stand and ring; its figures as high as on the stand, and with it all of it; on its square, or on foot, one part; helicopters and missiles fly too, not ships',
    [
      kinds(part.children).sort(),
      aloft === undefined ? null : kinds(aloft.children).sort(),
      (aloft?.getObjectByName(FIGURES_PART) as Mesh | undefined)?.geometry ===
        figures,
      rounded(figures.boundingBox?.max.y) === rounded(whole.boundingBox?.max.y),
      rounded(figures.boundingBox?.min.y) > 0.02,
      rounded(base.boundingBox?.max.y) < 0.05,
      count(figures) + count(base) === count(whole),
      drawMarker(kit, { city: null, unit: flier }).getObjectByName(ALOFT_PART),
      drawMarker(
        kit,
        { city: null, unit: unit('Spearman') },
        true
      ).getObjectByName(ALOFT_PART),
      ['Helicopter', 'CruiseMissile', 'Nuclear', 'Bomber', 'Carrier'].map(
        (type) =>
          drawMarker(
            kit,
            { city: null, unit: unit(type) },
            true
          ).getObjectByName(ALOFT_PART) !== undefined
      ),
    ],
    [
      ['aloft', 'mesh', 'mesh'],
      // Its hit points' bar, back and front, its flag, label and pointer.
      ['figures', 'sprite', 'sprite', 'sprite', 'sprite', 'sprite'],
      true,
      true,
      true,
      true,
      true,
      undefined,
      undefined,
      [true, true, true, true, false],
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

// A unit fading away (`fade`), as one falling in battle does: drawn with materials of its own, made from the kit's, so
//  another unit in its colours, drawn with the kit's, stays solid; less than half solid, it casts no shadow. Copies made
//  afresh from its original, as when the world's copies in sight change, are faded with the same. Let go of, its own
//  are, and the kit's aren't.
{
  const falling = drawMarker(kit, {
      city: null,
      unit: unit('Spearman', { count: 2, active: true }),
    }),
    copies: Object3D[] = [],
    beside = drawMarker(kit, { city: null, unit: unit('Spearman') }),
    materialsOf = (object: Object3D) => {
      const found: Material[] = [];

      object.traverse((part) => {
        if (part instanceof Mesh || part instanceof Sprite) {
          found.push(part.material as Material);
        }
      });

      return found;
    },
    shadowsOf = (object: Object3D) => {
      const found: boolean[] = [];

      object.traverse((part) => {
        if (part instanceof Mesh) {
          found.push(part.castShadow);
        }
      });

      return found;
    },
    kits = new Set(materialsOf(falling)),
    faded: Faded = new Map();

  falling.traverse((part) => {
    part.castShadow = part instanceof Mesh;
  });
  copies.push(falling.clone(), falling.clone());
  fade(copies, 0.75, faded);

  const ownMaterials = materialsOf(copies[0]!),
    atThreeQuarters = [
      ownMaterials.every((material) => !kits.has(material)),
      ownMaterials.every((material) => material.opacity <= 0.75),
      // Its figures, stand and ring dithered, drawn with the land and units, so a ship's hull cuts no hole in the sea
      //  drawn after them; its flag and label see-through, drawn after the sea.
      (() => {
        const kinds: string[] = [];

        copies[0]!.traverse((part) => {
          if (part instanceof Mesh || part instanceof Sprite) {
            const { alphaHash, transparent } = part.material as Material;

            kinds.push(
              `${part instanceof Sprite ? 'sprite' : 'mesh'} ${
                alphaHash ? 'hashed' : transparent ? 'see-through' : 'solid'
              }`
            );
          }
        });

        return [...new Set(kinds)].sort();
      })(),
      materialsOf(beside).every((material) => material.opacity === 1),
      [...kits].every((material) => material.opacity === 1),
      shadowsOf(copies[0]!).every(Boolean),
      faded.size === kits.size,
    ];

  fade(copies, 0.25, faded);

  const afresh = falling.clone();

  fade([afresh], 0.25, faded);

  const atAQuarter = [
    materialsOf(copies[1]!).every((material) => material.opacity <= 0.25),
    shadowsOf(copies[1]!).some(Boolean),
    materialsOf(afresh).every((material) =>
      [...faded.values()].includes(material)
    ),
    faded.size === kits.size,
    0.25 < SHADOW_GONE,
  ];
  const own = [...faded.values()],
    disposedOwn: Material[] = [];

  own.forEach((material) =>
    material.addEventListener('dispose', () => void disposedOwn.push(material))
  );
  unfade(faded);

  expect(
    'a unit fading has materials of its own, the kit’s and another unit’s solid; its figures, stand and ring dithered, its flag and label see-through; under half solid, no shadow; copies made afresh fade with the same; let go of, its own go and the kit’s stay',
    [
      atThreeQuarters,
      atAQuarter,
      [disposedOwn.length === own.length, faded.size],
    ],
    [
      [
        true,
        true,
        ['mesh hashed', 'sprite see-through'],
        true,
        true,
        true,
        true,
      ],
      [true, false, true, true, true],
      [true, 0],
    ]
  );
}

// A unit arriving on a city's square fades in as the stage fades a marker: its unit's part alone, so the city stays
//  solid, with materials of its own.
{
  const square = drawMarker(kit, {
      city: {
        name: 'Roma',
        size: 3,
        colours,
        walled: false,
        disorder: false,
      },
      unit: unit('Spearman'),
    }),
    unitPart = square.getObjectByName(UNIT_PART)!,
    shadowsBefore: boolean[] = [],
    opacities = (object: Object3D) => {
      const found: number[] = [];

      object.traverse((part) => {
        if (part instanceof Mesh || part instanceof Sprite) {
          found.push((part.material as Material).opacity);
        }
      });

      return found;
    },
    faded: Faded = new Map();

  unitPart.traverse((part) => {
    if (part instanceof Mesh) {
      shadowsBefore.push(part.castShadow);
    }
  });
  const cityKits = square.children
    .filter((child) => child !== unitPart)
    .flatMap((child) => {
      const found: Material[] = [];

      child.traverse((part) => {
        if (part instanceof Mesh || part instanceof Sprite) {
          found.push(part.material as Material);
        }
      });

      return found;
    });

  fade([unitPart], 0.25, faded);

  const city = square.children.filter((child) => child !== unitPart);

  const kitsBefore = (() => {
    const found: Material[] = [];

    drawMarker(kit, { city: null, unit: unit('Spearman') }).traverse((part) => {
      if (part instanceof Mesh || part instanceof Sprite) {
        found.push(part.material as Material);
      }
    });

    return found;
  })();

  expect(
    'a square’s unit faded alone: its city stays solid, with the kit’s materials',
    [
      opacities(unitPart).every((opacity) => opacity <= 0.25),
      city.every((part) => opacities(part).every((opacity) => opacity === 1)),
      city.length > 0,
      (() => {
        const now: Material[] = [];

        city.forEach((child) =>
          child.traverse((part) => {
            if (part instanceof Mesh || part instanceof Sprite) {
              now.push(part.material as Material);
            }
          })
        );

        return (
          now.length === cityKits.length &&
          now.every((material, at) => material === cityKits[at])
        );
      })(),
    ],
    [true, true, true, true]
  );

  // Solid again: the kit's own materials back, its shadows as they were, and its own let go of.
  const own = [...faded.values()],
    disposedOwn: Material[] = [];

  own.forEach((material) =>
    material.addEventListener('dispose', () => void disposedOwn.push(material))
  );
  unitPart.traverse((part) => {
    if (part instanceof Mesh) {
      part.castShadow = false;
    }
  });
  unfaded([unitPart], faded);

  const restored: Material[] = [],
    shadows: boolean[] = [];

  unitPart.traverse((part) => {
    if (part instanceof Mesh || part instanceof Sprite) {
      restored.push(part.material as Material);
    }

    if (part instanceof Mesh) {
      shadows.push(part.castShadow);
    }
  });

  expect(
    'solid again, a faded unit has the kit’s materials back, its shadows as they were, and its own let go of',
    [
      restored.every((material) => kitsBefore.includes(material)),
      disposedOwn.length === own.length && own.length > 0,
      faded.size,
      shadows.every((shadow, at) => shadow === shadowsBefore[at]),
    ],
    [true, true, 0, true]
  );
}

kit.dispose();

expect(
  'taken down, the kit lets every figure and body it made go, and its flags’ materials, and the pointer’s and its picture',
  disposed.length,
  6
);

// A ship out at sea sits in rings of ripples (`RIPPLES`): ovals of foam round its hull, wider and longer than it, just
//  over the water, in its own mesh, turning with it. In front of a city's buildings, in port, none, its marker shown or
//  hidden; nor round a unit on land.
{
  const look = unitLook('Trireme'),
    plain = kit.body(look, colours, false, 1),
    rippled = kit.body(look, colours, false, 1, 'whole', true),
    points = (geometry: BufferGeometry) =>
      geometry.getAttribute('position').count,
    figuresOf = (object: Object3D) =>
      (object.getObjectByName(FIGURES_PART) as Mesh | undefined)?.geometry,
    atSea = drawMarker(kit, { city: null, unit: unit('Trireme') }),
    inPort = drawMarker(kit, {
      city: { name: 'Ostia', size: 2, colours, walled: false, disorder: false },
      unit: unit('Trireme'),
    }),
    // In port with cities hidden (`t`): still in front of where the buildings stand.
    inHiddenPort = drawMarker(kit, {
      city: null,
      unit: unit('Trireme'),
      inCity: true,
    }),
    spearman = unitLook('Spearman');

  expect(
    'a ship out at sea in rings of ripples, wider and longer than its hull, just over the water, turning with it; in port, none, its city shown or hidden; none round a unit on land',
    [
      points(rippled) > points(plain),
      rippled.boundingBox!.max.x > plain.boundingBox!.max.x,
      rippled.boundingBox!.max.z > plain.boundingBox!.max.z,
      rippled.boundingBox!.min.y >= 0 &&
        rippled.boundingBox!.min.y < plain.boundingBox!.min.y,
      figuresOf(atSea) === rippled,
      figuresOf(inPort) === plain,
      figuresOf(inHiddenPort) === plain,
      kit.body(spearman, colours, false, 1, 'whole', true) ===
        kit.body(spearman, colours, false, 1),
    ],
    [true, true, true, true, true, true, true, true]
  );
}

// A puff of smoke where a unit falls (`markers/puff.ts`): nothing at the blow and nothing at its end; between, every
//  blob over the ground, at their biggest a quarter of the way through; rising and spreading as it goes; turned round by
//  its seed, the same each time for the same seed.
{
  const sizes = (through: number) =>
      puffAt(through).reduce((sum, { size }) => sum + size, 0),
    mean = (through: number, of: (at: number[]) => number) =>
      puffAt(through).reduce((sum, { at }) => sum + of(at), 0) / PUFF_BLOBS,
    high = (at: number[]) => at[1]!,
    out = (at: number[]) => Math.hypot(at[0]!, at[2]!);

  expect(
    'a puff: nothing at the blow or its end; between, every blob over the ground, biggest a quarter through; rising and spreading; turned by its seed, the same each time',
    [
      puffAt(0).length,
      sizes(0),
      sizes(1),
      puffAt(0.25).every(({ size, at }) => size > 0 && at[1] > 0),
      sizes(0.25) > sizes(0.1) && sizes(0.25) > sizes(0.6),
      mean(0.75, high) > mean(0.25, high),
      puffAt(0.75).every(({ at }, index) => at[1] > puffAt(0.25)[index]!.at[1]),
      mean(0.75, out) > mean(0.25, out),
      new Set(puffAt(0.5).map(({ shade }) => shade)).size,
      JSON.stringify(puffAt(0.5, 3)) === JSON.stringify(puffAt(0.5, 3)),
      JSON.stringify(puffAt(0.5, 3)) === JSON.stringify(puffAt(0.5, 4)),
    ],
    [PUFF_BLOBS, 0, 0, true, true, true, true, true, 2, true, false]
  );
}

// Picked by what's drawn of it: a squad twice life size, seen from above at a slant, its figures over the ground of the
//  square behind it, where another squad stands. The point on the screen over its figures is its square, though the
//  ground there is the square behind's; the point over the other's figures is theirs; one over neither is nothing.
{
  const camera = new PerspectiveCamera(30, 16 / 9, 0.1, 50),
    squad = (z: number): Group => {
      const drawn = drawMarker(kit, {
        city: null,
        unit: unit('Musketman', { size: UNIT_SCALE }),
      });

      drawn.position.set(0, 0, z);
      drawn.updateMatrixWorld(true);

      return drawn;
    },
    front = squad(0),
    behind = squad(-1.2),
    marked = [
      ['3,4', [front]],
      ['3,3', [behind]],
    ] as const,
    on = (x: number, y: number, z: number): [number, number] => {
      const point = new Vector3(x, y, z).project(camera);

      return [point.x, point.y];
    },
    top = new Box3().setFromObject(front.getObjectByName(FIGURES_PART)!).max.y,
    // Two-thirds up the front squad's middle figure, and where the ray through it comes down to the ground: past the
    //  edge of its square, half a square in front of it.
    through = top * 0.66,
    ground = 2 - (2 + 0.04) / (1 - through);

  camera.position.set(0, 1, 2);
  camera.lookAt(0, 0, -0.5);
  camera.updateMatrixWorld();

  expect(
    'a unit’s figures standing over the ground of the square behind are its square’s; another’s figures there are theirs; nothing is nothing',
    [
      ground < -0.5,
      unitUnder(marked, camera, on(0, through, -0.04)),
      unitUnder(marked, camera, on(0, top * 0.8, -1.24)),
      unitUnder(marked, camera, on(2, 0, 0)),
      unitUnder([], camera, on(0, through, -0.04)),
    ],
    [true, '3,4', '3,3', null, null]
  );

  // A squad close behind, where the same ray meets its figures too: the nearer's square, whichever's listed first.
  const close = squad(-0.75),
    inLine = (first: 'front' | 'close') =>
      unitUnder(
        first === 'front'
          ? [
              ['3,4', [front]],
              ['9,9', [close]],
            ]
          : [
              ['9,9', [close]],
              ['3,4', [front]],
            ],
        camera,
        on(0, through, -0.04)
      );

  expect(
    'where a ray meets two units’ figures, the nearer’s square is picked',
    [
      unitUnder([['9,9', [close]]], camera, on(0, through, -0.04)),
      inLine('front'),
      inLine('close'),
    ],
    ['9,9', '3,4', '3,4']
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL figures: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS figures (${checks} checks)\n`);
