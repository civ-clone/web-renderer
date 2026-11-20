// A city's sprawl on its own square on the 3D map (docs/3d-renderer.md §7.2, plan 4.1, `overlay/sprawl.ts`):
//  - its lots one seeded sequence, a size taking them from the front: grown, it keeps its buildings; shrunk, it loses
//    the outermost; more lots as it grows, up to as many as fit, and plenty fit with a street out every way;
//  - each building's footprint, its roof's eaves turned as it faces, on its own square, inside the walls as they're
//    drawn, clear of every other, the streets, the plaza, and the stand of a unit in front and the ring at its feet as
//    they're drawn, on every grid;
//  - the houses beside a street facing it, square to it, lining it;
//  - streets out to exactly the ways it's given, from the plaza to the edge, where a road's half comes in;
//  - the same every time for the same city, and a road built clearing a street rather than laying it out afresh.

import { Euler, Mesh, Vector3 } from 'three';
import { TopologyId } from '@civ-clone/ui-protocol/topology';
import Land from '@civ-clone/ui-map-3d/Land';
import World from '@civ-clone/ui-map/components/World';
import sprawl, {
  CityLayout,
  GAP,
  Lot,
  PLAZA,
  SprawlPlace,
  STREET,
  UNIT_ROOM,
  citySeed,
  lotsFor,
  planFor,
  tierFor,
} from '@civ-clone/ui-map-3d/overlay/sprawl';
import {
  IN_FRONT_OF_CITY,
  MarkerKit,
  drawMarker,
} from '@civ-clone/ui-map-3d/markers/drawMarker';
import { wallsGeometry } from '@civ-clone/ui-map-3d/markers/figures';

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

// The pointer over the unit awaiting orders is drawn on a canvas: one that draws nothing.
Object.assign(globalThis, {
  document: {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () =>
        new Proxy({}, { get: () => () => ({ width: 0 }) }) as never,
    }),
  },
});

type Point = readonly [number, number];

