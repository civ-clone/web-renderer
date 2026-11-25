// What the 3D map lays on the land (docs/3d-renderer-plan.md 3.4), without a GPU:
//  - every feature Civ1 and Civ2 name has a special of its own, one on a terrain of its own where it looks different,
//    and one the table doesn't know is a cairn;
//  - what a square shows: roads and railroads joined to their neighbours as the 2D map joins them, fields, mines,
//    fortresses, airbases, pollution, specials (not rivers) and huts, or nothing;
//  - its shapes: triangles with a normal and a colour at every point, relative to their chunk's corner; strips draped
//    over the land; a road reaching halfway to the neighbour it joins, at the copy the place says, bending on its own
//    square and meeting its neighbour's half there going the same way; specials at sea on the water; what stands on a
//    square standing clear of the unit's stand at its middle; the same every time;
//  - on the land: a chunk's overlay is its squares', roads at the world's edges and poles joined across them at the
//    nearest copy, on every grid; a road built remakes its chunk's overlay, and its neighbours', and builds no land;
//  - what grows: on each terrain the table says, not on a city's lot nor cleared ground, clear of the unit's stand and
//    the roads, forests' trees conifers towards the poles.

import * as Civ1Features from '@civ-clone/civ1-world/TerrainFeatures';
import * as Civ2Features from '@civ-clone/civ2-world/TerrainFeatures';
import { Color, Vector3 } from 'three';
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
  FARMSTEAD_COLOURS,
  MINE_COLOURS,
  OverlayMesh,
  OverlayPlace,
  PLANT_HEIGHT,
  PLANT_NUMBERS,
  ROAD_BOW,
  ROOFS,
  layOverlay,
  roadHalf,
  SMOG_LIFT,
  rowAround,
  soup,
} from '@civ-clone/ui-map-3d/overlay/overlayMesh';
import { Stage, overlayCopies, polesAt } from '@civ-clone/ui-map-3d/stage';
import sprawl, {
  Lot,
  ROADSIDE,
  citySeed,
} from '@civ-clone/ui-map-3d/overlay/sprawl';
import { IN_FRONT_OF_CITY } from '@civ-clone/ui-map-3d/markers/drawMarker';
import { TopologyId } from '@civ-clone/ui-protocol/topology';
import Land from '@civ-clone/ui-map-3d/Land';
import { ChunkMesh } from '@civ-clone/ui-map-3d/terrain/chunks';
import * as Civ1Terrains from '@civ-clone/civ1-world/Terrains';
import { vegetationTable } from '@civ-clone/ui-models-builtin/vegetation';
import { seaFloor } from '@civ-clone/ui-models-builtin/terrain';
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

// Whether any point of `mesh` is `css`, the colour a road is laid in, say.
const hasColour = (mesh: OverlayMesh, css: string): boolean => {
  const { r, g, b } = new Color(css),
    c = mesh.colours;

  for (let at = 0; at < c.length; at += 3) {
    if (
      Math.abs(c[at]! - r) < 1e-4 &&
      Math.abs(c[at + 1]! - g) < 1e-4 &&
      Math.abs(c[at + 2]! - b) < 1e-4
    ) {
      return true;
    }
  }

  return false;
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
    inner: 0.5,
    heightAt: height ?? ((u) => heightAt(u)),
    seed: x * 7919 + y,
    latitude: 0.5,
    // On the square grid, a world 32 across that doesn't wrap over the poles.
    outline: [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
    ],
    owns: (u, v) => Math.floor(u) === x && Math.floor(v) === y,
    around: [
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ],
    period: { u: 32, v: null },
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
// A mesh without its farms' buildings, which stand on the land rather than lie on it: by their colours.
const withoutFarmsteads = (
  mesh: ReturnType<typeof overlayMesh>
): ReturnType<typeof overlayMesh> => {
  const farm = FARMSTEAD_COLOURS.map((css) => new Color(css)),
    kept: number[] = [],
    keptColours: number[] = [],
    keptNormals: number[] = [];

  for (let at = 0; at < mesh.positions.length; at += 9) {
    const [r, g, b] = [
      mesh.colours[at]!,
      mesh.colours[at + 1]!,
      mesh.colours[at + 2]!,
    ];

    if (
      farm.every(
        (colour) =>
          Math.abs(colour.r - r) +
            Math.abs(colour.g - g) +
            Math.abs(colour.b - b) >
          1e-5
      )
    ) {
      kept.push(...mesh.positions.subarray(at, at + 9));
      keptColours.push(...mesh.colours.subarray(at, at + 9));
      keptNormals.push(...mesh.normals.subarray(at, at + 9));
    }
  }

  return {
    ...mesh,
    positions: new Float32Array(kept),
    colours: new Float32Array(keptColours),
    normals: new Float32Array(keptNormals),
  };
};

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
  'what’s laid flat faces up, so it isn’t culled: roads, railroads, fields',
  [
    facesUp(roadMesh),
    facesUp(
      withoutFarmsteads(
        overlayMesh(16, 0, [
          {
            overlay: overlayFor(
              square(['Road', 'Railroad', 'Farmland', 'Pollution']),
              [neighbour([1, 0], ['Road', 'Railroad'])]
            )!,
            place: place(17, 3),
          },
        ])
      )
    ),
  ],
  [true, true]
);
expect(
  'a road is draped over the land, a little above it, and reaches halfway to the neighbour it joins',
  [
    roadPoints.every(
      ([u, y]) => y - heightAt(u) > 0.013 && y - heightAt(u) < 0.015
    ),
    Math.round(Math.max(...roadPoints.map(([u]) => u)) * 1e6) / 1e6,
  ],
  [true, 18]
);

// Pollution as smog (#1335): no solid shapes, only a haze hanging over the land, following it up and down, between its
//  lowest and highest; mostly solid at its middle, nothing at its edge, reaching 1.4 times the square's radius so
//  polluted neighbours' join; laid relative to the chunk's corner, as what's solid is; facing up. Past the shore it
//  carries on, riding the water's surface over the sea, not its floor.
{
  // Hills and hollows across and down, more than a road's land, all of it above the sea's level: a haze laid flat
  //  wouldn't follow them.
  const hilly = (u: number, v: number): number =>
      0.2 + 0.15 * Math.sin(u * 3) * Math.cos(v * 2),
    // The sea from a little east of the square's middle.
    coast = (u: number): number => (u > 17.8 ? -0.3 : 0.1),
    hazeOf = (height: (u: number, v: number) => number) => {
      const mesh = overlayMesh(16, 0, [
          {
            overlay: overlayFor(square(['Pollution']), [])!,
            place: place(17, 3, { height }),
          },
        ]),
        { positions, colours } = mesh.haze;

      return {
        mesh,
        points: Array.from({ length: positions.length / 3 }, (_, n) => ({
          u: positions[n * 3]! + 16,
          y: positions[n * 3 + 1]!,
          v: positions[n * 3 + 2]!,
          alpha: colours[n * 4 + 3]!,
          away: Math.hypot(
            positions[n * 3]! + 16 - 17.5,
            positions[n * 3 + 2]! - 3.5
          ),
        })),
        positions,
      };
    },
    { mesh: smoggy, points, positions } = hazeOf(hilly),
    reach = Math.max(...points.map(({ away }) => away)),
    middle = points.filter(({ away }) => away < 1e-6),
    // Each triangle facing up, so it's drawn from above.
    up = Array.from({ length: positions.length / 9 }, (_, n) => {
      const at = n * 9,
        ax = positions[at + 3]! - positions[at]!,
        az = positions[at + 5]! - positions[at + 2]!,
        bx = positions[at + 6]! - positions[at]!,
        bz = positions[at + 8]! - positions[at + 2]!;

      return az * bx - ax * bz > 0;
    }),
    shore = hazeOf((u) => coast(u)).points;

  expect(
    'pollution is smog: no solid shapes, a haze following the land up and down, mostly solid at its middle, nothing at its edge, 1.4 times the square’s radius, facing up',
    [
      smoggy.positions.length,
      points.every(
        ({ u, v, y }) =>
          y - hilly(u, v) > SMOG_LIFT[0] - 1e-6 &&
          y - hilly(u, v) < SMOG_LIFT[1] + 1e-6
      ),
      Math.round(Math.max(...middle.map(({ alpha }) => alpha)) * 100) / 100 >
        0.5,
      Math.max(...middle.map(({ alpha }) => alpha)) <= 0.85,
      points
        .filter(({ away }) => away > reach - 1e-6)
        .every(({ alpha }) => alpha === 0),
      Math.round(reach * 1000) / 1000,
      up.every(Boolean),
    ],
    [0, true, true, true, true, 0.7, true]
  );

  expect(
    'past the shore it carries on, riding the water’s surface over the sea, not its floor; a square with no pollution has no haze',
    [
      shore
        .filter(({ u }) => u > 17.8)
        .every(({ y }) => y >= SMOG_LIFT[0] - 1e-6),
      shore.some(({ u, alpha }) => u > 17.8 && alpha > 0.3),
      overlayMesh(16, 0, [
        { overlay: overlayFor(square(['Road']), [])!, place: place(17, 3) },
      ]).haze.positions.length,
    ],
    [true, true, 0]
  );
}

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

// Specials are big enough to be seen at play's zoom (#1335): on flat land with nothing else on the square, a herd of
//  horses and seals each reach across over a quarter of the square, a stack of logs (Civ1's shield on grassland) over a
//  fifth, and each stands up off it; every beast stands on the land, not in it or over it; a herd of horses isn't all
//  one coat; and where roads every way leave less room, a special takes less, so it's drawn smaller.
{
  const FLAT = 0.1,
    laidOn = (feature: string) =>
      overlayMesh(16, 0, [
        {
          overlay: overlayFor(
            square([], { terrain: 'River', features: [feature] }),
            []
          )!,
          place: place(17, 3, { height: () => FLAT }),
        },
      ]),
    // How far it reaches across, the most any way round, and how tall it stands, and how low, over the land.
    span = (feature: string) => {
      const points = pointsOf(laidOn(feature)),
        ys = points.map(([, y]) => y - FLAT);

      return {
        across: Math.max(
          ...Array.from({ length: 36 }, (_, k) => {
            const angle = (k / 36) * Math.PI,
              along = points.map(
                ([u, , v]) => u * Math.cos(angle) + v * Math.sin(angle)
              );

            return Math.max(...along) - Math.min(...along);
          })
        ),
        tall: Math.max(...ys),
        low: Math.min(...ys),
      };
    },
    [horses, logs, seals] = ['Horse', 'Shield', 'Seal'].map(span),
    beasts = ['Horse', 'Buffalo', 'Game', 'Furs', 'Ivory', 'Seal', 'Pheasant'],
    herdColours = (() => {
      const { colours } = laidOn('Horse');

      return Array.from(
        { length: colours.length / 3 },
        (_, n) =>
          new Color(colours[n * 3]!, colours[n * 3 + 1]!, colours[n * 3 + 2]!)
      );
    })(),
    hasCoat = (css: string): boolean => {
      const coat = new Color(css);

      return herdColours.some(
        ({ r, g, b }) =>
          Math.abs(r - coat.r) + Math.abs(g - coat.g) + Math.abs(b - coat.b) <
          1e-5
      );
    },
    roomOn = (improvements: string[], neighbours: OverlayNeighbour[]) =>
      layOverlay(
        overlayFor(
          square(improvements, { terrain: 'Hills', features: ['Coal'] }),
          neighbours
        )!,
        place(17, 3, { height: () => FLAT }),
        soup()
      ).taken.find(([, , room]) => room >= 0.1)![2],
    open = roomOn([], []),
    crowded = roomOn(
      ['Road'],
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map((offset) => neighbour(offset as [number, number], ['Road']))
    );

  expect(
    'horses and seals each reach across over a quarter of the square, logs over a fifth, and each stands up off it',
    [
      horses.across > 0.25 && horses.tall > 0.15,
      logs.across > 0.2 && logs.tall > 0.12,
      seals.across > 0.25 && seals.tall > 0.06,
    ],
    [true, true, true]
  );
  expect(
    'every beast stands on the land; a herd of horses is a bay, a chestnut and a grey',
    [
      beasts.filter((feature) => {
        const { low } = span(feature);

        return low < -0.004 || low > 0.004;
      }),
      [
        specialTable['Horse']!.colour,
        ...(specialTable['Horse']!.coats ?? []),
      ].map(hasCoat),
    ],
    [[], [true, true, true]]
  );
  expect(
    'where roads every way leave less room, a special takes less: drawn smaller, never under the old size',
    [open, crowded < open, crowded >= 0.1],
    [0.2, true, true]
  );
}

// Each special stays in the room it claims, and on its square but for a little (a little more inside a fortress's
//  walls, where nothing has room), wherever it stands: on a square with nothing else, with roads every way, and
//  inside a fortress, on 40 squares each, as where it stands is seeded. What's drawn of it is what's laid on the
//  square with it less what's laid without it. Inside a fortress, where it has least room, what isn't a beast or logs
//  keeps its height, as it's only drawn narrower to fit. On a shore, nothing of one on land stands in the sea, but on
//  land just under the water's level it's still drawn. Entering a hut moves no special, as specials are claimed first.
//  A log's cut ends face out.
{
  const FLAT = 0.1,
    everyWay = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].map((offset) => neighbour(offset as [number, number], ['Road'])),
    settings: [string, string[], OverlayNeighbour[]][] = [
      ['open', [], []],
      ['roads', ['Road'], everyWay],
      ['fortress', ['Fortress'], []],
    ],
    keys = [...Object.keys(specialTable), 'Unobtainium'],
    // Its points, and the room it claimed and where, on the square at (`x`, 3).
    drawn = (
      key: string,
      improvements: string[],
      around: OverlayNeighbour[],
      x: number,
      height: (u: number, v: number) => number = () => FLAT
    ) => {
      const [terrain, feature] = key.includes(':')
          ? (key.split(':') as [string, string])
          : ['River', key],
        where = place(x, 3, { height }),
        // What's laid on the square, with nothing growing (its terrain a river's, its special's look its own), as
        //  plants keep clear of the special, and what it claims: nothing, where there's nothing to lay.
        laid = (features: string[]) => {
          const overlay = overlayFor(
              square(improvements, { terrain, features }),
              around
            ),
            into = soup();

          if (overlay === null) {
            return { points: [], taken: [] };
          }

          const { taken } = layOverlay(
            { ...overlay, terrain: 'River' },
            where,
            into
          );

          return {
            points: Array.from(
              { length: into.positions.length / 3 },
              (_, n): [number, number, number] => [
                into.positions[n * 3]!,
                into.positions[n * 3 + 1]!,
                into.positions[n * 3 + 2]!,
              ]
            ),
            taken,
          };
        },
        without = new Map<string, number>(),
        mark = ([u, y, v]: [number, number, number]) =>
          `${u.toFixed(5)},${y.toFixed(5)},${v.toFixed(5)}`;

      laid([]).points.forEach((point) =>
        without.set(mark(point), (without.get(mark(point)) ?? 0) + 1)
      );

      const withIt = laid([feature]),
        points = withIt.points.filter((point) => {
          const left = without.get(mark(point)) ?? 0;

          without.set(mark(point), left - 1);

          return left <= 0;
        }),
        claim = withIt.taken.find(([, , room]) => room >= 0.1)!;

      return { points, claim, x };
    },
    strays: string[] = [];

  keys.forEach((key) =>
    settings.forEach(([name, improvements, around]) => {
      for (let x = 1; x <= 40; x++) {
        const {
          points,
          claim: [cu, cv, room],
        } = drawn(key, improvements, around, x);

        // How far it reaches past its room, the most, and past the square's edge.
        const over = Math.max(
            0,
            ...points.map(([u, , v]) => Math.hypot(u - cu, v - cv) - room)
          ),
          past = Math.max(
            0,
            ...points.map(([u, , v]) =>
              Math.max(x - u, u - (x + 1), 3 - v, v - 4)
            )
          );

        // Inside a fortress's walls, where nothing has room, it takes where it has the most, a little further past.
        if (over > 1e-3 || past > (name === 'fortress' ? 0.05 : 0.03) + 1e-3) {
          strays.push(
            `${key} ${name} ${x}: ${over.toFixed(3)} ${past.toFixed(3)}`
          );
        }
      }
    })
  );

  const landKeys = [
      'Horse',
      'Seal',
      'Ivory',
      'Peat',
      'Spice',
      'Wheat',
      'Coal',
      'Shield',
      'Oasis',
      'Oil',
      'Unobtainium',
    ],
    // How tall it stands over the land, or nothing where nothing's drawn.
    tallest = (key: string, improvements: string[]) => {
      const { points } = drawn(key, improvements, [], 7);

      return points.length === 0
        ? null
        : Math.max(...points.map(([, y]) => y - FLAT));
    },
    lowered = [
      'Oil',
      'Oasis',
      'Wheat',
      'Wine',
      'Coal',
      'Peat',
      'Unobtainium',
    ].filter((key) => {
      const open = tallest(key, []),
        walled = tallest(key, ['Fortress']);

      return open === null || walled === null || Math.abs(walled - open) > 1e-6;
    }),
    // On a square half land and half sea, east of its middle, on 40 squares each: what's under the sea's level, by
    //  more than a lump sinks into the land; and how often something's drawn, where its claim's on the land.
    shore = landKeys.map((key) => {
      let wet = 0,
        shown = 0;

      for (let x = 1; x <= 40; x++) {
        const { points } = drawn(key, [], [], x, (u) =>
          u < x + 0.5 ? FLAT : -0.2
        );

        wet += points.some(([, y]) => y < -0.02) ? 1 : 0;
        shown += points.length > 0 ? 1 : 0;
      }

      return { key, wet, shown };
    }),
    // On land just under the water's level, as a low swamp's can be at the shore, as low as the sea's floor begins
    //  beside it: still drawn, on 10 squares each.
    shallow = landKeys.filter((key) =>
      Array.from({ length: 10 }, (_, at) => at + 1).some(
        (x) =>
          drawn(key, [], [], x, () => seaFloor.shore + 0.002).points.length ===
          0
      )
    ),
    // Where its special stands, with a hut on the square and without.
    hutMoves = Array.from({ length: 40 }, (_, at) => at + 1).filter((x) => {
      const claimed = (hut: boolean) =>
        layOverlay(
          overlayFor(
            square([], { terrain: 'River', features: ['Horse'], hut }),
            []
          )!,
          place(x, 3),
          soup()
        ).taken[0]!;

      return claimed(true).join() !== claimed(false).join();
    }),
    // A stack's cut ends: the triangles in their pale, each facing away from the stack's middle along its logs.
    stack = laidLogs();

  expect(
    'each special stays in the room it claims and on its square, but for a little, open, by roads and in a fortress',
    strays.slice(0, 5),
    []
  );
  expect(
    'inside a fortress, what isn’t a beast or logs is as tall as on open land; a hut moves no special; a log’s cut ends face out',
    [lowered, hutMoves, stack.ends > 0, stack.inward],
    [[], [], true, 0]
  );
  expect(
    'on a shore, nothing of a special on land is in the sea, and where its claim’s on the land it’s drawn; on land just under the water’s level it’s still drawn',
    [
      shore.filter(({ wet }) => wet > 0).map(({ key }) => key),
      shore.filter(({ shown }) => shown < 10).map(({ key }) => key),
      shallow,
    ],
    [[], [], []]
  );
}

