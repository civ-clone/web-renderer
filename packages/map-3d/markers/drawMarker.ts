// The 3D map's markers (docs/3d-renderer-plan.md 1.3, 2.1), in three.js:
//  - a city as a cluster of low buildings with its owner's colour on their roofs, a wall round it if it's walled, and
//    its name and size over it, until the model sets draw cities (M4);
//  - a unit as its type looks in the built-in set (`figures.ts`, spec §6): soldiers in their era's kit, riders, ships,
//    aircraft, on a stand in its owner's second colour (ships ride the water without one), behind a low wall when
//    fortified, with its owner's flag over it (spec §6.3): the stack's size, the letter for what it's busy with, a
//    veteran's star, and its hit points when hurt; a ring under the active one and a pointer over it.
//
// Every marker shares its geometries and its materials, one for each colour, and each unit look in each pair of colours
//  is one geometry. But each part is a mesh of its own, so each is a draw call, at every copy of the world near enough
//  to show: hundreds of markers cost thousands of draw calls (#1204, for M6's instancing). Names and flags' labels are
//  sprites drawn on a canvas, the same size on the screen however far away; each drawn is kept until the map is taken
//  down.

import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three';
import { CityMarker, TileMarker, UnitMarker } from './markerFor';
import { FigureColours, figureGeometry } from './figures';
import { UnitLook, unitLook } from '@civ-clone/ui-models-builtin/units';

// The size of a square is about 1 (spec §3): a city fills half its square, and a soldier stands a fifth of a square,
//  drawn half as big again, as strategy maps make units, to be read at a distance.
const FIGURE_SCALE = 1.5,
  STAND_HEIGHT = 0.012,
  STONE = '#b5ab98',
  WALL = '#8d8577',
  ACTIVE = '#fff4b0',
  // How far over a unit its flag flies, on the land.
  FLAG_GAP = 0.04,
  // What stands over a unit, the same size on the screen however far away, from the bottom up: its hit-point bar, its
  //  flag, its label, and the pointer over the unit awaiting orders. A city's name is as tall as `CITY_LABEL`.
  BAR_HEIGHT = 0.004,
  FLAG_WIDTH = 0.018,
  FLAG_HEIGHT = 0.01,
  UNIT_LABEL = 0.022,
  POINTER = 0.03,
  CITY_LABEL = 0.03,
  // The space between them.
  SPACE = 0.002,
  // Hit points left: plenty, some, few.
  PLENTY = '#4caf50',
  SOME = '#e0b030',
  FEW = '#d04030';

