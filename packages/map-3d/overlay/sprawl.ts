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
// - From size 4, its houses spill onto its neighbours' squares (`suburb`): each neighbour lays them on its own ground,
//   as each square lays its own half of a road, by how far out the city has spread, so it needs to know only its
//   neighbours.

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
 *  quay's street goes down to, by their offsets. In civil disorder, how many columns of smoke rise from fires on its
 *  roofs (`disorder.ts`); celebrating, how many flags fly from its roofs (`celebration.ts`): each none, or missing,
 *  when it isn't.
 */
export type CityPlan = {
  seed: number;
  lots: number;
  tier: number;
  ways: (readonly [number, number])[];
  sea: (readonly [number, number])[];
  disorder?: number;
  celebration?: number;
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

/**
 * What a city seeded `seed` of `size` is laid out from, with its streets out the `ways`, and the `sea` beside it; and,
 *  in civil disorder, its fires' columns (`disorder`, from `disorder.ts`'s `disorderColumns`), none when it isn't.
 */
export const planFor = (
  seed: number,
  size: number,
  ways: readonly (readonly [number, number])[],
  sea: readonly (readonly [number, number])[] = [],
  disorder = 0,
  celebration = 0
): CityPlan => ({
  seed,
  lots: lotsFor(size),
  tier: tierFor(size),
  ways: [...ways],
  sea: [...sea],
  ...(disorder > 0 ? { disorder } : {}),
  ...(celebration > 0 ? { celebration } : {}),
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

/** From what size a city's houses spill onto its neighbours' squares. */
export const SUBURBS_FROM = 4;

// How far from a city's middle its houses reach on its neighbours' squares at `SUBURBS_FROM`, how much further each size
//  after, and how many sizes they go on spreading.
const SUBURB_FIRST = 0.62,
  SUBURB_STEP = 0.05,
  SUBURB_STEPS = 12;

// How far apart a neighbour's lots are laid, before they're jostled: a little further than in the city.
const SUBURB_SPACING = 0.085;

/**
 * How far a house on a neighbour's square keeps from the middle of its roads and railroads, and of those past its
 *  corners: a ballast's half-width. So its houses line them closely, and a unit walking along one passes through them
 *  (#1282).
 */
export const ROADSIDE = 0.055;

/**
 * How far a house on a neighbour's square keeps from the middle of a way in, where units walk with no road to show it:
 *  as far as a unit's figures reach across its way, so they walk between the houses, not through them. Its stand and
 *  ring, wider and low, still reach into the walls of the nearest (#1282).
 */
export const WALKWAY = 0.13;

// How many lots there are along one road or railroad on a neighbour's square at the most, each side: more than fit along
//  its half, from the square's middle to its edge.
const ALONG_MOST = 32;

// Mixed into the city's seed for its lots on a neighbour's square, so each neighbour's are its own.
const SUBURBED = 0x6c8e9cf5;

/** How many steps out onto its neighbours' squares a city of `size` has spread: none below `SUBURBS_FROM`. */
export const suburbStepsFor = (size: number): number =>
  size < SUBURBS_FROM ? 0 : Math.min(SUBURB_STEPS, size - SUBURBS_FROM + 1);

/** How far from its middle a city `steps` out (`suburbStepsFor`) reaches on its neighbours' squares: none at none. */
export const suburbReach = (steps: number): number =>
  steps <= 0
    ? 0
    : SUBURB_FIRST + (Math.min(steps, SUBURB_STEPS) - 1) * SUBURB_STEP;

/**
 * A city's houses on a neighbour's square: its seed, how many steps out it's spread (`suburbStepsFor`), and the
 *  offset from that square to the city's.
 */
export type SuburbPlan = {
  seed: number;
  steps: number;
  city: readonly [number, number];
};

/** A road or railroad on a square, from its middle out one way, along its bend: `key` is the way it goes, its own. */
export type Run = {
  key: number;
  points: readonly Point[];
  // How far it reaches either side of its middle, as drawn (a road's width, a railroad's ballast), where that's known.
  half?: number;
};

/**
 * What's on a square beside a city that its houses keep clear of, line or stand on their own side of: the same for every
 *  city beside it, so each city's houses there hang on nothing else's.
 */
export type SuburbClear = {
  // Its roads and railroads (`ROADSIDE` either side of their middles), which its houses line.
  runs: readonly Run[];
  // Other lines across it, kept clear (`ROADSIDE` either side) but not lined: the roads past its corners.
  lines: readonly (readonly [Point, Point])[];
  // The way a unit walks from its middle into each city beside it, where no road takes it: to the spot where units stand
  //  in front of the city's buildings. Kept clear (`WALKWAY` either side), and lined.
  lanes: readonly (readonly [Point, Point])[];
  // Those spots, in front of each city beside it.
  stands: readonly Point[];
  // The middles of the other cities beside it, whatever their size: each city builds on its own side of the square,
  //  nearer its own middle than theirs.
  others: readonly Point[];
  // What's claimed its place there first (its specials and hut): where, and how far round it.
  taken: readonly (readonly [number, number, number])[];
  // How high the ground is at a point, below 0 under the water: no house stands with any of it in the sea. Dry
  //  everywhere without it.
  ground?: (u: number, v: number) => number;
  // The rivers' channels through it (`Layer#channels`): each line of each course, and how far either side its bed
  //  reaches, kept clear, round its ends too.
  channels?: readonly (readonly [Point, Point, number])[];
};

// How much of the lots a city has room for on a neighbour's square are built, from all of them at its edge to fewer
//  further out: the town thins as it goes.
const builtShare = (out: number): number =>
  1 - 0.55 * Math.min(1, Math.max(0, (out - 0.5) / 0.7));

// A strip `wide` either side of the segment `a`–`b`.
const strip = ([a, b]: readonly [Point, Point], wide: number): Point[] => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
    nu = (-(b[1] - a[1]) / length) * wide,
    nv = ((b[0] - a[0]) / length) * wide;

  return [
    [a[0] + nu, a[1] + nv],
    [b[0] + nu, b[1] + nv],
    [b[0] - nu, b[1] - nv],
    [a[0] - nu, a[1] - nv],
  ];
};

// A river's channel from `a` to `b`, `reach` either side: a strip as far either side, and as far on past each end, so it
//  covers the channel's round ends, a little more at their corners.
const channelStrip = ([a, b, reach]: readonly [
  Point,
  Point,
  number
]): Point[] => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
    [du, dv] =
      length === 0 ? [1, 0] : [(b[0] - a[0]) / length, (b[1] - a[1]) / length];

  return strip(
    [
      [a[0] - du * reach, a[1] - dv * reach],
      [b[0] + du * reach, b[1] + dv * reach],
    ],
    reach
  );
};

// The pieces of a run, from point to point, but those of no length.
const piecesOf = (points: readonly Point[]): [Point, Point][] =>
  points
    .slice(1)
    .map((to, index): [Point, Point] => [points[index]!, to])
    .filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 0);

