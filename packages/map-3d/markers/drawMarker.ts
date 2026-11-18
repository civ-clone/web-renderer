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
  // A unit's flag: how far over the unit it flies, and how wide it is.
  FLAG_GAP = 0.07,
  FLAG_WIDTH = 0.11,
  // Hit points left: plenty, some, few.
  PLENTY = '#4caf50',
  SOME = '#e0b030',
  FEW = '#d04030';

/** What markers are drawn with, shared by all of them, and let go together. */
export class MarkerKit {
  #materials = new Map<string, MeshStandardMaterial>();
  #labels = new Map<string, SpriteMaterial>();
  #figures = new Map<string, BufferGeometry>();
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
    flag: new BoxGeometry(FLAG_WIDTH, 0.06, 0.006),
    // Made a unit wide, and cut to size: a hit-point bar.
    bar: new BoxGeometry(1, 1, 1),
    ring: new TorusGeometry(0.23, 0.018, 8, 36),
    // Points down at the unit awaiting orders, from over its head.
    pointer: new ConeGeometry(0.09, 0.18, 4),
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

// A label's sprite, as tall on the screen as `height`, its bottom middle at (`x`, `y`, `z`).
const labelSprite = (
  material: SpriteMaterial,
  height: number,
  x: number,
  y: number,
  z: number
): Sprite => {
  const sprite = new Sprite(material),
    image = material.map?.image as { width: number; height: number } | null,
    aspect =
      image && image.height > 0 && image.width > 0
        ? image.width / image.height
        : 1;

  sprite.scale.set(height * aspect, height, 1);
  sprite.center.set(0.5, 0);
  sprite.position.set(x, y, z);
  sprite.renderOrder = 2;

  return sprite;
};

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
    labelSprite(
      kit.label(
        `${city.name}  ${city.size}${city.disorder ? ' !' : ''}`,
        city.colours[0],
        textOn(city.colours[0])
      ),
      0.03,
      0,
      0.36,
      0
    )
  );

  return group;
};

/** The unit on top of a stack, as the built-in set draws its type, standing on its square's middle. */
const drawUnit = (kit: MarkerKit, unit: UnitMarker): Group => {
  const group = new Group(),
    { stand, bank, flag, bar, ring, pointer } = kit.geometries,
    look = unitLook(unit.type, unit.kinds),
    afloat = look.shape === 'ship',
    lift = afloat ? 0 : STAND_HEIGHT,
    figure = kit.figure(look, unit.colours),
    top = lift + (figure.boundingBox?.max.y ?? 0.2) * FIGURE_SCALE,
    flagY = top + FLAG_GAP;

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

  // The owner's flag, over the unit.
  group.add(place(new Mesh(flag, kit.material(unit.colours[0])), 0, flagY, 0));

  const text = flagText(unit);

  if (text !== '') {
    group.add(
      labelSprite(
        kit.label(text, unit.colours[0], textOn(unit.colours[0])),
        0.022,
        0,
        flagY + 0.035,
        0
      )
    );
  }

  // Its hit points, when it has lost some: a bar under the flag, shorter and redder as they go.
  if (unit.health !== null) {
    const left = Math.max(0, Math.min(1, unit.health)),
      back = new Mesh(bar, kit.material('#202020')),
      front = new Mesh(
        bar,
        kit.material(left > 0.5 ? PLENTY : left > 0.25 ? SOME : FEW)
      );

    back.scale.set(FLAG_WIDTH, 0.012, 0.008);
    back.position.set(0, flagY - 0.042, 0);
    front.scale.set(FLAG_WIDTH * left, 0.012, 0.01);
    front.position.set((FLAG_WIDTH * (left - 1)) / 2, flagY - 0.042, 0);
    group.add(back, front);
  }

  // The unit awaiting orders: a ring at its feet, and a pointer over its flag, so it's found at any distance.
  if (unit.active) {
    const halo = new Mesh(ring, kit.material(ACTIVE, true)),
      over = new Mesh(pointer, kit.material(ACTIVE, true));

    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.01;
    over.rotation.x = Math.PI;
    over.position.y = flagY + 0.16;
    group.add(halo, over);
  }

  return group;
};

/** A square's markers, standing on the ground at its middle: its city, and the unit on top of its stack in front. */
export const drawMarker = (kit: MarkerKit, marker: TileMarker): Group => {
  const group = new Group();

  if (marker.city !== null) {
    group.add(drawCity(kit, marker.city));
  }

  if (marker.unit !== null) {
    const pawn = drawUnit(kit, marker.unit);

    // In a city, in front of its buildings.
    if (marker.city !== null) {
      pawn.position.z = 0.26;
    }

    group.add(pawn);
  }

  return group;
};

export default drawMarker;