// On every grid, an open square's special takes the same room whatever its seed: the most a square of the grid has room
//  for, in one of its corners, which a hex's are shallower, so it's sought a little nearer in too.
{
  const roomsOn = (topologyId: TopologyId): number[] => {
    const width = 16,
      height = 12,
      world = new World({
        _: 'World',
        __: ['World', 'DataObject'],
        id: 'world',
        width,
        height,
        topologyId,
        tiles: Array.from({ length: width * height }, (_, index) => ({
          x: index % width,
          y: Math.floor(index / width),
          terrain: { _: 'Grassland', __: ['Grassland'], features: [] },
          improvements: [],
          units: [],
          city: null,
        })) as never,
      }),
      { layout } = new Land(world),
      rooms = new Set<number>();

    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const centre = layout.centre(x, y),
          outline = layout.outline(x, y),
          radius = Math.min(
            ...outline.map(([au, av], index) => {
              const [bu, bv] = outline[(index + 1) % outline.length]!;

              return (
                Math.abs(
                  (bu - au) * (av - centre[1]) - (au - centre[0]) * (bv - av)
                ) / Math.hypot(bu - au, bv - av)
              );
            })
          ),
          { taken } = layOverlay(
            overlayFor(
              square([], { terrain: 'River', features: ['Horse'] }),
              []
            )!,
            {
              ...place(x, y, { height: () => 0.1 }),
              centre,
              toward: ([dx, dy]) => layout.centre(x + dx, y + dy),
              radius,
              outline,
              owns: (u, v) => {
                const [tx, ty] = layout.tileAt(u, v);

                return tx === x && ty === y;
              },
            },
            soup()
          );

        rooms.add(taken[0]![2]);
      }
    }

    return [...rooms];
  };

  expect(
    'on every grid, an open square’s special takes the same room, whatever its seed',
    (['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).map(roomsOn),
    [[0.2], [0.2], [0.16]]
  );
}

// Farms and mines (#1335): an irrigated square, or farmland, has a farm's buildings among its fields, and farmland a
//  silo among them; a mine on a mountain is a tunnel's mouth, and elsewhere a headframe over a shaft, with no mouth.
{
  const coloured = (mesh: ReturnType<typeof overlayMesh>, css: string) => {
      const colour = new Color(css);
      let found = 0;

      for (let at = 0; at < mesh.colours.length; at += 3) {
        found +=
          Math.abs(mesh.colours[at]! - colour.r) +
            Math.abs(mesh.colours[at + 1]! - colour.g) +
            Math.abs(mesh.colours[at + 2]! - colour.b) <
          1e-5
            ? 1
            : 0;
      }

      return found > 0;
    },
    laid = (improvements: string[], terrain = 'Grassland') =>
      overlayMesh(16, 0, [
        {
          overlay: overlayFor(square(improvements, { terrain }), [])!,
          place: place(17, 3),
        },
      ]),
    irrigated = laid(['Irrigation']),
    farmland = laid(['Irrigation', 'Farmland']),
    [farmhouse, , barn, barnRoof, straw, silo] = FARMSTEAD_COLOURS as [
      string,
      string,
      string,
      string,
      string,
      string
    ];

  expect(
    'irrigated, a barn and haystacks; farmland, a silo; a mine, a tunnel’s mouth on a mountain, not on hills',
    [
      coloured(irrigated, barn),
      coloured(irrigated, straw),
      coloured(irrigated, silo),
      coloured(farmland, silo),
      coloured(laid(['Mine'], 'Mountains'), MINE_COLOURS.mouth),
      coloured(laid(['Mine'], 'Hills'), MINE_COLOURS.mouth),
    ],
    [true, true, false, true, true, false]
  );

  type Triangle = {
    points: (readonly [number, number, number])[];
    normals: (readonly [number, number, number])[];
    colour: readonly [number, number, number];
  };

  // What's laid on a square, by itself: its triangles, each its three points, where they are on the land, and its
  //  colour.
  const trianglesOn = (
      overlay: SquareOverlay,
      at: OverlayPlace
    ): Triangle[] => {
      const laid = soup();

      layOverlay(overlay, at, laid);

      return Array.from({ length: laid.positions.length / 9 }, (_, t) => ({
        points: [0, 1, 2].map(
          (k) =>
            [
              laid.positions[t * 9 + k * 3]!,
              laid.positions[t * 9 + k * 3 + 1]!,
              laid.positions[t * 9 + k * 3 + 2]!,
            ] as const
        ),
        normals: [0, 1, 2].map(
          (k) =>
            [
              laid.normals[t * 9 + k * 3]!,
              laid.normals[t * 9 + k * 3 + 1]!,
              laid.normals[t * 9 + k * 3 + 2]!,
            ] as const
        ),
        colour: [
          laid.colours[t * 9]!,
          laid.colours[t * 9 + 1]!,
          laid.colours[t * 9 + 2]!,
        ] as const,
      }));
    },
    isColour =
      (...css: string[]) =>
      ({ colour: [r, g, b] }: Triangle): boolean =>
        css.some((each) => {
          const colour = new Color(each);

          return (
            Math.abs(colour.r - r) +
              Math.abs(colour.g - g) +
              Math.abs(colour.b - b) <
            1e-5
          );
        }),
    // Each solid among `triangles`, a box's twelve in a row, or as many as `each` says (a cone's 16, a cylinder's 32).
    boxesOf = (triangles: Triangle[], each = 12): Triangle[][] =>
      Array.from({ length: triangles.length / each }, (_, b) =>
        triangles.slice(b * each, b * each + each)
      ),
    // Whether a solid's lowest points are each under the ground, or on it, as `height` has it.
    grounded =
      (height: (u: number, v: number) => number) =>
      (solid: Triangle[]): boolean => {
        const points = pointsIn(solid),
          low = Math.min(...points.map(([, y]) => y));

        return points
          .filter(([, y]) => y < low + 1e-6)
          .every(([u, y, v]) => height(u, v) >= y - 1e-6);
      },
    // A roof: whether its base is at `eaves`, its peak half its width across over that, its faces flat and facing
    //  out; and which way its ridge runs, as a unit (u, v).
    roofOf = (roof: Triangle[], eaves: number) => {
      const points = pointsIn(roof),
        ys = points.map(([, y]) => y),
        [low, high] = [Math.min(...ys), Math.max(...ys)],
        ridge = points.filter(([, y]) => y > high - 1e-6),
        [a, b] = [
          ridge[0]!,
          ridge.find(
            ([u, , v]) => Math.hypot(u - ridge[0]![0], v - ridge[0]![2]) > 1e-4
          )!,
        ],
        along = [b[0] - a[0], b[2] - a[2]],
        length = Math.hypot(along[0]!, along[1]!),
        way = [along[0]! / length, along[1]! / length] as const,
        // How far it reaches across its ridge.
        across =
          Math.max(
            ...points.map(([u, , v]) =>
              Math.abs((u - a[0]) * way[1] - (v - a[2]) * way[0])
            )
          ) * 2,
        middle = [0, 1, 2].map(
          (k) =>
            points.reduce((sum, point) => sum + point[k]!, 0) / points.length
        );

      return {
        based: Math.abs(low - eaves) < 1e-5,
        pitched: Math.abs(high - low - across / 2) < 1e-4,
        flat: roof.every(({ normals: [n, ...rest] }) =>
          rest.every((other) =>
            other.every((x, k) => Math.abs(x - n![k]!) < 1e-4)
          )
        ),
        out: roof.every(
          ({ points: corners, normals: [n] }) =>
            [0, 1, 2].reduce(
              (sum, k) =>
                sum +
                n![k]! *
                  ((corners[0]![k]! + corners[1]![k]! + corners[2]![k]!) / 3 -
                    middle[k]!),
              0
            ) > 0
        ),
        way,
      };
    },
    // How far `points` reach along a way (u, v), and across it.
    reach = (
      points: (readonly [number, number, number])[],
      [wu, wv]: readonly [number, number]
    ) => {
      const along = points.map(([u, , v]) => u * wu + v * wv),
        across = points.map(([u, , v]) => v * wu - u * wv);

      return [
        Math.max(...along) - Math.min(...along),
        Math.max(...across) - Math.min(...across),
      ];
    },
    pointsIn = (triangles: Triangle[]) =>
      triangles.flatMap(({ points }) => points),
    // How far (u, v) is round the triangles, across and along, least and most.
    boundsOf = (triangles: Triangle[]) => {
      const points = pointsIn(triangles);

      return {
        u: [
          Math.min(...points.map(([u]) => u)),
          Math.max(...points.map(([u]) => u)),
        ],
        v: [
          Math.min(...points.map(([, , v]) => v)),
          Math.max(...points.map(([, , v]) => v)),
        ],
      };
    },
    farmsteads = isColour(...FARMSTEAD_COLOURS),
    // Forty squares, each seeded its own way.
    squares = Array.from({ length: 40 }, (_, x) => x);

  // On a mountain whose ridge runs across it north of its middle, so out from its middle isn't always down the
  //  slope: every tunnel faces down it, square to the ridge, away from it; its mouth's face in front of the rock it's
  //  dug into, which rises over it; its mouth, posts, rock, spoil and cart down into the ground at each of their feet,
  //  none hanging over the slope below. On flat ground, each faces out from the square's middle.
  {
    const ridge = (_u: number, v: number) => 0.5 - 0.4 * Math.abs(v - 3.2),
      flat = () => 0.3,
      tunnelOn = (x: number, height: (u: number, v: number) => number) => {
        const at = place(x, 3, { height }),
          triangles = trianglesOn(
            overlayFor(square(['Mine'], { terrain: 'Mountains' }), [])!,
            at
          ),
          coloured = (css: string) => triangles.filter(isColour(css)),
          [mouth] = boxesOf(coloured(MINE_COLOURS.mouth)),
          // Its posts, lower than its lintel.
          posts = boxesOf(coloured(MINE_COLOURS.timber))
            .sort(
              (a, b) =>
                Math.min(...pointsIn(a).map(([, y]) => y)) -
                Math.min(...pointsIn(b).map(([, y]) => y))
            )
            .slice(0, 2),
          rock = coloured(MINE_COLOURS.rock),
          middleOf = (solid: Triangle[]) => {
            const { u, v } = boundsOf(solid);

            return [(u[0]! + u[1]!) / 2, (v[0]! + v[1]!) / 2] as const;
          },
          [mu, mv] = middleOf(mouth!),
          front = posts.map(middleOf),
          // Its frame, between its posts.
          frame = [
            (front[0]![0] + front[1]![0]) / 2,
            (front[0]![1] + front[1]![1]) / 2,
          ] as const,
          // Out from its mouth, through its frame.
          out = [frame[0] - mu, frame[1] - mv],
          way = [
            out[0]! / Math.hypot(out[0]!, out[1]!),
            out[1]! / Math.hypot(out[0]!, out[1]!),
          ] as const,
          // How far forward of its frame, along the way it faces.
          forward = ([u, , v]: readonly [number, number, number]) =>
            (u - frame[0]) * way[0] + (v - frame[1]) * way[1];

        return {
          centre: at.centre,
          frame,
          way,
          // Its mouth's face in front of all of its rock, and the rock over the mouth.
          faced:
            Math.max(...pointsIn(mouth!).map(forward)) >
              Math.max(...pointsIn(rock).map(forward)) &&
            Math.max(...pointsIn(rock).map(([, y]) => y)) >
              Math.max(...pointsIn(mouth!).map(([, y]) => y)),
          grounded: [
            mouth!,
            ...posts,
            rock,
            ...boxesOf(coloured(MINE_COLOURS.spoil), 16),
            ...boxesOf(coloured(MINE_COLOURS.iron)),
          ].every(grounded(height)),
        };
      },
      ridged = squares.map((x) => tunnelOn(x, ridge)),
      flats = squares.map((x) => tunnelOn(x, flat)),
      // How far, in degrees, a tunnel faces from a way (u, v).
      off = (
        way: readonly [number, number],
        [u, v]: readonly [number, number]
      ) =>
        (Math.acos(Math.min(1, (way[0] * u + way[1] * v) / Math.hypot(u, v))) *
          180) /
        Math.PI;

    expect(
      'tunnels face down a ridge, away from it, within 12°; on flat ground, out from the middle; dug in, on the ground',
      [
        ridged.filter(
          ({ frame: [, fv], way }) => off(way, [0, Math.sign(fv - 3.2)]) > 12
        ).length,
        flats.filter(
          ({ frame: [fu, fv], centre: [cu, cv], way }) =>
            off(way, [fu - cu, fv - cv]) > 1
        ).length,
        [...ridged, ...flats].filter(({ faced }) => !faced).length,
        ridged.filter(({ grounded }) => !grounded).length,
      ],
      [0, 0, 0, 0]
    );
  }

  // On land sloping steeply, one in two: a farm's barn and a mine's engine house have their walls' full height over
  //  the highest of the ground under them, under gabled roofs whose base is at their eaves, peaked at half their width,
  //  their faces flat and facing out, their ridges along the longer side; the haystacks, silo and spoil down into the
  //  ground at their feet. And wherever a farm stands, with room or with railroads every way, its farmhouse is as tall
  //  for its width.
  {
    const slope = (u: number) => 0.1 + 0.5 * u,
      height = (u: number) => slope(u),
      buildings = squares.flatMap((x) => {
        const at = place(x, 3, { height: (u) => height(u) }),
          triangles = [
            ...trianglesOn(overlayFor(square(['Irrigation']), [])!, at),
            ...trianglesOn(
              overlayFor(square(['Irrigation', 'Farmland']), [])!,
              at
            ),
          ],
          mine = trianglesOn(
            overlayFor(square(['Mine'], { terrain: 'Hills' }), [])!,
            at
          ),
          checked = (walls: Triangle[], roof: Triangle[], wall: number) => {
            const points = pointsIn(walls),
              eaves = Math.max(...points.map(([, y]) => y)),
              low = Math.min(...points.map(([, y]) => y)),
              floor = points.filter(([, y]) => y < low + 1e-6),
              { way, ...shape } = roofOf(roof, eaves),
              [along, across] = reach(points, way);

            return {
              ...shape,
              tall:
                eaves - Math.max(...floor.map(([u]) => height(u))) >=
                wall - 1e-6,
              ridged: along > across,
            };
          },
          barns = boxesOf(triangles.filter(isColour(barn)));

        return [
          ...barns.map((walls, index) => {
            // A barn's walls are 0.06 of its size across, 0.045 tall.
            const roof = boxesOf(triangles.filter(isColour(barnRoof)))[index]!,
              [du, dv] = reach(pointsIn(walls), [1, 0]);

            return checked(walls, roof, (0.045 * Math.min(du!, dv!)) / 0.06);
          }),
          // An engine house's walls are 0.05 tall, at a mine's most room, on an open square.
          checked(
            mine.filter(isColour(MINE_COLOURS.engine)),
            mine.filter(isColour(MINE_COLOURS.roof)),
            0.05
          ),
          {
            // A haystack's cylinder and cone, 48 triangles; a silo's cylinder and dome, 72: each's cylinder, its
            //  first 32.
            ...(
              [
                [straw, 48],
                [silo, 72],
              ] as const
            ).reduce(
              (all, [css, each]) => ({
                ...all,
                [css]: boxesOf(triangles.filter(isColour(css)), each)
                  .map((stack) => stack.slice(0, 32))
                  .every(grounded((u) => height(u))),
              }),
              {}
            ),
            spoil: boxesOf(mine.filter(isColour(MINE_COLOURS.spoil)), 16).every(
              grounded((u) => height(u))
            ),
          },
        ];
      }),
      // A farmhouse's walls, how much taller than its 0.005 sunk they are for their width, on flat ground, open or
      //  with railroads every way, where it has less room.
      railed = [
        [0, -1],
        [1, -1],
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
      ].map((offset) =>
        neighbour(offset as [number, number], ['Road', 'Railroad'])
      ),
      farmhouses = squares.flatMap((x) =>
        [
          overlayFor(square(['Irrigation']), [])!,
          overlayFor(square(['Irrigation', 'Road', 'Railroad']), railed)!,
        ].map((overlay) => {
          const walls = pointsIn(
              trianglesOn(overlay, place(x, 3, { height: () => 0.1 })).filter(
                isColour(farmhouse)
              )
            ),
            ys = walls.map(([, y]) => y),
            [du, dv] = reach(walls, [1, 0]);

          return [
            (Math.max(...ys) - Math.min(...ys) - 0.005) / Math.min(du!, dv!),
            Math.min(du!, dv!),
          ];
        })
      ),
      walled = buildings.filter((each) => 'tall' in each) as {
        tall: boolean;
        ridged: boolean;
        based: boolean;
        pitched: boolean;
        flat: boolean;
        out: boolean;
      }[],
      stacked = buildings.filter((each) => !('tall' in each)) as Record<
        string,
        boolean
      >[];

    expect(
      'on a steep slope, barns and engine houses full height, gabled; stacks, silos, spoil grounded; farmhouses alike',
      [
        walled.length,
        (['tall', 'ridged', 'based', 'pitched', 'flat', 'out'] as const).map(
          (key) => walled.filter((each) => !each[key]).length
        ),
        stacked.filter((each) => Object.values(each).some((ok) => !ok)).length,
        new Set(farmhouses.map(([, width]) => width!.toFixed(4))).size > 1,
        Math.max(...farmhouses.map(([ratio]) => ratio!)) -
          Math.min(...farmhouses.map(([ratio]) => ratio!)) <
          1e-4,
      ],
      [squares.length * 3, [0, 0, 0, 0, 0, 0], 0, true, true]
    );
  }

  // At a river's bank or the shore, where the land dips under the water across half the square: a farm's buildings
  //  stand out of the water, every point of them, and there are some; and none where it's all under the water, though
  //  its fields are laid.
  {
    const bank = (_u: number, v: number) => (v - 3.5) * 0.4,
      farms = squares.map((x) =>
        trianglesOn(
          overlayFor(square(['Irrigation']), [])!,
          place(x, 3, { height: bank })
        ).filter(farmsteads)
      ),
      drowned = trianglesOn(
        overlayFor(square(['Irrigation']), [])!,
        place(17, 3, { height: () => -0.01 })
      );

    expect(
      'at the water’s edge, a farm’s buildings stand out of the water; none where it’s all under it, but its fields',
      [
        farms.filter((farm) => farm.length > 0).length > 30,
        farms.filter((farm) =>
          pointsIn(farm).some(([u, , v]) => bank(u, v) < 0)
        ).length,
        drowned.length > 0,
        drowned.filter(farmsteads).length,
      ],
      [true, 0, true, 0]
    );
  }

  // Where a city's houses have spread onto the square, no farm's among them; and on every square, the fields' rows stop
  //  short of a farm's farmhouse and barn, and its buildings, and a mine's, stand inside the square, but for a little.
  {
    const bigCity = [
        {
          offset: [-1, 0],
          tile: {
            improvements: [],
            city: { id: 'City-Big', name: 'Big', growth: { size: 20 } },
          },
        } as unknown as OverlayNeighbour,
      ],
      suburb = trianglesOn(
        overlayFor(square(['Irrigation'], { terrain: 'Grassland' }), bigCity)!,
        place(17, 3)
      ),
      overlaps = (a: Triangle[], b: Triangle[]) => {
        const p = boundsOf(a),
          q = boundsOf(b);

        return (
          p.u[0]! < q.u[1]! &&
          q.u[0]! < p.u[1]! &&
          p.v[0]! < q.v[1]! &&
          q.v[0]! < p.v[1]!
        );
      },
      // A farm's walls, the farmhouse's and the barn's, square with the rows: those the rows run under, of each square,
      //  and its yard, its haystacks or its silo, all together.
      underRows = squares.flatMap((x) =>
        [['Irrigation'], ['Irrigation', 'Farmland']].map((improvements) => {
          const triangles = trianglesOn(
              overlayFor(square(improvements), [])!,
              place(x, 3)
            ),
            walls = [
              ...boxesOf(triangles.filter(isColour(farmhouse, barn))),
              triangles.filter(isColour(straw, silo)),
            ],
            rows = triangles.filter((triangle) => !farmsteads(triangle));

          return walls.filter((box) => rows.some((row) => overlaps([row], box)))
            .length;
        })
      ),
      // How far past its square's edges what's laid on a square reaches, at the most.
      past = (overlay: SquareOverlay) =>
        Math.max(
          ...squares.map((x) => {
            const { u, v } = boundsOf(trianglesOn(overlay, place(x, 3)));

            return Math.max(x - u[0]!, u[1]! - (x + 1), 3 - v[0]!, v[1]! - 4);
          })
        );

    expect(
      'no farm among a city’s houses; rows stop short of a farm; farms and mines inside their square, but for a little',
      [
        suburb.some(isColour(...ROOFS)),
        suburb.filter(farmsteads).length,
        underRows.reduce((sum, each) => sum + each, 0),
        past(overlayFor(square(['Mine']), [])!) <= 0.03,
        past(overlayFor(square(['Irrigation']), [])!) <= 0.03,
      ],
      [true, 0, 0, true, true]
    );
  }
}

// What stands on a square stands clear of the unit's stand at its middle, 0.2 across: every special, a mine and a hut,
//  on 300 squares each, as where they stand is seeded from the square.
const STAND = 0.2,
  closest = (overlay: SquareOverlay): number =>
    Math.min(
      ...Array.from({ length: 300 }, (_, at) => {
        const x = at % 30,
          y = Math.floor(at / 30);

        return Math.min(
          ...pointsOf(overlayMesh(0, 0, [{ overlay, place: place(x, y) }])).map(
            ([u, , v]) => Math.hypot(u - (x + 0.5), v - (y + 0.5))
          )
        );
      })
    ),
  onTheStand = [
    ...Object.keys(specialTable).map((key): [string, SquareOverlay] => {
      const [terrain, feature] = key.includes(':')
        ? key.split(':')
        : ['River', key];

      return [
        key,
        overlayFor(square([], { terrain, features: [feature!] }), [])!,
      ];
    }),
    ['Mine', overlayFor(square(['Mine']), [])!] as [string, SquareOverlay],
    ['hut', overlayFor(square([], { hut: true }), [])!] as [
      string,
      SquareOverlay
    ],
  ]
    .map(([name, overlay]): [string, number] => [name, closest(overlay)])
    .filter(([, distance]) => distance < STAND);

expect(
  'what stands on a square, every special, a mine and a hut, stands clear of the unit’s stand at its middle, wherever the square',
  onTheStand,
  []
);

// What stands on a square (a mine, a special, a hut) keeps clear of the lines across it, its roads and a fortress's
//  walls, by half a road's width and a little more than its room, and of each other and the unit's stand by their room,
//  where there's room for it: on 400 squares each, as where they stand is seeded from the square.
const segmentGap = (
    [u, v]: readonly [number, number],
    [a, b]: readonly [readonly [number, number], readonly [number, number]]
  ): number => {
    const du = b[0] - a[0],
      dv = b[1] - a[1],
      length = du * du + dv * dv,
      t =
        length === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((u - a[0]) * du + (v - a[1]) * dv) / length)
            );

    return Math.hypot(u - (a[0] + du * t), v - (a[1] + dv * t));
  },
  roadsTo = (offsets: [number, number][]): OverlayNeighbour[] =>
    offsets.map((offset) => neighbour(offset, ['Road'])),
  // Of the first `count` things that stand on `overlay`'s squares: the least they have to spare by the rule above, and
  //  the least gap between one's middle and a line's, less its room.
  spareOn = (
    overlay: SquareOverlay,
    count: number
  ): { spare: number; offTheLines: number } => {
    let spare = Infinity,
      offTheLines = Infinity;

    for (let at = 0; at < 400; at++) {
      const where = place(at % 40, Math.floor(at / 40)),
        { taken, lines } = layOverlay(overlay, where, soup()),
        things = taken.slice(0, count);

      things.forEach(([u, v, room], index) => {
        const [cu, cv] = where.centre,
          gaps = lines.map((line) => segmentGap([u, v], line) - room);

        offTheLines = Math.min(offTheLines, ...gaps);
        spare = Math.min(
          spare,
          ...gaps.map((gap) => gap - 0.05),
          Math.hypot(u - cu, v - cv) - 0.22 - room,
          ...things
            .filter((_, other) => other !== index)
            .map(([ou, ov, other]) => Math.hypot(u - ou, v - ov) - room - other)
        );
      });
    }

    return { spare, offTheLines };
  },
  hillWith = (
    improvements: string[],
    hut: boolean
  ): ReturnType<typeof square> =>
    square(['Mine', ...improvements], {
      terrain: 'Hills',
      features: ['Coal'],
      hut,
    }),
  roadAcross = spareOn(
    overlayFor(
      hillWith(['Road'], true),
      roadsTo([
        [1, 0],
        [-1, 0],
      ])
    )!,
    3
  ),
  fourWays = spareOn(
    overlayFor(
      hillWith(['Road'], true),
      roadsTo([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
    )!,
    3
  ),
  everyWay = spareOn(
    overlayFor(
      hillWith(['Road'], true),
      roadsTo([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ])
    )!,
    3
  ),
  walled = spareOn(overlayFor(hillWith(['Fortress'], false), [])!, 2);

expect(
  'a mine, a special and a hut keep clear of the road, of each other and of the stand, with a road across a square or four ways',
  [roadAcross.spare >= 0, fourWays.spare >= 0],
  [true, true]
);

// Where there isn't room, with roads all eight ways or inside a fortress's walls, each stands where it has the most:
//  never more than a little inside its room of a road's or a wall's middle, where the first place it tried would stand
//  on them.
expect(
  'with roads every way, or in a fortress, a mine, a special and a hut stand where they have most room, off the roads and walls',
  [everyWay.offTheLines > -0.02, walled.offTheLines > -0.02],
  [true, true]
);

const standing = overlayFor(
  square(['Mine'], {
    terrain: 'Hills',
    features: ['Coal', 'Wine'],
    hut: true,
  }),
  []
)!;

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
            hasColour(mesh, '#8c7a58')
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

// A world of the land, its squares from `tileOf`, and a stage that keeps what it's given.
const landOf = (
  topologyId: TopologyId,
  width: number,
  height: number,
  tileOf: (
    x: number,
    y: number
  ) => {
    terrain?: string;
    improvements?: string[];
    city?: boolean;
  }
) => {
  const tiles = Array.from({ length: width * height }, (_, at) => {
      const x = at % width,
        y = Math.floor(at / width),
        { terrain = 'River', improvements = [], city = false } = tileOf(x, y);

      return {
        x,
        y,
        isWater: false,
        isLand: true,
        goodyHut: null,
        city: city ? {} : null,
        units: [],
        improvements: improvements.map((_) => ({ _ })),
        terrain: { _: terrain, __: [terrain], features: [] },
      };
    }),
    land = new Land(
      new World({
        _: 'World',
        __: ['World', 'DataObject'],
        id: 'world',
        width,
        height,
        topologyId,
        tiles: tiles as never,
      })
    ),
    chunks = new Map<string, ChunkMesh>(),
    laid = new Map<string, OverlayMesh | null>(),
    order: string[] = [],
    stage = {
      setChunk: (i: number, j: number, mesh: ChunkMesh) =>
        void chunks.set(`${i},${j}`, mesh),
      setOverlay: (i: number, j: number, mesh: OverlayMesh | null) => {
        laid.set(`${i},${j}`, mesh);
        order.push(`${i},${j}`);
      },
    } as unknown as Stage;

  return { tiles, land, chunks, laid, order, stage };
};

// Plants a set of models draws (#1335): laid as where each stands, how tall it's drawn and which way it's turned, by
//  the model, rather than as the built-in set's shapes, as tall as those would be; a kind on a terrain of its own drawn
//  with its own model before the kind's; every chunk laid again when the models change; and a chunk with nothing but
//  plants a set draws kept.
{
  const { land, laid, stage } = landOf('square', 32, 16, (x) => ({
      terrain: x < 16 ? 'Forest' : 'Jungle',
    })),
    solids = () =>
      [...laid.values()].reduce(
        (sum, mesh) => sum + (mesh?.positions.length ?? 0),
        0
      );

  land.queueAll(0, 0);
  land.build(stage, null);

  const builtIn = solids(),
    chunks = laid.size;

  land.growWith(
    new Map([
      ['conifer', 'pine'],
      ['broadleaf', 'beech'],
      ['Jungle:broadleaf', 'teak'],
      ['palm', 'palm'],
    ]),
    0,
    0
  );

  const due = land.overlaysPending();

  land.build(stage, null);

  // Every plant a set draws, with the kind it is, where its chunk is, and how tall.
  const plants = [...laid.values()].flatMap((mesh) =>
      Object.entries(mesh?.plants ?? {}).flatMap(([model, numbers]) =>
        Array.from({ length: numbers.length / PLANT_NUMBERS }, (_, n) => ({
          model,
          forest: mesh!.u + numbers[n * PLANT_NUMBERS]! < 16,
          height: numbers[n * PLANT_NUMBERS + 3]!,
          whole: numbers.length % PLANT_NUMBERS === 0,
          // Where it stands within its chunk, as its corner's taken off: a chunk here is 16 across and down.
          within:
            numbers[n * PLANT_NUMBERS]! >= 0 &&
            numbers[n * PLANT_NUMBERS]! <= 16 &&
            numbers[n * PLANT_NUMBERS + 2]! >= 0 &&
            numbers[n * PLANT_NUMBERS + 2]! <= 16,
        }))
      )
    ),
    // Each model's kind and where it grows, and so how big it grows against its usual: the table's sizes, from the
    //  woods' fringe's (0.9 of them) to where they're whole (1.3).
    kinds: { [model: string]: [keyof typeof PLANT_HEIGHT, string] } = {
      pine: ['conifer', 'Forest'],
      beech: ['broadleaf', 'Forest'],
      teak: ['broadleaf', 'Jungle'],
      palm: ['palm', 'Jungle'],
    },
    tall = plants.filter(({ model, height }) => {
      const [kind, terrain] = kinds[model]!,
        [least, most] = vegetationTable[terrain]!.plants.find(
          (plant) =>
            plant.kind === kind ||
            (kind === 'broadleaf' && plant.kind === 'conifer')
        )!.size,
        usual = PLANT_HEIGHT[kind];

      return (
        height < usual * least * 0.9 - 1e-9 ||
        height > usual * most * 1.3 + 1e-9
      );
    });

  expect(
    'plants a set draws are laid by the model, as tall as the built-in set’s, a jungle’s broadleaf its own; every chunk laid again for them, the built-in shapes gone',
    [
      builtIn > 0,
      due,
      [
        ...new Set(
          plants.filter(({ forest }) => forest).map(({ model }) => model)
        ),
      ].sort(),
      [
        ...new Set(
          plants.filter(({ forest }) => !forest).map(({ model }) => model)
        ),
      ].sort(),
      plants.every(({ whole, within }) => whole && within),
      tall.length,
      // Each model's trees as varied in height as the built-in set's sizes are.
      Object.keys(kinds).filter((model) => {
        const heights = plants
          .filter((plant) => plant.model === model)
          .map(({ height }) => height);

        return Math.max(...heights) / Math.min(...heights) < 1.25;
      }),
      solids(),
      [...laid.values()].every((mesh) => mesh !== null),
    ],
    [true, chunks, ['beech', 'pine'], ['palm', 'teak'], true, 0, [], 0, true]
  );
}

// Draped over the land as it's drawn, its flat triangles, not the true relief: on hills, every point of every road and
//  field above the triangle it lies over, by the chunk's own points and indices.
{
  const { land, chunks, laid, stage } = landOf('square', 32, 16, () => ({
    terrain: 'Hills',
    improvements: ['Road', 'Irrigation'],
  }));

  land.queueAll(0, 0);
  land.build(stage, null);

  // Each chunk's points: how far apart, and how many steps across and down, worked out once from its own points.
  const grids = [...chunks.values()].map((mesh) => {
    const p = mesh.positions;
    let row = 1;

    // Points to a row: until the second row starts, further down.
    while (row * 3 + 2 < p.length && p[row * 3 + 2]! === 0) {
      row++;
    }

    return {
      mesh,
      spacing: p[3]! - p[0]!,
      steps: row - 1,
      rows: p.length / 3 / row - 1,
    };
  });

  // The drawn land's height under (`u`, `v`): the triangle of its chunk that it's in, of the two its cell's indices make.
  const drawnAt = (u: number, v: number): number => {
    for (const { mesh, spacing, steps, rows } of grids) {
      const p = mesh.positions,
        local = [u - mesh.u, v - mesh.v] as const,
        a = Math.floor(local[0] / spacing),
        b = Math.floor(local[1] / spacing);

      if (a < 0 || b < 0 || a >= steps || b >= rows) {
        continue;
      }

      for (
        let at = (b * steps + a) * 6;
        at < (b * steps + a) * 6 + 6;
        at += 3
      ) {
        const [ia, ib, ic] = [0, 1, 2].map((k) => mesh.indices[at + k]! * 3),
          ax = p[ia!]!,
          az = p[ia! + 2]!,
          bx = p[ib!]!,
          bz = p[ib! + 2]!,
          cx = p[ic!]!,
          cz = p[ic! + 2]!,
          area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az),
          w1 =
            ((bx - local[0]) * (cz - local[1]) -
              (cx - local[0]) * (bz - local[1])) /
            area,
          w2 =
            ((cx - local[0]) * (az - local[1]) -
              (ax - local[0]) * (cz - local[1])) /
            area,
          w3 = 1 - w1 - w2;

        if (w1 >= -1e-9 && w2 >= -1e-9 && w3 >= -1e-9) {
          return w1 * p[ia! + 1]! + w2 * p[ib! + 1]! + w3 * p[ic! + 1]!;
        }
      }
    }

    return NaN;
  };

  // Every triangle of every road and field: its corners, its middle and its edges' middles, which lie between the
  //  land's points, all over the land as it's drawn, but for a rounding's worth (the polygon offset covers that).
  const below = [...laid.values()].flatMap((mesh) => {
    if (mesh === null) {
      return [];
    }

    // But farms' buildings, which stand on the land.
    const corners = pointsOf(withoutFarmsteads(mesh)),
      samples: [number, number, number][] = [];

    for (let at = 0; at + 2 < corners.length; at += 3) {
      const [a, b, c] = [corners[at]!, corners[at + 1]!, corners[at + 2]!],
        mix = (weights: [number, number, number]): [number, number, number] =>
          [0, 1, 2].map(
            (axis) =>
              a[axis]! * weights[0] +
              b[axis]! * weights[1] +
              c[axis]! * weights[2]
          ) as [number, number, number];

      samples.push(
        a,
        b,
        c,
        mix([1 / 3, 1 / 3, 1 / 3]),
        mix([0.5, 0.5, 0]),
        mix([0, 0.5, 0.5]),
        mix([0.5, 0, 0.5])
      );
    }

    return samples.filter(
      ([u, y, v]) =>
        u > 0.1 && u < 31.9 && v > 0.1 && v < 15.9 && y < drawnAt(u, v) - 0.002
    );
  });

  expect(
    'roads and fields lie over the land as it’s drawn, even on hills, not under it',
    below.length,
    0
  );
}

// A road's drawn along its bend: every point of a road east from 16 squares in a row within half its width of its
//  half (`roadHalf`), and on some of them, bowing furthest, well off the straight line.
{
  const offBend: string[] = [];
  let offStraight = 0;

  for (let x = 16; x < 32; x++) {
    const here = place(x, 3),
      half = roadHalf(here, [1, 0]).points,
      [cu, cv] = here.centre,
      mesh = overlayMesh(16, 0, [{ overlay: roadEast, place: here }]),
      // How far a point is from the half's bend, and from the straight line along `v`.
      fromBend = (u: number, v: number): number =>
        Math.min(
          ...half.slice(1).map((b, index) => {
            const a = half[index]!,
              du = b[0] - a[0],
              dv = b[1] - a[1],
              t = Math.max(
                0,
                Math.min(
                  1,
                  ((u - a[0]) * du + (v - a[1]) * dv) / (du * du + dv * dv)
                )
              );

            return Math.hypot(u - a[0] - du * t, v - a[1] - dv * t);
          })
        );

    if (!facesUp(mesh)) {
      offBend.push(`${x}: faces down`);
    }

    pointsOf(mesh).forEach(([u, , v]) => {
      // The disc at the middle aside.
      if (Math.hypot(u - cu, v - cv) <= 0.036) {
        return;
      }

      if (fromBend(u, v) > 0.036) {
        offBend.push(`${x}: ${u.toFixed(3)},${v.toFixed(3)}`);
      }

      offStraight = Math.max(offStraight, Math.abs(v - cv) - 0.035);
    });
  }

  expect(
    'a road’s drawn along its bend, within half its width of it, facing up, and some of them well off the straight line',
    [offBend.slice(0, 5), offStraight > 0.02],
    [[], true]
  );
}

// A city's lot: its sprawl (`sprawl.ts`), seeded from the city, as many lots as its size has built and as tall, its
//  streets out to each neighbour whose road or railroad comes in (a road where the city's square has one too, or a
//  railroad, which joins a city), and the sea beside it, for its quay, and not to a neighbour with nothing, nor a road
//  that doesn't join it. Laid as paving and houses, not a road.
{
  const cityOn = (improvements: string[], size = 6) =>
      ({
        ...square(improvements),
        city: { id: 'City-Lanes', name: 'Lanes', growth: { size } },
      } as unknown as Parameters<typeof overlayFor>[0]),
    sea = (offset: [number, number]): OverlayNeighbour => ({
      offset,
      tile: {
        improvements: [],
        city: null,
        terrain: { _: 'Ocean' },
      } as unknown as OverlayNeighbour['tile'],
    }),
    ringed = [
      neighbour([0, -1], ['Road']),
      neighbour([1, 0], ['Road', 'Railroad']),
      sea([0, 1]),
      neighbour([-1, 0]),
    ],
    roaded = overlayFor(cityOn(['Road']), ringed)!,
    unroaded = overlayFor(cityOn([]), ringed)!,
    laid = overlayMesh(16, 0, [{ overlay: roaded, place: place(17, 3) }]);

  expect(
    'a city’s lot: seeded from the city, as many lots as its size has built and as tall, streets out to roads that join it, and the sea beside it, for its quay; laid as paving and houses, not a road',
    [
      roaded.city?.seed === unroaded.city?.seed,
      [roaded.city?.lots, roaded.city?.tier],
      [
        overlayFor(cityOn(['Road'], 14), ringed)!.city?.lots,
        overlayFor(cityOn(['Road'], 14), ringed)!.city?.tier,
      ],
      // Grown with no more lots or storeys, nothing changes.
      JSON.stringify(overlayFor(cityOn(['Road'], 15), ringed)) ===
        JSON.stringify(overlayFor(cityOn(['Road'], 16), ringed)),
      roaded.city?.ways,
      unroaded.city?.ways,
      roaded.city?.sea,
      overlayFor(cityOn([]), [sea([1, 0]), sea([1, 1]), sea([0, 1])])!.city
        ?.sea,
      [roaded.road, roaded.vegetation, roaded.specials.length],
      hasColour(laid, '#a39a88'),
      hasColour(laid, '#c4b8a2'),
      hasColour(laid, '#8c7a58'),
    ],
    [
      true,
      [15, 0],
      [30, 2],
      true,
      [
        [0, -1],
        [1, 0],
      ],
      [[1, 0]],
      [[0, 1]],
      [
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      [null, false, 0],
      true,
      true,
      false,
    ]
  );
}

// A city's houses as they're laid on flat land: each roof out to its lot's footprint and no further, its corners at
//  the footprint's, and its walls inside them, under the eaves.
{
  const city = overlayFor(
      {
        ...square(['Road']),
        city: { id: 'City-Eaves', name: 'Eaves', growth: { size: 4 } },
      } as unknown as Parameters<typeof overlayFor>[0],
      []
    )!,
    at = place(17, 3),
    laid = overlayMesh(16, 0, [{ overlay: city, place: at }]),
    { lots } = sprawl(at, city.city!, [
      at.centre[0],
      at.centre[1] + IN_FRONT_OF_CITY,
    ]),
    roofs = ROOFS.map((css) => new Color(css)),
    walls = new Color('#c4b8a2'),
    // Each point of a colour, relative to the chunk's corner, back on the ground.
    pointsOf = (colours: Color[]) => {
      const found: [number, number][] = [];

      for (let at = 0; at < laid.colours.length; at += 3) {
        if (
          colours.some(
            ({ r, g, b }) =>
              Math.abs(laid.colours[at]! - r) < 1e-4 &&
              Math.abs(laid.colours[at + 1]! - g) < 1e-4 &&
              Math.abs(laid.colours[at + 2]! - b) < 1e-4
          )
        ) {
          found.push([laid.positions[at]! + 16, laid.positions[at + 2]! + 0]);
        }
      }

      return found;
    },
    // How far out a point is from a lot's middle, along its own sides: half its width at its edges.
    outOf = ([u, v]: [number, number], { at: [lu, lv], facing }: Lot) => {
      const du = u - lu,
        dv = v - lv;

      return Math.max(
        Math.abs(du * Math.cos(facing) - dv * Math.sin(facing)),
        Math.abs(du * Math.sin(facing) + dv * Math.cos(facing))
      );
    },
    // Each point as a share of the half-width out of the lot it's most within.
    reach = (points: [number, number][]) =>
      points.map((point) =>
        Math.min(...lots.map((lot) => outOf(point, lot) / (lot.width / 2)))
      ),
    roofReach = reach(pointsOf(roofs)),
    wallReach = reach(pointsOf([walls]));

  expect(
    'each roof out to its lot’s edges and no further, its walls under the eaves',
    [
      lots.length,
      roofReach.every((share) => share <= 1 + 1e-4),
      roofReach.some((share) => share > 1 - 1e-4),
      wallReach.every((share) => share < 0.9),
    ],
    [11, true, true, true]
  );
}

// A road built to a city: the houses that stay keep their roofs as they're drawn, whatever lots the street clears
//  before them.
{
  const cityOn = (ways: [number, number][]) =>
      overlayFor(
        {
          ...square(['Road']),
          city: { id: 'City-Roofs', name: 'Roofs', growth: { size: 8 } },
        } as unknown as Parameters<typeof overlayFor>[0],
        ways.map((offset) => neighbour(offset, ['Road']))
      )!,
    at = place(17, 3),
    roofs = ROOFS.map((css) => new Color(css)),
    // Each house's roof as it's drawn, by where it stands: the colour at its peak.
    drawn = (overlay: SquareOverlay) => {
      const laid = overlayMesh(16, 0, [{ overlay, place: at }]),
        found = new Map<string, number>();

      sprawl(at, overlay.city!, [
        at.centre[0],
        at.centre[1] + IN_FRONT_OF_CITY,
      ]).lots.forEach(({ at: [lu, lv], width }) => {
        let peak = -Infinity,
          colour = -1;

        for (let point = 0; point < laid.colours.length; point += 3) {
          const which = roofs.findIndex(
            ({ r, g, b }) =>
              Math.abs(laid.colours[point]! - r) < 1e-4 &&
              Math.abs(laid.colours[point + 1]! - g) < 1e-4 &&
              Math.abs(laid.colours[point + 2]! - b) < 1e-4
          );

          if (
            which !== -1 &&
            Math.hypot(
              laid.positions[point]! + 16 - lu,
              laid.positions[point + 2]! - lv
            ) <
              width / 4 &&
            laid.positions[point + 1]! > peak
          ) {
            peak = laid.positions[point + 1]!;
            colour = which;
          }
        }

        found.set(`${lu},${lv}`, colour);
      });

      return found;
    },
    before = drawn(cityOn([[1, 0]])),
    after = drawn(
      cityOn([
        [1, 0],
        [0, -1],
      ])
    ),
    kept = [...before.keys()].filter((key) => after.has(key));

  expect(
    'a road built to a city: the houses that stay keep their roofs as drawn',
    [
      kept.length > 5,
      kept.length < before.size,
      new Set(before.values()).size > 1,
      kept.filter((key) => before.get(key) !== after.get(key)),
    ],
    [true, true, true, []]
  );
}

// A city's houses on a slope: each stands on the land at every corner, its walls down to the ground under the lowest,
//  with no gap under any.
{
  const slope = (u: number, v: number) => 0.5 * (u + v),
    city = overlayFor(
      {
        ...square(['Road']),
        city: { id: 'City-Slope', name: 'Slope', growth: { size: 6 } },
      } as unknown as Parameters<typeof overlayFor>[0],
      []
    )!,
    at = place(17, 3, { height: slope }),
    laid = overlayMesh(16, 0, [{ overlay: city, place: at }]),
    { lots } = sprawl(at, city.city!, [
      at.centre[0],
      at.centre[1] + IN_FRONT_OF_CITY,
    ]),
    { r, g, b } = new Color('#c4b8a2'),
    walls: [number, number, number][] = [];

  for (let point = 0; point < laid.colours.length; point += 3) {
    if (
      Math.abs(laid.colours[point]! - r) < 1e-4 &&
      Math.abs(laid.colours[point + 1]! - g) < 1e-4 &&
      Math.abs(laid.colours[point + 2]! - b) < 1e-4
    ) {
      walls.push([
        laid.positions[point]! + 16,
        laid.positions[point + 1]!,
        laid.positions[point + 2]!,
      ]);
    }
  }

  const floating = lots.filter(({ at: [lu, lv], width, facing }) => {
    // Its own walls: within its footprint along its own sides, not a neighbour's.
    const own = walls.filter(([u, , v]) => {
        const du = u - lu,
          dv = v - lv;

        return (
          Math.max(
            Math.abs(du * Math.cos(facing) - dv * Math.sin(facing)),
            Math.abs(du * Math.sin(facing) + dv * Math.cos(facing))
          ) <
          width / 2
        );
      }),
      bottom = Math.min(...own.map(([, y]) => y));

    return own
      .filter(([, y]) => y < bottom + 1e-6)
      .some(([u, y, v]) => y > slope(u, v));
  });

  expect(
    'on a slope, every house’s walls reach down to the ground at every corner',
    [lots.length, floating.length],
    [15, 0]
  );
}

// The way a unit walks along a road between two squares (`Land#roadPath`), relative to the middle of the one it's
//  going to: from the other's middle along the half it draws to the edge they share, and on along this one's half to
//  its middle; along a railroad's half, straight, where it takes the way; on a city's side, straight to or from the
//  edge; nothing with no road between them, nor between squares that aren't neighbours; over the world's seam, from the
//  copy beside it.
{
  const width = 16,
    height = 12,
    roads = new Set(['4,5', '5,5', '6,5', '7,5', '15,5', '0,5', '4,7']),
    world = new World({
      _: 'World',
      __: ['World', 'DataObject'],
      id: 'world',
      width,
      height,
      topologyId: 'square',
      tiles: Array.from({ length: width * height }, (_, index) => {
        const x = index % width,
          y = Math.floor(index / width);

        return {
          x,
          y,
          terrain: { _: 'Grassland', __: ['Grassland'], features: [] },
          improvements: roads.has(`${x},${y}`)
            ? [{ _: 'Road' }, ...(x === 7 ? [{ _: 'Railroad' }] : [])]
            : [],
          units: [],
          city: x === 6 && y === 5 ? { name: 'Lanes' } : null,
        };
      }) as never,
    }),
    land = new Land(world),
    { layout } = land,
    halfOf = (x: number, y: number, offset: readonly [number, number]) =>
      roadHalf(
        {
          centre: layout.centre(x, y),
          toward: ([dx, dy]) => layout.centre(x + dx, y + dy),
          seed: Math.imul(x, 73856093) ^ Math.imul(y, 19349663),
        },
        offset
      ).points,
    near = (a: readonly number[], b: readonly number[]) =>
      Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) < 1e-9,
    both = land.roadPath(4, 5, 5, 5)!,
    leaving = halfOf(4, 5, [1, 0]),
    coming = halfOf(5, 5, [-1, 0]),
    [tu, tv] = layout.centre(5, 5),
    // Into the city: its square draws no half.
    intoCity = land.roadPath(5, 5, 6, 5)!,
    // Into the city from a railroad, which takes the way there from the road.
    byRail = land.roadPath(7, 5, 6, 5),
    overSeam = land.roadPath(15, 5, 0, 5)!;

  expect(
    'a walk along a road: from one middle along its half to the edge, and on along the other’s to its middle; along a railroad’s, straight; to a city, straight from the edge; none with no road, nor between squares not beside each other; over the seam, from the copy beside it',
    [
      near(both[0]!, [-1, 0]),
      near(both.at(-1)!, [0, 0]),
      both.some((point) => near(point, [-0.5, 0])),
      leaving.every((point, index) =>
        near(both[index]!, [point[0] - tu, point[1] - tv])
      ),
      [...coming]
        .reverse()
        .every((point, index) =>
          near(both[leaving.length - 1 + index]!, [
            point[0] - tu,
            point[1] - tv,
          ])
        ),
      intoCity.length === halfOf(5, 5, [1, 0]).length + 1,
      near(intoCity.at(-2)!, [-0.5, 0]),
      byRail?.length === 3 &&
        near(byRail[0]!, [1, 0]) &&
        near(byRail[1]!, [0.5, 0]) &&
        near(byRail[2]!, [0, 0]),
      land.roadPath(4, 5, 4, 6),
      land.roadPath(4, 5, 4, 7),
      near(overSeam[0]!, [-1, 0]) && near(overSeam.at(-1)!, [0, 0]),
    ],
    [true, true, true, true, true, true, true, true, null, null, true]
  );
}

// On every grid, with roads on every square of a world 8 by 8 that wraps over its poles: the way along the road from
//  every square to every neighbour, over the world's seam and its poles too, starts at the middle it leaves, as the
//  arriving square sees it, ends at the middle it comes to, and runs on with no gap.
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
          improvements: [{ _: 'Road' }],
          units: [],
          city: null,
        })) as never,
      }),
      land = new Land(world),
      { layout } = land,
      topology = world.topology(),
      wrong: string[] = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        topology.directions().forEach((direction) => {
          const at = topology.neighbour(x, y, direction);

          if (at === null) {
            return;
          }

          const [nx, ny] = at,
            path = land.roadPath(x, y, nx, ny),
            there = layout.centre(nx, ny),
            // The way back, and the middle it leaves as the arriving square sees it.
            back = topology
              .directions()
              .map((other) => topology.offset(other, nx, ny))
              .find(([dx, dy]) => {
                const to = topology.neighbour(
                  nx,
                  ny,
                  topology.directions().find((way) => {
                    const offset = topology.offset(way, nx, ny);

                    return offset[0] === dx && offset[1] === dy;
                  })!
                );

                return to !== null && to[0] === x && to[1] === y;
              }),
            leaves =
              back === undefined
                ? null
                : layout.centre(nx + back[0], ny + back[1]);

          if (path === null || leaves === null) {
            wrong.push(`${x},${y} → ${nx},${ny}: none`);

            return;
          }

          const gap = Math.max(
            ...path
              .slice(1)
              .map(([u, v], index) =>
                Math.hypot(u - path[index]![0], v - path[index]![1])
              )
          );

          if (
            Math.hypot(
              path[0]![0] - (leaves[0] - there[0]),
              path[0]![1] - (leaves[1] - there[1])
            ) > 1e-9 ||
            Math.hypot(path.at(-1)![0], path.at(-1)![1]) > 1e-9 ||
            gap > 0.07
          ) {
            wrong.push(`${x},${y} → ${nx},${ny}`);
          }
        });
      }
    }

    expect(
      `${topologyId}: the way along a road from every square to every neighbour, over the seam and poles, starts at the middle it leaves, ends at the one it comes to, with no gap`,
      wrong.slice(0, 5),
      []
    );
  }
);

