// What three.js draws (docs/3d-renderer.md §9): the land under a sky, lit by the sun and the sky's light, with haze into
//  the distance. Kept apart from the view, which tests stand a stage of their own in for: a test has no GPU to draw
//  with.
//
// The land comes in chunks (`terrain/chunks.ts`), each drawn at every copy of the world the camera can see (§3.1), so
//  the land carries on past the world's seam whichever way it looks. The sea's surface lies over it (`water.ts`). The
//  camera is an orbit (`camera/orbit.ts`): the view says where it is, and the haze, how far it sees, and the sun's
//  shadows, fitted to what it sees, follow its distance.

import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  FrontSide,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  SRGBColorSpace,
  Scene,
  SkinnedMesh,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three';
import { ChunkMesh } from './terrain/chunks';
import { puffAt } from './markers/puff';
import landMaterial from './landMaterial';
import {
  ALOFT_PART,
  FIGURES_PART,
  Faded,
  MarkerKit,
  RIG_FIGURE,
  UNIT_PART,
  drawMarker,
  fade,
  markerFigures,
  unfade,
  unfaded,
} from './markers/drawMarker';
import { TileMarker } from './markers/markerFor';
import { idleChanges } from './idling';
import unitUnder from './markers/pickUnit';
import { OverlayMesh, PLANT_NUMBERS } from './overlay/overlayMesh';
import { plantMatrices, plantsKept } from './overlay/thinning';
import { FIELD_OF_VIEW, Orbit, eye, sightFor } from './camera/orbit';
import Water, { Clouds, Ground, SMOG_ORDER } from './water';
import YieldIcons from './yieldIcons';
import { YieldMesh } from './yields';
import {
  LoadedModel,
  LoadedRig,
  loadModels,
  modelKey,
} from './models/loadModels';
import { ClipRole, ShotKind } from './models/modelSet';
import {
  ClipBefore,
  Playing,
  RigFacts,
  idlePhase,
  poseFigures,
  rigFacts,
} from './markers/clips';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** What the stage has drawn, for the debug overlay. */
export type StageStats = {
  drawCalls: number;
  triangles: number;
  geometries: number;
};

/** Draws the scene on a canvas. */
export interface Stage {
  render(): void;
  /** The canvas's box in the page's px, and how many of the screen's pixels one is. */
  resize(width: number, height: number, pixelRatio: number): void;
  /** The land's chunk `i` across and `j` down, drawn at every copy of the world: one drawn before is replaced. */
  setChunk(i: number, j: number, mesh: ChunkMesh): void;
  /**
   * What's laid on the land of chunk `i` across and `j` down (roads, fields, specials, huts), drawn at every copy of
   *  the world as the land is: one laid before is replaced, and nothing takes it away.
   */
  setOverlay(i: number, j: number, mesh: OverlayMesh | null): void;
  /**
   * What's marked on the square `key` (`x,y`), standing at `at` (`u`, height, `v`), drawn at every copy of the world:
   *  one marked before is replaced, and nothing takes it away.
   */
  setMarker(
    key: string,
    at: readonly [number, number, number],
    marker: TileMarker | null
  ): void;
  /**
   * The square (`x,y`) whose unit's drawn under the point `ndc` on the screen (from -1 to 1 across, and up), as the
   *  camera last drew it, the nearest to it where several are; or nothing (`markers/pickUnit.ts`). A stage that can't
   *  say leaves the view to pick the ground.
   */
  unitAt?(ndc: readonly [number, number]): string | null;
  /**
   * A walk under way (`id`, `walks.ts`), drawn as `marker`, its units alone with no city: one drawn before for it is
   *  replaced, and `null` takes it away.
   */
  setWalker(id: string, marker: TileMarker | null): void;
  /**
   * Where the walker `id` is now (`u`, height, `v`, on the world's own copy) and the way its figures face, drawn there at
   *  every copy of the world in sight; and, for an aircraft, how high it's flown off its stand, which stays there.
   */
  placeWalker(
    id: string,
    at: readonly [number, number, number],
    facing: number,
    aloft?: number
  ): void;
  /**
   * How solid the walker `id` is drawn, from 1 down to gone at 0, as a unit falling in battle fades (`battles.ts`): with
   *  materials of its own, so no other marker fades with it. Drawn again for it (`setWalker`), it's solid.
   */
  fadeWalker(id: string, opacity: number): void;
  /**
   * The walker `id`'s figures, where its unit's drawn with a model that has a rigged copy, posed as `role`'s clip has
   *  them `seconds` in (plan 2.2, `clips.ts`), each playing `before` till its own time in it comes, where it's given:
   *  or, for none, standing as the model does.
   */
  poseWalker?(
    id: string,
    role: ClipRole | null,
    seconds: number,
    before?: ClipBefore
  ): void;
  /**
   * The units marked on the squares `keys` (`x,y`) idling (plan 2.2), drawn with their models' rigged copies, each posed
   *  as its idle clip has it `seconds` in, each stack its own way into it (`idlePhase`); every other marker drawn as it
   *  stands. One whose model has no idle clip, or fading, is left as it is, and only a few start idling at a time
   *  (`idleChanges`), the rest the next. Says whether any idles, or is still to start: if so, it's to be asked again on the next frame.
   */
  idle?(keys: ReadonlySet<string>, seconds: number): boolean;
  /**
   * What the unit `marker` marks plays where it's drawn with its model's rigged copy (`RigFacts`), as a battle's paced
   *  for it (`clipPace`): nothing where its model has none, or isn't loaded.
   */
  rigFacts?(marker: TileMarker): RigFacts | null;
  /**
   * Where the node `joint` of the walker `id`'s figure `figure` is, as it's posed now (`u`, height, `v`, on the world's
   *  own copy), as a shot leaves it (`shots.ts`): nothing where it isn't drawn with a rigged copy that has it.
   */
  jointAt?(
    id: string,
    figure: number,
    joint: string
  ): [number, number, number] | null;
  /**
   * A shot (`id`, `shots.ts`) in flight at `at` (`u`, height, `v`, on the world's own copy), `through` its flight from 0
   *  to 1, drawn at every copy of the world in sight as its `kind` is: a bottle alight, tumbling; an arrow, or a
   *  bullet's streak, pointing the way it's `heading` (one long); a shell, a ball. `null` takes it away.
   */
  shot?(
    id: string,
    at: readonly [number, number, number] | null,
    through?: number,
    kind?: ShotKind,
    heading?: readonly [number, number, number]
  ): void;
  /**
   * How solid the unit marked on the square `key` is drawn, from 0 to 1, as a unit arriving with no move fades in
   *  (`fades.ts`): its city stays solid, and no other marker fades with it. Marked again (`setMarker`), it's solid.
   */
  fadeMarker(key: string, opacity: number): void;
  /**
   * A puff of smoke (`id`, `markers/puff.ts`) where a unit fell in battle, or a shot left a muzzle or landed, bursting
   *  from `at` (`u`, height, `v`, on the world's own copy), `through` its time from 0 to 1, `size` times a fallen
   *  unit's, and with a flash at its start, a muzzle's or a shell's burst, its middle `flash` over where it bursts from
   *  (as big as the puff is: `FLASH_SIZE` sits it on the ground there), or none; drawn at every copy of the world in
   *  sight. `null` takes it away.
   */
  puff(
    id: string,
    at: readonly [number, number, number] | null,
    through?: number,
    size?: number,
    flash?: number | null
  ): void;
  /**
   * A ship's wake (`id`, `wakes.ts`): the foam `shape` says (`wakeShape`), from `at` (`u`, height, `v`, on the world's
   *  own copy), drawn at every copy of the world in sight; what was drawn before for it is replaced, and `null` takes it
   *  away.
   */
  wake(
    id: string,
    at: readonly [number, number, number] | null,
    shape?: readonly number[]
  ): void;
  /** What each square yields (`y`), drawn at every copy of the world in sight: what was drawn before is replaced. */
  setYields(mesh: YieldMesh | null): void;
  /**
   * The camera, round its focus raised to `height`, the land's there; and the world drawn as far round as `period`
   *  says, if the view's stopped at the poles, rather than as the world wraps.
   */
  view(
    orbit: Orbit,
    height: number,
    period?: { u: number; v: number | null }
  ): void;
  stats(): StageStats;
  /**
   * Loads the set of models whose manifest is at `url` (`models/loadModels.ts`), to draw units with: `loaded` is told
   *  of each model as it's ready, by an id of its own among every set's (`modelKey`), with the unit types it draws, and
   *  again once its rigged copy is, where it has one. Each that draws plants (trees) is drawn wherever an overlay's
   *  plants name it, and `grown` is told of it as it's ready, with the plants it draws.
   *  Resolves once all have been tried, or rejects saying why there's none. A stage that draws no models has none.
   */
  loadModels?(
    url: string,
    loaded: (id: string, types: readonly string[]) => void,
    grown?: (id: string, plants: readonly string[], reach: number) => void
  ): Promise<void>;
  dispose(): void;
}

