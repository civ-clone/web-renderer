// What covers the land by where it lies (docs/3d-renderer.md §4.3, `terrain/cover.ts`): bare rock where it's steep,
//  snow high up, wet ground at the waterline.
//  - Each rises from none to whole between its numbers, and not elsewhere.
//  - On a generated world of each grid: snow lies on mountains, or a peak's shoulder beside one, more towards the
//    poles; rock on mountains' flanks and the steepest hills, and on the foot of a mountain or a hill where it reaches
//    into a neighbour, but nowhere else; wet ground on plenty of the land beside water, and nowhere else, never on a
//    swamp or a river inland, however low.
//  - On made-up worlds of each grid: a swamp inland is never wet; a sea beside a square never seen is all water to
//    its edge; on a coast, the share of water is the sea floor's sand's, weighed as the surfaces are.

import generateWorld from '@civ-clone/ui-map-3d/debug/generateWorld';
import topologyFor from '@civ-clone/ui-client/lib/topologyFor';
import groundLayoutFor from '@civ-clone/ui-map-3d/layouts';
import createRelief from '@civ-clone/ui-map-3d/terrain/relief';
import { buildChunk, chunkGrid } from '@civ-clone/ui-map-3d/terrain/chunks';
import {
  COVER,
  latitudeOf,
  rockness,
  snowiness,
  wetness,
} from '@civ-clone/ui-map-3d/terrain/cover';
import { SURFACES } from '@civ-clone/ui-models-builtin/terrain';
import { TopologyName } from '@civ-clone/ui-client/lib/topologyFor';

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

const round = (value: number): number => Math.round(value * 1000) / 1000;

expect(
  'rock: none on level ground or gently sloping, whole where it’s steep, more the steeper',
  [
    rockness(1),
    rockness(COVER.rockFrom),
    rockness(COVER.rockTo),
    rockness(0.5),
    rockness(0.93) > rockness(0.95),
  ],
  [0, 0, 1, 1, true]
);

expect(
  'snow: none below the snowline, whole a little above it, on level ground; the snowline lower towards the poles; none where it’s steep',
  [
    snowiness(COVER.snowAtEquator, 1, 0),
    round(snowiness(COVER.snowAtEquator + COVER.snowDeepens, 1, 0)),
    snowiness(COVER.snowAtPoles, 1, 1),
    round(snowiness(COVER.snowAtPoles + COVER.snowDeepens, 1, 1)),
    snowiness(COVER.snowAtEquator - 0.01, 1, 1) > 0,
    snowiness(1, COVER.snowSlips, 0),
  ],
  [0, 1, 0, 1, true, 0]
);

expect(
  'wet: none inland, whole at the water’s edge, none above the waterline',
  [
    wetness(0, 0),
    wetness(0, COVER.wetFrom),
    wetness(0, COVER.wetTo),
    wetness(-0.01, 1),
    wetness(COVER.wetUpTo, 1),
  ],
  [0, 0, 1, 1, 0]
);

expect(
  'latitude: 0 at the equator, 1 at the poles, the same a period on, above or below, as every copy of the world is',
  [
    latitudeOf(25, 50),
    latitudeOf(0, 50),
    latitudeOf(50, 50),
    [12.5, 37.5, 3, 47].every(
      (v) =>
        latitudeOf(v, 50) === latitudeOf(v + 50, 50) &&
        latitudeOf(v, 50) === latitudeOf(v - 50, 50) &&
        latitudeOf(v, 50) === latitudeOf(v + 150, 50)
    ),
    latitudeOf(-25, 50),
  ],
  [0, 1, 1, true, 0]
);

