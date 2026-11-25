// The sea's surface on the 3D map (docs/3d-renderer-plan.md 1.4), without a GPU to draw it:
//  - the land's heights it reads start at sea level, and each chunk built writes its points' heights at their places on
//    the ground, near enough for half floats; points past the ground's edge are left out;
//  - it follows the camera, as wide as it sees, with the sun's direction for its glint;
//  - it, and the cloud, know how far the ground runs down and whether it wraps over the poles, and are drawn only on
//    the ground on a world that doesn't.
//  - a square seen once its chunk's been laid has its water at once and clears its cloud over the time given; laid
//    for the first time seen, it has none; only the points clearing are sent, once the whole texture has been.

import { Color, Vector3 } from 'three';
import Water, { Clouds, WHOLE_FROM } from '@civ-clone/ui-map-3d/water';
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
      surfacesA: new Uint8Array(36),
      surfacesB: new Uint8Array(36),
      shore: new Uint8Array(9),
      river: null,
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

// The poles: how far down the ground runs (8 rows half a unit apart), and whether it wraps there.
const wrapping = new Water({ ...ground, wrapsV: true }, new Color('#9fb3c4')),
  clouds = new Clouds(water.texture(), ground),
  wrappingClouds = new Clouds(wrapping.texture(), { ...ground, wrapsV: true }),
  uniformsOf = (material: { uniforms: { [name: string]: { value: any } } }) => [
    material.uniforms['extentV']?.value ?? material.uniforms['extent']?.value.y,
    material.uniforms['wrapsV']!.value,
  ],
  // Each shader leaves out what's past the poles of a world that doesn't wrap over them.
  stopsAtThePoles = (shader: string): boolean =>
    /if \(!wrapsV && \(vWorld\.z < 0\.0 \|\| vWorld\.z > extent(V|\.y)\)\) \{\s*discard;/.test(
      shader
    );

expect(
  'the sea and the cloud know how far the ground runs down and whether it wraps there, and are drawn only on it where it doesn’t',
  [
    uniformsOf(water.mesh.material),
    uniformsOf(wrapping.mesh.material),
    uniformsOf(clouds.mesh.material),
    uniformsOf(wrappingClouds.mesh.material),
    stopsAtThePoles(water.mesh.material.fragmentShader),
    stopsAtThePoles(clouds.mesh.material.fragmentShader),
  ],
  [[4, false], [4, true], [4, false], [4, true], true, true]
);

// Stopped at the poles, a world that wraps over them draws neither past them; one that doesn't, never does.
const stops = [wrapping, wrappingClouds, water].map((each) => {
  each.pastThePoles(false);

  const stopped = each.mesh.material.uniforms['wrapsV']!.value;

  each.pastThePoles(true);

  return [stopped, each.mesh.material.uniforms['wrapsV']!.value];
});

expect(
  'stopped at the poles, the sea and the cloud of a world that wraps over them stop there too; free again, they go on',
  stops,
  [
    [false, true],
    [false, true],
    [false, false],
  ]
);

// A square seen (§4.5): where its chunk was laid while it was never seen, its water's there at once and its cloud
//  clears over the time given, from the first time it's cleared; where a chunk's laid over it for the first time, seen,
//  it has no cloud at all; with no time to clear over (reduced motion), at once.
const clearing = new Water(ground, new Color('#9fb3c4')),
  // A chunk at (`u`, `v`) under the sea, each point never seen as `unseen` says.
  laidAt = (u: number, v: number, unseen: number): ChunkMesh => ({
    ...chunk(u, v, () => -0.1),
    unseen: new Float32Array(9).fill(unseen),
  }),
  round = (n: number): number => Math.round(n * 100) / 100;

clearing.setChunk(laidAt(0, 0, 1));

const neverSeen = [clearing.unseen(1, 1), clearing.cloud(1, 1)];

clearing.setChunk(laidAt(0, 0, 0));

const seenNow = [clearing.unseen(1, 1), clearing.cloud(1, 1)],
  begun = [clearing.clear(10, 0.5), clearing.cloud(1, 1)],
  halfway = [clearing.clear(10.25, 0.5), round(clearing.cloud(1, 1))],
  cleared = [
    clearing.clear(10.5, 0.5),
    clearing.cloud(1, 1),
    clearing.clear(11, 0.5),
  ];

expect(
  'a square seen once its chunk’s been laid has its water at once, and its cloud clears over the time given, from when it’s first cleared',
  [neverSeen, seenNow, begun, halfway, cleared],
  [
    [true, 1],
    [false, 1],
    [true, 1],
    [true, 0.5],
    [false, 0, false],
  ]
);

// Its corner at column 4: laid for the first time, seen.
clearing.setChunk(laidAt(2, 0, 0));

const firstLaid = [clearing.cloud(5, 1), clearing.clear(12, 0.5)];

// Row 4.
clearing.setChunk(laidAt(0, 2, 1));
clearing.setChunk(laidAt(0, 2, 0));

const atOnce = [clearing.clear(13, 0), clearing.cloud(1, 5)];

// Column 8: seen, then laid again never seen before it's cleared (as a chunk laid again says it), which stops it.
clearing.setChunk(laidAt(4, 0, 1));
clearing.setChunk(laidAt(4, 0, 0));
clearing.setChunk(laidAt(4, 0, 1));

const stopped = [clearing.cloud(9, 1), clearing.clear(14, 0.5)];

// Row 4, column 4: halfway cleared when it's laid again, seen, as the land changes: it carries on from where it was.
clearing.setChunk(laidAt(2, 2, 1));
clearing.setChunk(laidAt(2, 2, 0));
clearing.clear(20, 0.5);
clearing.clear(20.25, 0.5);
clearing.setChunk(laidAt(2, 2, 0));

const carriedOn = [
  round(clearing.cloud(5, 5)),
  clearing.clear(20.5, 0.5),
  clearing.cloud(5, 5),
];

expect(
  'a chunk laid for the first time over a square seen has no cloud there; with no time to clear over, it clears at once; laid again never seen, it stops clearing; laid again seen, it carries on',
  [firstLaid, atOnce, stopped, carriedOn],
  [
    [0, false],
    [false, 0],
    [1, false],
    [0.5, false, 0],
  ]
);

// What's sent: the whole texture once a chunk's laid; once it has been (as the renderer says), only the points that
//  are clearing, each its four channels. Column 12, rows 0 to 2.
const texture = clearing.texture();

clearing.setChunk(laidAt(6, 0, 1));
clearing.setChunk(laidAt(6, 0, 0));
clearing.clear(30, 0.5);

const whole = texture.updateRanges.length;

texture.onUpdate?.(texture);
clearing.clear(30.25, 0.5);

const points = texture.updateRanges.map(({ start, count }) => [
  (start / 4) % ground.columns,
  Math.floor(start / 4 / ground.columns),
  count,
]);

// Not sent before the next (the context lost meanwhile, and made again empty): the whole is sent instead.
clearing.clear(30.3, 0.5);

const neverSent = texture.updateRanges.length;

texture.onUpdate?.(texture);
clearing.clear(30.35, 0.5);

const sentAgain = texture.updateRanges.length;

// More than `WHOLE_FROM` points clearing at once, on a bigger ground: the whole is sent.
const across = Math.ceil(Math.sqrt(WHOLE_FROM + 1)),
  wide = { ...ground, columns: across, rows: across },
  much = new Water(wide, new Color('#9fb3c4')),
  muchTexture = much.texture(),
  everywhere = (unseen: number): ChunkMesh => {
    const positions = new Float32Array(across * across * 3);

    for (let b = 0; b < across; b++) {
      for (let a = 0; a < across; a++) {
        positions.set([a * 0.5, -0.1, b * 0.5], (b * across + a) * 3);
      }
    }

    return {
      ...chunk(0, 0, () => 0),
      positions,
      unseen: new Float32Array(across * across).fill(unseen),
    };
  };

much.setChunk(everywhere(1));
much.setChunk(everywhere(0));
muchTexture.onUpdate?.(muchTexture);
much.clear(40, 0.5);

const muchSent = [muchTexture.updateRanges.length, much.cloud(1, 1)];

much.dispose();

expect(
  'the whole texture is sent once a chunk’s laid; after that, only each point clearing, its four channels, unless what was asked last time was never sent, or more than WHOLE_FROM are clearing',
  [whole, points, neverSent, sentAgain, muchSent],
  [
    0,
    [0, 1, 2].flatMap((row) => [12, 13, 14].map((column) => [column, row, 4])),
    0,
    9,
    [0, 1],
  ]
);
expect(
  'the cloud reads how much cloud’s over each point as it clears; the sea, whether it’s never been seen',
  [
    /texture2D\(ground, \(point \/ cell \+ 0\.5\) \/ size\)\.b;/.test(
      clouds.mesh.material.fragmentShader
    ),
    /here\.g > 0\.01/.test(water.mesh.material.fragmentShader),
  ],
  [true, true]
);

[wrapping, clouds, wrappingClouds, clearing].forEach((each) => each.dispose());
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