/** What markers are drawn with, shared by all of them, and let go together. */
export class MarkerKit {
  #materials = new Map<string, MeshStandardMaterial>();
  #labels = new Map<string, SpriteMaterial>();
  #figures = new Map<string, BufferGeometry>();
  #flats = new Map<string, SpriteMaterial>();
  #pointer: SpriteMaterial | null = null;
  // Units' figures carry their colours in their vertices.
  readonly figureMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.05,
  });
  readonly geometries = {
    stand: new CylinderGeometry(0.19, 0.2, STAND_HEIGHT, 28),
    // A fortified unit's low wall, laid flat round it.
    bank: new TorusGeometry(0.22, 0.014, 4, 32),
    ring: new TorusGeometry(0.23, 0.018, 8, 36),
    building: new BoxGeometry(1, 1, 1),
    roof: new ConeGeometry(0.75, 0.5, 4),
    wall: new TorusGeometry(0.36, 0.025, 6, 24),
  };

  /** A matte material in `colour`, made once. */
  material(colour: string, glow = false): MeshStandardMaterial {
    const key = `${colour}${glow ? ' glow' : ''}`;
    let material = this.#materials.get(key);

    if (material === undefined) {
      material = new MeshStandardMaterial({
        color: new Color(colour),
        roughness: 0.75,
        metalness: 0.05,
        ...(glow
          ? { emissive: new Color(colour), emissiveIntensity: 0.6 }
          : {}),
      });
      this.#materials.set(key, material);
    }

    return material;
  }

  /** A unit's figures as `look` says, in `colours`, made once for each. */
  figure(look: UnitLook, colours: FigureColours): BufferGeometry {
    const key = JSON.stringify([look, colours]);
    let geometry = this.#figures.get(key);

    if (geometry === undefined) {
      geometry = figureGeometry(look, colours);
      this.#figures.set(key, geometry);
    }

    return geometry;
  }

  /** A plain sprite's material in `colour`, the same size on the screen however far away, over all: a flag, a bar. */
  plain(colour: string): SpriteMaterial {
    let material = this.#flats.get(colour);

    if (material === undefined) {
      material = new SpriteMaterial({
        color: new Color(colour),
        sizeAttenuation: false,
        depthTest: false,
      });
      this.#flats.set(colour, material);
    }

    return material;
  }

  /** The pointer over the unit awaiting orders: a chevron, the same size on the screen however far away, over all. */
  pointer(): SpriteMaterial {
    if (this.#pointer === null) {
      const canvas = document.createElement('canvas'),
        context = canvas.getContext('2d');

      canvas.width = 32;
      canvas.height = 32;

      if (context !== null) {
        context.fillStyle = ACTIVE;
        context.strokeStyle = '#3a3420';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(3, 5);
        context.lineTo(29, 5);
        context.lineTo(16, 28);
        context.closePath();
        context.fill();
        context.stroke();
      }

      const texture = new CanvasTexture(canvas);

      texture.colorSpace = SRGBColorSpace;
      this.#pointer = new SpriteMaterial({
        map: texture,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true,
      });
    }

    return this.#pointer;
  }

  /** A label's sprite material: `text` on a pill of `background`, made once for each. */
  label(text: string, background: string, foreground: string): SpriteMaterial {
    const key = `${text}\u0000${background}\u0000${foreground}`;
    let material = this.#labels.get(key);

    if (material === undefined) {
      const canvas = document.createElement('canvas'),
        context = canvas.getContext('2d'),
        font = '600 28px system-ui, sans-serif',
        height = 40;

      if (context !== null) {
        context.font = font;
        canvas.width = Math.ceil(context.measureText(text).width) + 24;
        canvas.height = height;
        // Sizing a canvas clears its context's settings.
        context.font = font;
        context.fillStyle = background;
        context.beginPath();
        context.roundRect?.(0, 0, canvas.width, height, 10);
        context.fill();
        context.fillStyle = foreground;
        context.textBaseline = 'middle';
        context.fillText(text, 12, height / 2 + 1);
      }

      const texture = new CanvasTexture(canvas);

      texture.colorSpace = SRGBColorSpace;
      material = new SpriteMaterial({
        map: texture,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true,
      });
      this.#labels.set(key, material);
    }

    return material;
  }

  dispose(): void {
    Object.values(this.geometries).forEach((geometry) => geometry.dispose());
    this.#figures.forEach((geometry) => geometry.dispose());
    this.figureMaterial.dispose();
    this.#flats.forEach((material) => material.dispose());
    this.#pointer?.map?.dispose();
    this.#pointer?.dispose();
    this.#flats.clear();
    this.#pointer = null;
    this.#materials.forEach((material) => material.dispose());
    this.#labels.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
    this.#materials.clear();
    this.#labels.clear();
    this.#figures.clear();
  }
}

// A colour light or dark enough to read on `background`.
const textOn = (background: string): string => {
  const { r, g, b } = new Color(background);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#111111' : '#ffffff';
};

const place = (object: Object3D, x: number, y: number, z: number): Object3D => {
  object.position.set(x, y, z);

  return object;
};

// A seeded fraction from a city's name, so its buildings lie the same way every time it's drawn.
const fractionOf = (text: string, salt: number): number => {
  let hash = salt * 2654435761;

  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 2246822519);
  }

  return ((hash >>> 0) % 10000) / 10000;
};