// Made-up worlds on each grid, 12 by 10:
//  - a swamp inland, as low as land goes, with no water anywhere: never wet;
//  - a sea beside a square never seen: all water, to its edge, every way round it;
//  - a coast of grassland and sea: how much of the ground's blended from water is how much of it is the sea floor's
//    sand, weighed as the surfaces are, at every point.
(['square', 'staggered-iso', 'hex-odd-r'] as TopologyName[]).forEach(
  (topologyId) => {
    const width = 12,
      height = 10,
      topology = topologyFor({ width, height, topologyId }),
      layout = groundLayoutFor({
        width,
        height,
        topologyId,
        wrapsY: topology.wrapsY(),
      }),
      reliefOf = (terrainAt: (x: number, y: number) => string) =>
        createRelief({
          layout,
          source: {
            width,
            height,
            wrapsY: topology.wrapsY(),
            terrainAt,
            waterAt: (x, y) => terrainAt(x, y) === 'Ocean',
            neighbours: (x, y) =>
              topology
                .directions()
                .map((direction) => topology.neighbour(x, y, direction))
                .filter(
                  (square): square is [number, number] => square !== null
                ),
          },
        }),
      swampy = reliefOf((x, y) =>
        x >= 4 && x <= 7 && y >= 3 && y <= 6 ? 'Swamp' : 'Grassland'
      ),
      frontier = reliefOf((x, y) => (x === 6 && y === 5 ? 'Unknown' : 'Ocean')),
      coast = reliefOf((x) => (x >= 6 ? 'Ocean' : 'Grassland')),
      sand = SURFACES.indexOf('sand'),
      [aroundU, aroundV] = layout.centre(6, 5),
      [farU, farV] = layout.centre(width - 1, height - 1),
      wetInland: number[] = [],
      notAllWater: string[] = [],
      unlikeSand: string[] = [];

    // Every point over the world, a fifth of a square apart, and round the square never seen.
    for (let u = 0; u <= farU + 0.5; u += 0.2) {
      for (let v = 0; v <= farV + 0.5; v += 0.2) {
        const swamp = swampy.sample(u, v),
          shore = coast.sample(u, v);

        if (wetness(swamp.height, swamp.shore) > 0) {
          wetInland.push(u, v);
        }

        if (Math.abs(shore.shore - (shore.surfaces[sand] ?? 0)) > 1e-6) {
          unlikeSand.push(`${u},${v}`);
        }
      }
    }

    for (let turn = 0; turn < 64; turn++) {
      [0.3, 0.5, 0.7, 0.9, 1.1].forEach((reach) => {
        const angle = (turn / 64) * Math.PI * 2,
          u = aroundU + Math.cos(angle) * reach,
          v = aroundV + Math.sin(angle) * reach,
          sample = frontier.sample(u, v);

        if (!sample.unseen && Math.abs(sample.shore - 1) > 1e-6) {
          notAllWater.push(`${u},${v}: ${sample.shore}`);
        }
      });
    }

    expect(
      `${topologyId}: a swamp inland, as low as land goes, is never wet; a sea beside a square never seen is all water to its edge; on a coast, how much of the ground's blended from water is how much is the sea floor's sand`,
      [wetInland.slice(0, 4), notAllWater.slice(0, 3), unlikeSand.slice(0, 3)],
      [[], [], []]
    );
  }
);

