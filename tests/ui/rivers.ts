// Rivers on the 3D map's land (docs/3d-renderer.md §5.3, plan 3.3), on every grid:
//  - a course's shape: from one square's middle to the next's, bent a little, a mouth widening, a pool;
//  - how it cuts the land: down to its bed across its water and past, back up over its bank, never raising it;
//  - which squares a river joins: those across an edge with a river or water, seen, and nothing else;
//  - its level: under the land round it, and its bed over the sea's but where its level's at the sea's;
//  - the same across the world's seam;
//  - a square changed reshapes only the squares refresh says, and refreshed, the land's as if made afresh.

import topologyFor, { Topology } from '@civ-clone/ui-client/lib/topologyFor';
import groundLayoutFor, { GroundLayout } from '@civ-clone/ui-map-3d/layouts';
import createRelief, {
  ReliefMap,
  ReliefSource,
} from '@civ-clone/ui-map-3d/terrain/relief';
import {
  BANK,
  DEPTH,
  FLOOR,
  MARGIN,
  MEANDER,
  MOUTH,
  POOL_WIDTH,
  RIVER_WIDTH,
  STEPS,
  alongOf,
  bedOf,
  chordAlong,
  courseFrom,
  cutBy,
  nearestOn,
  underLand,
} from '@civ-clone/ui-map-3d/terrain/rivers';
import { TopologyId } from '@civ-clone/ui-protocol/topology';

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

const near = (a: number, b: number, within = 1e-9): boolean =>
  Math.abs(a - b) <= within;

// A course's shape: its ends at the two squares' middles, its middle bent off the line by no more than `MEANDER`, the
//  same every time, and each its own way.
{
  const course = courseFrom(3, 4, 1, 0, { seed: 7 }),
    again = courseFrom(3, 4, 1, 0, { seed: 7 }),
    others = [1, 2, 3, 4, 5, 6].map(
      (x) => courseFrom(x, 4, 1, 0, { seed: 7 }).points[(STEPS / 2) * 2 + 1]
    ),
    [middleU, middleV] = [
      course.points[(STEPS / 2) * 2]!,
      course.points[(STEPS / 2) * 2 + 1]!,
    ];

  expect(
    'a course runs from its square’s middle to its neighbour’s, its middle bent off the line by no more than the meander, the same every time, and each its own way',
    [
      course.points.slice(0, 2),
      course.points.slice(-2),
      course.points.length,
      near(middleU, 0.5),
      Math.abs(middleV) <= MEANDER + 1e-9,
      JSON.stringify(again) === JSON.stringify(course),
      new Set(others.map((v) => v!.toFixed(6))).size > 3,
      course.widths.every((width) => width === RIVER_WIDTH),
      course.mouth,
    ],
    [[0, 0], [1, 0], (STEPS + 1) * 2, true, true, true, true, true, false]
  );

  const mouth = courseFrom(3, 4, 0, 1, { mouth: true }),
    pool = courseFrom(3, 4, 0, 0);

  expect(
    'a mouth is as wide as a river to a quarter of the way, widens to the coast, halfway, and is as wide on into the sea; a pool is round its square’s middle',
    [
      mouth.mouth,
      mouth.widths.slice(0, STEPS / 4 + 1).every((w) => w === RIVER_WIDTH),
      mouth.widths[STEPS / 2],
      mouth.widths[STEPS],
      pool.points.every((n) => n === 0),
      pool.widths.every((w) => w === POOL_WIDTH),
    ],
    [true, true, RIVER_WIDTH * MOUTH, RIVER_WIDTH * MOUTH, true, true]
  );

  expect(
    'how far along and how far from a course a point is',
    [
      nearestOn(courseFrom(0, 0, 1, 0, { seed: 3 }), -0.3, 0)[1],
      Number(nearestOn(pool, 0.3, 0.4)[0].toFixed(9)),
      alongOf([0, 1, 2, 3, 4, 5, 6, 7, 8], 2.5),
      alongOf([0, 1, 2, 3, 4, 5, 6, 7, 8], STEPS),
    ],
    [0, 0.5, 2.5, 8]
  );
}

