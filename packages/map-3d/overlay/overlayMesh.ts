// The shapes laid on the land (docs/3d-renderer.md §5.2, §5.4, plan 3.4), from what `overlayFor` says a square has, made
//  by code for the built-in set:
//  - roads, railroads, fields and pollution are draped over the land, sampled along it, a little above it;
//  - mines, fortresses, airbases, specials and huts are small solids standing on it, specials at sea on the water;
//  - what stands on a square stands away from its middle, where a unit stands, each at a place of its own seeded from
//    the square, so they don't line up from square to square.
//
// A chunk's squares are one mesh, their colours in its vertices: one draw call a chunk at each copy of the world, like
//  the land's (#1204). Its points are relative to the chunk's corner, as the land's are.

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
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
import {
  Plant,
  PlantKind,
  growthOf,
} from '@civ-clone/ui-models-builtin/vegetation';
import { Route, SquareOverlay } from './overlayFor';

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
};

/** A chunk's overlay as three.js takes it: triangles, each point's normal and colour, relative to its corner. */
export type OverlayMesh = {
  u: number;
  v: number;
  positions: Float32Array;
  normals: Float32Array;
  colours: Float32Array;
};

// Triangles as they're made: three numbers a point for each.
export type Soup = {
  positions: number[];
  normals: number[];
  colours: number[];
};

/** An empty soup of triangles, for squares to be laid into one at a time. */
export const soup = (): Soup => ({ positions: [], normals: [], colours: [] });

