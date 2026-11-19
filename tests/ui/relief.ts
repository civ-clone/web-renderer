// The land's relief (docs/3d-renderer.md §4.1, plan 1.1), on every grid:
//  - the same squares always give the same land;
//  - it has no step across any square's edge or corner, or where the world wraps;
//  - a square never seen is flat at sea level, whatever is round it;
//  - a mountain's peak stays in its own square;
//  - the sea is shallow at the shore and deep further out;
//  - a square changed changes the land near it, and nowhere else.

import topologyFor, { Topology } from '@civ-clone/ui-client/lib/topologyFor';
import groundLayoutFor, { GroundLayout } from '@civ-clone/ui-map-3d/layouts';
import createRelief, {
  BEND,
  ReliefMap,
  ReliefSource,
  WANDER,
  peakOf,
} from '@civ-clone/ui-map-3d/terrain/relief';
import { TopologyId } from '@civ-clone/ui-protocol/topology';
import { SURFACES, terrainEntry } from '@civ-clone/ui-models-builtin/terrain';

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

const width = 12,
  height = 10,
  ids: TopologyId[] = ['square', 'staggered-iso', 'hex-odd-r'],
  // A mix of every terrain the land has, laid out by a fixed pattern, and a few squares never seen.
  terrains = [
    'Grassland',
    'Plains',
    'Hills',
    'Mountains',
    'Forest',
    'Desert',
    'Ocean',
    'Ocean',
    'Swamp',
    'Tundra',
    'Jungle',
    'Arctic',
    'River',
    'Glacier',
  ];

const sourceFor = (
  topology: Topology,
  terrainAt: (x: number, y: number) => string
): ReliefSource => ({
  width,
  height,
  wrapsY: topology.wrapsY(),
  terrainAt,
  waterAt: (x, y) => ['Ocean', 'Lake'].includes(terrainAt(x, y)),
  neighbours: (x, y) =>
    topology
      .directions()
      .map((direction) => topology.neighbour(x, y, direction))
      .filter((square): square is [number, number] => square !== null),
});

// Where the land steps, in height or colour, across an edge or a corner of `squares`: a hair either side of each, between
//  two squares that have both been seen.
const stepsIn = (
  relief: ReliefMap,
  layout: GroundLayout,
  squares: [number, number][],
  unknown: (x: number, y: number) => boolean
): string[] => {
  const EPSILON = 1e-7,
    steps: string[] = [];

  squares.forEach(([x, y]) => {
    const outline = layout.outline(x, y),
      [cu, cv] = layout.centre(x, y);

    outline.forEach((corner, index) => {
      const next = outline[(index + 1) % outline.length];

      [0, 0.25, 0.5, 0.75].forEach((along) => {
        const pu = corner[0] + (next[0] - corner[0]) * along,
          pv = corner[1] + (next[1] - corner[1]) * along,
          // Towards the middle, and away from it.
          du = (pu - cu) * EPSILON,
          dv = (pv - cv) * EPSILON,
          inside: [number, number] = [pu - du, pv - dv],
          outside: [number, number] = [pu + du, pv + dv],
          other = layout.tileAt(...outside);

        if (unknown(x, y) || unknown(...other)) {
          return;
        }

        const step = Math.abs(
            relief.height(...inside) - relief.height(...outside)
          ),
          // The colours too, and the surfaces: blended sharper, but with no edge of their own.
          inSample = relief.sample(...inside),
          outSample = relief.sample(...outside),
          shade = Math.max(
            ...inSample.colour.map((value, channel) =>
              Math.abs(value - (outSample.colour[channel] ?? 0))
            )
          ),
          surface = Math.max(
            ...inSample.surfaces.map((share, at) =>
              Math.abs(share - (outSample.surfaces[at] ?? 0))
            ),
            Math.abs(inSample.shore - outSample.shore)
          );

        if (step > 1e-6 || shade > 1e-5 || surface > 1e-5) {
          steps.push(
            `${x},${y} ${index}@${along}: ${step} ${shade} ${surface}`
          );
        }
      });
    });
  });

  return steps;
};