// What a unit's flag says in words: the stack's size, what it's busy with, and a veteran's star.
const flagText = (unit: UnitMarker): string =>
  [
    unit.count > 1 ? String(unit.count) : '',
    unit.status ?? '',
    unit.veteran ? '\u2605' : '',
  ]
    .filter((part) => part !== '')
    .join(' ');

// The order what stands over units and cities is drawn in: after the sea (1) and the cloud (2), so neither covers it;
//  and among themselves the far before the near, but the pointer over all.
const BADGES = 3,
  POINTED = 4;

// A sprite the same size on the screen however far away, as `width` and `height` say in the screen's units, standing
//  `over` above the point it's put at, drawn over the land in the order `order` says.
const badge = (
  material: SpriteMaterial,
  width: number,
  height: number,
  over: number,
  order = BADGES
): Sprite => {
  const sprite = new Sprite(material);

  sprite.scale.set(width, height, 1);
  sprite.center.set(0.5, -over / height);
  sprite.renderOrder = order;
  // Its bounds are the screen's, which three.js doesn't know: it would cull it by the world's, while still on screen.
  sprite.frustumCulled = false;

  return sprite;
};

// A label as tall on the screen as `height`, `over` above the point it's put at.
const label = (
  material: SpriteMaterial,
  height: number,
  over: number
): Sprite => {
  const image = material.map?.image as { width: number; height: number } | null,
    aspect =
      image && image.height > 0 && image.width > 0
        ? image.width / image.height
        : 1;

  return badge(material, height * aspect, height, over);
};

// Where a city's name stands, over its middle.
const CITY_NAME_AT: [number, number, number] = [0, 0.36, 0];

const drawCity = (kit: MarkerKit, city: CityMarker): Group => {
  const group = new Group(),
    { building, roof, wall } = kit.geometries,
    stone = kit.material(STONE),
    tiles = kit.material(city.colours[0]),
    // More buildings as the city grows, up to a dozen.
    count = Math.min(12, 2 + Math.ceil(city.size / 2));

  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2 + fractionOf(city.name, 1) * 6,
      reach = index === 0 ? 0 : 0.12 + fractionOf(city.name, index + 2) * 0.18,
      width = 0.07 + fractionOf(city.name, index + 20) * 0.05,
      height =
        (index === 0 ? 0.13 : 0.05) + fractionOf(city.name, index + 40) * 0.05,
      x = Math.cos(angle) * reach,
      z = Math.sin(angle) * reach,
      block = new Mesh(building, stone),
      top = new Mesh(roof, tiles);

    block.scale.set(width, height, width);
    block.position.set(x, height / 2, z);
    top.scale.set(width, width * 0.8, width);
    top.position.set(x, height + width * 0.2, z);
    top.rotation.y = Math.PI / 4;
    group.add(block, top);
  }

  if (city.walled) {
    const ring = new Mesh(wall, kit.material(WALL));

    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    ring.scale.set(1, 1, 2.5);
    group.add(ring);
  }

  // About as tall on the screen as the 2D map's city names, whatever the distance.
  group.add(
    place(
      label(
        kit.label(
          `${city.name}  ${city.size}${city.disorder ? ' !' : ''}`,
          city.colours[0],
          textOn(city.colours[0])
        ),
        CITY_LABEL,
        0
      ),
      ...CITY_NAME_AT
    )
  );

  return group;
};

/**
 * The unit on top of a stack, as the built-in set draws its type, standing on its square's middle. What stands over it
 *  (its bar, flag, label and pointer) stands over the point `badges.at` says, from `badges.over` up the screen: over
 *  the unit, or over a city's name.
 */
