// A city's sprawl on its own square on the 3D map (docs/3d-renderer.md §7.2, plan 4.1, `overlay/sprawl.ts`):
//  - its lots one seeded sequence, a size taking them from the front: grown, it keeps its buildings; shrunk, it loses
//    the outermost; more lots as it grows, up to as many as fit, and plenty fit with a street out every way;
//  - each building's footprint, its roof's eaves turned as it faces, on its own square, inside the walls as they're
//    drawn, clear of every other, the streets, the plaza, and the stand of a unit in front and the ring at its feet as
//    they're drawn, on every grid;
//  - the houses beside a street facing it, square to it, lining it;
//  - streets out to exactly the ways it's given, from the plaza to the edge, where a road's half comes in;
//  - the same every time for the same city, and a road built clearing a street rather than laying it out afresh;
//  - from size 4, its houses on its neighbours' squares, more as it grows, kept as it grows; each, as it's drawn, on its
//    own square, outside the walls, clear of a unit's feet in front of the city and on that square, of the roads,
//    railroads and fields drawn there and of every other house, the cities beside it included, on every grid; none on
//    the sea, mountains or a mine; and those beside a road lining it;
//  - in civil disorder (`disorder.ts`), fires on roofs behind its middle, as many columns as its size has, or one on
//    the ground behind its plaza with none there, every flame and puff keeping its units' room, its smoke rising,
//    growing and leaning away from them and clear of every roof under it; the same for the same city, and a house
//    left standing as a road's built keeping its fire, and its smoke the same, almost always;
//  - celebrating (`celebration.ts`), flags on its roofs, each pole rising from a roof's peak, its pennant from the top
//    along the city's one wind, clear of every other roof and of its units' room, as many as its size has or as there
//    are roofs for; the same for the same city.

