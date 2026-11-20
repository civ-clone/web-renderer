// A city's sprawl on its own square on the 3D map (docs/3d-renderer.md §7.2, plan 4.1, `overlay/sprawl.ts`):
//  - its lots one seeded sequence, a size taking them from the front: grown, it keeps its buildings; shrunk, it loses
//    the outermost; more lots as it grows, up to as many as fit;
//  - each lot on its own square, inside its walls, clear of every other, the streets, the plaza and the spot in front
//    where a unit stands, on every grid;
//  - streets out to exactly the ways it's given, from the plaza to the edge, where a road's half comes in;
//  - the same every time for the same city, and a road built clearing a street rather than laying it out afresh.

import { TopologyId } from '@civ-clone/ui-protocol/topology';
import Land from '@civ-clone/ui-map-3d/Land';
import World from '@civ-clone/ui-map/components/World';
import sprawl, {
  LOT_ROOM,
  Lot,
  PLAZA,
  SPRAWL_REACH,
  STREET,
  UNIT_ROOM,
  citySeed,
  lotsFor,
} from '@civ-clone/ui-map-3d/overlay/sprawl';
import { IN_FRONT_OF_CITY } from '@civ-clone/ui-map-3d/markers/drawMarker';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A square on a square grid, at (`x`, `y`).
const squareAt = (x: number, y: number) => ({
    centre: [x + 0.5, y + 0.5] as const,
    toward: ([dx, dy]: readonly [number, number]) =>
      [x + dx + 0.5, y + dy + 0.5] as const,
    owns: (u: number, v: number) => Math.floor(u) === x && Math.floor(v) === y,
  }),
  east = [1, 0] as const,
  north = [0, -1] as const,
  west = [-1, 0] as const,
  south = [0, 1] as const,
  inFrontOf = ([u, v]: readonly [number, number]) =>
    [u, v + IN_FRONT_OF_CITY] as const,
  positions = (lots: Lot[]) => lots.map(({ at }) => at.join(','));

// From the front: size by size, each one's lots are the next's first, for many cities and ways out.
{
  const notPrefix: string[] = [];

  for (let city = 0; city < 40; city++) {
    const place = squareAt(city, 3),
      seed = citySeed(`City-${city}`),
      ways = [[east], [east, west], [north, south, east], []][city % 4]!;
    let before: string[] = [];

    for (let size = 1; size <= 20; size++) {
      const lots = positions(
        sprawl(place, seed, size, ways, inFrontOf(place.centre)).lots
      );

      if (before.some((at, index) => lots[index] !== at)) {
        notPrefix.push(`City-${city} size ${size}`);
      }

      before = lots;
    }
  }

  expect(
    'a city’s lots from the front: grown, it keeps its buildings; shrunk, it loses the outermost',
    notPrefix.slice(0, 5),
    []
  );
}

// Dense at the middle, thinning outward: for many cities, the first lots are nearer the middle than the last.
{
  const outward = Array.from({ length: 40 }, (_, city) => {
    const place = squareAt(city, 3),
      [u, v] = place.centre,
      lots = sprawl(
        place,
        citySeed(`City-${city}`),
        30,
        [[east], [east, west], []][city % 3]!,
        inFrontOf(place.centre)
      ).lots,
      third = Math.floor(lots.length / 3),
      mean = (some: Lot[]) =>
        some.reduce(
          (sum, { at }) => sum + Math.hypot(at[0] - u, at[1] - v),
          0
        ) / some.length;

    return mean(lots.slice(0, third)) < mean(lots.slice(-third));
  });

  expect(
    'dense at the middle, thinning outward: the first lots nearer the middle than the last',
    outward.every(Boolean),
    true
  );
}

expect(
  'more lots as a city grows, up to as many as fit',
  [
    lotsFor(1),
    lotsFor(2) > lotsFor(1),
    lotsFor(10) > lotsFor(5),
    lotsFor(40) === lotsFor(80),
  ],
  [5, true, true, true]
);

