// The shapes laid on the land (docs/3d-renderer.md §5.2, §5.4, plan 3.4), from what `overlayFor` says a square has, made
//  by code for the built-in set:
//  - roads, railroads and fields are draped over the land, sampled along it, a little above it; where a road, railroad
//    or runway crosses a river's water, it's on a bridge, a little over it, with walls either side;
//  - pollution is smog, a see-through haze draped higher over it, a mesh of its own;
//  - mines, fortresses, airbases, specials and huts are small solids standing on it, specials at sea on the water;
//  - a city's lot is its sprawl, and a city's houses spill onto its neighbours' squares as it grows;
//  - what stands on a square stands away from its middle, where a unit stands, each at a place of its own seeded from
//    the square, so they don't line up from square to square.
//
// A chunk's squares are one mesh, their colours in its vertices: one draw call a chunk at each copy of the world, like
//  the land's (#1204), and one more for its smog, where it has any. Its points are relative to the chunk's corner, as
//  the land's are.

import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  EulerOrder,
  ExtrudeGeometry,
  Matrix3,
  Matrix4,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import {
  SpecialLook,
  specialLook,
} from '@civ-clone/ui-models-builtin/specials';
import { seaFloor } from '@civ-clone/ui-models-builtin/terrain';
import {
  Growth,
  Plant,
  Stand,
  PlantKind,
  growthOf,
} from '@civ-clone/ui-models-builtin/vegetation';
import { BeastKind, beastParts, beastReach } from './beasts';
import { Route, SquareOverlay } from './overlayFor';
import {
  CityPlan,
  GAP,
  Lot,
  Run,
  STREET,
  footprintOf,
  sprawl,
  suburb,
} from './sprawl';
import { IN_FRONT_OF_CITY } from '../markers/drawMarker';
import disorderPieces from './disorder';
import { ditherRank } from './thinning';
import { standAt } from './stands';
import { RiverPath } from '../terrain/relief';
import { FLOOR, bedOf } from '../terrain/rivers';
import { RIVER_LIFT, cutAlong } from '../terrain/ribbons';

/** Where a square is, and what it needs to know of the land round it, to lay its overlay. */
export type OverlayPlace = {
  centre: readonly [number, number];
  // The middle of the neighbour `offset` away, at the copy of the world nearest this square.
  toward(offset: readonly [number, number]): readonly [number, number];
  // How far from its middle the square reaches every way (its outline's nearest edge).
  radius: number;
  // Half the biggest square, with sides along the ground's axes, that fits inside it: where fields are laid.
  inner: number;
  heightAt(u: number, v: number): number;
  // A number of the square's own, for where things stand on it.
  seed: number;
  // How far it is from the equator, from 0 there to 1 at the poles.
  latitude: number;
  // How far a point `v` down the ground is from the equator, as `latitude` is for the square's middle: for woods'
  //  stands, whose centres may be on another square. Where it's not given, the square's own.
  latitudeAt?(v: number): number;
  // Its corners, as the layout has them.
  outline: readonly (readonly [number, number])[];
  // Whether a point is on this square, as the layout says (`GroundLayout#tileAt`): each point is on one square, and on
  //  none past the edge of a world that doesn't wrap.
  owns(u: number, v: number): boolean;
  // Every neighbour's offset, as the topology has them.
  around: readonly (readonly [number, number])[];
  // How far apart the world's copies are, across, and down where it wraps over the poles.
  period: { u: number; v: number | null };
  // The model a set of models draws a kind of plant on this square with, by its id among every set's, or nothing,
  //  where it's drawn as the built-in set's: a tree as a set's, set where it's drawn.
  plantModel?(kind: PlantKind): string | null;
  // How far the model a set draws a kind of plant with reaches round its origin, for each of its height, where it's
  //  known: the room a plant of that kind takes, in place of the built-in set's shape's (`ROOM`).
  plantReach?(kind: PlantKind): number | null;
  // The rivers' courses through the square (`ReliefMap#coursesAt`): what's laid on it keeps clear of their channels,
  //  and its roads, railroads and the rest cross their water on bridges.
  rivers?: readonly RiverPath[];
  // How far apart the land's points are, across and down, where `heightAt` is the land as its mesh draws it (flat
  //  triangles between them, each cell split from its bottom left to its top right): what's laid flat on it is cut
  //  along its cells there (`cutAlong`), so it lies exactly its lift over it everywhere. Where it's not given, what's
  //  laid flat follows the land only at its own points.
  spacing?: readonly [across: number, down: number];
};

/**
 * The room a plant of `kind` takes at its usual size on `place`: as far as the model a set draws it with reaches, at
 *  the height it's drawn (`PLANT_HEIGHT`), or the built-in set's shape's room.
 */
export const roomOf = (place: OverlayPlace, kind: PlantKind): number => {
  const reach = place.plantReach?.(kind) ?? null;

  return reach === null ? ROOM[kind] : reach * PLANT_HEIGHT[kind];
};

/**
 * A chunk's overlay as three.js takes it: triangles, each point's normal and colour, relative to its corner; its haze,
 *  see-through, as smog over pollution: triangles, each point's colour and how solid it is (four numbers a point); and
 *  the plants a set of models draws, by the model: where each stands, relative to the corner, how tall it's drawn,
 *  which way it's turned, and its rank for thinning them (`PLANT_NUMBERS` numbers each).
 */
export type OverlayMesh = {
  u: number;
  v: number;
  positions: Float32Array;
  normals: Float32Array;
  colours: Float32Array;
  haze: { positions: Float32Array; colours: Float32Array };
  plants: { [model: string]: Float32Array };
};

/**
 * How many numbers each plant a set draws has in an overlay: where it stands (u, y, v), how tall, its turn, and its rank
 *  among its chunk's for thinning: its lattice's dither (`ditherRank` in `thinning.ts`), or, for a plant scattered
 *  about its square, a fraction from the square's seed.
 */
export const PLANT_NUMBERS = 6;

// Triangles as they're made: three numbers a point for each; the haze's, its colours four a point; and the plants a
//  set draws, `PLANT_NUMBERS` numbers each, by the model.
export type Soup = {
  positions: number[];
  normals: number[];
  colours: number[];
  haze: { positions: number[]; colours: number[] };
  plants: Map<string, number[]>;
};

/** An empty soup of triangles, for squares to be laid into one at a time. */
export const soup = (): Soup => ({
  positions: [],
  normals: [],
  colours: [],
  haze: { positions: [], colours: [] },
  plants: new Map(),
});

// How far over the land each kind is laid, so the later is over the earlier: fields, then roads, railroads, an
//  airbase's runway; each its own, so no two lie in one plane where they cross.
export const LIFT = {
  field: 0.01,
  ditch: 0.011,
  detail: 0.012,
  road: 0.014,
  // An airbase's apron, over a road it crosses, under a railroad's ballast.
  apron: 0.015,
  ballast: 0.016,
  sleeper: 0.018,
  rail: 0.02,
  // An airbase's runway and its markings, over a railroad that crosses it.
  runway: 0.022,
  marking: 0.024,
} as const;

/**
 * A bridge, where a road, railroad or an airbase's runway crosses a river's water (docs/3d-renderer.md §5.3): its deck
 *  is `clearance` over the water's surface, flat across it and `past` either side, then falls to the land as steeply
 *  as `slope`, for no more than `reach` further; and its walls stand `parapet` over the deck, `thick` thick, their
 *  inner faces from `under` under it: more than a route laid on the deck, sampled more coarsely than its walls, is ever
 *  off it where it bends, so no gap shows under them.
 */
export const BRIDGE = {
  clearance: 0.008,
  past: 0.03,
  slope: 0.35,
  reach: 0.1,
  parapet: 0.012,
  thick: 0.008,
  under: 0.005,
} as const;

/** How high over a river's water a fortress's wall leaves a gate for it, where the wall crosses it. */
export const WATER_GATE = 0.02;

// How long each length of a bridge's walls is, at most, so they follow the deck and the way it bends; and how long its
//  walls are at the least, where they're drawn at all, so a road just reaching over the water has none.
const WALL_PIECE = 0.03,
  WALL_SHORTEST = 0.06;

// How finely a draped strip follows the land: finer than the land's points are apart (0.125).
const STEP = 0.06,
  ROAD = '#8c7a58',
  BALLAST = '#5f5953',
  RAIL = '#a9abae',
  SLEEPER = '#5e432b',
  DITCH = '#4f87b0',
  FIELD = '#7da33f',
  FARMLAND = ['#c2b448', '#8fae3e'],
  STONE = '#9d968a',
  TARMAC = '#4a4c50',
  WOOD = '#6b4a2e',
  // A whale's spout.
  SPOUT = '#eef3f5',
  SPOIL = '#7a6a58',
  // A barn's walls and roof, a haystack, a silo, a mine's iron and its engine house's chimney, and a tunnel's mouth.
  BARN = '#8a3a2a',
  BARN_ROOF = '#4a3a32',
  // A farmhouse's walls and roof, its own, so a city's houses are told from it.
  FARMHOUSE = '#cdbf9f',
  FARM_ROOF = '#7a5a3a',
  STRAW = '#d4bc6a',
  SILO = '#b4b8bc',
  IRON = '#3a3a3a',
  // A railroad bridge's girders, and the concrete walls of an airbase's runway where it crosses a river.
  GIRDER = '#5d6268',
  CONCRETE = '#a3a29b',
  BRICK = '#8a5a44',
  MOUTH = '#141210',
  // A mountain's rock (as the land's, `Mountains`), where a tunnel's dug into it.
  HILLSIDE = '#77726a',
  THATCH = '#b89a5a',
  WALL = '#c9b48e',
  // A fortress's towers' roofs; an airbase's markings, its hangar's walls, roof and doors, and its control tower's
  //  glass.
  SLATE = '#5a5e68',
  MARKING = '#e8e8e8',
  HANGAR = '#8a9096',
  HANGAR_ROOF = '#a9afb5',
  DOOR = '#3a3e44',
  GLASS = '#2e3d48',
  SMOG = '#584b34';

/** How high smog hangs over the land, at its lowest and highest, in world units (a figure's about 0.15 tall). */
export const SMOG_LIFT = [0.07, 0.16] as const;

/** How far smog reaches from a square's middle, in its radius (as far as its nearest edge), past it so neighbours join. */
export const SMOG_REACH = 1.4;

// The shapes solids are made from: each a unit across, cut to size.
const box = new BoxGeometry(1, 1, 1),
  cylinder = new CylinderGeometry(0.5, 0.5, 1, 8),
  cone = new ConeGeometry(0.5, 1, 8),
  pyramid = new ConeGeometry(0.5, 1, 4),
  // A three-sided cylinder, a gabled roof lying along its length: its faces flat, each lit as one.
  prism = (() => {
    const made = new CylinderGeometry(0.5, 0.5, 1, 3).toNonIndexed();

    made.computeVertexNormals();

    return made;
  })(),
  sphere = new SphereGeometry(0.5, 8, 6),
  // Half a cylinder lying along z, its flat side down, from 0 up to a half: a hangar's vaulted roof.
  vault = (() => {
    const made = new CylinderGeometry(
      0.5,
      0.5,
      1,
      8,
      1,
      false,
      -Math.PI / 2,
      Math.PI
    );

    made.rotateX(-Math.PI / 2);

    return made;
  })(),
  // The top half of a sphere, from its middle up: a silo's roof.
  dome = new SphereGeometry(0.5, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2),
  // A wedge, its front face upright (towards +z), sloping from that face's top back to its bottom: the rock a tunnel's
  //  dug into. Its faces flat.
  wedge = (() => {
    const made = new ExtrudeGeometry(
      new Shape([
        new Vector2(0.5, -0.5),
        new Vector2(0.5, 0.5),
        new Vector2(-0.5, -0.5),
      ]),
      { depth: 1, bevelEnabled: false }
    );

    made.translate(0, 0, -0.5);
    made.rotateY(-Math.PI / 2);
    made.computeVertexNormals();

    return made;
  })(),
  // Plants are many, thousands to a chunk: few sides each, and no ends where nothing sees them.
  stem = new CylinderGeometry(0.5, 0.5, 1, 4, 1, true),
  tier = new ConeGeometry(0.5, 1, 5, 1, true),
  crown = new SphereGeometry(0.5, 5, 3),
  // A log, open at its ends, which its cut ends close, each a flat disc facing out.
  log = new CylinderGeometry(0.5, 0.5, 1, 8, 1, true),
  cutEnd = new CircleGeometry(0.5, 8);

// Where on a square its mine, hut, specials and farm stand, by seeded angle and how far out: plants keep clear of them.
const SPOTS = {
  mine: [3, 0.8],
  hut: [11, 0.64],
  special: (index: number): [number, number] => [index + 1, 0.85],
  farm: [7, 0.78],
} as const;

// How much room a mine and a farm's buildings take, as a special does (`SPECIAL_ROOMS`): big enough to be seen at
//  play's zoom, inside the square, the most there's room for, down to the last, drawn to fit.
const MINE_ROOMS = [0.15, 0.12, 0.1] as const,
  FARM_ROOMS = [0.13, 0.1, 0.08] as const;

// How far a road reaches either side of its middle, and a railroad's ballast.
const ROAD_HALF = 0.035,
  BALLAST_HALF = 0.05;

// A fortress's walls, how far out from the square's middle, in its radius, how thick and how tall over the highest of
//  the ground under them, and how wide a gate in them is with no road through it; its towers' radius and height; and
//  how far apart the merlons along the top of its walls are.
export const FORTRESS = {
  half: 0.62,
  thick: 0.03,
  tall: 0.05,
  gate: 0.08,
  tower: 0.035,
  towerTall: 0.09,
  merlons: 0.045,
} as const;

// A room's middle, and eight ways round its edge, a unit out: where it's asked whether all of it is out of the water.
const ROUND: readonly (readonly [number, number])[] = [
  [0, 0],
  ...Array.from(
    { length: 8 },
    (_, k) =>
      [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)] as const
  ),
];

// How much room a special takes round where it stands: a herd, a stack or a pile big enough to be seen at play's zoom,
//  as far from the square's middle as clears the unit's stand (`SPOTS.special`), and inside the square but for a little
//  (`EDGE_REACH`), so in one of its corners where there's room. Where there's less (roads, walls, a smaller square), it
//  takes the most there is, and is drawn smaller, down to the last.
const SPECIAL_ROOMS = [0.2, 0.16, 0.13, 0.1] as const,
  EDGE_REACH = 0.03;

// What stands on a square keeps this far, and its room, from the middle of its lines (half a road's width, and a
//  little), and from the middle of the square (the unit's stand, and a little); and how many angles round a claim tries.
const LINE_CLEAR = 0.05,
  STAND_CLEAR = 0.22,
  CLAIM_ANGLES = 72;

// A seeded fraction, the `n`th for a square's `seed`.
const fraction = (seed: number, n: number): number => {
  let h = Math.imul(seed ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b);

  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  return (h >>> 0) / 4294967296;
};

/** How far either side of a point the land's height is read for its normal. */
export const NORMAL_STEP = 0.05;
// Colours as three.js works in them, each worked out once.
const colours = new Map<string, [number, number, number]>();

const colourOf = (css: string): [number, number, number] => {
  let colour = colours.get(css);

  if (colour === undefined) {
    const { r, g, b } = new Color(css);

    colour = [r, g, b];
    colours.set(css, colour);
  }

  return colour;
};

// Each shape's triangles, a point at a time, worked out once: solids are copies of them, moved into place.
const triangles = new WeakMap<
  BufferGeometry,
  { positions: Float32Array; normals: Float32Array }
>();

const trianglesOf = (
  shape: BufferGeometry
): { positions: Float32Array; normals: Float32Array } => {
  let made = triangles.get(shape);

  if (made === undefined) {
    const flat = shape.index === null ? shape : shape.toNonIndexed();

    made = {
      positions: new Float32Array(flat.getAttribute('position').array),
      normals: new Float32Array(flat.getAttribute('normal').array),
    };
    triangles.set(shape, made);

    if (flat !== shape) {
      flat.dispose();
    }
  }

  return made;
};

// Worked in, a solid at a time.
const MATRIX = new Matrix4(),
  NORMALS = new Matrix3(),
  POSITION = new Vector3(),
  ROTATION = new Quaternion(),
  EULER = new Euler(),
  SCALE = new Vector3();

// A river through a square, for the bridges over it: its course, and a circle round all its bridges reach, past which
//  it's nothing: (`cu`, `cv`), and the radius.
type Water = { path: RiverPath; cu: number; cv: number; reach: number };

/** Lays shapes for one square into a soup of triangles. */
class Layer {
  readonly soup: Soup;
  readonly place: OverlayPlace;
  // The rivers' channels through the square, each line of each course with how far either side of it its channel's
  //  flat bed reaches (its water's width and `FLOOR`): what's laid on the square keeps clear of them, as of its lines.
  readonly channels: [
    readonly [number, number],
    readonly [number, number],
    number
  ][];

  // The rivers through the square, for the bridges over them.
  readonly #waters: Water[];