// Where the land isn't the same as its copy a period along, across the world or down it where it wraps over the poles.
const seamsIn = (relief: ReliefMap, layout: GroundLayout): string[] => {
  const { u: acrossPeriod, v: downPeriod } = layout.period(),
    seams: string[] = [];

  for (let index = 0; index < 400; index++) {
    const u = (index * 0.731) % (acrossPeriod * 1.5),
      v = (index * 0.377) % ((downPeriod ?? 5) * 1.5),
      here = relief.height(u, v),
      across = relief.height(u + acrossPeriod, v),
      down = downPeriod === null ? here : relief.height(u, v + downPeriod);

    if (Math.abs(here - across) > 1e-9 || Math.abs(here - down) > 1e-9) {
      seams.push(`${u},${v}: ${here} ${across} ${down}`);
    }
  }

  return seams;
};

const pattern = (x: number, y: number): string =>
  (x * 7 + y * 3) % 23 === 0
    ? 'Unknown'
    : terrains[(x * 5 + y * 11 + ((x * y) % 7)) % terrains.length];

ids.forEach((topologyId) => {
  const topology = topologyFor({ width, height, topologyId }),
    layout: GroundLayout = groundLayoutFor({
      width,
      height,
      topologyId,
      wrapsY: topology.wrapsY(),
    }),
    relief = createRelief({ layout, source: sourceFor(topology, pattern) }),
    again = createRelief({ layout, source: sourceFor(topology, pattern) }),
    unknown = (x: number, y: number): boolean =>
      pattern(
        ((x % width) + width) % width,
        ((y % height) + height) % height
      ) === 'Unknown',
    squares: [number, number][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      squares.push([x, y]);
    }
  }

  // The same land, made twice.
  expect(
    `${topologyId}: the same squares give the same land`,
    squares.every(([x, y]) => {
      const [u, v] = layout.centre(x, y),
        points: [number, number][] = [
          [u, v],
          [u + 0.31, v - 0.17],
        ];

      return points.every(
        ([pu, pv]) =>
          JSON.stringify(relief.sample(pu, pv)) ===
          JSON.stringify(again.sample(pu, pv))
      );
    }),
    true
  );

  expect(
    `${topologyId}: no step in height, colour or surface across any edge or corner between squares seen`,
    stepsIn(relief, layout, squares, unknown).slice(0, 3),
    []
  );

  // Surfaces: how much of each the ground is sums to 1 everywhere seen, and to 0 on a square never seen; and deep in a
  //  square, its own terrain's surface is most of it, the sea's floor sand.
  const wrongSurface: string[] = [];

  squares.forEach(([x, y]) => {
    const [u, v] = layout.centre(x, y),
      name = pattern(x, y),
      { surfaces, unseen } = relief.sample(u, v),
      total = surfaces.reduce((sum, share) => sum + share, 0),
      most = surfaces.indexOf(Math.max(...surfaces)),
      expected = ['Ocean', 'Lake'].includes(name)
        ? 'sand'
        : terrainEntry(name).surface;

    if (
      unseen
        ? total !== 0
        : Math.abs(total - 1) > 1e-9 || SURFACES[most] !== expected
    ) {
      wrongSurface.push(`${x},${y} ${name}: ${surfaces.join(',')}`);
    }
  });

  expect(
    `${topologyId}: each point's surfaces sum to 1, or to 0 on a square never seen; at a square's middle, its own terrain's surface is most of it, the sea's floor sand`,
    wrongSurface.slice(0, 3),
    []
  );

  // Never seen: points on such squares are marked, for the cloud, and no others.
  expect(
    `${topologyId}: a point on a square never seen is marked unseen, and one on a square seen isn't`,
    squares.every(([x, y]) => {
      const [u, v] = layout.centre(x, y);

      return relief.sample(u, v).unseen === unknown(x, y);
    }),
    true
  );

  expect(
    `${topologyId}: no seam where the world wraps`,
    seamsIn(relief, layout).slice(0, 3),
    []
  );

  // A square never seen: flat at sea level, everywhere in it.
  const unseen = squares.filter(([x, y]) => unknown(x, y));

  expect(
    `${topologyId}: a square never seen is flat at sea level throughout`,
    [
      unseen.length > 0,
      unseen.every(([x, y]) => {
        const [u, v] = layout.centre(x, y);

        return layout
          .outline(x, y)
          .every(
            ([ou, ov]) =>
              relief.height(u + (ou - u) * 0.95, v + (ov - v) * 0.95) === 0
          );
      }),
    ],
    [true, true]
  );
});

