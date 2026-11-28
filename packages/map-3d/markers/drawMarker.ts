// The 3D map's markers (docs/3d-renderer-plan.md 1.3, 2.1), in three.js:
//  - a city as a wall round it if it's walled, and its name and size over it, unless the interface's banner hangs below
//    it instead (`banners.ts`): its buildings are laid with the land, as its sprawl (`overlay/sprawl.ts`, plan 4.1);
//  - a unit as its type looks in the built-in set (`figures.ts`, spec §6): soldiers in their era's kit, riders, ships,
//    aircraft, on a stand in its owner's second colour (ships ride the water without one), behind a low wall when
//    fortified, with its owner's flag over it (spec §6.3): the stack's size, the letter for what it's busy with, a
//    veteran's star, and its hit points when hurt; a ring under the active one and a pointer over it.
//
// Every marker shares its geometries and its materials. A unit's figures, stand and wall are one geometry for each look
//  in each pair of colours, and every city's walls one: a mesh each, so a draw call each at every copy of the world
//  near enough to show (#1204; M6 instances them). Names and flags' labels are sprites drawn on a canvas, the same size
//  on the screen however far away. Labels no marker shows any more are let go once enough have been made (`sweep`), as
//  cities grow and change hands.

import {
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Texture,
  TorusGeometry,
} from 'three';
import { CityMarker, TileMarker, UnitMarker } from './markerFor';
import {
  BodyPart,
  FigureColours,
  formation,
  wallsGeometry,
  figureGeometry,
  unitBodyGeometry,
} from './figures';
import { LoadedModel, LoadedRig, rigPart } from '../models/loadModels';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import TintedMaterial, { ownerTint } from './tinted';
import boundClips from './rigBounds';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  UnitFire,
  UnitLook,
  airborne,
  unitFire,
  unitLook,
} from '@civ-clone/ui-models-builtin/units';

/**
 * How many times life size units are drawn, before the size the player chooses: twice, as a tabletop game's figures
 *  are, so they read at a glance beside the cities and land, which are drawn life size. Their stands stay as they are.
 */
export const UNIT_SCALE = 2;

/**
 * How high over its stand an aircraft drawn with a model flies, times its size: as high as the built-in set's aircraft
 *  fly (`markers/figures.ts`), the model's underside where theirs is, their bodies' 0.3 less their half-thickness. So a
 *  model doesn't sit on its stand as a vehicle does, and a flight climbs from there, as theirs does.
 */
export const AIRBORNE_LIFT = 0.285;

// The size of a square is about 1 (spec §3): a city fills half its square, and a soldier stands a fifth of a square
//  life size, drawn `UNIT_SCALE` times that, times the size the player chooses (`UnitMarker.size` is both). A unit's
//  stand is thick enough to stand over everything laid on the land, roads and smears and all.
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
  // How many labels the kit holds before it first lets go of those no longer drawn.
  SWEEP_FROM = 256;

/**
 * How high over the ground under its stand the middle of an aircraft's body is drawn, `size` big: on its stand, as high
 *  as the built-in set's bodies fly (`markers/figures.ts`), 0.3, a model's underside half its thickness under that
 *  (`AIRBORNE_LIFT`). Where what's fired at one is aimed.
 */
export const airborneMiddle = (size: number): number =>
  STAND_HEIGHT + 0.3 * size;

/** A unit's figures drawn with a set's model: a mesh for each of its parts, and how high they reach. */
export type ModelFigures = {
  meshes: [BufferGeometry, Material][];
  top: number;
};