  constructor(soup: Soup, place: OverlayPlace) {
    this.soup = soup;
    this.place = place;
    this.#waters = (place.rivers ?? []).map((path) => {
      const { points, widths } = path,
        [su, sv] = points[0]!,
        [eu, ev] = points[points.length - 1]!,
        cu = (su + eu) / 2,
        cv = (sv + ev) / 2;

      return {
        path,
        cu,
        cv,
        reach:
          Math.max(
            ...points.map(
              ([u, v], at) => Math.hypot(u - cu, v - cv) + (widths[at] ?? 0)
            )
          ) +
          BRIDGE.past +
          BRIDGE.reach,
      };
    });
    this.channels = (place.rivers ?? []).flatMap(({ points, widths }) =>
      points
        .slice(1)
        .map(
          (
            to,
            at
          ): [readonly [number, number], readonly [number, number], number] => [
            points[at]!,
            to,
            Math.max(widths[at] ?? 0, widths[at + 1] ?? 0) + FLOOR,
          ]
        )
    );
  }

  // The land's height at a point; at sea, the water's surface.
  ground(u: number, v: number, afloat = false): number {
    const height = this.place.heightAt(u, v);

    return afloat ? Math.max(0, height) : height;
  }

  // Where (`u`, `v`) is by a river through the square, if its bridges reach it: its water's surface there and how far
  //  past its water's edge it is (less than none over its water), by where it falls along its course (`riverNear`).
  //  Its water lies on its bed, `RIVER_LIFT` over it, but never under the sea's level (`ribbons.ts`).
  #near(
    { path, cu, cv, reach }: Water,
    u: number,
    v: number
  ): [surface: number, beyond: number] | null {
    if ((u - cu) ** 2 + (v - cv) ** 2 >= reach * reach) {
      return null;
    }

    const [distance, width, level] = riverNear(path, u, v);

    return [Math.max(0, bedOf(level) + RIVER_LIFT), distance - width];
  }

  /**
   * How high a bridge's deck is at (`u`, `v`): `BRIDGE.clearance` over a river's water, across it and `BRIDGE.past`
   *  either side, then falling as steeply as `BRIDGE.slope`; the highest of the rivers' there, and none (`-Infinity`)
   *  where none reaches.
   */
  deckAt(u: number, v: number): number {
    let highest = -Infinity;

    for (const water of this.#waters) {
      const near = this.#near(water, u, v);

      if (near !== null) {
        const out = Math.max(0, near[1] - BRIDGE.past);

        if (out <= BRIDGE.reach) {
          highest = Math.max(
            highest,
            near[0] + BRIDGE.clearance - BRIDGE.slope * out
          );
        }
      }
    }

    return highest;
  }

  /** The water's surface at (`u`, `v`), where it's over a river's water or `BRIDGE.past` its edge; or none. */
  waterAt(u: number, v: number): number | null {
    let highest: number | null = null;

    for (const water of this.#waters) {
      const near = this.#near(water, u, v);

      if (near !== null && near[1] <= BRIDGE.past) {
        highest = Math.max(highest ?? -Infinity, near[0]);
      }
    }

    return highest;
  }

  /** Whether any river runs through the square, for a bridge over it. */
  get bridging(): boolean {
    return this.#waters.length > 0;
  }

  // The land's normal at a point, from its height either side; or a bridge's deck's, where it's on one, `deck` high at
  //  the point. A deck rises less than a unit for a unit along (`BRIDGE.slope` across its river, and its river's level
  //  falling as steeply as about 0.75 along it, under 0.83 together, since #1391), so where it's further under the land
  //  either side than the step to it, it's under the land there too, and needn't be asked. Not so just past a deck's
  //  reach, where it's none, where another river's cut the land far lower than its own: there a normal can miss the
  //  deck beside it; nor where a river's level climbs, as it does in places till they're ordered downhill (#1388),
  //  more steeply than that.
  #normal(u: number, v: number, deck = -Infinity): [number, number, number] {
    const e = NORMAL_STEP;
    let east = this.place.heightAt(u + e, v),
      west = this.place.heightAt(u - e, v),
      south = this.place.heightAt(u, v + e),
      north = this.place.heightAt(u, v - e);

    if (deck + e >= Math.min(east, west, south, north)) {
      east = Math.max(east, this.deckAt(u + e, v));
      west = Math.max(west, this.deckAt(u - e, v));
      south = Math.max(south, this.deckAt(u, v + e));
      north = Math.max(north, this.deckAt(u, v - e));
    }

    const du = (east - west) / (2 * e),
      dv = (south - north) / (2 * e),
      length = Math.hypot(du, 1, dv);

    return [-du / length, 1 / length, -dv / length];
  }

  // Each point laid on a bridge's deck, or where one might be, as it's worked out once: how high, and its normal, by
  //  where it is, across then down. Strips' and ribbons' triangles share their corners, so each is laid several times.
  readonly #decked = new Map<
    number,
    Map<number, [height: number, nx: number, ny: number, nz: number]>
  >();

  #point(
    u: number,
    v: number,
    lift: number,
    colour: [number, number, number],
    bridged = false
  ): void {
    if (!bridged || !this.bridging) {
      this.soup.positions.push(u, this.ground(u, v) + lift, v);
      this.soup.normals.push(...this.#normal(u, v));
      this.soup.colours.push(...colour);

      return;
    }

    let across = this.#decked.get(u);

    if (across === undefined) {
      across = new Map();
      this.#decked.set(u, across);
    }

    let at = across.get(v);

    if (at === undefined) {
      const deck = this.deckAt(u, v);

      at = [Math.max(this.ground(u, v), deck), ...this.#normal(u, v, deck)];
      across.set(v, at);
    }

    this.soup.positions.push(u, at[0] + lift, v);
    this.soup.normals.push(at[1], at[2], at[3]);
    this.soup.colours.push(...colour);
  }

  // How far apart what's laid flat must have points of its own, to follow what it lies on: nothing, where it's cut
  //  along the land's cells (`#flat`) and so lies exactly on it however far apart they are; but `STEP` for a route
  //  that may be on a bridge's deck (anywhere on a square a river reaches into), as a deck is curved, not flat
  //  between the land's points, or where the land's cells aren't known.
  #step(bridged: boolean): number {
    return this.place.spacing === undefined || (bridged && this.bridging)
      ? STEP
      : Infinity;
  }

  // A shape laid flat on the land, its corners anticlockwise seen from above and convex, `lift` over it: cut along the
  //  land's cells where they're known (`OverlayPlace#spacing`), so each piece lies over one of its triangles and the
  //  whole of it exactly `lift` over the land, not only at its corners; over a bridge's deck where it's `bridged`.
  //  Where they're not known, a fan of triangles from its first corner.
  #flat(
    corners: readonly (readonly [number, number])[],
    lift: number,
    colour: [number, number, number],
    bridged: boolean
  ): void {
    const spacing = this.place.spacing,
      pieces =
        spacing === undefined
          ? [corners]
          : cutAlong(corners, spacing[0], spacing[1]);

    pieces.forEach((piece) => {
      for (let at = 1; at + 1 < piece.length; at++) {
        const [pu, pv] = piece[0]!,
          [qu, qv] = piece[at]!,
          [ru, rv] = piece[at + 1]!;

        // None with no area, where a cut runs through a corner.
        if (Math.abs((qu - pu) * (rv - pv) - (qv - pv) * (ru - pu)) < 1e-12) {
          continue;
        }

        this.#point(pu, pv, lift, colour, bridged);
        this.#point(qu, qv, lift, colour, bridged);
        this.#point(ru, rv, lift, colour, bridged);
      }
    });
  }

  // A cell of a strip or a ribbon laid flat on the land, `lift` over it: from (`a`) to (`b`) along its left edge, and
  //  (`c`) to (`d`) along its right, so anticlockwise seen from above it's `a`, `b`, `d`, `c`. Two triangles where the
  //  land's cells aren't known, or where it's bent so it isn't convex; one shape, cut along the land's cells, where
  //  they are, as it's fewer pieces than its two triangles cut apart.
  #cell(
    a: readonly [number, number],
    b: readonly [number, number],
    c: readonly [number, number],
    d: readonly [number, number],
    lift: number,
    colour: [number, number, number],
    bridged: boolean
  ): void {
    const round = [a, b, d, c],
      turns = round.map(([u, v], at) => {
        const [bu, bv] = round[(at + 1) % 4]!,
          [cu, cv] = round[(at + 2) % 4]!;

        return (bu - u) * (cv - bv) - (bv - v) * (cu - bu);
      });

    if (
      this.place.spacing !== undefined &&
      (turns.every((turn) => turn > 0) || turns.every((turn) => turn < 0))
    ) {
      this.#flat(round, lift, colour, bridged);

      return;
    }

    this.#flat([a, b, c], lift, colour, bridged);
    this.#flat([b, d, c], lift, colour, bridged);
  }

  /**
   * A strip `width` wide draped over the land from one point to another, `lift` over it: over a bridge's deck where
   *  it's `bridged` and crosses a river.
   */
  strip(
    from: readonly [number, number],
    to: readonly [number, number],
    width: number,
    css: string,
    lift: number,
    bridged = false
  ): void {
    const colour = colourOf(css),
      length = Math.hypot(to[0] - from[0], to[1] - from[1]);

    if (length === 0) {
      return;
    }

    // Cut along it and across it finer than the land's points are apart where it's not cut along the land's own
    //  cells, or it's on a bridge's deck, which isn't flat between them (`#step`), so it follows them between too.
    const step = this.#step(bridged),
      steps = Math.max(1, Math.ceil(length / step)),
      strands = Math.max(1, Math.ceil(width / step)),
      // Across the strip, from its right edge to its left.
      side = [
        (-(to[1] - from[1]) / length) * width,
        ((to[0] - from[0]) / length) * width,
      ],
      at = (t: number, w: number): [number, number] => [
        from[0] + (to[0] - from[0]) * t + side[0]! * (w - 0.5),
        from[1] + (to[1] - from[1]) * t + side[1]! * (w - 0.5),
      ];

    for (let step = 0; step < steps; step++) {
      for (let strand = 0; strand < strands; strand++) {
        const [u0, v0] = at(step / steps, (strand + 1) / strands),
          [u1, v1] = at((step + 1) / steps, (strand + 1) / strands),
          [u2, v2] = at(step / steps, strand / strands),
          [u3, v3] = at((step + 1) / steps, strand / strands);

        // Wound anticlockwise seen from above (`v` runs south), so it faces up and isn't culled.
        this.#cell(
          [u0, v0],
          [u1, v1],
          [u2, v2],
          [u3, v3],
          lift,
          colour,
          bridged
        );
      }
    }
  }

  /**
   * A ribbon `width` wide draped over the land along `points`, `lift` over it: across it at each point square to the
   *  way it goes there (`ways`, or from the point before to the one after), so it bends with no notch on the outside of
   *  a bend, as strips end to end would leave. Over a bridge's deck where it's `bridged` and crosses a river.
   */
  ribbon(
    points: readonly (readonly [number, number])[],
    width: number,
    css: string,
    lift: number,
    ways?: readonly (readonly [number, number])[],
    bridged = false
  ): void {
    const colour = colourOf(css),
      // Across it at each point, from its right edge to its left, square to the way it goes there.
      sides = points.map((point, index) => {
        const before = points[index - 1] ?? point,
          after = points[index + 1] ?? point,
          [du, dv] = ways?.[index] ?? [
            after[0] - before[0],
            after[1] - before[1],
          ],
          length = Math.hypot(du, dv);

        return length === 0
          ? ([0, 0] as const)
          : ([(-dv / length) * width, (du / length) * width] as const);
      });

    for (let index = 0; index + 1 < points.length; index++) {
      const from = points[index]!,
        to = points[index + 1]!,
        fromSide = sides[index]!,
        toSide = sides[index + 1]!,
        length = Math.hypot(to[0] - from[0], to[1] - from[1]);

      if (length === 0) {
        continue;
      }

      // Cut along it and across it finer than the land's points are apart where it's not cut along the land's own
      //  cells, or it's on a bridge's deck (`#step`), so it follows them between too.
      const step = this.#step(bridged),
        steps = Math.max(1, Math.ceil(length / step)),
        strands = Math.max(1, Math.ceil(width / step)),
        at = (t: number, w: number): [number, number] => [
          from[0] +
            (to[0] - from[0]) * t +
            (fromSide[0] + (toSide[0] - fromSide[0]) * t) * (w - 0.5),
          from[1] +
            (to[1] - from[1]) * t +
            (fromSide[1] + (toSide[1] - fromSide[1]) * t) * (w - 0.5),
        ];

      for (let step = 0; step < steps; step++) {
        for (let strand = 0; strand < strands; strand++) {
          const [u0, v0] = at(step / steps, (strand + 1) / strands),
            [u1, v1] = at((step + 1) / steps, (strand + 1) / strands),
            [u2, v2] = at(step / steps, strand / strands),
            [u3, v3] = at((step + 1) / steps, strand / strands);

          // Wound as a strip's are, facing up.
          this.#cell(
            [u0, v0],
            [u1, v1],
            [u2, v2],
            [u3, v3],
            lift,
            colour,
            bridged
          );
        }
      }
    }
  }

  /**
   * A haze `radius` across hanging over the land round `centre`, `lift` over it, following it: as solid as `alpha` at
   *  its middle, thinning to nothing at its edge, in wisps (`seed`), see-through, so the land shows through it. Past
   *  the shore it rides the water's surface rather than the sea's floor. Its spokes no further apart at its edge than
   *  its rings, so it follows a slope rather than cutting into it.
   */
  haze(
    centre: readonly [number, number],
    radius: number,
    css: string,
    alpha: number,
    lift: number,
    seed: number
  ): void {
    const [r, g, b] = colourOf(css),
      [u, v] = centre,
      rings = Math.max(2, Math.ceil(radius / STEP)),
      sides = Math.max(14, Math.ceil((2 * Math.PI * radius) / STEP)),
      at = (ring: number, side: number): [number, number] => {
        const angle = (side / sides) * Math.PI * 2,
          out = (ring / rings) * radius;

        return [u + Math.cos(angle) * out, v + Math.sin(angle) * out];
      },
      // Thick in the middle, thinning smoothly to nothing at the edge (its last ring), each point a little thicker or
      //  thinner.
      solid = (ring: number, side: number): number => {
        const out = ring / rings,
          falls = (1 - out * out) ** 1.5,
          wisp = 0.65 + 0.35 * fraction(seed, ring * 97 + (side % sides));

        return alpha * falls * wisp;
      },
      point = (ring: number, side: number): void => {
        const [pu, pv] = ring === 0 ? [u, v] : at(ring, side);

        this.soup.haze.positions.push(pu, this.ground(pu, pv, true) + lift, pv);
        this.soup.haze.colours.push(r, g, b, solid(ring, side));
      };

    for (let ring = 0; ring < rings; ring++) {
      for (let side = 0; side < sides; side++) {
        if (ring === 0) {
          point(0, 0);
          point(1, side + 1);
          point(1, side);
        } else {
          point(ring, side);
          point(ring, side + 1);
          point(ring + 1, side);
          point(ring, side + 1);
          point(ring + 1, side + 1);
          point(ring + 1, side);
        }
      }
    }
  }

  /**
   * A disc `radius` across draped over the land round `centre`, `lift` over it: over a bridge's deck where it's
   *  `bridged` and over a river.
   */
  disc(
    centre: readonly [number, number],
    radius: number,
    css: string,
    lift: number,
    sides = 12,
    bridged = false
  ): void {
    const colour = colourOf(css),
      [u, v] = centre,
      // In rings no further apart than the land's points where it's not cut along the land's own cells, or it's on a
      //  bridge's deck (`#step`), so a wide one follows the land too.
      rings = Math.max(1, Math.ceil(radius / this.#step(bridged))),
      at = (ring: number, side: number): [number, number] => {
        const angle = (side / sides) * Math.PI * 2,
          out = (ring / rings) * radius;

        return [u + Math.cos(angle) * out, v + Math.sin(angle) * out];
      };

    for (let ring = 0; ring < rings; ring++) {
      for (let side = 0; side < sides; side++) {
        const outerA = at(ring + 1, side),
          outerB = at(ring + 1, side + 1);

        if (ring === 0) {
          this.#flat([[u, v], outerB, outerA], lift, colour, bridged);
        } else {
          const innerA = at(ring, side),
            innerB = at(ring, side + 1);

          this.#flat([innerA, innerB, outerA], lift, colour, bridged);
          this.#flat([innerB, outerB, outerA], lift, colour, bridged);
        }
      }
    }
  }

  /**
   * A flat four-sided face, its corners in order round it, facing `normal` (a unit long): two triangles, wound to face
   *  that way, so they're drawn from that side.
   */
  face(
    corners: readonly (readonly [number, number, number])[],
    normal: readonly [number, number, number],
    colour: readonly [number, number, number]
  ): void {
    const [a, b, c, d] = corners as [
        readonly [number, number, number],
        readonly [number, number, number],
        readonly [number, number, number],
        readonly [number, number, number]
      ],
      // Which way the first triangle faces as its corners are given: anticlockwise, seen from the side it faces.
      e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
      facing =
        (e1[1]! * e2[2]! - e1[2]! * e2[1]!) * normal[0] +
        (e1[2]! * e2[0]! - e1[0]! * e2[2]!) * normal[1] +
        (e1[0]! * e2[1]! - e1[1]! * e2[0]!) * normal[2],
      order = facing >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];

    order.forEach((corner) => {
      this.soup.positions.push(...corner);
      this.soup.normals.push(...normal);
      this.soup.colours.push(...colour);
    });
  }

  /** A solid made of `shape`, its middle at (`u`, `y`, `v`), as big as `size`, turned by `turn`. */
  solid(
    shape: BufferGeometry,
    at: readonly [number, number, number],
    size: readonly [number, number, number],
    css: string,
    turn: readonly [number, number, number] = [0, 0, 0],
    order: EulerOrder = 'XYZ'
  ): void {
    const { positions, normals } = trianglesOf(shape),
      matrix = MATRIX.compose(
        POSITION.set(...at),
        ROTATION.setFromEuler(EULER.set(...turn, order)),
        SCALE.set(...size)
      ),
      e = matrix.elements,
      n = NORMALS.getNormalMatrix(matrix).elements,
      [r, g, b] = colourOf(css),
      soup = this.soup;

    // Each point moved into place, and its normal turned with it: no geometry made for it, as a chunk lays thousands.
    for (let at = 0; at < positions.length; at += 3) {
      const x = positions[at]!,
        y = positions[at + 1]!,
        z = positions[at + 2]!,
        nx = normals[at]!,
        ny = normals[at + 1]!,
        nz = normals[at + 2]!,
        tx = n[0]! * nx + n[3]! * ny + n[6]! * nz,
        ty = n[1]! * nx + n[4]! * ny + n[7]! * nz,
        tz = n[2]! * nx + n[5]! * ny + n[8]! * nz,
        length = Math.hypot(tx, ty, tz) || 1;

      soup.positions.push(
        e[0]! * x + e[4]! * y + e[8]! * z + e[12]!,
        e[1]! * x + e[5]! * y + e[9]! * z + e[13]!,
        e[2]! * x + e[6]! * y + e[10]! * z + e[14]!
      );
      soup.normals.push(tx / length, ty / length, tz / length);
      soup.colours.push(r, g, b);
    }
  }

  /** A point `distance` of the square's reach from its middle, at its `n`th seeded angle. */
  spot(n: number, distance: number): [number, number] {
    const angle = fraction(this.place.seed, n) * Math.PI * 2,
      [u, v] = this.place.centre;

    return [
      u + Math.cos(angle) * distance * this.place.radius,
      v + Math.sin(angle) * distance * this.place.radius,
    ];
  }

  // The lines across the square that what stands on it keeps clear of: its roads and railroads, a fortress's walls,
  //  an airbase's runway. And what stands there already: where, and how much room it takes.
  readonly lines: [readonly [number, number], readonly [number, number]][] = [];
  // Its roads and railroads among them, each from its middle out one way, keyed by that way: the houses of a city beside
  //  it line them. And the roads past its corners, which they keep clear of too.
  readonly runs: Run[] = [];
  readonly past: [readonly [number, number], readonly [number, number]][] = [];
  // What bridges' walls open for as they do for the square's roads and railroads: an airbase's runway and its apron,
  //  and a road or railroad on its own, which isn't one of its runs. And roads' and railroads' bridges' walls, laid
  //  last, once all of those are known.
  readonly crossings: Run[] = [];
  readonly later: (() => void)[] = [];
  readonly taken: [number, number, number][] = [];
  // Where each plant grown stands, and what it is.
  readonly grown: [number, number, PlantKind][] = [];

  /**
   * How much more than it needs something taking `room` at (`u`, `v`) has clear: of the square's lines, of its rivers'
   *  channels, of what stands there already, and of the unit's stand at its middle, the least of them; and, if it's to
   *  stay `inside`, of the square's edge, but for `EDGE_REACH`. Less than none where it hasn't enough.
   */
  clearance(
    u: number,
    v: number,
    room: number,
    inside = false,
    stand = STAND_CLEAR
  ): number {
    const [cu, cv] = this.place.centre,
      { outline } = this.place;
    let least = Math.hypot(u - cu, v - cv) - stand - room;

    this.lines.forEach(([a, b]) => {
      least = Math.min(least, distanceTo(u, v, a, b) - LINE_CLEAR - room);
    });
    this.channels.forEach(([a, b, reach]) => {
      least = Math.min(least, distanceTo(u, v, a, b) - reach - room);
    });
    this.taken.forEach(([tu, tv, other]) => {
      least = Math.min(least, Math.hypot(u - tu, v - tv) - other - room);
    });

    if (inside) {
      // How far inside the edge, or past it, less than none.
      const edge =
        Math.min(
          ...outline.map((corner, index) =>
            distanceTo(u, v, corner, outline[(index + 1) % outline.length]!)
          )
        ) * (this.place.owns(u, v) ? 1 : -1);

      least = Math.min(least, edge + EDGE_REACH - room);
    }

    return least;
  }

  /**
   * Whether (`u`, `v`) has `room` clear of the square's lines, of its rivers' channels, of what stands there already,
   *  and of the stand, by `stand` from the middle.
   */
  hasRoom(u: number, v: number, room: number, stand = STAND_CLEAR): boolean {
    return this.clearance(u, v, room, false, stand) >= 0;
  }

  /**
   * A place for something taking `room`, about `distance` of the square's reach from its middle, taken for it: the
   *  first with room for it of 72 angles round from its `n`th seeded one, at that distance, then a little nearer, then a
   *  little further. Where none has room (a fortress's walls, or roads every way), the one with the most.
   */
  claim(n: number, distance: number, room: number): [number, number] {
    const { at } = this.#search(n, distance, room);

    this.taken.push([at[0], at[1], room]);

    return at;
  }

  /**
   * A place for something taking the most of `rooms` (largest first) it has room for inside the square, but for
   *  `EDGE_REACH`, taken for it, with the room it takes: as `claim`, but trying a ring a little nearer in too, and the
   *  last of `rooms` where none has room for any. Only where it's `dry`, if that's asked, and none where nowhere is.
   */
  claimMost(
    n: number,
    distance: number,
    rooms: readonly number[]
  ): [number, number, number];
  claimMost(
    n: number,
    distance: number,
    rooms: readonly number[],
    dry: (u: number, v: number, room: number) => boolean
  ): [number, number, number] | null;
  claimMost(
    n: number,
    distance: number,
    rooms: readonly number[],
    dry?: (u: number, v: number, room: number) => boolean
  ): [number, number, number] | null {
    let found = this.#search(n, distance, rooms[0]!, true, dry),
      room = rooms[0]!;

    for (const each of rooms.slice(1)) {
      if (found.clear >= 0) {
        break;
      }

      found = this.#search(n, distance, each, true, dry);
      room = each;
    }

    if (found.clear === -Infinity) {
      return null;
    }

    this.taken.push([found.at[0], found.at[1], room]);

    return [found.at[0], found.at[1], room];
  }

  // The first place with room, as `claim` tries them, or the one with the most, and how much it has to spare: of those
  //  `dry`, if that's asked, and none to spare (`-Infinity`) where none is.
  #search(
    n: number,
    distance: number,
    room: number,
    inside = false,
    dry?: (u: number, v: number, room: number) => boolean
  ): { at: [number, number]; clear: number } {
    const first = fraction(this.place.seed, n) * Math.PI * 2,
      [u, v] = this.place.centre;
    let best: [number, number] = [u, v],
      most = -Infinity;

    // Inside a square, a ring a little nearer than the first too, where a hex's corners have the most room.
    for (const out of inside
      ? [distance, distance * 0.94, distance * 0.88, distance * 1.1]
      : [distance, distance * 0.88, distance * 1.1]) {
      for (let k = 0; k < CLAIM_ANGLES; k++) {
        const angle = first + (k / CLAIM_ANGLES) * Math.PI * 2,
          at: [number, number] = [
            u + Math.cos(angle) * out * this.place.radius,
            v + Math.sin(angle) * out * this.place.radius,
          ],
          clear = this.clearance(at[0], at[1], room, inside);

        // Only where it'd be taken is it asked whether it's dry, as that's dearer.
        if (
          (clear >= 0 || clear > most) &&
          dry !== undefined &&
          !dry(at[0], at[1], room)
        ) {
          continue;
        }

        if (clear >= 0) {
          return { at, clear };
        }

        if (clear > most) {
          best = at;
          most = clear;
        }
      }
    }

    return { at: best, clear: most };
  }
}