// A generated world of each grid, its land as drawn: every point of every chunk, with the square it's on.
(['square', 'staggered-iso', 'hex-odd-r'] as TopologyName[]).forEach(
  (topologyId) => {
    const width = 80,
      height = 50,
      { topology, layout, terrain } = generateWorld({
        topologyId,
        width,
        height,
        seed: 1,
        seen: 1,
      }),
      terrainAt = (x: number, y: number): string =>
        terrain[((y % height) + height) % height]?.[
          ((x % width) + width) % width
        ] ?? 'Unknown',
      neighbours = (x: number, y: number): [number, number][] =>
        topology
          .directions()
          .map((direction) => topology.neighbour(x, y, direction))
          .filter((square): square is [number, number] => square !== null),
      relief = createRelief({
        layout,
        source: {
          width,
          height,
          wrapsY: topology.wrapsY(),
          terrainAt,
          waterAt: (x, y) => terrainAt(x, y) === 'Ocean',
          neighbours,
        },
      }),
      grid = chunkGrid(layout, height),
      extent = grid.chunksV * grid.stepsV * grid.spacingV,
      // By terrain: how many points, and how many snowy, rocky and wet.
      counts = new Map<
        string,
        { points: number; snow: number; rock: number; wet: number }
      >(),
      wetFar: string[] = [],
      rockFar: string[] = [],
      snowFar: string[] = [];
    let coastPoints = 0,
      coastWet = 0,
      polarSnow = 0,
      polarMountains = 0,
      tropicalSnow = 0,
      tropicalMountains = 0;

    for (let j = 0; j < grid.chunksV; j++) {
      for (let i = 0; i < grid.chunksU; i++) {
        const chunk = buildChunk(grid, relief, i, j);

        for (let point = 0; point < chunk.shore.length; point++) {
          const u = chunk.u + (chunk.positions[point * 3] ?? 0),
            v = chunk.v + (chunk.positions[point * 3 + 2] ?? 0),
            up = chunk.positions[point * 3 + 1] ?? 0,
            upright = chunk.normals[point * 3 + 1] ?? 1,
            latitude = latitudeOf(v, extent),
            [x, y] = layout.tileAt(u, v),
            name = terrainAt(x, y),
            snow = snowiness(up, upright, latitude),
            rock = rockness(upright),
            wet = wetness(up, (chunk.shore[point] ?? 0) / 255),
            count = counts.get(name) ?? { points: 0, snow: 0, rock: 0, wet: 0 };

          count.points++;
          count.snow += snow > 0.5 ? 1 : 0;
          count.rock += rock > 0.5 ? 1 : 0;
          count.wet += wet > 0.5 ? 1 : 0;
          counts.set(name, count);

          if (name === 'Mountains') {
            if (latitude > 0.5) {
              polarMountains++;
              polarSnow += snow > 0.5 ? 1 : 0;
            } else {
              tropicalMountains++;
              tropicalSnow += snow > 0.5 ? 1 : 0;
            }
          }

          // Rock only on mountains or hills, or a square beside one; snow only on mountains, or beside one, where a
          //  peak's shoulder reaches.
          const square = [
            ((x % width) + width) % width,
            ((y % height) + height) % height,
          ] as [number, number];

          if (
            rock > 0 &&
            ![square, ...neighbours(...square)].some(([nx, ny]) =>
              ['Mountains', 'Hills'].includes(terrainAt(nx, ny))
            )
          ) {
            rockFar.push(`${name} at ${u},${v}`);
          }

          if (
            snow > 0 &&
            ![square, ...neighbours(...square)].some(
              ([nx, ny]) => terrainAt(nx, ny) === 'Mountains'
            )
          ) {
            snowFar.push(`${name} at ${u},${v}`);
          }

          // Wet only on water, or on a square beside it; and how much of the land beside it is.
          const coast =
            name !== 'Ocean' &&
            neighbours(...square).some(
              ([nx, ny]) => terrainAt(nx, ny) === 'Ocean'
            );

          if (wet > 0 && name !== 'Ocean' && !coast) {
            wetFar.push(`${name} at ${u},${v}`);
          }

          if (coast) {
            coastPoints++;
            coastWet += wet > 0.5 ? 1 : 0;
          }
        }
      }
    }

    const share = (name: string, of: 'snow' | 'rock' | 'wet'): number => {
      const count = counts.get(name);

      return count === undefined ? 0 : count[of] / count.points;
    };

    expect(
      `${topologyId}: snow lies on mountains, or a peak's shoulder beside one, more of them towards the poles; rock on mountains' flanks, a little on hills, and nowhere but on them or the foot of one reaching into a neighbour; wet ground on plenty of the land beside water, and nowhere else, never on a swamp or a river inland`,
      [
        snowFar.slice(0, 3),
        share('Mountains', 'snow') > 0,
        polarMountains === 0 ||
          tropicalMountains === 0 ||
          polarSnow / polarMountains > tropicalSnow / tropicalMountains,
        share('Mountains', 'rock') > 0.05,
        share('Hills', 'rock') < share('Mountains', 'rock'),
        rockFar.slice(0, 3),
        // About 4 to 6 in a hundred, on worlds of every seed tried.
        coastWet / coastPoints > 0.02,
        wetFar.slice(0, 3),
      ],
      [[], true, true, true, true, [], true, []]
    );
  }
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL cover: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS cover (${checks} checks)\n`);
