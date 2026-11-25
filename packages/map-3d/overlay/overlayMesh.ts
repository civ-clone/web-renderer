// The shapes laid on the land (docs/3d-renderer.md §5.2, §5.4, plan 3.4), from what `overlayFor` says a square has, made
//  by code for the built-in set:
//  - roads, railroads and fields are draped over the land, sampled along it, a little above it;
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
  Matrix3,
  Matrix4,
  Quaternion,
  SphereGeometry,
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
  // Its corners, as the layout has them.
  outline: readonly (readonly [number, number])[];
  // Whether a point is on this square, as the layout says (`GroundLayout#tileAt`): each point is on one square, and on
  //  none past the edge of a world that doesn't wrap.
  owns(u: number, v: number): boolean;
  // Every neighbour's offset, as the topology has them.
  around: readonly (readonly [number, number])[];
  // How far apart the world's copies are, across, and down where it wraps over the poles.
  period: { u: number; v: number | null };
};

/**
 * A chunk's overlay as three.js takes it: triangles, each point's normal and colour, relative to its corner; and its
 *  haze, see-through, as smog over pollution: triangles, each point's colour and how solid it is (four numbers a point).
 */
export type OverlayMesh = {
  u: number;
  v: number;
  positions: Float32Array;
  normals: Float32Array;
  colours: Float32Array;
  haze: { positions: Float32Array; colours: Float32Array };
};

// Triangles as they're made: three numbers a point for each; and the haze's, its colours four a point.
export type Soup = {
  positions: number[];
  normals: number[];
  colours: number[];
  haze: { positions: number[]; colours: number[] };
};

/** An empty soup of triangles, for squares to be laid into one at a time. */
export const soup = (): Soup => ({
  positions: [],
  normals: [],
  colours: [],
  haze: { positions: [], colours: [] },
});

// How far over the land each kind is laid, so the later is over the earlier: fields, then roads, railroads.
const LIFT = {
    field: 0.01,
    road: 0.014,
    ballast: 0.016,
    rail: 0.02,
  },
  // How finely a draped strip follows the land: finer than the land's points are apart (0.125).
  STEP = 0.06,
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
  THATCH = '#b89a5a',
  WALL = '#c9b48e',
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
  sphere = new SphereGeometry(0.5, 8, 6),
  // Plants are many, thousands to a chunk: few sides each, and no ends where nothing sees them.
  stem = new CylinderGeometry(0.5, 0.5, 1, 4, 1, true),
  tier = new ConeGeometry(0.5, 1, 5, 1, true),
  crown = new SphereGeometry(0.5, 5, 3),
  // A log, open at its ends, which its cut ends close, each a flat disc facing out.
  log = new CylinderGeometry(0.5, 0.5, 1, 8, 1, true),
  cutEnd = new CircleGeometry(0.5, 8);

// Where on a square its mine, hut and specials stand, by seeded angle and how far out: plants keep clear of them.
const SPOTS = {
  mine: [3, 0.72],
  hut: [11, 0.64],
  special: (index: number): [number, number] => [index + 1, 0.85],
} as const;

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

/** Lays shapes for one square into a soup of triangles. */
class Layer {
  readonly soup: Soup;
  readonly place: OverlayPlace;

  constructor(soup: Soup, place: OverlayPlace) {
    this.soup = soup;
    this.place = place;
  }

  // The land's height at a point; at sea, the water's surface.
  ground(u: number, v: number, afloat = false): number {
    const height = this.place.heightAt(u, v);

    return afloat ? Math.max(0, height) : height;
  }

  // The land's normal at a point, from its height either side.
  #normal(u: number, v: number): [number, number, number] {
    const e = NORMAL_STEP,
      du =
        (this.place.heightAt(u + e, v) - this.place.heightAt(u - e, v)) /
        (2 * e),
      dv =
        (this.place.heightAt(u, v + e) - this.place.heightAt(u, v - e)) /
        (2 * e),
      length = Math.hypot(du, 1, dv);