// Halfway to a neighbour: the neighbour lays the other half.
const halfway = (
  place: Pick<OverlayPlace, 'centre' | 'toward'>,
  offset: readonly [number, number]
): [number, number] => {
  const [u, v] = place.centre,
    [nu, nv] = place.toward(offset);

  return [(u + nu) / 2, (v + nv) / 2];
};

// A road or railroad that joins nothing, and isn't on its own (beside a city, under a railroad), isn't drawn, as on the
//  2D map.
const drawn = (route: Route): boolean => route.alone || route.joins.length > 0;

/** How far a road's half bows from the straight line at most, as a share of its length. */
export const ROAD_BOW = 0.09;

// How many pieces a road's half is drawn in, along its bend, at the fewest: more where it's long, so each is shorter
//  than a draped strip's step, and the ribbon needn't cut them again.
const ROAD_PIECES = 8;

// How little a road through a square turns at its middle, as the cosine of the angle between the ways its halves go,
//  in and out, for its bridges' walls to be one, mitred there: a road straight through, however its halves bow.
const THROUGH = 0.3;

// The keys of what bridges' walls open for that isn't one of a square's runs (`Layer#crossings`): its own, apart from
//  the runs' (`wayIndex`, 300 and more).
const RUNWAY_KEY = 0,
  APRON_KEY = 1,
  ALONE_ROAD = 2,
  ALONE_RAILROAD = 3;

// A number of the square's own for each way out of it.
const wayIndex = ([du, dv]: readonly [number, number]): number =>
  300 + (du + 3) * 7 + (dv + 3);

/**
 * The half of a road from a square's middle towards its neighbour `offset` away (`halfway` there, which the neighbour
 *  lays the other half from), as points along it, from the middle: a lane rather than a ruler's line, bowing a seeded
 *  way and as far as `ROAD_BOW` from the straight line, each way out of each square its own, as the pixel art's roads
 *  bend. It leaves the middle bowed and comes to the edge along the straight line, so it meets the neighbour's half,
 *  which does the same, smoothly, at the same point, and it stays on its own square.
 */
export const roadHalf = (
  place: Pick<OverlayPlace, 'centre' | 'toward' | 'seed'>,
  offset: readonly [number, number]
): { points: [number, number][]; ways: [number, number][] } => {
  const [u, v] = place.centre,
    [mu, mv] = halfway(place, offset),
    du = mu - u,
    dv = mv - v,
    length = Math.hypot(du, dv);

  if (length === 0) {
    return { points: [[u, v]], ways: [[0, 0]] };
  }

  // A cubic: its first handle a third of the way along, out to the side (a cubic's bow there is 4/9 of its handle's
  //  reach); its second two thirds along, on the line, so it ends along it.
  const reach =
      ((fraction(place.seed, wayIndex(offset)) * 2 - 1) * ROAD_BOW * length) /
      (4 / 9),
    side = [-dv / length, du / length],
    handle = [u + du / 3 + side[0]! * reach, v + dv / 3 + side[1]! * reach],
    later = [u + (du * 2) / 3, v + (dv * 2) / 3];

  const pieces = Math.max(ROAD_PIECES, Math.ceil((length * 1.02) / STEP)),
    ts = Array.from({ length: pieces + 1 }, (_, index) => index / pieces);

  return {
    points: ts.map((t) => {
      const a = (1 - t) ** 3,
        b = 3 * (1 - t) ** 2 * t,
        c = 3 * (1 - t) * t ** 2,
        d = t ** 3;

      return [
        a * u + b * handle[0]! + c * later[0]! + d * mu,
        a * v + b * handle[1]! + c * later[1]! + d * mv,
      ];
    }),
    // The way it goes at each point, the curve's own, so its last is along the straight line exactly.
    ways: ts.map((t) => {
      const a = 3 * (1 - t) ** 2,
        b = 6 * (1 - t) * t,
        c = 3 * t ** 2,
        wu =
          a * (handle[0]! - u) +
          b * (later[0]! - handle[0]!) +
          c * (mu - later[0]!),
        wv =
          a * (handle[1]! - v) +
          b * (later[1]! - handle[1]!) +
          c * (mv - later[1]!),
        size = Math.hypot(wu, wv);

      return size === 0 ? [du / length, dv / length] : [wu / size, wv / size];
    }),
  };
};

const road = (layer: Layer, route: Route): void => {
  const { place } = layer;

  if (!drawn(route)) {
    return;
  }

  const halves = route.joins.map((offset) => roadHalf(place, offset)),
    keys = route.joins.map(wayIndex);

  halves.forEach(({ points, ways }) =>
    layer.ribbon(points, ROAD_HALF * 2, ROAD, LIFT.road, ways, true)
  );

  // Its bridges' walls. Through the square, where its two halves turn no more than `THROUGH` at its middle, both
  //  halves' as one, from one edge to the other, mitred at its middle, so they meet; otherwise each half's, open where
  //  they meet.
  const [a, b] = halves,
    // Which way it comes in to its middle along its first half, and which way it goes out along its second.
    [inU, inV] = a === undefined ? [0, 0] : [-a.ways[0]![0], -a.ways[0]![1]],
    [outU, outV] = b?.ways[0] ?? [0, 0],
    through = halves.length === 2 && inU * outU + inV * outV >= THROUGH;

  if (through) {
    const [iu, iv] = leftOf([inU, inV]),
      [ou, ov] = leftOf([outU, outV]),
      // On both edges: as far along their sides' sum as makes it a unit along each.
      mitre = 1 + iu * ou + iv * ov;

    layer.later.push(() =>
      bridgeWalls(
        layer,
        [...[...a!.points].reverse(), ...b!.points.slice(1)],
        ROAD_HALF,
        LIFT.road,
        STONE,
        [
          ...layer.runs.filter(({ key }) => key !== keys[0] && key !== keys[1]),
          ...layer.crossings,
        ],
        [
          ...a!.ways
            .slice(1)
            .reverse()
            .map(([u, v]) => leftOf([-u, -v])),
          [(iu + ou) / mitre, (iv + ov) / mitre],
          ...b!.ways.slice(1).map(leftOf),
        ]
      )
    );
  } else {
    halves.forEach(({ points, ways }, index) =>
      layer.later.push(() =>
        bridgeWalls(
          layer,
          points,
          ROAD_HALF,
          LIFT.road,
          STONE,
          [
            ...layer.runs.filter(({ key }) => key !== keys[index]),
            ...layer.crossings,
          ],
          ways.map(leftOf)
        )
      )
    );
  }

  // On its own, its disc's what others' walls open for.
  if (route.alone) {
    layer.crossings.push({
      key: ALONE_ROAD,
      points: [place.centre, place.centre],
      half: 0.09,
    });
  }

  layer.disc(
    place.centre,
    route.alone ? 0.09 : 0.035,
    ROAD,
    LIFT.road,
    12,
    true
  );
};

const railroad = (layer: Layer, route: Route): void => {
  if (!drawn(route)) {
    return;
  }

  const { place } = layer,
    // Alone, a short length of it across the square.
    ends: [number, number][] = route.alone
      ? [
          [place.centre[0] + 0.12, place.centre[1]],
          [place.centre[0] - 0.12, place.centre[1]],
        ]
      : route.joins.map((offset) => halfway(place, offset)),
    // Each length's key among the square's runs, so its bridge's walls open only for the others.
    keys = route.alone
      ? []
      : route.joins.map((offset) => wayIndex(offset) + 100);

  // On its own, what others' walls open for.
  if (route.alone) {
    layer.crossings.push({
      key: ALONE_RAILROAD,
      points: [ends[0]!, ends[1]!],
      half: BALLAST_HALF,
    });
  }

  ends.forEach((end, index) => {
    const [u, v] = place.centre,
      length = Math.hypot(end[0] - u, end[1] - v),
      // Across the line, a rail's distance from its middle.
      side: [number, number] =
        length === 0
          ? [0, 0]
          : [(-(end[1] - v) / length) * 0.025, ((end[0] - u) / length) * 0.025];

    layer.strip(
      place.centre,
      end,
      BALLAST_HALF * 2,
      BALLAST,
      LIFT.ballast,
      true
    );
    layer.later.push(() =>
      bridgeWalls(
        layer,
        [place.centre, end],
        BALLAST_HALF,
        LIFT.ballast,
        GIRDER,
        [
          ...layer.runs.filter((run) => run.key !== keys[index]),
          ...layer.crossings.filter(({ key }) => key !== ALONE_RAILROAD),
        ]
      )
    );

    // Sleepers across it, then the two rails over them.
    for (let t = 0.1; t < 1; t += 0.2) {
      const at: [number, number] = [u + (end[0] - u) * t, v + (end[1] - v) * t];

      layer.strip(
        [at[0] + side[0] * 1.8, at[1] + side[1] * 1.8],
        [at[0] - side[0] * 1.8, at[1] - side[1] * 1.8],
        0.014,
        SLEEPER,
        LIFT.sleeper,
        true
      );
    }

    [1, -1].forEach((way) =>
      layer.strip(
        [u + side[0] * way, v + side[1] * way],
        [end[0] + side[0] * way, end[1] + side[1] * way],
        0.01,
        RAIL,
        LIFT.rail,
        true
      )
    );
  });

  layer.disc(place.centre, 0.05, BALLAST, LIFT.ballast, 12, true);
};

// The shortest piece of a row of crops left between houses, or at its end: shorter, it's left out.
const SHORTEST_ROW = 0.04;

/**
 * What's left of the run from `from` to `to`, along a row across the square at `v`, `width` across, clear of the
 *  `houses` (footprints) by `GAP`: the pieces between them, each at least `SHORTEST_ROW` long.
 */
export const rowAround = (
  from: number,
  to: number,
  v: number,
  width: number,
  houses: readonly (readonly (readonly [number, number])[])[],
  channels: readonly (readonly [
    readonly [number, number],
    readonly [number, number],
    number
  ])[] = []
): [number, number][] => {
  const blocked = [
      ...houses
        .filter(
          (corners) =>
            Math.min(...corners.map(([, cv]) => cv)) - GAP < v + width / 2 &&
            Math.max(...corners.map(([, cv]) => cv)) + GAP > v - width / 2
        )
        .map((corners): [number, number] => [
          Math.min(...corners.map(([cu]) => cu)) - GAP,
          Math.max(...corners.map(([cu]) => cu)) + GAP,
        ]),
      ...channels.flatMap(([a, b, reach]) => {
        const across = channelAcross(a, b, reach, v, width);

        return across === null ? [] : [across];
      }),
    ].sort((a, b) => a[0] - b[0]),
    pieces: [number, number][] = [];
  let start = from;

  blocked.forEach(([a, b]) => {
    if (a - start >= SHORTEST_ROW) {
      pieces.push([start, Math.min(a, to)]);
    }

    start = Math.max(start, b);
  });

  if (to - start >= SHORTEST_ROW) {
    pieces.push([start, to]);
  }

  return pieces.filter(([a, b]) => b - a >= SHORTEST_ROW);
};

// Where `slope · u + offset` is between `low` and `high`, along a line: all of it, none, or between two `u`.
const between = (
  slope: number,
  offset: number,
  low: number,
  high: number
): [number, number] | null => {
  if (slope === 0) {
    return offset >= low && offset <= high ? [-Infinity, Infinity] : null;
  }

  const p = (low - offset) / slope,
    q = (high - offset) / slope;

  return [Math.min(p, q), Math.max(p, q)];
};

/**
 * How far across a row `width` wide along `v` a river's channel crosses it, from `a` to `b` and `reach` either side,
 *  with `GAP` either end: or nowhere. Its crossing of each of five lines down the row, its edges and between: on each,
 *  where it meets the channel's round ends, and the band between them, all one, as the channel's convex.
 */
export const channelAcross = (
  a: readonly [number, number],
  b: readonly [number, number],
  reach: number,
  v: number,
  width: number
): [number, number] | null => {
  const du = b[0] - a[0],
    dv = b[1] - a[1],
    length = Math.hypot(du, dv);
  let low = Infinity,
    high = -Infinity;

  const take = (span: readonly [number, number] | null): void => {
    if (span !== null && span[0] <= span[1]) {
      low = Math.min(low, span[0]);
      high = Math.max(high, span[1]);
    }
  };

  [-0.5, -0.25, 0, 0.25, 0.5].forEach((share) => {
    const line = v + width * share;

    // Its round ends.
    [a, b].forEach(([cu, cv]) => {
      const half = reach * reach - (line - cv) ** 2;

      take(half < 0 ? null : [cu - Math.sqrt(half), cu + Math.sqrt(half)]);
    });

    if (length === 0) {
      return;
    }

    // The band between them: how far along the line from `a` to `b` a point is, from 0 to 1, and how far across it,
    //  within `reach` either way; each straight along the row.
    const along = between(
        du / length ** 2,
        ((line - a[1]) * dv - a[0] * du) / length ** 2,
        0,
        1
      ),
      across = between(
        dv / length,
        (-a[0] * dv - (line - a[1]) * du) / length,
        -reach,
        reach
      );

    take(
      along === null || across === null
        ? null
        : [Math.max(along[0], across[0]), Math.min(along[1], across[1])]
    );
  });

  return low === Infinity ? null : [low - GAP, high + GAP];
};