// Whether the boxes round two shapes are at least `gap` apart: a quick look before `apart`.
const boxesApart = (p: Point[], q: Point[], gap: number): boolean =>
  Math.min(...q.map(([u]) => u)) - Math.max(...p.map(([u]) => u)) >= gap ||
  Math.min(...p.map(([u]) => u)) - Math.max(...q.map(([u]) => u)) >= gap ||
  Math.min(...q.map(([, v]) => v)) - Math.max(...p.map(([, v]) => v)) >= gap ||
  Math.min(...p.map(([, v]) => v)) - Math.max(...q.map(([, v]) => v)) >= gap;

/**
 * The houses a city planned as `plan` has on its neighbour's square at `place`: lots from a jostled grid over the
 *  square, and along each of its roads and railroads, either side, seeded from the city, the way to it and each road's
 *  way, nearest the city first, thinning outward, as far out as its steps reach. Each building's footprint, out to its
 *  eaves:
 *  - is on the square, with room to its edge;
 *  - is on the city's own side of it, nearer its middle than any other city's beside it;
 *  - is outside the city's walls, and clear of a unit in front of each city's buildings and of one standing on the
 *    square, at its middle;
 *  - is clear of the square's roads, railroads and the ways units walk from it into the cities beside it, of what's
 *    claimed its place there first, and of the lots before it.
 *
 * A lot beside a road, railroad or way in faces it, square to it; any other faces the city. What it builds hangs on
 *  the city and the square alone, not another city's houses, so it keeps them as it grows whatever the others do.
 */
