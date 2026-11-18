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
        );

        if (step > 1e-6) {
          steps.push(`${x},${y} ${index}@${along}: ${step}`);
        }
      });
    });
  });

  expect(
    `${topologyId}: no step across any edge or corner between squares seen`,
    steps.slice(0, 3),
    []
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
    lone = createRelief({
      layout,
      source: sourceFor(topology, (x, y) =>
        x === 5 && y === 5 ? 'Mountains' : 'Grassland'
      ),
    }),
    plain = createRelief({
      layout,
      source: sourceFor(topology, () => 'Grassland'),
    }),
    middle = (x: number, y: number) => lone.height(...layout.centre(x, y));

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