// Rows of crops across the square, with ditches between them: more rows, and yellower, for farmland. They give way to a
//  city's houses on the square, stopping short of them, and to the rivers through it, stopping short of their channels.
const fields = (
  layer: Layer,
  kind: 'irrigation' | 'farmland',
  houses: readonly (readonly (readonly [number, number])[])[]
): void => {
  const { centre, inner } = layer.place,
    rows = kind === 'farmland' ? 6 : 4,
    // Inside the square's outline, a diamond or a hex as much as a square, so fields don't run into their neighbours'.
    reach = inner * 0.9,
    width = (reach * 2) / rows,
    across = (v: number, wide: number, colour: string, lift: number): void =>
      rowAround(
        centre[0] - reach,
        centre[0] + reach,
        v,
        wide,
        houses,
        layer.channels
      ).forEach(([a, b]) => layer.strip([a, v], [b, v], wide, colour, lift));

  for (let row = 0; row < rows; row++) {
    across(
      centre[1] - reach + width * (row + 0.5),
      width * 0.8,
      kind === 'farmland' ? FARMLAND[row % 2]! : FIELD,
      LIFT.field
    );

    if (row > 0) {
      across(centre[1] - reach + width * row, 0.016, DITCH, LIFT.ditch);
    }
  }
};

/** The colours a city's roofs come in, each building's seeded. */
export const ROOFS = ['#9c5a3c', '#7d4a36', '#6f6a64', '#8b6b4a'] as const;

// A city's paving, its buildings' walls, and their roofs, each building's seeded: none in its owner's colours, which its
//  name carries, so a city taken looks the same, as its marker does, till its battle's blow, as it's laid till then
//  (`Land#keepCities`).
const PAVING = '#a39a88',
  HOUSE = '#c4b8a2',
  // How wide a building's walls are, under the eaves of a roof its lot's width.
  WALLED = 0.86;

/** How tall a city's building's storey is, and how high its roof rises over its eaves, as a share of its width. */
export const STOREY = 0.045,
  ROOF_RISE = 0.4;

/**
 * A city's sprawl on its lot (`sprawl.ts`): its plaza paved, its streets out to the roads and its quay, and a building
 *  on each lot built, facing its way, its roof's eaves out to the lot's edges, standing on the land where it is.
 */
const city = (layer: Layer, plan: CityPlan): void => {
  const { place } = layer,
    [u, v] = place.centre,
    // Where its units stand, in front of its buildings, which keep clear of them, as its disorder does.
    units: [number, number] = [u, v + IN_FRONT_OF_CITY],
    { plaza, streets, lots } = sprawl(place, plan, units);

  // On a bridge's deck where it's over a river, as the roads that come into it are, so they meet it at its height.
  layer.disc(plaza.at, plaza.radius, PAVING, LIFT.road, 16, true);
  streets.forEach(([from, to]) =>
    layer.strip(from, to, STREET, PAVING, LIFT.road, true)
  );
  lots.forEach((lot) => house(layer, lot));

  // In civil disorder: fires on some of its roofs behind its middle, and smoke rising from them, leaning away from its
  //  units (`disorder.ts`), each on the house that's laid there.
  if ((plan.disorder ?? 0) > 0) {
    disorderPieces({
      centre: [u, v],
      units,
      roofs: lots.map((lot) => {
        const { top, peak } = houseHeights(layer, lot);

        return { at: lot.at, width: lot.width, eaves: top, peak };
      }),
      seed: plan.seed,
      columns: plan.disorder ?? 0,
      ground: (gu, gv) => layer.ground(gu, gv),
    }).forEach(({ kind, at, size, colour }) =>
      layer.solid(kind === 'fire' ? cone : sphere, at, size, colour)
    );
  }
};

/**
 * How a house on `lot` stands, each storey `storey` tall: from the lowest of the ground under it, so it stands on a
 *  slope with no gap under any corner, to its storeys over the highest, and its roof's peak over that.
 */
const houseHeights = (
  layer: Layer,
  lot: Lot,
  storey = STOREY
): { low: number; top: number; peak: number } => {
  const grounds = [[lot.at[0], lot.at[1]] as const, ...footprintOf(lot)].map(
      ([gu, gv]) => layer.ground(gu, gv)
    ),
    top = Math.max(...grounds) + storey * lot.storeys;

  return {
    low: Math.min(...grounds) - 0.005,
    top,
    peak: top + lot.width * ROOF_RISE,
  };
};

// A house on its lot, facing its way, its roof's eaves out to the lot's edges, standing on the land where it is: a
//  city's, unless it's given walls, a roof and a storey's height of its own.
const house = (
  layer: Layer,
  lot: Lot,
  {
    walls = HOUSE,
    roof = ROOFS[Math.floor(lot.roof * ROOFS.length)]!,
    storey = STOREY,
  }: { walls?: string; roof?: string; storey?: number } = {}
): void => {
  const {
      at: [bu, bv],
      width,
      facing,
    } = lot,
    { low, top } = houseHeights(layer, lot, storey);

  layer.solid(
    box,
    [bu, (low + top) / 2, bv],
    [width * WALLED, top - low, width * WALLED],
    walls,
    [0, facing, 0]
  );
  // A four-sided cone, turned an eighth to square with the walls: its base's corners at half its size, so a base
  //  `width` across, out to the lot's edges.
  layer.solid(
    pyramid,
    [bu, top + (width * ROOF_RISE) / 2, bv],
    [width * Math.SQRT2, width * ROOF_RISE, width * Math.SQRT2],
    roof,
    [0, facing + Math.PI / 4, 0]
  );
};

/**
 * The houses of the cities beside the square that have spread onto it (`suburb`), each on its own side of it, clear of
 *  what's on it, its roads and railroads and those past its corners, and the ways units walk from it into each city
 *  beside it, where no road takes them; each taken once laid, so what grows there keeps clear of it. Their footprints.
 */
const suburbs = (
  layer: Layer,
  overlay: SquareOverlay
): (readonly (readonly [number, number])[])[] => {
  if (overlay.suburbs.length === 0) {
    return [];
  }

  const { place } = layer,
    same = (a: readonly [number, number], b: readonly [number, number]) =>
      a[0] === b[0] && a[1] === b[1],
    standOf = (offset: readonly [number, number]): [number, number] => {
      const [cu, cv] = place.toward(offset);

      return [cu, cv + IN_FRONT_OF_CITY];
    },
    clear = {
      runs: [...layer.runs],
      lines: [...layer.past],
      // Straight from its middle to where units stand in each city, but where its road or railroad goes that way, which
      //  they walk (`Land#roadPath`).
      lanes: overlay.beside
        .filter(
          (offset) =>
            ![
              ...(overlay.road?.joins ?? []),
              ...(overlay.railroad?.joins ?? []),
            ].some((join) => same(join, offset))
        )
        .map((offset): [[number, number], [number, number]] => [
          [place.centre[0], place.centre[1]],
          standOf(offset),
        ]),
      stands: overlay.beside.map(standOf),
      // What's claimed its place there first: each city's lots are all laid out before any is taken, so none hangs on
      //  another city's houses, only on the city and the square.
      taken: layer.taken,
      // Out of the sea, where the land dips below it at the shore.
      ground: (u: number, v: number) => place.heightAt(u, v),
      // And out of the rivers' channels.
      channels: layer.channels,
    },
    lots = overlay.suburbs.flatMap((plan) =>
      suburb(place, plan, {
        ...clear,
        others: overlay.beside
          .filter((offset) => !same(offset, plan.city))
          .map((offset) => place.toward(offset)),
      })
    );

  return lots.map((lot) => {
    house(layer, lot);
    // Round its corners, so what's round it keeps clear of every one.
    layer.taken.push([lot.at[0], lot.at[1], (lot.width / 2) * Math.SQRT2]);

    return footprintOf(lot);
  });
};

// Where `local` is, `x` across and `z` along from (`u`, `v`), turned `facing` about the vertical.
const turned =
  (u: number, v: number, facing: number) =>
  (x: number, z: number): [number, number] =>
    [
      u + x * Math.cos(facing) + z * Math.sin(facing),
      v + z * Math.cos(facing) - x * Math.sin(facing),
    ];

// A gabled roof along `facing`, its ridge `length` long, its eaves `width` apart at `top`, the walls' tops, pitched at
//  an eighth of a turn: a three-sided prism on its side, its ends the gables.
const gable = (
  layer: Layer,
  [u, v]: readonly [number, number],
  top: number,
  width: number,
  length: number,
  facing: number,
  css: string
): void => {
  const height = width / 2;

  // Its triangle's base is 0.866 across and a quarter below its middle, its peak half above.
  layer.solid(
    prism,
    [u, top + height / 3, v],
    [width / (Math.sqrt(3) / 2), length, height / 0.75],
    css,
    [-Math.PI / 2, facing, 0],
    'YXZ'
  );
};

// Which way the land falls the most from `back` behind (`u`, `v`) to `ahead` of it, of 32 ways round, as a turn about
//  the vertical (as `turned` takes it): across all of what's laid there, so a ridge or a saddle nearby doesn't turn it
//  up the slope, and in a hollow, the way it rises least. None where it's about flat, falling by less than a twentieth
//  of the way any way.
const downhill = (
  layer: Layer,
  [u, v]: readonly [number, number],
  back: number,
  ahead: number
): number | null => {
  let way = 0,
    most = -Infinity,
    least = Infinity;

  for (let k = 0; k < 32; k++) {
    const facing = (k / 32) * Math.PI * 2,
      [su, sv] = [Math.sin(facing), Math.cos(facing)],
      falls =
        layer.ground(u - su * back, v - sv * back) -
        layer.ground(u + su * ahead, v + sv * ahead);

    if (falls > most) {
      way = facing;
      most = falls;
    }

    least = Math.min(least, falls);
  }

  return Math.max(most, -least) < (back + ahead) * 0.05 ? null : way;
};

// The lowest of the ground under something round, `radius` across at (`u`, `v`), at its middle and its rim's eight
//  corners (as `cylinder` and `cone` have them), and a little below: where it stands, so none of it hangs over a slope.
const footOf = (layer: Layer, u: number, v: number, radius: number): number =>
  Math.min(
    ...ROUND.map(([du, dv]) => layer.ground(u + du * radius, v + dv * radius))
  ) - 0.002;

// A mine at (`u`, `v`), as big as `room` has space for: on a mountain, a tunnel's timbered mouth in the slope, a fan
//  of spoil below it and a cart on its track; elsewhere, a headframe over its shaft, braced, its wheel at the top, an
//  engine house with its chimney behind it, a cart, and spoil heaps.
const mine = (
  layer: Layer,
  [u, v]: readonly [number, number],
  room: number,
  terrain: string
): void => {
  const { seed, centre } = layer.place,
    f = room / MINE_ROOMS[0],
    // On a mountain, facing down the slope, from the ground behind its mouth to where its spoil's tipped, or out from
    //  the square's middle where that's about flat; elsewhere, its own way.
    facing =
      terrain === 'Mountains'
        ? downhill(layer, [u, v], 0.03 * f, 0.075 * f) ??
          Math.atan2(u - centre[0], v - centre[1])
        : fraction(seed, 41) * Math.PI * 2,
    at = turned(u, v, facing),
    ground = (x: number, z: number) => layer.ground(...at(x, z)),
    // A heap of spoil, its peak over the ground at its middle, its rim down into the ground at its lowest.
    heap = (x: number, z: number, size: number) => {
      const [hu, hv] = at(x * f, z * f),
        radius = 0.04 * size * f,
        peak = layer.ground(hu, hv) + 0.0445 * size * f,
        base = footOf(layer, hu, hv, radius);

      layer.solid(
        cone,
        [hu, (base + peak) / 2, hv],
        [radius * 2, peak - base, radius * 2],
        SPOIL
      );
    },
    // A cart, its body down to the lowest of the ground under it.
    cart = (x: number, z: number) => {
      const [cu, cv] = at(x * f, z * f),
        y = layer.ground(cu, cv),
        low =
          Math.min(
            ...[-1, 1].flatMap((sx) =>
              [-1, 1].map((sz) =>
                ground((x + sx * 0.012) * f, (z + sz * 0.017) * f)
              )
            )
          ) - 0.002;

      layer.solid(
        box,
        [cu, (low + y + 0.024 * f) / 2, cv],
        [0.024 * f, y + 0.024 * f - low, 0.034 * f],
        IRON,
        [0, facing, 0]
      );
      layer.solid(
        box,
        [cu, y + 0.026 * f, cv],
        [0.02 * f, 0.006 * f, 0.03 * f],
        '#4a4440',
        [0, facing, 0]
      );
    };

  if (terrain === 'Mountains') {
    // Its frame, posts and a lintel, its top over the highest of the ground behind it and at its posts' feet; its
    //  mouth, dark, in the frame; the rock it's dug into, rising behind it, its face upright behind the mouth, over the
    //  lintel, and sloping back into the ground, so seen from behind it's a rise in the slope; and the fan of spoil
    //  tipped down in front. Each down into the ground at its lowest, so none hangs over the slope below.
    const lowest = (points: readonly (readonly [number, number])[]) =>
        Math.min(...points.map(([x, z]) => ground(x * f, z * f))),
      top =
        Math.max(
          ground(0, -0.03 * f),
          ground(-0.03 * f, 0),
          ground(0.03 * f, 0)
        ) +
        0.07 * f,
      across = (half: number, zs: readonly number[]) =>
        zs.flatMap((z) => [-half, 0, half].map((x) => [x, z] as const)),
      [mu, mv] = at(0, -0.007 * f),
      mouth = lowest(across(0.025, [-0.004, -0.01])) - 0.004,
      [ru, rv] = at(0, -0.071 * f),
      rock =
        lowest(across(0.0425, [-0.011, -0.041, -0.071, -0.101, -0.131])) -
        0.004;

    layer.solid(
      box,
      [mu, (mouth + top - 0.01 * f) / 2, mv],
      [0.05 * f, top - 0.01 * f - mouth, 0.006 * f],
      MOUTH,
      [0, facing, 0]
    );
    layer.solid(
      wedge,
      [ru, (rock + top + 0.012 * f) / 2, rv],
      [0.085 * f, top + 0.012 * f - rock, 0.12 * f],
      HILLSIDE,
      [0, facing, 0]
    );
    [-1, 1].forEach((side) => {
      const [pu, pv] = at(side * 0.03 * f, 0),
        foot =
          lowest(
            across(0.005, [-0.005, 0.005]).map(
              ([x, z]) => [x + side * 0.03, z] as const
            )
          ) - 0.002;

      layer.solid(
        box,
        [pu, (foot + top) / 2, pv],
        [0.01 * f, top - foot, 0.01 * f],
        WOOD,
        [0, facing, 0]
      );
    });

    // Its lintel, from the frame's front back to the rock's face, over the mouth's top.
    const [lu, lv] = at(0, -0.0025 * f);

    layer.solid(
      box,
      [lu, top + 0.002 * f, lv],
      [0.075 * f, 0.012 * f, 0.017 * f],
      WOOD,
      [0, facing, 0]
    );
    heap(0.0, 0.075, 1.3);
    heap(0.06, 0.06, 0.8);
    // Beside the big heap, clear of it.
    cart(-0.065, 0.035);

    return;
  }

  // The headframe: four legs leaning in, a brace round them halfway up, and the wheel on top, square with the way it
  //  faces, from the lowest of the ground at their feet, which lean out to 0.035 of its size, and a little below.
  const y =
      Math.min(
        ...[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([sx, sz]) => ground(sx! * 0.035 * f, sz! * 0.035 * f))
      ) - 0.004,
    height = 0.15 * f;

  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].forEach(([sx, sz]) => {
    const [lu, lv] = at(sx! * 0.022 * f, sz! * 0.022 * f);

    layer.solid(
      box,
      [lu, y + height / 2, lv],
      [0.008 * f, height, 0.008 * f],
      WOOD,
      [-sz! * 0.12, facing, sx! * 0.12],
      'YXZ'
    );
  });
  layer.solid(
    box,
    [u, y + height * 0.5, v],
    [0.04 * f, 0.006 * f, 0.04 * f],
    WOOD,
    [0, facing, 0]
  );
  layer.solid(
    cylinder,
    [u, y + height + 0.01 * f, v],
    [0.05 * f, 0.008 * f, 0.05 * f],
    IRON,
    [Math.PI / 2, facing, 0],
    'YXZ'
  );

  // The engine house, behind it, with its chimney: its walls from the lowest of the ground under it to their height
  //  over the highest, as a house's are, and its roof's ridge along its longer side.
  const [eu, ev] = at(0, -0.075 * f),
    grounds = [-0.03, 0.03].flatMap((x) =>
      [-0.1, -0.05].map((z) => ground(x * f, z * f))
    ),
    engine = Math.min(...grounds, layer.ground(eu, ev)) - 0.004,
    eaves = Math.max(...grounds, layer.ground(eu, ev)) + 0.05 * f;

  layer.solid(
    box,
    [eu, (engine + eaves) / 2, ev],
    [0.06 * f, eaves - engine, 0.05 * f],
    WALL,
    [0, facing, 0]
  );
  gable(
    layer,
    [eu, ev],
    eaves,
    0.054 * f,
    0.064 * f,
    facing + Math.PI / 2,
    BARN_ROOF
  );

  const [cu, cv] = at(0.025 * f, -0.095 * f);

  layer.solid(
    cylinder,
    [cu, (engine + eaves + 0.05 * f) / 2, cv],
    [0.012 * f, eaves + 0.05 * f - engine, 0.012 * f],
    BRICK
  );
  heap(0.075, 0.035, 1);
  heap(-0.06, 0.06, 0.8);
  cart(0.05, -0.02);
};

/** The colours a fortress is drawn in: its stone, and its towers' slate roofs. */
export const FORTRESS_COLOURS = { stone: STONE, slate: SLATE } as const;

/**
 * The colours roads and railroads are drawn in: a road's, a railroad's ballast, sleepers and rails, and a city's
 *  streets and plaza.
 */
export const ROUTE_COLOURS = {
  road: ROAD,
  ballast: BALLAST,
  sleeper: SLEEPER,
  rail: RAIL,
  street: PAVING,
} as const;

/**
 * The colours a bridge's walls are drawn in: a road's stone (as a fortress's), a railroad's girders, and an airbase's
 *  runway's concrete.
 */
export const BRIDGE_COLOURS = {
  stone: STONE,
  girder: GIRDER,
  concrete: CONCRETE,
} as const;

