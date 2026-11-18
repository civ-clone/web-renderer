// The 3D map's plain markers (docs/3d-renderer-plan.md 1.3), in three.js: a city as a cluster of low buildings with its
//  owner's colour on their roofs, a wall round it if it's walled, and its name and size over it; a unit as a pawn in its
//  owner's colours, with a pennant giving the stack's size and a ring under the active one. The model sets replace
//  them (M2, M4).
//
// Every marker shares its geometries and its materials, one for each colour, so hundreds cost little but their draw
//  calls. Names are sprites drawn on a canvas, the same size on the screen however far away.

import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three';
import { CityMarker, TileMarker, UnitMarker } from './markerFor';

// The size of a square is about 1 (spec §3): a pawn stands a fifth of that, and a city fills half its square.
const PAWN_HEIGHT = 0.22,
  STONE = '#b5ab98',
  WALL = '#8d8577',
  ACTIVE = '#fff4b0';

/** What markers are drawn with, shared by all of them, and let go together. */
export class MarkerKit {
  #materials = new Map<string, MeshStandardMaterial>();
  #labels = new Map<string, SpriteMaterial>();
  readonly geometries = {
    base: new CylinderGeometry(0.1, 0.12, 0.035, 20),
    body: new ConeGeometry(0.07, PAWN_HEIGHT * 0.75, 16),
    head: new SphereGeometry(0.045, 16, 12),
    pole: new CylinderGeometry(0.006, 0.006, 0.2, 6),
    pennant: new BoxGeometry(0.11, 0.06, 0.006),
    ring: new TorusGeometry(0.16, 0.018, 8, 32),
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
    this.#materials.forEach((material) => material.dispose());
    this.#labels.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
    this.#materials.clear();
    this.#labels.clear();
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

  const label = new Sprite(
    kit.label(
      `${city.name}  ${city.size}${city.disorder ? ' !' : ''}`,
      city.colours[0],
      textOn(city.colours[0])
    )
  );
  const map = label.material.map,
    aspect =
      map && 'width' in (map.image as object)
        ? (map.image as { width: number; height: number }).width /
          (map.image as { width: number; height: number }).height
        : 4;

  // About as tall on the screen as the 2D map's city names, whatever the distance.
  label.scale.set(0.03 * aspect, 0.03, 1);
  label.center.set(0.5, 0);
  label.position.y = 0.36;
  label.renderOrder = 2;
  group.add(label);

  return group;
};

const drawUnit = (kit: MarkerKit, unit: UnitMarker): Group => {
  const group = new Group(),
    { base, body, head, pole, pennant, ring } = kit.geometries,
    first = kit.material(unit.colours[0]),
    second = kit.material(unit.colours[1]);

  group.add(place(new Mesh(base, second), 0, 0.0175, 0));
  group.add(
    place(new Mesh(body, first), 0, 0.035 + (PAWN_HEIGHT * 0.75) / 2, 0)
  );
  group.add(
    place(new Mesh(head, unit.busy ? second : first), 0, PAWN_HEIGHT, 0)
  );

  // A pennant for a stack, with its size.
  if (unit.count > 1) {
    group.add(place(new Mesh(pole, kit.material(WALL)), 0.1, 0.13, 0));
    group.add(place(new Mesh(pennant, first), 0.155, 0.2, 0));

    const count = new Sprite(
      kit.label(String(unit.count), unit.colours[0], textOn(unit.colours[0]))
    );

    count.scale.set(0.022, 0.022, 1);
    count.center.set(0.5, 0);
    count.position.set(0.155, 0.24, 0);
    count.renderOrder = 2;
    group.add(count);
  }

  if (unit.active) {
    const halo = new Mesh(ring, kit.material(ACTIVE, true));

    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.01;
    group.add(halo);
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
      pawn.position.z = 0.22;
    }

    group.add(pawn);
  }

  return group;
};

export default drawMarker;
