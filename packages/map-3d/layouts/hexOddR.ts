// The hexagonal grid laid on the ground (docs/3d-renderer.md §3): the pointy-topped hexes of `HexOddRTopology`, every
//  odd row shifted half a hex east, regular and 1 across their flats. The 2D map draws the same hexes squashed to a
//  whole number of pixels, its corners a quarter of the way down each side, as a regular hex's are.
//
// A hex's corners are `SIZE` from its middle (`1/√3`, for 1 across the flats), and rows are one and a half of that
// apart. A point's hex is found as hex grids find it: in axial co-ordinates, rounded as a cube's, then shifted back to
// the topology's odd rows.

import { GroundLayout, GroundPoint, GroundWorld } from './GroundLayout';

const SIZE = 1 / Math.sqrt(3),
  ROW = 1.5 * SIZE;

// The nearest hex to fractional axial co-ordinates: each of the cube's three rounded, and the one that moved furthest
//  put back from the other two, so they still sum to 0.
const roundAxial = (q: number, r: number): [number, number] => {
  const s = -q - r;
  let roundedQ = Math.round(q),
    roundedR = Math.round(r);
  const roundedS = Math.round(s),
    movedQ = Math.abs(roundedQ - q),
    movedR = Math.abs(roundedR - r),
    movedS = Math.abs(roundedS - s);

  if (movedQ > movedR && movedQ > movedS) {
    roundedQ = -roundedR - roundedS;
  } else if (movedR > movedS) {
    roundedR = -roundedQ - roundedS;
  }

  return [roundedQ, roundedR];
};

export const hexOddRLayout = ({
  height,
  width,
  wrapsY,
}: GroundWorld): GroundLayout => {
  const centre = (x: number, y: number): GroundPoint => [
    x + 0.5 + (y & 1) * 0.5,
    SIZE + y * ROW,
  ];

  return {
    topologyId: 'hex-odd-r',
    centre,
    outline: (x: number, y: number): readonly GroundPoint[] => {
      const [u, v] = centre(x, y);

      return [
        [u, v - SIZE],
        [u + 0.5, v - SIZE / 2],
        [u + 0.5, v + SIZE / 2],
        [u, v + SIZE],
        [u - 0.5, v + SIZE / 2],
        [u - 0.5, v - SIZE / 2],
      ];
    },
    tileAt: (u: number, v: number): [number, number] => {
      // From the middle of the hex at (0, 0), in axial co-ordinates: `r` is the row, and `q` the column less half the
      //  rows above.
      const across = u - 0.5,
        down = v - SIZE,
        [q, r] = roundAxial(
          across - (down * Math.sqrt(3)) / 3,
          (down * 2 * Math.sqrt(3)) / 3
        );

      return [q + (r - (r & 1)) / 2, r];
    },
    // A world that wraps over the poles has an even number of rows, so row 0 follows an odd row, as the topology needs.
    period: () => ({ u: width, v: wrapsY ? height * ROW : null }),
  };
};

export default hexOddRLayout;
