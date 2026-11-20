// What the 3D map lays on the land (docs/3d-renderer-plan.md 3.4), without a GPU:
//  - every feature Civ1 and Civ2 name has a special of its own, one on a terrain of its own where it looks different,
//    and one the table doesn't know is a cairn;
//  - what a square shows: roads and railroads joined to their neighbours as the 2D map joins them, fields, mines,
//    fortresses, airbases, pollution, specials (not rivers) and huts, or nothing;
//  - its shapes: triangles with a normal and a colour at every point, relative to their chunk's corner; strips draped
//    over the land; a road reaching halfway to the neighbour it joins, at the copy the place says, bending on its own
//    square and meeting its neighbour's half there going the same way; specials at sea on
//    the water; what stands on a square standing clear of the unit's stand at its middle; the same every time;
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
  OverlayMesh,
  OverlayPlace,
  ROAD_BOW,
  layOverlay,
  roadHalf,
  soup,
} from '@civ-clone/ui-map-3d/overlay/overlayMesh';
import { Stage, overlayCopies, polesAt } from '@civ-clone/ui-map-3d/stage';
import { TopologyId } from '@civ-clone/ui-protocol/topology';
import Land from '@civ-clone/ui-map-3d/Land';
import { ChunkMesh } from '@civ-clone/ui-map-3d/terrain/chunks';
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
      ([u, y]) => y - heightAt(u) > 0.013 && y - heightAt(u) < 0.015
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

    const corners = pointsOf(mesh),
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
    'a road’s drawn along its bend, within half its width of it, and some of them well off the straight line',
    [offBend.slice(0, 5), offStraight > 0.02],
    [[], true]
  );
}

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
  'a forest grows trees, but not on a city’s lot',
  [forest()?.vegetation, laidAt(forest()!).length > 0, forest([], true)],
  [true, true, null]
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

if (failures.length > 0) {
  process.stderr.write(
    `FAIL overlay: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS overlay (${checks} checks)\n`);
