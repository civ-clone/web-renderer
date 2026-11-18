// Where the world's squares lie on the 3D map's ground (docs/3d-renderer.md §3): one layout for each grid, so the land,
//  the camera and everything on the ground are built the same way whatever the grid (D4). Pure maths: no three.js, so
//  the city screen and the tests can use them.
//
// The ground is flat, in world units, `u` across (east) and `v` down (south), one unit about a square's width. Height
//  isn't the layout's: the terrain gives it, for any point (§4). Nor are neighbours: they're the topology's
//  (`topologyFor`), which the layouts agree with, as the tests check.
//
// Squares are named by the world's own co-ordinates, not wrapped: `centre(x + width, y)` is the next copy of the world
//  along, `period().u` further across, and `tileAt` gives back co-ordinates past the world's edges for points there.
//  The caller wraps them, as `World.get` does.

import { TopologyId } from '@civ-clone/ui-protocol/topology';

/** A point on the ground. */
export type GroundPoint = readonly [u: number, v: number];

export interface GroundLayout {
  /** The grid this lays out. */
  readonly topologyId: TopologyId;
  /** The middle of the square at (`x`, `y`). */
  centre(x: number, y: number): GroundPoint;
  /**
   * Its corners, clockwise as seen from above (with `v` growing south), in the order of the 2D map's outline for the
   *  grid: from its top point on the isometric and hexagonal grids, from its north-west corner on the square grid.
   */
  outline(x: number, y: number): readonly GroundPoint[];
  /**
   * The square a point is in: the one whose outline it's inside. A point exactly on an edge or a corner is in one of the
   *  squares that share it, which one left to the rounding.
   */
  tileAt(u: number, v: number): [x: number, y: number];
  /** How far apart the world's copies are: across always, and down on a world that wraps over the poles. */
  period(): { u: number; v: number | null };
}

/**
 * What a layout needs of the world: its size, its grid, and whether it wraps over the poles (`Topology#wrapsY`). The
 *  staggered and hexagonal grids wrap over the poles only with an even number of rows, as their topologies say.
 */
export type GroundWorld = {
  height: number;
  topologyId: TopologyId;
  width: number;
  wrapsY: boolean;
};

export default GroundLayout;