// A road's halves, on every grid, every way out of every square: each bends on its own square, short of the edge, and
//  meets its neighbour's half at the same point there, going the same way, so the road runs on smoothly. Each bows
//  no further from the straight line than `ROAD_BOW` of its length, and some bow a good part of that.
(['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach(
  (topologyId) => {
    const width = 16,
      height = 12,
      world = new World({
        _: 'World',
        __: ['World', 'DataObject'],
        id: 'world',
        width,
        height,
        topologyId,
        tiles: Array.from({ length: width * height }, (_, index) => ({
          x: index % width,
          y: Math.floor(index / width),
          terrain: { _: 'Grassland', __: ['Grassland'], features: [] },
          improvements: [],
          units: [],
          city: null,
        })) as never,
      }),
      { layout } = new Land(world),
      topology = world.topology(),
      placeOf = (x: number, y: number) => ({
        centre: layout.centre(x, y),
        toward: ([dx, dy]: readonly [number, number]) =>
          layout.centre(x + dx, y + dy),
        seed: Math.imul(x, 73856093) ^ Math.imul(y, 19349663),
      }),
      strays: string[] = [],
      unmet: string[] = [],
      bows: number[] = [],
      // Squares whose every way out bows the same.
      alike: string[] = [];

    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const before = bows.length;

        topology.directions().forEach((direction) => {
          const offset = topology.offset(direction, x, y),
            [nx, ny] = [x + offset[0], y + offset[1]],
            here = roadHalf(placeOf(x, y), offset),
            [cu, cv] = layout.centre(x, y),
            end = here.points.at(-1)!,
            length = Math.hypot(end[0] - cu, end[1] - cv);

          here.points.slice(0, -1).forEach(([u, v]) => {
            const [tx, ty] = layout.tileAt(u, v);

            if (tx !== x || ty !== y) {
              strays.push(`${x},${y} ${offset}`);
            }
          });

          // How far it bows from the straight line, as a share of its length.
          bows.push(
            Math.max(
              ...here.points.map(
                ([u, v]) =>
                  Math.abs(
                    (u - cu) * (end[1] - cv) - (v - cv) * (end[0] - cu)
                  ) /
                  length /
                  length
              )
            )
          );

          // The neighbour's half back.
          const back = topology
            .directions()
            .map((other) => topology.offset(other, nx, ny))
            .find(([dx, dy]) => {
              const [bu, bv] = layout.centre(nx + dx, ny + dy);

              return Math.hypot(bu - cu, bv - cv) < 1e-9;
            });

          if (back === undefined) {
            unmet.push(`${x},${y} ${offset}: no way back`);

            return;
          }

          const there = roadHalf(placeOf(nx, ny), back),
            theirEnd = there.points.at(-1)!,
            [wu, wv] = here.ways.at(-1)!,
            [tu, tv] = there.ways.at(-1)!;

          if (
            Math.hypot(theirEnd[0] - end[0], theirEnd[1] - end[1]) > 1e-9 ||
            Math.abs(wu * tu + wv * tv + 1) > 1e-9
          ) {
            unmet.push(`${x},${y} ${offset}`);
          }
        });

        const own = bows.slice(before);

        if (own.every((bow) => Math.abs(bow - own[0]!) < 1e-9)) {
          alike.push(`${x},${y}`);
        }
      }
    }

    expect(
      `${topologyId}: a road's halves bend on their own squares, short of the edge, meet their neighbours' there going the same way, and bow no further than they may, some a good part of it, each way out of a square its own`,
      [
        strays.slice(0, 5),
        unmet.slice(0, 5),
        alike.slice(0, 5),
        Math.max(...bows) <= ROAD_BOW + 1e-9,
        Math.max(...bows) > ROAD_BOW * 0.6,
      ],
      [[], [], [], true, true]
    );
  }
);

