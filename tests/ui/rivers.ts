// Rivers on the 3D map's land (docs/3d-renderer.md §5.3, plan 3.3), on every grid:
//  - a course's shape: from one square's middle to the next's, bent a little, a mouth widening, a pool;
//  - how it cuts the land: down to its bed across its water and past, back up over its bank, never raising it;
//  - which squares a river joins: those across an edge with a river or water, seen, and nothing else;
//  - its level: under the land round it, and its bed over the sea's but where its level's at the sea's;
//  - the same across the world's seam;
//  - a square changed reshapes only the squares refresh says, and refreshed, the land's as if made afresh;
//  - their water: facing up, each drawn once, by one chunk even on a chunk's border, and its lift over the land as its
//    mesh draws it, exactly, everywhere, over hills and mountains too;
//  - white water: by how steeply the water falls where it is, alone, so the same wherever courses meet; none in Civ1's
//    valleys, some where Civ2's rivers fall from mountains.

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
  pointAlong,
  underLand,
} from '@civ-clone/ui-map-3d/terrain/rivers';
import { TopologyId } from '@civ-clone/ui-protocol/topology';
import { latticeOf } from '@civ-clone/ui-map-3d/riverMaterial';
import {
  Ground,
  RAPIDS,
  RIVER_LIFT,
  RibbonMesh,
  foamAt,
  ribbonOf,
} from '@civ-clone/ui-map-3d/terrain/ribbons';
import {
  buildChunk,
  carriedBy,
  chunkGrid,
} from '@civ-clone/ui-map-3d/terrain/chunks';

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
//  what it was; wet at the water, dry past the bank. Its bed under its level, but over the sea's where its level is.
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
    'its bed is under its level, but over the sea where its level is; at the sea’s level, at it; under the sea’s, under its level by as far again, to the depth, smoothly',
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
    'a river’s level is the margin under the land round it, but nearer the sea’s level than twice that, under it by half as far as it is from the sea’s level: over the sea where the land is, under it where it isn’t, smoothly',
    [
      near(underLand(0.02), 0.02 - MARGIN),
      near(underLand(0.002), 0.001),
      underLand(0.0001) > 0,
      near(underLand(-0.002), -0.003),
      near(underLand(-0.02), -0.02 - MARGIN),
      underLand(0),
      [
        1e-9,
        -1e-9,
        MARGIN * 2 + 1e-9,
        MARGIN * 2 - 1e-9,
        -MARGIN * 2 + 1e-9,
        -MARGIN * 2 - 1e-9,
      ].every(
        (low, at, all) =>
          at % 2 === 1 ||
          Math.abs(underLand(low) - underLand(all[at + 1]!)) < 1e-8
      ),
    ],
    [true, true, true, true, true, 0, true]
  );
}

// Each triangle of `mesh`, by its points' (`u`, `v`): whether it faces up, anticlockwise seen from above with `v` south,
//  as the land's do.
const facingUp = (mesh: {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}): boolean => {
  const { positions, indices } = mesh;

  for (let at = 0; at < indices.length; at += 3) {
    const [a, b, c] = [indices[at]!, indices[at + 1]!, indices[at + 2]!],
      cross =
        (positions[b * 3]! - positions[a * 3]!) *
          (positions[c * 3 + 2]! - positions[a * 3 + 2]!) -
        (positions[b * 3 + 2]! - positions[a * 3 + 2]!) *
          (positions[c * 3]! - positions[a * 3]!);

    if (!(cross < 0)) {
      return false;
    }
  }

  return true;
};

// The area of `mesh`'s triangles, seen from above.
const flatArea = (mesh: {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}) => {
  let sum = 0;

  for (let at = 0; at < mesh.indices.length; at += 3) {
    const [a, b, c] = [
      mesh.indices[at]!,
      mesh.indices[at + 1]!,
      mesh.indices[at + 2]!,
    ];

    sum +=
      Math.abs(
        (mesh.positions[b * 3]! - mesh.positions[a * 3]!) *
          (mesh.positions[c * 3 + 2]! - mesh.positions[a * 3 + 2]!) -
          (mesh.positions[b * 3 + 2]! - mesh.positions[a * 3 + 2]!) *
            (mesh.positions[c * 3]! - mesh.positions[a * 3]!)
      ) / 2;
  }

  return sum;
};