// A square on a square grid, at (`x`, `y`).
const squareAt = (x: number, y: number): SprawlPlace => ({
    centre: [x + 0.5, y + 0.5] as const,
    toward: ([dx, dy]: readonly [number, number]) =>
      [x + dx + 0.5, y + dy + 0.5] as const,
    owns: (u: number, v: number) => Math.floor(u) === x && Math.floor(v) === y,
  }),
  east = [1, 0] as const,
  north = [0, -1] as const,
  west = [-1, 0] as const,
  south = [0, 1] as const,
  inFrontOf = ([u, v]: Point): Point => [u, v + IN_FRONT_OF_CITY],
  positions = (lots: Lot[]) => lots.map(({ at }) => at.join(',')),
  // How far out the inside of the walls is, as they're drawn: their nearest point to the middle, across the ground.
  wallsInside = (() => {
    const at = wallsGeometry().getAttribute('position');
    let nearest = Infinity;

    for (let index = 0; index < at.count; index++) {
      nearest = Math.min(nearest, Math.hypot(at.getX(index), at.getZ(index)));
    }

    return nearest;
  })(),
  // How far out from where it stands a unit's stand, and the ring at its feet awaiting orders, and its bank fortified,
  //  reach, as they're drawn: what's at its feet, low on the ground.
  unitsFeet = (() => {
    const group = drawMarker(new MarkerKit(), {
      city: null,
      unit: {
        id: 'Unit-Spearman',
        type: 'Spearman',
        kinds: [],
        colours: ['#aa0000', '#ffffff'],
        count: 1,
        active: true,
        busy: false,
        fortified: true,
        veteran: false,
        health: null,
        status: null,
        facing: 0,
        size: 1,
      },
    });
    let furthest = 0;

    group.updateMatrixWorld(true);
    group.traverse((part) => {
      if (!(part instanceof Mesh)) {
        return;
      }

      const at = part.geometry.getAttribute('position'),
        point = new Vector3();

      for (let index = 0; index < at.count; index++) {
        point.fromBufferAttribute(at, index).applyMatrix4(part.matrixWorld);

        if (point.y < 0.06) {
          furthest = Math.max(furthest, Math.hypot(point.x, point.z));
        }
      }
    });

    return furthest;
  })(),
  // A building's footprint as it's drawn: a square its width across, turned to face its way, as the overlay turns it.
  footprint = ({ at: [u, v], width, facing }: Lot): Point[] =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([du, dv]) => {
      const corner = new Vector3(
        (du! * width) / 2,
        0,
        (dv! * width) / 2
      ).applyEuler(new Euler(0, facing, 0));

      return [u + corner.x, v + corner.z] as const;
    }),
  // A street as it's drawn: a strip its width across from end to end.
  strip = ([a, b]: readonly [Point, Point]): Point[] => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      across = [
        (-(b[1] - a[1]) / length) * (STREET / 2),
        ((b[0] - a[0]) / length) * (STREET / 2),
      ] as const;

    return [
      [a[0] + across[0], a[1] + across[1]],
      [b[0] + across[0], b[1] + across[1]],
      [b[0] - across[0], b[1] - across[1]],
      [a[0] - across[0], a[1] - across[1]],
    ];
  },
  // Whether two convex shapes overlap: no line between them, along any of their sides.
  overlap = (p: Point[], q: Point[]): boolean =>
    ![p, q].some((shape) =>
      shape.some(([au, av], index) => {
        const [bu, bv] = shape[(index + 1) % shape.length]!,
          normal = [av - bv, bu - au] as const,
          onto = (points: Point[]) =>
            points.map(([u, v]) => u * normal[0] + v * normal[1]),
          ps = onto(p),
          qs = onto(q);

        return (
          Math.max(...ps) <= Math.min(...qs) + 1e-12 ||
          Math.max(...qs) <= Math.min(...ps) + 1e-12
        );
      })
    ),
  // How far `point` is from the segment `a`–`b`.
  fromSegment = ([u, v]: Point, [au, av]: Point, [bu, bv]: Point): number => {
    const du = bu - au,
      dv = bv - av,
      t = Math.max(
        0,
        Math.min(1, ((u - au) * du + (v - av) * dv) / (du * du + dv * dv))
      );

    return Math.hypot(u - au - du * t, v - av - dv * t);
  },
  // How far `point` is from the convex shape `corners`, or none inside it.
  fromShape = (point: Point, corners: Point[]): number => {
    const sides = corners.map(
        (corner, index) =>
          [corner, corners[(index + 1) % corners.length]!] as const
      ),
      inside =
        sides.every(
          ([[au, av], [bu, bv]]) =>
            (bu - au) * (point[1] - av) - (bv - av) * (point[0] - au) >= 0
        ) ||
        sides.every(
          ([[au, av], [bu, bv]]) =>
            (bu - au) * (point[1] - av) - (bv - av) * (point[0] - au) <= 0
        );

    return inside
      ? 0
      : Math.min(...sides.map(([a, b]) => fromSegment(point, a, b)));
  },
  // The faults in a city's layout on `place`, with its unit's spot at `spot`: each lot that isn't on its square,
  //  inside the walls, clear of the plaza, the unit's feet, the streets and the lots before it, as they're drawn.
  faultsIn = (
    place: SprawlPlace,
    { plaza, streets, lots }: CityLayout,
    spot: Point
  ): string[] => {
    const [u, v] = place.centre,
      strips = streets.map(strip),
      footprints = lots.map(footprint);

    return lots.flatMap((lot, index) => {
      const corners = footprints[index]!,
        faults = [
          !place.owns(...lot.at) && 'off its square',
          corners.some(
            ([cu, cv]) => Math.hypot(cu - u, cv - v) > wallsInside
          ) && 'through the walls',
          fromShape(plaza.at, corners) < plaza.radius && 'on the plaza',
          fromShape(spot, corners) < unitsFeet && 'at the unit’s feet',
          strips.some((street) => overlap(corners, street)) && 'on a street',
          footprints.slice(0, index).some((other) => overlap(corners, other)) &&
            'on another',
        ].filter(Boolean);

      return faults.length === 0 ? [] : [`lot ${index}: ${faults.join(', ')}`];
    });
  };

