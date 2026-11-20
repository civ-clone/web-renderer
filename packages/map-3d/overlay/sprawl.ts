// A city's sprawl on its own square on the 3D map (docs/3d-renderer.md §7.2, plan 4.1): a plaza at its middle, streets
//  from it out to each way a road comes in or the sea lies, and lots round them, each holding a building. Pure, and
//  seeded from the city: the same city at the same size, on the same roads, is laid out the same every time.
//
// - The lots are one seeded sequence, nearest the middle first, from a jittered grid over the square. A city of a size
//   takes that many from the front: one that grows keeps its buildings and adds the next out; one that shrinks loses
//   the outermost.
// - Streets, the plaza and the spot in front of the buildings where a unit stands take the lots that would stand on
//   them. So a road built to the city runs a street in through the lots in its way, rather than laying the city out
//   afresh.
// - All on the city's own square, inside its walls' ring; neighbouring squares are for a later slice.

/** A square a city stands on, as the overlay knows it (`OverlayPlace`). */
export type SprawlPlace = {
  centre: readonly [number, number];
  // The middle of the neighbour `offset` away, at the copy of the world nearest this square.
  toward(offset: readonly [number, number]): readonly [number, number];
  // Whether a point is on this square.
  owns(u: number, v: number): boolean;
};

/** A lot: where its building stands, how wide it is, which way its front faces, and how many storeys it has. */
export type Lot = {
  at: [number, number];
  width: number;
  facing: number;
  storeys: number;
};

/** A city laid out: its plaza, its streets (each from the plaza's edge to the edge of the square), and its lots. */
export type CityLayout = {
  plaza: { at: readonly [number, number]; radius: number };
  streets: [readonly [number, number], readonly [number, number]][];
  lots: Lot[];
};

/** How far across the plaza is, from the middle. */
export const PLAZA = 0.07;

/** How wide a street is. */
export const STREET = 0.04;

/** How far from the middle lots stand, at the most: inside the ring a city's walls stand on. */
export const SPRAWL_REACH = 0.33;

/** How far the spot in front of the buildings where a unit stands is kept clear, round it. */
export const UNIT_ROOM = 0.13;

// How far apart lots are laid, before they're jostled, and how far they're jostled.
const SPACING = 0.11,
  JOSTLE = 0.015;

/** How far apart two lots' middles must be, as a share of their widths added: boxes facing the plaza side by side. */
export const LOT_ROOM = 0.6;

// How many lots a city has at the most on its own square, and how many it has at size 1.
const MOST = 30,
  FIRST = 5;

/** How many lots a city of `size` has built on its own square: more as it grows, up to as many as fit. */
export const lotsFor = (size: number): number =>
  Math.min(MOST, FIRST + Math.max(0, size - 1) * 2);

/** A number for a city from its id: the same every time. */
export const citySeed = (id: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < id.length; index++) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }

  return hash >>> 0;
};

// A share, 0 to 1, from a seed and a number: the same each time.
const share = (seed: number, n: number): number => {
  let h = Math.imul(seed ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b);

  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  return (h >>> 0) / 4294967296;
};

// How far a point is from the segment `a`–`b`.
const fromSegment = (
  [u, v]: readonly [number, number],
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

  return Math.hypot(u - a[0] - du * t, v - a[1] - dv * t);
};

/**
 * The sprawl of a city of `size` seeded `seed` on the square at `place`, with streets out the `ways` (its neighbours'
 *  offsets: those a road comes in from, and those the sea lies towards), and a unit's spot kept clear at `inFront`.
 */
export const sprawl = (
  place: SprawlPlace,
  seed: number,
  size: number,
  ways: readonly (readonly [number, number])[],
  inFront: readonly [number, number]
): CityLayout => {
  const [u, v] = place.centre,
    streets = ways.flatMap(
      (offset): [readonly [number, number], readonly [number, number]][] => {
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
    // Each building's half-width, at its widest corner, and a little room round it.
    clear = (lot: Pick<Lot, 'at' | 'width'>): boolean =>
      Math.hypot(lot.at[0] - u, lot.at[1] - v) >= PLAZA + lot.width * 0.75 &&
      Math.hypot(lot.at[0] - inFront[0], lot.at[1] - inFront[1]) >=
        UNIT_ROOM + lot.width * 0.75 &&
      streets.every(
        ([a, b]) => fromSegment(lot.at, a, b) >= STREET / 2 + lot.width * 0.75
      ),
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
        out = Math.hypot(at[0] - u, at[1] - v);

      if (out > SPRAWL_REACH || !place.owns(at[0], at[1])) {
        continue;
      }

      candidates.push({
        at,
        width: 0.06 + share(seed, n * 4 + 2) * 0.025,
        // Its front to the plaza.
        facing: Math.atan2(u - at[0], v - at[1]),
        // Taller near the middle as the city grows.
        storeys:
          1 +
          (out < 0.15 ? Math.floor(Math.max(0, size - 1) / 6) : 0) +
          (share(seed, n * 4 + 3) < 0.2 ? 1 : 0),
        order: out + share(seed, n * 4 + 3) * 0.03,
      });
    }
  }

  candidates.sort((a, b) => a.order - b.order);

  // Each in turn, where it's clear of the streets, the plaza, the unit's spot and every lot before it: the same lots
  //  whatever the size, so a size takes them from the front.
  const lots: Lot[] = [];

  candidates.forEach(({ at, width, facing, storeys }) => {
    if (
      clear({ at, width }) &&
      lots.every(
        (other) =>
          Math.hypot(other.at[0] - at[0], other.at[1] - at[1]) >=
          (other.width + width) * LOT_ROOM
      )
    ) {
      lots.push({ at, width, facing, storeys });
    }
  });

  return {
    plaza: { at: [u, v], radius: PLAZA },
    streets,
    lots: lots.slice(0, lotsFor(size)),
  };
};

export default sprawl;