/**
 * The colours an airbase is drawn in: its runway's tarmac and markings, its hangar's walls, roof and doors, and its
 *  control tower's glass.
 */
export const AIRBASE_COLOURS = {
  tarmac: TARMAC,
  marking: MARKING,
  hangar: HANGAR,
  roof: HANGAR_ROOF,
  door: DOOR,
  glass: GLASS,
} as const;

/**
 * The colours a mine's parts are drawn in: on a mountain, its tunnel's mouth, its timbers (posts and lintel, and a
 *  headframe's legs elsewhere) and the rock it's dug into; elsewhere, its engine house's walls and roof; and its spoil
 *  and its iron (a cart, and a headframe's wheel).
 */
export const MINE_COLOURS = {
  mouth: MOUTH,
  timber: WOOD,
  rock: HILLSIDE,
  engine: WALL,
  roof: BARN_ROOF,
  spoil: SPOIL,
  iron: IRON,
} as const;

/**
 * The colours a farm's buildings are drawn in, among its fields, none a city's: its farmhouse's walls and roof, its
 *  barn's, its haystacks and its silo.
 */
export const FARMSTEAD_COLOURS: readonly string[] = [
  FARMHOUSE,
  FARM_ROOF,
  BARN,
  BARN_ROOF,
  STRAW,
  SILO,
];

// A farm's buildings at (`u`, `v`), as big as `room` has space for, square with the fields' rows: a farmhouse, its barn
//  beside it, and haystacks, or on farmland a silo. Their footprints, for the rows to keep clear of.
const farmstead = (
  layer: Layer,
  kind: 'irrigation' | 'farmland',
  [u, v]: readonly [number, number],
  room: number
): (readonly (readonly [number, number])[])[] => {
  const { seed } = layer.place,
    f = room / FARM_ROOMS[0],
    // Along the rows or across them.
    facing = fraction(seed, 43) < 0.5 ? 0 : Math.PI / 2,
    at = turned(u, v, facing),
    farmhouse: Lot = {
      at: at(-0.04 * f, 0.03 * f),
      width: 0.06 * f,
      facing,
      storeys: 1,
      roof: fraction(seed, 44),
    },
    barnAt = at(0.035 * f, -0.02 * f),
    // The barn's footprint, out to its roof's eaves and ends, in order round it.
    barn = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([sx, sz]) =>
      at((0.035 + sx! * 0.032) * f, (-0.02 + sz! * 0.042) * f)
    ),
    // Its walls, from the lowest of the ground under it to their height over the highest, as a house's are.
    grounds = [barnAt, ...barn].map(([bu, bv]) => layer.ground(bu, bv)),
    low = Math.min(...grounds) - 0.004,
    eaves = Math.max(...grounds) + 0.045 * f;

  // The farmhouse's storey as much smaller as the rest, so it's no taller for its width where there's less room.
  house(layer, farmhouse, {
    walls: FARMHOUSE,
    roof: FARM_ROOF,
    storey: STOREY * f,
  });
  layer.solid(
    box,
    [barnAt[0], (low + eaves) / 2, barnAt[1]],
    [0.06 * f, eaves - low, 0.08 * f],
    BARN,
    [0, facing, 0]
  );
  gable(layer, barnAt, eaves, 0.064 * f, 0.084 * f, facing, BARN_ROOF);

  // Haystacks, or a silo, beside them.
  const yard = at(-0.045 * f, -0.045 * f),
    yardGround = layer.ground(...yard);

  // Each down into the ground at its lowest, its top over the ground at its middle.
  if (kind === 'farmland') {
    const foot = footOf(layer, ...yard, 0.015 * f);

    layer.solid(
      cylinder,
      [yard[0], (foot + yardGround + 0.1 * f) / 2, yard[1]],
      [0.03 * f, yardGround + 0.1 * f - foot, 0.03 * f],
      SILO
    );
    layer.solid(
      dome,
      [yard[0], yardGround + 0.1 * f, yard[1]],
      [0.03 * f, 0.04 * f, 0.03 * f],
      SILO
    );
  } else {
    [
      [0, 0],
      [0.03, 0.012],
    ].forEach(([x, z]) => {
      const [hu, hv] = at(-0.045 * f + x! * f, -0.045 * f + z! * f),
        hy = layer.ground(hu, hv),
        foot = footOf(layer, hu, hv, 0.013 * f);

      layer.solid(
        cylinder,
        [hu, (foot + hy + 0.02 * f) / 2, hv],
        [0.026 * f, hy + 0.02 * f - foot, 0.026 * f],
        STRAW
      );
      layer.solid(
        cone,
        [hu, hy + 0.03 * f, hv],
        [0.03 * f, 0.022 * f, 0.03 * f],
        STRAW
      );
    });
  }

  // The yard's, round its haystacks or its silo, in order round it.
  const [right, near] = kind === 'farmland' ? [-0.03, -0.03] : [0, -0.018];

  return [
    footprintOf(farmhouse),
    barn,
    [
      [-0.06, -0.06],
      [right, -0.06],
      [right, near],
      [-0.06, near],
    ].map(([x, z]) => at(x! * f, z! * f)),
  ];
};

// Where segment `a`-`b` crosses side `from`-`to`, how far along the side, 0 to 1; or none.
const crossing = (
  [au, av]: readonly [number, number],
  [bu, bv]: readonly [number, number],
  [fu, fv]: readonly [number, number],
  [tu, tv]: readonly [number, number]
): number | null => {
  const ru = bu - au,
    rv = bv - av,
    su = tu - fu,
    sv = tv - fv,
    across = ru * sv - rv * su;

  if (Math.abs(across) < 1e-12) {
    return null;
  }

  const along = ((fu - au) * sv - (fv - av) * su) / across,
    side = ((fu - au) * rv - (fv - av) * ru) / across;

  // A hair either way, so a road through a corner crosses both sides there.
  return along >= -1e-9 &&
    along <= 1 + 1e-9 &&
    side >= -1e-9 &&
    side <= 1 + 1e-9
    ? side
    : null;
};

// The lowest and highest of the ground under a box at (`u`, `v`), `across` by `along` turned `facing`, at its middle,
//  its corners and the middles of its sides.
const groundUnder = (
  layer: Layer,
  [u, v]: readonly [number, number],
  across: number,
  along: number,
  facing: number
): [number, number] => {
  const at = turned(u, v, facing),
    heights = [-1, 0, 1].flatMap((sx) =>
      [-1, 0, 1].map((sz) =>
        layer.ground(...at((sx * across) / 2, (sz * along) / 2))
      )
    );

  return [Math.min(...heights), Math.max(...heights)];
};

/**
 * A fortress round the square's middle, its walls along `fortressLines`: each wall in lengths that step with the
 *  ground, from the lowest under each to its height over the highest, with merlons along its outer edge; a round tower
 *  at each corner under a slate roof; and a gate, flanked by two square towers, wherever a road or railroad leaves
 *  through its walls, wide enough for it at the angle it crosses, or in its south wall (towards the camera at its
 *  starting heading) where none does. Where a road leaves through a corner, both walls are open there, as wide as the
 *  widest gate that opened it, with no tower; and a gate's tower too near a corner's isn't drawn.
 */
const fortress = (layer: Layer): void => {
  const corners = fortressCorners(layer.place),
    length = Math.hypot(
      corners[1]![0] - corners[0]![0],
      corners[1]![1] - corners[0]![1]
    ),
    // Where each road or railroad leaves through a side: which side, how far along it, and how far either side of
    //  that its gate opens: its half-width across the wall, at the angle it crosses, and enough that a gate's tower,
    //  as deep as the wall, clears its edge, and a little more, as a road bends.
    gates: [number, number, number][] = [];

  layer.runs.forEach(({ points, half = ROAD_HALF }) =>
    points.slice(1).forEach((point, index) =>
      corners.forEach((corner, side) => {
        const from = points[index]!,
          next = corners[(side + 1) % 4]!,
          along = crossing(from, point, corner, next);

        if (along === null) {
          return;
        }

        // How square to the wall it crosses: its way's share across the wall, which runs along the side.
        const [ru, rv] = [point[0] - from[0], point[1] - from[1]],
          [su, sv] = [
            (next[0] - corner[0]) / length,
            (next[1] - corner[1]) / length,
          ],
          square = Math.max(
            0.2,
            Math.abs(ru * sv - rv * su) / Math.hypot(ru, rv)
          ),
          // Never the root of less than nothing, as its share can round to a hair over one.
          slant = Math.sqrt(Math.max(0, 1 - square * square)) / square;

        gates.push([
          side,
          along * length,
          // No more than half a side, however slant.
          Math.min(half / square + 0.018 * slant + 0.008, length / 2 - 0.01),
        ]);
      })
    )
  );

  if (gates.length === 0) {
    gates.push([2, length / 2, FORTRESS.gate / 2]);
  }

  const { tower, thick, tall } = FORTRESS,
    // Each side's gaps, from and to, along it.
    gaps = [0, 1, 2, 3].map((side) =>
      gates
        .filter(([each]) => each === side)
        .map(([, at, wide]): [number, number] => [at - wide, at + wide])
    ),
    // A corner is open where a gap on either side reaches into its tower: then both its walls are, there, as far from
    //  it as the furthest end of the gaps that opened it.
    open = corners.map((_, corner) =>
      Math.max(
        0,
        ...gaps[corner]!.filter(([from]) => from < tower).map(([, to]) => to),
        ...gaps[(corner + 3) % 4]!.filter(([, to]) => to > length - tower).map(
          ([from]) => length - from
        )
      )
    );

  open.forEach((wide, corner) => {
    if (wide > 0) {
      gaps[corner]!.push([-wide, wide]);
      gaps[(corner + 3) % 4]!.push([length - wide, length + wide]);
    }
  });

  // Each side's gaps in order along it, those that overlap as one.
  gaps.forEach((side, index) => {
    const merged: [number, number][] = [];

    side
      .sort((a, b) => a[0] - b[0])
      .forEach(([from, to]) => {
        const last = merged[merged.length - 1];

        if (last !== undefined && from <= last[1]) {
          last[1] = Math.max(last[1], to);
        } else {
          merged.push([from, to]);
        }
      });
    gaps[index] = merged;
  });

  corners.forEach((corner, side) => {
    const next = corners[(side + 1) % 4]!,
      way = [(next[0] - corner[0]) / length, (next[1] - corner[1]) / length],
      // Its length turned to lie along the side; outward is to its left as it goes round.
      facing = Math.atan2(-way[1]!, way[0]!),
      out = [way[1]!, -way[0]!],
      point = (along: number, outward = 0): [number, number] => [
        corner[0] + way[0]! * along + out[0]! * outward,
        corner[1] + way[1]! * along + out[1]! * outward,
      ],
      // The lengths of wall between its gaps.
      walls: [number, number][] = [];
    let from = 0;

    gaps[side]!.forEach(([a, b]) => {
      if (a > from) {
        walls.push([from, a]);
      }

      from = Math.max(from, b);
    });

    if (from < length) {
      walls.push([from, length]);
    }

    walls.forEach(([a, b]) => {
      const steps = Math.max(1, Math.ceil((b - a) / 0.08)),
        step = (b - a) / steps;

      for (let k = 0; k < steps; k++) {
        const middle = point(a + step * (k + 0.5)),
          [low, high] = groundUnder(layer, middle, step, thick, facing),
          // Over a river's water, at its middle or either end, a gate for it under the wall.
          water = [
            point(a + step * k),
            middle,
            point(a + step * (k + 1)),
          ].reduce<number | null>((highest, at) => {
            const here = layer.waterAt(...at);

            return here === null ? highest : Math.max(highest ?? here, here);
          }, null),
          bottom =
            water === null ? low - 0.004 : Math.max(low, water + WATER_GATE),
          top = Math.max(high, bottom - tall / 2) + tall;

        layer.solid(
          box,
          [middle[0], (bottom + top) / 2, middle[1]],
          [step, top - bottom, thick],
          STONE,
          [0, facing, 0]
        );

        // Merlons along its outer edge, as many as fit.
        const count = Math.max(1, Math.round(step / FORTRESS.merlons));

        for (let m = 0; m < count; m++) {
          const [mu, mv] = point(
            a + step * k + (step * (m + 0.5)) / count,
            thick / 2 - 0.005
          );

          layer.solid(
            box,
            [mu, top + 0.007, mv],
            [Math.min(0.018, step / count - 0.008), 0.018, 0.01],
            STONE,
            [0, facing, 0]
          );
        }
      }
    });

    // A square tower each side of each gap, but at an open corner, or where it'd stand in a corner's tower.
    const clear = tower + 0.036,
      first = open[side]! > 0 ? 0 : clear,
      last = length - (open[(side + 1) % 4]! > 0 ? 0 : clear);

    gaps[side]!.forEach(([a, b]) =>
      [a, b].forEach((end, index) => {
        if (end <= first || end >= last) {
          return;
        }

        const at = point(end + (index === 0 ? -0.018 : 0.018)),
          [low, high] = groundUnder(layer, at, 0.036, 0.036, facing),
          top = high + tall + 0.022;

        layer.solid(
          box,
          [at[0], (low - 0.004 + top) / 2, at[1]],
          [0.036, top - low + 0.004, 0.036],
          STONE,
          [0, facing, 0]
        );
        layer.solid(
          pyramid,
          [at[0], top + 0.016, at[1]],
          // Its eaves a hair past its walls, inside its gate's margin.
          [0.04 * Math.SQRT2, 0.03, 0.04 * Math.SQRT2],
          SLATE,
          [0, facing + Math.PI / 4, 0]
        );
      })
    );
  });

  // A round tower at each corner that isn't open, under a slate roof.
  corners.forEach(([u, v], corner) => {
    if (open[corner]! > 0) {
      return;
    }

    const heights = ROUND.map(([du, dv]) =>
        layer.ground(u + du * tower, v + dv * tower)
      ),
      bottom = Math.min(...heights) - 0.004,
      top = Math.max(...heights) + FORTRESS.towerTall;

    layer.solid(
      cylinder,
      [u, (bottom + top) / 2, v],
      [tower * 2, top - bottom, tower * 2],
      STONE
    );
    layer.solid(
      cone,
      [u, top + 0.025, v],
      [tower * 2.4, 0.055, tower * 2.4],
      SLATE
    );
  });
};

// A fortress's corners, round its square's middle, in order round it, from the north-west: its walls are the lines
//  between them.
const fortressCorners = (
  place: Pick<OverlayPlace, 'centre' | 'radius'>
): [number, number][] => {
  const half = place.radius * FORTRESS.half,
    [u, v] = place.centre;

  return [
    [u - half, v - half],
    [u + half, v - half],
    [u + half, v + half],
    [u - half, v + half],
  ];
};

// Where an airbase's runway is: how far south of the square's middle, how wide, and how far it reaches either side, in
//  the square's radius.
export const RUNWAY = { south: 0.12, wide: 0.12, reach: 0.75 } as const;

/**
 * An airbase: a runway across the square south of its middle, marked with a dashed line down its middle, its edges and
 *  bars at each end; a hangar under a vaulted roof, its doors facing the runway, and an apron of tarmac between; and a
 *  control tower. The hangar and the tower each claim the most room there is for them, as a special does.
 */
const airbase = (layer: Layer): void => {
  const [u, v] = layer.place.centre,
    reach = layer.place.radius * RUNWAY.reach,
    rv = v + RUNWAY.south,
    marking = (
      from: readonly [number, number],
      to: readonly [number, number],
      wide: number
    ) => layer.strip(from, to, wide, MARKING, LIFT.marking, true);

  layer.strip(
    [u - reach, rv],
    [u + reach, rv],
    RUNWAY.wide,
    TARMAC,
    LIFT.runway,
    true
  );

  // Its edges, and a bar across each end, then dashes down its middle between them.
  [-1, 1].forEach((side) =>
    marking(
      [u - reach * 0.96, rv + side * (RUNWAY.wide / 2 - 0.008)],
      [u + reach * 0.96, rv + side * (RUNWAY.wide / 2 - 0.008)],
      0.005
    )
  );
  [-1, 1].forEach((end) =>
    [-0.036, -0.012, 0.012, 0.036].forEach((across) =>
      marking(
        [u + end * reach * 0.92, rv + across],
        [u + end * (reach * 0.92 - 0.04), rv + across],
        0.012
      )
    )
  );

  for (let dash = -reach * 0.7; dash < reach * 0.7; dash += 0.07) {
    marking([dash + u, rv], [dash + u + 0.035, rv], 0.006);
  }

  // The hangar, square to the runway, its doors towards it, and the apron out to it.
  const [hu, hv, room] = layer.claimMost(5, 0.6, [0.1, 0.08, 0.06]),
    toward = hv < rv ? 1 : -1,
    facing = toward > 0 ? 0 : Math.PI,
    wide = room * 0.95,
    long = room * 1.2,
    at = turned(hu, hv, facing),
    [low, high] = groundUnder(layer, [hu, hv], wide, long, facing),
    eaves = high + room * 0.12,
    door = at(0, long / 2),
    // The apron, from the hangar's doors to just inside the runway's edge, half as wide either side.
    apronEnd: [number, number] = [
      door[0],
      rv - toward * (RUNWAY.wide / 2 - 0.004),
    ],
    apronHalf = wide * 0.3,
    // The runway and the apron as lines their bridges' walls stand along: each open where the other meets it, and
    //  where a road or railroad crosses.
    runway: Run = {
      key: RUNWAY_KEY,
      points: [
        [u - reach, rv],
        [u + reach, rv],
      ],
      half: RUNWAY.wide / 2,
    },
    apron: Run = { key: APRON_KEY, points: [door, apronEnd], half: apronHalf },
    // What else on the square their walls open for: a road or railroad on its own.
    alone = layer.crossings.filter(
      ({ key }) => key !== RUNWAY_KEY && key !== APRON_KEY
    );

  // Roads' and railroads' bridges' walls open for it, laid after it.
  layer.crossings.push(apron);

  layer.strip(door, apronEnd, apronHalf * 2, TARMAC, LIFT.apron, true);
  bridgeWalls(layer, runway.points, RUNWAY.wide / 2, LIFT.runway, CONCRETE, [
    ...layer.runs,
    apron,
    ...alone,
  ]);
  bridgeWalls(layer, apron.points, apronHalf, LIFT.apron, CONCRETE, [
    ...layer.runs,
    runway,
    ...alone,
  ]);
  // What's claimed after keeps clear of it.
  layer.lines.push([door, apronEnd]);
  layer.solid(
    box,
    [hu, (low - 0.004 + eaves) / 2, hv],
    [wide, eaves - low + 0.004, long],
    HANGAR,
    [0, facing, 0]
  );
  layer.solid(vault, [hu, eaves, hv], [wide, wide, long], HANGAR_ROOF, [
    0,
    facing,
    0,
  ]);

  const [du, dv] = at(0, long / 2 + 0.002);

  layer.solid(
    box,
    [du, (low + eaves + wide * 0.3) / 2, dv],
    [wide * 0.7, eaves + wide * 0.3 - low, 0.004],
    DOOR,
    [0, facing, 0]
  );

  // The control tower: a shaft, its glass cab, and its roof.
  const [tu, tv, towerRoom] = layer.claimMost(9, 0.6, [0.06, 0.05, 0.04]),
    f = towerRoom / 0.06,
    [shaftLow, shaftHigh] = groundUnder(
      layer,
      [tu, tv],
      0.024 * f,
      0.024 * f,
      0
    ),
    cab = shaftHigh + 0.09 * f;

  layer.solid(
    box,
    [tu, (shaftLow - 0.004 + cab) / 2, tv],
    [0.024 * f, cab - shaftLow + 0.004, 0.024 * f],
    HANGAR
  );
  layer.solid(
    box,
    [tu, cab + 0.011 * f, tv],
    [0.044 * f, 0.022 * f, 0.044 * f],
    GLASS
  );
  layer.solid(
    box,
    [tu, cab + 0.025 * f, tv],
    [0.052 * f, 0.006 * f, 0.052 * f],
    HANGAR
  );
};