// What's drawn round a city that its lots keep clear of: a unit's feet reach no further than the room kept, and the
//  walls stand out beyond where the lots reach.
expect(
  'a unit’s stand, ring and bank are within the room kept for them, and the plaza’s as wide as the room kept',
  [unitsFeet > 0.2, unitsFeet <= UNIT_ROOM, wallsInside > 0.3],
  [true, true, true]
);

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
        sprawl(place, planFor(seed, size, ways), inFrontOf(place.centre)).lots
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
        planFor(
          citySeed(`City-${city}`),
          30,
          [[east], [east, west], []][city % 3]!
        ),
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
  'more lots as a city grows, up to as many as fit; taller near the middle each six sizes',
  [
    lotsFor(1),
    lotsFor(2) > lotsFor(1),
    lotsFor(10) > lotsFor(5),
    lotsFor(40) === lotsFor(80),
    [1, 6, 7, 12, 13].map(tierFor),
  ],
  [5, true, true, true, [0, 0, 1, 1, 2]]
);

// Taller as it grows: each six sizes, the buildings near the middle a storey taller, and those well out the same.
{
  const place = squareAt(5, 5),
    [u, v] = place.centre,
    storeys = (size: number) =>
      sprawl(
        place,
        planFor(citySeed('Tall'), size, []),
        inFrontOf(place.centre)
      ).lots.map(({ at, storeys }) => ({
        out: Math.hypot(at[0] - u, at[1] - v),
        storeys,
      })),
    small = storeys(1),
    big = storeys(13);

  expect(
    'taller as it grows: near the middle two storeys taller at size 13, well out the same',
    [
      small.every(
        ({ out, storeys }, index) =>
          (out > 0.15 || big[index]!.storeys === storeys + 2) &&
          (out < 0.2 || big[index]!.storeys === storeys)
      ),
      small.some(({ out }) => out < 0.15),
    ],
    [true, true]
  );
}

// Room: on every grid, every building's footprint on its own square, inside the walls, clear of the others, the
//  streets, the plaza and the unit's feet, as they're drawn; and with a street out every way, a city still has plenty,
//  more than a city just founded.
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
      faults: string[] = [];
    let most = 0,
      fewestAllWays = Infinity;

    for (let y = 2; y < size - 2; y++) {
      for (let x = 2; x < size - 2; x++) {
        const centre = layout.centre(x, y),
          place: SprawlPlace = {
            centre,
            toward: ([dx, dy]) => layout.centre(x + dx, y + dy),
            owns: (u, v) => {
              const [tx, ty] = layout.tileAt(u, v);

              return tx === x && ty === y;
            },
          },
          offsets = topology
            .directions()
            .map((direction) => topology.offset(direction, x, y)),
          spot = inFrontOf(centre);

        // A different handful of ways out for each square, and every way out.
        [
          offsets.filter((_, index) => (x * 7 + y * 3 + index) % 3 === 0),
          offsets,
        ].forEach((ways, all) => {
          for (let city = 0; city < 3; city++) {
            const laid = sprawl(
              place,
              planFor(citySeed(`City-${x}-${y}-${city}`), 30, ways),
              spot
            );

            most = Math.max(most, laid.lots.length);

            if (all === 1) {
              fewestAllWays = Math.min(fewestAllWays, laid.lots.length);
            }

            faults.push(
              ...faultsIn(place, laid, spot).map(
                (fault) => `${x},${y} city ${city}: ${fault}`
              )
            );
          }
        });
      }
    }

    expect(
      `${topologyId}: every building on its own square, inside the walls, clear of the others, the streets, the plaza and the unit’s feet; plenty with a street out every way`,
      [faults.slice(0, 5), most >= 20, fewestAllWays >= 12],
      [[], true, true]
    );
  }
);