// A lone mountain in a plain, a lone square never seen among mountains, and land meeting the sea, on the square grid.
{
  const topology = topologyFor({ width, height }),
    layout = groundLayoutFor({
      width,
      height,
      topologyId: 'square',
      wrapsY: true,
    }),
    // A seed whose peak at (5, 5) stands at its square's middle, at its terrain's height, near enough: the peak's fall
    //  measured from the middle, as if it didn't wander.
    still =
      Array.from({ length: 2000 }, (_, n) => n + 1).find((seed) => {
        const { u, v, scale } = peakOf(5, 5, seed);

        return Math.hypot(u, v) < 0.02 && Math.abs(scale - 1) < 0.05;
      }) ?? 1,
    lone = createRelief({
      layout,
      seed: still,
      source: sourceFor(topology, (x, y) =>
        x === 5 && y === 5 ? 'Mountains' : 'Grassland'
      ),
    }),
    plain = createRelief({
      layout,
      seed: still,
      source: sourceFor(topology, () => 'Grassland'),
    }),
    middle = (x: number, y: number) => lone.height(...layout.centre(x, y));

  // Elsewhere, peaks wander off their squares' middles, by as much as `WANDER`, and some are taller than others.
  const wandering = Array.from({ length: 25 }, (_, n) =>
      peakOf(n % 5, Math.floor(n / 5), 1)
    ),
    [peakX, peakY] = layout.centre(5, 5),
    { u: offU, v: offV } = peakOf(5, 5, 1),
    wanders = createRelief({
      layout,
      source: sourceFor(topology, (x, y) =>
        x === 5 && y === 5 ? 'Mountains' : 'Grassland'
      ),
    }),
    // The highest point of the square, sampled a twentieth apart.
    highest = Array.from({ length: 21 * 21 }, (_, n) => [
      peakX - 0.5 + (n % 21) / 20,
      peakY - 0.5 + Math.floor(n / 21) / 20,
    ]).reduce((best, point) =>
      wanders.height(point[0]!, point[1]!) > wanders.height(best[0]!, best[1]!)
        ? point
        : best
    );

  expect(
    'peaks wander off their squares’ middles, as far as WANDER, each its own, and a mountain is highest near its peak',
    [
      still !== 1,
      wandering.every(
        ({ u, v }) => Math.abs(u) <= WANDER && Math.abs(v) <= WANDER
      ),
      new Set(wandering.map(({ u, v }) => `${u},${v}`)).size,
      new Set(wandering.map(({ scale }) => scale.toFixed(3))).size > 20,
      Math.hypot(highest[0]! - (peakX + offU), highest[1]! - (peakY + offV)) <
        0.12,
    ],
    [true, true, 25, true, true]
  );

  expect(
    'a mountain stands well above its plain at its middle',
    middle(5, 5) > 0.25,
    true
  );
  expect(
    'and its peak stays in its own square: its neighbours’ middles are barely lifted',
    [4, 6].every(
      (x) =>
        middle(x, 5) - plain.height(...layout.centre(x, 5)) <
        (middle(5, 5) - plain.height(...layout.centre(5, 5))) * 0.25
    ),
    true
  );

  // Just across each edge it shares, a tenth into the neighbour: its peak, weighted by the square of its weight, has
  //  fallen to under a sixth of its height there. Weighted by its weight alone, or blended whole, it's twice that.
  const [peakU, peakV] = layout.centre(5, 5),
    peakLift = middle(5, 5) - plain.height(peakU, peakV),
    acrossEdges = topology
      .directions()
      .map((direction) => topology.neighbour(5, 5, direction))
      .filter((square): square is [number, number] => square !== null)
      .map(([x, y]) => layout.centre(x, y))
      .filter(([u, v]) => Math.abs(Math.hypot(u - peakU, v - peakV) - 1) < 1e-6)
      .map(([u, v]): [number, number] => [
        peakU + (u - peakU) * 0.6,
        peakV + (v - peakV) * 0.6,
      ]);

  expect(
    'just across the edges it shares, the peak has fallen away',
    [
      acrossEdges.length > 0,
      acrossEdges.every(
        ([u, v]) => lone.height(u, v) - plain.height(u, v) < peakLift / 6
      ),
    ],
    [true, true]
  );

  const hidden = createRelief({
    layout,
    source: sourceFor(topology, (x, y) =>
      x === 5 && y === 5 ? 'Unknown' : 'Mountains'
    ),
  });

  expect(
    'a square never seen among mountains is still flat at sea level',
    [0.5, 0.2, 0.8].map((along) => hidden.height(5 + along, 5 + 0.5)),
    [0, 0, 0]
  );

  // Read again for squares released: only those, unless one of them has changed, when every square is.
  let reads = 0,
    changedTo = 'Plains';

  const counted = createRelief({
      layout,
      source: sourceFor(topology, (x, y) => {
        reads++;

        return x === 2 && y === 3 ? changedTo : 'Grassland';
      }),
    }),
    readAtFirst = reads;

  reads = 0;

  const unchanged = counted.refresh([[2, 3]]),
    readForOne = reads;

  changedTo = 'Hills';
  reads = 0;

  const readAfterChange = counted.refresh([[2, 3]]);

  expect(
    'squares released with their terrain unchanged are read alone; one changed, the whole world is read again',
    [unchanged, readForOne < 5, readAfterChange, reads >= readAtFirst],
    [[], true, [[2, 3]], true]
  );

  // Water is what the engine says is water (`tile.isWater`), whatever the terrain's called: a lake among plains, the
  //  sea's floor beside the shore.
  const lake = createRelief({
    layout,
    source: sourceFor(topology, (x, y) =>
      x === 5 && y === 5 ? 'Lake' : 'Plains'
    ),
  });

  expect(
    'a square the engine says is water, of a terrain the table doesn’t know, is the sea’s floor beside the shore, of sand',
    [
      lake.height(5.5, 5.5) < 0 && lake.height(5.5, 5.5) > -0.08,
      SURFACES[
        lake
          .sample(5.5, 5.5)
          .surfaces.indexOf(Math.max(...lake.sample(5.5, 5.5).surfaces))
      ],
    ],
    [true, 'sand']
  );

  // Surfaces blended as the colour is: in a world of grassland and desert, all seen, how much of the point's ground
  //  is grass is how much of its colour is grassland's, everywhere, by the channel the two differ in most.
  const twoLands = createRelief({
      layout,
      source: sourceFor(topology, (x, y) =>
        (x * 3 + y * 7 + ((x * y) % 3)) % 5 < 2 ? 'Desert' : 'Grassland'
      ),
    }),
    unlike: string[] = [];

  // The two colours as the table has them, linear: grassland's and desert's.
  const linear = (hex: string): number[] =>
      [1, 3, 5].map((offset) => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;

        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      }),
    grass = linear(terrainEntry('Grassland').colour),
    desert = linear(terrainEntry('Desert').colour),
    // The channel they differ in most.
    most = [0, 1, 2].reduce((best, at) =>
      Math.abs((grass[at] ?? 0) - (desert[at] ?? 0)) >
      Math.abs((grass[best] ?? 0) - (desert[best] ?? 0))
        ? at
        : best
    );

  for (let at = 0; at < 2000; at++) {
    const u = (at * 0.6180339) % 12,
      v = (at * 0.381966 * 7) % 10,
      { colour, surfaces } = twoLands.sample(u, v),
      grassy =
        ((colour[most] ?? 0) - (desert[most] ?? 0)) /
        ((grass[most] ?? 0) - (desert[most] ?? 0));

    if (Math.abs((surfaces[SURFACES.indexOf('grass')] ?? 0) - grassy) > 1e-9) {
      unlike.push(
        `${u},${v}: ${surfaces[SURFACES.indexOf('grass')]} ${grassy}`
      );
    }
  }

  expect(
    'in grassland and desert, all seen, how much of a point’s ground is grass is how much of its colour is grassland’s',
    unlike.slice(0, 3),
    []
  );

  // Beside a square never seen: none of its surface. A square of arctic beside one, every way the grid has: snow, all
  //  through it, to its edge.
  const edging = topology
    .directions()
    .map((direction) => {
      const [dx, dy] = topology.offset(direction, 5, 5),
        beside = createRelief({
          layout,
          source: sourceFor(topology, (x, y) =>
            x === 5 + dx && y === 5 + dy ? 'Unknown' : 'Arctic'
          ),
        }),
        [cu, cv] = layout.centre(5, 5),
        [nu, nv] = layout.centre(5 + dx, 5 + dy);

      // Along the way to it, to just short of the edge.
      return [0, 0.2, 0.35, 0.45, 0.49].every((along) => {
        const { surfaces } = beside.sample(
          cu + (nu - cu) * along,
          cv + (nv - cv) * along
        );

        return surfaces[SURFACES.indexOf('snow')] === 1;
      });
    })
    .every(Boolean);

  expect(
    'a square of arctic beside one never seen is snow all through, to its edge: the square never seen lends it no surface',
    edging,
    true
  );

  // Land in the first three columns, sea beyond.
  const coast = createRelief({
      layout,
      source: sourceFor(topology, (x) => (x < 3 ? 'Plains' : 'Ocean')),
    }),
    seaAt = (x: number) => coast.height(...layout.centre(x, 5));

  expect(
    'how much of the ground is blended from water: all at sea, none inland, some at the shore, falling away inland',
    [
      coast.sample(...layout.centre(6, 5)).shore,
      // Two squares from the sea either way, as the world wraps round.
      coast.sample(...layout.centre(1, 5)).shore,
      coast.sample(3, 5.5).shore > 0.2 && coast.sample(3, 5.5).shore < 0.8,
      coast.sample(2.9, 5.5).shore > coast.sample(2.6, 5.5).shore,
    ],
    [1, 0, true, true]
  );
  expect(
    'the sea is shallow at the shore, deeper further out, and deepest three squares out',
    [
      seaAt(3) > seaAt(4),
      seaAt(4) > seaAt(5),
      seaAt(3) > -0.06,
      seaAt(7) < -0.14,
    ],
    [true, true, true, true]
  );

  // A square changed: the land changes near it, and nowhere else.
  let changed = false;

  const changing = createRelief({
      layout,
      source: sourceFor(topology, (x, y) =>
        changed && x === 5 && y === 5 ? 'Hills' : 'Grassland'
      ),
    }),
    before = [layout.centre(5, 5), layout.centre(9, 9)].map((point) =>
      changing.height(...point)
    );

  changed = true;
  changing.refresh();

  const after = [layout.centre(5, 5), layout.centre(9, 9)].map((point) =>
    changing.height(...point)
  );

  expect(
    'refreshed, a square changed to hills rises, and a square far from it does not',
    [after[0] > before[0] + 0.05, after[1] === before[1]],
    [true, true]
  );
}

