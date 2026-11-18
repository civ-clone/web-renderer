// What the 3D map lays on the land (docs/3d-renderer-plan.md 3.4), without a GPU:
//  - every feature Civ1 and Civ2 name has a special of its own, one on a terrain of its own where it looks different,
//    and one the table doesn't know is a cairn;
//  - what a square shows: roads and railroads joined to their neighbours as the 2D map joins them, fields, mines,
//    fortresses, airbases, pollution, specials (not rivers) and huts, or nothing;
//  - its shapes: triangles with a normal and a colour at every point, relative to their chunk's corner; strips draped
//    over the land; a road reaching halfway to the neighbour it joins, at the copy the place says; specials at sea on
//    the water; what stands on a square standing clear of the unit's stand at its middle; the same every time.

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
  OverlayPlace,
} from '@civ-clone/ui-map-3d/overlay/overlayMesh';

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
      terrain = 'Grassland',
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

if (failures.length > 0) {
  process.stderr.write(
    `FAIL overlay: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS overlay (${checks} checks)\n`);
