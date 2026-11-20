// A city's sprawl on its own square on the 3D map (docs/3d-renderer.md §7.2, plan 4.1): a plaza at its middle, streets
//  from it out to each way a road comes in and down to its quay, and lots along them and round them, each holding a
//  building. Pure, and seeded from the city: the same city at the same size, on the same roads, is laid out the same
//  every time.
//
// - The lots are one seeded sequence, nearest the middle first, from a jostled grid over the square. A city of a size
//   takes that many from the front: one that grows keeps its buildings and adds the next out; one that shrinks loses
//   the outermost. Nothing about a lot hangs on the size but its storeys.
// - A lot beside a street faces it, square to it, so the houses line it; any other faces the plaza.
// - Each building's footprint, out to its eaves, is clear of the streets, the plaza, the stand of a unit in front of
//   the buildings and the ring at its feet, and every lot before it, and inside the walls' ring. So a road built to the
//   city runs a street in through the lots in its way, rather than laying the city out afresh.
// - All on the city's own square; neighbouring squares are for a later slice.

/** A square a city stands on, as the overlay knows it (`OverlayPlace`). */
export type SprawlPlace = {
  centre: readonly [number, number];
  // The middle of the neighbour `offset` away, at the copy of the world nearest this square.
  toward(offset: readonly [number, number]): readonly [number, number];
  // Whether a point is on this square.
  owns(u: number, v: number): boolean;
};

/**
 * A lot: where its building stands, how wide its footprint is (a square, out to its roof's eaves), which way its front
 *  faces (as `atan2` of the way, `u` then `v`), how many storeys it has, and which of a city's roofs it has, as a share
 *  from 0 to 1, its own however many lots a street clears before it.
 */
export type Lot = {
  at: [number, number];
  width: number;
  facing: number;
  storeys: number;
  roof: number;
};

/** A city laid out: its plaza, its streets (each from the plaza's edge to the edge of the square), and its lots. */
export type CityLayout = {
  plaza: { at: readonly [number, number]; radius: number };
  streets: [readonly [number, number], readonly [number, number]][];
  lots: Lot[];
};

/**
 * What a city's sprawl is laid out from: its seed, how many lots it has built (`lotsFor`), how many storeys taller
 *  those near its middle stand (`tierFor`), the ways its streets go out, and its neighbours of sea, one of which its
 *  quay's street goes down to, by their offsets.
 */
export type CityPlan = {
  seed: number;
  lots: number;
  tier: number;
  ways: (readonly [number, number])[];
  sea: (readonly [number, number])[];
};

/** A city's walls: the ring they stand on, from the square's middle, and how thick they are, from it each way. */
export const WALLS = { radius: 0.42, thickness: 0.025 } as const;

/** How far from the middle a building reaches, at the most: the walls' inner edge. */
export const SPRAWL_REACH = WALLS.radius - WALLS.thickness;

/** How far across the plaza is, from the middle. */
export const PLAZA = 0.07;

/** How wide a street is. */
export const STREET = 0.04;

/**
 * How far round the spot in front of the buildings where a unit stands is kept clear: its stand, and the ring at the
 *  feet of the one awaiting orders, or a fortified one's bank.
 */
export const UNIT_ROOM = 0.25;

/** The room left round each building, at the least. */
export const GAP = 0.004;

// How far apart lots are laid, before they're jostled, and how far they're jostled.
const SPACING = 0.08,
  JOSTLE = 0.012;

// How wide a building's footprint is at the narrowest, and how much wider some are.
const NARROWEST = 0.045,
  WIDER = 0.02;

// Mixed into the city's seed for its roofs, so they're seeded apart from where its lots stand.
const ROOFED = 0x2545f491;

// How far out from the middle buildings stand taller as the city grows.
const MIDDLE = 0.18;

// How many lots a city has at the most on its own square, and how many it has at size 1.
const MOST = 30,
  FIRST = 5;

/** How many lots a city of `size` has built on its own square: more as it grows, up to as many as fit. */
export const lotsFor = (size: number): number =>
  Math.min(MOST, FIRST + Math.max(0, size - 1) * 2);

/** How many storeys taller the buildings near a city's middle stand at `size`: one more each six sizes. */
export const tierFor = (size: number): number =>
  Math.floor(Math.max(0, size - 1) / 6);

/** A number for a city from its id: the same every time. */
export const citySeed = (id: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < id.length; index++) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }

  return hash >>> 0;
};