// Smog: a low haze over the square, reaching a little over its edges so polluted neighbours' join, and wisps over it,
//  higher and thinner, each its own way round.
const pollution = (layer: Layer): void => {
  const { radius, seed } = layer.place;

  layer.haze(
    layer.place.centre,
    radius * SMOG_REACH,
    SMOG,
    0.85,
    SMOG_LIFT[0],
    seed
  );
  layer.haze(
    layer.place.centre,
    radius * 1.2,
    SMOG,
    0.5,
    (SMOG_LIFT[0] + SMOG_LIFT[1]) / 2,
    seed + 7
  );

  for (let n = 0; n < 3; n++) {
    layer.haze(
      layer.spot(11 + n, 0.45),
      radius * (0.55 + 0.2 * fraction(seed, 50 + n)),
      SMOG,
      0.5,
      SMOG_LIFT[0] + (SMOG_LIFT[1] - SMOG_LIFT[0]) * ((n + 1) / 3),
      seed + n + 1
    );
  }
};

// The shapes a beast's parts are made from.
const BEAST_SHAPES = { box, sphere, ball: crown, cylinder, cone } as const;

// A beast of `kind` standing on the land at (`u`, `v`), `scale` times its size, facing `facing`, in `colours`.
const beast = (
  layer: Layer,
  kind: BeastKind,
  [u, v]: readonly [number, number],
  scale: number,
  facing: number,
  colours: { coat: string; detail: string; pale: string }
): void => {
  const y = layer.ground(u, v),
    cos = Math.cos(facing),
    sin = Math.sin(facing);

  beastParts[kind].forEach(
    ({ shape, colour, at: [x, py, z], size, pitch = 0, roll = 0 }) =>
      layer.solid(
        BEAST_SHAPES[shape],
        [
          u + (x * cos + z * sin) * scale,
          y + py * scale,
          v + (z * cos - x * sin) * scale,
        ],
        [size[0] * scale, size[1] * scale, size[2] * scale],
        colours[colour],
        // Its own roll and pitch, then turned with the beast.
        [pitch, facing, roll],
        'YXZ'
      )
  );
};

// A special's beasts round `at`, side by side as a herd grazes, each a little ahead or behind and turned a little its
//  own way, its coat the next of its look's: as big as `room` has space for, and no bigger than a little over life.
const herd = (
  layer: Layer,
  look: SpecialLook,
  kind: BeastKind,
  at: readonly [number, number],
  room: number,
  n: number
): void => {
  const { seed } = layer.place,
    { across, along } = beastReach(kind),
    heading = fraction(seed, n * 31 + 17) * Math.PI * 2,
    members = Array.from({ length: look.count }, (_, k) => ({
      side: (k - (look.count - 1) / 2) * across * 2.3,
      ahead:
        look.count === 1
          ? 0
          : (fraction(seed, n * 31 + k + 60) - 0.5) * along * 0.3,
    })),
    // How far its furthest reaches from `at`, with a little over for each beast's own turn.
    reach =
      Math.max(
        ...members.map(({ side, ahead }) =>
          Math.hypot(Math.abs(side) + across, Math.abs(ahead) + along)
        )
      ) * 1.08,
    scale = Math.min(1.1, room / reach),
    coats = [look.colour, ...(look.coats ?? [])],
    cos = Math.cos(heading),
    sin = Math.sin(heading);

  members.forEach(({ side, ahead }, k) => {
    const where: [number, number] = [
      at[0] + (side * cos + ahead * sin) * scale,
      at[1] + (ahead * cos - side * sin) * scale,
    ];

    // None stands in the sea, where its room reaches past the shore.
    if (inTheSea(layer.ground(...where))) {
      return;
    }

    beast(
      layer,
      kind,
      where,
      scale,
      heading + (fraction(seed, n * 31 + k + 70) - 0.5) * 0.4,
      {
        coat: coats[k % coats.length]!,
        detail: look.detail ?? look.colour,
        pale: look.pale ?? look.detail ?? look.colour,
      }
    );
  });
};

// `count` points round `at`, `out` from it, evenly from the `n`th seeded angle, each with its angle; just `at` for one.
const ring = (
  layer: Layer,
  count: number,
  at: readonly [number, number],
  out: number,
  n: number
): [number, number, number][] => {
  const start = fraction(layer.place.seed, n * 31 + 5) * Math.PI * 2;

  return Array.from({ length: count }, (_, k) => {
    const angle = start + (k / count) * Math.PI * 2;

    return count === 1
      ? [at[0], at[1], angle]
      : [at[0] + Math.cos(angle) * out, at[1] + Math.sin(angle) * out, angle];
  });
};

// Logs stacked along `facing`, three, then two, then one on top, as many as `count`, their cut ends pale, `fit` times
//  their size.
const logStack = (
  layer: Layer,
  look: SpecialLook,
  [u, v]: readonly [number, number],
  facing: number,
  fit: number
): void => {
  const y = layer.ground(u, v),
    cos = Math.cos(facing),
    sin = Math.sin(facing),
    radius = 0.025 * fit,
    length = 0.17 * fit,
    ends = look.detail ?? look.colour;
  let left = look.count;

  for (let row = 0; left > 0; row++) {
    const inRow = Math.min(left, Math.max(1, 3 - row));

    for (let k = 0; k < inRow; k++) {
      const across = (k - (inRow - 1) / 2) * radius * 2.05,
        up = radius + row * radius * 1.75,
        at = (along: number): [number, number, number] => [
          u + across * cos + along * sin,
          y + up,
          v + along * cos - across * sin,
        ];

      // Along `facing`, its length the cylinder's height laid down, and its ends, each facing out.
      layer.solid(
        log,
        at(0),
        [radius * 2, length, radius * 2],
        look.colour,
        [Math.PI / 2, facing, 0],
        'YXZ'
      );
      [-1, 1].forEach((end) =>
        layer.solid(
          cutEnd,
          at((end * length) / 2),
          [radius * 2, radius * 2, 1],
          ends,
          [0, facing + (end < 0 ? Math.PI : 0), 0]
        )
      );
    }

    left -= inRow;
  }
};

// How far each special laid round a point reaches from it at its own size, so it's drawn to fit its room: the ring it's
//  laid round, and the most its shapes reach past it, from their sizes below.
const SPECIAL_REACH: { readonly [shape in SpecialLook['shape']]?: number } = {
  // A ring of lumps 0.07 out, each 0.078 across at most; the one in the middle is 1.3 times that.
  rocks: 0.07 + 0.039,
  crop: 0.075 + 0.0375,
  fish: 0.08 + 0.0325,
  // Its flukes, behind its back.
  whale: Math.hypot(0.13 + 0.0175, 0.0475),
  // Its base's corner.
  derrick: Math.SQRT1_2 * 0.11,
  // The palms round its pool and their crowns (their lean's `SPECIAL_LEAN`).
  oasis: 0.09 + 0.055,
  peat: 0.075 + Math.hypot(0.0375, 0.025),
  // Logs three across, 2.05 of their radius (0.025) apart, and 0.17 long.
  logs: Math.hypot(0.025 * 2.05 + 0.025, 0.085),
  cairn: 0.0375,
};

// Whether a special's piece at a height of the land `y` would stand deeper than the sea's floor begins beside land: a
//  guard for ground deeper than any a claim reaches, as `EDGE_REACH` keeps claims to their square. Land just under the
//  water's level at a shore, as a low swamp's can be, isn't.
const inTheSea = (y: number): boolean => y < seaFloor.shore;

// How far an oasis's palms lean out at their tops, whatever its size, as they're as tall.
const SPECIAL_LEAN = 0.16 * Math.sin(0.15) * 0.5;

// One special, standing round `at`, as big as `room` has space for, and no bigger than its own size: logs a little
//  bigger, as they're small for their room. The rest, but beasts and logs, keep their height where they've less room,
//  so they're never lower than they were. On land, none of its pieces stands in the sea, where its room reaches past a
//  shore, as no beast of a herd does.
const special = (
  layer: Layer,
  look: SpecialLook,
  at: readonly [number, number],
  room: number,
  n: number
): void => {
  const { seed } = layer.place,
    detail = look.detail ?? look.colour,
    facing = fraction(seed, n * 31 + 17) * Math.PI * 2,
    // How much of its own size it's drawn across: each size and how far apart below is times this, but heights.
    f = Math.min(
      look.shape === 'logs' ? 1.2 : 1,
      (room - (look.shape === 'oasis' ? SPECIAL_LEAN : 0)) /
        (SPECIAL_REACH[look.shape] ?? room)
    );

  switch (look.shape) {
    case 'horse':
    case 'ox':
    case 'deer':
    case 'fox':
    case 'elephant':
    case 'seal':
    case 'bird':
      herd(layer, look, look.shape, at, room, n);

      return;
    case 'logs':
      // Not in the sea.
      if (!inTheSea(layer.ground(...at))) {
        logStack(layer, look, at, facing, f);
      }

      return;
    case 'rocks': {
      // A lump in the middle, bigger, and the rest round it.
      const lumps: [number, number, number][] = [
        [at[0], at[1], 1.3],
        ...ring(layer, look.count - 1, at, 0.07 * f, n).map(
          ([u, v]): [number, number, number] => [u, v, 1]
        ),
      ];

      lumps.forEach(([u, v, big], index) => {
        const y = layer.ground(u, v);

        if (!inTheSea(y)) {
          layer.solid(
            sphere,
            [u, y + 0.016 * big, v],
            [0.078 * big * f, 0.055 * big, 0.068 * big * f],
            index % 2 === 1 ? detail : look.colour,
            [0, fraction(seed, n * 31 + index + 17) * Math.PI * 2, 0]
          );
        }
      });

      return;
    }
    default:
  }

  ring(
    layer,
    look.count,
    at,
    (look.shape === 'fish' ? 0.08 : 0.075) * f,
    n
  ).forEach(([u, v, angle], index) => {
    const afloat = look.shape === 'fish' || look.shape === 'whale',
      y = layer.ground(u, v, afloat),
      turn = fraction(seed, n * 31 + index + 17) * Math.PI * 2;

    // An oasis's pool and palms, and a cairn, see to it themselves.
    if (
      !afloat &&
      look.shape !== 'oasis' &&
      look.shape !== 'cairn' &&
      inTheSea(y)
    ) {
      return;
    }

    switch (look.shape) {
      case 'crop':
        layer.solid(
          cylinder,
          [u, y + 0.03, v],
          [0.014 * f, 0.06, 0.014 * f],
          detail
        );
        layer.solid(
          sphere,
          [u, y + 0.08, v],
          [0.075 * f, 0.065, 0.075 * f],
          look.colour
        );
        break;
      case 'fish': {
        // Every third leaping clear of the water, the rest at its surface, swimming round.
        const leaps = index % 3 === 1;

        layer.solid(
          sphere,
          [u, y + (leaps ? 0.035 : 0.01), v],
          [0.024 * f, 0.018, 0.065 * f],
          look.colour,
          [leaps ? -0.6 : 0, -angle, 0],
          'YXZ'
        );
        break;
      }
      case 'whale': {
        // Its back, its flukes, and its spout, white over it.
        const ahead = (out: number): [number, number] => [
          u + Math.sin(turn) * out * f,
          v + Math.cos(turn) * out * f,
        ];

        layer.solid(
          sphere,
          [u, y, v],
          [0.085 * f, 0.06, 0.24 * f],
          look.colour,
          [0, turn, 0]
        );
        layer.solid(
          box,
          [ahead(-0.13)[0], y + 0.02, ahead(-0.13)[1]],
          [0.095 * f, 0.007, 0.035 * f],
          look.colour,
          [0, turn, 0]
        );
        layer.solid(
          cone,
          [ahead(0.06)[0], y + 0.07, ahead(0.06)[1]],
          [0.035 * f, 0.09, 0.035 * f],
          SPOUT
        );
        layer.solid(
          sphere,
          [ahead(0.06)[0], y + 0.12, ahead(0.06)[1]],
          [0.06 * f, 0.03, 0.06 * f],
          SPOUT
        );
        break;
      }
      case 'derrick':
        layer.solid(box, [u, y + 0.01, v], [0.11 * f, 0.02, 0.11 * f], detail);
        layer.solid(
          pyramid,
          [u, y + 0.13, v],
          [0.075 * f, 0.24, 0.075 * f],
          look.colour,
          [0, Math.PI / 4, 0]
        );
        break;
      case 'oasis': {
        if (index === 0 && !inTheSea(layer.ground(...at))) {
          layer.disc(at, 0.1 * f, detail, LIFT.detail);
        }

        // Its palms round the pool's edge, leaning out a little.
        const [pu, pv] = [
            at[0] + Math.cos(angle) * 0.09 * f,
            at[1] + Math.sin(angle) * 0.09 * f,
          ],
          py = layer.ground(pu, pv);

        if (inTheSea(py)) {
          break;
        }

        layer.solid(
          cylinder,
          [pu, py + 0.08, pv],
          [0.014, 0.16, 0.014],
          WOOD,
          [0.15, Math.PI / 2 - angle, 0],
          'YXZ'
        );
        layer.solid(
          cone,
          [
            pu + Math.cos(angle) * SPECIAL_LEAN,
            py + 0.165,
            pv + Math.sin(angle) * SPECIAL_LEAN,
          ],
          [0.11 * f, 0.035, 0.11 * f],
          look.colour
        );
        break;
      }
      case 'peat':
        layer.solid(
          box,
          [u, y + 0.015, v],
          [0.075 * f, 0.03, 0.05 * f],
          look.colour,
          [0, turn, 0]
        );
        break;
      default:
        // A cairn: stones piled, smaller as they go up, not in the sea.
        if (inTheSea(layer.ground(...at))) {
          break;
        }

        layer.solid(
          sphere,
          [at[0], layer.ground(at[0], at[1]) + 0.018 + index * 0.027, at[1]],
          [(0.075 - index * 0.01) * f, 0.037, (0.075 - index * 0.01) * f],
          look.colour
        );
    }
  });
};

const hut = (layer: Layer, at: readonly [number, number]): void => {
  // Three round huts, thatched.
  [0, 1, 2].forEach((index) => {
    const angle =
        (index / 3) * Math.PI * 2 + fraction(layer.place.seed, 12) * Math.PI,
      u = at[0] + Math.cos(angle) * 0.06,
      v = at[1] + Math.sin(angle) * 0.06,
      y = layer.ground(u, v);

    layer.solid(cylinder, [u, y + 0.02, v], [0.05, 0.04, 0.05], WALL);
    layer.solid(cone, [u, y + 0.055, v], [0.065, 0.035, 0.065], THATCH);
  });
};

// How much room each plant takes, round where it stands, at its usual size.
const ROOM: { [kind in PlantKind]: number } = {
  conifer: 0.06,
  broadleaf: 0.07,
  // Its fronds, and their lean off its trunk.
  palm: 0.085,
  deadTree: 0.05,
  fir: 0.045,
  oak: 0.085,
  birch: 0.045,
  tropical: 0.09,
  banana: 0.06,
  bush: 0.035,
  shrub: 0.03,
  scrub: 0.03,
  reeds: 0.03,
  rock: 0.04,
  cactus: 0.03,
};

/**
 * How tall each kind of plant stands at its usual size, as the built-in set's shapes below make it: a set of models
 *  draws its plants as tall.
 */
export const PLANT_HEIGHT: { readonly [kind in PlantKind]: number } = {
  conifer: 0.21,
  broadleaf: 0.175,
  palm: 0.18,
  deadTree: 0.12,
  fir: 0.24,
  oak: 0.17,
  birch: 0.2,
  tropical: 0.25,
  banana: 0.095,
  bush: 0.0425,
  shrub: 0.05,
  scrub: 0.018,
  reeds: 0.07,
  rock: 0.032,
  cactus: 0.1,
};

