// What the 3D map lays on the land (docs/3d-renderer-plan.md 3.4), without a GPU:
//  - every feature Civ1 and Civ2 name has a special of its own, one on a terrain of its own where it looks different,
//    and one the table doesn't know is a cairn;
//  - what a square shows: roads and railroads joined to their neighbours as the 2D map joins them, fields, mines,
//    fortresses, airbases, pollution, specials (not rivers) and huts, or nothing;
//  - its shapes: triangles with a normal and a colour at every point, relative to their chunk's corner; strips draped
//    over the land; a road reaching halfway to the neighbour it joins, at the copy the place says; specials at sea on
//    the water; what stands on a square standing clear of the unit's stand at its middle; the same every time;
//  - on the land: a chunk's overlay is its squares', roads at the world's edges and poles joined across them at the
//    nearest copy, on every grid; a road built remakes its chunk's overlay, and its neighbours', and builds no land;
//  - what grows: on each terrain the table says, not on a city's lot nor cleared ground, clear of the unit's stand and
//    the roads, forests' trees conifers towards the poles.

import * as Civ1Features from '@civ-clone/civ1-world/TerrainFeatures';
import * as Civ2Features from '@civ-clone/civ2-world/TerrainFeatures';
import { Tile } from '@civ-clone/ui-protocol/types';
import {
  specialLook,
  specialTable,
} from '@civ-clone/ui-models-builtin/specials';
import overlayFor, {
  OverlayNeighbour,
  SquareOverlay,
} from '@civ-clone/ui-map-3d/overlay/overlayFor';
import overlayMesh, {
  OverlayMesh,
  OverlayPlace,
} from '@civ-clone/ui-map-3d/overlay/overlayMesh';
import { Stage } from '@civ-clone/ui-map-3d/stage';
import { TopologyId } from '@civ-clone/ui-protocol/topology';
import Land from '@civ-clone/ui-map-3d/Land';
import * as Civ1Terrains from '@civ-clone/civ1-world/Terrains';
import { vegetationTable } from '@civ-clone/ui-models-builtin/vegetation';
import World from '@civ-clone/ui-map/components/World';

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

// The specials.
const features = [
  ...new Set([...Object.keys(Civ1Features), ...Object.keys(Civ2Features)]),
]
  .filter((name) => name !== 'River')
  .sort();

expect(
  'every feature Civ1 and Civ2 name, but rivers, has a special of its own',
  [
    features.length > 20,
    features.filter((name) => specialLook('Plains', name).shape === 'cairn'),
  ],
  [true, []]
);
expect(
  'one that looks different on a terrain of its own is drawn so there; one the table doesn’t know is a cairn',
  [
    specialLook('Tundra', 'Game') === specialTable['Tundra:Game'],
    specialLook('Forest', 'Game') === specialTable['Game'],
    specialLook('Plains', 'Unobtainium').shape,
    specialLook('Plains', 'toString').shape,
  ],
  [true, true, 'cairn', 'cairn']
);

// What a square shows.
const named = (...names: string[]) => names.map((_) => ({ _ })),
  square = (
    improvements: string[] = [],
    {
      // Where nothing grows, but where something's said to.
      terrain = 'River',
      features: on = [],
      hut = false,
    }: { terrain?: string; features?: string[]; hut?: boolean } = {}
  ) =>
    ({
      improvements: named(...improvements),
      terrain: { _: terrain, features: named(...on) },
      goodyHut: hut ? { _: 'GoodyHut' } : null,
    } as unknown as Pick<Tile, 'improvements' | 'terrain' | 'goodyHut'>),
  neighbour = (
    offset: [number, number],
    improvements: string[] = [],
    city = false
  ): OverlayNeighbour => ({
    offset,
    tile: {
      improvements: named(...improvements),
      city: city ? ({} as Tile['city']) : null,
    } as unknown as OverlayNeighbour['tile'],
  }),
  // North has a road, east a road and a railroad, south a city, west nothing.
  around = [
    neighbour([0, -1], ['Road']),
    neighbour([1, 0], ['Road', 'Railroad']),
    neighbour([0, 1], [], true),
    neighbour([-1, 0]),
  ];

expect(
  'nothing on it: nothing; a railroad with no road: nothing either',
  [overlayFor(square(), around), overlayFor(square(['Railroad']), around)],
  [null, null]
);

const roadOnly = overlayFor(square(['Road']), around),
  both = overlayFor(square(['Road', 'Railroad']), around);

expect(
  'a road joins each neighbour with a road; a railroad each with a railroad or a city, and no road goes the same way under it',
  [roadOnly?.road, roadOnly?.railroad, both?.road, both?.railroad],
  [
    {
      joins: [
        [0, -1],
        [1, 0],
      ],
      alone: false,
    },
    null,
    { joins: [[0, -1]], alone: false },
    {
      joins: [
        [1, 0],
        [0, 1],
      ],
      alone: false,
    },
  ]
);

