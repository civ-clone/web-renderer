// The square under the pointer on the 3D map (docs/3d-renderer.md §4.6, plan 3.5), on every grid: a band inside its
//  outline, as wide all round, covering its outline less the square inset by its width; brightest at the outline,
//  fading to none at its inner edge; its lift over the land as its mesh draws it, and over the sea's surface at sea. Its
//  points are 32-bit, as three.js takes them, so they're compared to a hundred-thousandth.

import groundLayoutFor from '@civ-clone/ui-map-3d/layouts';
import { HIGHLIGHT, highlightOf } from '@civ-clone/ui-map-3d/highlight';
import { Ground } from '@civ-clone/ui-map-3d/terrain/ribbons';

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

// Smoothly from 0 to 1 as `t` goes from 0 to 1.
const smoothly = (t: number): number => t * t * (3 - 2 * t);

// Twice a polygon's area, either way round.
const area = (points: readonly Point[]): number =>
  Math.abs(
    points.reduce((sum, [u, v], at) => {
      const [nu, nv] = points[(at + 1) % points.length]!;

      return sum + u * nv - nu * v;
    }, 0)
  ) / 2;

(['square', 'staggered-iso', 'hex-odd-r'] as const).forEach((topologyId) => {
  const layout = groundLayoutFor({
      width: 12,
      height: 10,
      topologyId,
      wrapsY: false,
    }),
    [x, y] = [5, 4],
    outline = layout.outline(x, y),
    [cu, cv] = layout.centre(x, y),
    // Land sloping east and south, with a crease down the square's middle, at its mesh's points.
    relief = (u: number, v: number) =>
      0.2 + 0.05 * u + 0.03 * v + 0.1 * Math.abs(u - cu),
    // As its mesh draws it, as the land gives it (`Land#surface`): flat triangles between its points, each cell split
    //  from its top left to its bottom right.
    drawn = (u: number, v: number): number => {
      const a = Math.floor(u / 0.125),
        b = Math.floor(v / 0.125),
        fu = u / 0.125 - a,
        fv = v / 0.125 - b,
        at = (pa: number, pb: number) => relief(pa * 0.125, pb * 0.125);

      return fu + fv <= 1
        ? at(a, b) +
            (at(a + 1, b) - at(a, b)) * fu +
            (at(a, b + 1) - at(a, b)) * fv
        : at(a + 1, b + 1) +
            (at(a, b + 1) - at(a + 1, b + 1)) * (1 - fu) +
            (at(a + 1, b) - at(a + 1, b + 1)) * (1 - fv);
    },
    ground: Ground = { at: drawn, spacingU: 0.125, spacingV: 0.125 },
    mesh = highlightOf(layout, ground, x, y),
    count = mesh.positions.length / 3,
    points = Array.from(
      { length: count },
      (_, at): [number, number, number] => [
        mesh.positions[at * 3]!,
        mesh.positions[at * 3 + 1]!,
        mesh.positions[at * 3 + 2]!,
      ]
    ),
    fromOutline = ([u, , v]: [number, number, number]) =>
      Math.min(
        ...outline.map((corner, at) =>
          offSegment([u, v], corner, outline[(at + 1) % outline.length]!)
        )
      ),
    // Inside the outline, or on it: on the inner side of each of its sides.
    inside = ([u, , v]: [number, number, number]) =>
      outline.every(([au, av], at) => {
        const [bu, bv] = outline[(at + 1) % outline.length]!,
          side = (bu - au) * (v - av) - (bv - av) * (u - au),
          middle = (bu - au) * (cv - av) - (bv - av) * (cu - au);

        return side * Math.sign(middle) >= -1e-6;
      }),
    // The band's area, from its triangles, seen from above.
    covered = Array.from({ length: mesh.indices.length / 3 }, (_, at) =>
      area(
        [0, 1, 2].map((k): Point => {
          const [u, , v] = points[mesh.indices[at * 3 + k]!]!;

          return [u, v];
        })
      )
    ).reduce((sum, n) => sum + n, 0),
    // The square less the square inset by the band's width: the outline's area, less the inner one's, whose sides
    //  are each `width` in, and so whose corners are where they meet.
    inset = outline.map(([u, v], at): Point => {
      const inward = (from: number): Point => {
          const [au, av] = outline[from]!,
            [bu, bv] = outline[(from + 1) % outline.length]!,
            length = Math.hypot(bu - au, bv - av),
            [nu, nv] = [-(bv - av) / length, (bu - au) / length],
            toward = nu * (cu - au) + nv * (cv - av);

          return toward >= 0 ? [nu, nv] : [-nu, -nv];
        },
        [pu, pv] = inward((at + outline.length - 1) % outline.length),
        [nu, nv] = inward(at),
        k = HIGHLIGHT.width / (1 + pu * nu + pv * nv);

      return [u + (pu + nu) * k, v + (pv + nv) * k];
    }),
    expected = area(outline) - area(inset),
    // At sea: the land under the sea's level everywhere.
    sunk = highlightOf(
      layout,
      { ...ground, at: (u, v) => -0.3 - 0.01 * u - 0.01 * v },
      x,
      y
    );

  expect(
    `${topologyId}: the square under the pointer lit: a band inside its outline, as wide all round, as bright as it says at the outline, fading to none at its inner edge; its lift over the land as drawn; at sea, its lift over the sea's surface`,
    [
      count > 0,
      points.every(inside),
      points.every((point) => fromOutline(point) <= HIGHLIGHT.width + 1e-5),
      Math.abs(covered - expected) < 1e-6,
      points.every((point, at) => {
        const away = fromOutline(point),
          bright = mesh.brightness[at]!;

        return (
          bright >= 0 &&
          bright <= HIGHLIGHT.edge + 1e-6 &&
          (away > 1e-9 || Math.abs(bright - HIGHLIGHT.edge) < 1e-6) &&
          (away < HIGHLIGHT.width - 1e-9 || bright < 1e-6)
        );
      }),
      // As bright as it says at each point, smoothly less the further in, with points between its edges, so it fades
      //  as it says between them too.
      points.every(
        (point, at) =>
          Math.abs(
            mesh.brightness[at]! -
              HIGHLIGHT.edge *
                (1 -
                  smoothly(Math.min(1, fromOutline(point) / HIGHLIGHT.width)))
          ) < 1e-5
      ),
      // Between them even on land too coarse to cut it, so it has rings of its own.
      ((coarse) =>
        Array.from(
          { length: coarse.positions.length / 3 },
          (_, at): [number, number, number] => [
            coarse.positions[at * 3]!,
            0,
            coarse.positions[at * 3 + 2]!,
          ]
        ).some((point) => {
          const into = fromOutline(point) / HIGHLIGHT.width;

          return into > 0.2 && into < 0.8;
        }))(
        highlightOf(
          layout,
          { at: () => 0.1, spacingU: 1e6, spacingV: 1e6 },
          x,
          y
        )
      ),
      // More the nearer the outline.
      points.every((a, i) =>
        points.every(
          (b, j) =>
            fromOutline(a) >= fromOutline(b) - 1e-9 ||
            mesh.brightness[i]! >= mesh.brightness[j]! - 1e-6
        )
      ),
      points.every(
        ([u, h, v]) => Math.abs(h - (drawn(u, v) + HIGHLIGHT.lift)) < 1e-5
      ),
      Array.from(
        { length: sunk.positions.length / 3 },
        (_, at) => sunk.positions[at * 3 + 1]
      ).every((h) => h === Math.fround(HIGHLIGHT.lift)),
    ],
    [true, true, true, true, true, true, true, true, true, true]
  );
});

if (failures.length > 0) {
  process.stderr.write(
    `FAIL highlight: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS highlight (${checks} checks)\n`);