// Across the world's east-west seam on the square grid: a road at the last square joins the first at its copy east of
//  it, halfway there, not back across the world.
{
  const { land, laid, stage } = landOf('square', 64, 32, (x, y) => ({
    improvements: y === 10 && (x === 63 || x === 0) ? ['Road'] : [],
  }));

  land.queueAll(0, 0);
  land.build(stage, null);

  const lastRow = pointsOf(laid.get(land.overlayKeyOf(63, 10))!).filter(
    ([, , v]) => Math.abs(v - 10.5) < 0.04
  );

  expect(
    'a road across the world’s seam joins its neighbour there, halfway to its copy',
    [
      Math.round(Math.max(...lastRow.map(([u]) => u)) * 1e6) / 1e6,
      Math.min(...lastRow.map(([u]) => u)) > 63.4,
    ],
    [64, true]
  );
}

// A change beside a chunk's edge remakes the chunk next door; a release that changes nothing remakes nothing; a city
//  founded beside a railroad remakes it; and what's waiting is made nearest where the map's centred first.
{
  const { tiles, land, laid, order, stage } = landOf(
    'square',
    64,
    32,
    (x, y) => ({
      improvements:
        x === 15 && y === 20
          ? ['Road']
          : x === 40 && y === 5
          ? ['Road', 'Railroad']
          : [],
    })
  );

  land.queueAll(60, 30);
  land.build(stage, null);

  const nearestFirst = order[0];

  laid.clear();
  // East of (15, 20), over the edge of its chunk.
  tiles[20 * 64 + 16]!.improvements = [{ _: 'Road' }];
  land.changed([[16, 20]], 0, 0);
  land.build(stage, null);

  const nextDoor = [
    land.overlayKeyOf(15, 20) !== land.overlayKeyOf(16, 20),
    laid.has(land.overlayKeyOf(15, 20)),
  ];

  laid.clear();
  land.changed([[30, 20]], 0, 0);

  const unchanged = land.overlaysPending();

  tiles[5 * 64 + 41]!.city = {} as never;
  land.changed([[41, 5]], 0, 0);
  land.build(stage, null);

  expect(
    'a road built over a chunk’s edge remakes the chunk next door; a release that changes nothing, nothing; a city founded beside a railroad, its chunk; and the nearest first',
    [
      nextDoor,
      unchanged,
      laid.has(land.overlayKeyOf(40, 5)),
      nearestFirst === land.overlayKeyOf(62, 30),
    ],
    [[true, true], 0, true, true]
  );
}