const lonely = [neighbour([0, -1]), neighbour([1, 0])],
  besideCity = [neighbour([0, -1], [], true)];

expect(
  'one that joins nothing is drawn on its own, as a railroad if it is one; beside a city with no road, as on the 2D map, neither',
  [
    overlayFor(square(['Road']), lonely)?.road,
    overlayFor(square(['Road', 'Railroad']), lonely)?.road?.alone,
    overlayFor(square(['Road', 'Railroad']), lonely)?.railroad?.alone,
    overlayFor(square(['Road']), besideCity)?.road,
  ],
  [{ joins: [], alone: true }, false, true, { joins: [], alone: false }]
);

const everything = overlayFor(
  square(
    ['Irrigation', 'Farmland', 'Mine', 'Fortress', 'Airbase', 'Pollution'],
    { terrain: 'Hills', features: ['Coal', 'River'], hut: true }
  ),
  []
);

expect(
  'farmland over irrigation; a mine, a fortress, an airbase, pollution; its specials but not its river; a hut',
  [
    everything?.irrigation,
    overlayFor(square(['Irrigation']), [])?.irrigation,
    everything?.mine,
    everything?.fortress,
    everything?.airbase,
    everything?.pollution,
    everything?.specials,
    everything?.hut,
  ],
  ['farmland', 'irrigation', true, true, true, true, [['Hills', 'Coal']], true]
);

// Its shapes, on land that rises gently to the east, a square at (17, 3) in a chunk whose corner is at (16, 0).
const heightAt = (u: number): number => 0.1 + 0.02 * Math.sin(u),
  place = (
    x: number,
    y: number,
    {
      toward,
      height,
    }: {
      toward?: OverlayPlace['toward'];
      height?: (u: number, v: number) => number;
    } = {}
  ): OverlayPlace => ({
    centre: [x + 0.5, y + 0.5],
    toward:
      toward ??
      (([dx, dy]) => [x + dx + 0.5, y + dy + 0.5] as [number, number]),
    radius: 0.5,
    heightAt: height ?? ((u) => heightAt(u)),
    seed: x * 7919 + y,
    latitude: 0.5,
  }),
  roadEast: SquareOverlay = overlayFor(square(['Road']), [
    neighbour([1, 0], ['Road']),
  ])!,
  roadMesh = overlayMesh(16, 0, [{ overlay: roadEast, place: place(17, 3) }]),
  // Points of a mesh, back where they are on the ground.
  pointsOf = (
    mesh: ReturnType<typeof overlayMesh>
  ): [number, number, number][] =>
    Array.from({ length: mesh.positions.length / 3 }, (_, point) => [
      mesh.positions[point * 3]! + mesh.u,
      mesh.positions[point * 3 + 1]!,
      mesh.positions[point * 3 + 2]! + mesh.v,
    ]),
  unitNormals = (mesh: ReturnType<typeof overlayMesh>): boolean =>
    Array.from({ length: mesh.normals.length / 3 }, (_, point) =>
      Math.hypot(
        mesh.normals[point * 3]!,
        mesh.normals[point * 3 + 1]!,
        mesh.normals[point * 3 + 2]!
      )
    ).every((length) => Math.abs(length - 1) < 1e-4),
  roadPoints = pointsOf(roadMesh);

expect(
  'triangles, a normal of length one and a colour at every point, relative to the chunk’s corner',
  [
    roadMesh.positions.length > 0,
    roadMesh.positions.length % 9,
    roadMesh.normals.length === roadMesh.positions.length,
    roadMesh.colours.length === roadMesh.positions.length,
    unitNormals(roadMesh),
    Math.min(...roadPoints.map(([u]) => u - 16)) >= 0,
    Math.max(...Array.from(roadMesh.positions).filter((_, i) => i % 3 === 0)) <
      3,
  ],
  [true, 0, true, true, true, true, true]
);
// Each triangle's face, from its corners' order: three.js draws only the side they go round anticlockwise.
const facesUp = (mesh: ReturnType<typeof overlayMesh>): boolean => {
  const p = mesh.positions;

  for (let at = 0; at < p.length; at += 9) {
    const ax = p[at + 3]! - p[at]!,
      az = p[at + 5]! - p[at + 2]!,
      bx = p[at + 6]! - p[at]!,
      bz = p[at + 8]! - p[at + 2]!;

    // The up part of (b - a) × (c - a).
    if (az * bx - ax * bz <= 0) {
      return false;
    }
  }

  return true;
};