// Ranges: neighbouring mountains are joined by a ridge, on every grid.
ids.forEach((topologyId) => {
  const topology = topologyFor({ width, height, topologyId }),
    layout = groundLayoutFor({
      width,
      height,
      topologyId,
      wrapsY: topology.wrapsY(),
    }),
    neighboursOf = (x: number, y: number): [number, number][] =>
      topology
        .directions()
        .map((direction) => topology.neighbour(x, y, direction))
        .filter((square): square is [number, number] => square !== null),
    plain = createRelief({
      layout,
      source: sourceFor(topology, () => 'Grassland'),
    }),
    // Where a square's peak stands, on the copy of it at (`x`, `y`).
    peakAt = (x: number, y: number): [number, number] => {
      const [u, v] = layout.centre(x, y),
        { u: offU, v: offV } = peakOf(
          ((x % width) + width) % width,
          ((y % height) + height) % height,
          1
        );

      return [u + offU, v + offV];
    },
    // The saddle between two peaks: the lowest point of the crest from one to the other, the crest being the highest
    //  point across the line between them, as far either way as the saddle can bend. As high as it stands over the
    //  plain.
    saddle = (
      relief: ReliefMap,
      [au, av]: [number, number],
      [bu, bv]: [number, number]
    ): number => {
      const length = Math.hypot(bu - au, bv - av);
      let lowest = Infinity;

      for (let along = 0.1; along <= 0.9001; along += 0.05) {
        const mu = au + (bu - au) * along,
          mv = av + (bv - av) * along;
        let top = -Infinity;

        for (let off = -BEND - 0.05; off <= BEND + 0.0501; off += 0.02) {
          const u = mu - ((bv - av) / length) * off,
            v = mv + ((bu - au) / length) * off;

          top = Math.max(top, relief.height(u, v) - plain.height(u, v));
        }

        lowest = Math.min(lowest, top);
      }

      return lowest;
    },
    lift = (relief: ReliefMap, [u, v]: readonly [number, number]): number =>
      relief.height(u, v) - plain.height(u, v);

  // Two mountains side by side, every way the grid has, at six places: the lowest saddle of them all, as a share of the
  //  lower peak, with ranges and without. Without, two peaks close enough already meet (on the hex grid, a third of
  //  the way up at the least, as its neighbours are nearest), and two further apart dip almost to the plain between
  //  them; with ranges, the ridge holds the lowest of them up. Each way, from rows of each parity, at one place or
  //  more, the ridge raises the saddle by a tenth of a peak at least: not at every one, as peaks that stand close
  //  already meet over it. And two mountains two steps apart aren't joined: the land between them is as it is without
  //  ranges.
  let withRanges = Infinity,
    withoutRanges = Infinity;
  const apart: string[] = [],
    // How much the ridge raises the saddle, at most, at the six places, each way, from rows of each parity (on the
    //  staggered and hex grids, a row's neighbours lie otherwise): a ridge each way the grid has, from every row.
    risen = new Map<string, number>();

  [
    [2, 2],
    [5, 3],
    [8, 4],
    [3, 6],
    [6, 7],
    [9, 5],
  ].forEach(([x0, y0]) =>
    topology.directions().forEach((direction) => {
      const [dx, dy] = topology.offset(direction, x0!, y0!),
        [farX, farY] = topology.offset(direction, x0! + dx, y0! + dy),
        // The second mountain at `to`, as the world has it: round the period, as the source is read.
        pair = (to: [number, number], ranges: boolean) => {
          const toX = ((to[0] % width) + width) % width,
            toY = ((to[1] % height) + height) % height;

          return createRelief({
            layout,
            ranges,
            source: sourceFor(topology, (x, y) =>
              (x === x0 && y === y0) || (x === toX && y === toY)
                ? 'Mountains'
                : 'Grassland'
            ),
          });
        },
        a = peakAt(x0!, y0!),
        b = peakAt(x0! + dx, y0! + dy),
        joined = pair([x0! + dx, y0! + dy], true),
        lower = Math.min(lift(joined, a), lift(joined, b));

      const raised = saddle(joined, a, b) / lower,
        bare = saddle(pair([x0! + dx, y0! + dy], false), a, b) / lower;

      withRanges = Math.min(withRanges, raised);
      withoutRanges = Math.min(withoutRanges, bare);
      risen.set(
        `${direction} from ${y0! & 1 ? 'odd' : 'even'} rows`,
        Math.max(
          risen.get(`${direction} from ${y0! & 1 ? 'odd' : 'even'} rows`) ??
            -Infinity,
          raised - bare
        )
      );

      // Two steps apart: along the line between them, the land as it is without ranges. Off a world that doesn't wrap
      //  over the poles, there's no square there.
      const far: [number, number] = [x0! + dx + farX, y0! + dy + farY];

      if (!topology.wrapsY() && (far[1] < 0 || far[1] >= height)) {
        return;
      }

      const c = peakAt(...far),
        farJoined = pair(far, true),
        farApart = pair(far, false);

      for (let along = 0; along <= 1; along += 0.1) {
        const u = a[0] + (c[0] - a[0]) * along,
          v = a[1] + (c[1] - a[1]) * along;

        if (farJoined.height(u, v) !== farApart.height(u, v)) {
          apart.push(`${x0},${y0} ${direction}`);

          break;
        }
      }
    })
  );

  expect(
    `${topologyId}: two mountains side by side, every way the grid has, are a range: with ranges, no saddle between them is under a quarter of the lower peak, the lowest is a tenth of a peak higher than without, and each way the ridge raises a saddle; two steps apart, they're not joined`,
    [
      withRanges >= 0.25,
      withRanges - withoutRanges >= 0.1,
      [...risen.entries()]
        .filter(([, rise]) => rise < 0.1)
        .map(([direction, rise]) => `${direction} ${rise.toFixed(3)}`),
      risen.size === topology.directions().length * 2,
      apart.slice(0, 3),
    ],
    [true, true, [], true, []]
  );

  // A range along a row, across the world's seam, and down across its poles, a block of them, and a square never seen
  //  in the block: the land as smooth as anywhere, the same at every copy of the world, made the same twice.
  const block = new Set<string>(),
    add = (x: number, y: number) =>
      block.add(
        `${((x % width) + width) % width},${((y % height) + height) % height}`
      );

  for (let x = -2; x <= 3; x++) {
    add(x, 2);
  }

  for (let y = -2; y <= 2; y++) {
    add(7, y);
  }

  for (let y = 5; y <= 7; y++) {
    for (let x = 4; x <= 6; x++) {
      add(x, y);
    }
  }

  const ranged = (x: number, y: number): string =>
      x === 5 && y === 6
        ? 'Unknown'
        : block.has(`${x},${y}`)
        ? 'Mountains'
        : 'Grassland',
    range = createRelief({ layout, source: sourceFor(topology, ranged) }),
    again = createRelief({ layout, source: sourceFor(topology, ranged) }),
    squares: [number, number][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      squares.push([x, y]);
    }
  }

  expect(
    `${topologyId}: ranges, across the world's seams and round a square never seen, have no step, no seam, and are the same made twice`,
    [
      stepsIn(
        range,
        layout,
        squares,
        (x, y) =>
          ranged(
            ((x % width) + width) % width,
            ((y % height) + height) % height
          ) === 'Unknown'
      ).slice(0, 3),
      seamsIn(range, layout).slice(0, 3),
      squares.every(([x, y]) => {
        const [u, v] = layout.centre(x, y);

        return [
          [u, v],
          [u + 0.31, v - 0.17],
          [u - 0.27, v + 0.36],
        ].every(
          ([pu, pv]) =>
            JSON.stringify(range.sample(pu!, pv!)) ===
            JSON.stringify(again.sample(pu!, pv!))
        );
      }),
    ],
    [[], [], true]
  );

  // Mountains scattered over half the world, every way joined, and a few squares never seen among them: the land as
  //  smooth as anywhere, where many ridges cross and every square's list of them is needed whole.
  const scatteredAt = (x: number, y: number): string => {
      const h =
        (Math.imul((x * 73856093) ^ (y * 19349663), 2654435761) >>> 0) /
        4294967296;

      return h < 0.5 ? 'Mountains' : h < 0.55 ? 'Unknown' : 'Hills';
    },
    scattered = createRelief({
      layout,
      source: sourceFor(topology, scatteredAt),
    });

  expect(
    `${topologyId}: mountains scattered over half the world have no step and no seam`,
    [
      stepsIn(
        scattered,
        layout,
        squares,
        (x, y) =>
          scatteredAt(
            ((x % width) + width) % width,
            ((y % height) + height) % height
          ) === 'Unknown'
      ).slice(0, 3),
      seamsIn(scattered, layout).slice(0, 3),
    ],
    [[], []]
  );

  // The plain beside a range is barely lifted: each square next to the row, not in it, at its middle.
  const beside = [
    ...new Set(
      [-1, 0, 1, 2].flatMap((x) =>
        neighboursOf(((x % width) + width) % width, 2).map((square) =>
          square.join()
        )
      )
    ),
  ]
    .map((key) => key.split(',').map(Number) as [number, number])
    .filter(([x, y]) => ranged(x, y) === 'Grassland');

  expect(
    `${topologyId}: the plain beside a range is barely lifted`,
    [
      beside.length > 0,
      beside.filter(
        ([x, y]) =>
          lift(range, layout.centre(x, y)) > 0.1 * lift(range, peakAt(1, 2))
      ),
    ],
    [true, []]
  );

  // The squares whose land changes when a square does: those `refresh` says, and their neighbours, at every square's
  //  middle (what the map's yields stand on). And refreshed, the land is as it would be made afresh.
  const changes: [number, number, string][] = [
      [4, 2, 'Mountains'],
      [3, 3, 'Mountains'],
      [2, 2, 'Hills'],
      [5, 6, 'Mountains'],
      [6, 7, 'Grassland'],
      [9, 8, 'Plains'],
    ],
    now = new Map<string, string>();
  let wrong: string[] = [];

  const read = (x: number, y: number): string =>
      now.get(`${x},${y}`) ?? ranged(x, y),
    changing = createRelief({ layout, source: sourceFor(topology, read) }),
    returned: string[] = [],
    expected: string[] = [];

  changes.forEach(([cx, cy, name]) => {
    const before = squares.map(([x, y]) =>
        changing.height(...layout.centre(x, y))
      ),
      wasMountain = read(cx, cy) === 'Mountains';

    now.set(`${cx},${cy}`, name);

    // What it should give back: the square changed, and if it is or was a mountain, the mountains beside it now.
    expected.push(
      `${cx},${cy}: ${[
        `${cx},${cy}`,
        ...(wasMountain || name === 'Mountains'
          ? neighboursOf(cx, cy)
              .filter(([x, y]) => read(x, y) === 'Mountains')
              .map((square) => square.join())
          : []),
      ]
        .filter((square, at, all) => all.indexOf(square) === at)
        .sort()
        .join(' ')}`
    );

    const reshaped = changing.refresh([[cx, cy]]),
      covered = new Set(
        reshaped.flatMap(([x, y]) =>
          [[x, y] as [number, number], ...neighboursOf(x, y)].map((square) =>
            square.join()
          )
        )
      ),
      fresh = createRelief({ layout, source: sourceFor(topology, read) });

    returned.push(
      `${cx},${cy}: ${reshaped
        .map((square) => square.join())
        .sort()
        .join(' ')}`
    );

    squares.forEach(([x, y], at) => {
      const [u, v] = layout.centre(x, y);

      if (changing.height(u, v) !== before[at] && !covered.has(`${x},${y}`)) {
        wrong.push(`${cx},${cy} → ${x},${y}`);
      }

      [
        [u, v],
        [u + 0.29, v + 0.13],
      ].forEach(([pu, pv]) => {
        if (
          JSON.stringify(changing.sample(pu!, pv!)) !==
          JSON.stringify(fresh.sample(pu!, pv!))
        ) {
          wrong.push(`${cx},${cy}: not as made afresh at ${pu},${pv}`);
        }
      });
    });
  });

  expect(
    `${topologyId}: a square changed changes the land only on the squares refresh says and their neighbours, and refreshed, it's as if made afresh`,
    wrong.slice(0, 5),
    []
  );

  expect(
    `${topologyId}: refresh says which squares’ land changed: the square changed, and if it is or was a mountain, the mountains beside it`,
    returned,
    expected
  );

  if (topologyId === 'square') {
    expect(
      'refresh says which squares’ land changed: a mountain added beside a range, and the mountains it joins; one that’s gone, and those it joined (7,8 is the far end of the range down across the poles); a square of plains, itself alone',
      returned,
      [
        '4,2: 3,2 4,2',
        '3,3: 2,2 3,2 3,3 4,2',
        '2,2: 1,2 2,2 3,2 3,3',
        '5,6: 4,5 4,6 4,7 5,5 5,6 5,7 6,5 6,6 6,7',
        '6,7: 5,6 5,7 6,6 6,7 7,8',
        '9,8: 9,8',
      ]
    );
  }

  wrong = [];
});

if (failures.length > 0) {
  process.stderr.write(
    `FAIL relief: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS relief (${checks} checks)\n`);
