// The staggered isometric grid laid on the ground (docs/3d-renderer.md §3, D4): the diamonds of `StaggeredIsoTopology`,
//  every odd row shifted half a diamond east, laid flat as squares of side 1 turned through 45°, so a square has the
//  same area as on the square grid. The 2D map draws the same diamonds foreshortened, twice as wide as they're tall.
//
// In half-diagonal steps, a diamond's middle is at (`d + 1`, `y + 1`), `d = 2x + (y & 1)` being its column counted in
//  half diagonals, as the topology and the 2D projection count it. Turned through 45° (`a = (d + y) / 2`,
//  `b = (y - d) / 2`), the diamonds are the square grid, whole at every middle: so a point's square is found by
//  rounding its `a` and `b`.

import { GroundLayout, GroundPoint, GroundWorld } from './GroundLayout';

// Half a diamond's diagonal, for a diamond of side 1.
const HALF = Math.SQRT2 / 2;

export const staggeredIsoLayout = ({
  height,
  width,
  wrapsY,
}: GroundWorld): GroundLayout => {
  const centre = (x: number, y: number): GroundPoint => [
    (2 * x + (y & 1) + 1) * HALF,
    (y + 1) * HALF,
  ];

  return {
    topologyId: 'staggered-iso',
    centre,
    outline: (x: number, y: number): readonly GroundPoint[] => {
      const [u, v] = centre(x, y);

      return [
        [u, v - HALF],
        [u + HALF, v],
        [u, v + HALF],
        [u - HALF, v],
      ];
    },
    tileAt: (u: number, v: number): [number, number] => {
      const across = u / HALF,
        down = v / HALF,
        a = Math.floor((across + down) / 2 - 1 + 0.5),
        b = Math.floor((down - across) / 2 + 0.5),
        row = a + b;

      // `a - b` has the row's parity, so halving it floors to the column whichever row it is, negative ones included.
      return [Math.floor((a - b) / 2), row];
    },
    // A column is a whole diagonal along, and a row half a diagonal down: a world that wraps over the poles has an even
    //  number of rows, so row 0 follows an odd row, as the topology needs.
    period: () => ({
      u: width * 2 * HALF,
      v: wrapsY ? height * HALF : null,
    }),
  };
};

export default staggeredIsoLayout;