expect(
  'what’s laid flat faces up, so it isn’t culled: roads, railroads, fields, pollution',
  [
    facesUp(roadMesh),
    facesUp(
      overlayMesh(16, 0, [
        {
          overlay: overlayFor(
            square(['Road', 'Railroad', 'Farmland', 'Pollution']),
            [neighbour([1, 0], ['Road', 'Railroad'])]
          )!,
          place: place(17, 3),
        },
      ])
    ),
  ],
  [true, true]
);
expect(
  'a road is draped over the land, a little above it, and reaches halfway to the neighbour it joins',
  [
    roadPoints.every(
      ([u, y]) => y - heightAt(u) > 0.011 && y - heightAt(u) < 0.013
    ),
    Math.round(Math.max(...roadPoints.map(([u]) => u)) * 1e6) / 1e6,
  ],
  [true, 18]
);

const across = overlayMesh(16, 0, [
  {
    overlay: roadEast,
    place: place(17, 3, { toward: () => [27.5, 3.5] }),
  },
]);

expect(
  'it reaches toward the neighbour where the place says it is: the copy nearest the square',
  Math.round(Math.max(...pointsOf(across).map(([u]) => u)) * 1e6) / 1e6,
  22.5
);

const fishMesh = overlayMesh(16, 0, [
  {
    overlay: overlayFor(
      square([], { terrain: 'Ocean', features: ['Fish'] }),
      []
    )!,
    place: place(17, 3, { height: () => -0.12 }),
  },
]);

expect(
  'a special at sea is on the water, not the sea floor',
  [
    fishMesh.positions.length > 0,
    pointsOf(fishMesh).every(([, y]) => y >= -0.001),
  ],
  [true, true]
);

const standing = overlayFor(
    square(['Mine'], {
      terrain: 'Hills',
      features: ['Coal', 'Wine'],
      hut: true,
    }),
    []
  )!,
  clear = [0, 1, 2, 3, 4, 5].map((y) =>
    Math.min(
      ...pointsOf(
        overlayMesh(16, 0, [{ overlay: standing, place: place(17, y) }])
      ).map(([u, , v]) => Math.hypot(u - 17.5, v - (y + 0.5)))
    )
  );

expect(
  'what stands on a square, a mine, specials and a hut, stands clear of the unit’s stand at its middle, wherever the square',
  clear.filter((distance) => distance < 0.18),
  []
);

const again = overlayMesh(16, 0, [{ overlay: standing, place: place(17, 3) }]),
  first = overlayMesh(16, 0, [{ overlay: standing, place: place(17, 3) }]),
  elsewhere = overlayMesh(16, 0, [{ overlay: standing, place: place(18, 3) }]);

expect(
  'the same square is laid the same every time; another lays its things elsewhere',
  [
    Array.from(again.positions).join() === Array.from(first.positions).join(),
    Array.from(elsewhere.positions)
      .map((n, i) => (i % 3 === 0 ? n - 1 : n))
      .join() === Array.from(first.positions).join(),
  ],
  [true, false]
);

