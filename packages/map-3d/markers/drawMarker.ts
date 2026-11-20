// The 3D map's markers (docs/3d-renderer-plan.md 1.3, 2.1), in three.js:
//  - a city as a cluster of low buildings with its owner's colour on their roofs, a wall round it if it's walled, and
//    its name and size over it, until the model sets draw cities (M4);
//  - a unit as its type looks in the built-in set (`figures.ts`, spec §6): soldiers in their era's kit, riders, ships,
//    aircraft, on a stand in its owner's second colour (ships ride the water without one), behind a low wall when
//    fortified, with its owner's flag over it (spec §6.3): the stack's size, the letter for what it's busy with, a
//    veteran's star, and its hit points when hurt; a ring under the active one and a pointer over it.
//
// Every marker shares its geometries and its materials. A unit's figures, stand and wall are one geometry for each look
//  in each pair of colours, and a city's buildings and walls one for each name, number of buildings, owner and walls:
//  a mesh each, so a draw call each at every copy of the world near enough to show (#1204; M6 instances them). Names
//  and flags' labels are sprites drawn on a canvas, the same size on the screen however far away. Labels and cities no
//  marker shows any more are let go once enough have been made (`sweep`), as cities grow and change hands.

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three';
import { CityMarker, TileMarker, UnitMarker } from './markerFor';
import {
  BodyPart,
  Building,
  FigureColours,
  cityGeometry,
  figureGeometry,
  unitBodyGeometry,
} from './figures';
import {
  UnitLook,
  airborne,
  unitLook,
} from '@civ-clone/ui-models-builtin/units';

// The size of a square is about 1 (spec §3): a city fills half its square, and a soldier stands a fifth of a square,
//  drawn as big as the player chooses (`UnitMarker.size`), life size unless they choose otherwise. A unit's stand is
//  thick enough to stand over everything laid on the land, roads and smears and all.
const STAND_HEIGHT = 0.03,
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
  FEW = '#d04030',
  // How many labels and cities the kit holds before it first lets go of those no longer drawn.
  SWEEP_FROM = 256;

/** What markers are drawn with, shared by all of them, and let go together. */
export class MarkerKit {
  #materials = new Map<string, MeshStandardMaterial>();
  #labels = new Map<string, SpriteMaterial>();
  #figures = new Map<string, BufferGeometry>();
  #bodies = new Map<string, BufferGeometry>();
  #cities = new Map<string, BufferGeometry>();
  #flats = new Map<string, SpriteMaterial>();
  #pointer: SpriteMaterial | null = null;
  // Labels and cities are made for each name and size, so over a game they'd grow without end: how many were kept at
  //  the last sweep.
  #kept = 0;
  // Units' figures carry their colours in their vertices.
  readonly figureMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.05,
  });
  readonly geometries = {
    // The ring at the feet of the unit awaiting orders.
    ring: new TorusGeometry(0.23, 0.018, 8, 36),
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

  /**
   * All that's drawn of a unit on the land, as `look` says, in `colours`, fortified or not, its figures `size` times
   *  life size: its figures, stand and wall, one geometry, made once for each. Or, as `part` says, its figures alone
   *  or its stand and wall alone. A ship out at sea, with its ripples (`ripples`).
   */
  body(
    look: UnitLook,
    colours: FigureColours,
    fortified: boolean,
    size: number = 1,
    part: BodyPart = 'whole',
    ripples = false
  ): BufferGeometry {
    // Only a ship's whole body has ripples round it: any other's the same with or without.
    const rippled = ripples && look.shape === 'ship' && part === 'whole',
      key = JSON.stringify([look, colours, fortified, size, part, rippled]);
    let geometry = this.#bodies.get(key);

    if (geometry === undefined) {
      geometry = unitBodyGeometry(look, colours, {
        fortified,
        scale: size,
        stand: STAND_HEIGHT,
        part,
        ripples: rippled,
      });
      this.#bodies.set(key, geometry);
    }

    return geometry;
  }

  /** A city's buildings and walls, one geometry, made once for each name, number of buildings, colour and walls. */
  city(city: CityMarker): BufferGeometry {
    const buildings = buildingsOf(city),
      key = JSON.stringify([
        city.name,
        buildings.length,
        city.colours[0],
        city.walled,
      ]);
    let geometry = this.#cities.get(key);

    if (geometry === undefined) {
      geometry = cityGeometry(buildings, city.colours[0], city.walled);
      this.#cities.set(key, geometry);
    }

    return geometry;
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

  /**
   * Whether enough labels and cities have been made since the last sweep to let go of those no longer drawn: when
   *  there are twice as many as were kept, so a sweep's cost is spread over what's made between them.
   */
  get sweepDue(): boolean {
    return (
      this.#labels.size + this.#cities.size >
      Math.max(SWEEP_FROM, this.#kept * 2)
    );
  }

  /** Lets go of the labels and cities that none of `markers` uses: the markers drawn, and to be drawn. */
  sweep(markers: Iterable<Object3D>): void {
    const used = new Set<object>();

    for (const marker of markers) {
      marker.traverse((object) => {
        if (object instanceof Mesh) {
          used.add(object.geometry);
        }

        if (object instanceof Sprite) {
          used.add(object.material);
        }
      });
    }

    this.#labels.forEach((material, key) => {
      if (!used.has(material)) {
        material.map?.dispose();
        material.dispose();
        this.#labels.delete(key);
      }
    });
    this.#cities.forEach((geometry, key) => {
      if (!used.has(geometry)) {
        geometry.dispose();
        this.#cities.delete(key);
      }
    });
    this.#kept = this.#labels.size + this.#cities.size;
  }

  dispose(): void {
    Object.values(this.geometries).forEach((geometry) => geometry.dispose());
    this.#figures.forEach((geometry) => geometry.dispose());
    this.#bodies.forEach((geometry) => geometry.dispose());
    this.#cities.forEach((geometry) => geometry.dispose());
    this.#bodies.clear();
    this.#cities.clear();
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
    this.#kept = 0;
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

/** A city's buildings: more as it grows, up to a dozen, laid the same way every time from its name. */
export const buildingsOf = (
  city: Pick<CityMarker, 'name' | 'size'>
): Building[] => {
  const count = Math.min(12, 2 + Math.ceil(city.size / 2));

  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + fractionOf(city.name, 1) * 6,
      reach = index === 0 ? 0 : 0.12 + fractionOf(city.name, index + 2) * 0.18;

    return {
      x: Math.cos(angle) * reach,
      z: Math.sin(angle) * reach,
      width: 0.07 + fractionOf(city.name, index + 20) * 0.05,
      height:
        (index === 0 ? 0.13 : 0.05) + fractionOf(city.name, index + 40) * 0.05,
    };
  });
};