import { Color, Euler, Mesh, Vector3 } from 'three';
import { TopologyId } from '@civ-clone/ui-protocol/topology';
import Land from '@civ-clone/ui-map-3d/Land';
import World from '@civ-clone/ui-map/components/World';
import sprawl, {
  CityLayout,
  GAP,
  Lot,
  PLAZA,
  ROADSIDE,
  SprawlPlace,
  STREET,
  UNIT_ROOM,
  WALKWAY,
  citySeed,
  lotsFor,
  planFor,
  suburb,
  suburbReach,
  suburbStepsFor,
  tierFor,
} from '@civ-clone/ui-map-3d/overlay/sprawl';
import {
  ROOFS,
  ROOF_RISE,
  STOREY,
  roadHalf,
} from '@civ-clone/ui-map-3d/overlay/overlayMesh';
import { OverlayMesh } from '@civ-clone/ui-map-3d/overlay/overlayMesh';
import {
  IN_FRONT_OF_CITY,
  MarkerKit,
  drawMarker,
} from '@civ-clone/ui-map-3d/markers/drawMarker';
import { wallsGeometry } from '@civ-clone/ui-map-3d/markers/figures';
import disorderPieces, {
  DISORDER,
  DISORDER_ROOM,
  DisorderPiece,
  disorderColumns,
  nearestTo,
} from '@civ-clone/ui-map-3d/overlay/disorder';
import celebrationPieces, {
  CELEBRATION,
  CelebrationPiece,
  flagsFor,
} from '@civ-clone/ui-map-3d/overlay/celebration';

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
  // What a square beside a city at `cityAt` has on it, for its houses: a road `run` or none, and the way in from its
  //  middle to where units stand in the city where no road takes them.
  besideCity = (
    place: SprawlPlace,
    cityAt: Point,
    runs: { key: number; points: readonly Point[] }[] = [],
    lane = true
  ) => ({
    runs,
    lines: [],
    lanes: lane ? [[place.centre, inFrontOf(cityAt)] as [Point, Point]] : [],
    stands: [inFrontOf(cityAt)],
    others: [],
    taken: [],
  }),
  positions = (lots: Lot[]) => lots.map(({ at }) => at.join(',')),
  // How far out the inside of the walls is, as they're drawn: the nearest any of their faces comes to the middle, across
  //  the ground.
  wallsInside = (() => {
    const geometry = wallsGeometry(),
      at = geometry.getAttribute('position'),
      corners =
        geometry.index === null
          ? Array.from({ length: at.count }, (_, index) => index)
          : Array.from(geometry.index.array),
      // How near the middle the edge from one point to another comes, across the ground.
      edge = (a: number, b: number): number => {
        const au = at.getX(a),
          av = at.getZ(a),
          du = at.getX(b) - au,
          dv = at.getZ(b) - av,
          t =
            du === 0 && dv === 0
              ? 0
              : Math.max(
                  0,
                  Math.min(1, -(au * du + av * dv) / (du * du + dv * dv))
                );

        return Math.hypot(au + du * t, av + dv * t);
      };
    let nearest = Infinity;

    // Along each side of each of its faces, not only at their corners.
    for (let face = 0; face < corners.length; face += 3) {
      const [a, b, c] = corners.slice(face, face + 3) as [
        number,
        number,
        number
      ];

      nearest = Math.min(nearest, edge(a, b), edge(b, c), edge(c, a));
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
  // How far a walking unit's figures, above its stand, reach across the way it faces, as they're drawn, for every kind
  //  of unit on foot, horse or wheels: what passes either side of the line it walks.
  unitsAcross = Math.max(
    ...[
      'Warrior',
      'Spearman',
      'Settlers',
      'Horseman',
      'Chariot',
      'Catapult',
      'Caravan',
      'Musketman',
      'Rifleman',
      'Cannon',
      'Tank',
      'Engineer',
    ].map((type) => {
      const group = drawMarker(new MarkerKit(), {
        city: null,
        unit: {
          id: `Unit-${type}`,
          type,
          kinds: [],
          colours: ['#aa0000', '#ffffff'],
          count: 1,
          active: false,
          busy: false,
          fortified: false,
          veteran: false,
          health: null,
          status: null,
          facing: 0,
          size: 1,
        },
      });
      let widest = 0;

      group.updateMatrixWorld(true);
      group.traverse((part) => {
        if (!(part instanceof Mesh)) {
          return;
        }

        const at = part.geometry.getAttribute('position'),
          point = new Vector3();

        for (let index = 0; index < at.count; index++) {
          point.fromBufferAttribute(at, index).applyMatrix4(part.matrixWorld);

          if (point.y > 0.031 && point.y < 0.3) {
            widest = Math.max(widest, Math.abs(point.x));
          }
        }
      });

      return widest;
    })
  ),
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
//  walls stand out beyond where the lots reach. A walking unit's figures reach no further across its way than the room
//  kept either side of a way in with no road.
expect(
  'a unit’s stand, ring and bank are within the room kept for them, and the walls stand well out from the middle; a walking unit’s figures within the room kept beside a way in',
  [
    unitsFeet > 0.2,
    unitsFeet <= UNIT_ROOM,
    wallsInside > 0.3,
    unitsAcross > 0.1,
    unitsAcross <= WALKWAY,
  ],
  [true, true, true, true, true]
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

// Taller as it grows: each six sizes, the buildings near the middle a storey taller, and those well out the same. Sizes
//  12 and 13 have the same first lots, and only how tall they stand between them differs.
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
    before = storeys(12),
    after = storeys(13).slice(0, before.length),
    near = before.filter(({ out }) => out < 0.15),
    out = before.filter(({ out }) => out > 0.2);

  expect(
    'taller as it grows: near the middle a storey taller at size 13 than 12, well out the same',
    [
      before.every(
        ({ out, storeys }, index) =>
          (out > 0.15 || after[index]!.storeys === storeys + 1) &&
          (out < 0.2 || after[index]!.storeys === storeys)
      ),
      near.length > 0,
      out.length > 5,
    ],
    [true, true, true]
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

// One quay, whatever sea's beside it, on every grid: for every run of neighbours of sea round every square, its street
//  goes the way the run lies on the ground, within half the way between two neighbours of its middle.
(['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach(
  (topologyId) => {
    const size = 8,
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
      astray: string[] = [];

    [
      [3, 3],
      [4, 3],
      [3, 4],
      [4, 4],
    ].forEach(([x, y]) => {
      const centre = layout.centre(x!, y!),
        place: SprawlPlace = {
          centre,
          toward: ([dx, dy]) => layout.centre(x! + dx, y! + dy),
          owns: () => true,
        },
        angleOf = ([du, dv]: Point) => Math.atan2(dv, du),
        // Its neighbours round it on the ground, in order, each with the way to it.
        round = topology
          .directions()
          .map((direction) => {
            const offset = topology.offset(direction, x!, y!),
              [nu, nv] = layout.centre(x! + offset[0], y! + offset[1]);

            return {
              offset,
              angle: angleOf([nu - centre[0], nv - centre[1]]),
            };
          })
          .sort((a, b) => a.angle - b.angle),
        step = (Math.PI * 2) / round.length;

      for (let length = 1; length < round.length; length++) {
        for (let start = 0; start < round.length; start++) {
          const run = Array.from(
              { length },
              (_, index) => round[(start + index) % round.length]!
            ),
            // The way the run lies: the way round to its middle.
            middle = Math.atan2(
              run.reduce((sum, { angle }) => sum + Math.sin(angle), 0),
              run.reduce((sum, { angle }) => sum + Math.cos(angle), 0)
            ),
            { streets } = sprawl(
              place,
              planFor(
                citySeed('Quay'),
                1,
                [],
                run.map(({ offset }) => offset)
              ),
              inFrontOf(centre)
            ),
            [from, to] = streets[0]!,
            quay = angleOf([to[0] - from[0], to[1] - from[1]]),
            off = Math.abs(
              Math.atan2(Math.sin(quay - middle), Math.cos(quay - middle))
            );

          if (streets.length !== 1 || off > step / 2 + 0.02) {
            astray.push(
              `${x},${y} sea ${run
                .map(({ offset }) => offset.join(','))
                .join(' ')}: ${streets.length} streets, ${Math.round(
                (off * 180) / Math.PI
              )}° off`
            );
          }
        }
      }
    });

    expect(
      `${topologyId}: one quay, the way the sea beside it lies on the ground`,
      astray.slice(0, 5),
      []
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

// Onto its neighbours' squares: none below size 4, then further out each size, up to a point.
expect(
  'a city spills onto its neighbours’ squares from size 4, a step further each size, up to a point',
  [
    [1, 3, 4, 5, 15, 16, 40].map(suburbStepsFor),
    suburbReach(0),
    suburbReach(1) > 0.5,
    suburbReach(2) > suburbReach(1),
    suburbReach(12) === suburbReach(40),
  ],
  [[0, 0, 1, 2, 12, 12, 12], 0, true, true, true]
);

// From the front on its neighbours' squares too: size by size, each one's houses there are the next's first, with a road
//  across the square or none; none at size 3.
{
  const notPrefix: string[] = [],
    around = [
      east,
      north,
      west,
      south,
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const;
  let atThree = 0,
    most = 0;

  for (let city = 0; city < 20; city++) {
    around.forEach((way, index) => {
      // The square beside the city, `way` from it: the city's `-way` from there.
      const place = squareAt(10 + way[0], 10 + way[1]),
        toCity = [-way[0], -way[1]] as const,
        cityAt = place.toward(toCity),
        withRoad = (city + index) % 2 === 0,
        runs = withRoad
          ? [
              {
                key: 7,
                points: roadHalf({ ...place, seed: city * 31 + index }, [
                  way[1],
                  -way[0],
                ]).points,
              },
            ]
          : [];
      let before: string[] = [];

      for (let size = 3; size <= 20; size++) {
        const lots = positions(
          suburb(
            place,
            {
              seed: citySeed(`City-${city}`),
              steps: suburbStepsFor(size),
              city: toCity,
            },
            besideCity(place, cityAt, runs)
          )
        );

        if (size === 3) {
          atThree += lots.length;
        }

        if (before.some((at, at2) => lots[at2] !== at)) {
          notPrefix.push(`City-${city} ${way} size ${size}`);
        }

        most = Math.max(most, lots.length);
        before = lots;
      }
    });
  }

  expect(
    'a city’s houses on its neighbours’ squares from the front: grown, it keeps them; shrunk, it loses the outermost; none at size 3',
    [notPrefix.slice(0, 5), atThree, most > 10],
    [[], 0, true]
  );
}

// As drawn, on every grid: a city of each size beside squares of every kind (a road, a railroad, fields, open ground,
//  woods, mountains, the sea, a mine; on hex, with six neighbours, twice, the kinds turned two places round the second
//  time), and another city two squares off sharing some of them. Each house's eaves, read from its roof as it's drawn:
//  - on its own square, a city's or a neighbour of one, and not the mountains, the sea or the mine;
//  - outside the walls as they're drawn, but on the city's own square;
//  - clear of a unit's feet in front of each city, and at the middle of each square a neighbour's;
//  - clear of every road, railroad and field drawn, of every other house, and of the way a unit walks from its square
//    into a city: along the road, or where there's none, as wide as its figures;
//  and more of them on the neighbours as the city grows, plenty in the end, beginning at size 4, on every kind of square
//  they're built on, fields and woods included.
{
  const builtOn = new Set<string>();

  const wallsOutside = (() => {
      const at = wallsGeometry().getAttribute('position');
      let furthest = 0;

      for (let index = 0; index < at.count; index++) {
        furthest = Math.max(
          furthest,
          Math.hypot(at.getX(index), at.getZ(index))
        );
      }

      return furthest;
    })(),
    colours = (css: readonly string[]) => css.map((one) => new Color(one)),
    roofColours = colours(ROOFS),
    // A road, a railroad's ballast and rails and sleepers, and fields' crops and ditches, as they're drawn.
    groundColours = colours([
      '#8c7a58',
      '#5f5953',
      '#a9abae',
      '#5e432b',
      '#7da33f',
      '#c2b448',
      '#8fae3e',
      '#4f87b0',
    ]),
    isOf = (mesh: OverlayMesh, at: number, among: Color[]): boolean =>
      among.some(
        ({ r, g, b }) =>
          Math.abs(mesh.colours[at]! - r) < 1e-4 &&
          Math.abs(mesh.colours[at + 1]! - g) < 1e-4 &&
          Math.abs(mesh.colours[at + 2]! - b) < 1e-4
      ),
    // The smallest convex shape round `points`, its corners in order.
    hull = (points: Point[]): Point[] => {
      const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        cross = (o: Point, a: Point, b: Point) =>
          (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]),
        half = (from: Point[]) =>
          from.reduce<Point[]>((kept, point) => {
            while (
              kept.length >= 2 &&
              cross(kept[kept.length - 2]!, kept[kept.length - 1]!, point) <=
                1e-12
            ) {
              kept.pop();
            }

            kept.push(point);

            return kept;
          }, []),
        lower = half(sorted),
        upper = half([...sorted].reverse());

      return [...lower.slice(0, -1), ...upper.slice(0, -1)];
    },
    // Each house's eaves, as drawn: the base of each roof, a run of triangles in a roof's colour. And the triangles of
    //  the roads, railroads and fields drawn.
    drawnIn = (mesh: OverlayMesh) => {
      const eaves: Point[][] = [],
        ground: Point[][] = [];
      let roof: number[] = [];
      const done = () => {
        if (roof.length > 0) {
          const low = Math.min(...roof.map((at) => mesh.positions[at + 1]!));

          eaves.push(
            hull(
              roof
                .filter((at) => mesh.positions[at + 1]! < low + 1e-6)
                .map(
                  (at) =>
                    [
                      mesh.positions[at]! + mesh.u,
                      mesh.positions[at + 2]! + mesh.v,
                    ] as const
                )
            )
          );
          roof = [];
        }
      };

      for (let at = 0; at < mesh.positions.length; at += 9) {
        if (isOf(mesh, at, roofColours)) {
          roof.push(at, at + 3, at + 6);

          continue;
        }

        done();

        if (isOf(mesh, at, groundColours)) {
          ground.push(
            [at, at + 3, at + 6].map(
              (point) =>
                [
                  mesh.positions[point]! + mesh.u,
                  mesh.positions[point + 2]! + mesh.v,
                ] as const
            )
          );
        }
      }

      done();

      return { eaves, ground };
    };

  (
    [
      ['square', 0],
      ['staggered-iso', 0],
      ['hex-odd-r', 0],
      ['hex-odd-r', 2],
    ] as [TopologyId, number][]
  ).forEach(([topologyId, turn]) => {
    const size = 14,
      tiles = Array.from({ length: size * size }, (_, index) => ({
        x: index % size,
        y: Math.floor(index / size),
        terrain: { _: 'Grassland', __: ['Grassland'], features: [] },
        improvements: [] as { _: string }[],
        units: [],
        city: null as unknown,
        isWater: false,
      })),
      at = (x: number, y: number) => tiles[y * size + x]!,
      world = new World({
        _: 'World',
        __: ['World', 'DataObject'],
        id: 'world',
        width: size,
        height: size,
        topologyId,
        tiles: tiles as never,
      }),
      topology = world.topology(),
      home = [5, 6] as const,
      other = [7, 6] as const,
      cityOf = (name: string, size: number) => ({
        id: name,
        name,
        growth: { size },
      }),
      // The kind of each of the first city's neighbours, by its place round it, turned `turn` places.
      kinds = [
        'road',
        'fields',
        'open',
        'railroad',
        'woods',
        'mountains',
        'sea',
        'mine',
      ],
      neighbours = topology
        .directions()
        .map((direction) => topology.neighbour(...home, direction)!),
      kindAt = new Map(
        neighbours.map(([x, y], index) => [
          `${x},${y}`,
          kinds[(index + turn) % kinds.length]!,
        ])
      ),
      // The squares beside the second city, which has spread onto some of the first's.
      besideOther = new Set(
        topology
          .directions()
          .map((direction) =>
            topology.neighbour(...other, direction)!.join(',')
          )
      ),
      faults: string[] = [],
      // How many houses each size has on the first city's neighbours that aren't the second's too, and how much of the
      //  roads, railroads and fields drawn there are.
      beside: number[] = [];
    let groundDrawn = 0;

    at(...home).improvements = [{ _: 'Road' }];
    neighbours.forEach(([x, y], index) => {
      const tile = at(x, y);

      (
        ({
          road: () => (tile.improvements = [{ _: 'Road' }]),
          fields: () => (tile.improvements = [{ _: 'Irrigation' }]),
          open: () => undefined,
          railroad: () =>
            (tile.improvements = [{ _: 'Road' }, { _: 'Railroad' }]),
          woods: () =>
            (tile.terrain = { _: 'Forest', __: ['Forest'], features: [] }),
          mountains: () =>
            (tile.terrain = {
              _: 'Mountains',
              __: ['Mountains'],
              features: [],
            }),
          sea: () => {
            tile.terrain = { _: 'Ocean', __: ['Ocean'], features: [] };
            tile.isWater = true;
          },
          mine: () => (tile.improvements = [{ _: 'Mine' }]),
        }) as { [kind: string]: () => unknown }
      )[kindAt.get(`${x},${y}`)!]!();
    });

    // The other city two squares off, then beside the first, where the mountains were.
    (
      [
        other,
        neighbours.find(([x, y]) => kindAt.get(`${x},${y}`) === 'mountains')!,
      ] as (readonly [number, number])[]
    ).forEach((otherAt, arrangement) => {
      // What each square beside the first city is, but the second city's own.
      const kindsNow = new Map(kindAt);

      kindsNow.delete(otherAt.join(','));

      [3, 4, 8, 20].forEach((citySize) => {
        at(...home).city = cityOf('Home', citySize);
        at(...otherAt).city = cityOf('Other', 20);

        const land = new Land(world),
          { layout } = land,
          squareOf = ([u, v]: Point) => layout.tileAt(u, v).join(','),
          besideOtherNow = new Set(
            topology
              .directions()
              .map((direction) =>
                topology.neighbour(...otherAt, direction)!.join(',')
              )
          ),
          chunks = new Set(
            [home, otherAt, ...neighbours, ...besideOtherNow].map((at) => {
              const [x, y] =
                typeof at === 'string'
                  ? (at.split(',').map(Number) as [number, number])
                  : at;

              return land.overlayKeyOf(x, y);
            })
          ),
          drawn = [...chunks].map((key) =>
            drawnIn(
              land.overlayOf(
                ...(key.split(',').map(Number) as [number, number])
              )!
            )
          ),
          eaves = drawn.flatMap(({ eaves }) => eaves),
          ground = drawn.flatMap(({ ground }) => ground),
          cities = [home, otherAt].map(([x, y]) => layout.centre(x, y)),
          // `wide` either side of the segment `a`–`b`.
          thin = ([a, b]: [Point, Point], wide: number): Point[] => {
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
              across: Point = [
                (-(b[1] - a[1]) / length) * wide,
                ((b[0] - a[0]) / length) * wide,
              ];

            return [
              [a[0] + across[0], a[1] + across[1]],
              [b[0] + across[0], b[1] + across[1]],
              [b[0] - across[0], b[1] - across[1]],
              [a[0] - across[0], a[1] - across[1]],
            ];
          },
          // The way a unit walks from each square beside a city into it, as the view walks it: along the road
          //  between them as it's drawn (`roadPath`), or straight, from the square's middle to where units stand in
          //  front of the city's buildings.
          walks = [home, otherAt].flatMap(([cx, cy]) =>
            topology.directions().flatMap((direction) => {
              const [x, y] = topology.neighbour(cx, cy, direction)!;

              if (at(x, y).city) {
                return [];
              }

              const [cu, cv] = layout.centre(cx, cy),
                road = land.roadPath(x, y, cx, cy),
                points: Point[] = [
                  layout.centre(x, y),
                  ...(road ?? [])
                    .slice(1, -1)
                    .map(([pu, pv]): Point => [pu + cu, pv + cv]),
                  inFrontOf([cu, cv]),
                ],
                // Along a road, its houses line it at the roadside, and a unit walking it passes through them
                //  (#1282): a hair's breadth either side. Where there's none to show the way, as wide as a walking
                //  unit's figures.
                wide = road === null ? unitsAcross : 0.001;

              return [
                {
                  from: `${x},${y}`,
                  strips: points
                    .slice(1)
                    .map((to, index): [Point, Point] => [points[index]!, to])
                    .filter(
                      ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 0
                    )
                    .map((line) => thin(line, wide)),
                },
              ];
            })
          ),
          middles = [
            ...neighbours,
            ...topology
              .directions()
              .map((direction) => topology.neighbour(...otherAt, direction)!),
          ].map(([x, y]) => layout.centre(x, y));

        eaves.forEach((corners, index) => {
          const middle: Point = [
              corners.reduce((sum, [u]) => sum + u, 0) / corners.length,
              corners.reduce((sum, [, v]) => sum + v, 0) / corners.length,
            ],
            square = squareOf(middle),
            onCity = cities.some((city) => squareOf(city) === square),
            fault = [
              corners.some((corner) => squareOf(corner) !== square) &&
                'off its square',
              ['mountains', 'sea', 'mine'].includes(
                kindsNow.get(square) ?? ''
              ) && `on the ${kindsNow.get(square)}`,
              !onCity &&
                cities.some(
                  (city) => fromShape(city, corners) < wallsOutside
                ) &&
                'inside the walls',
              cities.some(
                (city) => fromShape(inFrontOf(city), corners) < unitsFeet
              ) && 'at the feet of the unit in front of a city',
              !onCity &&
                middles.some((at) => fromShape(at, corners) < unitsFeet) &&
                'at the feet of the unit on its square',
              ground.some((triangle) => overlap(corners, triangle)) &&
                'on a road, railroad or field',
              eaves
                .slice(0, index)
                .some((others) => overlap(corners, others)) && 'on another',
              walks.some(
                ({ from, strips }) =>
                  from === square &&
                  strips.some((strip) => overlap(corners, strip))
              ) && 'in the way of a unit walking from its square into a city',
            ].filter(Boolean);

          if (fault.length > 0) {
            faults.push(
              `${
                arrangement === 0 ? 'apart' : 'beside'
              }, size ${citySize}, house at ${middle.map((n) =>
                n.toFixed(2)
              )}: ${fault.join(', ')}`
            );
          }
        });

        if (arrangement === 0) {
          beside.push(
            eaves.filter((corners) => {
              const square = squareOf(corners[0]!);

              return kindAt.has(square) && !besideOther.has(square);
            }).length
          );
          groundDrawn = ground.length;

          if (citySize === 20) {
            eaves.forEach((corners) =>
              builtOn.add(kindAt.get(squareOf(corners[0]!)) ?? 'city')
            );
          }
        }
      });

      at(...otherAt).city = null;
    });

    expect(
      `${topologyId}${
        turn === 0 ? '' : `, turned ${turn}`
      }: a city’s houses on its neighbours’ squares, as drawn, on their own squares and not the mountains, the sea or a mine, outside the walls, clear of units’ feet, the roads, railroads and fields and each other; more as it grows, from size 4`,
      [
        faults.slice(0, 5),
        beside[0],
        beside[1]! > 0,
        beside[2]! > beside[1]!,
        beside[3]! > beside[2]!,
        beside[3]! >= 40,
        groundDrawn > 100,
      ],
      [[], 0, true, true, true, true, true]
    );
  });

  expect(
    'a city’s houses on every kind of square it builds on, fields and woods included',
    [...builtOn].sort(),
    ['city', 'fields', 'open', 'railroad', 'road', 'woods']
  );
}

// Nearest the city first, thinning outward: on a square beside it, for many cities, the first of its houses there are
//  nearer the city than the last, and further out there are fewer for the room there is.
{
  const place = squareAt(11, 10),
    cityAt = place.toward(west),
    reach = suburbReach(suburbStepsFor(20)),
    // How much of the square, sampled finely, is `from` to `to` from the city's middle, clear of the unit at the square's
    //  middle and the way in.
    roomIn = (from: number, to: number): number => {
      let room = 0;

      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 100; j++) {
          const point: Point = [11 + (i + 0.5) / 100, 10 + (j + 0.5) / 100],
            out = Math.hypot(point[0] - cityAt[0], point[1] - cityAt[1]);

          if (
            out >= from &&
            out < to &&
            Math.hypot(
              point[0] - place.centre[0],
              point[1] - place.centre[1]
            ) >= UNIT_ROOM &&
            // Not on the way in, kept clear for a unit walking it.
            fromSegment(point, place.centre, inFrontOf(cityAt)) >= WALKWAY
          ) {
            room++;
          }
        }
      }

      return room;
    };
  let outward = 0,
    laid = 0,
    near = 0,
    far = 0;

  for (let city = 0; city < 40; city++) {
    const outs = suburb(
        place,
        {
          seed: citySeed(`Thin-${city}`),
          steps: suburbStepsFor(20),
          city: west,
        },
        besideCity(place, cityAt)
      ).map(({ at }) => Math.hypot(at[0] - cityAt[0], at[1] - cityAt[1])),
      third = Math.floor(outs.length / 3),
      mean = (some: number[]) =>
        some.reduce((sum, out) => sum + out, 0) / some.length;

    if (third > 0) {
      laid++;
      outward += mean(outs.slice(0, third)) < mean(outs.slice(-third)) ? 1 : 0;
    }

    near += outs.filter((out) => out < 0.8).length;
    far += outs.filter((out) => out >= 0.9).length;
  }

  expect(
    'on a square beside a city, its houses nearest the city first, and fewer for the room further out',
    [laid, outward, near / roomIn(0.5, 0.8) > (far / roomIn(0.9, reach)) * 1.3],
    [40, 40, true]
  );
}

// Each square round a city its own: for many cities, no house on the square east of it stands where one on the square
//  north of it does, against each one's middle, as they would if each square's lots were the same jostled grid.
{
  let alike = 0,
    laid = 0;

  for (let city = 0; city < 20; city++) {
    const relative = (way: readonly [number, number]) => {
        const place = squareAt(10 + way[0], 10 + way[1]),
          cityAt = place.toward([-way[0], -way[1]]);

        return suburb(
          place,
          {
            seed: citySeed(`Own-${city}`),
            steps: suburbStepsFor(15),
            city: [-way[0], -way[1]],
          },
          besideCity(place, cityAt)
        ).map(({ at }) =>
          [at[0] - place.centre[0], at[1] - place.centre[1]]
            .map((n) => n.toFixed(6))
            .join(',')
        );
      },
      east = relative([1, 0]),
      north = relative([0, -1]);

    laid += east.length + north.length;
    alike += east.filter((at) => north.includes(at)).length;
  }

  expect(
    'each square round a city its own: no house on one stands where one on another does, against its middle',
    [laid > 200, alike],
    [true, 0]
  );
}

// On a neighbour's square, houses line its road in to the city, in a row along it: each beside it faces it, square to
//  it, its front as far from it as the others', and the rest face the city. The same city's the same every time there, and another another.
{
  const place = { ...squareAt(11, 10), seed: 77 },
    toCity = west,
    cityAt = place.toward(toCity),
    // Its road in to the city.
    road = roadHalf(place, toCity).points,
    lines = road.slice(1).map((point, at) => [road[at]!, point] as const),
    // Its road takes a unit in, so there's no way in apart from it.
    laid = (seed: string) =>
      suburb(
        place,
        { seed: citySeed(seed), steps: suburbStepsFor(20), city: toCity },
        besideCity(place, cityAt, [{ key: 7, points: road }], false)
      ),
    lots = laid('Lined'),
    streets = lines,
    facingOf = ({ facing }: Lot) => [Math.sin(facing), Math.cos(facing)],
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
          fromSegment(lot.at, a, b) <= ROADSIDE + lot.width + GAP
        );
      })
    ),
    square = beside.filter((lot) => {
      const [fu, fv] = facingOf(lot);

      return streets.some(([a, b]) => {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
          along = Math.abs((fu * (b[0] - a[0]) + fv * (b[1] - a[1])) / length),
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
    toCityFacing = others.filter((lot) => {
      const [fu, fv] = facingOf(lot),
        out = Math.hypot(cityAt[0] - lot.at[0], cityAt[1] - lot.at[1]);

      return (
        Math.abs(fu - (cityAt[0] - lot.at[0]) / out) < 1e-9 &&
        Math.abs(fv - (cityAt[1] - lot.at[1]) / out) < 1e-9
      );
    });

  expect(
    'on a neighbour’s square, houses line its road in, in a row along it: each beside one faces it, square to it, the rest the city; the same city the same every time, another another',
    [
      beside.length >= 4,
      // For many cities, those beside the road stand in a row along it, each its front as far from it as the others'.
      (() => {
        const setbacks: number[] = [];

        for (let city = 0; city < 30; city++) {
          laid(`Row-${city}`).forEach((lot) => {
            const off = Math.min(
              ...lines.map(([a, b]) => fromSegment(lot.at, a, b))
            );

            if (off <= ROADSIDE + lot.width + GAP) {
              setbacks.push(off - lot.width / 2);
            }
          });
        }

        return [
          setbacks.length > 60,
          Math.max(...setbacks) - Math.min(...setbacks) < 0.003,
        ];
      })(),
      others.length > 0,
      square.length === beside.length,
      toCityFacing.length === others.length,
      JSON.stringify(laid('Lined')) === JSON.stringify(lots),
      JSON.stringify(positions(laid('Other'))) ===
        JSON.stringify(positions(lots)),
    ],
    [true, [true, true], true, true, true, true, false]
  );
}

// On a neighbour's square with no road in, the houses beside the way a unit walks in face it, square to it, as they do
//  a road, for many cities.
{
  const place = { ...squareAt(11, 10), seed: 77 },
    toCity = west,
    cityAt = place.toward(toCity),
    [a, b]: [Point, Point] = [place.centre, inFrontOf(cityAt)],
    du = b[0] - a[0],
    dv = b[1] - a[1],
    length = Math.hypot(du, dv),
    beside: Lot[] = [];

  for (let city = 0; city < 30; city++) {
    suburb(
      place,
      {
        seed: citySeed(`Lane-${city}`),
        steps: suburbStepsFor(20),
        city: toCity,
      },
      besideCity(place, cityAt)
    ).forEach((lot) => {
      const t =
        ((lot.at[0] - a[0]) * du + (lot.at[1] - a[1]) * dv) /
        (du * du + dv * dv);

      if (
        t >= 0 &&
        t <= 1 &&
        fromSegment(lot.at, a, b) <= WALKWAY + lot.width + GAP
      ) {
        beside.push(lot);
      }
    });
  }

  const facingIt = beside.filter(({ at, facing }) => {
    const fu = Math.sin(facing),
      fv = Math.cos(facing),
      off = fromSegment(at, a, b);

    return (
      Math.abs((fu * du + fv * dv) / length) < 1e-9 &&
      fromSegment([at[0] + fu * off, at[1] + fv * off], a, b) < off
    );
  });

  expect(
    'on a neighbour’s square with no road in, the houses beside the way in face it, square to it',
    [beside.length >= 20, facingIt.length === beside.length],
    [true, true]
  );
}

// A city in civil disorder, 30 seeds of it at 10 sizes, with streets out 4 sets of ways, and the sea north or west, or
//  none: its fires on its own roofs behind its middle, each column's flames rising from one's eaves, within it, or on
//  the ground behind its plaza where there's none (never, here); every piece keeping the room its buildings leave its
//  units, and its smoke clear of every roof it reaches, as the roof's square, or over its peak; each column's smoke
//  rising, growing and further from them than the puff under it.
{
  const place = squareAt(5, 5),
    centre = place.centre,
    units = inFrontOf(centre),
    sizes = [1, 2, 3, 4, 6, 8, 12, 20, 32, 40],
    wayss: (readonly (readonly [number, number])[])[] = [
      [],
      [east],
      [north, south],
      [east, north, west, south],
    ],
    seas: (readonly (readonly [number, number])[])[] = [[], [north], [west]],
    perColumn = 2 + DISORDER.puffs,
    ground = 0.02,
    // A roof as the overlay lays it, on flat land 0.02 up: its eaves over its storeys, and its peak over them.
    roofOf = (lot: Lot) => {
      const eaves = ground + lot.storeys * STOREY;

      return {
        at: lot.at,
        width: lot.width,
        eaves,
        peak: eaves + lot.width * ROOF_RISE,
      };
    },
    // How far a point is from a lot's square, along the ground, its roof's eaves out to the square's edges, turned as
    //  it faces: 0 within.
    fromSquare = (
      { at: [lu, lv], width, facing }: Lot,
      u: number,
      v: number
    ) => {
      const across = (u - lu) * Math.cos(facing) - (v - lv) * Math.sin(facing),
        ahead = (u - lu) * Math.sin(facing) + (v - lv) * Math.cos(facing);

      return Math.hypot(
        Math.max(0, Math.abs(across) - width / 2),
        Math.max(0, Math.abs(ahead) - width / 2)
      );
    },
    wrong: string[] = [];
  // How many cities had no roof to burn, and how many fewer columns than their size has.
  let behindPlaza = 0,
    short = 0;

  for (let seed = 1; seed <= 30; seed++) {
    sizes.forEach((size) =>
      wayss.forEach((ways) =>
        seas.forEach((sea) => {
          const columns = disorderColumns(size),
            { lots } = sprawl(place, planFor(seed, size, ways, sea), units),
            pieces = disorderPieces({
              centre,
              units,
              roofs: lots.map(roofOf),
              seed,
              columns,
              ground: () => ground,
            }),
            count = pieces.length / perColumn,
            fires = pieces.filter((piece) => piece.kind === 'fire'),
            onGround = fires.every(
              ({ at: [u, , v] }) =>
                Math.abs(u - centre[0]) <= DISORDER.fireWidth &&
                Math.abs(v - (centre[1] - DISORDER.behindPlaza)) <= 1e-9
            ),
            name = `${seed} ${size} ${ways.join('|')} ${sea.join('|')}`;

          behindPlaza += onGround ? 1 : 0;
          short += count < columns ? 1 : 0;

          if (!Number.isInteger(count) || count < 1 || count > columns) {
            wrong.push(`${name}: ${pieces.length} pieces`);
          }

          // Each flame on a roof behind the middle, rising from its eaves, half as wide as it, within it.
          fires.forEach(({ at: [u, y, v], size: [width, height] }) => {
            const base = y - height / 2;

            if (
              !onGround &&
              !lots.some(
                (lot) =>
                  lot.at[1] < centre[1] &&
                  Math.hypot(u - lot.at[0], v - lot.at[1]) + width / 2 <=
                    lot.width / 2 + 1e-9 &&
                  Math.abs(width - lot.width / 2) < 1e-9 &&
                  Math.abs(base - roofOf(lot).eaves) < 1e-9
              )
            ) {
              wrong.push(`${name}: a fire off a roof at ${u},${v}`);
            }
          });

          // Clear of its units, and its smoke over every roof it reaches.
          pieces.forEach((piece) => {
            if (nearestTo(piece, units) < DISORDER_ROOM - 1e-9) {
              wrong.push(`${name}: a ${piece.kind} in its units' room`);
            }

            if (
              piece.kind === 'smoke' &&
              lots.some(
                (lot) =>
                  fromSquare(lot, piece.at[0], piece.at[2]) <
                    piece.size[0] / 2 &&
                  piece.at[1] - piece.size[1] / 2 < roofOf(lot).peak
              )
            ) {
              wrong.push(`${name}: smoke in a roof`);
            }
          });

          for (let column = 0; column < count; column++) {
            const smoke = pieces
                .slice(column * perColumn, (column + 1) * perColumn)
                .filter((piece) => piece.kind === 'smoke'),
              fromUnits = (piece: DisorderPiece) =>
                Math.hypot(piece.at[0] - units[0], piece.at[2] - units[1]);

            smoke.slice(1).forEach((piece, at) => {
              const under = smoke[at]!;

              if (
                piece.at[1] <= under.at[1] ||
                piece.size[0] <= under.size[0] ||
                fromUnits(piece) <= fromUnits(under) ||
                piece.alpha >= under.alpha
              ) {
                wrong.push(`${name}: column ${column} puff ${at + 1}`);
              }
            });
          }
        })
      )
    );
  }

  const same = (seed: number) =>
    JSON.stringify(
      disorderPieces({
        centre,
        units,
        roofs: sprawl(place, planFor(seed, 9, [east]), units).lots.map(roofOf),
        seed,
        columns: 3,
        ground: () => ground,
      })
    );

  expect(
    'a city in civil disorder: its fires on its own roofs behind its middle, or on the ground behind its plaza with none there, as many columns as its size has at most; every piece keeping its units’ room; each column’s smoke rising, growing and leaning away from them; none out of disorder; the same for the same city, and another another',
    [
      [1, 3, 4, 7, 8, 20].map(disorderColumns),
      // As far from its units as its buildings keep.
      DISORDER_ROOM === UNIT_ROOM + GAP,
      wrong.slice(0, 3),
      disorderPieces({
        centre,
        units,
        roofs: [],
        seed: 1,
        columns: 0,
        ground: () => ground,
      }),
      same(5) === same(5),
      same(5) !== same(6),
      // Over all of them, none with no roof to burn, and none with fewer columns than its size has.
      behindPlaza,
      short,
      // With only a roof in front of its middle: one column, on the ground behind its plaza.
      disorderPieces({
        centre,
        units,
        roofs: [
          {
            at: [centre[0] + 0.15, centre[1] + 0.05],
            width: 0.05,
            eaves: 0.18,
            peak: 0.2,
          },
        ],
        seed: 1,
        columns: 2,
        ground: () => ground,
      })
        .filter((piece) => piece.kind === 'fire')
        .map(({ at: [u, y, v], size: [, height] }) => [
          Math.abs(u - centre[0]) <= DISORDER.fireWidth,
          Math.round((y - height / 2) * 1e6) / 1e6,
          Math.round((centre[1] - v) * 1e6) / 1e6,
        ]),
    ],
    [
      [1, 1, 2, 2, 3, 3],
      true,
      [],
      [],
      true,
      true,
      0,
      0,
      [
        [true, ground, DISORDER.behindPlaza],
        [true, ground, DISORDER.behindPlaza],
      ],
    ]
  );

  // A roof right behind its middle, so near its units that its column would come into their room (its smoke, here):
  //  passed over, for the ground behind its plaza.
  expect(
    'a city in civil disorder: a roof whose column would come into its units’ room is passed over',
    disorderPieces({
      centre,
      units,
      roofs: [
        {
          at: [centre[0], centre[1] - 0.01],
          width: 0.05,
          eaves: 0.18,
          peak: 0.2,
        },
      ],
      seed: 1,
      columns: 1,
      ground: () => ground,
    })
      .filter((piece) => piece.kind === 'fire')
      .map(({ at: [, , v] }) => Math.round((centre[1] - v) * 1e6) / 1e6),
    [DISORDER.behindPlaza, DISORDER.behindPlaza]
  );

  // A road built into a city in disorder, clearing a street through some of its lots and taking others further out in
  //  their place: of the houses burning that are left standing, nearly all keep their fire, unless a lot taken ranks
  //  ahead, and each that does keeps its column just as it was.
  const burningIn = (
      seed: number,
      size: number,
      ways: readonly (readonly [number, number])[]
    ) => {
      const { lots } = sprawl(place, planFor(seed, size, ways), units),
        pieces = disorderPieces({
          centre,
          units,
          roofs: lots.map(roofOf),
          seed,
          columns: disorderColumns(size),
          ground: () => ground,
        }),
        spot = ([u, v]: readonly [number, number]) =>
          `${u.toFixed(9)},${v.toFixed(9)}`,
        // Each burning house's column, by where it stands: its two flames either side of it.
        burning = new Map<string, string>();

      for (let column = 0; column * perColumn < pieces.length; column++) {
        const [left, right] = pieces.slice(column * perColumn),
          at = [
            (left!.at[0] + right!.at[0]) / 2,
            (left!.at[2] + right!.at[2]) / 2,
          ] as const;

        burning.set(
          spot(at),
          JSON.stringify(
            pieces.slice(column * perColumn, (column + 1) * perColumn)
          )
        );
      }

      return { standing: new Set(lots.map((lot) => spot(lot.at))), burning };
    },
    roadsBuilt: (readonly (readonly [number, number])[])[][] = [
      [[], [east]],
      [[east], [east, north]],
      [[north], [north, west]],
    ];
  let left = 0,
    kept = 0,
    changed = 0;

  for (let seed = 1; seed <= 40; seed++) {
    [3, 4, 6, 8, 12, 20].forEach((size) =>
      roadsBuilt.forEach(([before, after]) => {
        const was = burningIn(seed, size, before!),
          is = burningIn(seed, size, after!);

        was.burning.forEach((column, at) => {
          if (is.standing.has(at)) {
            left++;

            if (is.burning.has(at)) {
              kept++;
              changed += is.burning.get(at) === column ? 0 : 1;
            }
          }
        });
      })
    );
  }

  expect(
    'a city in civil disorder: of the houses burning left standing as a road’s built, nine in ten or more keep their fire, each its column just as it was',
    [left > 500, kept >= left * 0.9, changed],
    [true, true, 0]
  );
}

// A city celebrating, 30 seeds of it at 8 sizes, with streets out 4 sets of ways and the sea north or west, or none:
//  its flags on its own roofs, each pole rising from a roof's peak at its middle, its pennant out from the pole's top
//  along the city's one wind, within 50° of east or west, from either side, clear of every other roof (as the roof's
//  square, turned as it faces, or under the pennant), of its units' room and of every other flag; every colour flown;
//  as many as its size has at most, and here, every one of them; the same for the same city, and another another;
//  none when it isn't celebrating.
{
  const place = squareAt(5, 5),
    centre = place.centre,
    units = inFrontOf(centre),
    ground = 0.02,
    roofOf = (lot: Lot) => {
      const eaves = ground + lot.storeys * STOREY;

      return {
        at: lot.at,
        width: lot.width,
        eaves,
        peak: eaves + lot.width * ROOF_RISE,
      };
    },
    // How far a point is from a lot's square, along the ground, turned as it faces: 0 within.
    fromSquare = ({ at: [lu, lv], width, facing }: Lot, u: number, v: number) =>
      Math.hypot(
        Math.max(
          0,
          Math.abs((u - lu) * Math.cos(facing) - (v - lv) * Math.sin(facing)) -
            width / 2
        ),
        Math.max(
          0,
          Math.abs((u - lu) * Math.sin(facing) + (v - lv) * Math.cos(facing)) -
            width / 2
        )
      ),
    piecesOf = (
      seed: number,
      size: number,
      ways: readonly (readonly [number, number])[],
      sea: readonly (readonly [number, number])[]
    ) => {
      const flags = flagsFor(size),
        plan = planFor(seed, size, ways, sea, 0, flags),
        { lots } = sprawl(place, plan, units);

      return {
        plan,
        flags,
        lots,
        pieces: celebrationPieces({
          centre,
          units,
          roofs: lots.map(roofOf),
          seed,
          flags,
        }),
      };
    },
    // How far a point is from the segment from `a` to `b`, along the ground.
    toSegment = (
      [pu, pv]: readonly [number, number],
      [au, av]: readonly [number, number],
      [bu, bv]: readonly [number, number]
    ) => {
      const du = bu - au,
        dv = bv - av,
        along = Math.max(
          0,
          Math.min(1, ((pu - au) * du + (pv - av) * dv) / (du * du + dv * dv))
        );

      return Math.hypot(pu - (au + du * along), pv - (av + dv * along));
    },
    // Which side each city's wind blows from, and every pennant's colour, over them all.
    sides = new Set<string>(),
    colours = new Set<string>(),
    wrong: string[] = [];
  let cities = 0,
    flown = 0,
    wanted = 0,
    none = 0;

  for (let seed = 1; seed <= 30; seed++) {
    [1, 2, 3, 4, 6, 8, 12, 20].forEach((size) =>
      [[], [east], [north, south], [east, north, west, south]].forEach((ways) =>
        [[], [north], [west]].forEach((sea) => {
          const { plan, flags, lots, pieces } = piecesOf(seed, size, ways, sea),
            poles = pieces.filter(({ kind }) => kind === 'pole'),
            pennants = pieces.filter(({ kind }) => kind === 'pennant'),
            name = `${seed} ${size} ${ways.join('|')} ${sea.join('|')}`,
            winds = new Set<string>();

          cities++;
          flown += poles.length;
          wanted += flags;
          none += poles.length === 0 ? 1 : 0;

          if (
            plan.celebration !== flags ||
            poles.length !== pennants.length ||
            poles.length > flags
          ) {
            wrong.push(`${name}: ${poles.length} of ${flags} flags`);
          }

          poles.forEach((pole: CelebrationPiece, index) => {
            const pennant = pennants[index]!,
              lot = lots.find(
                ({ at: [lu, lv] }) =>
                  Math.hypot(lu - pole.at[0], lv - pole.at[2]) < 1e-9
              ),
              top = pole.at[1] + pole.size[1] / 2,
              du = pennant.at[0] - pole.at[0],
              dv = pennant.at[2] - pole.at[2],
              low = pennant.at[1] - pennant.size[1] / 2;

            winds.add(Math.atan2(dv, du).toFixed(9));

            if (
              lot === undefined ||
              Math.abs(pole.at[1] - pole.size[1] / 2 - roofOf(lot).peak) >
                1e-9 ||
              Math.abs(pole.size[1] - CELEBRATION.pole) > 1e-9 ||
              Math.abs(pennant.at[1] + pennant.size[1] / 2 - top) > 1e-9 ||
              Math.abs(Math.hypot(du, dv) * 2 - pennant.size[0]) > 1e-9 ||
              Math.abs(Math.sin((pennant.turn + Math.atan2(dv, du)) / 2)) > 1e-9
            ) {
              wrong.push(`${name}: flag ${index} off its roof or pole`);

              return;
            }

            [0, 0.25, 0.5, 0.75, 1].forEach((along) => {
              const pu = pole.at[0] + du * 2 * along,
                pv = pole.at[2] + dv * 2 * along;

              if (
                Math.hypot(pu - units[0], pv - units[1]) <
                DISORDER_ROOM - 1e-9
              ) {
                wrong.push(`${name}: flag ${index} in its units' room`);
              }

              if (
                lots.some(
                  (other) =>
                    other !== lot &&
                    fromSquare(other, pu, pv) <= 0 &&
                    low < roofOf(other).peak
                )
              ) {
                wrong.push(`${name}: flag ${index} in a roof`);
              }
            });
          });

          if (winds.size > 1) {
            wrong.push(`${name}: ${winds.size} winds`);
          }

          // Its wind within 50° of east or west, and its flags apart: each pennant from every other pole and pennant.
          pennants.forEach((pennant, index) => {
            const pole = poles[index]!,
              wind = Math.atan2(
                pennant.at[2] - pole.at[2],
                pennant.at[0] - pole.at[0]
              ),
              from: [number, number] = [pole.at[0], pole.at[2]],
              tip: [number, number] = [
                pole.at[0] + (pennant.at[0] - pole.at[0]) * 2,
                pole.at[2] + (pennant.at[2] - pole.at[2]) * 2,
              ];

            sides.add(Math.cos(wind) > 0 ? 'east' : 'west');
            colours.add(pennant.colour);

            if (
              Math.abs(Math.cos(wind)) <
              Math.cos(CELEBRATION.windFromEastWest) - 1e-9
            ) {
              wrong.push(`${name}: its wind ${wind}`);
            }

            pennants.forEach((other, at) => {
              const otherPole = poles[at]!,
                otherFrom: [number, number] = [
                  otherPole.at[0],
                  otherPole.at[2],
                ],
                otherTip: [number, number] = [
                  otherPole.at[0] + (other.at[0] - otherPole.at[0]) * 2,
                  otherPole.at[2] + (other.at[2] - otherPole.at[2]) * 2,
                ];

              if (
                at !== index &&
                Math.min(
                  toSegment(otherFrom, from, tip),
                  toSegment(otherTip, from, tip),
                  toSegment(from, otherFrom, otherTip),
                  toSegment(tip, otherFrom, otherTip)
                ) <
                  CELEBRATION.apart - 1e-9
              ) {
                wrong.push(`${name}: flags ${index} and ${at} together`);
              }
            });
          });
        })
      )
    );
  }

  const same = (seed: number) =>
    JSON.stringify(piecesOf(seed, 9, [east], []).pieces);

  expect(
    'a city celebrating: its flags on its own roofs, each pole rising from a roof’s peak, its pennant from the pole’s top along one wind near east or west, clear of every other roof, of its units’ room and of every other flag; winds both ways and every colour; as many as its size has at most, and here every one; the same for the same city, and another another; none when it isn’t',
    [
      [1, 2, 3, 4, 8, 12, 20].map(flagsFor),
      wrong.slice(0, 3),
      // Over all of them, none with no flag, and every one with as many as its size has; winds from both sides, and
      //  every colour.
      none,
      flown === wanted,
      sides.size,
      colours.size,
      same(5) === same(5),
      same(5) !== same(6),
      celebrationPieces({
        centre,
        units,
        roofs: piecesOf(5, 9, [east], []).lots.map(roofOf),
        seed: 5,
        flags: 0,
      }),
      planFor(5, 9, [east], [], 0, 0).celebration,
    ],
    [[2, 2, 3, 3, 5, 7, 8], [], 0, true, 2, 5, true, true, [], undefined]
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
