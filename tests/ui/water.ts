// The sea's surface on the 3D map (docs/3d-renderer-plan.md 1.4), without a GPU to draw it:
//  - the land's heights it reads start at sea level, and each chunk built writes its points' heights at their places on
//    the ground, near enough for half floats; points past the ground's edge are left out;
//  - it follows the camera, as wide as it sees, with the sun's direction for its glint.

import { Color, Vector3 } from 'three';
import Water from '@civ-clone/ui-map-3d/water';
import { ChunkMesh } from '@civ-clone/ui-map-3d/terrain/chunks';

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

const ground = {
    columns: 16,
    rows: 8,
    spacingU: 0.5,
    spacingV: 0.5,
    wrapsV: false,
  },
  water = new Water(ground, new Color('#9fb3c4')),
  // A chunk of 3 by 3 points, half a unit apart, whose corner is at (`u`, `v`), each point as high as `heightOf` says.
  chunk = (
    u: number,
    v: number,
    heightOf: (a: number, b: number) => number
  ): ChunkMesh => {
    const positions = new Float32Array(9 * 3);

    for (let b = 0; b < 3; b++) {
      for (let a = 0; a < 3; a++) {
        positions.set([a * 0.5, heightOf(a, b), b * 0.5], (b * 3 + a) * 3);
      }
    }

    return {
      u,
      v,
      positions,
      normals: new Float32Array(27),
      colours: new Float32Array(27),
      // The middle point alone on a square never seen.
      unseen: new Float32Array(9)
        .fill(0)
        .map((_, point) => (point === 4 ? 1 : 0)),
      indices: new Uint32Array(0),
    };
  },
  near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-3;

expect(
  'the land’s heights start at sea level',
  [water.height(0, 0), water.height(15, 7)],
  [0, 0]
);

// Its corner at column 4, row 2.
water.setChunk(chunk(2, 1, (a, b) => -0.15 + a * 0.1 + b * 0.05));

expect(
  'a chunk’s points are written at their places on the ground, near enough for half floats',
  [0, 1, 2].flatMap((b) =>
    [0, 1, 2].map((a) =>
      near(water.height(4 + a, 2 + b), -0.15 + a * 0.1 + b * 0.05)
    )
  ),
  [true, true, true, true, true, true, true, true, true]
);
expect(
  'with which of them are on squares never seen, for the cloud; nothing is seen before it’s built',
  [water.unseen(5, 3), water.unseen(4, 2), water.unseen(0, 0)],
  [true, false, true]
);
expect(
  'and nothing round it',
  [
    water.height(3, 2),
    water.height(7, 2),
    water.height(4, 1),
    water.height(4, 5),
  ],
  [0, 0, 0, 0]
);

// Over the right edge and the bottom: only the points on the ground are written.
water.setChunk(chunk(7.5, 3.5, () => 0.25));
// Over the right edge in the middle rows: the points past it aren't written into the next row's start.
water.setChunk(chunk(7.5, 1.5, () => 0.35));

expect(
  'points past the ground’s edges are left out, and none wraps into the next row',
  [
    near(water.height(15, 7), 0.25),
    water.height(14, 7),
    water.height(15, 6),
    near(water.height(15, 4), 0.35),
    water.height(0, 4),
    water.height(1, 5),
  ],
  [true, 0, 0, true, 0, 0]
);

water.follow(10, 20, 300, new Vector3(3, 4, 0));

expect(
  'it follows the camera, as wide as it sees, flat on the ground',
  [
    water.mesh.position.toArray(),
    water.mesh.scale.toArray(),
    Math.round(water.mesh.rotation.x * 1000),
    water.mesh.material.uniforms['sunDirection']!.value.toArray().map(
      (value: number) => Math.round(value * 1000) / 1000
    ),
  ],
  [[10, 0, 20], [300, 300, 1], Math.round((-Math.PI / 2) * 1000), [0.6, 0.8, 0]]
);

water.dispose();

if (failures.length > 0) {
  process.stderr.write(
    `FAIL water: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS water (${checks} checks)\n`);