// The water (`ribbons.ts`): a strip along a course as wide as its water, with a disc at each end where it joins others,
//  laid on the land as it's drawn, `RIVER_LIFT` over it, but never under the sea's level; a mouth's as far as the sea,
//  with none at its end in the sea; none where it's all under the sea's level; a pool a disc. On land whose mesh is
//  creased, cut along its cells and their diagonals, so it's exactly its lift over it everywhere.
{
  const course = courseFrom(0, 0, 1, 0, { seed: 5 }),
    mouth = courseFrom(0, 0, 0, 1, { mouth: true }),
    pool = courseFrom(0, 0, 0, 0),
    sunk = courseFrom(0, 0, 1, 0, { seed: 5 }),
    // Land too coarse to cut the water at all, unless asked: its lines a million apart, the water well clear of them.
    flat: Ground = { at: () => 0.01, spacingU: 1e6, spacingV: 1e6 },
    drawn = (each: typeof course, u = 3, v = 4, ground = flat): RibbonMesh => {
      const into: RibbonMesh = { positions: [], indices: [], foam: [] };

      ribbonOf(each, u, v, into, ground);

      return into;
    },
    heights = (mesh: RibbonMesh) =>
      [
        ...new Set(
          mesh.positions
            .filter((_, at) => at % 3 === 1)
            .map((n) => Number(n.toFixed(9)))
        ),
      ].sort();

  course.levels = course.widths.map(() => 0.02);
  // Down from over the sea's level to it at the coast, halfway, and under it on into the sea.
  mouth.levels = mouth.widths.map((_, step) => 0.02 - step * 0.005);
  pool.levels = pool.widths.map(() => 0.01);
  sunk.levels = sunk.widths.map(() => -0.001);

  // Up from under the sea's level, as a course from a square by the coast does: from the point before it's over it,
  //  with no disc at the end under it.
  const rising = courseFrom(0, 0, 1, 0, { seed: 5 }),
    // A mouth all over the sea's level, as none is: still no disc at its end in the sea.
    high = courseFrom(0, 0, 0, 1, { mouth: true });

  rising.levels = rising.widths.map((_, step) => -0.0125 + step * 0.005);
  high.levels = high.widths.map(() => 0.01);

  // A row at each of its points, its left edge and its right, after the two discs' 12 points each.
  const rows = STEPS + 1,
    strip = drawn(course, 3, 4),
    across = Array.from({ length: rows }, (_, row) => {
      const at = 24 + row * 2,
        [lu, lv, ru, rv] = [
          strip.positions[at * 3]!,
          strip.positions[at * 3 + 2]!,
          strip.positions[(at + 1) * 3]!,
          strip.positions[(at + 1) * 3 + 2]!,
        ],
        [pu, pv] = pointAlong(course, row);

      return [
        Math.hypot(lu - ru, lv - rv) / 2,
        near((lu + ru) / 2, 3 + pu) && near((lv + rv) / 2, 4 + pv),
      ];
    });

  expect(
    'the water along a course: a strip as wide as its water, its middle on the course, a disc at each end, facing up, its lift over the land, but never under the sea’s level',
    [
      strip.positions.length / 3,
      strip.indices.length / 3,
      heights(strip),
      across.every(([half, on]) => near(half as number, RIVER_WIDTH) && on),
      facingUp(strip),
      heights(drawn(course, 3, 4, { ...flat, at: () => -0.01 })),
    ],
    [
      12 * 2 + rows * 2,
      10 * 2 + (rows - 1) * 2,
      [0.01 + RIVER_LIFT],
      true,
      true,
      [0],
    ]
  );

  expect(
    'a mouth’s water runs to the coast, where its level comes to the sea’s, with no disc in the sea; none where it’s all under the sea’s level; a pool’s a disc; one coming up from under the sea’s level runs from the point before it does, with no disc at its end under it; a mouth all over the sea’s level has no disc in the sea',
    [
      drawn(mouth).positions.length / 3,
      facingUp(drawn(mouth)),
      drawn(sunk).positions.length,
      drawn(pool).positions.length / 3,
      facingUp(drawn(pool)),
      drawn(rising).positions.length / 3,
      drawn(high).positions.length / 3,
    ],
    [
      // Its start's disc, and its points to the coast, halfway.
      12 + 5 * 2,
      true,
      0,
      12,
      true,
      // Its points over the sea's level, from 3 along, and the one before; its end's disc.
      12 + 7 * 2,
      12 + rows * 2,
    ]
  );

  // Land whose mesh is creased: each point of it, an eighth apart, its own height, each cell split from its bottom left
  //  to its top right. The water's cut along its cells and diagonals, so at any point in it, it's exactly its lift over
  //  the land there.
  const spacing = 0.125,
    heightOf = (a: number, b: number) =>
      0.02 + 0.015 * Math.sin(a * 2.1 + b * 1.3) * Math.cos(a * 0.7 - b * 1.9),
    creased = {
      at: (u: number, v: number) => {
        const a = Math.floor(u / spacing),
          b = Math.floor(v / spacing),
          fu = u / spacing - a,
          fv = v / spacing - b;

        return fu + fv <= 1
          ? heightOf(a, b) +
              (heightOf(a + 1, b) - heightOf(a, b)) * fu +
              (heightOf(a, b + 1) - heightOf(a, b)) * fv
          : heightOf(a + 1, b + 1) +
              (heightOf(a, b + 1) - heightOf(a + 1, b + 1)) * (1 - fu) +
              (heightOf(a + 1, b) - heightOf(a + 1, b + 1)) * (1 - fv);
      },
      spacingU: spacing,
      spacingV: spacing,
    },
    cut = drawn(course, 3.03, 4.07, creased),
    uncut = drawn(course, 3.03, 4.07, {
      ...creased,
      spacingU: 1e6,
      spacingV: 1e6,
    }),
    // How far each mesh's water is from its lift over the land, at the worst of a few points inside each triangle.
    worstOf = (mesh: RibbonMesh) => {
      let worst = 0;

      for (let at = 0; at < mesh.indices.length; at += 3) {
        const corners = [0, 1, 2].map((corner) => {
          const n = mesh.indices[at + corner]!;

          return [
            mesh.positions[n * 3]!,
            mesh.positions[n * 3 + 1]!,
            mesh.positions[n * 3 + 2]!,
          ];
        });

        [
          [1 / 3, 1 / 3, 1 / 3],
          [0.7, 0.15, 0.15],
          [0.15, 0.7, 0.15],
          [0.15, 0.15, 0.7],
        ].forEach((weights) => {
          const [u, level, v] = [0, 1, 2].map((axis) =>
            weights.reduce(
              (sum, weight, corner) => sum + weight * corners[corner]![axis]!,
              0
            )
          );

          worst = Math.max(
            worst,
            Math.abs(level! - creased.at(u!, v!) - RIVER_LIFT)
          );
        });
      }

      return worst;
    };

  expect(
    'on land whose mesh is creased, the water’s cut along its cells and diagonals, so it’s exactly its lift over it everywhere, as it isn’t uncut; as much of it, facing up',
    [
      worstOf(cut) < 1e-9,
      worstOf(uncut) > 1e-4,
      cut.indices.length > uncut.indices.length,
      facingUp(cut),
      near(flatArea(cut), flatArea(uncut), 1e-9),
    ],
    [true, true, true, true, true]
  );
}