// On the land, on every grid: a world 64 across and 48 down of grassland, in chunks about 16 across, with roads along the rows at its poles and
//  across its east-west seam, and one square more to build a road on.
(['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach(
  (topologyId) => {
    const width = 64,
      height = 48,
      roaded = (x: number, y: number): boolean =>
        y === 0 || y === height - 1 || x === 0 || x === width - 1,
      tiles = Array.from({ length: width * height }, (_, at) => {
        const x = at % width,
          y = Math.floor(at / width);

        return {
          x,
          y,
          isWater: false,
          isLand: true,
          goodyHut: null,
          city: null,
          units: [],
          improvements: roaded(x, y) ? [{ _: 'Road' }] : [],
          terrain: { _: 'Grassland', __: ['Grassland'], features: [] },
        };
      }),
      world = new World({
        _: 'World',
        __: ['World', 'DataObject'],
        id: 'world',
        width,
        height,
        topologyId,
        tiles: tiles as never,
      }),
      land = new Land(world),
      laid = new Map<string, OverlayMesh | null>(),
      built: string[] = [],
      stage = {
        setChunk: (i: number, j: number) => void built.push(`${i},${j}`),
        setOverlay: (i: number, j: number, mesh: OverlayMesh | null) =>
          void laid.set(`${i},${j}`, mesh),
      } as unknown as Stage,
      // The widest any chunk's overlay reaches across and down, from its own points.
      widest = (): [number, number] =>
        [0, 2].map((axis) => {
          let widestOne = 0;

          laid.forEach((mesh) => {
            let low = Infinity,
              high = -Infinity;

            for (
              let index = axis;
              index < (mesh?.positions.length ?? 0);
              index += 3
            ) {
              low = Math.min(low, mesh!.positions[index]!);
              high = Math.max(high, mesh!.positions[index]!);
            }

            widestOne = Math.max(widestOne, high > low ? high - low : 0);
          });

          return widestOne;
        }) as [number, number];

    land.queueAll(0, 0);
    land.build(stage, null);

    // A chunk's overlay is about as big as the chunk: a road joined across the world instead would be most of it.
    const [across, down] = widest();

    expect(
      `${topologyId}: a chunk's overlay is its squares': roads at the world's edges, and at its poles where it wraps, joined at the nearest copy, not across the world`,
      [
        [...laid.values()].some((mesh) => mesh !== null),
        across < 20,
        down < 20,
        land.overlaysPending(),
      ],
      [true, true, true, 0]
    );

    // A road built in the middle: its chunk's overlay and its neighbours' made again, and no land.
    laid.clear();
    built.length = 0;
    (tiles[20 * width + 30]!.improvements as { _: string }[]).push({
      _: 'Road',
    });
    land.changed([[30, 20]], 0, 0);

    const due = [land.pending(), land.overlaysPending() > 0];

    land.build(stage, null);

    expect(
      `${topologyId}: a road built remakes its chunk's overlay, with the road on it, and builds no land`,
      [
        due,
        built.length,
        [...laid.entries()].some(
          ([key, mesh]) =>
            mesh !== null &&
            key === land.overlayKeyOf(30, 20) &&
            mesh.positions.length > 0
        ),
      ],
      [[0, true], 0, true]
    );

    // A square raised to a mountain: the land round it built again, and what's laid on that land with it.
    laid.clear();
    built.length = 0;
    tiles[30 * width + 40]!.terrain = {
      _: 'Mountains',
      __: ['Mountains'],
      features: [],
    };
    land.changed([[40, 30]], 0, 0);
    land.build(stage, null);

    expect(
      `${topologyId}: the land built again under a road is laid again with it`,
      [built.length > 0, built.filter((key) => !laid.has(key))],
      [true, []]
    );
  }
);

// What grows.
const engineTerrains = new Set(Object.keys(Civ1Terrains));

expect(
  'what grows is said for terrains the engine names, forests, jungles and swamps among them',
  [
    Object.keys(vegetationTable).filter((name) => !engineTerrains.has(name)),
    ['Forest', 'Jungle', 'Swamp'].every((name) => name in vegetationTable),
  ],
  [[], true]
);

const forest = (more: string[] = [], city = false) =>
    overlayFor(
      {
        ...square(more, { terrain: 'Forest' }),
        city: city ? ({} as Tile['city']) : null,
      },
      more.includes('Road')
        ? [neighbour([1, 0], ['Road']), neighbour([0, 1], ['Road'])]
        : []
    ),
  // The points of a square's overlay at (17, 3), at `latitude`, back on the ground.
  laidAt = (overlay: SquareOverlay, latitude = 0.5) =>
    pointsOf(
      overlayMesh(16, 0, [{ overlay, place: { ...place(17, 3), latitude } }])
    );

expect(
  'a forest grows trees, but not on a city’s lot',
  [forest()?.vegetation, laidAt(forest()!).length > 0, forest([], true)],
  [true, true, null]
);

const trees = laidAt(forest(['Road'])!),
  // The road's lines: from the middle halfway east, and halfway south.
  offRoad = ([u, , v]: [number, number, number]): boolean =>
    // Points of the road itself lie on it: only what stands higher is a plant.
    (u >= 17.5 - 0.036 && u <= 18 && Math.abs(v - 3.5) <= 0.036) ||
    (v >= 3.5 - 0.036 && v <= 4 && Math.abs(u - 17.5) <= 0.036)
      ? true
      : Math.hypot(u - 17.5, v - 3.5) > 0.22 &&
        !(u > 17.5 && Math.abs(v - 3.5) < 0.05) &&
        !(v > 3.5 && Math.abs(u - 17.5) < 0.05);

expect(
  'its trees stand clear of the unit’s stand at the middle, and of the roads',
  trees.filter((point) => !offRoad(point)).length,
  0
);
expect(
  'fields, a fortress or an airbase clear the ground of it',
  [
    laidAt(forest(['Irrigation'])!).length ===
      laidAt(overlayFor(square(['Irrigation']), [])!).length,
    laidAt(forest(['Fortress'])!).length ===
      laidAt(overlayFor(square(['Fortress']), [])!).length,
  ],
  [true, true]
);
expect(
  'a forest’s trees are mostly broadleaf at the equator and conifers at the poles: different trees',
  Array.from(laidAt(forest()!, 0).flat()).join() !==
    Array.from(laidAt(forest()!, 1).flat()).join(),
  true
);
expect(
  'its solids’ normals are of length one',
  unitNormals(
    overlayMesh(16, 0, [{ overlay: forest()!, place: place(17, 3) }])
  ),
  true
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL overlay: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS overlay (${checks} checks)\n`);