// A busy chunk's overlay is made a few squares at a time within the frame's budget, and comes out as it would in one go.
{
  const { tiles, land, laid, stage } = landOf('square', 32, 16, () => ({
    terrain: 'Forest',
    improvements: ['Road'],
  }));

  land.queueAll(0, 0);
  land.build(stage, null);
  laid.clear();

  // A road taken up: its chunk made again, with no time to spare, a square each call.
  tiles[3 * 32 + 3]!.improvements = [];
  land.changed([[3, 3]], 0, 0);

  let calls = 0;

  while (land.overlaysPending() > 0 && calls < 100000) {
    land.build(stage, 0);
    calls++;
  }

  const key = land.overlayKeyOf(3, 3),
    whole = land.overlayOf(...(key.split(',').map(Number) as [number, number]));

  expect(
    'a busy chunk’s overlay is made over many small steps, and comes out as in one go',
    [
      calls > 10,
      [...laid.keys()],
      Array.from(laid.get(key)?.positions ?? []).join() ===
        Array.from(whole?.positions ?? []).join(),
    ],
    [true, [key], true]
  );
}

// Fields lie inside their square, a diamond or a hex as much as a square: every point of a lone square's fields is on it.
(['staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach((topologyId) => {
  const { land, laid, stage } = landOf(topologyId, 32, 16, (x, y) => ({
    improvements: x === 9 && y === 5 ? ['Farmland'] : [],
  }));

  land.queueAll(0, 0);
  land.build(stage, null);

  const off = pointsOf(laid.get(land.overlayKeyOf(9, 5))!).filter(
    ([u, , v]) => land.layout.tileAt(u, v).join() !== '9,5'
  );

  expect(`${topologyId}: a square’s fields lie inside it`, off.length, 0);
});

// On the grids whose edges cut squares (an odd row's last square, the last row of a world that wraps over the poles), a
//  square's overlay lies where its square is, as its marker does, not taken round to the other side: with the poles
//  stopped at, there'd be no copy there to bring it back.
(['staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach((topologyId) => {
  const edges: [number, number][] = [
      [9, 15],
      [31, 15],
      [31, 7],
    ],
    { land, laid, stage } = landOf(topologyId, 32, 16, (x, y) => ({
      improvements: edges.some(([ex, ey]) => ex === x && ey === y)
        ? ['Farmland']
        : [],
    }));

  land.queueAll(0, 0);
  land.build(stage, null);

  expect(
    `${topologyId}: the overlay of a square on the world’s edge lies where its square is`,
    edges.map(([x, y]) => {
      const [cu, cv] = land.layout.centre(x, y),
        points = pointsOf(laid.get(land.overlayKeyOf(x, y))!).filter(
          ([u, , v]) => Math.hypot(u - cu, v - cv) < 0.6
        );

      return points.length > 0;
    }),
    edges.map(() => true)
  );
});

// A square changed while its chunk's overlay is being made, a square a frame: one the make has passed has it begun
//  again; one it hasn't reached yet is read as it is when it gets there, without beginning again. Either way the chunk
//  ends as making it in one go would, with nothing left to make.
{
  const width = 32,
    height = 16,
    remade = (change: [number, number]) => {
      const { tiles, land, laid, stage } = landOf(
          'square',
          width,
          height,
          () => ({ terrain: 'Hills', improvements: ['Road'] })
        ),
        key = land.overlayKeyOf(0, 0),
        build = ([x, y]: [number, number], improvement: string): void => {
          (tiles[y * width + x]!.improvements as { _: string }[]).push({
            _: improvement,
          });
          land.changed([[x, y]], 0, 0);
        },
        squares = tiles.filter(
          ({ x, y }) => land.overlayKeyOf(x, y) === key
        ).length;

      land.queueAll(0, 0);
      land.build(stage, null);
      laid.clear();

      // Its first square made, and no more.
      build([0, 0], 'Mine');
      land.build(stage, 0);
      build(change, 'Irrigation');

      let frames = 1;

      while (!laid.has(key) && frames < 5000) {
        land.build(stage, 0);
        frames++;
      }

      const once = landOf('square', width, height, (x, y) => ({
        terrain: 'Hills',
        improvements: (
          tiles[y * width + x]!.improvements as { _: string }[]
        ).map(({ _ }) => _),
      }));

      once.land.queueAll(0, 0);
      once.land.build(once.stage, null);

      return [
        land.overlayKeyOf(...change) === key,
        frames - squares,
        Array.from(laid.get(key)?.positions ?? []).join() ===
          Array.from(once.laid.get(key)?.positions ?? []).join(),
        land.overlaysPending(),
      ];
    },
    // The chunk's last square, the last its make reaches.
    last = (() => {
      const { land } = landOf('square', width, height, () => ({}));
      let found: [number, number] = [0, 0];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (land.overlayKeyOf(x, y) === land.overlayKeyOf(0, 0)) {
            found = [x, y];
          }
        }
      }

      return found;
    })();

  expect(
    'a square changed mid-make: begun again if it was passed, not if it wasn’t reached; ending as made in one go',
    [remade([0, 0]), remade(last)],
    [
      [true, 1, true, 0],
      [true, 0, true, 0],
    ]
  );
}

// The poles' planes keep what lies between them, and what's laid past a pole is drawn a period round as well when
//  they're stopped at, so on every grid that wraps over them, all that's laid on the first and last rows is drawn
//  somewhere between them: where the land is theirs.
expect(
  'the poles’ planes keep what lies between them, and nothing past',
  polesAt(10).map((plane) =>
    [-0.01, 0.01, 9.99, 10.01].map(
      (v) => plane.distanceToPoint(new Vector3(0, 0, v)) >= 0
    )
  ),
  [
    [false, true, true, true],
    [true, true, true, false],
  ]
);

expect(
  'what reaches past a stopped pole is drawn a period round as well, and only then',
  [
    overlayCopies([[0, 0]], [1, 9], 10, 10, true),
    overlayCopies([[0, 0]], [8, 10.4], 10, 10, true),
    overlayCopies(
      [
        [0, 0],
        [20, 0],
      ],
      [-0.4, 3],
      10,
      10,
      true
    ),
    overlayCopies([[0, 0]], [8, 10.4], 10, 10, false),
    overlayCopies([[0, 0]], [8, 10.4], 10, null, true),
  ],
  [
    [[0, 0]],
    [
      [0, 0],
      [0, -10],
    ],
    [
      [0, 0],
      [0, 10],
      [20, 0],
      [20, 10],
    ],
    [[0, 0]],
    [[0, 0]],
  ]
);

