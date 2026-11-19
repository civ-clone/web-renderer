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
  ReliefSource,
  WANDER,
  peakOf,
} from '@civ-clone/ui-map-3d/terrain/relief';
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

  // No step across an edge or a corner: a hair either side of each, between two squares that have both been seen.
  const EPSILON = 1e-7,
    steps: string[] = [];

  squares.forEach(([x, y]) => {
    const outline = layout.outline(x, y),
      [cu, cv] = layout.centre(x, y);

    outline.forEach((corner, index) => {
      const next = outline[(index + 1) % outline.length];

      [0, 0.5].forEach((along) => {
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
          // The colours too: blended sharper, but with no edge of their own.
          inColour = relief.sample(...inside).colour,
          outColour = relief.sample(...outside).colour,
          shade = Math.max(
            ...inColour.map((value, channel) =>
              Math.abs(value - (outColour[channel] ?? 0))
            )
          );

        if (step > 1e-6 || shade > 1e-5) {
          steps.push(`${x},${y} ${index}@${along}: ${step} ${shade}`);
        }
      });
    });
  });

  expect(
    `${topologyId}: no step in height or colour across any edge or corner between squares seen`,
    steps.slice(0, 3),
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

  // No seam where the world wraps: a point and its copy a period along have the same land.
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

  expect(`${topologyId}: no seam where the world wraps`, seams.slice(0, 3), []);

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
    'a square the engine says is water, of a terrain the table doesn’t know, is the sea’s floor beside the shore',
    lake.height(5.5, 5.5) < 0 && lake.height(5.5, 5.5) > -0.08,
    true
  );

  // Land in the first three columns, sea beyond.
  const coast = createRelief({
      layout,
      source: sourceFor(topology, (x) => (x < 3 ? 'Plains' : 'Ocean')),
    }),
    seaAt = (x: number) => coast.height(...layout.centre(x, 5));

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

if (failures.length > 0) {
  process.stderr.write(
    `FAIL relief: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS relief (${checks} checks)\n`);