// How a course cuts the land: down to its bed across its water and `FLOOR` past, rising back over `BANK`; never above
//  what it was; wet at the water, dry past the bank. Its bed under its water, but over the sea's where its water is.
{
  const course = courseFrom(0, 0, 1, 0, { seed: 1 });

  course.levels = course.widths.map(() => 0.02);

  const bed = bedOf(0.02),
    [pu, pv] = [course.points[8]!, course.points[9]!],
    // Straight across the course where it's a point: it runs along `u` there, near enough.
    across = (by: number) => cutBy(course, pu, pv + by, 0.05),
    floorEdge = across(RIVER_WIDTH + FLOOR - 0.001),
    bankMiddle = across(RIVER_WIDTH + FLOOR + BANK / 2),
    pastBank = across(RIVER_WIDTH + FLOOR + BANK + 0.01);

  expect(
    'a river cuts the land down to its bed across its water and past it, rising back over its bank, wet at the water and dry past the bank',
    [
      across(0)[0] === bed,
      across(0)[1],
      floorEdge[0] === bed,
      bankMiddle[0] > bed && bankMiddle[0] < 0.05,
      pastBank,
      cutBy(course, pu, pv, 0.001),
    ],
    [true, 1, true, true, [0.05, 0], [0.001, 1]]
  );

  expect(
    'its bed is under its water, but over the sea where its water is; at the sea’s level, at it; under the sea’s, under its water by as far again, to the depth, smoothly',
    [
      bedOf(0.02) < 0.02 && bedOf(0.02) > 0,
      bedOf(0.001) > 0 && bedOf(0.001) < 0.001,
      near(bedOf(0.02), 0.02 - DEPTH),
      bedOf(0),
      bedOf(-0.001),
      near(bedOf(-0.01), -0.01 - DEPTH),
      // No step either side of the sea's level, nor where the bed's as deep as it goes.
      [
        1e-9,
        -1e-9,
        DEPTH * 1.25 + 1e-9,
        DEPTH * 1.25 - 1e-9,
        -DEPTH + 1e-9,
        -DEPTH - 1e-9,
      ].every(
        (level, at, all) =>
          at % 2 === 1 || Math.abs(bedOf(level) - bedOf(all[at + 1]!)) < 1e-8
      ),
    ],
    [true, true, true, 0, -0.002, true, true]
  );

  expect(
    'a river’s level is the margin under the land round it, but nearer the sea’s level than twice that, half as far again from it: over the sea where the land is, under it where it isn’t, smoothly',
    [
      near(underLand(0.02), 0.02 - MARGIN),
      near(underLand(0.002), 0.001),
      underLand(0.0001) > 0,
      near(underLand(-0.002), -0.003),
      near(underLand(-0.02), -0.02 - MARGIN),
      underLand(0),
      [1e-9, -1e-9, MARGIN * 2 + 1e-9, MARGIN * 2 - 1e-9].every(
        (low, at, all) =>
          at % 2 === 1 ||
          Math.abs(underLand(low) - underLand(all[at + 1]!)) < 1e-8
      ),
    ],
    [true, true, true, true, true, 0, true]
  );
}

// On each grid: a world of grassland and hills, with a river from inland to the sea, bending; a river on its own; a
//  river beside a square never seen.
const width = 12,
  height = 10,
  ids: TopologyId[] = ['square', 'staggered-iso', 'hex-odd-r'];

const sourceFor = (
  topology: Topology,
  terrainAt: (x: number, y: number) => string,
  rivers: (x: number, y: number) => boolean
): ReliefSource => {
  const list = (directions: readonly string[], x: number, y: number) =>
    directions
      .map((direction) => topology.neighbour(x, y, direction as never))
      .filter((square): square is [number, number] => square !== null);

  return {
    width,
    height,
    wrapsY: topology.wrapsY(),
    terrainAt,
    waterAt: (x, y) => terrainAt(x, y) === 'Ocean',
    neighbours: (x, y) => list(topology.directions(), x, y),
    riverAt: rivers,
    edgeNeighbours: (x, y) => list(topology.edgeDirections(), x, y),
  };
};