// A model a set draws plants with, as the stage draws it: each of its parts, with its material; and
//  how tall it stands over its origin, where it meets the ground (its roots may reach below), in its own units.
type PlantModel = {
  parts: { geometry: BufferGeometry; material: MeshStandardMaterial }[];
  height: number;
  // How far it reaches round its origin, across the ground, for each of its height: the room it takes.
  reach: number;
};

export type StageOptions = {
  // How far along the world repeats, across and down (`null` down for a world that doesn't wrap over the poles).
  period: { u: number; v: number | null };
  // How the land's points lie on the ground, for the sea's surface to read their heights.
  ground: Ground;
  // The icon for a yield (`Food`, `Production`, `Trade`), the map's pack's own or the interface's, or nothing where the
  //  art has none.
  yieldIcon?: (name: string) => CanvasImageSource | null;
};

/** Something drawn at every copy of the world in sight: where it lies, how to make another of it, and those drawn now. */
export type Placed = {
  at: readonly [number, number, number];
  make: () => Object3D;
  drawn: Object3D[];
  // A marker as drawn, which its copies are cloned from.
  original?: Object3D;
};

// A walker as the stage has it: which way its figures face, how high an aircraft's flown off its stand, how solid it's
//  drawn, and the materials of its own it's drawn with, faded.
type Walking = Placed & {
  facing: number;
  aloft: number;
  opacity: number;
  faded: Faded;
  // The rigged copy its figures are drawn with, if they are, to play its clips; and how they were last posed, to pose
  //  copies made afresh as they were.
  rig: LoadedRig | null;
  posed: {
    role: ClipRole | null;
    seconds: number;
    before?: ClipBefore;
  } | null;
};

// A square's marker as the stage has it: what it marks, how solid it's drawn and with what materials of its own once
//  it's faded, and, idling (`idle`), the rigged copy it plays its idle clip with, the original its copies are made from
//  then, and how far ahead of the clock in it it is.
type Marked = Placed & {
  marker: TileMarker;
  opacity?: number;
  faded?: Faded;
  idling?: { rig: LoadedRig; original: Object3D; phase: number };
};

/** A seed for what's laid by an id, the same each time: a whole number from 0, unlike for ids a letter apart. */
export const seedOf = (id: string): number => {
  let hash = 2166136261;

  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  }

  return (hash >>> 0) % 100000;
};

/** How big a puff's flash is as it begins, as far from its middle to its edge, as big as a fallen unit's puff is. */
export const FLASH_SIZE = 0.07;

/** The name of a puff's flash (`Stage#puff`), a muzzle's or a shell's burst. */
export const PUFF_FLASH = 'flash';

export type StageFactory = (
  canvas: HTMLCanvasElement,
  options: StageOptions
) => Stage;

// A muted palette (D2): an overcast sky, and a sun low enough to model the relief.
const SKY = 0x9fb3c4,
  SKY_LIGHT = 0xd6e2ec,
  GROUND_LIGHT = 0x5b5140,
  SUN = 0xfff0d8;

/**
 * The copies of the world within `sight` of `focus`, as offsets on the ground: every multiple of the period across, and
 *  down where it wraps, whose copy comes within that distance.
 */
export const copiesNear = (
  focus: readonly [number, number],
  sight: number,
  period: { u: number; v: number | null }
): [number, number][] => {
  const along = (middle: number, span: number | null): number[] => {
    if (span === null) {
      return [0];
    }

    const found: number[] = [];

    // A copy's ground runs from its offset to a period on: it's in sight if that meets the focus's reach.
    for (
      let k = Math.floor((middle - sight) / span);
      k * span <= middle + sight;
      k++
    ) {
      found.push(k * span);
    }

    return found;
  };

  return along(focus[0], period.u).flatMap((across) =>
    along(focus[1], period.v).map((down): [number, number] => [across, down])
  );
};

/**
 * How far from the camera's focus the markers are drawn, at every copy of the world that comes within it, on a world
 *  that repeats every `period`: nearer than the land, as they're small that far off. The cities' banners are drawn at
 *  the same copies (`banners.ts`).
 */
export const markerSight = (
  orbit: Orbit,
  period?: { u: number; v: number | null }
): number =>
  Math.min(sightFor(orbit.distance, period).far, orbit.distance * 2.2);

/**
 * Where the node `joint` of figure `figure` (`RIG_FIGURE`) is in `drawn`, a thing drawn at the copy of the world at
 *  `offset`, as it's posed and placed now (`u`, height, `v`, on the world's own copy); or nothing, for no such node.
 */
export const jointOf = (
  drawn: Object3D | undefined,
  figure: number,
  joint: string,
  [offsetU, offsetV]: readonly [number, number]
): [number, number, number] | null => {
  const node = drawn
    ?.getObjectsByProperty('name', RIG_FIGURE)
    [figure]?.getObjectByName(joint);

  if (node === undefined) {
    return null;
  }

  // As it's posed and placed now, whatever's changed since it was last drawn: three.js works its matrices out afresh.
  const at = node.getWorldPosition(new Vector3());

  return [at.x - offsetU, at.y, at.z - offsetV];
};

/**
 * Makes copies of `original` for the copies of the world in sight: with figures drawn with a rigged copy (`rigged`),
 *  each with skeletons of its own (`SkeletonUtils.clone`), as a plain clone's would be bound to the original's bones,
 *  and every copy posed with them.
 */
export const copyOf = (original: Object3D, rigged: boolean) => (): Object3D =>
  rigged ? cloneSkinned(original) : original.clone();

/** Lets go of the skeletons of what's in `drawn`: each skinned mesh's has a texture of its bones, once it's drawn. */
export const letGoOfSkeletons = (drawn: Object3D): void =>
  drawn.traverse((object) => {
    if ((object as SkinnedMesh).isSkinnedMesh) {
      (object as SkinnedMesh).skeleton.dispose();
    }
  });