// Houses line the streets: each beside a street faces it, square to it; the rest face the plaza.
{
  const place = squareAt(5, 5),
    [u, v] = place.centre,
    { streets, lots } = sprawl(
      place,
      planFor(citySeed('Lined'), 30, [east, north, west, south, [1, 1]]),
      inFrontOf(place.centre)
    ),
    // The way a lot faces, and the way across a street.
    facingOf = ({ facing }: Lot) => [Math.sin(facing), Math.cos(facing)],
    // Beside a street: across from it, within its own width of the street's edge, and the room left round it.
    beside = lots.filter((lot) =>
      streets.some(([a, b]) => {
        const du = b[0] - a[0],
          dv = b[1] - a[1],
          t =
            ((lot.at[0] - a[0]) * du + (lot.at[1] - a[1]) * dv) /
            (du * du + dv * dv);

        return (
          t >= 0 &&
          t <= 1 &&
          fromSegment(lot.at, a, b) <= STREET / 2 + lot.width + GAP
        );
      })
    ),
    square = beside.filter((lot) => {
      const [fu, fv] = facingOf(lot);

      return streets.some(([a, b]) => {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
          // How far along the street's way it faces: none, facing square to it.
          along = Math.abs((fu * (b[0] - a[0]) + fv * (b[1] - a[1])) / length),
          // Facing towards it, not away.
          off = fromSegment(lot.at, a, b),
          ahead = fromSegment(
            [lot.at[0] + fu * off, lot.at[1] + fv * off],
            a,
            b
          );

        return along < 1e-9 && ahead < off;
      });
    }),
    others = lots.filter((lot) => !beside.includes(lot)),
    toPlaza = others.filter((lot) => {
      const [fu, fv] = facingOf(lot),
        out = Math.hypot(u - lot.at[0], v - lot.at[1]);

      return (
        Math.abs(fu - (u - lot.at[0]) / out) < 1e-9 &&
        Math.abs(fv - (v - lot.at[1]) / out) < 1e-9
      );
    });

  expect(
    'houses line the streets: each beside a street faces it, square to it, and the rest face the plaza',
    [
      beside.length >= 8,
      square.length === beside.length,
      toPlaza.length === others.length,
    ],
    [true, true, true]
  );
}

// Streets: out to exactly the ways it's given, from the plaza's edge to the edge of the square, where a road's half
//  comes in.
{
  const place = squareAt(5, 5),
    { streets } = sprawl(
      place,
      planFor(citySeed('Streets'), 8, [east, north]),
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
//  and the rest stay where they were, near enough all of them, with the roofs they had.
{
  const place = squareAt(5, 5),
    spot = inFrontOf(place.centre),
    once = sprawl(place, planFor(citySeed('Roma'), 5, [east]), spot),
    again = sprawl(place, planFor(citySeed('Roma'), 5, [east]), spot),
    other = sprawl(place, planFor(citySeed('Antium'), 5, [east]), spot),
    roaded = sprawl(place, planFor(citySeed('Roma'), 5, [east, north]), spot),
    before = positions(once.lots),
    after = positions(roaded.lots),
    kept = before.filter((at) => after.includes(at)).length,
    // The lots kept, each with its roof the same.
    reroofed = once.lots.filter(({ at, roof }) =>
      roaded.lots.some(
        (lot) => lot.at.join(',') === at.join(',') && lot.roof !== roof
      )
    ).length;

  expect(
    'the same city the same every time, another another; a road built runs a street in, the rest of the city staying, roofs and all',
    [
      JSON.stringify(once) === JSON.stringify(again),
      JSON.stringify(once.lots) === JSON.stringify(other.lots),
      roaded.streets.length,
      kept >= before.length * 0.6,
      after.length,
      reroofed,
    ],
    [true, false, 2, true, before.length, 0]
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