/** What markers are drawn with, shared by all of them, and let go together. */
export class MarkerKit {
  #materials = new Map<string, MeshStandardMaterial>();
  #labels = new Map<string, SpriteMaterial>();
  #figures = new Map<string, BufferGeometry>();
  #bodies = new Map<string, BufferGeometry>();
  // A set's models (`addModel`), by their ids; and what's drawn of each, as `modelFigures` makes it: its figures merged,
  //  the same in every owner's colours, and those with their materials in each.
  #models = new Map<string, LoadedModel>();
  #modelGeometries = new Map<
    string,
    { geometries: BufferGeometry[]; top: number }
  >();
  #modelFigures = new Map<string, ModelFigures>();
  #modelMaterials = new Map<string, Material>();
  // The models' rigged copies (`addRig`), by the models' ids, drawn in their place while a clip plays (`rigFigures`).
  #rigs = new Map<string, LoadedRig>();
  // Those bounded as far as their clips take them (`boundClips`): once each.
  #bounded = new WeakSet<LoadedRig>();
  #walls: BufferGeometry | null = null;
  #flats = new Map<string, SpriteMaterial>();
  // The pointer over the unit awaiting orders, in each colour it's drawn in.
  #pointers = new Map<string, SpriteMaterial>();
  // Labels are made for each name and size, so over a game they'd grow without end: how many were kept at the last
  //  sweep.
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
   * A set's model `id` (`loadModels.ts`), to draw the unit types it draws (`UnitMarker.model`). One added before under
   *  `id` is let go of, with all that was made from it.
   */
  addModel(id: string, model: LoadedModel): void {
    const before = this.#models.get(id);

    if (before !== undefined && before !== model) {
      this.#letGoOfModel(id, before);
    }

    this.#models.set(id, model);
  }

  /**
   * The model `id`'s rigged copy (plan 2.2), drawn in its place while a clip plays (`rigFigures`): added after the
   *  model, and let go of with it. Bounded as far as its clips take it (`boundClips`), so it's drawn only where it's
   *  seen.
   */
  addRig(id: string, rig: LoadedRig): void {
    if (!this.#models.has(id)) {
      return;
    }

    if (!this.#bounded.has(rig)) {
      boundClips(rig);
      this.#bounded.add(rig);
    }

    this.#rigs.set(id, rig);
  }

  /** The model `id`'s rigged copy, if it has one. */
  rigOf(id: string): LoadedRig | null {
    return this.#rigs.get(id) ?? null;
  }