// How far over the land each kind is laid, so the later is over the earlier: fields, then roads, railroads, pollution.
const LIFT = {
    field: 0.01,
    road: 0.014,
    ballast: 0.016,
    rail: 0.02,
    smear: 0.024,
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
  SPOIL = '#7a6a58',
  THATCH = '#b89a5a',
  WALL = '#c9b48e',
  SMOG = '#34322a';

// The shapes solids are made from: each a unit across, cut to size.
const box = new BoxGeometry(1, 1, 1),
  cylinder = new CylinderGeometry(0.5, 0.5, 1, 8),
  cone = new ConeGeometry(0.5, 1, 8),
  pyramid = new ConeGeometry(0.5, 1, 4),
  sphere = new SphereGeometry(0.5, 8, 6),
  // Plants are many, thousands to a chunk: few sides each, and no ends where nothing sees them.
  stem = new CylinderGeometry(0.5, 0.5, 1, 4, 1, true),
  tier = new ConeGeometry(0.5, 1, 5, 1, true),
  crown = new SphereGeometry(0.5, 5, 3);

// Where on a square its mine, hut and specials stand, by seeded angle and how far out: plants keep clear of them.
const SPOTS = {
  mine: [3, 0.72],
  hut: [11, 0.64],
  special: (index: number): [number, number] => [index + 1, 0.72],
} as const;

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
    const e = 0.05,
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
    turn: readonly [number, number, number] = [0, 0, 0]
  ): void {
    const { positions, normals } = trianglesOf(shape),
      matrix = MATRIX.compose(
        POSITION.set(...at),
        ROTATION.setFromEuler(EULER.set(...turn)),
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
  readonly taken: [number, number, number][] = [];

  /**
   * How much more than it needs something taking `room` at (`u`, `v`) has clear: of the square's lines, of what stands
   *  there already, and of the unit's stand at its middle, the least of them. Less than none where it hasn't enough.
   */
  clearance(u: number, v: number, room: number): number {
    const [cu, cv] = this.place.centre;
    let least = Math.hypot(u - cu, v - cv) - STAND_CLEAR - room;

    this.lines.forEach(([a, b]) => {
      least = Math.min(least, distanceTo(u, v, a, b) - LINE_CLEAR - room);
    });
    this.taken.forEach(([tu, tv, other]) => {
      least = Math.min(least, Math.hypot(u - tu, v - tv) - other - room);
    });

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
    const first = fraction(this.place.seed, n) * Math.PI * 2,
      [u, v] = this.place.centre;
    let best: [number, number] = [u, v],
      most = -Infinity;

    for (const out of [distance, distance * 0.88, distance * 1.1]) {
      for (let k = 0; k < CLAIM_ANGLES; k++) {
        const angle = first + (k / CLAIM_ANGLES) * Math.PI * 2,
          at: [number, number] = [
            u + Math.cos(angle) * out * this.place.radius,
            v + Math.sin(angle) * out * this.place.radius,
          ],
          clear = this.clearance(at[0], at[1], room);

        if (clear >= 0) {
          this.taken.push([at[0], at[1], room]);

          return at;
        }

        if (clear > most) {
          best = at;
          most = clear;
        }
      }
    }

    this.taken.push([best[0], best[1], room]);

    return best;
  }
}

// Halfway to a neighbour: the neighbour lays the other half.
const halfway = (
  place: OverlayPlace,
  offset: readonly [number, number]
): [number, number] => {
  const [u, v] = place.centre,
    [nu, nv] = place.toward(offset);

  return [(u + nu) / 2, (v + nv) / 2];
};

// A road or railroad that joins nothing, and isn't on its own (beside a city, under a railroad), isn't drawn, as on the
//  2D map.
const drawn = (route: Route): boolean => route.alone || route.joins.length > 0;

const road = (layer: Layer, route: Route): void => {
  const { place } = layer;

  if (!drawn(route)) {
    return;
  }

  route.joins.forEach((offset) =>
    layer.strip(place.centre, halfway(place, offset), 0.07, ROAD, LIFT.road)
  );
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

// Rows of crops across the square, with ditches between them: more rows, and yellower, for farmland.
const fields = (layer: Layer, kind: 'irrigation' | 'farmland'): void => {
  const { centre, inner } = layer.place,
    rows = kind === 'farmland' ? 6 : 4,
    // Inside the square's outline, a diamond or a hex as much as a square, so fields don't run into their neighbours'.
    reach = inner * 0.9,
    width = (reach * 2) / rows;

  for (let row = 0; row < rows; row++) {
    const v = centre[1] - reach + width * (row + 0.5),
      colour = kind === 'farmland' ? FARMLAND[row % 2]! : FIELD;

    layer.strip(
      [centre[0] - reach, v],
      [centre[0] + reach, v],
      width * 0.8,
      colour,
      LIFT.field
    );

    if (row > 0) {
      const ditch = centre[1] - reach + width * row;

      layer.strip(
        [centre[0] - reach, ditch],
        [centre[0] + reach, ditch],
        0.016,
        DITCH,
        LIFT.field + 0.001
      );
    }
  }
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

const pollution = (layer: Layer): void => {
  const radius = layer.place.radius;

  layer.disc(layer.place.centre, radius * 0.55, SMOG, LIFT.smear, 14);
  layer.disc(layer.spot(7, 0.5), radius * 0.25, SMOG, LIFT.smear + 0.001);
};

// One special, standing round `at`.
const special = (
  layer: Layer,
  look: SpecialLook,
  at: readonly [number, number],
  n: number
): void => {
  const detail = look.detail ?? look.colour,
    jitter = (index: number, spread: number): [number, number] => [
      at[0] + (fraction(layer.place.seed, n * 31 + index * 2) - 0.5) * spread,
      at[1] +
        (fraction(layer.place.seed, n * 31 + index * 2 + 1) - 0.5) * spread,
    ],
    afloat = look.shape === 'fish' || look.shape === 'whale';

  for (let index = 0; index < look.count; index++) {
    const [u, v] = look.count === 1 ? [at[0], at[1]] : jitter(index, 0.1),
      y = layer.ground(u, v, afloat),
      facing = fraction(layer.place.seed, n * 31 + index + 17) * Math.PI * 2;

    switch (look.shape) {
      case 'rocks':
        layer.solid(
          sphere,
          [u, y + 0.012, v],
          [0.05, 0.035, 0.045],
          index % 2 === 1 ? detail : look.colour,
          [0, facing, 0]
        );
        break;
      case 'crop':
        layer.solid(cylinder, [u, y + 0.02, v], [0.008, 0.04, 0.008], detail);
        layer.solid(
          sphere,
          [u, y + 0.05, v],
          [0.045, 0.04, 0.045],
          look.colour
        );
        break;
      case 'animal': {
        const big = look.count === 1 ? 1.5 : 1;

        layer.solid(
          box,
          [u, y + 0.04 * big, v],
          [0.035 * big, 0.03 * big, 0.07 * big],
          look.colour,
          [0, facing, 0]
        );
        layer.solid(
          box,
          [
            u + Math.sin(facing) * 0.04 * big,
            y + 0.055 * big,
            v + Math.cos(facing) * 0.04 * big,
          ],
          [0.022 * big, 0.024 * big, 0.03 * big],
          detail,
          [0, facing, 0]
        );
        layer.solid(
          box,
          [u, y + 0.013 * big, v],
          [0.03 * big, 0.026 * big, 0.055 * big],
          detail,
          [0, facing, 0]
        );
        break;
      }
      case 'bird':
        layer.solid(
          sphere,
          [u, y + 0.02, v],
          [0.03, 0.025, 0.04],
          look.colour,
          [0, facing, 0]
        );
        layer.solid(
          box,
          [u - Math.sin(facing) * 0.03, y + 0.025, v - Math.cos(facing) * 0.03],
          [0.008, 0.006, 0.04],
          detail,
          [0.4, facing, 0]
        );
        break;
      case 'fish':
        layer.solid(
          sphere,
          [u, y + 0.006, v],
          [0.012, 0.01, 0.035],
          look.colour,
          [0, facing, 0]
        );
        break;
      case 'whale':
        layer.solid(sphere, [u, y, v], [0.07, 0.05, 0.2], look.colour, [
          0,
          facing,
          0,
        ]);
        layer.solid(
          box,
          [u - Math.sin(facing) * 0.11, y + 0.02, v - Math.cos(facing) * 0.11],
          [0.08, 0.006, 0.03],
          look.colour,
          [0, facing, 0]
        );
        break;
      case 'derrick':
        layer.solid(box, [u, y + 0.008, v], [0.08, 0.016, 0.08], detail);
        layer.solid(pyramid, [u, y + 0.1, v], [0.06, 0.18, 0.06], look.colour, [
          0,
          Math.PI / 4,
          0,
        ]);
        break;
      case 'oasis':
        if (index === 0) {
          layer.disc([u, v], 0.07, detail, LIFT.field + 0.002);
        }

        {
          const [pu, pv] = jitter(index + 5, 0.1),
            py = layer.ground(pu, pv);

          layer.solid(
            cylinder,
            [pu, py + 0.06, pv],
            [0.012, 0.12, 0.012],
            WOOD
          );
          layer.solid(
            cone,
            [pu, py + 0.125, pv],
            [0.09, 0.03, 0.09],
            look.colour
          );
        }
        break;
      case 'peat':
      case 'logs':
        layer.solid(
          look.shape === 'logs' ? cylinder : box,
          [u, y + 0.012, v],
          look.shape === 'logs' ? [0.022, 0.09, 0.022] : [0.05, 0.02, 0.035],
          index % 2 === 1 && look.detail !== undefined
            ? look.detail
            : look.colour,
          look.shape === 'logs' ? [0, facing, Math.PI / 2] : [0, facing, 0]
        );
        break;
      default:
        // A cairn: stones piled, smaller as they go up.
        layer.solid(
          sphere,
          [at[0], layer.ground(at[0], at[1]) + 0.012 + index * 0.018, at[1]],
          [0.05 - index * 0.007, 0.025, 0.05 - index * 0.007],
          look.colour
        );
    }
  }
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
          break;
        }
      }
    }
  });
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
} => {
  const layer = new Layer(soup, place),
    { centre, radius } = place;

  // The lines across it, which what stands on it keeps clear of.
  [overlay.road, overlay.railroad].forEach((route) => {
    if (route !== null && drawn(route)) {
      route.joins.forEach((offset) =>
        layer.lines.push([centre, halfway(place, offset)])
      );

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

  if (overlay.irrigation !== null) {
    fields(layer, overlay.irrigation);
  }

  if (overlay.road !== null) {
    road(layer, overlay.road);
  }

  if (overlay.railroad !== null) {
    railroad(layer, overlay.railroad);
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

  overlay.specials.forEach(([terrain, feature], index) =>
    special(
      layer,
      specialLook(terrain, feature),
      layer.claim(...SPOTS.special(index), 0.1),
      index + 1
    )
  );

  if (overlay.hut) {
    hut(layer, layer.claim(...SPOTS.hut, 0.13));
  }

  // What grows there, but not on cleared ground: fields, a fortress, an airbase.
  if (
    overlay.vegetation &&
    overlay.irrigation === null &&
    !overlay.fortress &&
    !overlay.airbase
  ) {
    plants(layer, overlay);
  }

  return { taken: layer.taken, lines: layer.lines };
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

  return {
    u,
    v,
    positions,
    normals: new Float32Array(laid.normals),
    colours: new Float32Array(laid.colours),
  };
};

export default overlayMesh;