// One plant, standing at (`u`, `v`), `s` times its usual size, turned `facing` about the vertical, with its `rank` for
//  thinning a set's (`ditherRank`).
const grow = (
  layer: Layer,
  plant: Plant,
  kind: PlantKind,
  u: number,
  v: number,
  s: number,
  facing: number,
  rank: number
): void => {
  const y = layer.ground(u, v),
    { colour, detail } = plant,
    model = layer.place.plantModel?.(kind) ?? null;

  // As a set of models draws it: where it stands, as tall as the built-in set's would be, and its turn.
  if (model !== null) {
    const laid = layer.soup.plants.get(model) ?? [];

    laid.push(u, y, v, PLANT_HEIGHT[kind] * s, facing, rank);
    layer.soup.plants.set(model, laid);

    return;
  }

  switch (kind) {
    case 'conifer':
      layer.solid(
        stem,
        [u, y + 0.025 * s, v],
        [0.016 * s, 0.05 * s, 0.016 * s],
        detail
      );
      layer.solid(
        tier,
        [u, y + 0.09 * s, v],
        [0.11 * s, 0.12 * s, 0.11 * s],
        colour
      );
      layer.solid(
        tier,
        [u, y + 0.16 * s, v],
        [0.08 * s, 0.1 * s, 0.08 * s],
        colour
      );
      break;
    case 'broadleaf':
      layer.solid(
        stem,
        [u, y + 0.04 * s, v],
        [0.018 * s, 0.08 * s, 0.018 * s],
        detail
      );
      layer.solid(
        crown,
        [u, y + 0.12 * s, v],
        [0.13 * s, 0.11 * s, 0.13 * s],
        colour,
        [0, facing, 0]
      );
      break;
    case 'palm':
      layer.solid(
        stem,
        [u, y + 0.08 * s, v],
        [0.012 * s, 0.16 * s, 0.012 * s],
        detail,
        [0.12, facing, 0]
      );
      layer.solid(
        tier,
        [u + 0.01 * s, y + 0.165 * s, v],
        [0.15 * s, 0.03 * s, 0.15 * s],
        colour,
        [0, facing, 0]
      );
      break;
    case 'deadTree':
      layer.solid(
        stem,
        [u, y + 0.06 * s, v],
        [0.014 * s, 0.12 * s, 0.014 * s],
        detail
      );
      layer.solid(
        box,
        [u + 0.02 * s, y + 0.09 * s, v],
        [0.006 * s, 0.05 * s, 0.006 * s],
        detail,
        [0, facing, -0.7]
      );
      break;
    case 'fir':
      // A narrow spire of three tiers.
      layer.solid(
        stem,
        [u, y + 0.03 * s, v],
        [0.014 * s, 0.06 * s, 0.014 * s],
        detail
      );
      [
        [0.08, 0.09, 0.1],
        [0.14, 0.07, 0.09],
        [0.2, 0.05, 0.08],
      ].forEach(([at, wide, tall]) =>
        layer.solid(
          tier,
          [u, y + at! * s, v],
          [wide! * s, tall! * s, wide! * s],
          colour,
          [0, facing, 0]
        )
      );
      break;
    case 'oak':
      // A thick trunk under a wide crown, and a lobe of it to one side.
      layer.solid(
        stem,
        [u, y + 0.035 * s, v],
        [0.024 * s, 0.07 * s, 0.024 * s],
        detail
      );
      layer.solid(
        crown,
        [u, y + 0.11 * s, v],
        [0.17 * s, 0.12 * s, 0.17 * s],
        colour,
        [0, facing, 0]
      );
      layer.solid(
        crown,
        [
          u + Math.cos(facing) * 0.04 * s,
          y + 0.13 * s,
          v - Math.sin(facing) * 0.04 * s,
        ],
        [0.1 * s, 0.08 * s, 0.1 * s],
        colour,
        [0, facing, 0]
      );
      break;
    case 'birch':
      // A slender white trunk, its small crown high on it.
      layer.solid(
        stem,
        [u, y + 0.06 * s, v],
        [0.011 * s, 0.12 * s, 0.011 * s],
        detail
      );
      layer.solid(
        crown,
        [u, y + 0.15 * s, v],
        [0.08 * s, 0.1 * s, 0.08 * s],
        colour,
        [0, facing, 0]
      );
      break;
    case 'tropical':
      // A tall trunk, its crown flat and wide over the canopy.
      layer.solid(
        stem,
        [u, y + 0.1 * s, v],
        [0.016 * s, 0.2 * s, 0.016 * s],
        detail
      );
      layer.solid(
        crown,
        [u, y + 0.22 * s, v],
        [0.18 * s, 0.06 * s, 0.18 * s],
        colour,
        [0, facing, 0]
      );
      break;
    case 'banana':
      // A short stem under two sprays of broad leaves.
      layer.solid(
        stem,
        [u, y + 0.03 * s, v],
        [0.014 * s, 0.06 * s, 0.014 * s],
        detail
      );
      layer.solid(
        tier,
        [u, y + 0.07 * s, v],
        [0.12 * s, 0.04 * s, 0.12 * s],
        colour,
        [0, facing, 0]
      );
      layer.solid(
        tier,
        [u, y + 0.08 * s, v],
        [0.09 * s, 0.03 * s, 0.09 * s],
        colour,
        [0, facing + 0.6, 0]
      );
      break;
    case 'bush':
      layer.solid(
        crown,
        [u, y + 0.02 * s, v],
        [0.06 * s, 0.045 * s, 0.06 * s],
        colour,
        [0, facing, 0]
      );
      break;
    case 'shrub':
      layer.solid(
        tier,
        [u, y + 0.025 * s, v],
        [0.05 * s, 0.05 * s, 0.05 * s],
        colour,
        [0, facing, 0]
      );
      layer.solid(
        tier,
        [u + 0.02 * s, y + 0.018 * s, v + 0.01 * s],
        [0.035 * s, 0.036 * s, 0.035 * s],
        colour,
        [0, facing, 0]
      );
      break;
    case 'scrub':
      // A low mound, its five sides open beneath: woods' undergrowth is mostly scrub, so it's cheap.
      layer.solid(
        tier,
        [u, y + 0.009 * s, v],
        [0.05 * s, 0.018 * s, 0.05 * s],
        colour,
        [0, facing, 0]
      );
      break;
    case 'reeds':
      [-1, 0, 1].forEach((lean) =>
        layer.solid(
          box,
          [u + lean * 0.008 * s, y + 0.035 * s, v],
          [0.005, 0.07 * s, 0.005],
          lean === 0 ? colour : detail,
          [0, facing, lean * 0.18]
        )
      );
      break;
    case 'rock':
      layer.solid(
        crown,
        [u, y + 0.012 * s, v],
        [0.07 * s, 0.04 * s, 0.06 * s],
        colour,
        [0, facing, 0]
      );
      break;
    default:
      // A cactus, and its arm.
      layer.solid(
        stem,
        [u, y + 0.05 * s, v],
        [0.018 * s, 0.1 * s, 0.018 * s],
        colour
      );
      layer.solid(
        box,
        [u + 0.015 * s, y + 0.06 * s, v],
        [0.025 * s, 0.01 * s, 0.01 * s],
        colour,
        [0, facing, 0]
      );
  }
};

/** How far each kind of plant's shape reaches round it at its usual size, which it keeps clear of what's near it. */
export { ROOM as PLANT_ROOM };

/**
 * One plant of `kind`, `s` times its usual size, laid alone on flat ground at (0, 0), turned `facing`: the built-in
 *  set's shape for it.
 */
export const plantShape = (kind: PlantKind, s = 1, facing = 0): Soup => {
  const into = soup(),
    layer = new Layer(into, {
      centre: [0, 0],
      toward: () => [0, 0],
      radius: 0.5,
      inner: 0.35,
      heightAt: () => 0,
      seed: 0,
      latitude: 0,
      outline: [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ],
      owns: () => true,
      around: [],
      period: { u: 100, v: 100 },
    });

  grow(
    layer,
    { kind, count: 1, size: [s, s], colour: '#4a7a3a', detail: '#5a4630' },
    kind,
    0,
    0,
    s,
    facing,
    0
  );

  return into;
};

// How far the point (`u`, `v`) is from the line from `a` to `b`.
const distanceTo = (
  u: number,
  v: number,
  a: readonly [number, number],
  b: readonly [number, number]
): number => {
  const du = b[0] - a[0],
    dv = b[1] - a[1],
    length = du * du + dv * dv,
    t =
      length === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((u - a[0]) * du + (v - a[1]) * dv) / length)
          );

  return Math.hypot(u - (a[0] + du * t), v - (a[1] + dv * t));
};

/**
 * Where `path` runs nearest (`u`, `v`): how far that is from its middle line, and how wide its water is either side
 *  and its level there, by where the point falls along the line between its ends, as its channel's cut takes them
 *  (`cutBy` in `rivers.ts`), so they change smoothly as the point moves.
 */
export const riverNear = (
  { points, widths, levels }: RiverPath,
  u: number,
  v: number
): [distance: number, width: number, level: number] => {
  const steps = points.length - 1,
    [su, sv] = points[0]!,
    [eu, ev] = points[steps]!,
    du = eu - su,
    dv = ev - sv,
    length = du * du + dv * dv,
    along =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((u - su) * du + (v - sv) * dv) / length)) *
          steps,
    step = Math.max(0, Math.min(steps - 1, Math.floor(along))),
    t = steps === 0 ? 0 : along - step,
    next = steps === 0 ? step : step + 1;
  let distance = Math.hypot(u - su, v - sv);

  for (let at = 0; at < steps; at++) {
    distance = Math.min(
      distance,
      distanceTo(u, v, points[at]!, points[at + 1]!)
    );
  }

  return [
    distance,
    (widths[step] ?? 0) * (1 - t) + (widths[next] ?? 0) * t,
    (levels[step] ?? 0) * (1 - t) + (levels[next] ?? 0) * t,
  ];
};

// Whether (`u`, `v`) is on one of `runs`: nearer its middle than `half` either side.
const onAnother = (u: number, v: number, runs: readonly Run[]): boolean => {
  for (const { points, half = ROAD_HALF } of runs) {
    for (let at = 1; at < points.length; at++) {
      if (distanceTo(u, v, points[at - 1]!, points[at]!) < half - 1e-9) {
        return true;
      }
    }
  }

  return false;
};

// A bridge's wall at a point along it: where its inner and outer faces stand, and how high its foot, the deck and its
//  top are.
type WallAt = {
  inner: [number, number];
  outer: [number, number];
  foot: number;
  deck: number;
  top: number;
};

// Whether a bridge's wall at `middle` is on the line between it at `a` and at `b`, where it stands and how high, so one
//  length from `a` to `b` follows it as two would.
const inLine = (a: WallAt, middle: WallAt, b: WallAt): boolean => {
  const du = b.inner[0] - a.inner[0],
    dv = b.inner[1] - a.inner[1],
    length = du * du + dv * dv,
    t =
      length === 0
        ? 0
        : ((middle.inner[0] - a.inner[0]) * du +
            (middle.inner[1] - a.inner[1]) * dv) /
          length,
    off = (
      p: readonly [number, number],
      q: readonly [number, number],
      r: readonly [number, number]
    ) =>
      Math.abs((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])),
    level = (key: 'foot' | 'deck' | 'top') =>
      Math.abs(middle[key] - (a[key] + (b[key] - a[key]) * t));

  return (
    length > 0 &&
    off(a.inner, middle.inner, b.inner) < 1e-9 &&
    off(a.outer, middle.outer, b.outer) < 1e-9 &&
    level('foot') < 1e-7 &&
    level('deck') < 1e-7 &&
    level('top') < 1e-7
  );
};

// To the left of the way (`u`, `v`), as long.
const leftOf = ([u, v]: readonly [number, number]): [number, number] => [-v, u];

/**
 * A bridge's walls along each side of a road, railroad or runway (`points`, `half` either side of its middle, laid
 *  `lift` over its deck), where it's on one: from the land or the river's bed under them to `BRIDGE.parapet` over the
 *  deck. Each stands on its edge as `Layer#ribbon` lays it, `half` along `sides` either side of each point (to its
 *  left as it goes, a unit long, or longer where two halves of a road meet at an angle, so it's on both their edges;
 *  or square to the way from the point before to the one after), so it follows its bends and ends where it does, and in
 *  lengths that follow the deck. Not where they'd stand on one of `others` (the square's other roads and railroads,
 *  and what else they open for, `Layer#crossings`, each `half` either side of its line), so they open where those join
 *  or cross it: at the square's middle, where they meet, its disc's no wider than the widest of them.
 */
const bridgeWalls = (
  layer: Layer,
  points: readonly (readonly [number, number])[],
  half: number,
  lift: number,
  css: string,
  others: readonly Run[],
  given?: readonly (readonly [number, number])[]
): void => {
  // None where no river runs through the square.
  if (!layer.bridging) {
    return;
  }

  const { thick, parapet } = BRIDGE,
    colour = colourOf(css),
    // Across it at each point, to its left as it goes.
    sides =
      given ??
      points.map((point, index) => {
        const before = points[index - 1] ?? point,
          after = points[index + 1] ?? point,
          length = Math.hypot(after[0] - before[0], after[1] - before[1]);

        return length === 0
          ? ([0, 0] as const)
          : leftOf([
              (after[0] - before[0]) / length,
              (after[1] - before[1]) / length,
            ]);
      }),
    // Its points finer, no further apart than `WALL_PIECE`, each with which way's across it there, between its points'
    //  as a ribbon has it, and which way it goes.
    along: {
      at: [number, number];
      side: [number, number];
      way: [number, number];
    }[] = [];

  points.slice(1).forEach((to, index) => {
    const from = points[index]!,
      length = Math.hypot(to[0] - from[0], to[1] - from[1]),
      fromSide = sides[index]!,
      toSide = sides[index + 1]!;

    if (length === 0) {
      return;
    }

    const pieces = Math.ceil(length / WALL_PIECE),
      last = index === points.length - 2;

    for (let piece = 0; piece <= (last ? pieces : pieces - 1); piece++) {
      const t = piece / pieces;

      along.push({
        at: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t],
        side: [
          fromSide[0] + (toSide[0] - fromSide[0]) * t,
          fromSide[1] + (toSide[1] - fromSide[1]) * t,
        ],
        way: [(to[0] - from[0]) / length, (to[1] - from[1]) / length],
      });
    }
  });

  [1, -1].forEach((hand) => {
    // Each point's wall: where its inner and outer faces stand, and how high its foot, the deck and its top are.
    const walls = along.map(({ at, side }) => {
        const inner: [number, number] = [
            at[0] + side[0] * half * hand,
            at[1] + side[1] * half * hand,
          ],
          outer: [number, number] = [
            at[0] + side[0] * (half + thick) * hand,
            at[1] + side[1] * (half + thick) * hand,
          ],
          ground = layer.ground(...inner),
          deck = Math.max(ground, layer.deckAt(...inner)) + lift;

        return {
          inner,
          outer,
          foot: Math.min(ground, layer.ground(...outer)) - 0.003,
          deck,
          top: deck + parapet,
        };
      }),
      // Whether there's a wall between each point and the next: where the edge it stands on is on a bridge's deck, there
      //  and not only at the middle, as a runway's far edge needn't be; and clear of the square's other roads and
      //  railroads.
      standing = along.slice(1).map((_, index) => {
        const { inner, outer } = walls[index]!,
          next = walls[index + 1]!,
          mu = (inner[0] + next.inner[0]) / 2,
          mv = (inner[1] + next.inner[1]) / 2;

        return (
          layer.deckAt(mu, mv) > layer.ground(mu, mv) &&
          // None of its corners on another road or railroad.
          !onAnother(inner[0], inner[1], others) &&
          !onAnother(outer[0], outer[1], others) &&
          !onAnother(next.inner[0], next.inner[1], others) &&
          !onAnother(next.outer[0], next.outer[1], others)
        );
      });

    // None shorter than `WALL_SHORTEST`.
    for (let from = 0; from < standing.length; ) {
      if (!standing[from]) {
        from++;

        continue;
      }

      let to = from,
        length = 0;

      while (to < standing.length && standing[to]) {
        const [au, av] = along[to]!.at,
          [bu, bv] = along[to + 1]!.at;

        length += Math.hypot(bu - au, bv - av);
        to++;
      }

      if (length < WALL_SHORTEST) {
        standing.fill(false, from, to);
      }

      from = to;
    }

    // Each run of it, from where it starts to where it stops, in as few lengths as follow it: one where it runs
    //  straight and its foot, the deck and its top rise or fall evenly.
    for (let from = 0; from < standing.length; ) {
      if (!standing[from]) {
        from++;

        continue;
      }

      let to = from;

      while (to < standing.length && standing[to]) {
        to++;
      }

      for (let start = from, at = from + 1; at <= to; at++) {
        if (at < to && inLine(walls[start]!, walls[at]!, walls[at + 1]!)) {
          continue;
        }

        const a = walls[start]!,
          b = walls[at]!,
          [su, sv] = along[start]!.side,
          out = Math.hypot(su, sv) || 1,
          outward: [number, number, number] = [
            (su / out) * hand,
            0,
            (sv / out) * hand,
          ];

        // Its outer face, from its foot; its inner face, over the deck; and its top.
        layer.face(
          [
            [a.outer[0], a.foot, a.outer[1]],
            [b.outer[0], b.foot, b.outer[1]],
            [b.outer[0], b.top, b.outer[1]],
            [a.outer[0], a.top, a.outer[1]],
          ],
          outward,
          colour
        );
        // From a hair under the deck, as the route's laid less finely than its walls where its deck bends.
        layer.face(
          [
            [a.inner[0], a.deck - BRIDGE.under, a.inner[1]],
            [b.inner[0], b.deck - BRIDGE.under, b.inner[1]],
            [b.inner[0], b.top, b.inner[1]],
            [a.inner[0], a.top, a.inner[1]],
          ],
          [-outward[0], 0, -outward[2]],
          colour
        );
        layer.face(
          [
            [a.inner[0], a.top, a.inner[1]],
            [a.outer[0], a.top, a.outer[1]],
            [b.outer[0], b.top, b.outer[1]],
            [b.inner[0], b.top, b.inner[1]],
          ],
          [0, 1, 0],
          colour
        );
        start = at;
      }

      // Its ends, facing out along it.
      (
        [
          [walls[from]!, along[from]!.way, -1],
          [walls[to]!, along[to - 1]!.way, 1],
        ] as const
      ).forEach(([{ inner, outer, foot, top }, [gu, gv], toward]) =>
        layer.face(
          [
            [inner[0], foot, inner[1]],
            [outer[0], foot, outer[1]],
            [outer[0], top, outer[1]],
            [inner[0], top, inner[1]],
          ],
          [gu * toward, 0, gv * toward],
          colour
        )
      );

      from = to;
    }
  });
};

// What grows on the square, each where it has room: clear of the unit's stand at its middle, its roads, its mine, hut
//  and specials, and the plants already there.
const plants = (layer: Layer, overlay: SquareOverlay): void => {
  const growth = growthOf(overlay.terrain);

  if (growth === null) {
    return;
  }

  const { centre, radius, seed } = layer.place;

  growth.plants.forEach((plant, which) => {
    for (let index = 0; index < plant.count; index++) {
      const n = 1000 + which * 97 + index * 7,
        size =
          plant.size[0] + (plant.size[1] - plant.size[0]) * fraction(seed, n),
        kind = plant.kind,
        room = roomOf(layer.place, kind) * size;

      // A few tries for a place with room.
      for (let attempt = 0; attempt < 6; attempt++) {
        const angle = fraction(seed, n + 2 + attempt * 2) * Math.PI * 2,
          out = Math.sqrt(fraction(seed, n + 3 + attempt * 2)) * radius * 0.92,
          u = centre[0] + Math.cos(angle) * out,
          v = centre[1] + Math.sin(angle) * out;

        if (layer.hasRoom(u, v, room)) {
          // Not on a lattice: ranked by a number of its own.
          grow(layer, plant, kind, u, v, size, angle, fraction(seed, n + 50));
          layer.taken.push([u, v, room]);
          layer.grown.push([u, v, kind]);
          break;
        }
      }
    }
  });
};