/** What a city seeded `seed` of `size` is laid out from, with its streets out the `ways`, and the `sea` beside it. */
export const planFor = (
  seed: number,
  size: number,
  ways: readonly (readonly [number, number])[],
  sea: readonly (readonly [number, number])[] = []
): CityPlan => ({
  seed,
  lots: lotsFor(size),
  tier: tierFor(size),
  ways: [...ways],
  sea: [...sea],
});

/**
 * The way down to the quay of a city on the square at `place`, beside the `sea` (its neighbours' offsets): the one most
 *  nearly the way they lie on the ground, taken together, so it has one quay however much sea's beside it. None, with
 *  none.
 */
export const quayOf = (
  place: SprawlPlace,
  sea: readonly (readonly [number, number])[]
): (readonly [number, number])[] => {
  const [u, v] = place.centre,
    ways = sea.map((offset) => {
      const [nu, nv] = place.toward(offset),
        length = Math.hypot(nu - u, nv - v);

      return {
        offset,
        du: length === 0 ? 0 : (nu - u) / length,
        dv: length === 0 ? 0 : (nv - v) / length,
      };
    }),
    su = ways.reduce((sum, { du }) => sum + du, 0),
    sv = ways.reduce((sum, { dv }) => sum + dv, 0),
    most = ({ du, dv }: { du: number; dv: number }): number =>
      du * su + dv * sv;

  return ways.length === 0
    ? []
    : [
        ways.reduce((best, way) => (most(way) > most(best) ? way : best))
          .offset,
      ];
};

// A share, 0 to 1, from a seed and a number: the same each time.
const share = (seed: number, n: number): number => {
  let h = Math.imul(seed ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b);

  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  return (h >>> 0) / 4294967296;
};

type Point = readonly [number, number];

// Where `p` falls along the segment `a`–`b`, from 0 at `a` to 1 at `b`, past them off its ends.
const along = (p: Point, a: Point, b: Point): number => {
  const du = b[0] - a[0],
    dv = b[1] - a[1],
    length = du * du + dv * dv;

  return length === 0 ? 0 : ((p[0] - a[0]) * du + (p[1] - a[1]) * dv) / length;
};

/** A lot's footprint: its four corners, turned to face its way. */
export const footprintOf = ({
  at: [u, v],
  width,
  facing,
}: Pick<Lot, 'at' | 'width' | 'facing'>): Point[] => {
  const half = width / 2,
    // Across its front, and the way it faces.
    across = [Math.cos(facing) * half, -Math.sin(facing) * half],
    ahead = [Math.sin(facing) * half, Math.cos(facing) * half];

  return [
    [u - across[0]! - ahead[0]!, v - across[1]! - ahead[1]!],
    [u + across[0]! - ahead[0]!, v + across[1]! - ahead[1]!],
    [u + across[0]! + ahead[0]!, v + across[1]! + ahead[1]!],
    [u - across[0]! + ahead[0]!, v - across[1]! + ahead[1]!],
  ];
};

/** A street's strip: its four corners, `STREET` wide. */
export const stripOf = ([a, b]: readonly [Point, Point]): Point[] => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
    nu = (-(b[1] - a[1]) / length) * (STREET / 2),
    nv = ((b[0] - a[0]) / length) * (STREET / 2);

  return [
    [a[0] + nu, a[1] + nv],
    [b[0] + nu, b[1] + nv],
    [b[0] - nu, b[1] - nv],
    [a[0] - nu, a[1] - nv],
  ];
};

/** Whether two convex shapes, by their corners in order, are at least `gap` apart, along one of their sides' ways. */
export const apart = (p: Point[], q: Point[], gap: number): boolean =>
  [p, q].some((shape) =>
    shape.some((corner, index) => {
      const next = shape[(index + 1) % shape.length]!,
        length = Math.hypot(next[0] - corner[0], next[1] - corner[1]),
        nu = -(next[1] - corner[1]) / length,
        nv = (next[0] - corner[0]) / length,
        onto = (points: Point[]) => points.map(([u, v]) => u * nu + v * nv),
        ps = onto(p),
        qs = onto(q);

      return (
        Math.min(...qs) - Math.max(...ps) >= gap ||
        Math.min(...ps) - Math.max(...qs) >= gap
      );
    })
  );