const drawUnit = (
  kit: MarkerKit,
  unit: UnitMarker,
  badges: { at: [number, number, number]; over: number } | null = null
): Group => {
  const group = new Group(),
    { stand, bank, ring } = kit.geometries,
    look = unitLook(unit.type, unit.kinds),
    afloat = look.shape === 'ship',
    lift = afloat ? 0 : STAND_HEIGHT,
    figure = kit.figure(look, unit.colours),
    top = lift + (figure.boundingBox?.max.y ?? 0.2) * FIGURE_SCALE,
    at = badges?.at ?? [0, top + FLAG_GAP, 0],
    // From the bottom up, on the screen.
    hurt = unit.health !== null,
    flagOver = (badges?.over ?? 0) + (hurt ? BAR_HEIGHT + SPACE : 0),
    labelOver = flagOver + FLAG_HEIGHT + SPACE,
    text = flagText(unit),
    pointerOver = labelOver + (text === '' ? 0 : UNIT_LABEL + SPACE);

  // On a stand in the owner's second colour, so whose it is shows from afar; a ship rides the water without one.
  if (!afloat) {
    group.add(
      place(new Mesh(stand, kit.material(unit.colours[1])), 0, lift / 2, 0)
    );
  }

  const figures = new Mesh(figure, kit.figureMaterial);

  figures.scale.setScalar(FIGURE_SCALE);
  group.add(place(figures, 0, lift, 0));

  // Fortified: behind a low wall.
  if (unit.fortified) {
    const wall = new Mesh(bank, kit.material(STONE));

    wall.rotation.x = Math.PI / 2;
    wall.scale.set(1, 1, 2.5);
    wall.position.y = lift + 0.015;
    group.add(wall);
  }

  // Its hit points, when it has lost some: a bar under its flag, shorter and redder as they go, from its left.
  if (unit.health !== null) {
    const left = Math.max(0, Math.min(1, unit.health));

    group.add(
      place(
        badge(kit.plain('#202020'), FLAG_WIDTH, BAR_HEIGHT, badges?.over ?? 0),
        ...at
      )
    );

    if (left > 0) {
      const front = badge(
        kit.plain(left > 0.5 ? PLENTY : left > 0.25 ? SOME : FEW),
        FLAG_WIDTH * left,
        BAR_HEIGHT * 0.6,
        (badges?.over ?? 0) + BAR_HEIGHT * 0.2
      );

      // Over the back, at the same depth: made after it, it's drawn after it. Its left edge on the back's: a sprite
      //  stands `center` of its width from its left edge.
      front.center.x = 1 / (2 * left);
      group.add(place(front, ...at));
    }
  }

  // The owner's flag, and its label: the stack's size, what it's busy with, and a veteran's star.
  group.add(
    place(
      badge(kit.plain(unit.colours[0]), FLAG_WIDTH, FLAG_HEIGHT, flagOver),
      ...at
    )
  );

  if (text !== '') {
    group.add(
      place(
        label(
          kit.label(text, unit.colours[0], textOn(unit.colours[0])),
          UNIT_LABEL,
          labelOver
        ),
        ...at
      )
    );
  }

  // The unit awaiting orders: a ring at its feet, and a pointer over all the rest, so it's found at any distance.
  if (unit.active) {
    const halo = new Mesh(ring, kit.material(ACTIVE, true));

    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.01;
    group.add(
      halo,
      place(badge(kit.pointer(), POINTER, POINTER, pointerOver, POINTED), ...at)
    );
  }

  return group;
};

/**
 * A square's markers, standing on the ground at its middle: its city, and the unit on top of its stack in front of its
 *  buildings, its flag over the city's name, from the same point, so the two never cross however the camera's turned.
 */
export const drawMarker = (kit: MarkerKit, marker: TileMarker): Group => {
  const group = new Group();

  if (marker.city !== null) {
    group.add(drawCity(kit, marker.city));
  }

  if (marker.unit !== null) {
    const inFront = marker.city === null ? 0 : 0.26,
      pawn = drawUnit(
        kit,
        marker.unit,
        marker.city === null
          ? null
          : {
              at: [CITY_NAME_AT[0], CITY_NAME_AT[1], CITY_NAME_AT[2] - inFront],
              over: CITY_LABEL + SPACE,
            }
      );

    pawn.position.z = inFront;
    group.add(pawn);
  }

  return group;
};

export default drawMarker;