// Woods (`Growth#canopy`) grow as one canopy across their squares: their trees stand at the points of a lattice laid
//  over the whole ground, each jittered about its cell, each on the square the layout says it's on, so no point is
//  planted twice or past the world's edge, and the canopy runs right across the edge between two squares. The lattice
//  repeats with the world's period, so it has no seam either. Woods are whole across a square, and across the edge to a
//  neighbour of the same woods; within `MARGIN` of the edge to other ground (or the corner), they thin to a fringe, so
//  a lone square of forest is a whole wood too. Each point has numbers of its own, for whether it's planted, what grows
//  there and how big, so a neighbour turning to woods only adds trees, away from the shore (where the land under a
//  tree can fall below the sea with it): each keeps the room it would whole, and the same lines clear (its own roads,
//  and its neighbours' that cross its corners). Their undergrowth (`Growth#undergrowth`) grows the same way, on a
//  lattice of its own.
/**
 * How far apart woods' trees' lattice points are, about, where their growth doesn't say (`Growth#spacing`): as many
 *  as fit the world's period exactly. Not a whole share of a square, so the points don't line up with squares' edges,
 *  and the fringe at an edge to other ground has points at every distance from it.
 */
export const CANOPY = 0.17;

// How far a point's jittered from its cell's middle, either way, as a share of the cell: it keeps trees apart.
const JITTER = 0.3,
  // How far in from the edge to other ground the woods thin, and the share of points planted at that edge.
  MARGIN = 0.15,
  FRINGE = 0.5,
  // How big woods' plants grow against their usual, from the fringe to where they're whole.
  GROWN = [0.9, 1.3] as const;

/**
 * Round the clearing a unit stands in: how far out from where its trees may first stand they grow smaller (`GLADE`), and
 *  how small they are there (`GLADE_SIZE`), so the tallest don't wall a unit in. What grows lower than a unit's stand
 *  is thick (`STAND_HEIGHT` on the markers, 0.03) grows in the clearing too (`GROUND_COVER`), as near the middle as
 *  `COVER_CLEAR` and its room, under the stand where a unit stands on it.
 */
export const GLADE = 0.12,
  GLADE_SIZE = 0.7,
  // How much of a tree's room its crown may reach over the clearing by: over the stand's rim (0.2 from the middle), not
  //  as far in as its figures.
  CROWN_OVER = 0.35,
  GROUND_COVER = 0.03,
  COVER_CLEAR = 0.04;

// A lattice point's own fraction, the `n`th, from where it is on the world.
const pointFraction = (i: number, j: number, n: number): number =>
  fraction(Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ 0x5bd1e995, n);

/** A plant of woods, and where it stands: as `woods` lays it, without laying it. */
export type LatticePlant = {
  u: number;
  v: number;
  kind: PlantKind;
  plant: Plant;
  size: number;
  // The room it keeps, as if it were as big as it grows where the woods are whole: the same however whole they are
  //  here, so a neighbour turning to woods doesn't crowd it out.
  room: number;
  facing: number;
  // Its rank for thinning a set's: the dither's for its cell (`ditherRank`).
  rank: number;
};

// The plants of a lattice about `spacing` apart over the whole ground that are on `place`: on as many of its points as
//  `share` says where the woods are whole, fewer at their fringe, each of `plants` as often as its count says, or where
//  there are `stands`, each of its stand's plants (`standAt`). Each point's numbers are its own, from the `first`th, so
//  two lattices' points don't share theirs.
const latticePlants = (
  overlay: SquareOverlay,
  place: OverlayPlace,
  spacing: number,
  share: number,
  plants: readonly Plant[],
  first: number,
  stands?: readonly Stand[]
): LatticePlant[] => {
  const { centre, outline, owns, around, period, toward, latitude } = place,
    latitudeAt = place.latitudeAt ?? (() => latitude),
    weights = (at: number) =>
      (stands ?? []).map(
        ({ weight: [equator, poles] }) => equator + (poles - equator) * at
      ),
    cellsU = Math.max(1, Math.round(period.u / spacing)),
    stepU = period.u / cellsU,
    cellsV =
      period.v === null ? null : Math.max(1, Math.round(period.v / spacing)),
    stepV = period.v === null || cellsV === null ? spacing : period.v / cellsV,
    us = outline.map(([u]) => u),
    vs = outline.map(([, v]) => v),
    [firstI, lastI] = [
      Math.floor(Math.min(...us) / stepU) - 1,
      Math.ceil(Math.max(...us) / stepU),
    ],
    [firstJ, lastJ] = [
      Math.floor(Math.min(...vs) / stepV) - 1,
      Math.ceil(Math.max(...vs) / stepV),
    ],
    // The middles of the squares round it that aren't the same woods: other ground.
    open = around
      .filter(
        ([dx, dy]) => !overlay.woods.some(([wx, wy]) => wx === dx && wy === dy)
      )
      .map((offset) => {
        const [mu, mv] = toward(offset),
          length = Math.hypot(mu - centre[0], mv - centre[1]);

        return { mu, mv, length };
      }),
    totalOf = (each: readonly Plant[]) =>
      each.reduce((sum, { count }) => sum + count, 0),
    found: LatticePlant[] = [];

  for (let j = firstJ; j <= lastJ; j++) {
    for (let i = firstI; i <= lastI; i++) {
      // The same point at every copy of the world.
      const ci = ((i % cellsU) + cellsU) % cellsU,
        cj = cellsV === null ? j : ((j % cellsV) + cellsV) % cellsV,
        u =
          (i + 0.5 + (pointFraction(ci, cj, first + 0) * 2 - 1) * JITTER) *
          stepU,
        v =
          (j + 0.5 + (pointFraction(ci, cj, first + 1) * 2 - 1) * JITTER) *
          stepV;

      if (!owns(u, v)) {
        continue;
      }

      // How whole the woods are here, from 0 at the edge to other ground to 1 `MARGIN` in from it or more: how far in
      //  it is from the line halfway to each neighbour that's other ground, the nearest.
      const whole = open.reduce((least, { mu, mv, length }) => {
        const inward =
          length / 2 -
          ((u - centre[0]) * (mu - centre[0]) +
            (v - centre[1]) * (mv - centre[1])) /
            length;

        return Math.min(least, Math.max(0, inward) / MARGIN);
      }, 1);

      if (
        pointFraction(ci, cj, first + 2) >=
        (FRINGE + (1 - FRINGE) * whole) * share
      ) {
        continue;
      }

      // Which of its plants, or its stand's, as often as each's count says.
      const here =
        stands === undefined || stands.length === 0
          ? plants
          : stands[
              standAt({
                u,
                v,
                own: pointFraction(ci, cj, first + 4),
                period,
                latitudeAt,
                weights,
              })
            ]!.plants;
      let pick = pointFraction(ci, cj, first + 3) * totalOf(here),
        plant = here[0]!;

      for (const each of here) {
        plant = each;
        pick -= each.count;

        if (pick < 0) {
          break;
        }
      }

      const kind: PlantKind = plant.kind;

      const usual =
        plant.size[0] +
        (plant.size[1] - plant.size[0]) * pointFraction(ci, cj, first + 5);

      found.push({
        u,
        v,
        kind,
        plant,
        room: roomOf(place, kind) * usual * GROWN[1],
        // Bigger where the woods are whole, so their crowns meet.
        size: usual * (GROWN[0] + (GROWN[1] - GROWN[0]) * whole),
        facing: pointFraction(ci, cj, first + 6) * Math.PI * 2,
        rank: ditherRank(ci, cj, pointFraction(ci, cj, first + 7)),
      });
    }
  }

  return found;
};

/** The trees of woods on `place`, and where each stands: as `woods` lays them, without laying them. */
export const woodsPlants = (
  overlay: SquareOverlay,
  place: OverlayPlace,
  growth: Growth
): LatticePlant[] =>
  latticePlants(
    overlay,
    place,
    growth.spacing ?? CANOPY,
    1,
    growth.plants,
    0,
    growth.stands
  );

/** What grows under woods' trees on `place`, and where each stands: as `woods` lays it, without laying it. */
export const undergrowthPlants = (
  overlay: SquareOverlay,
  place: OverlayPlace,
  growth: Growth
): LatticePlant[] =>
  growth.undergrowth === undefined
    ? []
    : latticePlants(
        overlay,
        place,
        growth.undergrowth.spacing,
        growth.undergrowth.share,
        growth.undergrowth.plants,
        10
      );

// The roads between the square's neighbours that cross its corners (a diagonal road beside it), as its own lines.
const pathsPast = (layer: Layer, overlay: SquareOverlay): void => {
  const { centre, around, toward } = layer.place,
    // How far its furthest neighbour's middle is: two of its neighbours that far apart or nearer are neighbours.
    furthest = Math.max(
      ...around.map((offset) => {
        const [u, v] = toward(offset);

        return Math.hypot(u - centre[0], v - centre[1]);
      })
    ),
    paths = overlay.paths.map((offset) => toward(offset));

  paths.forEach((a, index) =>
    paths.slice(index + 1).forEach((b) => {
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= furthest + 1e-6) {
        layer.lines.push([a, b]);
        layer.past.push([a, b]);
      }
    })
  );
};

// Woods' trees, each where it has room clear of the unit's stand, the square's lines and what stands on it: not of
//  each other, as the lattice keeps them apart, and a tree can't see its neighbour's square.
const woods = (layer: Layer, overlay: SquareOverlay, growth: Growth): void => {
  const { heightAt, centre } = layer.place;

  woodsPlants(overlay, layer.place, growth).forEach(
    ({ u, v, kind, plant, size, room, facing, rank }) => {
      // Not in the water at the shore, but for reeds.
      if (kind !== 'reeds' && heightAt(u, v) < 0) {
        return;
      }

      // Its crown may reach over the clearing's edge by some of its room (`CROWN_OVER`), as it spreads over the unit.
      if (layer.hasRoom(u, v, room, STAND_CLEAR - room * CROWN_OVER)) {
        // Smaller near the clearing about the middle, from as near as it could stand.
        const out =
          (Math.hypot(u - centre[0], v - centre[1]) -
            STAND_CLEAR -
            room * (1 - CROWN_OVER)) /
          GLADE;

        grow(
          layer,
          plant,
          kind,
          u,
          v,
          size *
            (GLADE_SIZE + (1 - GLADE_SIZE) * Math.min(1, Math.max(0, out))),
          facing,
          rank
        );
        layer.grown.push([u, v, kind]);
      }
    }
  );

  // Under the trees, and in the clearing what's lower than a unit's stand's top, which is `GROUND_COVER` over the ground
  //  at the middle, where the land may lie lower than under the plant.
  const middle = layer.ground(centre[0], centre[1]);

  undergrowthPlants(overlay, layer.place, growth).forEach(
    ({ u, v, kind, plant, size, room, facing, rank }) => {
      if (heightAt(u, v) < 0) {
        return;
      }

      const low =
        layer.ground(u, v) + PLANT_HEIGHT[kind] * size < middle + GROUND_COVER;

      if (layer.hasRoom(u, v, room, low ? COVER_CLEAR : STAND_CLEAR)) {
        grow(layer, plant, kind, u, v, size, facing, rank);
        layer.grown.push([u, v, kind]);
      }
    }
  );
};

/**
 * Lays `overlay` for the square at `place` into `soup`. What stands on it (its mine, specials, hut, plants), where and
 *  with how much room, the lines across it they keep clear of, and its farm's buildings' footprints, which its fields
 *  keep clear of.
 */
export const layOverlay = (
  overlay: SquareOverlay,
  place: OverlayPlace,
  soup: Soup
): {
  taken: readonly (readonly [number, number, number])[];
  lines: readonly (readonly [
    readonly [number, number],
    readonly [number, number]
  ])[];
  grown: readonly (readonly [number, number, PlantKind])[];
  farm: readonly (readonly (readonly [number, number])[])[];
} => {
  const layer = new Layer(soup, place),
    { centre, radius } = place;

  // A city's lot: its sprawl, and nothing else.
  if (overlay.city !== null) {
    city(layer, overlay.city);

    return {
      taken: layer.taken,
      lines: layer.lines,
      grown: layer.grown,
      farm: [],
    };
  }

  // The lines across it, which what stands on it keeps clear of: a road's along its bend, a railroad's straight.
  [overlay.road, overlay.railroad].forEach((route) => {
    if (route !== null && drawn(route)) {
      route.joins.forEach((offset) => {
        if (route === overlay.road) {
          const half = roadHalf(place, offset).points;

          half
            .slice(1)
            .forEach((point, index) => layer.lines.push([half[index]!, point]));
          layer.runs.push({
            key: wayIndex(offset),
            points: half,
            half: ROAD_HALF,
          });

          return;
        }

        layer.lines.push([centre, halfway(place, offset)]);
        // Keyed apart from the roads' ways.
        layer.runs.push({
          key: wayIndex(offset) + 100,
          points: [centre, halfway(place, offset)],
          half: BALLAST_HALF,
        });
      });

      if (route.alone) {
        layer.lines.push([centre, centre]);
      }
    }
  });

  if (overlay.fortress) {
    const corners = fortressCorners(place);

    corners.forEach((corner, index) =>
      layer.lines.push([corner, corners[(index + 1) % 4]!])
    );
  }

  // An airbase's runway: what else stands there keeps its room clear of the line down its middle, and so of the runway.
  if (overlay.airbase) {
    const reach = radius * RUNWAY.reach;

    layer.lines.push([
      [centre[0] - reach, centre[1] + RUNWAY.south],
      [centre[0] + reach, centre[1] + RUNWAY.south],
    ]);
    layer.crossings.push({
      key: RUNWAY_KEY,
      points: [
        [centre[0] - reach, centre[1] + RUNWAY.south],
        [centre[0] + reach, centre[1] + RUNWAY.south],
      ],
      half: RUNWAY.wide / 2,
    });
  }

  if (overlay.road !== null) {
    road(layer, overlay.road);
  }

  if (overlay.railroad !== null) {
    railroad(layer, overlay.railroad);
  }

  // A city's lot with its town hidden: the unit standing in front of where its buildings are has its stand clear, as at
  //  the middle.
  if (overlay.front === true) {
    layer.taken.push([centre[0], centre[1] + IN_FRONT_OF_CITY, STAND_CLEAR]);
  }

  if (overlay.mine) {
    const [u, v, room] = layer.claimMost(...SPOTS.mine, MINE_ROOMS);

    mine(layer, [u, v], room, overlay.terrain);
  }

  if (overlay.fortress) {
    fortress(layer);
  }

  if (overlay.airbase) {
    airbase(layer);
  }

  // Roads' and railroads' bridges' walls, open for an airbase's apron, now it's laid.
  layer.later.forEach((lay) => lay());

  if (overlay.pollution) {
    pollution(layer);
  }

  overlay.specials.forEach(([terrain, feature], index) => {
    const [u, v, room] = layer.claimMost(
      ...SPOTS.special(index),
      SPECIAL_ROOMS
    );

    special(layer, specialLook(terrain, feature), [u, v], room, index + 1);
  });

  if (overlay.hut) {
    hut(layer, layer.claim(...SPOTS.hut, 0.13));
  }

  // The roads past its corners, then the houses of the cities beside it clear of them and of what's claimed its place,
  //  so a city reaching it moves nothing that was there; then fields round the houses, and plants clear of them.
  pathsPast(layer, overlay);

  const houses = suburbs(layer, overlay);

  // A farm's buildings among its fields, where no city's houses have spread onto it: clear of what's there, out of the
  //  water, as a city's houses are, where a river or the shore dips the land below it, and none where it's all wet; the
  //  fields round them.
  const farm: (readonly (readonly [number, number])[])[] = [];

  if (overlay.irrigation !== null) {
    const claimed =
      houses.length === 0
        ? layer.claimMost(...SPOTS.farm, FARM_ROOMS, (u, v, room) =>
            ROUND.every(
              ([du, dv]) => layer.ground(u + du * room, v + dv * room) >= 0
            )
          )
        : null;

    if (claimed !== null) {
      const [fu, fv, room] = claimed;

      farm.push(...farmstead(layer, overlay.irrigation, [fu, fv], room));
    }

    fields(layer, overlay.irrigation, [...houses, ...farm]);
  }

  // What grows there, but not on cleared ground: fields, a fortress, an airbase. Woods as one canopy across their
  //  squares; the rest about the square's middle.
  const growth = growthOf(overlay.terrain);

  if (
    growth !== null &&
    overlay.irrigation === null &&
    !overlay.fortress &&
    !overlay.airbase
  ) {
    if (growth.canopy !== undefined) {
      woods(layer, overlay, growth);
    } else {
      plants(layer, overlay);
    }
  }

  return { taken: layer.taken, lines: layer.lines, grown: layer.grown, farm };
};

/** The overlay of a chunk whose corner is at (`u`, `v`): each of its squares' laid together, relative to the corner. */
export const overlayMesh = (
  u: number,
  v: number,
  squares: readonly { overlay: SquareOverlay; place: OverlayPlace }[]
): OverlayMesh => {
  const laid = soup();

  squares.forEach(({ overlay, place }) => layOverlay(overlay, place, laid));

  return meshOf(u, v, laid);
};

/** The overlay of a chunk whose corner is at (`u`, `v`), from what's been laid into `laid`, relative to the corner. */
export const meshOf = (u: number, v: number, laid: Soup): OverlayMesh => {
  const positions = new Float32Array(laid.positions);

  for (let point = 0; point < positions.length; point += 3) {
    positions[point] = positions[point]! - u;
    positions[point + 2] = positions[point + 2]! - v;
  }

  const haze = new Float32Array(laid.haze.positions);

  for (let point = 0; point < haze.length; point += 3) {
    haze[point] = haze[point]! - u;
    haze[point + 2] = haze[point + 2]! - v;
  }

  return {
    u,
    v,
    positions,
    normals: new Float32Array(laid.normals),
    colours: new Float32Array(laid.colours),
    haze: { positions: haze, colours: new Float32Array(laid.haze.colours) },
    plants: Object.fromEntries(
      [...laid.plants].map(([model, numbers]) => {
        const at = new Float32Array(numbers);

        for (let n = 0; n < at.length; n += PLANT_NUMBERS) {
          at[n] = at[n]! - u;
          at[n + 2] = at[n + 2]! - v;
        }

        return [model, at];
      })
    ),
  };
};

export default overlayMesh;