/** How far the point `at` is from the footprint `corners` (a square, turned), or none inside it. */
export const fromFootprint = (at: Point, corners: Point[]): number => {
  const [a, b, , d] = corners as [Point, Point, Point, Point],
    // How far along each side it is, and how far past their ends.
    across = along(at, a, b),
    ahead = along(at, a, d),
    width = Math.hypot(b[0] - a[0], b[1] - a[1]);

  return (
    Math.hypot(
      Math.max(0, -across, across - 1),
      Math.max(0, -ahead, ahead - 1)
    ) * width
  );
};

/**
 * The sprawl of a city planned as `plan` on the square at `place`, with streets out the plan's ways (its neighbours'
 *  offsets: those a road comes in from, and its quay's), and a unit's spot kept clear at `inFront`.
 */
export const sprawl = (
  place: SprawlPlace,
  { seed, lots: built, tier, ways, sea }: CityPlan,
  inFront: Point
): CityLayout => {
  const [u, v] = place.centre,
    streets = [...ways, ...quayOf(place, sea)].flatMap(
      (offset): [Point, Point][] => {
        const [nu, nv] = place.toward(offset),
          edge: [number, number] = [(u + nu) / 2, (v + nv) / 2],
          du = edge[0] - u,
          dv = edge[1] - v,
          length = Math.hypot(du, dv);

        return length === 0
          ? []
          : [[[u + (du / length) * PLAZA, v + (dv / length) * PLAZA], edge]];
      }
    ),
    strips = streets.map(stripOf),
    // Which way a lot at `at` faces: square to the street it's beside, towards it, if it's beside one, or else to the
    //  plaza.
    facingAt = (at: Point, width: number): number => {
      const beside = streets
        .map(([a, b]) => {
          const t = along(at, a, b),
            near: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

          return {
            t,
            near,
            off: Math.hypot(near[0] - at[0], near[1] - at[1]),
          };
        })
        .filter(
          ({ t, off }) =>
            t >= 0 && t <= 1 && off <= STREET / 2 + width + GAP && off > 0
        )
        .sort((a, b) => a.off - b.off)[0];

      return beside === undefined
        ? Math.atan2(u - at[0], v - at[1])
        : Math.atan2(beside.near[0] - at[0], beside.near[1] - at[1]);
    },
    cells = Math.ceil(SPRAWL_REACH / SPACING),
    candidates: (Lot & { order: number })[] = [];

  // A grid over the square, each lot jostled from its corner, and ordered by how far out it is, jostled too.
  for (let j = -cells; j <= cells; j++) {
    for (let i = -cells; i <= cells; i++) {
      const n = (j + cells) * (cells * 2 + 1) + (i + cells),
        at: [number, number] = [
          u + i * SPACING + (share(seed, n * 4) - 0.5) * 2 * JOSTLE,
          v + j * SPACING + (share(seed, n * 4 + 1) - 0.5) * 2 * JOSTLE,
        ],
        out = Math.hypot(at[0] - u, at[1] - v),
        width = NARROWEST + share(seed, n * 4 + 2) * WIDER;

      if (out > SPRAWL_REACH || !place.owns(at[0], at[1])) {
        continue;
      }

      candidates.push({
        at,
        width,
        facing: facingAt(at, width),
        roof: share(seed ^ ROOFED, n),
        // Taller near the middle as the city grows, and some a storey taller anyway.
        storeys:
          1 +
          (out < MIDDLE ? tier : 0) +
          (share(seed, n * 4 + 3) < 0.2 ? 1 : 0),
        order: out + share(seed, n * 4 + 3) * 0.03,
      });
    }
  }

  candidates.sort((a, b) => a.order - b.order);

  // Each in turn, where it's clear of everything and every lot before it: the same lots whatever the size, so a size
  //  takes them from the front.
  const lots: Lot[] = [],
    footprints: Point[][] = [];

  candidates.forEach(({ at, width, facing, storeys, roof }) => {
    const footprint = footprintOf({ at, width, facing });

    if (
      footprint.every(
        ([cu, cv]) => Math.hypot(cu - u, cv - v) <= SPRAWL_REACH - GAP
      ) &&
      fromFootprint([u, v], footprint) >= PLAZA + GAP &&
      fromFootprint(inFront, footprint) >= UNIT_ROOM + GAP &&
      strips.every((strip) => apart(footprint, strip, GAP)) &&
      footprints.every((other) => apart(footprint, other, GAP))
    ) {
      lots.push({ at, width, facing, storeys, roof });
      footprints.push(footprint);
    }
  });

  return {
    plaza: { at: [u, v], radius: PLAZA },
    streets,
    lots: lots.slice(0, built),
  };
};

export default sprawl;