  /**
   * A unit's figures drawn with the model `id`'s rigged copy, if it has one, to play its clips (plan 2.2): as many as
   *  `modelFigures` draws, where it draws them, as big and in `colours`, each a copy of the rig's scene with a skeleton
   *  of its own (`RIG_FIGURE`), with its bounds (`boundClips`).
   */
  rigFigures(
    id: string,
    look: UnitLook,
    colours: FigureColours,
    size: number = 1
  ): Object3D[] | null {
    const rig = this.#rigs.get(id);

    if (rig === undefined) {
      return null;
    }

    const afloat = look.shape === 'ship',
      flies = airborne(look),
      squad = figuresOf(look),
      scale = rig.scale * size,
      lift = afloat ? 0 : STAND_HEIGHT + (flies ? AIRBORNE_LIFT * size : 0);

    return formation(squad).map(([x, z]) => {
      const figure = cloneSkinned(rig.scene);
      let index = 0;

      figure.name = RIG_FIGURE;
      figure.position.set(x * size, lift, z * size);
      figure.scale.setScalar(scale);
      figure.traverse((object) => {
        const mesh = object as Mesh;

        if (!mesh.isMesh) {
          return;
        }

        mesh.material = this.#modelMaterial(
          id,
          index++,
          { ...rigPart(mesh), geometry: mesh.geometry },
          colours,
          true
        );
      });

      return figure;
    });
  }

  // Lets go of the model `id`, and of what was made from it, and of its rigged copy, with what it's made of.
  #letGoOfModel(id: string, model: LoadedModel): void {
    const ours = (key: string): boolean => JSON.parse(key)[0] === id;

    this.#rigs.get(id)?.scene.traverse((object) => {
      const mesh = object as Mesh;

      if (mesh.isMesh) {
        mesh.geometry.dispose();
        [mesh.material]
          .flat()
          .forEach((material: Material & { map?: Texture | null }) => {
            material.map?.dispose();
            material.dispose();
          });
      }
    });
    this.#rigs.delete(id);

    model.parts.forEach(({ geometry, map }) => {
      geometry.dispose();
      map?.dispose();
    });
    this.#models.delete(id);
    [...this.#modelGeometries].forEach(([key, { geometries }]) => {
      if (ours(key)) {
        geometries.forEach((geometry) => geometry.dispose());
        this.#modelGeometries.delete(key);
      }
    });
    [...this.#modelFigures.keys()]
      .filter(ours)
      .forEach((key) => this.#modelFigures.delete(key));
    [...this.#modelMaterials].forEach(([key, material]) => {
      if (ours(key)) {
        material.dispose();
        this.#modelMaterials.delete(key);
      }
    });
  }

  /**
   * A unit's figures drawn with the model `id`, if it's been added: as many as stand for one unit of its look (D6),
   *  `size` times as big as the set draws them, standing as high as on a stand (a ship on the water, an aircraft flying
   *  `AIRBORNE_LIFT` over it), in `colours`.
   *  One mesh for each of the model's parts, the figures merged in each, made once for each; and how high they reach.
   */
  modelFigures(
    id: string,
    look: UnitLook,
    colours: FigureColours,
    size: number = 1
  ): ModelFigures | null {
    const model = this.#models.get(id);

    if (model === undefined) {
      return null;
    }

    const afloat = look.shape === 'ship',
      flies = airborne(look),
      squad = figuresOf(look),
      shape = JSON.stringify([id, squad, size, afloat, flies]),
      key = JSON.stringify([id, squad, size, afloat, flies, colours[0]]);
    let merged = this.#modelGeometries.get(shape),
      figures = this.#modelFigures.get(key);

    if (merged === undefined) {
      const scale = model.scale * size,
        lift = afloat ? 0 : STAND_HEIGHT + (flies ? AIRBORNE_LIFT * size : 0),
        placed = formation(squad).map(([x, z]) =>
          new Matrix4()
            .makeTranslation(x * size, lift, z * size)
            .multiply(new Matrix4().makeScale(scale, scale, scale))
        );
      let top = lift;

      const geometries = model.parts.map((part): BufferGeometry => {
        const copies = placed.map((matrix) =>
            part.geometry.clone().applyMatrix4(matrix)
          ),
          geometry =
            (copies.length === 1
              ? copies[0]!.clone()
              : mergeGeometries(copies)) ?? new BufferGeometry();

        copies.forEach((copy) => copy.dispose());
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        top = Math.max(top, geometry.boundingBox?.max.y ?? lift);

        return geometry;
      });

      merged = { geometries, top };
      this.#modelGeometries.set(shape, merged);
    }

    if (figures === undefined) {
      figures = {
        meshes: merged.geometries.map((geometry, index) => [
          geometry,
          this.#modelMaterial(id, index, model.parts[index]!, colours),
        ]),
        top: merged.top,
      };
      this.#modelFigures.set(key, figures);
    }

    return figures;
  }

  // A model's part's material: in its owner's colour where its texture says (lightened if it's dark), or cut out
  //  by its alpha, made once for each; from both sides where its file says. A cut-out part isn't in its owner's colour,
  //  as its alpha's what's cut out, not a mask, and is always drawn from both sides.
  #modelMaterial(
    id: string,
    index: number,
    part: LoadedModel['parts'][number],
    colours: FigureColours,
    // For its rigged copy's part `index`, not its own.
    rigged = false
  ): Material {
    const key = JSON.stringify([
      id,
      index,
      part.tinted ? colours[0] : null,
      rigged,
    ]);
    let material = this.#modelMaterials.get(key);

    if (material === undefined) {
      const shared = { map: part.map, roughness: 0.85, metalness: 0 };

      material = part.cutout
        ? new MeshStandardMaterial({
            ...shared,
            alphaTest: 0.5,
            side: DoubleSide,
          })
        : new TintedMaterial({
            ...shared,
            tint: part.tinted ? ownerTint(colours[0]) : new Color(1, 1, 1),
            side: part.doubleSided ? DoubleSide : FrontSide,
          });
      this.#modelMaterials.set(key, material);
    }

    return material;
  }

  /**
   * All that's drawn of a unit on the land, as `look` says, in `colours`, fortified or not, its figures `size` times
   *  life size: its figures, stand and wall, one geometry, made once for each. Or, as `part` says, its figures alone
   *  or its stand and wall alone. A ship out at sea, with its ripples (`ripples`), round it or alone.
   */
  body(
    look: UnitLook,
    colours: FigureColours,
    fortified: boolean,
    size: number = 1,
    part: BodyPart = 'whole',
    ripples = false
  ): BufferGeometry {
    // Only a ship's whole body or base has ripples round it: any other's the same with or without.
    const rippled = ripples && look.shape === 'ship' && part !== 'figures',
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

  /**
   * A city's walls: one geometry for every walled city, made once. Its buildings are laid with the land
   *  (`overlay/sprawl.ts`).
   */
  walls(): BufferGeometry {
    this.#walls ??= wallsGeometry();

    return this.#walls;
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

  /**
   * The pointer over the unit awaiting orders: a chevron in `colour`, the same size on the screen however far away, over
   *  all. Made once for each colour.
   */
  pointer(colour: string = ACTIVE): SpriteMaterial {
    let material = this.#pointers.get(colour);

    if (material === undefined) {
      const canvas = document.createElement('canvas'),
        context = canvas.getContext('2d');

      canvas.width = 32;
      canvas.height = 32;

      if (context !== null) {
        context.fillStyle = colour;
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
      material = new SpriteMaterial({
        map: texture,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true,
      });
      this.#pointers.set(colour, material);
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

  /**
   * Whether enough labels have been made since the last sweep to let go of those no longer drawn: when
   *  there are twice as many as were kept, so a sweep's cost is spread over what's made between them.
   */
  get sweepDue(): boolean {
    return this.#labels.size > Math.max(SWEEP_FROM, this.#kept * 2);
  }

  /** Lets go of the labels that none of `markers` uses: the markers drawn, and to be drawn. */
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
    this.#kept = this.#labels.size;
  }

  dispose(): void {
    Object.values(this.geometries).forEach((geometry) => geometry.dispose());
    this.#figures.forEach((geometry) => geometry.dispose());
    this.#bodies.forEach((geometry) => geometry.dispose());
    this.#walls?.dispose();
    this.#walls = null;
    this.#bodies.clear();
    [...this.#models].forEach(([id, model]) => this.#letGoOfModel(id, model));
    this.figureMaterial.dispose();
    this.#flats.forEach((material) => material.dispose());
    this.#pointers.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
    this.#flats.clear();
    this.#pointers.clear();
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

// What a unit's flag says in words: the stack's size, what it's busy with, and a veteran's star.
const flagText = (unit: UnitMarker): string =>
  [
    unit.count > 1 ? String(unit.count) : '',
    unit.status ?? '',
    unit.veteran ? '\u2605' : '',
  ]
    .filter((part) => part !== '')
    .join(' ');

// The order what stands over units and cities is drawn in: after the sea, the smog, the cloud and the smoke
//  (`water.ts`), so none covers it; and among themselves the far before the near, but the pointer over all.
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
  const group = new Group();

  // Its walls, if it has them; its buildings are laid with the land, as its sprawl (`overlay/sprawl.ts`).
  if (city.walled) {
    group.add(new Mesh(kit.walls(), kit.figureMaterial));
  }

  // About as tall on the screen as the 2D map's city names, whatever the distance: unless its banner says it instead.
  if (city.unnamed !== true) {
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
  }

  return group;
};

/**
 * The unit on top of a stack, as the built-in set draws its type, standing on its square's middle. What stands over it
 *  (its bar, flag, label and pointer) stands over the point `badges.at` says, from `badges.over` up the screen: over
 *  the unit, or over a city's name. Drawn to fly (`flying`), an aircraft's figures and what stands over them are a
 *  part of their own (`ALOFT_PART`), to climb off its stand and ring, which stay on the ground. A ship `atSea`, not in
 *  front of a city's buildings, sits in rings of ripples.
 */
const drawUnit = (
  kit: MarkerKit,
  unit: UnitMarker,
  badges: { at: [number, number, number]; over: number } | null = null,
  flying = false,
  atSea = badges === null,
  rigged = false
): Group => {
  const group = new Group(),
    { ring } = kit.geometries,
    look = unitLook(unit.type, unit.kinds),
    apart = flying && airborne(look),
    // Drawn with a set's model, once it's been added, rather than the built-in set's figures.
    modelled =
      unit.model === undefined
        ? null
        : kit.modelFigures(unit.model, look, unit.colours, unit.size),
    body =
      modelled === null
        ? kit.body(
            look,
            unit.colours,
            unit.fortified,
            unit.size,
            apart ? 'figures' : 'whole',
            // Out at sea, not in front of a city's buildings: in rings of ripples.
            atSea
          )
        : null,
    aloft = apart ? new Group() : group,
    top = modelled?.top ?? body?.boundingBox?.max.y ?? 0.3,
    at = badges?.at ?? [0, top + FLAG_GAP, 0],
    // From the bottom up, on the screen.
    hurt = unit.health !== null,
    flagOver = (badges?.over ?? 0) + (hurt ? BAR_HEIGHT + SPACE : 0),
    labelOver = flagOver + FLAG_HEIGHT + SPACE,
    text = flagText(unit),
    pointerOver = labelOver + (text === '' ? 0 : UNIT_LABEL + SPACE);

  // Its figures on a stand in the owner's second colour, so whose it is shows from afar (a ship rides the water without
  //  one), behind a low wall when fortified: one mesh, facing the way it last went (its figures face south, unturned).
  //  A model's figures are a mesh for each of its parts, on the built-in set's stand.
  const figures =
    modelled === null ? new Mesh(body!, kit.figureMaterial) : new Group();

  // Drawn to play a clip (`rigged`), with its model's rigged copy, where it has one: as the model stands till a clip's
  //  played, its badges as high over it.
  const rig =
    rigged && modelled !== null && unit.model !== undefined
      ? kit.rigFigures(unit.model, look, unit.colours, unit.size)
      : null;

  if (rig !== null) {
    rig.forEach((figure) => figures.add(figure));
  } else {
    modelled?.meshes.forEach(([geometry, material]) =>
      figures.add(new Mesh(geometry, material))
    );
  }

  figures.name = FIGURES_PART;
  figures.rotation.y = unit.facing;

  // Firing as it's drawn, where each shot leaves (`firePoints`): from the box round its figures alone, where they're
  //  one geometry with their stand and ripples, the same fortified or not, as the bank isn't among them; or round a
  //  model's meshes.
  const fire = unitFire(look);

  if (fire !== null) {
    const box = new Box3();

    if (modelled === null) {
      const alone = kit.body(look, unit.colours, false, unit.size, 'figures');

      if (alone.boundingBox === null) {
        alone.computeBoundingBox();
      }

      box.copy(alone.boundingBox!);
    } else {
      modelled.meshes.forEach(([geometry]) => {
        if (geometry.boundingBox === null) {
          geometry.computeBoundingBox();
        }

        box.union(geometry.boundingBox!);
      });
    }

    if (!box.isEmpty()) {
      figures.userData[FIRES_FROM] = firePoints(fire, box, unit.size);
    }
  }

  aloft.add(figures);

  if (apart || modelled !== null) {
    const base = kit.body(
      look,
      unit.colours,
      unit.fortified,
      unit.size,
      'base',
      atSea
    );

    // A ship's has nothing to draw, at sea or not, but its ripples.
    if (base.getAttribute('position') !== undefined) {
      group.add(new Mesh(base, kit.figureMaterial));
    }
  }

  if (apart) {
    aloft.name = ALOFT_PART;
    group.add(aloft);
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

  // The unit awaiting orders: a ring at its feet, where the player marks it with one, and a pointer over all the rest,
  //  so it's found at any distance, however it's marked; both in the theme's colour for it, where it gives one.
  if (unit.active) {
    const colour = unit.ringColour ?? ACTIVE;

    if (unit.ring !== false) {
      const halo = new Mesh(ring, kit.material(colour, true));

      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.01;
      group.add(halo);
    }

    aloft.add(
      place(
        badge(kit.pointer(colour), POINTER, POINTER, pointerOver, POINTED),
        ...at
      )
    );
  }

  return group;
};

/** The name of a marker's unit's part: its figures, its flag over them, and its ring. */
export const UNIT_PART = 'unit';

/** The name of a unit's figures, on their stand: what turns as a unit walking turns. */
export const FIGURES_PART = 'figures';

/**
 * Where a unit's figures that fire as they're drawn (`unitFire`) keep where each shot leaves them, in their own frame
 *  (`userData`), as numbers, as three.js copies what's kept there as JSON (`firePoints`, `muzzleOf`).
 */
export const FIRES_FROM = 'firesFrom';

/**
 * How far up what's drawn a shot leaves it, from its foot to its top: a barrel or a warship's guns (`front`), a
 *  helicopter's nose (`nose`), a catapult's arm at the top of its swing (`top`), and a bow drawn at the shoulder
 *  (`figures`).
 */
export const FIRE_HEIGHTS: Readonly<Record<UnitFire['from'], number>> = {
  front: 0.4,
  nose: 0.4,
  top: 0.95,
  figures: 0.6,
};

/**
 * Where each of what a unit fires (`fire`) leaves figures that `box` is round, in their own frame, unturned, facing
 *  south (+`v`), drawn `size` big, as high up them as `FIRE_HEIGHTS` says:
 * - from the `front`, the middle of the box's front for one; for more, a warship's guns, along its middle from the bow
 *   back, as far apart as they're each the middle of a share of it;
 * - from the `nose`, halfway from the box's middle to its front, as a helicopter's rotor reaches well past its nose;
 * - from the `top`, the middle of its top;
 * - from its `figures`, each in front of its own figure where the squad stands (`formation`), as far in front of it as
 *   the box reaches in front of the one furthest forward.
 */
export const firePoints = (
  fire: UnitFire,
  box: Box3,
  size: number
): [number, number, number][] => {
  const up = (from: UnitFire['from']): number =>
      box.min.y + (box.max.y - box.min.y) * FIRE_HEIGHTS[from],
    across = (box.min.x + box.max.x) / 2;

  if (fire.from === 'top') {
    return [[across, up('top'), (box.min.z + box.max.z) / 2]];
  }

  if (fire.from === 'nose') {
    return [[across, up('nose'), (box.min.z + 3 * box.max.z) / 4]];
  }

  if (fire.from === 'figures') {
    const places = formation(fire.count).map(([x, z]): [number, number] => [
        x * size,
        z * size,
      ]),
      reach = box.max.z - Math.max(...places.map(([, z]) => z));

    return places.map(([x, z]) => [x, up('figures'), z + reach]);
  }

  return Array.from({ length: fire.count }, (_, gun) => [
    across,
    up('front'),
    fire.count <= 1
      ? box.max.z
      : box.max.z - ((box.max.z - box.min.z) * (gun + 0.5)) / fire.count,
  ]);
};

/** How many figures a unit that looks as `look` is drawn with: a squad on foot, or one. */
export const figuresOf = (look: UnitLook): number =>
  look.shape === 'foot' ? look.squad : 1;

/** How many figures a unit's drawn with, as `marker` has it (`figuresOf`). */
export const markerFigures = ({ type, kinds }: UnitMarker): number =>
  figuresOf(unitLook(type, kinds));

/** Each figure drawn with a model's rigged copy (`MarkerKit#rigFigures`), whose clip plays on it alone. */
export const RIG_FIGURE = 'rig figure';

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
  flying = false,
  rigged = false
): Group => {
  const group = new Group();

  if (marker.city !== null) {
    group.add(drawCity(kit, marker.city));
  }

  if (marker.unit !== null) {
    const inFront =
        marker.inCity ?? marker.city !== null ? IN_FRONT_OF_CITY : 0,
      pawn = drawUnit(
        kit,
        marker.unit,
        marker.city === null
          ? null
          : {
              at: [CITY_NAME_AT[0], CITY_NAME_AT[1], CITY_NAME_AT[2] - inFront],
              over: CITY_LABEL + SPACE,
            },
        flying,
        // In front of a city's buildings, or where they stand with the towns hidden: in port, not out at sea.
        inFront === 0,
        rigged
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