/**
 * What the camera sees from `orbit` on a world that repeats every `period` (across, and down where it wraps): where the
 *  haze begins and where it hides everything (`sightFor`), and the copies of the world drawn, the land's as far as the
 *  haze and the markers' nearer (`markerSight`). The fewer, the less there is to draw (#1316).
 */
export const sightOf = (
  orbit: Orbit,
  period: { u: number; v: number | null }
): {
  near: number;
  far: number;
  land: [number, number][];
  markers: [number, number][];
} => {
  const { near, far } = sightFor(orbit.distance, period);

  return {
    near,
    far,
    land: copiesNear(orbit.focus, far, period),
    markers: copiesNear(orbit.focus, markerSight(orbit, period), period),
  };
};

/** The planes that keep what lies between the poles, from 0 to `extent` down the ground: three.js keeps n·p + c ≥ 0. */
export const polesAt = (extent: number): Plane[] => [
  new Plane(new Vector3(0, 0, 1), 0),
  new Plane(new Vector3(0, 0, -1), extent),
];

/**
 * The copies of the world to draw what's laid on a chunk at, from those in sight (`copies`), its reach down the ground
 *  being `span`. With the view stopped at the poles (`stopped`) of a world that wraps over them (`period`), the land just
 *  inside a pole is the far edge's, by wrapping: on a staggered or hex world, between the first row's squares lie the
 *  last row's southern halves, and between the last row's the first row's northern halves. So what reaches past a pole
 *  is drawn a period round as well, where the poles' planes keep only what lies over the land.
 */
export const overlayCopies = (
  copies: readonly (readonly [number, number])[],
  [top, bottom]: readonly [number, number],
  extent: number,
  period: number | null,
  stopped: boolean
): [number, number][] =>
  copies.flatMap(([u, v]): [number, number][] => [
    [u, v],
    ...(stopped && period !== null && bottom > extent
      ? [[u, v - period] as [number, number]]
      : []),
    ...(stopped && period !== null && top < 0
      ? [[u, v + period] as [number, number]]
      : []),
  ]);

// Where a drawn copy's plants of a model keep how many they are, all of them, as fewer may be drawn.
const ALL_PLANTS = 'allPlants';

// The sun's shadow map's size, in texels a side, and how far the sun is from what it lights (its offset below).
const SHADOW_MAP = 2048,
  SUN_DISTANCE = Math.hypot(30, 40, 20);