const drawCity = (kit: MarkerKit, city: CityMarker): Group => {
  const group = new Group();

  // Its buildings and walls, one mesh.
  group.add(new Mesh(kit.city(city), kit.figureMaterial));

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
 *  the unit, or over a city's name. Drawn to fly (`flying`), an aircraft's figures and what stands over them are a
 *  part of their own (`ALOFT_PART`), to climb off its stand and ring, which stay on the ground.
 */
const drawUnit = (
  kit: MarkerKit,
  unit: UnitMarker,
  badges: { at: [number, number, number]; over: number } | null = null,
  flying = false
): Group => {
  const group = new Group(),
    { ring } = kit.geometries,
    look = unitLook(unit.type, unit.kinds),
    apart = flying && airborne(look),
    body = kit.body(
      look,
      unit.colours,
      unit.fortified,
      unit.size,
      apart ? 'figures' : 'whole',
      // Out at sea, not in front of a city's buildings: in rings of ripples.
      badges === null
    ),
    aloft = apart ? new Group() : group,
    top = body.boundingBox?.max.y ?? 0.3,
    at = badges?.at ?? [0, top + FLAG_GAP, 0],
    // From the bottom up, on the screen.
    hurt = unit.health !== null,
    flagOver = (badges?.over ?? 0) + (hurt ? BAR_HEIGHT + SPACE : 0),
    labelOver = flagOver + FLAG_HEIGHT + SPACE,
    text = flagText(unit),
    pointerOver = labelOver + (text === '' ? 0 : UNIT_LABEL + SPACE);

  // Its figures on a stand in the owner's second colour, so whose it is shows from afar (a ship rides the water without
  //  one), behind a low wall when fortified: one mesh, facing the way it last went (its figures face south, unturned).
  const figures = new Mesh(body, kit.figureMaterial);

  figures.name = FIGURES_PART;
  figures.rotation.y = unit.facing;
  aloft.add(figures);

  if (apart) {
    aloft.name = ALOFT_PART;
    group.add(
      new Mesh(
        kit.body(look, unit.colours, unit.fortified, unit.size, 'base'),
        kit.figureMaterial
      ),
      aloft
    );
  }

  // Its hit points, when it has lost some: a bar under its flag, shorter and redder as they go, from its left.
  if (unit.health !== null) {
    const left = Math.max(0, Math.min(1, unit.health));

    aloft.add(
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
      aloft.add(place(front, ...at));
    }
  }

  // The owner's flag, and its label: the stack's size, what it's busy with, and a veteran's star.
  aloft.add(
    place(
      badge(kit.plain(unit.colours[0]), FLAG_WIDTH, FLAG_HEIGHT, flagOver),
      ...at
    )
  );

  if (text !== '') {
    aloft.add(
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
    group.add(halo);
    aloft.add(
      place(badge(kit.pointer(), POINTER, POINTER, pointerOver, POINTED), ...at)
    );
  }

  return group;
};

/** The name of a marker's unit's part: its figures, its flag over them, and its ring. */
export const UNIT_PART = 'unit';

/** The name of a unit's figures, on their stand: what turns as a unit walking turns. */
export const FIGURES_PART = 'figures';

/**
 * The name of an aircraft's part that climbs as it flies, drawn to fly: its figures, and its flag and all over them;
 *  not its stand, nor the ring at its feet.
 */
export const ALOFT_PART = 'aloft';

/** How far in front of its city's buildings (`+v`) a unit in a city stands, from the square's middle. */
export const IN_FRONT_OF_CITY = 0.26;

/**
 * A square's markers, standing on the ground at its middle: its city, and the unit on top of its stack in front of its
 *  buildings, its flag over the city's name, from the same point, so the two never cross however the camera's turned.
 *  A walker's, `flying`, an aircraft can climb off its stand (`ALOFT_PART`).
 */
export const drawMarker = (
  kit: MarkerKit,
  marker: TileMarker,
  flying = false
): Group => {
  const group = new Group();

  if (marker.city !== null) {
    group.add(drawCity(kit, marker.city));
  }

  if (marker.unit !== null) {
    const inFront = marker.city === null ? 0 : IN_FRONT_OF_CITY,
      pawn = drawUnit(
        kit,
        marker.unit,
        marker.city === null
          ? null
          : {
              at: [CITY_NAME_AT[0], CITY_NAME_AT[1], CITY_NAME_AT[2] - inFront],
              over: CITY_LABEL + SPACE,
            },
        flying
      );

    pawn.name = UNIT_PART;
    pawn.position.z = inFront;
    group.add(pawn);
  }

  return group;
};

/**
 * A marker's own materials, made from the kit's as it's faded (`fade`), each kit's material to its own: the kit's are
 *  shared by every marker, so fading one of those would fade every unit in its colours.
 */
export type Faded = Map<Material, Material>;

// What each part faded was drawn with, the kit's, and whether it cast a shadow, by part: not in `userData`, which a
//  clone copies as JSON.
const kitMaterials = new WeakMap<Object3D, Material>(),
  castShadows = new WeakMap<Object3D, boolean>();

/** How solid a faded marker drawn less than half solid is for its shadow: it casts none. */
export const SHADOW_GONE = 0.5;

/**
 * Draws `drawn` (a marker's copies) `opacity` solid, from 1 down to 0, with materials of its own made from the kit's,
 *  kept in `faded` to be let go of with `unfade`: other markers drawn with the kit's stay as they are, and the kit's
 *  sweep still sees the marker's original use the kit's labels. Under half solid, it casts no shadow.
 *
 * Its figures, stand and ring fade by leaving out a share of their points (`alphaHash`), drawn with the land and units:
 *  see-through, they'd be drawn before the sea, which a ship's hull would then cut a dark hole in. Its flag and labels,
 *  drawn after the sea and cloud, fade as see-through.
 */
export const fade = (
  drawn: readonly Object3D[],
  opacity: number,
  faded: Faded
): void => {
  drawn.forEach((copy) =>
    copy.traverse((part) => {
      if (!(part instanceof Mesh || part instanceof Sprite)) {
        return;
      }

      const kits = kitMaterials.get(part) ?? (part.material as Material);
      let own = faded.get(kits);

      if (own === undefined) {
        own = kits.clone();

        if (part instanceof Sprite) {
          own.transparent = true;
        } else {
          own.alphaHash = true;
        }

        faded.set(kits, own);
      }

      if (!kitMaterials.has(part)) {
        kitMaterials.set(part, kits);
        castShadows.set(part, part.castShadow);
      }

      part.material = own;
      part.castShadow =
        (castShadows.get(part) ?? false) && opacity >= SHADOW_GONE;
    })
  );
  faded.forEach((own, kits) => {
    own.opacity = kits.opacity * opacity;
  });
};

/**
 * Draws `drawn`, faded before (`fade`), solid again with the kit's materials and its shadows as they were, and lets go
 *  of its own (`unfade`).
 */
export const unfaded = (drawn: readonly Object3D[], faded: Faded): void => {
  drawn.forEach((copy) =>
    copy.traverse((part) => {
      const kits = kitMaterials.get(part);

      if (
        kits === undefined ||
        !(part instanceof Mesh || part instanceof Sprite)
      ) {
        return;
      }

      part.material = kits;
      part.castShadow = castShadows.get(part) ?? part.castShadow;
      kitMaterials.delete(part);
      castShadows.delete(part);
    })
  );
  unfade(faded);
};

/** Lets go of a faded marker's own materials (`fade`): the kit's textures they share stay the kit's. */
export const unfade = (faded: Faded): void => {
  faded.forEach((own) => own.dispose());
  faded.clear();
};

export default drawMarker;