ids.forEach((topologyId) => {
  const topology = topologyFor({ width, height, topologyId }),
    layout: GroundLayout = groundLayoutFor({
      width,
      height,
      topologyId,
      wrapsY: topology.wrapsY(),
    }),
    period = layout.period(),
    edges = topology.edgeDirections(),
    [a, b] = [edges[1]!, edges[2]!],
    // A river from inland, bending, to the sea one step on.
    chain: [number, number][] = [[3, 3]];

  [a, a, b, a].forEach((direction) => {
    const [x, y] = chain[chain.length - 1]!;

    chain.push(topology.neighbour(x, y, direction)!);
  });

  const end = chain[chain.length - 1]!,
    sea = topology.neighbour(end[0], end[1], a)!,
    key = ([x, y]: [number, number]) => `${x},${y}`,
    river = new Set(chain.map(key)),
    lone: [number, number] = [9, 7],
    // A river square seen beside one never seen, which has a river.
    frontier: [number, number] = [9, 2],
    hidden = topology.neighbour(9, 2, a)!,
    // Civ1's River terrain, but at the chain's end, which is hills with a river, as Civ2 has it, high over the sea.
    named = new Set([...river, key(lone), key(frontier), key(hidden)]),
    terrains = new Map<string, string>([[key(end), 'Hills']]),
    rivers = new Set(named),
    terrainAt = (x: number, y: number): string =>
      terrains.get(`${x},${y}`) ??
      (key([x, y]) === key(sea)
        ? 'Ocean'
        : key([x, y]) === key(hidden)
        ? 'Unknown'
        : named.has(`${x},${y}`)
        ? 'River'
        : (x * 7 + y * 3) % 5 === 0
        ? 'Hills'
        : 'Grassland'),
    riverAt = (x: number, y: number) =>
      rivers.has(`${x},${y}`) && terrainAt(x, y) !== 'Unknown',
    relief = createRelief({
      layout,
      source: sourceFor(topology, terrainAt, riverAt),
    }),
    // The same land with no rivers: what they cut.
    dry = createRelief({
      layout,
      source: sourceFor(topology, terrainAt, () => false),
    }),
    courses = relief.courses(),
    mouths = courses.filter(({ course }) => course.mouth),
    pools = courses.filter(({ course }) => course.points.every((n) => n === 0)),
    // Each course's point at `along`, on the world.
    pointOf = (
      { course, u, v }: (typeof courses)[number],
      along: number
    ): [number, number] => {
      const step = Math.min(STEPS - 1, Math.floor(along)),
        t = along - step;

      return [
        u +
          (course.points[step * 2] ?? 0) * (1 - t) +
          (course.points[step * 2 + 2] ?? 0) * t,
        v +
          (course.points[step * 2 + 1] ?? 0) * (1 - t) +
          (course.points[step * 2 + 3] ?? 0) * t,
      ];
    };

  expect(
    `${topologyId}: a river joins each neighbour across an edge with a river, once, and the sea; one on its own is a pool; none joins a square never seen`,
    [
      courses.length,
      mouths.length,
      pools.length,
      pools.some(({ u, v }) => {
        const [fu, fv] = layout.centre(...frontier);

        return near(u, fu) && near(v, fv);
      }),
    ],
    // The chain's four joins and its mouth; the lone river's pool and the frontier's.
    [7, 1, 2, true]
  );

  // Along every course, a little apart: where its own water is, over the sea's level, its level under the land round
  //  it without the river, seen and dry, at it and at its bed's edge and its bank's top; the land cut down under it
  //  across its water and its bed; and never raised anywhere.
  let over = 0,
    unburied = true,
    inlandOverSea = true,
    raised = false;

  courses.forEach((placed) => {
    const { course } = placed;

    for (let along = 0; along <= STEPS; along += 0.25) {
      const [pu, pv] = pointOf(placed, along),
        level = alongOf(course.levels, along),
        wide = alongOf(course.widths, along),
        [du, dv] = [
          pointOf(placed, Math.min(STEPS, along + 0.25))[0] -
            pointOf(placed, Math.max(0, along - 0.25))[0],
          pointOf(placed, Math.min(STEPS, along + 0.25))[1] -
            pointOf(placed, Math.max(0, along - 0.25))[1],
        ],
        length = Math.hypot(du, dv) || 1,
        onLand = (u: number, v: number) => {
          const [x, y] = layout.tileAt(u, v),
            name = terrainAt(
              ((x % width) + width) % width,
              ((y % height) + height) % height
            );

          return name !== 'Ocean' && name !== 'Unknown';
        };

      if (course.mouth && along > STEPS / 2) {
        continue;
      }

      [0, wide, wide + FLOOR, wide + FLOOR + BANK].forEach((out) =>
        [-1, 1].forEach((side) => {
          const u = pu - (dv / length) * out * side,
            v = pv + (du / length) * out * side;

          // Where its own water's drawn: at the sea's level or under, the sea's its water. At each point and halfway
          //  between, under it by the margin; between those, the land may dip.
          if (
            onLand(u, v) &&
            level > 0 &&
            out !== wide &&
            Number.isInteger(along * 2)
          ) {
            over = Math.max(over, level - underLand(dry.height(u, v)));
          }

          if (onLand(u, v) && level > 0 && out < wide + FLOOR) {
            // By where it falls along the course's line, as the channel's cut.
            unburied &&=
              relief.height(u, v) <
              alongOf(
                course.levels,
                chordAlong(course, u - placed.u, v - placed.v)
              );
          }
        })
      );

      // Of a river wholly over the sea's level: one that comes down to it has the sea in its channel there.
      if (course.levels.every((each) => each > 0) && onLand(pu, pv)) {
        inlandOverSea &&= relief.height(pu, pv) > 0;
      }
    }
  });

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      [0.1, 0.4, 0.7].forEach((du) =>
        [0.2, 0.5, 0.8].forEach((dv) => {
          const [u, v] = layout.centre(x, y),
            [pu, pv] = [u - 0.5 + du, v - 0.5 + dv];

          raised ||= relief.height(pu, pv) > dry.height(pu, pv);
        })
      );
    }
  }

  // Where courses meet, at a square's middle, their levels are the same.
  const atMiddles = new Map<string, number[]>();

  courses.forEach((placed) =>
    (placed.course.mouth ? [0] : [0, STEPS]).forEach((step) => {
      const [u, v] = pointOf(placed, step),
        [x, y] = layout.tileAt(u, v),
        at = key([
          ((x % width) + width) % width,
          ((y % height) + height) % height,
        ]);

      atMiddles.set(at, [
        ...(atMiddles.get(at) ?? []),
        placed.course.levels[step]!,
      ]);
    })
  );

  expect(
    `${topologyId}: a river’s level is under the land round it, seen and dry, across its water and bed, where its own water is; the land’s cut down under it there, never raised anywhere; its bed’s over the sea where it’s all over the sea’s level; and where courses meet, they’re at one level`,
    [
      over <= 1e-12,
      unburied,
      raised,
      inlandOverSea,
      [...atMiddles.values()].every((levels) =>
        levels.every((level) => level === levels[0])
      ),
      [...atMiddles.values()].some((levels) => levels.length > 1),
    ],
    [true, true, false, true, true, true]
  );

  const [mouth] = mouths,
    coast = mouth === undefined ? [0, 0] : pointOf(mouth, STEPS / 2),
    pastCoast = mouth === undefined ? [0, 0] : pointOf(mouth, STEPS * 0.6),
    seaFloor = mouth === undefined ? [0, 0] : pointOf(mouth, STEPS);

  expect(
    `${topologyId}: a river’s mouth from hills is down from over the sea’s level to it at the coast, and its bed under the sea past it, so the sea’s in its channel there; the sea’s floor under it isn’t wet`,
    [
      mouth !== undefined && (mouth.course.levels[0] ?? 0) > 0.01,
      mouth !== undefined && (mouth.course.levels[STEPS / 2] ?? 1) <= 0,
      relief.height(coast[0]!, coast[1]!) <= 1e-12,
      relief.height(pastCoast[0]!, pastCoast[1]!) < 0,
      // The sea's floor under it as it was, not wet: banks are land.
      JSON.stringify(relief.sample(seaFloor[0]!, seaFloor[1]!).colour) ===
        JSON.stringify(dry.sample(seaFloor[0]!, seaFloor[1]!).colour),
      relief.height(seaFloor[0]!, seaFloor[1]!) <
        dry.height(seaFloor[0]!, seaFloor[1]!) + 1e-12,
    ],
    [true, true, true, true, true, true]
  );

  // Its banks wet: darker than the land without it, by the water, and as it was past its bank.
  const [middle] = courses.filter(
      ({ course }) => !course.mouth && course.points.some((n) => n !== 0)
    ),
    [mu, mv] = middle === undefined ? [0, 0] : pointOf(middle, STEPS / 2),
    shade = (sample: { colour: number[] }) =>
      sample.colour.reduce((sum, channel) => sum + channel, 0),
    wetShade = shade(relief.sample(mu, mv)),
    dryShade = shade(dry.sample(mu, mv));

  expect(
    `${topologyId}: a river’s banks are wet, darker than the land without it`,
    [middle !== undefined, wetShade < dryShade * 0.9],
    [true, true]
  );

  // No step anywhere near a river: a hair either side of every edge of every square near one, the land's the same.
  const steps: string[] = [];

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const [cu, cv] = layout.centre(x, y),
        outline = layout.outline(x, y);

      if (
        terrainAt(x, y) === 'Unknown' ||
        !courses.some(({ u, v }) => Math.hypot(u - cu, v - cv) < 2.5)
      ) {
        continue;
      }

      outline.forEach(([au, av], corner) => {
        const [bu, bv] = outline[(corner + 1) % outline.length]!,
          length = Math.hypot(bu - au, bv - av),
          [nu, nv] = [(bv - av) / length, -(bu - au) / length];

        [0.2, 0.4, 0.5, 0.6, 0.8].forEach((share) => {
          const pu = au + (bu - au) * share,
            pv = av + (bv - av) * share,
            here = relief.height(pu - nu * 1e-7, pv - nv * 1e-7),
            there = relief.height(pu + nu * 1e-7, pv + nv * 1e-7),
            [ox, oy] = layout.tileAt(pu + nu * 1e-3, pv + nv * 1e-3);

          // Not into a square never seen, which is flat whatever's beside it.
          if (
            terrainAt(
              ((ox % width) + width) % width,
              ((oy % height) + height) % height
            ) !== 'Unknown' &&
            Math.abs(here - there) > 1e-4
          ) {
            steps.push(`${x},${y} edge ${corner} at ${share}`);
          }
        });
      });
    }
  }

  expect(
    `${topologyId}: no step anywhere near a river, across any square’s edge`,
    steps.slice(0, 5),
    []
  );

  // Far from any river, the land's as it was; the square never seen is flat, at sea level.
  const [lu, lv] = layout.centre(...lone),
    [hu, hv] = layout.centre(...hidden),
    farFrom = [
      [lu + 1.6, lv],
      [lu, lv - 1.6],
    ];

  expect(
    `${topologyId}: far from any river the land is as it was; a square never seen with a river is flat at sea level`,
    [
      farFrom.every(([u, v]) => relief.height(u!, v!) === dry.height(u!, v!)),
      relief.height(hu, hv),
      relief.height(lu, lv) < dry.height(lu, lv),
    ],
    [true, 0, true]
  );

  // The same across the world's seam: a river from its last column to its first.
  const across = [6, 7]
      .flatMap((row) =>
        edges.map(
          (direction) =>
            [row, topology.neighbour(width - 1, row, direction)] as const
        )
      )
      .find(([, square]) => square !== null && square[0] === 0),
    seamRow = across?.[0] ?? 6,
    seamRivers = new Set<string>([`${width - 1},${seamRow}`]);

  if (across !== undefined) {
    seamRivers.add(key(across[1]!));
  }

  const seam = createRelief({
      layout,
      source: sourceFor(
        topology,
        (x, y) => ((x * 7 + y * 3) % 5 === 0 ? 'Hills' : 'Grassland'),
        (x, y) => seamRivers.has(`${x},${y}`)
      ),
    }),
    [placed] = seam.courses(),
    [su, sv] =
      placed === undefined
        ? layout.centre(width - 1, seamRow)
        : pointOf(placed, STEPS / 2),
    mismatched = [-0.3, -0.15, 0, 0.15, 0.3].flatMap((du) =>
      [-0.3, 0, 0.3].filter((dv) => {
        const u = su + du,
          v = sv + dv;

        return (
          !near(seam.height(u, v), seam.height(u - period.u, v), 1e-12) ||
          !near(seam.height(u, v), seam.height(u + period.u, v), 1e-12)
        );
      })
    );

  expect(
    `${topologyId}: a river across the world’s seam is the same at every copy of the world, and cuts the land there`,
    [
      across !== undefined,
      seam.courses().length,
      mismatched.length,
      seam.height(su, sv) <
        createRelief({
          layout,
          source: sourceFor(
            topology,
            (x, y) => ((x * 7 + y * 3) % 5 === 0 ? 'Hills' : 'Grassland'),
            () => false
          ),
        }).height(su, sv),
    ],
    [true, 1, 0, true]
  );

  // A square changed: the land changes only on the squares refresh says and their neighbours, and refreshed, it's as
  //  if made afresh. Hills beside the river, which lower its level; a square of the river gone; the square never seen
  //  seen, with its river; the sea gone, and the mouth with it; and a river beside the lone one, its terrain as it was,
  //  as Civ2's River is a feature on any land.
  const changing = createRelief({
      layout,
      source: sourceFor(topology, terrainAt, riverAt),
    }),
    beside = topology.neighbour(chain[2]![0], chain[2]![1], b)!,
    // The sea at a corner of the river's middle, where there is one, or else beside it: its level falls, and its
    //  courses' with it, all the way to the squares beyond, two from the sea.
    cornered = [
      ...topology
        .directions()
        .filter((direction) => !edges.includes(direction)),
      ...edges,
    ]
      .map((direction) =>
        topology.neighbour(chain[2]![0], chain[2]![1], direction)
      )
      .find(
        (square): square is [number, number] =>
          square !== null && !named.has(key(square)) && key(square) !== key(sea)
      )!,
    // And the sea at a corner of its first square, away from it, across no edge from any of it: no course reaches into
    //  it, but the land each looks at round its first square is blended from it. None on the hex grid, whose
    //  neighbours are all across an edge.
    edgeOf = (square: [number, number]) =>
      edges
        .map((direction) => topology.neighbour(square[0], square[1], direction))
        .filter((n): n is [number, number] => n !== null)
        .map(key),
    offCorner = topology
      .directions()
      .map((direction) =>
        topology.neighbour(chain[0]![0], chain[0]![1], direction)
      )
      .find(
        (square): square is [number, number] =>
          square !== null &&
          !named.has(key(square)) &&
          !chain.some((link) => edgeOf(link).includes(key(square)))
      ),
    changes: [[number, number], string][] = [
      ...(offCorner === undefined
        ? []
        : [[offCorner, 'Ocean'] as [[number, number], string]]),
      [cornered, 'Ocean'],
      [beside, 'Hills'],
      [chain[1]!, 'Grassland'],
      [hidden, 'Grassland'],
      [sea, 'Grassland'],
      [topology.neighbour(lone[0], lone[1], a)!, '+river'],
    ],
    points: [number, number][] = [];

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const [u, v] = layout.centre(x, y);

      [-0.35, 0, 0.35].forEach((du) =>
        [-0.35, 0, 0.35].forEach((dv) => points.push([u + du, v + dv]))
      );
    }
  }

  const wrong: string[] = [];

  changes.forEach(([square, name]) => {
    const before = points.map(([u, v]) => changing.height(u, v));

    if (name === '+river') {
      rivers.add(key(square));
    } else {
      terrains.set(key(square), name);
    }

    if (name !== 'River' && name !== '+river' && river.has(key(square))) {
      rivers.delete(key(square));
    }

    // The squares refresh says, and the changed square's neighbours, which its terrain's blended into.
    const reshaped = changing.refresh([square]),
      covered = new Set([
        ...reshaped.map(key),
        ...topology
          .directions()
          .map((direction) =>
            topology.neighbour(square[0], square[1], direction)
          )
          .filter((n): n is [number, number] => n !== null)
          .map(key),
      ]),
      fresh = createRelief({
        layout,
        source: sourceFor(topology, terrainAt, riverAt),
      });

    points.forEach(([u, v], at) => {
      const [x, y] = layout.tileAt(u, v),
        wrapped: [number, number] = [
          ((x % width) + width) % width,
          ((y % height) + height) % height,
        ];

      if (changing.height(u, v) !== before[at] && !covered.has(key(wrapped))) {
        wrong.push(`${key(square)} → ${key(wrapped)}`);
      }

      if (
        JSON.stringify(changing.sample(u, v)) !==
        JSON.stringify(fresh.sample(u, v))
      ) {
        wrong.push(`${key(square)}: not as made afresh at ${u},${v}`);
      }
    });
  });

  expect(
    `${topologyId}: a square changed by a river changes the land only on the squares refresh says and the square’s neighbours, and refreshed, it's as if made afresh`,
    wrong.slice(0, 5),
    []
  );
});

if (failures.length > 0) {
  process.stderr.write(
    `FAIL rivers: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS rivers (${checks} checks)\n`);