export const createStage: StageFactory = (
  canvas,
  { period, ground, yieldIcon }
) => {
  // How tall the canvas is in the page's pixels, as it was last sized: how big things look on it (`thinPlants`).
  let viewHeight = canvas.clientHeight || 1;

  const renderer = new WebGLRenderer({ antialias: true, canvas }),
    scene = new Scene(),
    camera = new PerspectiveCamera(
      (FIELD_OF_VIEW * 180) / Math.PI,
      1,
      0.1,
      400
    ),
    land = new Group(),
    // The land's colour at each point, and its surfaces' detail over it (`landMaterial.ts`).
    { material, detail } = landMaterial(period, ground.rows * ground.spacingV),
    sun = new DirectionalLight(SUN, 2.6),
    // What's drawn at every copy of the world in sight: the land's chunks by `i,j`, and the squares' markers by `x,y`.
    //  Each has where it lies, how to make one copy of it, and the copies drawn now.
    chunks = new Map<string, Placed & { geometry: BufferGeometry }>(),
    // What's laid on the land, by chunk: its colours in its vertices, a little in front of the land so it doesn't
    //  flicker with it where it lies close.
    overlays = new Map<
      string,
      Placed & {
        geometry: BufferGeometry;
        haze: BufferGeometry | null;
        span: [number, number];
      }
    >(),
    // Each drawn copy's plants, as a set's models draw them: let go of with it. Every copy sharing a buffer of
    //  matrices is let go of at once, never some of them, as the rest would draw from the buffer let go.
    letGoOfPlants = (drawn: Object3D): void =>
      drawn.children.forEach((child) => {
        if ((child as InstancedMesh).isInstancedMesh) {
          (child as InstancedMesh).dispose();
        }
      }),
    // The models sets draw plants with, by their ids among every set's (`modelKey`): each of its parts, with its
    //  material, as a tree's leaves are cut out and both sides drawn (its shadow cut out as they are); and how tall the
    //  model stands over its origin, in its own units.
    plantModels = new Map<string, PlantModel>(),
    // A model drawing plants made ready: its parts' materials, clipped as what's laid on the land is.
    plantModelOf = (model: LoadedModel): PlantModel => {
      const box = new Box3();

      model.parts.forEach(({ geometry }) => {
        geometry.computeBoundingBox();
        box.union(geometry.boundingBox!);
      });

      return {
        // Its shadow's cut out as its leaves are, as three.js makes a shadow's material from it (its map, its alpha
        //  test, its side and its clipping).
        parts: model.parts.map(({ geometry, map, cutout, doubleSided }) => {
          const material = new MeshStandardMaterial({
            map,
            roughness: 0.85,
            metalness: 0,
            alphaTest: cutout ? 0.5 : 0,
            side: cutout || doubleSided ? DoubleSide : FrontSide,
            clipShadows: true,
          });

          material.clippingPlanes = overlayMaterial.clippingPlanes;

          return { geometry, material };
        }),
        height: Math.max(box.max.y, 1e-6),
        reach:
          Math.max(
            Math.abs(box.min.x),
            Math.abs(box.max.x),
            Math.abs(box.min.z),
            Math.abs(box.max.z)
          ) / Math.max(box.max.y, 1e-6),
      };
    },
    overlayMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -6,
      // Its shadows clipped with it.
      clipShadows: true,
    }),
    // Smog over pollution: see-through, each point as solid as it says, its colour lit by nothing, as haze is; drawn
    //  after what's solid, writing no depth, so what's behind it shows through and its layers don't hide each other.
    //  Clipped past a pole the view's stopped at, as what's laid on the land is.
    hazeMaterial = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      fog: true,
      // Seen from below, as on a slope facing away steeper than the camera looks down; both sides in one pass, as it's
      //  one colour, so the order its faces are drawn in doesn't show.
      side: DoubleSide,
      forceSinglePass: true,
    }),
    // What's laid on the land stops where the land does past a pole the view's stopped at: the last row's fields and
    //  roads on a staggered or hex world reach a little past it, where the land, the sea and the cloud stop (and are
    //  drawn a period round too, where the land is theirs: `overlayCopies`).
    extent = ground.rows * ground.spacingV,
    poles = polesAt(extent),
    // What's marked on each square, and, once its unit's faded, how solid and with what materials of its own.
    markers = new Map<string, Marked>(),
    // The squares whose stacks idle (`idle`), and how far into their clips, by the clock, they were last posed.
    idlers = new Set<string>(),
    // The units walking, by their walk's id (`walks.ts`), and fighting, by their battle's (`battles.ts`), each drawn as
    //  its own marker, with no city; the way each faces, how solid it's drawn, and its own materials, once faded.
    walkers = new Map<string, Walking>(),
    // What each figure drawn with a rigged copy plays (`clips.ts`).
    playing = new WeakMap<Object3D, Playing>(),
    // The puffs of smoke where units fell, or shots left or landed, by id: how far through each is, its seed, how big,
    //  and whether it flashes.
    puffs = new Map<
      string,
      Placed & {
        through: number;
        seed: number;
        size: number;
        flash: number | null;
      }
    >(),
    // What every puff's blobs are made of: one shape, and two greys.
    puffShape = new IcosahedronGeometry(1, 1),
    puffGrey = (colour: string): MeshStandardMaterial =>
      new MeshStandardMaterial({
        color: new Color(colour),
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
    puffGreys = [puffGrey('#d8d5cf'), puffGrey('#a9a59d')] as const,
    // A puff's flash, a muzzle's or a shell's burst: unlit, so it's as bright whichever way the sun is.
    flashShape = new IcosahedronGeometry(1, 0),
    flashGlow = new MeshBasicMaterial({ color: new Color('#fff1b8') }),
    // The shots in flight, by id, what each is, how far through each is and which way it's going; and what each kind
    //  is made of, shared: a bottle, alight at its neck, as a thrown one is; an arrow's shaft and head; a bullet's
    //  streak, unlit; and a shell, a dark ball.
    shots = new Map<
      string,
      Placed & {
        kind: ShotKind;
        through: number;
        heading: readonly [number, number, number];
      }
    >(),
    shaftShape = new CylinderGeometry(0.0015, 0.0015, 0.07, 4),
    arrowHeadShape = new ConeGeometry(0.004, 0.012, 4),
    wood = new MeshStandardMaterial({
      color: new Color('#7a5a3a'),
      roughness: 0.8,
      metalness: 0,
    }),
    streakShape = new CylinderGeometry(0.0025, 0.0025, 0.09, 4),
    streakGlow = new MeshBasicMaterial({ color: new Color('#ffe08a') }),
    shellShape = new IcosahedronGeometry(0.012, 1),
    iron = new MeshStandardMaterial({
      color: new Color('#2b2b2b'),
      roughness: 0.5,
      metalness: 0.6,
    }),
    bottleShape = new CylinderGeometry(0.006, 0.009, 0.03, 6),
    bottleGlass = new MeshStandardMaterial({
      color: new Color('#3d5a3a'),
      roughness: 0.3,
      metalness: 0,
    }),
    flameShape = new IcosahedronGeometry(0.011, 0),
    flame = new MeshBasicMaterial({ color: new Color('#ffb347') }),
    // The wakes ships leave, by their walk's id, each its foam's own shape; and the foam they're drawn in, solid, so
    //  it's drawn with the land and the units, over the sea, as the ripples round a ship are. Unlit, so where a line
    //  folds over itself, round a turn, it's the same white either way up.
    wakes = new Map<string, Placed & { shape: BufferGeometry }>(),
    foam = new MeshBasicMaterial({
      color: new Color('#dfe8e8'),
      side: DoubleSide,
    }),
    markersGroup = new Group(),
    kit = new MarkerKit(),
    // What each square yields, over the land at every copy of the world, when they're shown.
    yieldsGroup = new Group(),
    yields = new YieldIcons(yieldIcon ?? ((): null => null)),
    water = new Water(ground, new Color(SKY)),
    clouds = new Clouds(water.texture(), ground),
    fog = new Fog(SKY, 30, 110);

  let idleSeconds = 0;
  // The copies of the world drawn now, and their key, to tell when they change.
  let copies: [number, number][] = [[0, 0]],
    copiesKey = '0,0',
    // The markers', fewer: past about twice the camera's distance they're too small and hazy to matter.
    markerCopies: [number, number][] = [[0, 0]],
    markerCopiesKey = '0,0',
    // Whether the view's stopped at the poles.
    stopped = false,
    // The yields drawn now, at every copy of the world in sight, or none.
    yieldsPlaced: Placed | null = null;

  // Taken down: models loaded after are let go of.
  let disposed = false;

  renderer.outputColorSpace = SRGBColorSpace;
  // For what's laid on the land, to stop at a pole the view's stopped at.
  renderer.localClippingEnabled = true;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  scene.background = new Color(SKY);
  // Haze into the distance (§9.3), so the land fades into the sky rather than ending at an edge: how far follows the
  //  camera's distance.
  scene.fog = fog;
  scene.add(new HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 0.9));
  scene.add(land);
  scene.add(markersGroup);
  scene.add(yieldsGroup);
  scene.add(water.mesh);
  scene.add(clouds.mesh);

  // From the south-east and well up, so slopes facing it are lit and the far sides of ridges fall into shade.
  sun.position.set(30, 40, 20);
  // One shadow map, over what the camera sees round its focus (`view`).
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // A thing's copies, one for each copy of the world drawn now, in `parent`.
  const copiesOf = (
    placed: Placed,
    parent: Group,
    at: [number, number][] = copies
  ): Object3D[] =>
    at.map(([offsetU, offsetV]) => {
      const drawn = placed.make();

      drawn.position.set(
        placed.at[0] + offsetU,
        placed.at[1],
        placed.at[2] + offsetV
      );
      parent.add(drawn);
      // Where it stands at once, not only once it's drawn: a unit marked since the last frame is picked where it stands
      //  (`unitAt`), not where its clone's matrices left it.
      drawn.updateMatrixWorld(true);

      return drawn;
    });

  // What's laid on a chunk, at the copies it's drawn at.
  const overlayCopiesOf = (
    overlay: Placed & { span: [number, number] }
  ): Object3D[] =>
    copiesOf(
      overlay,
      land,
      overlayCopies(copies, overlay.span, extent, period.v, stopped)
    );

  // The unit's part of each of a marker's copies, its city apart.
  const unitParts = (drawn: readonly Object3D[]): Object3D[] =>
    drawn.flatMap((copy) => {
      const part = copy.getObjectByName(UNIT_PART);

      return part === undefined ? [] : [part];
    });

  // A walker's copies turned the way it faces: only its figures turn, its flag over them as ever. An aircraft's
  //  figures and flag as high as it's flown, off its stand.
  const pose = (walker: Walking): void =>
    walker.drawn.forEach((drawn) => {
      const figures = drawn.getObjectByName(FIGURES_PART),
        aloft = drawn.getObjectByName(ALOFT_PART);

      if (figures !== undefined) {
        figures.rotation.y = walker.facing;
      }

      if (aloft !== undefined) {
        aloft.position.y = walker.aloft;
      }
    });

  // A shot's copies turned: a bottle's as far as it's tumbled `through` its flight, end over end, a turn and a half; an
  //  arrow's and a bullet's streak's pointing the way it's going, the streak no longer than it's gone.
  const up = new Vector3(0, 1, 0),
    pointing = new Vector3();
  const tumble = (shot: {
    drawn: Object3D[];
    kind: ShotKind;
    through: number;
    heading: readonly [number, number, number];
  }): void =>
    shot.drawn.forEach((drawn) => {
      if (shot.kind === 'bottle') {
        drawn.rotation.set(shot.through * Math.PI * 3, 0, 0);
      } else if (shot.kind === 'arrow' || shot.kind === 'bullet') {
        drawn.quaternion.setFromUnitVectors(
          up,
          pointing.set(...shot.heading).normalize()
        );
      }

      // A bullet's streak grows from the muzzle over the first tenth of its flight, rather than reaching back into
      //  whoever fired it.
      if (shot.kind === 'bullet') {
        drawn.scale.set(1, Math.min(1, Math.max(0.01, shot.through * 10)), 1);
      }
    });

  // What a shot of `kind` is made of, as it's drawn, about its middle: a bullet's streak trails behind it.
  const shotMade = (kind: ShotKind): Object3D => {
    const group = new Group();

    if (kind === 'arrow') {
      const head = new Mesh(arrowHeadShape, iron);

      head.position.y = 0.04;
      group.add(new Mesh(shaftShape, wood), head);
    } else if (kind === 'bullet') {
      const streak = new Mesh(streakShape, streakGlow);

      streak.position.y = -0.045;
      group.add(streak);
    } else if (kind === 'shell') {
      group.add(new Mesh(shellShape, iron));
    } else {
      const alight = new Mesh(flameShape, flame);

      alight.position.y = 0.02;
      group.add(new Mesh(bottleShape, bottleGlass), alight);
    }

    return group;
  };

  // A puff's copies, as big as it is, each blob where it is and as big as it is `through` the puff, one that's shrunk
  //  to nothing not drawn; and its flash, if it has one, where it bursts from, a muzzle or where a shell lands, at its
  //  biggest as it begins, gone a fifth of the way through.
  const shapePuff = (puff: {
    drawn: Object3D[];
    through: number;
    seed: number;
    size: number;
    flash: number | null;
  }): void => {
    const blobs = puffAt(puff.through, puff.seed),
      flash = Math.max(0, 1 - puff.through * 5);

    puff.drawn.forEach((copy) => {
      copy.scale.setScalar(Math.max(puff.size, 1e-4));
      copy.children.forEach((part, index) => {
        // As high over where it bursts from as it's asked: a muzzle's at it, a burst's on the ground.
        if (part.name === PUFF_FLASH) {
          part.position.set(0, puff.flash ?? 0, 0);
          part.scale.setScalar(Math.max(FLASH_SIZE * flash, 1e-4));
          part.visible = flash > 0;

          return;
        }

        const blob = blobs[index];

        if (blob === undefined) {
          part.visible = false;

          return;
        }

        part.position.set(...blob.at);
        part.scale.setScalar(Math.max(blob.size, 1e-4));
        part.visible = blob.size > 0;
      });
    });
  };

  // A marker's original, made from what it marks: casting shadows on the land, as the models will. A walker's drawn to
  //  fly (`flying`).
  const markerOf = (
    marker: TileMarker,
    flying = false,
    rigged = false
  ): Object3D => {
    const original = drawMarker(kit, marker, flying, rigged);

    original.traverse((object) => {
      object.castShadow = object instanceof Mesh;
    });

    return original;
  };

  // Every city's size and name it has had would be kept otherwise.
  const sweep = (): void => {
    if (kit.sweepDue) {
      kit.sweep([
        ...[...markers.values(), ...walkers.values()].flatMap(({ original }) =>
          original === undefined ? [] : [original]
        ),
        ...[...markers.values()].flatMap(({ idling }) =>
          idling === undefined ? [] : [idling.original]
        ),
      ]);
    }
  };

  // The rigged copy the unit `marker` marks idles with: its model's, where that has an idle clip.
  const idleRig = (marker: TileMarker): LoadedRig | null => {
    const model = marker.unit?.model,
      rig = model === undefined ? null : kit.rigOf(model);

    return rig !== null && rig.clips.has('idle') ? rig : null;
  };

  // A marker drawn idling, with its rig's copy, where it has one, made from its own original; or, for none, standing.
  const drawIdling = (
    placed: Marked,
    rig: LoadedRig | null,
    phase: number
  ): void => {
    const standing = placed.original!;

    if (rig === null) {
      placed.idling = undefined;
      placed.make = (): Object3D => standing.clone();

      return;
    }

    const original = markerOf(placed.marker, false, true);

    placed.idling = { rig, original, phase };
    placed.make = copyOf(original, true);
  };

  // A marker's copies made afresh, as it's drawn now, its old ones let go of, with their skeletons.
  const redraw = (placed: Marked): void => {
    placed.drawn.forEach((drawn) => {
      markersGroup.remove(drawn);
      letGoOfSkeletons(drawn);
    });
    placed.drawn = copiesOf(placed, markersGroup, markerCopies);
  };

  // An idling marker's figures posed as its idle clip has them `seconds` in, by the clock, its own way into it.
  const poseIdling = (placed: Marked, seconds: number): void => {
    const { idling } = placed;

    if (idling !== undefined) {
      placed.drawn.forEach((drawn) =>
        poseFigures(drawn, idling.rig, 'idle', seconds + idling.phase, playing)
      );
    }
  };

  const view = (
    orbit: Orbit,
    height: number,
    seen: { u: number; v: number | null } = period
  ): void => {
    const [u, v] = orbit.focus,
      [x, y, z] = eye(orbit, height),
      sight = sightOf(orbit, seen),
      { near, far } = sight;

    camera.position.set(x, y, z);
    camera.lookAt(u, height, v);
    camera.far = far * 1.2;
    // As near as anything gets, no nearer: the depth there is to go round is spread over less, so what's laid a few
    //  thousandths over the land doesn't flicker with it far out.
    camera.near = Math.max(0.1, orbit.distance * 0.02);
    camera.updateProjectionMatrix();
    fog.near = near;
    fog.far = far;

    // The sun's direction stays the same wherever the camera looks, and its shadows cover what the camera sees round
    //  its focus, which the haze doesn't hide much of.
    const reach = orbit.distance * 2.2,
      shadow = sun.shadow.camera;

    sun.position.set(u + 30, height + 40, v + 20);
    sun.target.position.set(u, height, v);
    shadow.left = -reach;
    shadow.right = reach;
    shadow.top = reach;
    shadow.bottom = -reach;
    // As deep as it's wide, round the focus, the sun being as far from it as its offset is long.
    shadow.near = Math.max(0.5, SUN_DISTANCE - reach * 1.6);
    shadow.far = SUN_DISTANCE + reach * 1.6;
    shadow.updateProjectionMatrix();

    // The sea's surface under the camera, as far as it sees.
    water.follow(
      u,
      v,
      far * 2.2,
      sun.position.clone().sub(sun.target.position)
    );
    clouds.follow(u, v, far * 2.2);

    // Stopped at the poles: nothing past them, as the 2D map shows nothing past its locked edges.
    water.pastThePoles(seen.v !== null);
    clouds.pastThePoles(seen.v !== null);
    overlayMaterial.clippingPlanes = seen.v === null ? poles : null;
    hazeMaterial.clippingPlanes = overlayMaterial.clippingPlanes;
    plantModels.forEach(({ parts }) =>
      parts.forEach(({ material }) => {
        material.clippingPlanes = overlayMaterial.clippingPlanes;
      })
    );
    stopped = seen.v === null;

    // The copies of the world the haze doesn't hide: when they change, every chunk is drawn at the new ones. And the
    //  markers', nearer.
    const inSight = sight.land,
      // What's laid past the poles is drawn round the world too when they're stopped at.
      key = `${inSight.join(';')}${stopped ? ' stopped' : ''}`,
      markersInSight = sight.markers,
      markersKey = markersInSight.join(';');

    if (key !== copiesKey) {
      copies = inSight;
      copiesKey = key;
      chunks.forEach((chunk) => {
        chunk.drawn.forEach((drawn) => land.remove(drawn));
        chunk.drawn = copiesOf(chunk, land);
      });
      overlays.forEach((overlay) => {
        // Every copy's plants let go of together: they share their matrices' buffer, which the new copies take again.
        overlay.drawn.forEach((drawn) => {
          letGoOfPlants(drawn);
          land.remove(drawn);
        });
        overlay.drawn = overlayCopiesOf(overlay);
      });

      if (yieldsPlaced !== null) {
        yieldsPlaced.drawn.forEach((drawn) => yieldsGroup.remove(drawn));
        yieldsPlaced.drawn = copiesOf(yieldsPlaced, yieldsGroup);
      }
    }

    // The yields' icons are smaller, the lower the camera looks, so they still fit their squares.
    yields.lean(orbit.pitch);

    if (markersKey !== markerCopiesKey) {
      markerCopies = markersInSight;
      markerCopiesKey = markersKey;
      [
        ...markers.values(),
        ...walkers.values(),
        ...puffs.values(),
        ...wakes.values(),
        ...shots.values(),
      ].forEach((marker) => {
        marker.drawn.forEach((drawn) => {
          markersGroup.remove(drawn);
          letGoOfSkeletons(drawn);
        });
        marker.drawn = copiesOf(marker, markersGroup, markerCopies);
      });
      walkers.forEach(pose);
      // Posed as they were, mid-stride, not standing for a frame; and those idling, as they were last posed.
      walkers.forEach(({ drawn, rig, posed }) => {
        if (rig !== null && posed !== null) {
          drawn.forEach((copy) =>
            poseFigures(
              copy,
              rig,
              posed.role,
              posed.seconds,
              playing,
              posed.before
            )
          );
        }
      });
      idlers.forEach((key) => {
        const placed = markers.get(key);

        if (placed !== undefined) {
          poseIdling(placed, idleSeconds);
        }
      });
      puffs.forEach(shapePuff);
      shots.forEach(tumble);
      // Copies made afresh, from the kit's materials: those faded, faded again.
      walkers.forEach((walker) => {
        if (walker.opacity < 1) {
          fade(walker.drawn, walker.opacity, walker.faded);
        }
      });
      markers.forEach((marker) => {
        if (marker.faded !== undefined && (marker.opacity ?? 1) < 1) {
          fade(unitParts(marker.drawn), marker.opacity ?? 1, marker.faded);
        }
      });
    }
  };

  // A set's plants, each model's at each copy of each chunk drawn fewer when they're small on the screen (`plantsKept`),
  //  by how deep into the view the nearest of them is, the same share for each of the model's parts, as they share its
  //  matrices.
  const reach = new Sphere(),
    offset = new Vector3(),
    forward = new Vector3(),
    shares = new Map<InstancedBufferAttribute, number>(),
    thinCopy = (copy: Object3D, focal: number): void => {
      shares.clear();
      copy.children.forEach((child) => {
        const all = child.userData[ALL_PLANTS] as number | undefined,
          mesh = child as InstancedMesh;

        if (all === undefined || mesh.boundingSphere === null) {
          return;
        }

        let share = shares.get(mesh.instanceMatrix);

        if (share === undefined) {
          reach.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
          // How deep into the view the nearest of them is, along the way the camera looks.
          share = plantsKept(
            Math.max(
              0,
              offset.subVectors(reach.center, camera.position).dot(forward) -
                reach.radius
            ),
            focal
          );
          shares.set(mesh.instanceMatrix, share);
        }

        mesh.count = Math.ceil(all * share);
      });
    },
    thinPlants = (): void => {
      camera.getWorldDirection(forward);

      // The page's pixels a thing one unit tall stands, one unit deep into the view.
      const focal =
        viewHeight / (2 * Math.tan((camera.fov * Math.PI) / 180 / 2));

      overlays.forEach(({ drawn }) => {
        for (const copy of drawn) {
          thinCopy(copy, focal);
        }
      });
    };

  return {
    render: (): void => {
      thinPlants();
      renderer.render(scene, camera);
    },
    resize: (width, height, pixelRatio): void => {
      viewHeight = height;
      renderer.setPixelRatio(pixelRatio);
      // The canvas's own size only: the page's stylesheet sizes its box.
      renderer.setSize(width, height, false);
      camera.aspect = height > 0 ? width / height : 1;
      camera.updateProjectionMatrix();
    },
    setChunk: (i, j, mesh): void => {
      const key = `${i},${j}`,
        geometry = new BufferGeometry();

      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('color', new BufferAttribute(mesh.colours, 3));
      // How much of each surface the ground is, from 0 to 1.
      geometry.setAttribute(
        'surfacesA',
        new BufferAttribute(mesh.surfacesA, 4, true)
      );
      geometry.setAttribute(
        'surfacesB',
        new BufferAttribute(mesh.surfacesB, 4, true)
      );
      // How much of what the ground's blended from is water, for wet ground at the waterline.
      geometry.setAttribute('shore', new BufferAttribute(mesh.shore, 1, true));
      geometry.setIndex(new BufferAttribute(mesh.indices, 1));
      geometry.computeBoundingSphere();

      const old = chunks.get(key);

      if (old !== undefined) {
        old.drawn.forEach((drawn) => land.remove(drawn));
        old.geometry.dispose();
      }

      const chunk: Placed & { geometry: BufferGeometry } = {
        geometry,
        at: [mesh.u, 0, mesh.v],
        make: () => {
          const drawn = new Mesh(geometry, material);

          drawn.castShadow = true;
          drawn.receiveShadow = true;

          return drawn;
        },
        drawn: [],
      };

      chunk.drawn = copiesOf(chunk, land);
      chunks.set(key, chunk);
      water.setChunk(mesh);
    },
    setOverlay: (i, j, mesh): void => {
      const key = `${i},${j}`,
        old = overlays.get(key);

      if (old !== undefined) {
        old.drawn.forEach((drawn) => {
          letGoOfPlants(drawn);
          land.remove(drawn);
        });
        old.geometry.dispose();
        old.haze?.dispose();
        overlays.delete(key);
      }

      if (mesh === null) {
        return;
      }

      const geometry = new BufferGeometry();

      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('color', new BufferAttribute(mesh.colours, 3));
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();

      // Its haze, smog over pollution, where it has any: its own geometry, drawn see-through with the haze's material.
      const haze =
        mesh.haze.positions.length === 0 ? null : new BufferGeometry();

      if (haze !== null) {
        haze.setAttribute(
          'position',
          new BufferAttribute(mesh.haze.positions, 3)
        );
        haze.setAttribute('color', new BufferAttribute(mesh.haze.colours, 4));
        haze.computeBoundingSphere();
        haze.computeBoundingBox();
      }

      // Its plants, as a set's models draw them: each model's, where it's had, every plant's matrix in one buffer every
      //  copy of the world shares, standing on the land as tall as it's laid and turned its way.
      const plants: {
          model: PlantModel;
          matrices: InstancedBufferAttribute;
          // How far each of its parts reaches, the same at every copy of the world, worked out once.
          spheres: Sphere[];
        }[] = [],
        plantsBox = new Box3(),
        at = new Vector3();

      Object.entries(mesh.plants).forEach(([id, laid]) => {
        const model = plantModels.get(id);

        if (model === undefined) {
          return;
        }

        // By their rank, so the first few drawn of them, small on the screen, are an even scatter (`plantsKept`).
        const matrices = plantMatrices(laid, PLANT_NUMBERS, model.height);

        for (let n = 0; n < laid.length / PLANT_NUMBERS; n++) {
          plantsBox.expandByPoint(
            at.set(
              laid[n * PLANT_NUMBERS]!,
              laid[n * PLANT_NUMBERS + 1]!,
              laid[n * PLANT_NUMBERS + 2]!
            )
          );
        }

        const shared = new InstancedBufferAttribute(matrices, 16);

        plants.push({
          model,
          matrices: shared,
          spheres: model.parts.map(({ geometry: part, material }) => {
            const measured = new InstancedMesh(part, material, 0);

            measured.instanceMatrix = shared;
            measured.count = shared.count;
            measured.computeBoundingSphere();

            return measured.boundingSphere!;
          }),
        });
      });

      // What's laid, its haze and its plants together: one may be all there is, as pollution alone.
      const box = new Box3();

      [geometry.boundingBox, haze?.boundingBox, plantsBox].forEach((each) => {
        if (each !== undefined && each !== null && !each.isEmpty()) {
          box.union(each);
        }
      });

      const overlay: Placed & {
        geometry: BufferGeometry;
        haze: BufferGeometry | null;
        span: [number, number];
      } = {
        geometry,
        haze,
        // How far down the ground it reaches, from its top to its bottom.
        span: [mesh.v + box.min.z, mesh.v + box.max.z],
        at: [mesh.u, 0, mesh.v],
        make: () => {
          const drawn = new Mesh(geometry, overlayMaterial);

          // Its specials, huts and mines cast shadows; what's laid flat takes the land's.
          drawn.castShadow = true;
          drawn.receiveShadow = true;

          if (haze !== null) {
            const smog = new Mesh(haze, hazeMaterial);

            // After the sea and before the cloud (`SMOG_ORDER`): drawn before the sea, smog over the land where
            //  the sea's behind it would be painted over, cut along the shore.
            smog.renderOrder = SMOG_ORDER;
            drawn.add(smog);
          }

          // Its plants, each model's part drawn once for all of them, casting shadows cut out as its leaves are.
          plants.forEach(({ model, matrices, spheres }) =>
            model.parts.forEach(({ geometry: part, material }, index) => {
              // Made empty, to take the shared matrices rather than make its own.
              const grown = new InstancedMesh(part, material, 0);

              grown.instanceMatrix = matrices;
              grown.count = matrices.count;
              grown.boundingSphere = spheres[index]!;
              // Thinned as it's drawn, by how small it is on the screen (`thinPlants`).
              grown.userData[ALL_PLANTS] = matrices.count;
              grown.castShadow = true;
              grown.receiveShadow = true;
              drawn.add(grown);
            })
          );

          return drawn;
        },
        drawn: [],
      };

      overlay.drawn = overlayCopiesOf(overlay);
      overlays.set(key, overlay);
    },
    unitAt: (ndc): string | null => {
      // Each copy's matrices are brought up to date as it's made (`copiesOf`), and a walker's as it's drawn, so asking
      //  on each move of the pointer costs no walk of the whole scene.
      camera.updateMatrixWorld();

      return unitUnder(
        [...markers].map(([key, { drawn }]) => [key, drawn] as const),
        camera,
        ndc
      );
    },
    setMarker: (key, at, marker): void => {
      // Its geometries and materials are the kit's, shared by every marker, and let go by the kit's sweep: those it
      //  faded with are its own, and the skeletons it idled with.
      const old = markers.get(key);

      old?.drawn.forEach((drawn) => {
        markersGroup.remove(drawn);
        letGoOfSkeletons(drawn);
      });

      if (old?.idling !== undefined) {
        letGoOfSkeletons(old.idling.original);
      }

      if (old?.faded !== undefined) {
        unfade(old.faded);
      }

      markers.delete(key);
      idlers.delete(key);

      if (marker === null) {
        return;
      }

      const original = markerOf(marker),
        placed: Marked = {
          at,
          marker,
          make: () => original.clone(),
          drawn: [],
          original,
        };

      // Idling, it idles on, as far into its clip as it was, where what it marks now can: not standing for a frame.
      if (old?.idling !== undefined) {
        drawIdling(placed, idleRig(marker), old.idling.phase);
      }

      placed.drawn = copiesOf(placed, markersGroup, markerCopies);
      markers.set(key, placed);

      if (placed.idling !== undefined) {
        idlers.add(key);
        poseIdling(placed, idleSeconds);
      }

      sweep();
    },
    idle: (keys, seconds): boolean => {
      const { stand, start, waiting } = idleChanges(
        keys,
        idlers,
        (key) => {
          const placed = markers.get(key);

          return placed !== undefined && idleRig(placed.marker) !== null;
        },
        (key) => (markers.get(key)?.opacity ?? 1) < 1
      );

      idleSeconds = seconds;
      stand.forEach((key) => {
        const placed = markers.get(key)!;

        letGoOfSkeletons(placed.idling!.original);
        drawIdling(placed, null, 0);
        redraw(placed);
        idlers.delete(key);
      });
      start.forEach((key) => {
        const placed = markers.get(key)!;

        drawIdling(placed, idleRig(placed.marker), idlePhase(key));
        redraw(placed);
        idlers.add(key);
      });
      idlers.forEach((key) => poseIdling(markers.get(key)!, seconds));

      return idlers.size > 0 || waiting;
    },
    setWalker: (id, marker): void => {
      const old = walkers.get(id);

      old?.drawn.forEach((drawn) => {
        markersGroup.remove(drawn);
        letGoOfSkeletons(drawn);
      });

      if (old?.original !== undefined) {
        letGoOfSkeletons(old.original);
      }

      if (old !== undefined) {
        unfade(old.faded);
      }

      walkers.delete(id);

      if (marker === null) {
        return;
      }

      // Drawn with its model's rigged copy, where it has one, to play its clips: each copy with a skeleton of its own.
      const model = marker.unit?.model,
        rig = model === undefined ? null : kit.rigOf(model),
        original = markerOf(marker, true, rig !== null),
        walker: Walking = {
          at: old?.at ?? [0, 0, 0],
          facing: old?.facing ?? marker.unit?.facing ?? 0,
          aloft: old?.aloft ?? 0,
          opacity: 1,
          faded: new Map(),
          make: copyOf(original, rig !== null),
          drawn: [],
          original,
          rig,
          posed: null,
        };

      walker.drawn = copiesOf(walker, markersGroup, markerCopies);
      pose(walker);
      walkers.set(id, walker);
      sweep();
    },
    placeWalker: (id, at, facing, aloft = 0): void => {
      const walker = walkers.get(id);

      if (walker === undefined) {
        return;
      }

      walker.at = at;
      walker.facing = facing;
      walker.aloft = aloft;
      walker.drawn.forEach((drawn, copy) => {
        const [offsetU, offsetV] = markerCopies[copy] ?? [0, 0];

        drawn.position.set(at[0] + offsetU, at[1], at[2] + offsetV);
      });
      pose(walker);
    },
    poseWalker: (id, role, seconds, before): void => {
      const walker = walkers.get(id);

      if (walker === undefined || walker.rig === null) {
        return;
      }

      walker.posed = { role, seconds, before };
      walker.drawn.forEach((drawn) =>
        poseFigures(drawn, walker.rig!, role, seconds, playing, before)
      );
    },
    rigFacts: (marker): RigFacts | null => {
      const { unit } = marker,
        rig = unit?.model === undefined ? null : kit.rigOf(unit.model);

      return unit === null || rig === null
        ? null
        : rigFacts(rig, markerFigures(unit));
    },
    jointAt: (id, figure, joint): [number, number, number] | null => {
      const walker = walkers.get(id);

      return walker === undefined || walker.rig === null
        ? null
        : jointOf(walker.drawn[0], figure, joint, markerCopies[0] ?? [0, 0]);
    },
    shot: (
      id,
      at,
      through = 0,
      kind = 'bottle',
      heading = [0, -1, 0]
    ): void => {
      const old = shots.get(id);

      if (at === null) {
        old?.drawn.forEach((drawn) => markersGroup.remove(drawn));
        shots.delete(id);

        return;
      }

      const shot = old ?? {
        at,
        kind,
        through,
        heading,
        make: (): Object3D => shotMade(kind),
        drawn: [],
      };

      if (old === undefined) {
        shot.drawn = copiesOf(shot, markersGroup, markerCopies);
        shots.set(id, shot);
      }

      shot.at = at;
      shot.through = through;
      shot.heading = heading;
      shot.drawn.forEach((drawn, copy) => {
        const [offsetU, offsetV] = markerCopies[copy] ?? [0, 0];

        drawn.position.set(at[0] + offsetU, at[1], at[2] + offsetV);
      });
      tumble(shot);
    },
    fadeMarker: (key, opacity): void => {
      const marker = markers.get(key),
        solid = Math.min(1, Math.max(0, opacity));

      if (marker === undefined || solid === (marker.opacity ?? 1)) {
        return;
      }

      marker.opacity = solid;
      marker.faded ??= new Map();

      // Solid again: drawn with the kit's materials, as every other marker is, its own let go of.
      if (solid === 1) {
        unfaded(unitParts(marker.drawn), marker.faded);

        return;
      }

      fade(unitParts(marker.drawn), solid, marker.faded);
    },
    wake: (id, at, shape = []): void => {
      const old = wakes.get(id);

      if (at === null) {
        old?.drawn.forEach((drawn) => markersGroup.remove(drawn));
        old?.shape.dispose();
        wakes.delete(id);

        return;
      }

      const made = new BufferGeometry();

      made.setAttribute(
        'position',
        new BufferAttribute(Float32Array.from(shape), 3)
      );

      const wake = old ?? {
        at,
        shape: made,
        make: (): Object3D => new Mesh(wake.shape, foam),
        drawn: [],
      };

      if (old === undefined) {
        wake.drawn = copiesOf(wake, markersGroup, markerCopies);
        wakes.set(id, wake);
      } else {
        old.shape.dispose();
        old.shape = made;
        old.drawn.forEach((drawn) => {
          (drawn as Mesh).geometry = made;
        });
      }

      wake.at = at;
      wake.drawn.forEach((drawn, copy) => {
        const [offsetU, offsetV] = markerCopies[copy] ?? [0, 0];

        drawn.position.set(at[0] + offsetU, at[1], at[2] + offsetV);
      });
    },
    puff: (id, at, through = 0, size = 1, flash = null): void => {
      const old = puffs.get(id);

      if (at === null) {
        old?.drawn.forEach((drawn) => markersGroup.remove(drawn));
        puffs.delete(id);

        return;
      }

      // By its whole id, so a shot's smoke where it left and its puff where it landed don't look the same.
      const seed = seedOf(id),
        puff = old ?? {
          at,
          through,
          seed,
          size,
          flash,
          // Its blobs, sharing the one shape and the two greys, and its flash: nothing of its own to let go of.
          make: (): Object3D => {
            const group = new Group();

            puffAt(0, seed).forEach(({ shade }) =>
              group.add(new Mesh(puffShape, puffGreys[shade]))
            );

            if (flash !== null) {
              const glow = new Mesh(flashShape, flashGlow);

              glow.name = PUFF_FLASH;
              group.add(glow);
            }

            return group;
          },
          drawn: [],
        };

      if (old === undefined) {
        puff.drawn = copiesOf(puff, markersGroup, markerCopies);
        puffs.set(id, puff);
      }

      puff.at = at;
      puff.through = through;
      puff.drawn.forEach((drawn, copy) => {
        const [offsetU, offsetV] = markerCopies[copy] ?? [0, 0];

        drawn.position.set(at[0] + offsetU, at[1], at[2] + offsetV);
      });
      shapePuff(puff);
    },
    fadeWalker: (id, opacity): void => {
      const walker = walkers.get(id),
        solid = Math.min(1, Math.max(0, opacity));

      if (walker === undefined || solid === walker.opacity) {
        return;
      }

      walker.opacity = solid;
      fade(walker.drawn, solid, walker.faded);
    },
    setYields: (mesh): void => {
      yieldsPlaced?.drawn.forEach((drawn) => yieldsGroup.remove(drawn));
      yieldsPlaced = null;

      if (yields.set(mesh) === null) {
        return;
      }

      // The whole world's, from its origin.
      yieldsPlaced = { at: [0, 0, 0], make: () => yields.make(), drawn: [] };
      yieldsPlaced.drawn = copiesOf(yieldsPlaced, yieldsGroup);
    },
    view,
    loadModels: async (url, loaded, grown): Promise<void> => {
      await loadModels(
        url,
        (id, model, types) => {
          // Taken down meanwhile: let go of it.
          if (disposed) {
            model.parts.forEach(({ geometry, map }) => {
              geometry.dispose();
              map?.dispose();
            });

            return;
          }

          // Two sets may each name a model the same.
          const key = modelKey(url, id);

          kit.addModel(key, model);
          loaded(key, types);
        },
        (id, error) =>
          console.warn(`The 3D map's model ${modelKey(url, id)}:`, error),
        // Its rigged copy, drawn for what walks, fights and idles (plan 2.2): the view's told again, as what stands
        //  near the camera may idle now.
        (id, rig, types) => {
          const key = modelKey(url, id);

          if (disposed) {
            return;
          }

          kit.addRig(key, rig);

          if (kit.rigOf(key) === rig) {
            loaded(key, types);
          }
        },
        // A model drawing plants: drawn wherever an overlay's plants name it, once the view's told and they're laid.
        (id, model, plants) => {
          if (disposed) {
            model.parts.forEach(({ geometry, map }) => {
              geometry.dispose();
              map?.dispose();
            });

            return;
          }

          const key = modelKey(url, id),
            made = plantModelOf(model);

          plantModels.set(key, made);
          grown?.(key, plants, made.reach);
        }
      );
    },
    stats: (): StageStats => ({
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
    }),
    dispose: (): void => {
      disposed = true;
      chunks.forEach(({ geometry }) => geometry.dispose());
      chunks.clear();
      overlays.forEach(({ geometry, haze, drawn }) => {
        drawn.forEach(letGoOfPlants);
        geometry.dispose();
        haze?.dispose();
      });
      overlays.clear();
      overlayMaterial.dispose();
      hazeMaterial.dispose();
      plantModels.forEach(({ parts }) =>
        parts.forEach(({ geometry, material }) => {
          geometry.dispose();
          material.map?.dispose();
          material.dispose();
        })
      );
      plantModels.clear();
      markers.forEach(({ faded, drawn, idling }) => {
        if (faded !== undefined) {
          unfade(faded);
        }

        [...drawn, ...(idling === undefined ? [] : [idling.original])].forEach(
          letGoOfSkeletons
        );
      });
      markers.clear();
      idlers.clear();
      walkers.forEach(({ faded, drawn, original }) => {
        unfade(faded);
        [...drawn, ...(original === undefined ? [] : [original])].forEach(
          letGoOfSkeletons
        );
      });
      walkers.clear();
      puffs.clear();
      wakes.forEach(({ shape }) => shape.dispose());
      wakes.clear();
      foam.dispose();
      puffShape.dispose();
      puffGreys.forEach((grey) => grey.dispose());
      shots.clear();
      bottleShape.dispose();
      bottleGlass.dispose();
      flameShape.dispose();
      flame.dispose();
      flashShape.dispose();
      flashGlow.dispose();
      shaftShape.dispose();
      arrowHeadShape.dispose();
      wood.dispose();
      streakShape.dispose();
      streakGlow.dispose();
      shellShape.dispose();
      iron.dispose();
      kit.dispose();
      yields.dispose();
      water.dispose();
      clouds.dispose();
      material.dispose();
      detail.dispose();
      renderer.dispose();
    },
  };
};

export default createStage;
