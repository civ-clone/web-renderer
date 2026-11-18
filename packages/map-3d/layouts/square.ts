// The square grid laid on the ground (docs/3d-renderer.md §3): squares of side 1, the square at (`x`, `y`) from
//  (`x`, `y`) to (`x + 1`, `y + 1`).

import { GroundLayout, GroundPoint, GroundWorld } from './GroundLayout';

export const squareLayout = ({
  height,
  width,
  wrapsY,
}: GroundWorld): GroundLayout => ({
  topologyId: 'square',
  centre: (x: number, y: number): GroundPoint => [x + 0.5, y + 0.5],
  outline: (x: number, y: number): readonly GroundPoint[] => [
    [x, y],
    [x + 1, y],
    [x + 1, y + 1],
    [x, y + 1],
  ],
  tileAt: (u: number, v: number): [number, number] => [
    Math.floor(u),
    Math.floor(v),
  ],
  period: () => ({ u: width, v: wrapsY ? height : null }),
});

export default squareLayout;