(['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach(
  (topologyId) => {
    const width = 32,
      height = 16,
      { land, laid, stage } = landOf(topologyId, width, height, (x, y) => ({
        terrain: 'Hills',
        improvements: y === 0 || y === height - 1 ? ['Farmland', 'Mine'] : [],
      })),
      extent = land.extentV(),
      period = land.layout.period().v,
      poles = polesAt(extent),
      between = (u: number, y: number, v: number): boolean =>
        poles.every(
          (plane) => plane.distanceToPoint(new Vector3(u, y, v)) >= -1e-9
        );

    land.queueAll(0, 0);
    land.build(stage, null);

    const lost = [...laid.values()].flatMap((mesh) => {
      if (mesh === null) {
        return [];
      }

      const points = pointsOf(mesh),
        rows = points.map(([, , v]) => v),
        span: [number, number] = [Math.min(...rows), Math.max(...rows)],
        drawnAt = overlayCopies([[0, 0]], span, extent, period, true);

      return points.filter(
        ([u, y, v]) => !drawnAt.some(([, dv]) => between(u, y, v + dv))
      );
    });

    expect(
      `${topologyId}: with the poles stopped at, all that’s laid on the first and last rows is drawn between them`,
      [period !== null, lost.length],
      [true, 0]
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
  laidAt = (overlay: SquareOverlay, latitude = 0.5, x = 17, y = 3) =>
    pointsOf(
      overlayMesh(16, 0, [{ overlay, place: { ...place(x, y), latitude } }])
    );

expect(
  'a forest grows trees, but not on a city’s lot, which is the city’s sprawl alone',
  [
    forest()?.vegetation,
    laidAt(forest()!).length > 0,
    forest([], true)?.vegetation,
    forest([], true)?.woods,
    forest([], true)?.city !== null,
  ],
  [true, true, false, [], true]
);

// On 60 squares, as where trees stand is seeded from the square: the road's lines run from the middle halfway east,
//  and halfway south, each bending its own way (`roadHalf`).
const onRoad = Array.from({ length: 60 }, (_, at) => {
  const x = at % 20,
    y = Math.floor(at / 20),
    [cu, cv] = [x + 0.5, y + 0.5],
    halves = [
      roadHalf(place(x, y), [1, 0]).points,
      roadHalf(place(x, y), [0, 1]).points,
    ],
    // How far a point is from the nearer road, along its bend.
    fromRoad = (u: number, v: number): number =>
      Math.min(
        ...halves.flatMap((half) =>
          half.slice(1).map((b, index) => {
            const a = half[index]!,
              du = b[0] - a[0],
              dv = b[1] - a[1],
              t = Math.max(
                0,
                Math.min(
                  1,
                  ((u - a[0]) * du + (v - a[1]) * dv) / (du * du + dv * dv)
                )
              );

            return Math.hypot(u - a[0] - du * t, v - a[1] - dv * t);
          })
        )
      ),
    offRoad = ([u, , v]: [number, number, number]): boolean =>
      // Points of the road itself lie on it: only what stands further off it is a plant.
      fromRoad(u, v) <= 0.036 ||
      (Math.hypot(u - cu, v - cv) > 0.22 && fromRoad(u, v) >= 0.05);

  return laidAt(forest(['Road'])!, 0.5, x, y).filter((point) => !offRoad(point))
    .length;
}).filter((count) => count > 0);

expect(
  'its trees stand clear of the unit’s stand at the middle, and of the roads, wherever the square',
  onRoad,
  []
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
// A conifer is fewer points than a broadleaf (two narrow tiers to a round crown): over 40 squares, a forest at the poles
//  is far fewer points than one at the equator.
const forestPoints = (latitude: number): number =>
  Array.from({ length: 40 }, (_, at) =>
    laidAt(forest()!, latitude, at % 20, Math.floor(at / 20))
  ).reduce((sum, points) => sum + points.length, 0);

expect(
  'a forest’s trees are mostly broadleaf at the equator and conifers at the poles',
  forestPoints(1) < forestPoints(0) * 0.8,
  true
);
expect(
  'its solids’ normals are of length one',
  unitNormals(
    overlayMesh(16, 0, [{ overlay: forest()!, place: place(17, 3) }])
  ),
  true
);

// A city's houses on the squares round it (`suburbs`): beside a city of size 4 or more, a step further each size up to a
//  point, on land that isn't the sea, mountains, a mine, a fortress or an airbase, or never seen; fields give way to
//  them. Two cities beside one square, both, in an order of their own, whichever way round they are. A square with
//  nothing else on it is laid for them, and knows the roads past its corners and every city beside it, whatever its
//  size, as its houses keep clear of them.
{
  const cityAt = (
      offset: [number, number],
      size: number,
      name = 'Spread',
      improvements: string[] = []
    ): OverlayNeighbour => ({
      offset,
      tile: {
        improvements: named(...improvements),
        city: { id: `City-${name}`, name, growth: { size } },
      } as unknown as OverlayNeighbour['tile'],
    }),
    on = (
      improvements: string[],
      terrain: string,
      neighbours: OverlayNeighbour[],
      isWater = false
    ) =>
      overlayFor(
        {
          ...square(improvements, { terrain }),
          isWater,
        } as unknown as Parameters<typeof overlayFor>[0],
        neighbours
      ),
    besideOne = (size: number) => [
      cityAt([-1, 0], size),
      neighbour([0, -1], ['Road']),
    ],
    two = [cityAt([-1, 0], 9, 'Alpha'), cityAt([1, 0], 9, 'Beta')],
    seeds = ['Alpha', 'Beta'].map((name) => citySeed(`City-${name}`));

  expect(
    'beside a city of 4 or more, its houses, further each size up to a point; on the sea, mountains, a mine, a fortress, an airbase or unseen land, none; on fields, some; two cities, both, in an order of their own; laid for them alone, knowing the roads past its corners and every city beside it',
    [
      on([], 'Grassland', besideOne(3))?.suburbs,
      on([], 'River', besideOne(3)),
      on([], 'River', besideOne(4)) !== null,
      on([], 'Grassland', besideOne(4))?.suburbs,
      [5, 15, 16].map(
        (size) => on([], 'Grassland', besideOne(size))?.suburbs[0]?.steps
      ),
      [
        on([], 'Ocean', besideOne(20)),
        on([], 'Lake', besideOne(20), true),
        on([], 'Mountains', besideOne(20))?.suburbs,
        on(['Mine'], 'Hills', besideOne(20))?.suburbs,
        on(['Fortress'], 'Grassland', besideOne(20))?.suburbs,
        on(['Airbase'], 'Grassland', besideOne(20))?.suburbs,
        on([], 'Unknown', besideOne(20)),
      ],
      on(['Irrigation'], 'Grassland', besideOne(20))?.suburbs.length,
      [two, [...two].reverse()].map((neighbours) =>
        on([], 'Grassland', neighbours)!.suburbs.map(({ seed }) => seed)
      ),
      on([], 'Grassland', besideOne(4))?.paths,
      [
        on([], 'Grassland', [
          cityAt([-1, 0], 9, 'Big'),
          cityAt([0, 1], 2, 'Small'),
        ])?.beside,
        on([], 'Grassland', besideOne(3))?.beside,
      ],
    ],
    [
      [],
      null,
      true,
      [{ seed: citySeed('City-Spread'), steps: 1, city: [-1, 0] }],
      [2, 12, 12],
      [null, null, [], [], [], [], null],
      1,
      [[...seeds].sort((a, b) => a - b), [...seeds].sort((a, b) => a - b)],
      [
        [-1, 0],
        [0, -1],
      ],
      [
        [
          [-1, 0],
          [0, 1],
        ],
        [],
      ],
    ]
  );
}

// Fields give way to a city's houses: a row of crops stops short of each, and goes on past it where there's room.
expect(
  'a row of crops stops short of a house in its way, and goes on past it; a house beside it, not in its way, leaves it be',
  [
    rowAround(0, 1, 0.5, 0.1, [
      [
        [0.4, 0.45],
        [0.5, 0.45],
        [0.5, 0.55],
        [0.4, 0.55],
      ],
    ]).map((piece) => piece.map((n) => Math.round(n * 1000) / 1000)),
    rowAround(0, 1, 0.5, 0.1, [
      [
        [0.4, 0.7],
        [0.5, 0.7],
        [0.5, 0.8],
        [0.4, 0.8],
      ],
    ]),
    rowAround(0, 1, 0.5, 0.1, [
      [
        [0.01, 0.45],
        [0.1, 0.45],
        [0.1, 0.55],
        [0.01, 0.55],
      ],
    ]).map((piece) => piece.map((n) => Math.round(n * 1000) / 1000)),
  ],
  [
    [
      [0, 0.396],
      [0.504, 1],
    ],
    [[0, 1]],
    [[0.104, 1]],
  ]
);

// On a square of fields, woods or grass beside a city of 20, its houses, as they're drawn, stand clear of what's drawn
//  and grows there: the fields' rows give way, though they're still there; the woods' trees and the grass's plants keep
//  clear; and what was there first, its special and its hut, stays where it was as the city reaches it, its houses
//  clear of them.
{
  type Point = readonly [number, number];

  const at = place(17, 3),
    on = (
      improvements: string[],
      terrain: string,
      neighbours: OverlayNeighbour[],
      more: { features?: string[]; hut?: boolean } = {}
    ) =>
      overlayFor(
        square(improvements, { terrain, ...more }) as Parameters<
          typeof overlayFor
        >[0],
        neighbours
      )!,
    city = (size: number) => [
      {
        offset: [-1, 0],
        tile: {
          improvements: [],
          city: { id: 'City-Clear', name: 'Clear', growth: { size } },
        },
      } as unknown as OverlayNeighbour,
    ],
    roofs = ROOFS.map((css) => new Color(css)),
    isColour = (
      laid: ReturnType<typeof soup>,
      point: number,
      { r, g, b }: Color
    ) =>
      Math.abs(laid.colours[point]! - r) < 1e-4 &&
      Math.abs(laid.colours[point + 1]! - g) < 1e-4 &&
      Math.abs(laid.colours[point + 2]! - b) < 1e-4,
    // Each house's eaves, as drawn: the corners of the base of each roof, a run of triangles in a roof's colour.
    eavesIn = (laid: ReturnType<typeof soup>): Point[][] => {
      const eaves: Point[][] = [];
      let roof: number[] = [];
      const done = () => {
        if (roof.length > 0) {
          const low = Math.min(
              ...roof.map((point) => laid.positions[point + 1]!)
            ),
            base = roof.filter(
              (point) => laid.positions[point + 1]! < low + 1e-6
            ),
            middle = [
              base.reduce((sum, point) => sum + laid.positions[point]!, 0) /
                base.length,
              base.reduce((sum, point) => sum + laid.positions[point + 2]!, 0) /
                base.length,
            ],
            corners = new Map<string, Point>();

          // Its corners, not the middle of its base, in order round it.
          base.forEach((point) => {
            const corner: Point = [
              laid.positions[point]!,
              laid.positions[point + 2]!,
            ];

            if (
              Math.hypot(corner[0] - middle[0]!, corner[1] - middle[1]!) > 1e-6
            ) {
              corners.set(corner.map((n) => n.toFixed(6)).join(','), corner);
            }
          });
          eaves.push(
            [...corners.values()].sort(
              (a, b) =>
                Math.atan2(a[1] - middle[1]!, a[0] - middle[0]!) -
                Math.atan2(b[1] - middle[1]!, b[0] - middle[0]!)
            )
          );
          roof = [];
        }
      };

      for (let point = 0; point < laid.positions.length; point += 9) {
        if (roofs.some((colour) => isColour(laid, point, colour))) {
          roof.push(point, point + 3, point + 6);
        } else {
          done();
        }
      }

      done();

      return eaves;
    },
    // How far `point` is from the convex shape `corners`, in order round it: none inside it.
    fromShape = (point: Point, corners: Point[]): number => {
      const sides = corners.map(
          (corner, index) =>
            [corner, corners[(index + 1) % corners.length]!] as const
        ),
        inside = sides.every(
          ([[au, av], [bu, bv]]) =>
            (bu - au) * (point[1] - av) - (bv - av) * (point[0] - au) >= 0
        );

      return inside
        ? 0
        : Math.min(
            ...sides.map(([[au, av], [bu, bv]]) => {
              const du = bu - au,
                dv = bv - av,
                t = Math.max(
                  0,
                  Math.min(
                    1,
                    ((point[0] - au) * du + (point[1] - av) * dv) /
                      (du * du + dv * dv)
                  )
                );

              return Math.hypot(point[0] - au - du * t, point[1] - av - dv * t);
            })
          );
    },
    laidOut = (overlay: SquareOverlay) => {
      const laid = soup(),
        { grown, taken } = layOverlay(overlay, at, laid);

      return { laid, grown, taken, houses: eavesIn(laid) };
    },
    fields = laidOut(on(['Irrigation'], 'Grassland', city(20))),
    field = new Color('#7da33f'),
    fieldPoints: Point[] = [];

  for (let point = 0; point < fields.laid.positions.length; point += 3) {
    if (isColour(fields.laid, point, field)) {
      fieldPoints.push([
        fields.laid.positions[point]!,
        fields.laid.positions[point + 2]!,
      ]);
    }
  }

  const amongHouses = (terrain: string) => {
      // In woods all round, but for the city.
      const { grown, houses } = laidOut(
          on([], terrain, [
            ...city(20),
            ...(
              [
                [0, -1],
                [1, -1],
                [1, 0],
                [1, 1],
                [0, 1],
                [-1, 1],
                [-1, -1],
              ] as [number, number][]
            ).map(
              (offset) =>
                ({
                  offset,
                  tile: {
                    improvements: [],
                    city: null,
                    terrain: { _: terrain },
                  },
                } as unknown as OverlayNeighbour)
            ),
          ])
        ),
        nearest = grown.map(([u, v]) =>
          Math.min(...houses.map((corners) => fromShape([u, v], corners)))
        );

      return [
        houses.length > 10,
        grown.length > 0,
        // Each at least a small plant's spread from every house: none in one, nor brushing it.
        nearest.filter((out) => out < 0.03).length,
      ];
    },
    spotted = (size: number) =>
      laidOut(
        on([], 'Grassland', city(size), { features: ['Resources'], hut: true })
      ),
    early = spotted(3),
    late = spotted(20);

  expect(
    'beside a city of 20, its houses as drawn: on fields, the rows of crops giving way but still there; on woods and grass, trees and plants clear of them by a small plant’s spread at the least; a special and a hut where they were before it reached them, and clear of its houses',
    [
      fields.houses.length > 10,
      fieldPoints.length > 0,
      fieldPoints.filter((point) =>
        fields.houses.some((corners) => fromShape(point, corners) === 0)
      ).length,
      amongHouses('Forest'),
      amongHouses('Grassland'),
      JSON.stringify(early.taken.slice(0, 2)) ===
        JSON.stringify(late.taken.slice(0, 2)),
      late.houses.length > 10,
      late.taken
        .slice(0, 2)
        .filter(([u, v, room]) =>
          late.houses.some((corners) => fromShape([u, v], corners) < room)
        ).length,
    ],
    [true, true, 0, [true, true, 0], [true, true, 0], true, true, 0]
  );

  // At the shore, where the land dips under the sea across half the square beside a city of 20: its houses stand out of
  //  the water, every corner of every one, and there are some.
  const shore = place(17, 3, { height: (_u, v) => (v - 3.5) * 0.4 }),
    ashore = (() => {
      const laid = soup();

      layOverlay(on([], 'Grassland', city(20)), shore, laid);

      return eavesIn(laid);
    })();

  expect(
    'at the shore, a city’s houses stand out of the water, every corner',
    [
      ashore.length > 5,
      ashore.filter((corners) =>
        corners.some(([u, v]) => shore.heightAt(u, v) < 0)
      ).length,
    ],
    [true, 0]
  );

  // A road from the city to the square below this one runs past this one's corner, from one of its neighbours to
  //  another: for many cities, its houses, as drawn, keep clear of that road and the city's street to it, as drawn on
  //  their own squares, and some stand near that corner.
  const overlap = (p: Point[], q: Point[]): boolean =>
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
    trianglesIn = (laid: ReturnType<typeof soup>, css: string[]): Point[][] => {
      const colours = css.map((one) => new Color(one)),
        found: Point[][] = [];

      for (let point = 0; point < laid.positions.length; point += 9) {
        if (colours.some((colour) => isColour(laid, point, colour))) {
          found.push(
            [point, point + 3, point + 6].map(
              (corner) =>
                [laid.positions[corner]!, laid.positions[corner + 2]!] as const
            )
          );
        }
      }

      return found;
    },
    corner: Point = [17, 4];
  let onRoads = 0,
    nearCorner = 0;

  for (let seed = 0; seed < 40; seed++) {
    const cityTile = {
        improvements: named('Road'),
        city: {
          id: `City-Corner-${seed}`,
          name: 'Corner',
          growth: { size: 20 },
        },
      },
      here = soup(),
      below = soup(),
      home = soup();

    layOverlay(
      overlayFor(
        square([], { terrain: 'Grassland' }) as Parameters<
          typeof overlayFor
        >[0],
        [
          { offset: [-1, 0], tile: cityTile } as unknown as OverlayNeighbour,
          neighbour([0, 1], ['Road']),
        ]
      )!,
      at,
      here
    );
    layOverlay(
      overlayFor(square(['Road'], { terrain: 'Grassland' }), [
        { offset: [-1, -1], tile: cityTile } as unknown as OverlayNeighbour,
      ])!,
      place(17, 4),
      below
    );
    layOverlay(
      overlayFor(
        { ...square(['Road']), city: cityTile.city } as unknown as Parameters<
          typeof overlayFor
        >[0],
        [neighbour([1, 1], ['Road'])]
      )!,
      place(16, 3),
      home
    );

    const roads = [
        ...trianglesIn(below, ['#8c7a58']),
        ...trianglesIn(home, ['#a39a88']),
      ],
      houses = eavesIn(here);

    onRoads += houses.filter((corners) =>
      roads.some((triangle) => overlap(corners, triangle))
    ).length;
    nearCorner += houses.filter((corners) =>
      corners.some(([u, v]) => Math.hypot(u - corner[0], v - corner[1]) < 0.15)
    ).length;
  }

  expect(
    'a road past a square’s corner, from one of its neighbours to another: its houses clear of it as drawn, some near that corner',
    [onRoads, nearCorner > 0],
    [0, true]
  );

  // A road built on another square beside it: the houses lining the road into town stay where they were, but for any
  //  in the new road's way, for many cities, whichever way the new road goes.
  const cityWest = (name: string, size: number): OverlayNeighbour =>
      ({
        offset: [-1, 0],
        tile: {
          improvements: named('Road'),
          city: { id: `City-${name}`, name, growth: { size } },
        },
      } as unknown as OverlayNeighbour),
    intoTown = roadHalf(at, [-1, 0]).points,
    // Neighbours in the order the topology names them, as the land hands them over: a road built another way comes
    //  before or after the road into town among them.
    inOrder = (neighbours: OverlayNeighbour[]) =>
      [...neighbours].sort(
        (a, b) =>
          at.around.findIndex(
            ([du, dv]) => du === a.offset[0] && dv === a.offset[1]
          ) -
          at.around.findIndex(
            ([du, dv]) => du === b.offset[0] && dv === b.offset[1]
          )
      ),
    lining = (corners: Point[]) =>
      corners.some(([u, v]) =>
        intoTown.slice(1).some((to, index) => {
          const [au, av] = intoTown[index]!,
            du = to[0] - au,
            dv = to[1] - av,
            t = Math.max(
              0,
              Math.min(1, ((u - au) * du + (v - av) * dv) / (du * du + dv * dv))
            );

          // Its front at the roadside.
          return (
            Math.hypot(u - au - du * t, v - av - dv * t) < ROADSIDE + 0.045
          );
        })
      ),
    housesWith = (name: string, roads: [number, number][]) =>
      eavesIn(
        (() => {
          const laid = soup();

          layOverlay(
            overlayFor(
              square(['Road'], { terrain: 'Grassland' }),
              inOrder([
                cityWest(name, 15),
                ...roads.map((offset) => neighbour(offset, ['Road'])),
              ])
            )!,
            at,
            laid
          );

          return laid;
        })()
      ).map((corners) =>
        corners.map((n) => n.map((m) => m.toFixed(5)).join(',')).join(' ')
      ),
    elsewhere: [number, number][] = [
      [0, -1],
      [1, -1],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, -1],
    ];
  let lined = 0,
    moved = 0;

  for (let city = 0; city < 10; city++) {
    const before = eavesIn(
        (() => {
          const laid = soup();

          layOverlay(
            overlayFor(
              square(['Road'], { terrain: 'Grassland' }),
              inOrder([
                cityWest(`Lined-${city}`, 15),
                neighbour([1, 0], ['Road']),
              ])
            )!,
            at,
            laid
          );

          return laid;
        })()
      ).filter(lining),
      keys = before.map((corners) =>
        corners.map((n) => n.map((m) => m.toFixed(5)).join(',')).join(' ')
      );

    lined += keys.length;
    elsewhere.forEach((offset) => {
      const after = housesWith(`Lined-${city}`, [[1, 0], offset]),
        // The new road's half, as it's drawn on this square.
        road = roadHalf(at, offset).points,
        // Whether a house is further from it than a road's width and a house's beside it, and a little: out of its way.
        apartFrom = (corners: Point[]) =>
          corners.every(([u, v]) =>
            road.slice(1).every((to, index) => {
              const [au, av] = road[index]!,
                du = to[0] - au,
                dv = to[1] - av,
                t = Math.max(
                  0,
                  Math.min(
                    1,
                    ((u - au) * du + (v - av) * dv) / (du * du + dv * dv)
                  )
                );

              return Math.hypot(u - au - du * t, v - av - dv * t) > 0.25;
            })
          );

      moved += before.filter(
        (corners, index) => apartFrom(corners) && !after.includes(keys[index]!)
      ).length;
    });
  }

  expect(
    'a road built on another square beside it: the houses lining the road into town stay where they were, but for any in its way',
    [lined > 30, moved],
    [true, 0]
  );

  // A railroad into town, with its road: units walk along it (`Land#roadPath`), so the houses line it at the roadside as
  //  they do a road, whichever side of the square the city's on, for many cities.
  const liningRail = (
    [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as [number, number][]
  ).map((offset) => {
    const [cu, cv] = at.centre,
      [tu, tv] = at.toward(offset),
      // Its half, straight from the square's middle to the edge it shares with the city.
      rail: [Point, Point] = [
        [cu, cv],
        [(cu + tu) / 2, (cv + tv) / 2],
      ];
    let lining = 0;

    for (let city = 0; city < 10; city++) {
      const laid = soup();

      layOverlay(
        overlayFor(square(['Road', 'Railroad'], { terrain: 'Grassland' }), [
          {
            offset,
            tile: {
              improvements: named('Road'),
              city: {
                id: `City-Rail-${city}`,
                name: `Rail-${city}`,
                growth: { size: 15 },
              },
            },
          } as unknown as OverlayNeighbour,
        ])!,
        at,
        laid
      );
      lining += eavesIn(laid).filter((corners) =>
        corners.some(([u, v]) => {
          const [[au, av], [bu, bv]] = rail,
            du = bu - au,
            dv = bv - av,
            t = Math.max(
              0,
              Math.min(1, ((u - au) * du + (v - av) * dv) / (du * du + dv * dv))
            );

          return (
            Math.hypot(u - au - du * t, v - av - dv * t) < ROADSIDE + 0.045
          );
        })
      ).length;
    }

    return lining > 10;
  });

  expect(
    'a railroad into town: units walk along it, and houses line it at the roadside, whichever side the city’s on',
    liningRail,
    [true, true, true, true]
  );

  // Two cities beside one square, two apart or side by side: one holding its size, its houses there stay as they are
  //  while the other grows, each building on its own side.
  const cityAt = (
      offset: [number, number],
      name: string,
      size: number
    ): OverlayNeighbour =>
      ({
        offset,
        tile: {
          improvements: named('Road'),
          city: { id: `City-${name}`, name, growth: { size } },
        },
      } as unknown as OverlayNeighbour),
    unsettled: string[] = [];
  let fewest = Infinity;

  (
    [
      [1, 0],
      [0, -1],
    ] as [number, number][]
  ).forEach((holding) => {
    // Each pair both ways round, so the one holding its size is laid first in some, and second in others.
    for (let pair = 0; pair < 16; pair++) {
      const [growing, holder] = [`Pair-${pair >> 1}-a`, `Pair-${pair >> 1}-b`][
        pair % 2 === 0 ? 'slice' : 'reverse'
      ]();
      let was: string | null = null;

      for (let size = 3; size <= 15; size++) {
        const laid = soup(),
          [hu, hv] = at.toward(holding),
          [gu, gv] = at.toward([-1, 0]);

        layOverlay(
          overlayFor(square([], { terrain: 'Grassland' }), [
            cityAt([-1, 0], growing!, size),
            cityAt(holding, holder!, 15),
          ])!,
          at,
          laid
        );

        // Its houses: those nearer its middle than the other's.
        const its = JSON.stringify(
          eavesIn(laid).filter((corners) =>
            corners.every(
              ([u, v]) =>
                Math.hypot(u - hu, v - hv) < Math.hypot(u - gu, v - gv)
            )
          )
        );

        fewest = Math.min(fewest, (JSON.parse(its) as unknown[]).length);

        if (was !== null && its !== was) {
          unsettled.push(`${holding} ${holder} size ${size}`);
        }

        was = its;
      }
    }
  });

  expect(
    'two cities beside one square: one holding its size keeps its houses there as the other grows',
    [unsettled.slice(0, 5), fewest >= 5],
    [[], true]
  );
}

// A mesh as it's laid, to compare: nothing and an empty mesh alike.
const meshKey = (mesh: OverlayMesh | null | undefined): string =>
  mesh === undefined
    ? 'unset'
    : mesh === null || mesh.positions.length === 0
    ? 'none'
    : [mesh.u, mesh.v, mesh.positions, mesh.normals, mesh.colours]
        .map((part) =>
          typeof part === 'number'
            ? String(part)
            : Buffer.from(
                part.buffer,
                part.byteOffset,
                part.byteLength
              ).toString('base64')
        )
        .join(' ');

// The chunks where `laid` isn't as `expected` has them.
const differing = (
  laid: Map<string, OverlayMesh | null>,
  expected: Map<string, OverlayMesh | null>
): string[] =>
  [...expected.keys()].filter(
    (key) => meshKey(laid.get(key)) !== meshKey(expected.get(key))
  );

// The towns hidden (`t`, `Land#showTowns`): every chunk is laid as in the same world with no city in it, and shown
//  again, as a land laid afresh lays it. For a city of 12 on a chunk's edge, whose houses reach the next chunk; for a
//  city kept for a battle whose world's city is gone; and with `t` pressed while the city's chunk is half made, past
//  its square or short of it. On every grid.
{
  const width = 24,
    height = 8,
    faults: string[] = [];

  (['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach(
    (topologyId) => {
      (['edge', 'kept', 'past', 'short'] as const).forEach((scenario) => {
        const { tiles, land, laid, stage } = landOf(
            topologyId,
            width,
            height,
            (x, y) => ({
              terrain: (x * 7 + y * 3) % 9 === 0 ? 'Forest' : 'Grassland',
              improvements:
                (x + 2 * y) % 3 === 0
                  ? ['Road']
                  : (x * y) % 4 === 1
                  ? ['Irrigation']
                  : [],
            })
          ),
          world = new World({
            _: 'World',
            __: ['World', 'DataObject'],
            id: 'world',
            width,
            height,
            topologyId,
            tiles: tiles as never,
          }),
          topology = world.topology(),
          kept = new Map<string, Tile['city']>(),
          keep = (x: number, y: number): Tile['city'] | undefined =>
            kept.get(`${x},${y}`),
          // Laid afresh, over the same tiles, the towns `shown` or not; or, with `bare`, in the same world with no city
          //  in it.
          fresh = (shown: boolean, bare = false) => {
            const other = new Land(
                new World({
                  _: 'World',
                  __: ['World', 'DataObject'],
                  id: 'world',
                  width,
                  height,
                  topologyId,
                  tiles: (bare
                    ? tiles.map((tile) => ({ ...tile, city: null }))
                    : tiles) as never,
                })
              ),
              laidAfresh = new Map<string, OverlayMesh | null>();

            if (!bare) {
              other.keepCities(keep);
            }

            other.showTowns(shown, 0, 0);
            other.queueAll(0, 0);
            other.build(
              {
                setChunk: () => undefined,
                setOverlay: (i: number, j: number, mesh: OverlayMesh | null) =>
                  void laidAfresh.set(`${i},${j}`, mesh),
              } as unknown as Stage,
              null
            );

            return laidAfresh;
          },
          check = (
            label: string,
            expected: Map<string, OverlayMesh | null>
          ) => {
            land.build(stage, null);

            const wrong = differing(laid, expected);

            if (wrong.length > 0) {
              faults.push(
                `${topologyId} ${scenario}: ${label}: chunks ${wrong.join(' ')}`
              );
            }
          },
          // A square with a neighbour in another chunk, away from the world's edges, a few squares into its chunk's.
          at = tiles.find(({ x, y }) => {
            const key = land.overlayKeyOf(x, y),
              inChunk = tiles.filter(
                (tile) => land.overlayKeyOf(tile.x, tile.y) === key
              ),
              index = inChunk.findIndex((tile) => tile.x === x && tile.y === y);

            return (
              y > 2 &&
              y < height - 3 &&
              x > 2 &&
              x < width - 3 &&
              index >= 4 &&
              index < inChunk.length - 4 &&
              topology.directions().some((direction) => {
                const next = topology.neighbour(x, y, direction);

                return next !== null && land.overlayKeyOf(...next) !== key;
              })
            );
          })!,
          city = { id: 'City-Edge', name: 'Edge', growth: { size: 12 } };

        land.keepCities(keep);
        land.queueAll(0, 0);
        land.build(stage, null);

        // On ground where nothing grows, so hidden, its own square is laid as with no city, the way in front clear or
        //  not (checked below).
        Object.assign(at, {
          city,
          terrain: { _: 'River', __: ['River'], features: [] },
          improvements: [{ _: 'Road' }],
        });
        land.changed([[at.x, at.y]], 0, 0);

        if (scenario === 'kept') {
          // Kept as it was before a battle, the world's city gone.
          kept.set(`${at.x},${at.y}`, city as unknown as Tile['city']);
          at.city = null;
          land.changed([[at.x, at.y]], 0, 0);
        }

        const shown = fresh(true);

        check('shown', shown);

        if (scenario === 'past' || scenario === 'short') {
          // Its chunk made again, and `t` pressed when it's made past the city's square, or short of it.
          const key = land.overlayKeyOf(at.x, at.y),
            inChunk = tiles.filter(
              (tile) => land.overlayKeyOf(tile.x, tile.y) === key
            ),
            index = inChunk.indexOf(at),
            far = scenario === 'past' ? inChunk.at(-1)! : inChunk[0]!;

          far.improvements = far.improvements.length > 0 ? [] : [{ _: 'Road' }];
          land.changed([[far.x, far.y]], 0, 0);

          for (
            let step = 0;
            step < (scenario === 'past' ? index + 2 : 1);
            step++
          ) {
            land.build(stage, 0);
          }

          if (land.overlaysPending() === 0) {
            faults.push(`${topologyId} ${scenario}: not half made`);
          }
        }

        land.showTowns(false, 0, 0);
        check('hidden', fresh(false));
        check('hidden, as with no city', fresh(false, true));

        land.showTowns(true, 0, 0);
        check(
          'shown again',
          scenario === 'past' || scenario === 'short' ? fresh(true) : shown
        );
      });
    }
  );

  expect(
    'the towns hidden: every chunk as in the same world with no city, and shown again as laid afresh, for a city on a chunk’s edge, one kept for a battle, and `t` pressed half way through its chunk, on every grid',
    faults.slice(0, 5),
    []
  );
}

// The towns hidden and shown again, over and over (`t`): each chunk's mesh as it was made with the towns that way is
//  taken again, the same mesh, where nothing on it has changed; and every chunk, at every press, is as a land laid
//  afresh lays it. Between presses, with the towns hidden or shown: a road built beside a town, a town grown,
//  destroyed and founded again, one kept for a battle and let go, and the land changed in a town's chunk and in the
//  one beside it, short of its squares' neighbours. On every grid.
{
  const width = 24,
    height = 8,
    faults: string[] = [];

  (['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach(
    (topologyId) => {
      const { tiles, land, laid, order, stage } = landOf(
          topologyId,
          width,
          height,
          (x, y) => ({
            terrain: (x * 7 + y * 3) % 9 === 0 ? 'Forest' : 'Grassland',
            improvements:
              (x + 2 * y) % 3 === 0
                ? ['Road']
                : (x * y) % 4 === 1
                ? ['Irrigation']
                : [],
          })
        ),
        topology = new World({
          _: 'World',
          __: ['World', 'DataObject'],
          id: 'world',
          width,
          height,
          topologyId,
          tiles: tiles as never,
        }).topology(),
        tileAt = (x: number, y: number) => tiles[y * width + x]!,
        neighbours = (x: number, y: number) =>
          topology
            .directions()
            .map((direction) => topology.neighbour(x, y, direction))
            .filter((at): at is [number, number] => at !== null),
        kept = new Map<string, Tile['city']>(),
        keep = (x: number, y: number): Tile['city'] | undefined =>
          kept.get(`${x},${y}`),
        // Laid afresh, over the same tiles and the same cities kept, the towns `shown` or not.
        fresh = (shown: boolean) => {
          const other = new Land(
              new World({
                _: 'World',
                __: ['World', 'DataObject'],
                id: 'world',
                width,
                height,
                topologyId,
                tiles: tiles as never,
              })
            ),
            laidAfresh = new Map<string, OverlayMesh | null>();

          other.keepCities(keep);
          other.showTowns(shown, 0, 0);
          other.queueAll(0, 0);
          other.build(
            {
              setChunk: () => undefined,
              setOverlay: (i: number, j: number, mesh: OverlayMesh | null) =>
                void laidAfresh.set(`${i},${j}`, mesh),
            } as unknown as Stage,
            null
          );

          return laidAfresh;
        },
        a = tileAt(5, 3),
        b = tileAt(16, 4),
        cityA = { id: 'City-A', name: 'A', growth: { size: 8 } },
        cityB = { id: 'City-B', name: 'B', growth: { size: 4 } },
        townChunk = land.overlayKeyOf(a.x, a.y),
        // Every chunk's mesh as it was laid when each step was checked.
        seen = new Map<string, Map<string, OverlayMesh | null>>();
      let shown = true;

      const step = (label: string, change: () => void = () => undefined) => {
          change();
          land.build(stage, null);

          const wrong = differing(laid, fresh(shown));

          if (wrong.length > 0) {
            faults.push(`${topologyId}: ${label}: chunks ${wrong.join(' ')}`);
          }

          seen.set(label, new Map(laid));
        },
        press = (label: string) =>
          step(label, () => {
            shown = !shown;
            land.showTowns(shown, 0, 0);
          }),
        // As `press`, but built a frame at a time with no time to spare: each frame hands the stage one chunk at most,
        //  whether it's made or taken.
        pressSlowly = (label: string) =>
          step(label, () => {
            shown = !shown;
            land.showTowns(shown, 0, 0);

            let frames = 0,
              most = 0;

            while (land.overlaysPending() > 0 && frames < 10000) {
              const before = order.length;

              land.build(stage, 0);
              most = Math.max(most, order.length - before);
              frames++;
            }

            if (most !== 1) {
              faults.push(
                `${topologyId}: ${label}: ${most} chunks at most in a frame`
              );
            }
          }),
        changed = (...squares: { x: number; y: number }[]) =>
          land.changed(
            squares.map(({ x, y }) => [x, y]),
            0,
            0
          ),
        // Whether each chunk's mesh is the very one laid at `earlier`, taken again rather than made.
        taken = (label: string, earlier: string) => {
          const now = seen.get(label)!,
            then = seen.get(earlier)!,
            made = [...now.keys()].filter(
              (key) => now.get(key) !== then.get(key)
            );

          if (made.length > 0) {
            faults.push(
              `${topologyId}: ${label}: chunks ${made.join(
                ' '
              )} made again, not taken as at ${earlier}`
            );
          }
        };

      land.keepCities(keep);
      Object.assign(a, { city: cityA, improvements: [{ _: 'Road' }] });
      Object.assign(b, { city: cityB, improvements: [{ _: 'Road' }] });
      land.queueAll(0, 0);

      step('laid');
      press('hidden');
      press('shown');
      taken('shown', 'laid');
      press('hidden again');
      taken('hidden again', 'hidden');
      pressSlowly('shown slowly');
      taken('shown slowly', 'laid');
      pressSlowly('hidden slowly');
      taken('hidden slowly', 'hidden');

      // A field in A's chunk, too far from A for what's laid on A's square or round it to change, with the towns
      //  hidden: shown again, the chunk's made again with it.
      const nearA = new Set(
          neighbours(a.x, a.y)
            .flatMap(([x, y]) => [
              [x, y] as [number, number],
              ...neighbours(x, y),
            ])
            .flatMap(([x, y]) => [
              [x, y] as [number, number],
              ...neighbours(x, y),
            ])
            .map((at) => at.join())
        ),
        field = tiles.find(
          (tile) =>
            land.overlayKeyOf(tile.x, tile.y) === townChunk &&
            !nearA.has(`${tile.x},${tile.y}`) &&
            tile.improvements.length === 0
        );

      if (field === undefined) {
        faults.push(`${topologyId}: no square in A's chunk away from A`);
      } else {
        step('a field away from A', () => {
          field.improvements = [{ _: 'Irrigation' }];
          changed(field);
        });
      }

      press('shown, with the field');

      press('hidden, for the road');

      // A road built beside A, with the towns hidden: the chunk it's on is made again both ways.
      const beside = neighbours(a.x, a.y)
        .map(([x, y]) => tileAt(x, y))
        .find((tile) => tile.improvements.length === 0)!;

      step('a road beside A', () => {
        beside.improvements = [{ _: 'Road' }];
        changed(beside);
      });
      // A frame at a time: the road's chunk laid again, and the other town's taken, one a frame.
      pressSlowly('shown, with the road');
      press('hidden, with the road');
      taken('hidden, with the road', 'a road beside A');

      step('B grown', () => {
        b.city = { ...cityB, growth: { size: 9 } };
        changed(b);
      });
      press('shown, B grown');
      press('hidden, B grown');
      step('B destroyed', () => {
        b.city = null;
        changed(b);
      });
      press('shown, B destroyed');
      step('B founded again', () => {
        b.city = cityB;
        changed(b);
      });
      press('hidden, B founded again');

      // A kept as it was before a battle, the world's city gone, and let go.
      step('A kept', () => {
        kept.set(`${a.x},${a.y}`, cityA as unknown as Tile['city']);
        a.city = null;
        changed(a);
      });
      press('shown, A kept');
      step('A let go', () => {
        kept.delete(`${a.x},${a.y}`);
        changed(a);
      });
      press('hidden, A let go');
      step('A back', () => {
        a.city = cityA;
        changed(a);
      });
      press('shown, A back');

      // The land changed: in the chunk beside A's, and in A's, on a square none of whose neighbours is one of A's
      //  chunk's, then on one of its own.
      const ownSquares = tiles.filter(
          ({ x, y }) => land.overlayKeyOf(x, y) === townChunk
        ),
        touches = new Set(
          ownSquares.flatMap(({ x, y }) =>
            [[x, y] as [number, number], ...neighbours(x, y)].map((at) =>
              at.join()
            )
          )
        ),
        [au, av] = land.layout.centre(a.x, a.y),
        away = tiles
          .filter(({ x, y }) => !touches.has(`${x},${y}`) && x < b.x - 2)
          .sort((one, other) => {
            const [ou, ov] = land.layout.centre(one.x, one.y),
              [tu, tv] = land.layout.centre(other.x, other.y);

            return Math.hypot(ou - au, ov - av) - Math.hypot(tu - au, tv - av);
          })[0]!,
        own = ownSquares.find(
          (tile) =>
            tile !== a &&
            !neighbours(a.x, a.y).some(([x, y]) => tileAt(x, y) === tile)
        )!;

      step('land changed beside', () => {
        away.terrain = { _: 'Mountains', __: ['Mountains'], features: [] };
        changed(away);
      });
      press('hidden, land changed beside');
      press('shown, land changed beside');
      step('land changed in its chunk', () => {
        own.terrain = { _: 'Hills', __: ['Hills'], features: [] };
        changed(own);
      });
      press('hidden, land changed in its chunk');
      press('shown, land changed in its chunk');

      if (land.overlayKeyOf(away.x, away.y) === townChunk) {
        faults.push(`${topologyId}: the land changed beside is in A's chunk`);
      }
    }
  );

  expect(
    'the towns hidden and shown again, over and over: each chunk’s mesh taken again where nothing on it has changed, and every chunk as laid afresh, through roads, towns grown, destroyed, founded and kept, and the land changed, between presses, on every grid',
    faults.slice(0, 5),
    []
  );
}

// The land changed far from any town (a square seen for the first time, say): the towns' chunks keep what was laid on
//  them both ways, and `t` takes them again; the chunks near the change are laid afresh. On every grid.
{
  // Wide enough for several chunks either way round between the town and the change, on every grid.
  const width = 128,
    height = 4,
    faults: string[] = [];

  (['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach(
    (topologyId) => {
      const { tiles, land, laid, stage } = landOf(
          topologyId,
          width,
          height,
          (x, y) => ({
            terrain: (x * 7 + y * 3) % 9 === 0 ? 'Forest' : 'Grassland',
            improvements: (x + 2 * y) % 3 === 0 ? ['Road'] : [],
          })
        ),
        fresh = (shown: boolean) => {
          const other = new Land(
              new World({
                _: 'World',
                __: ['World', 'DataObject'],
                id: 'world',
                width,
                height,
                topologyId,
                tiles: tiles as never,
              })
            ),
            laidAfresh = new Map<string, OverlayMesh | null>();

          other.showTowns(shown, 0, 0);
          other.queueAll(0, 0);
          other.build(
            {
              setChunk: () => undefined,
              setOverlay: (i: number, j: number, mesh: OverlayMesh | null) =>
                void laidAfresh.set(`${i},${j}`, mesh),
            } as unknown as Stage,
            null
          );

          return laidAfresh;
        },
        town = tiles[1 * width + 4]!,
        // Half the world away, where it's furthest from the town both ways round.
        far = tiles[2 * width + 4 + width / 2]!,
        townChunk = land.overlayKeyOf(town.x, town.y);

      Object.assign(town, {
        city: { id: 'City-T', name: 'T', growth: { size: 8 } },
        improvements: [{ _: 'Road' }],
      });
      land.queueAll(0, 0);
      land.build(stage, null);
      land.showTowns(false, 0, 0);
      land.build(stage, null);

      const hidden = laid.get(townChunk);

      land.showTowns(true, 0, 0);
      land.build(stage, null);
      far.terrain = { _: 'Mountains', __: ['Mountains'], features: [] };
      land.changed([[far.x, far.y]], 0, 0);
      land.build(stage, null);

      const shownWrong = differing(laid, fresh(true));

      land.showTowns(false, 0, 0);
      land.build(stage, null);

      const hiddenWrong = differing(laid, fresh(false));

      if (
        land.overlayKeyOf(far.x, far.y) === townChunk ||
        shownWrong.length > 0 ||
        hiddenWrong.length > 0 ||
        laid.get(townChunk) !== hidden
      ) {
        faults.push(
          `${topologyId}: shown ${shownWrong.join(
            ' '
          )}, hidden ${hiddenWrong.join(' ')}, the town's chunk ${
            laid.get(townChunk) === hidden ? 'taken' : 'made again'
          }`
        );
      }
    }
  );

  expect(
    'the land changed far from any town: the town’s chunk taken again by `t` as it was laid, and every chunk as laid afresh, on every grid',
    faults,
    []
  );
}

// The towns hidden (`t`), on a city in woods: its square's trees keep clear of where a unit stands in front of where
//  its buildings are, as of the square's middle, and still grow on the rest of it. Nothing tall within a unit's stand
//  of that spot, for cities on every grid in forest, jungle and swamp: the world's, or one kept for a battle where the
//  world has none. Kept as none where the world has one, the spot's no city's, and some have trees there.
{
  const faults: string[] = [];
  let wooded = 0,
    crowded = 0;

  (['square', 'staggered-iso', 'hex-odd-r'] as TopologyId[]).forEach(
    (topologyId) =>
      ['Forest', 'Jungle', 'Swamp'].forEach((terrain) => {
        for (let n = 0; n < 4; n++) {
          const width = 12,
            height = 8,
            [cx, cy] = [3 + n * 2, 3 + (n % 2)],
            { tiles, land } = landOf(topologyId, width, height, () => ({
              terrain,
            })),
            town = tiles[cy * width + cx]!,
            [u, v] = land.layout.centre(cx, cy),
            // How many points stand taller than a small plant within `reach` of (`pu`, `pv`), as the square's chunk is
            //  laid afresh.
            tallNear = (pu: number, pv: number, reach: number): number => {
              const mesh = land.overlayOf(
                ...(land.overlayKeyOf(cx, cy).split(',').map(Number) as [
                  number,
                  number
                ])
              );
              let tall = 0;

              for (let at = 0; mesh && at < mesh.positions.length; at += 3) {
                const mu = mesh.positions[at]! + mesh.u,
                  mv = mesh.positions[at + 2]! + mesh.v;

                if (
                  Math.hypot(mu - pu, mv - pv) < reach &&
                  mesh.positions[at + 1]! - land.surfaceAt(mu, mv) > 0.04
                ) {
                  tall++;
                }
              }

              return tall;
            };

          Object.assign(town, {
            city: { id: `City-${n}`, name: `Wood ${n}`, growth: { size: 3 } },
            improvements: [{ _: 'Road' }],
          });
          land.showTowns(false, 0, 0);

          const city = town.city,
            inFront = tallNear(u, v + IN_FRONT_OF_CITY, 0.1),
            onSquare = tallNear(u, v, 0.45),
            // Kept for a battle (`keepCities`) as `kept` on the town's square, the world's as `world`.
            keptAs = (
              kept: Tile['city'] | undefined,
              world: Tile['city']
            ): number => {
              town.city = world;
              land.keepCities((x, y) =>
                x === cx && y === cy ? kept : undefined
              );

              return tallNear(u, v + IN_FRONT_OF_CITY, 0.1);
            },
            keptOnly = keptAs(city as Tile['city'], null);

          crowded += keptAs(null, city as Tile['city']) > 0 ? 1 : 0;
          wooded += onSquare > 0 ? 1 : 0;

          if (inFront > 0) {
            faults.push(`${topologyId} ${terrain} ${n}: ${inFront} in front`);
          }

          if (keptOnly > 0) {
            faults.push(
              `${topologyId} ${terrain} ${n}: ${keptOnly} in front, kept`
            );
          }
        }
      })
  );

  expect(
    'the towns hidden, a city in woods, the world’s or kept for a battle: nothing tall where a unit stands in front of its buildings, and the woods still on every square; kept as none, trees there on some',
    [faults.slice(0, 5), wooded, crowded > 0],
    [[], 36, true]
  );
}

// The towns hidden, a city's lot with a mine, specials and a hut on hills: each, and what grows there, is claimed clear
//  of where its unit stands in front of where its buildings are, as of its middle, on many squares, each turned its own
//  way.
{
  const crowding: string[] = [];

  for (let n = 0; n < 40; n++) {
    const at = place(n, 2),
      { taken } = layOverlay(
        {
          ...overlayFor(
            square(['Mine'], {
              terrain: 'Hills',
              features: ['Coal', 'Wine'],
              hut: true,
            }),
            []
          )!,
          front: true,
        },
        at,
        soup()
      ),
      front: [number, number] = [at.centre[0], at.centre[1] + IN_FRONT_OF_CITY],
      stand = taken.find(
        ([tu, tv]) => Math.hypot(tu - front[0], tv - front[1]) < 1e-9
      );

    if (stand === undefined || taken.length < 5) {
      crowding.push(`${n}: ${taken.length} claimed, the stand's ${stand}`);
    }

    taken
      .filter((claim) => claim !== stand)
      .forEach(([tu, tv, room]) => {
        if (
          stand !== undefined &&
          Math.hypot(tu - front[0], tv - front[1]) < stand[2] + room - 1e-9
        ) {
          crowding.push(`${n}: a claim at ${tu.toFixed(3)},${tv.toFixed(3)}`);
        }
      });
  }

  expect(
    'the towns hidden, a city’s lot with a mine, specials and a hut: each claimed clear of where its unit stands in front',
    crowding.slice(0, 5),
    []
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL overlay: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS overlay (${checks} checks)\n`);

// The cut ends of a stack of logs on flat land: how many triangles there are in their pale, and how many face in
//  toward the stack's middle rather than out along its logs.
function laidLogs(): { ends: number; inward: number } {
  const mesh = overlayMesh(16, 0, [
      {
        overlay: overlayFor(
          square([], { terrain: 'River', features: ['Shield'] }),
          []
        )!,
        place: place(17, 3, { height: () => 0.1 }),
      },
    ]),
    pale = new Color(specialTable['Shield']!.detail!),
    points = pointsOf(mesh),
    middle = points
      .reduce((sum, [u, , v]) => [sum[0] + u, sum[1] + v] as [number, number], [
        0, 0,
      ] as [number, number])
      .map((sum) => sum / points.length);
  let ends = 0,
    inward = 0;

  for (let at = 0; at < points.length; at += 3) {
    const c = mesh.colours,
      isPale =
        Math.abs(c[at * 3]! - pale.r) +
          Math.abs(c[at * 3 + 1]! - pale.g) +
          Math.abs(c[at * 3 + 2]! - pale.b) <
        1e-5;

    if (!isPale) {
      continue;
    }

    ends++;

    const [au, , av] = points[at]!,
      [bu, , bv] = points[at + 1]!,
      [cu, , cv] = points[at + 2]!,
      centroid = [(au + bu + cu) / 3, (av + bv + cv) / 3],
      normal = [mesh.normals[at * 3]!, mesh.normals[at * 3 + 2]!];

    if (
      normal[0]! * (centroid[0]! - middle[0]!) +
        normal[1]! * (centroid[1]! - middle[1]!) <
      0
    ) {
      inward++;
    }
  }

  return { ends, inward };
}
