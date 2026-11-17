import {
  SquareDirection,
  SquareEdgeDirection,
} from '@civ-clone/core-world/SquareTopology';
import {
  StaggeredIsoDirection,
  StaggeredIsoEdgeDirection,
} from '@civ-clone/core-world/StaggeredIsoTopology';
import { HexDirection } from '@civ-clone/core-world/HexOddRTopology';

// The world's grid as the game's data names it (#88, #89, #825): `client`'s `topologyFor` builds the grid itself.
//  The direction types are the union of every grid the client can draw. The square and isometric grids name their
//  eight directions alike, but not which are edges: square's edges are `n e s w`, isometric's are `ne se sw nw`. The hexagonal grid has six, `ne e se sw w nw`, and every
//  one of them is an edge.

/** Which way a neighbour is. */
export type Direction = SquareDirection | StaggeredIsoDirection | HexDirection;

/** Which way a neighbour that shares an edge is. */
export type EdgeDirection =
  | SquareEdgeDirection
  | StaggeredIsoEdgeDirection
  | HexDirection;

/** The grids a world can be on, as the engine names them. Saves record them, so they are never renamed. */
export type { TopologyId } from '@civ-clone/core-world/topologies';