// Each course's water is carried by one chunk, even where its first end's on a chunk's border: on New Game's Large
//  worlds, 97 across, the border's where some squares' middles are, and where a chunk ends and the next begins, each
//  worked out its own way, can differ by a hair, so a course on it was carried by neither, or by both.
{
  const counts = (['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).map(
    (topologyId) => {
      const topology = topologyFor({ width: 97, height: 70, topologyId }),
        layout = groundLayoutFor({
          width: 97,
          height: 70,
          topologyId,
          wrapsY: topology.wrapsY(),
        }),
        period = layout.period(),
        grid = chunkGrid(layout, 70),
        chunkU = grid.stepsU * grid.spacingU,
        chunkV = grid.stepsV * grid.spacingV;
      let wrong = 0,
        before = 0;

      for (let y = 0; y < 70; y++) {
        for (let x = 0; x < 97; x++) {
          const [cu, cv] = layout.centre(x, y),
            u = ((cu % period.u) + period.u) % period.u,
            v =
              period.v === null ? cv : ((cv % period.v) + period.v) % period.v,
            [i, j] = carriedBy(grid, u, v),
            // As it was: by each chunk whose origin's at or before it, and whose origin and width are past it.
            carriers = Array.from(
              { length: grid.chunksU },
              (_, ci) => ci
            ).filter((ci) => {
              const origin = ci * grid.stepsU * grid.spacingU;

              return u >= origin && u < origin + chunkU;
            }).length;

          // Within the chunk that carries it, to a hair.
          if (
            u < i * chunkU - 1e-9 ||
            u > (i + 1) * chunkU + 1e-9 ||
            v < j * chunkV - 1e-9 ||
            v > (j + 1) * chunkV + 1e-9
          ) {
            wrong++;
          }

          if (carriers !== 1) {
            before++;
          }
        }
      }

      return [wrong, before] as const;
    }
  );

  // Small worlds whose squares' middles fall on chunks' borders the same way, a river on every square: every course's
  //  water is drawn, once.
  const once = (
    [
      ['square', 23, 2],
      ['staggered-iso', 16, 3],
      ['hex-odd-r', 23, 2],
    ] as [TopologyId, number, number][]
  ).map(([topologyId, across, size]) => {
    const topology = topologyFor({ width: across, height: 8, topologyId }),
      layout = groundLayoutFor({
        width: across,
        height: 8,
        topologyId,
        wrapsY: topology.wrapsY(),
      }),
      list = (directions: readonly string[], x: number, y: number) =>
        directions
          .map((direction) => topology.neighbour(x, y, direction as never))
          .filter((square): square is [number, number] => square !== null),
      everywhere = createRelief({
        layout,
        source: {
          width: across,
          height: 8,
          wrapsY: topology.wrapsY(),
          terrainAt: () => 'Grassland',
          waterAt: () => false,
          neighbours: (x, y) => list(topology.directions(), x, y),
          riverAt: () => true,
          edgeNeighbours: (x, y) => list(topology.edgeDirections(), x, y),
        },
      }),
      grid = chunkGrid(layout, 8, { size }),
      drawnArea = Array.from({ length: grid.chunksU * grid.chunksV }, (_, at) =>
        buildChunk(
          grid,
          everywhere,
          at % grid.chunksU,
          Math.floor(at / grid.chunksU)
        )
      ).reduce(
        (sum, { river }) => sum + (river === null ? 0 : flatArea(river)),
        0
      ),
      expectedArea = everywhere.courses().reduce((sum, { course }) => {
        const into: RibbonMesh = { positions: [], indices: [], foam: [] };

        ribbonOf(course, 3, 4, into, {
          at: () => 0.01,
          spacingU: 1e6,
          spacingV: 1e6,
        });

        return sum + flatArea(into);
      }, 0);

    return Math.abs(drawnArea - expectedArea) < 1e-4;
  });

  expect(
    'on small worlds whose squares’ middles fall on chunks’ borders, a river on every square, every course’s water is drawn once',
    once,
    [true, true, true]
  );

  expect(
    'on worlds 97 across, every square’s middle is carried by the chunk it’s in, to a hair, where it was carried by none or by two before',
    [
      counts.every(([wrong]) => wrong === 0),
      counts.some(([, before]) => before > 0),
    ],
    [true, true]
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
    // Civ1's River terrain, but at the chain's end, which is hills with a river, as Civ2 has it, high over the sea; and
    //  its third square, mountains with a river, as Civ2 has it, the river through them.
    named = new Set([...river, key(lone), key(frontier), key(hidden)]),
    terrains = new Map<string, string>([
      [key(end), 'Hills'],
      [key(chain[2]!), 'Mountains'],
    ]),
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

  // Along every course, a little apart: where its level's over the sea's, its level under the land round
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
        // Across it as its level's taken (`relief.ts`'s lows): square to the line it's on, from the point at or before.
        [, , du, dv] = pointAlong(course, along),
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

          // Where its level's over the sea's: at the sea's level or under, the sea's its water. At each point and halfway
          //  between, under it as `underLand` puts it; between those, the land may dip.
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
    `${topologyId}: a river’s level is under the land round it, seen and dry, across its water and bed, where its level’s over the sea’s; the land’s cut down under it there, never raised anywhere; its bed’s over the sea where it’s all over the sea’s level; and where courses meet, they’re at one level`,
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
      // The sea's floor under it not wet: banks are land.
      JSON.stringify(relief.sample(seaFloor[0]!, seaFloor[1]!).colour) ===
        JSON.stringify(dry.sample(seaFloor[0]!, seaFloor[1]!).colour),
    ],
    [true, true, true, true, true]
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

  // A Civ1 mouth, from low River terrain, whose channel comes down to the sea's level short of the coast: wherever the
  //  sea's drawn round it (the land under the sea's level), in its channel or on the sea's floor, the land's colour's
  //  as it was, not wet; inland, its banks are wet still.
  const lowland = (x: number, y: number) =>
      key([x, y]) === key(end) ? 'River' : terrainAt(x, y),
    low = createRelief({
      layout,
      source: sourceFor(topology, lowland, riverAt),
    }),
    lowDry = createRelief({
      layout,
      source: sourceFor(topology, lowland, () => false),
    }),
    lowMouth = low.courses().find(({ course }) => course.mouth),
    lowMiddle = low
      .courses()
      .find(
        ({ course }) => !course.mouth && course.points.some((n) => n !== 0)
      );
  let underSea = 0,
    stained = 0;

  if (lowMouth !== undefined) {
    for (let along = 0; along <= STEPS; along += 0.25) {
      const [pu, pv] = pointOf(lowMouth, along);

      for (let du = -0.5; du <= 0.5; du += 0.1) {
        for (let dv = -0.5; dv <= 0.5; dv += 0.1) {
          if (low.height(pu + du, pv + dv) < 0) {
            underSea++;

            if (
              JSON.stringify(low.sample(pu + du, pv + dv).colour) !==
              JSON.stringify(lowDry.sample(pu + du, pv + dv).colour)
            ) {
              stained++;
            }
          }
        }
      }
    }
  }

  const [lmu, lmv] =
    lowMiddle === undefined ? [0, 0] : pointOf(lowMiddle, STEPS / 2);

  expect(
    `${topologyId}: a Civ1 river’s mouth isn’t wet wherever the sea’s drawn round it; inland, its banks are`,
    [
      lowMouth !== undefined && (lowMouth.course.levels[0] ?? 0) > 0,
      underSea > 100,
      stained,
      shade(low.sample(lmu, lmv)) < shade(lowDry.sample(lmu, lmv)) * 0.9,
    ],
    [true, true, 0, true]
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

  // Each square's courses, as what's laid on it takes them (`coursesAt`), placed at its copy of the world: the river
  //  across the seam, from its last column's square's middle, and at its first column's square, by its own middle,
  //  not a world away; and a square it doesn't reach, none.
  const [lastU, lastV] = layout.centre(width - 1, seamRow),
    [firstU, firstV] =
      across === undefined ? [0, 0] : layout.centre(...across[1]!),
    fromLast = seam.coursesAt(width - 1, seamRow),
    atFirst = across === undefined ? [] : seam.coursesAt(...across[1]!),
    nearestTo = (
      paths: readonly { points: readonly (readonly [number, number])[] }[],
      u: number,
      v: number
    ) =>
      Math.min(
        ...paths.flatMap(({ points }) =>
          points.map(([pu, pv]) => Math.hypot(pu - u, pv - v))
        )
      );

  expect(
    `${topologyId}: each square’s courses are placed at its copy of the world: from a square’s middle, and at the square across the seam by its own; none at a square it doesn’t reach`,
    [
      fromLast.length,
      near(nearestTo(fromLast, lastU, lastV), 0, 1e-9),
      atFirst.length,
      near(nearestTo(atFirst, firstU, firstV), 0, 1e-9),
      seam.coursesAt(3, 1).length,
    ],
    [1, true, 1, true, 0]
  );

  // Each with its levels, its course's, which its channel's cut under: for bridges over it.
  expect(
    `${topologyId}: each square’s courses come with their levels`,
    [...fromLast, ...atFirst].map(({ widths, levels }) => {
      const course = seam
        .courses()
        .find(({ course: { widths: each } }) => each === widths)?.course;

      return (
        course !== undefined &&
        levels.length === course.levels.length &&
        levels.every((level, at) => level === course.levels[at]) &&
        levels.some((level) => level !== 0)
      );
    }),
    [...fromLast, ...atFirst].map(() => true)
  );

  // The water, as the chunks carry it, chunks four across, so the world's several: each course's drawn once, by the
  //  chunk that carries its start (as much of it as there is, by its area); facing up; and wherever it's over the sea's
  //  level, exactly its lift over the land as its mesh draws it, at its points, along its triangles' sides and inside
  //  them, wherever the mesh's points fall; never under it.
  const waterOn = (label: string, land: ReliefMap) => {
      const grid = chunkGrid(layout, height, { size: 4 }),
        built = Array.from({ length: grid.chunksU * grid.chunksV }, (_, at) =>
          buildChunk(
            grid,
            land,
            at % grid.chunksU,
            Math.floor(at / grid.chunksU)
          )
        ),
        // Each course's water, flat and uncut.
        expectedArea = land.courses().reduce((sum, { course }) => {
          const into: RibbonMesh = { positions: [], indices: [], foam: [] };

          ribbonOf(course, 0, 0, into, {
            at: () => 0.01,
            spacingU: 1e6,
            spacingV: 1e6,
          });

          return sum + flatArea(into);
        }, 0),
        // The land as its mesh draws it at (`u`, `v`), read from the built chunks' own triangles: the chunk it's in,
        //  the world's copies taken round, and of the two triangles of the cell it's in, as the chunk lists them, the
        //  one it's inside. Not worked out again here, so the water's checked against the land as it's drawn, however
        //  its cells are split.
        period = layout.period(),
        chunkU = grid.stepsU * grid.spacingU,
        chunkV = grid.stepsV * grid.spacingV,
        drawnAt = (u: number, v: number): number => {
          const wu = ((u % period.u) + period.u) % period.u,
            wv = period.v === null ? v : ((v % period.v) + period.v) % period.v,
            i = Math.min(grid.chunksU - 1, Math.floor(wu / chunkU)),
            j = Math.min(
              grid.chunksV - 1,
              Math.max(0, Math.floor(wv / chunkV))
            ),
            chunk = built[j * grid.chunksU + i]!,
            lu = wu - chunk.u,
            lv = wv - chunk.v,
            a = Math.max(
              0,
              Math.min(grid.stepsU - 1, Math.floor(lu / grid.spacingU))
            ),
            b = Math.max(
              0,
              Math.min(grid.stepsV - 1, Math.floor(lv / grid.spacingV))
            ),
            cell = (b * grid.stepsU + a) * 6,
            point = (n: number) => [
              chunk.positions[n * 3]!,
              chunk.positions[n * 3 + 1]!,
              chunk.positions[n * 3 + 2]!,
            ];

          for (const first of [cell, cell + 3]) {
            const [p, q, r] = [0, 1, 2].map((k) =>
                point(chunk.indices[first + k]!)
              ),
              area =
                (q![0]! - p![0]!) * (r![2]! - p![2]!) -
                (q![2]! - p![2]!) * (r![0]! - p![0]!),
              wq =
                ((lu - p![0]!) * (r![2]! - p![2]!) -
                  (lv - p![2]!) * (r![0]! - p![0]!)) /
                area,
              wr =
                ((q![0]! - p![0]!) * (lv - p![2]!) -
                  (q![2]! - p![2]!) * (lu - p![0]!)) /
                area,
              wp = 1 - wq - wr;

            // On an edge, to the rounding of the chunk's points, 32 bits each.
            if (wp >= -1e-5 && wq >= -1e-5 && wr >= -1e-5) {
              return wp * p![1]! + wq * q![1]! + wr * r![1]!;
            }
          }

          throw new Error(`no triangle of the land at ${u},${v}`);
        },
        // Where in each triangle to look: its corners, along its sides and inside it.
        inside = [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [0.5, 0.5, 0],
          [0, 0.5, 0.5],
          [0.5, 0, 0.5],
          [1 / 3, 1 / 3, 1 / 3],
          [0.6, 0.2, 0.2],
          [0.2, 0.6, 0.2],
          [0.2, 0.2, 0.6],
        ];
      let off = 0,
        under = 0,
        looked = 0,
        upward = true,
        area = 0;

      built.forEach(({ u: cu, v: cv, river }) => {
        if (river === null) {
          return;
        }

        const { positions, indices } = river,
          point = (n: number): [number, number, number] => [
            cu + positions[n * 3]!,
            positions[n * 3 + 1]!,
            cv + positions[n * 3 + 2]!,
          ];

        upward &&= facingUp(river);
        area += flatArea(river);

        for (let at = 0; at < indices.length; at += 3) {
          const corners = [
              point(indices[at]!),
              point(indices[at + 1]!),
              point(indices[at + 2]!),
            ],
            // Over the sea's level at every corner: none's been kept from going under it.
            over = corners.every(([, level]) => level > 0);

          inside.forEach((weights) => {
            const [u, level, v] = [0, 1, 2].map((axis) =>
                weights.reduce(
                  (sum, weight, corner) =>
                    sum + weight * corners[corner]![axis]!,
                  0
                )
              ) as [number, number, number],
              ground = drawnAt(u, v);

            looked++;

            if (over) {
              off = Math.max(off, Math.abs(level - ground - RIVER_LIFT));
            } else if (level < ground - 1e-9) {
              under++;
            }
          });
        }
      });

      expect(
        `${topologyId}, ${label}: each course’s water is drawn once, facing up, and wherever it’s over the sea’s level, exactly its lift over the land as its mesh draws it, everywhere; never under it`,
        [
          Math.abs(area - expectedArea) < 1e-6,
          upward,
          looked > 1000,
          // To the rounding of the chunk's points, 32 bits each, as the land's are.
          off < 1e-6,
          under,
        ],
        [true, true, true, true, 0]
      );

      return built;
    },
    built = waterOn('grassland and a river from hills', relief),
    // Civ2's River on hills and mountains, branching where they meet: where courses cut each other's banks, and the
    //  land's mesh is creased under the water.
    rugged = (x: number, y: number): string =>
      key([x, y]) === key(sea)
        ? 'Ocean'
        : ['Mountains', 'Hills', 'Grassland', 'Hills'][(x * 5 + y * 3) % 4]!,
    branch = topology.neighbour(chain[2]![0], chain[2]![1], edges[0]!)!,
    ruggedRivers = new Set(
      [
        ...chain,
        branch,
        topology.neighbour(branch[0], branch[1], edges[0]!)!,
      ].map(key)
    );

  waterOn(
    'Civ2’s rivers on hills and mountains, branching',
    createRelief({
      layout,
      source: sourceFor(topology, rugged, (x, y) =>
        ruggedRivers.has(`${x},${y}`)
      ),
    })
  );

  expect(
    `${topologyId}: the world’s chunks are several, and more than one has water`,
    [built.length > 4, built.filter(({ river }) => river !== null).length > 1],
    [true, true]
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

// White water (`foamAt`): none where the water falls less steeply than `RAPIDS.from`, all white from `RAPIDS.full`, and
//  between, more the steeper, east or south; none where it's at the sea's level, flat, however the land under it falls;
//  by the slope just either side of a point, not a bank a little off. Each point of a river's water as white as
//  `foamAt` says there.
{
  const sloping = (east: number, south = 0, at = 0.05): Ground => ({
      at: (u, v) => at + east * u + south * v,
      spacingU: 0.125,
      spacingV: 0.125,
    }),
    middle = (RAPIDS.from + RAPIDS.full) / 2,
    course = courseFrom(0, 0, 1, 0, { seed: 5 }),
    into: RibbonMesh = { positions: [], indices: [], foam: [] },
    steep = sloping(middle, 0.05),
    // Flat, then a bank rising 1 in 1 from 0.03 east of (2, 3), its cells far taller than they're wide: the slope at
    //  (2, 3) is taken just either side of it, across, not half a cell off, on the bank, nor half a cell down.
    creased: Ground = {
      at: (u) => 0.05 + Math.max(0, u - 2.03),
      spacingU: 0.125,
      spacingV: 2,
    };

  course.levels = course.widths.map(() => 0.02);
  ribbonOf(course, 3, 4, into, steep);

  expect(
    'white water: none under its least slope, all white from its most, between more the steeper, either way; none at the sea’s level; none beside a bank, all on it; each point as white as where it is says',
    [
      foamAt(sloping(0), 2, 3),
      foamAt(sloping(0.06), 2, 3),
      Number(foamAt(sloping(RAPIDS.from), 2, 3).toFixed(9)),
      foamAt(sloping(RAPIDS.full), 2, 3),
      foamAt(sloping(0.4), 2, 3),
      Number(foamAt(sloping(middle), 2, 3).toFixed(9)),
      Math.abs(
        foamAt(sloping(0, -middle, 1), 2, 3) - foamAt(sloping(middle), 2, 3)
      ) < 1e-9,
      foamAt(sloping(RAPIDS.from * 0.8, RAPIDS.from * 0.8), 2, 3) > 0,
      foamAt(sloping(0.4, 0, -2), 2, 3),
      foamAt(creased, 2, 3),
      foamAt(creased, 2.06, 3),
      into.foam.length === into.positions.length / 3 && into.foam.length > 0,
      into.foam.every(
        (white, at) =>
          white ===
          foamAt(steep, into.positions[at * 3]!, into.positions[at * 3 + 2]!)
      ),
    ],
    [0, 0, 0, 1, 1, 0.5, true, true, 0, 0, 1, true, true]
  );
}

// Through the land, on each grid, chunks four across: a river east from (1, 5) to the sea, along the grid's edges,
//  through mountains, hills and grassland. Civ1's, on River squares in their valleys, never breaks white. Civ2's, a
//  feature on the mountains and hills themselves, breaks white where it falls from them. Wherever two chunks' water has
//  a point at the same place on the world, it's as white in both, white water too, on some grid.
{
  const shared: number[][] = [],
    worlds = ids.map((topologyId) => {
      const topology = topologyFor({ width, height, topologyId }),
        layout: GroundLayout = groundLayoutFor({
          width,
          height,
          topologyId,
          wrapsY: topology.wrapsY(),
        }),
        period = layout.period(),
        eastOf = (x: number) => layout.centre(x, 5)[0],
        land = (x: number, y: number) => {
          const [u] = layout.centre(x, y);

          return u >= 11
            ? 'Ocean'
            : u < 4
            ? 'Mountains'
            : u < 7
            ? 'Hills'
            : 'Grassland';
        },
        // Each step on to the neighbour across an edge furthest east, short of the sea.
        chain = new Set<string>();
      let at: [number, number] | null = [1, 5];

      while (at !== null) {
        chain.add(`${at[0]},${at[1]}`);

        const here = layout.centre(at[0], at[1])[0],
          [next]: [number, number][] = topology
            .edgeDirections()
            .map((direction) => topology.neighbour(at![0], at![1], direction))
            .filter(
              (square): square is [number, number] =>
                square !== null &&
                layout.centre(square[0], square[1])[0] > here + 0.1 &&
                land(square[0], square[1]) !== 'Ocean'
            )
            .sort(
              ([ax, ay], [bx, by]) =>
                layout.centre(bx, by)[0] - layout.centre(ax, ay)[0]
            );

        at = next ?? null;
      }

      const river = (x: number, y: number) => chain.has(`${x},${y}`),
        foamOf = (terrainAt: (x: number, y: number) => string) => {
          const relief = createRelief({
              layout,
              source: sourceFor(topology, terrainAt, river),
            }),
            grid = chunkGrid(layout, height, { size: 4 }),
            // Each point's whiteness, and the chunk that drew it, by where it is on the world, to a hundred-thousandth.
            byPlace = new Map<string, [chunk: number, white: number][]>();

          for (let at = 0; at < grid.chunksU * grid.chunksV; at++) {
            const chunk = buildChunk(
              grid,
              relief,
              at % grid.chunksU,
              Math.floor(at / grid.chunksU)
            );

            chunk.river?.foam.forEach((white, point) => {
              const u = chunk.river!.positions[point * 3]! + chunk.u,
                v = chunk.river!.positions[point * 3 + 2]! + chunk.v,
                key = `${(((u % period.u) + period.u) % period.u).toFixed(
                  5
                )},${(period.v === null
                  ? v
                  : ((v % period.v) + period.v) % period.v
                ).toFixed(5)}`;

              byPlace.set(key, [...(byPlace.get(key) ?? []), [at, white]]);
            });
          }

          return [...byPlace.values()];
        },
        civ1 = foamOf((x, y) => (river(x, y) ? 'River' : land(x, y))),
        civ2 = foamOf(land),
        whites = (places: [number, number][][]) =>
          places.flatMap((drawn) => drawn.map(([, white]) => white));

      // Where two chunks, not one, drew water at one place.
      shared.push(
        ...[...civ1, ...civ2]
          .filter((drawn) => new Set(drawn.map(([chunk]) => chunk)).size > 1)
          .map((drawn) => drawn.map(([, white]) => white))
      );

      return [
        topologyId,
        chain.size >= 6 && eastOf(1) < 4,
        whites(civ1).length > 0 && whites(civ1).every((white) => white === 0),
        whites(civ2).some((white) => white > 0.25),
        whites(civ2).some((white) => white === 0),
      ];
    });

  expect(
    'white water through the land, on each grid: none on Civ1’s River squares in their valleys; some on Civ2’s, where it falls from mountains and hills; at a place two chunks’ water shares, as white in both, white water at some',
    [
      worlds,
      shared.some((whites) => whites.some((white) => white > 0)),
      shared.every((whites) =>
        whites.every((white) => Math.abs(white - whites[0]!) < 1e-6)
      ),
    ],
    [ids.map((topologyId) => [topologyId, true, true, true, true]), true, true]
  );
}

// The white water's noise (`latticeOf`): a whole number of its cells in each period of the world, about as many to a
//  unit as asked, so it's the same at every copy of the world; down a world that doesn't repeat, as many as asked.
{
  const fits = (period: { u: number; v: number | null }, perUnit: number) => {
    const [scaleU, scaleV, cellsU, cellsV] = latticeOf(period, perUnit);

    return [
      Number.isInteger(cellsU) && near(scaleU * period.u, cellsU),
      Math.abs(scaleU / perUnit - 1) < 0.05,
      period.v === null
        ? cellsV === 0 && scaleV === perUnit
        : Number.isInteger(cellsV) &&
          cellsV > 0 &&
          near(scaleV * period.v, cellsV) &&
          Math.abs(scaleV / perUnit - 1) < 0.05,
    ];
  };

  expect(
    'white water’s noise: a whole number of its cells to each period of the world, about as many to a unit as asked; down a world that doesn’t repeat, as many as asked',
    [
      fits({ u: 12, v: null }, 22),
      fits({ u: 97.3, v: 64.6 }, 66),
      fits({ u: 8, v: 6.93 }, 22),
    ],
    [
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL rivers: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS rivers (${checks} checks)\n`);