export const suburb = (
  place: SprawlPlace,
  { seed: citySeed, steps, city }: SuburbPlan,
  clear: SuburbClear
): Lot[] => {
  const reach = suburbReach(steps);

  if (reach === 0) {
    return [];
  }

  const [u, v] = place.centre,
    middle = place.toward(city),
    seed = citySeed ^ Math.imul(SUBURBED, (city[0] + 7) * 31 + (city[1] + 7)),
    runPieces = clear.runs.flatMap(({ points }) => piecesOf(points)),
    // The streets its houses line, and how far they keep from each one's middle: its roads and railroads, at the
    //  roadside, and the ways in, a unit's width either side, where nothing else shows the way it walks.
    streets = [
      ...runPieces.map((line) => ({ line, wide: ROADSIDE })),
      ...clear.lanes
        .filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 0)
        .map((line) => ({ line, wide: WALKWAY })),
    ],
    // Those, and a road's width either side of those past its corners.
    strips = [
      ...streets.map(({ line, wide }) => strip(line, wide)),
      ...clear.lines
        .filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 0)
        .map((line) => strip(line, ROADSIDE)),
      ...(clear.channels ?? []).map(channelStrip),
    ],
    // Which way a lot at `at` faces: square to the street it's beside, towards it, or else to the city.
    facingAt = (at: Point, width: number): number => {
      const beside = streets
        .map(({ line: [a, b], wide }) => {
          const t = along(at, a, b),
            near: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

          return {
            t,
            near,
            off: Math.hypot(near[0] - at[0], near[1] - at[1]),
            wide,
          };
        })
        .filter(
          ({ t, off, wide }) =>
            t >= 0 && t <= 1 && off <= wide + width + GAP && off > 0
        )
        .sort((a, b) => a.off - b.off)[0];

      return beside === undefined
        ? Math.atan2(middle[0] - at[0], middle[1] - at[1])
        : Math.atan2(beside.near[0] - at[0], beside.near[1] - at[1]);
    },
    // Far enough each way to cover a square on any grid: a diamond's corners are 0.71 out, a hex's 0.58.
    cells = Math.ceil(0.75 / SUBURB_SPACING),
    candidates: (Lot & { order: number })[] = [],
    // How wide the `n`th lot is.
    widthOf = (n: number): number => NARROWEST + share(seed, n * 5 + 2) * WIDER,
    // How far `at` is from the nearest of the square's roads and railroads.
    fromRuns = (at: Point): number =>
      Math.min(
        Infinity,
        ...runPieces.map(([a, b]) => {
          const t = Math.max(0, Math.min(1, along(at, a, b)));

          return Math.hypot(
            a[0] + (b[0] - a[0]) * t - at[0],
            a[1] + (b[1] - a[1]) * t - at[1]
          );
        })
      ),
    // The `n`th lot, at `at`, if it's in reach, on the square and among those built as the town thins, and, from the
    //  grid, `off` the roadside, which is left for the lots along the roads.
    consider = (n: number, at: [number, number], grid: boolean): void => {
      const out = Math.hypot(at[0] - middle[0], at[1] - middle[1]),
        order = out + share(seed, n * 5 + 3) * 0.03,
        width = widthOf(n);

      if (
        order <= reach &&
        share(seed, n * 5 + 4) < builtShare(out) &&
        place.owns(at[0], at[1]) &&
        (!grid || fromRuns(at) >= ROADSIDE + GAP * 2 + NARROWEST + WIDER)
      ) {
        candidates.push({
          at,
          width,
          facing: facingAt(at, width),
          roof: share(seed ^ ROOFED, n),
          // A storey, and some two.
          storeys: 1 + (share(seed, n * 5 + 3) < 0.15 ? 1 : 0),
          order,
        });
      }
    };

  // A jostled grid over the square.
  for (let j = -cells; j <= cells; j++) {
    for (let i = -cells; i <= cells; i++) {
      const n = (j + cells) * (cells * 2 + 1) + (i + cells);

      consider(
        n,
        [
          u + i * SUBURB_SPACING + (share(seed, n * 5) - 0.5) * 2 * JOSTLE,
          v + j * SUBURB_SPACING + (share(seed, n * 5 + 1) - 0.5) * 2 * JOSTLE,
        ],
        true
      );
    }
  }

  // And along each road and railroad, either side of it, its front at the roadside, so the houses line them as a town's
  //  do along the roads out of it: along its bend, its lots as far apart as the widest, each seeded from the way it goes,
  //  so a road built another way leaves them be.
  clear.runs.forEach(({ key, points }) => {
    const pieces = piecesOf(points).map(([from, to]) => ({
        from,
        to,
        length: Math.hypot(to[0] - from[0], to[1] - from[1]),
      })),
      length = pieces.reduce((sum, piece) => sum + piece.length, 0),
      count = Math.min(
        ALONG_MOST,
        Math.floor(length / (NARROWEST + WIDER + GAP * 2))
      );

    for (let k = 0; k < count; k++) {
      [1, -1].forEach((side, sideIndex) => {
        const n = (cells * 2 + 1) ** 2 + (key * ALONG_MOST + k) * 2 + sideIndex,
          off = ROADSIDE + widthOf(n) / 2 + GAP * 2;
        // How far along it, and so along which piece of it.
        let t =
          ((k + 0.5) / count) * length + (share(seed, n * 5) - 0.5) * JOSTLE;

        for (const [index, { from, to, length: piece }] of pieces.entries()) {
          if (t <= piece || index === pieces.length - 1) {
            const du = (to[0] - from[0]) / piece,
              dv = (to[1] - from[1]) / piece;

            consider(
              n,
              [
                from[0] + du * t - dv * off * side,
                from[1] + dv * t + du * off * side,
              ],
              false
            );
            break;
          }

          t -= piece;
        }
      });
    }
  });

  candidates.sort((a, b) => a.order - b.order);

  // How much nearer the city's middle than `other`'s a point is, as far as it is from the line halfway between them.
  const nearer = ([pu, pv]: Point, other: Point): number =>
    (Math.hypot(pu - other[0], pv - other[1]) ** 2 -
      Math.hypot(pu - middle[0], pv - middle[1]) ** 2) /
    (2 * Math.hypot(other[0] - middle[0], other[1] - middle[1]));

  // Each in turn, where it's clear: a lot's taken or not whatever the city's size, so as it spreads it keeps those it
  //  has and adds the next out.
  const lots: Lot[] = [],
    footprints: Point[][] = [];

  candidates.forEach(({ at, width, facing, storeys, roof }) => {
    const footprint = footprintOf({ at, width, facing });

    if (
      // On the square, with room to its edge.
      footprintOf({ at, width: width + GAP * 2, facing }).every(([cu, cv]) =>
        place.owns(cu, cv)
      ) &&
      // On the city's own side, with room to the line halfway to each other.
      clear.others.every((other) =>
        footprint.every((corner) => nearer(corner, other) >= GAP / 2)
      ) &&
      fromFootprint(middle, footprint) >=
        WALLS.radius + WALLS.thickness + GAP &&
      clear.stands.every(
        (stand) => fromFootprint(stand, footprint) >= UNIT_ROOM + GAP
      ) &&
      fromFootprint(place.centre, footprint) >= UNIT_ROOM + GAP &&
      // Out of the water, at its middle and every corner.
      [at, ...footprint].every(
        ([gu, gv]) => (clear.ground?.(gu, gv) ?? 0) >= 0
      ) &&
      clear.taken.every(
        ([tu, tv, room]) => fromFootprint([tu, tv], footprint) >= room + GAP
      ) &&
      strips.every(
        (strip) =>
          boxesApart(footprint, strip, GAP) || apart(footprint, strip, GAP)
      ) &&
      footprints.every(
        (other) =>
          boxesApart(footprint, other, GAP) || apart(footprint, other, GAP)
      )
    ) {
      lots.push({ at, width, facing, storeys, roof });
      footprints.push(footprint);
    }
  });

  return lots;
};

export default sprawl;
