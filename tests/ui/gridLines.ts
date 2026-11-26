// The grid's lines on the 3D map (docs/3d-renderer.md §4.6, plan 3.5), on every grid: how far each point on the ground
//  is from the nearest edge of the square it's on, as each grid's layout lays its squares, everywhere, at every copy of
//  the world and either side of its seams; and the lines' material, its sums put into three.js's own shaders.

import { ShaderLib } from 'three';
import groundLayoutFor from '@civ-clone/ui-map-3d/layouts';
import {
  GRID,
  edgeDistance,
  gridGlsl,
  gridMaterial,
} from '@civ-clone/ui-map-3d/grid';
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

type Point = readonly [number, number];

// How far a point is from the segment from `a` to `b`.
const offSegment = (
  [u, v]: Point,
  [au, av]: Point,
  [bu, bv]: Point
): number => {
  const du = bu - au,
    dv = bv - av,
    t = Math.max(
      0,
      Math.min(1, ((u - au) * du + (v - av) * dv) / (du * du + dv * dv))
    );

  return Math.hypot(u - au - du * t, v - av - dv * t);
};

const ids: TopologyId[] = ['square', 'staggered-iso', 'hex-odd-r'];

ids.forEach((topologyId) => {
  const layout = groundLayoutFor({
    width: 12,
    height: 10,
    topologyId,
    wrapsY: true,
  });

  // Everywhere: a scatter of points over the world, its copies either side, and past both its poles, so its seams and
  //  odd rows are among them. Each as far from the nearest edge of the square it's on as that square's outline says.
  let worst = 0,
    looked = 0;

  for (let n = 0; n < 4000; n++) {
    const u = -14 + ((n * 0.6180339887) % 1) * 40,
      v = -12 + ((n * 0.7548776662) % 1) * 34,
      [x, y] = layout.tileAt(u, v),
      corners = layout.outline(x, y),
      nearest = Math.min(
        ...corners.map((corner, at) =>
          offSegment([u, v], corner, corners[(at + 1) % corners.length]!)
        )
      );

    worst = Math.max(worst, Math.abs(edgeDistance(topologyId, u, v) - nearest));
    looked++;
  }

  // Along every edge of a few squares, on it and a little in from it: none on it, and that far in.
  let alongEdges = 0;

  [
    [0, 0],
    [5, 4],
    [6, 5],
    [11, 9],
  ].forEach(([x, y]) => {
    const corners = layout.outline(x!, y!),
      [cu, cv] = layout.centre(x!, y!);

    corners.forEach(([au, av], at) => {
      const [bu, bv] = corners[(at + 1) % corners.length]!,
        // In from the edge, square to it.
        length = Math.hypot(bu - au, bv - av),
        [nu, nv] = ((): Point => {
          const [pu, pv] = [-(bv - av) / length, (bu - au) / length];

          return pu * (cu - au) + pv * (cv - av) > 0 ? [pu, pv] : [-pu, -pv];
        })();

      [0.2, 0.5, 0.8].forEach((t) => {
        const [mu, mv] = [au + (bu - au) * t, av + (bv - av) * t];

        alongEdges = Math.max(
          alongEdges,
          edgeDistance(topologyId, mu, mv),
          Math.abs(
            edgeDistance(topologyId, mu + nu * 0.01, mv + nv * 0.01) - 0.01
          )
        );
      });
    });
  });

  expect(
    `${topologyId}: every point as far from the nearest edge as its square's outline says, at every copy of the world; none on an edge, and that far in from it; half a square at a middle`,
    [
      looked,
      worst < 1e-9,
      alongEdges < 1e-9,
      Math.round(edgeDistance(topologyId, ...layout.centre(5, 4)) * 1e9) / 1e9,
    ],
    [4000, true, true, 0.5]
  );

  // The material: its sums in three.js's own shaders, where they're put, its lift and lines; hidden as it comes, seen
  //  through, and pulled in front of what it lies on.
  const material = gridMaterial(topologyId),
    shader = {
      uniforms: {},
      vertexShader: ShaderLib.basic.vertexShader,
      fragmentShader: ShaderLib.basic.fragmentShader,
    };

  material.onBeforeCompile(shader as never, undefined as never);

  expect(
    `${topologyId}: the lines' material lifts the land, works out each point's edge, draws only near one and never where unseen; hidden as it comes, seen through`,
    [
      shader.vertexShader.includes(
        `transformed.y = max(transformed.y + ${GRID.lift}, ${GRID.lift});`
      ) && shader.vertexShader.includes('vUnseen = unseen;'),
      shader.fragmentShader.includes(gridGlsl(topologyId)) &&
        shader.fragmentShader.includes('float edge = gridEdge(vGround)') &&
        shader.fragmentShader.includes('step(0.5, vUnseen)') &&
        shader.fragmentShader.includes('diffuseColor.a *= line;'),
      material.visible,
      material.transparent,
      material.depthWrite,
      material.polygonOffsetFactor < 0,
      material.customProgramCacheKey(),
    ],
    [true, true, false, true, false, true, `grid-${topologyId}`]
  );

  material.dispose();
});

if (failures.length > 0) {
  process.stderr.write(
    `FAIL gridLines: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS gridLines (${checks} checks)\n`);