    return [-du / length, 1 / length, -dv / length];
  }

  #point(
    u: number,
    v: number,
    lift: number,
    colour: [number, number, number]
  ): void {
    this.soup.positions.push(u, this.ground(u, v) + lift, v);
    this.soup.normals.push(...this.#normal(u, v));
    this.soup.colours.push(...colour);
  }

  /** A strip `width` wide draped over the land from one point to another, `lift` over it. */
  strip(
    from: readonly [number, number],
    to: readonly [number, number],
    width: number,
    css: string,
    lift: number
  ): void {
    const colour = colourOf(css),
      length = Math.hypot(to[0] - from[0], to[1] - from[1]);

    if (length === 0) {
      return;
    }

    // Cut along it and across it finer than the land's points are apart, so it follows the land between them too.
    const steps = Math.max(1, Math.ceil(length / STEP)),
      strands = Math.max(1, Math.ceil(width / STEP)),
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

        // Two triangles, wound anticlockwise seen from above (`v` runs south), so they face up and aren't culled.
        this.#point(u0, v0, lift, colour);
        this.#point(u1, v1, lift, colour);
        this.#point(u2, v2, lift, colour);
        this.#point(u1, v1, lift, colour);
        this.#point(u3, v3, lift, colour);
        this.#point(u2, v2, lift, colour);
      }
    }
  }

  /**
   * A ribbon `width` wide draped over the land along `points`, `lift` over it: across it at each point square to the
   *  way it goes there (`ways`, or from the point before to the one after), so it bends with no notch on the outside of
   *  a bend, as strips end to end would leave.
   */
  ribbon(
    points: readonly (readonly [number, number])[],
    width: number,
    css: string,
    lift: number,
    ways?: readonly (readonly [number, number])[]
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

      // Cut along it and across it finer than the land's points are apart, so it follows the land between them too.
      const steps = Math.max(1, Math.ceil(length / STEP)),
        strands = Math.max(1, Math.ceil(width / STEP)),
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
          this.#point(u0, v0, lift, colour);
          this.#point(u1, v1, lift, colour);
          this.#point(u2, v2, lift, colour);
          this.#point(u1, v1, lift, colour);
          this.#point(u3, v3, lift, colour);
          this.#point(u2, v2, lift, colour);
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

  /** A disc `radius` across draped over the land round `centre`, `lift` over it. */
  disc(
    centre: readonly [number, number],
    radius: number,
    css: string,
    lift: number,
    sides = 12
  ): void {
    const colour = colourOf(css),
      [u, v] = centre,
      // In rings no further apart than the land's points, so a wide one follows the land too.
      rings = Math.max(1, Math.ceil(radius / STEP)),
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
          this.#point(u, v, lift, colour);
          this.#point(...outerB, lift, colour);
          this.#point(...outerA, lift, colour);
        } else {
          const innerA = at(ring, side),
            innerB = at(ring, side + 1);

          this.#point(...innerA, lift, colour);
          this.#point(...innerB, lift, colour);
          this.#point(...outerA, lift, colour);
          this.#point(...innerB, lift, colour);
          this.#point(...outerB, lift, colour);
          this.#point(...outerA, lift, colour);
        }
      }
    }
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
  readonly taken: [number, number, number][] = [];
  // Where each plant grown stands, and what it is.
  readonly grown: [number, number, PlantKind][] = [];

  /**
   * How much more than it needs something taking `room` at (`u`, `v`) has clear: of the square's lines, of what stands
   *  there already, and of the unit's stand at its middle, the least of them; and, if it's to stay `inside`, of the
   *  square's edge, but for `EDGE_REACH`. Less than none where it hasn't enough.
   */
  clearance(u: number, v: number, room: number, inside = false): number {
    const [cu, cv] = this.place.centre,
      { outline } = this.place;
    let least = Math.hypot(u - cu, v - cv) - STAND_CLEAR - room;

    this.lines.forEach(([a, b]) => {
      least = Math.min(least, distanceTo(u, v, a, b) - LINE_CLEAR - room);
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

  /** Whether (`u`, `v`) has `room` clear of the square's lines, of what stands there already, and of the stand. */
  hasRoom(u: number, v: number, room: number): boolean {
    return this.clearance(u, v, room) >= 0;
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
   *  last of `rooms` where none has room for any.
   */
  claimMost(
    n: number,
    distance: number,
    rooms: readonly number[]
  ): [number, number, number] {
    let found = this.#search(n, distance, rooms[0]!, true),
      room = rooms[0]!;

    for (const each of rooms.slice(1)) {
      if (found.clear >= 0) {
        break;
      }

      found = this.#search(n, distance, each, true);
      room = each;
    }

    this.taken.push([found.at[0], found.at[1], room]);

    return [found.at[0], found.at[1], room];
  }

  // The first place with room, as `claim` tries them, or the one with the most, and how much it has to spare.
  #search(
    n: number,
    distance: number,
    room: number,
    inside = false
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

  route.joins.forEach((offset) => {
    const { points, ways } = roadHalf(place, offset);

    layer.ribbon(points, 0.07, ROAD, LIFT.road, ways);
  });
  layer.disc(place.centre, route.alone ? 0.09 : 0.035, ROAD, LIFT.road);
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
      : route.joins.map((offset) => halfway(place, offset));

  ends.forEach((end) => {
    const [u, v] = place.centre,
      length = Math.hypot(end[0] - u, end[1] - v),
      // Across the line, a rail's distance from its middle.
      side: [number, number] =
        length === 0
          ? [0, 0]
          : [(-(end[1] - v) / length) * 0.025, ((end[0] - u) / length) * 0.025];

    layer.strip(place.centre, end, 0.1, BALLAST, LIFT.ballast);

    // Sleepers across it, then the two rails over them.
    for (let t = 0.1; t < 1; t += 0.2) {
      const at: [number, number] = [u + (end[0] - u) * t, v + (end[1] - v) * t];

      layer.strip(
        [at[0] + side[0] * 1.8, at[1] + side[1] * 1.8],
        [at[0] - side[0] * 1.8, at[1] - side[1] * 1.8],
        0.014,
        SLEEPER,
        LIFT.ballast + 0.002
      );
    }

    [1, -1].forEach((way) =>
      layer.strip(
        [u + side[0] * way, v + side[1] * way],
        [end[0] + side[0] * way, end[1] + side[1] * way],
        0.01,
        RAIL,
        LIFT.rail
      )
    );
  });

  layer.disc(place.centre, 0.05, BALLAST, LIFT.ballast);
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
  houses: readonly (readonly (readonly [number, number])[])[]
): [number, number][] => {
  const blocked = houses
      .filter(
        (corners) =>
          Math.min(...corners.map(([, cv]) => cv)) - GAP < v + width / 2 &&
          Math.max(...corners.map(([, cv]) => cv)) + GAP > v - width / 2
      )
      .map((corners): [number, number] => [
        Math.min(...corners.map(([cu]) => cu)) - GAP,
        Math.max(...corners.map(([cu]) => cu)) + GAP,
      ])
      .sort((a, b) => a[0] - b[0]),
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

// Rows of crops across the square, with ditches between them: more rows, and yellower, for farmland. They give way to a
//  city's houses on the square, stopping short of them.
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
      rowAround(centre[0] - reach, centre[0] + reach, v, wide, houses).forEach(
        ([a, b]) => layer.strip([a, v], [b, v], wide, colour, lift)
      );

  for (let row = 0; row < rows; row++) {
    across(
      centre[1] - reach + width * (row + 0.5),
      width * 0.8,
      kind === 'farmland' ? FARMLAND[row % 2]! : FIELD,
      LIFT.field
    );

    if (row > 0) {
      across(centre[1] - reach + width * row, 0.016, DITCH, LIFT.field + 0.001);
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
  // How tall a building's storey is, and how wide its walls are, under the eaves of a roof its lot's width.
  STOREY = 0.045,
  WALLED = 0.86;

/**
 * A city's sprawl on its lot (`sprawl.ts`): its plaza paved, its streets out to the roads and its quay, and a building
 *  on each lot built, facing its way, its roof's eaves out to the lot's edges, standing on the land where it is.
 */
const city = (layer: Layer, plan: CityPlan): void => {
  const { place } = layer,
    [u, v] = place.centre,
    { plaza, streets, lots } = sprawl(place, plan, [u, v + IN_FRONT_OF_CITY]);

  layer.disc(plaza.at, plaza.radius, PAVING, LIFT.road, 16);
  streets.forEach(([from, to]) =>
    layer.strip(from, to, STREET, PAVING, LIFT.road)
  );
  lots.forEach((lot) => house(layer, lot));
};

// A house on its lot, facing its way, its roof's eaves out to the lot's edges, standing on the land where it is.
const house = (layer: Layer, lot: Lot): void => {
  const {
      at: [bu, bv],
      width,
      facing,
      storeys,
    } = lot,
    // From the lowest of the ground under it, so it stands on a slope with no gap under any corner, to its storeys over
    //  the highest.
    grounds = [[bu, bv] as const, ...footprintOf(lot)].map(([gu, gv]) =>
      layer.ground(gu, gv)
    ),
    low = Math.min(...grounds) - 0.005,
    top = Math.max(...grounds) + STOREY * storeys;

  layer.solid(
    box,
    [bu, (low + top) / 2, bv],
    [width * WALLED, top - low, width * WALLED],
    HOUSE,
    [0, facing, 0]
  );
  // A four-sided cone, turned an eighth to square with the walls: its base's corners at half its size, so a base
  //  `width` across, out to the lot's edges.
  layer.solid(
    pyramid,
    [bu, top + width * 0.2, bv],
    [width * Math.SQRT2, width * 0.4, width * Math.SQRT2],
    ROOFS[Math.floor(lot.roof * ROOFS.length)]!,
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

const mine = (layer: Layer, [u, v]: readonly [number, number]): void => {
  const y = layer.ground(u, v);

  // A headframe: two legs leaning together, and its wheel.
  layer.solid(
    box,
    [u - 0.02, y + 0.05, v],
    [0.01, 0.11, 0.01],
    WOOD,
    [0, 0, -0.3]
  );
  layer.solid(
    box,
    [u + 0.02, y + 0.05, v],
    [0.01, 0.11, 0.01],
    WOOD,
    [0, 0, 0.3]
  );
  layer.solid(cylinder, [u, y + 0.1, v], [0.05, 0.008, 0.05], '#3a3a3a', [
    Math.PI / 2,
    0,
    0,
  ]);
  // Spoil heaps beside it.
  [
    [0.07, 0.03],
    [-0.05, 0.06],
  ].forEach(([du, dv]) => {
    const hu = u + du!,
      hv = v + dv!;

    layer.solid(
      cone,
      [hu, layer.ground(hu, hv) + 0.02, hv],
      [0.07, 0.04, 0.07],
      SPOIL
    );
  });
};

const fortress = (layer: Layer): void => {
  const [u, v] = layer.place.centre,
    half = layer.place.radius * 0.62,
    y = layer.ground(u, v);

  // Four walls round the middle, and a tower at each corner.
  [
    [0, -half, half * 2, 0.025],
    [0, half, half * 2, 0.025],
    [-half, 0, 0.025, half * 2],
    [half, 0, 0.025, half * 2],
  ].forEach(([du, dv, su, sv]) => {
    const wu = u + du!,
      wv = v + dv!;

    layer.solid(
      box,
      [wu, Math.max(y, layer.ground(wu, wv)) + 0.02, wv],
      [su!, 0.05, sv!],
      STONE
    );
  });
  [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ].forEach(([du, dv]) => {
    const tu = u + du!,
      tv = v + dv!;

    layer.solid(
      cylinder,
      [tu, layer.ground(tu, tv) + 0.035, tv],
      [0.045, 0.07, 0.045],
      STONE
    );
  });
};

const airbase = (layer: Layer): void => {
  const [u, v] = layer.place.centre,
    reach = layer.place.radius * 0.75,
    [hu, hv] = layer.claim(5, 0.6, 0.08);

  layer.strip(
    [u - reach, v + 0.12],
    [u + reach, v + 0.12],
    0.12,
    TARMAC,
    LIFT.road + 0.002
  );
  layer.strip(
    [u - reach * 0.9, v + 0.12],
    [u + reach * 0.9, v + 0.12],
    0.008,
    '#e8e8e8',
    LIFT.road + 0.004
  );
  layer.solid(
    box,
    [hu, layer.ground(hu, hv) + 0.03, hv],
    [0.12, 0.06, 0.08],
    '#8a9096'
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
          layer.disc(at, 0.1 * f, detail, LIFT.field + 0.002);
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
  palm: 0.06,
  deadTree: 0.05,
  bush: 0.035,
  shrub: 0.03,
  scrub: 0.03,
  reeds: 0.03,
  rock: 0.04,
  cactus: 0.03,
};

// One plant, standing at (`u`, `v`), `s` times its usual size, turned `facing` about the vertical.
const grow = (
  layer: Layer,
  plant: Plant,
  kind: PlantKind,
  u: number,
  v: number,
  s: number,
  facing: number
): void => {
  const y = layer.ground(u, v),
    { colour, detail } = plant;

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
      layer.solid(
        crown,
        [u, y + 0.008 * s, v],
        [0.05 * s, 0.02 * s, 0.05 * s],
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

// What grows on the square, each where it has room: clear of the unit's stand at its middle, its roads, its mine, hut
//  and specials, and the plants already there. A forest's trees are conifers towards the poles, broadleaf otherwise.
const plants = (layer: Layer, overlay: SquareOverlay): void => {
  const growth = growthOf(overlay.terrain);

  if (growth === null) {
    return;
  }

  const { centre, radius, seed, latitude } = layer.place;

  growth.plants.forEach((plant, which) => {
    for (let index = 0; index < plant.count; index++) {
      const n = 1000 + which * 97 + index * 7,
        size =
          plant.size[0] + (plant.size[1] - plant.size[0]) * fraction(seed, n),
        conifers = growth.conifers,
        // A forest's tree: a conifer as often as its latitude says.
        kind: PlantKind =
          conifers !== undefined &&
          fraction(seed, n + 1) >=
            conifers[0] + (conifers[1] - conifers[0]) * latitude
            ? 'broadleaf'
            : plant.kind,
        room = ROOM[kind] * size;

      // A few tries for a place with room.
      for (let attempt = 0; attempt < 6; attempt++) {
        const angle = fraction(seed, n + 2 + attempt * 2) * Math.PI * 2,
          out = Math.sqrt(fraction(seed, n + 3 + attempt * 2)) * radius * 0.92,
          u = centre[0] + Math.cos(angle) * out,
          v = centre[1] + Math.sin(angle) * out;

        if (layer.hasRoom(u, v, room)) {
          grow(layer, plant, kind, u, v, size, angle);
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
//  and its neighbours' that cross its corners).
/**
 * How far apart woods' lattice points are, about: as many as fit the world's period exactly. Not a whole share of a
 *  square, so the points don't line up with squares' edges, and the fringe at an edge to other ground has points at
 *  every distance from it.
 */
export const CANOPY = 0.26;

// How far a point's jittered from its cell's middle, either way, as a share of the cell: it keeps trees apart.
const JITTER = 0.3,
  // How far in from the edge to other ground the woods thin, and the share of points planted at that edge.
  MARGIN = 0.15,
  FRINGE = 0.5,
  // How big woods' plants grow against their usual, from the fringe to where they're whole.
  GROWN = [0.9, 1.3] as const;

// A lattice point's own fraction, the `n`th, from where it is on the world.
const pointFraction = (i: number, j: number, n: number): number =>
  fraction(Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ 0x5bd1e995, n);

/** The trees of woods on `place`, and where each stands: as `woods` lays them, without laying them. */
export const woodsPlants = (
  overlay: SquareOverlay,
  place: OverlayPlace,
  growth: Growth
): {
  u: number;
  v: number;
  kind: PlantKind;
  plant: Plant;
  size: number;
  // The room it keeps, as if it were as big as it grows where the woods are whole: the same however whole they are
  //  here, so a neighbour turning to woods doesn't crowd it out.
  room: number;
  facing: number;
}[] => {
  const { centre, outline, owns, around, period, toward, latitude } = place,
    cellsU = Math.max(1, Math.round(period.u / CANOPY)),
    stepU = period.u / cellsU,
    cellsV =
      period.v === null ? null : Math.max(1, Math.round(period.v / CANOPY)),
    stepV = period.v === null || cellsV === null ? CANOPY : period.v / cellsV,
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
    total = growth.plants.reduce((sum, { count }) => sum + count, 0),
    found: ReturnType<typeof woodsPlants> = [];

  for (let j = firstJ; j <= lastJ; j++) {
    for (let i = firstI; i <= lastI; i++) {
      // The same point at every copy of the world.
      const ci = ((i % cellsU) + cellsU) % cellsU,
        cj = cellsV === null ? j : ((j % cellsV) + cellsV) % cellsV,
        u = (i + 0.5 + (pointFraction(ci, cj, 0) * 2 - 1) * JITTER) * stepU,
        v = (j + 0.5 + (pointFraction(ci, cj, 1) * 2 - 1) * JITTER) * stepV;

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

      if (pointFraction(ci, cj, 2) >= FRINGE + (1 - FRINGE) * whole) {
        continue;
      }

      // Which of its plants, as often as each's count says.
      let pick = pointFraction(ci, cj, 3) * total,
        plant = growth.plants[0]!;

      for (const each of growth.plants) {
        plant = each;
        pick -= each.count;

        if (pick < 0) {
          break;
        }
      }

      const conifers = growth.conifers,
        kind: PlantKind =
          conifers !== undefined &&
          pointFraction(ci, cj, 4) >=
            conifers[0] + (conifers[1] - conifers[0]) * latitude
            ? 'broadleaf'
            : plant.kind;

      const usual =
        plant.size[0] +
        (plant.size[1] - plant.size[0]) * pointFraction(ci, cj, 5);

      found.push({
        u,
        v,
        kind,
        plant,
        room: ROOM[kind] * usual * GROWN[1],
        // Bigger where the woods are whole, so their crowns meet.
        size: usual * (GROWN[0] + (GROWN[1] - GROWN[0]) * whole),
        facing: pointFraction(ci, cj, 6) * Math.PI * 2,
      });
    }
  }

  return found;
};

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
  const { heightAt } = layer.place;

  woodsPlants(overlay, layer.place, growth).forEach(
    ({ u, v, kind, plant, size, room, facing }) => {
      // Not in the water at the shore, but for reeds.
      if (kind !== 'reeds' && heightAt(u, v) < 0) {
        return;
      }

      if (layer.hasRoom(u, v, room)) {
        grow(layer, plant, kind, u, v, size, facing);
        layer.grown.push([u, v, kind]);
      }
    }
  );
};

/**
 * Lays `overlay` for the square at `place` into `soup`. What stands on it (its mine, specials, hut, plants), where and
 *  with how much room, and the lines across it they keep clear of.
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
} => {
  const layer = new Layer(soup, place),
    { centre, radius } = place;

  // A city's lot: its sprawl, and nothing else.
  if (overlay.city !== null) {
    city(layer, overlay.city);

    return { taken: layer.taken, lines: layer.lines, grown: layer.grown };
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
          layer.runs.push({ key: wayIndex(offset), points: half });

          return;
        }

        layer.lines.push([centre, halfway(place, offset)]);
        // Keyed apart from the roads' ways.
        layer.runs.push({
          key: wayIndex(offset) + 100,
          points: [centre, halfway(place, offset)],
        });
      });

      if (route.alone) {
        layer.lines.push([centre, centre]);
      }
    }
  });

  if (overlay.fortress) {
    const half = radius * 0.62,
      corners: [number, number][] = [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half],
      ].map(([du, dv]) => [centre[0] + du!, centre[1] + dv!]);

    corners.forEach((corner, index) =>
      layer.lines.push([corner, corners[(index + 1) % 4]!])
    );
  }

  if (overlay.airbase) {
    const reach = radius * 0.75;

    layer.lines.push([
      [centre[0] - reach, centre[1] + 0.12],
      [centre[0] + reach, centre[1] + 0.12],
    ]);
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
    mine(layer, layer.claim(...SPOTS.mine, 0.1));
  }

  if (overlay.fortress) {
    fortress(layer);
  }

  if (overlay.airbase) {
    airbase(layer);
  }

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

  if (overlay.irrigation !== null) {
    fields(layer, overlay.irrigation, houses);
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

  return { taken: layer.taken, lines: layer.lines, grown: layer.grown };
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
  };
};

export default overlayMesh;