// Room: on every grid, every lot on its own square, inside the walls' ring, clear of the others, the streets, the
//  plaza and the unit's spot.
(['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach(
  (topologyId) => {
    const size = 12,
      world = new World({
        _: 'World',
        __: ['World', 'DataObject'],
        id: 'world',
        width: size,
        height: size,
        topologyId,
        tiles: Array.from({ length: size * size }, (_, index) => ({
          x: index % size,
          y: Math.floor(index / size),
          terrain: { _: 'Grassland', __: ['Grassland'], features: [] },
          improvements: [],
          units: [],
          city: null,
        })) as never,
      }),
      { layout } = new Land(world),
      topology = world.topology(),
      cramped: string[] = [];
    let most = 0;

    for (let y = 2; y < size - 2; y++) {
      for (let x = 2; x < size - 2; x++) {
        const centre = layout.centre(x, y),
          place = {
            centre,
            toward: ([dx, dy]: readonly [number, number]) =>
              layout.centre(x + dx, y + dy),
            owns: (u: number, v: number) => {
              const [tx, ty] = layout.tileAt(u, v);

              return tx === x && ty === y;
            },
          },
          offsets = topology
            .directions()
            .map((direction) => topology.offset(direction, x, y)),
          // A different handful of ways out for each square.
          ways = offsets.filter(
            (_, index) => (x * 7 + y * 3 + index) % 3 === 0
          ),
          spot = inFrontOf(centre),
          { lots, streets } = sprawl(
            place,
            citySeed(`City-${x}-${y}`),
            30,
            ways,
            spot
          );

        most = Math.max(most, lots.length);

        lots.forEach((lot, index) => {
          const [lu, lv] = lot.at,
            corner = lot.width * 0.71,
            fromStreet = Math.min(
              Infinity,
              ...streets.map(([a, b]) => {
                const du = b[0] - a[0],
                  dv = b[1] - a[1],
                  t = Math.max(
                    0,
                    Math.min(
                      1,
                      ((lu - a[0]) * du + (lv - a[1]) * dv) /
                        (du * du + dv * dv)
                    )
                  );

                return Math.hypot(lu - a[0] - du * t, lv - a[1] - dv * t);
              })
            );

          if (
            !place.owns(lu, lv) ||
            Math.hypot(lu - centre[0], lv - centre[1]) > SPRAWL_REACH ||
            Math.hypot(lu - centre[0], lv - centre[1]) < PLAZA + corner ||
            Math.hypot(lu - spot[0], lv - spot[1]) < UNIT_ROOM + corner ||
            fromStreet < STREET / 2 + corner ||
            lots
              .slice(0, index)
              .some(
                (other) =>
                  Math.hypot(other.at[0] - lu, other.at[1] - lv) <
                  (other.width + lot.width) * LOT_ROOM - 1e-9
              )
          ) {
            cramped.push(`${x},${y} lot ${index}`);
          }
        });
      }
    }

    expect(
      `${topologyId}: every lot on its own square, inside its walls, clear of the others, the streets, the plaza and the unit's spot; and a city has a good few`,
      [cramped.slice(0, 5), most >= 12],
      [[], true]
    );
  }
);

// Streets: out to exactly the ways it's given, from the plaza's edge to the edge of the square, where a road's half
//  comes in.
{
  const place = squareAt(5, 5),
    { streets } = sprawl(
      place,
      citySeed('Streets'),
      8,
      [east, north],
      inFrontOf(place.centre)
    );

  expect(
    'streets out to exactly its ways, from the plaza’s edge to the edge of the square',
    streets.map(([from, to]) => [
      from.map((n) => Math.round(n * 1000) / 1000),
      to,
    ]),
    [
      [
        [5.5 + PLAZA, 5.5],
        [6, 5.5],
      ],
      [
        [5.5, 5.5 - PLAZA],
        [5.5, 5],
      ],
    ]
  );
}

// The same city, the same every time; another, another. A road built to it runs a street through the lots in its way,
//  and the rest stay where they were, near enough all of them.
{
  const place = squareAt(5, 5),
    spot = inFrontOf(place.centre),
    once = sprawl(place, citySeed('Roma'), 5, [east], spot),
    again = sprawl(place, citySeed('Roma'), 5, [east], spot),
    other = sprawl(place, citySeed('Antium'), 5, [east], spot),
    roaded = sprawl(place, citySeed('Roma'), 5, [east, north], spot),
    before = positions(once.lots),
    after = positions(roaded.lots),
    kept = before.filter((at) => after.includes(at)).length;

  expect(
    'the same city the same every time, another another; a road built runs a street in, the rest of the city staying',
    [
      JSON.stringify(once) === JSON.stringify(again),
      JSON.stringify(once.lots) === JSON.stringify(other.lots),
      roaded.streets.length,
      kept >= before.length * 0.6,
      after.length,
    ],
    [true, false, 2, true, before.length]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL sprawl: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS sprawl (${checks} checks)\n`);
