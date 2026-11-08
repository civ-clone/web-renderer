import {
  SquareDirection,
  SquareEdgeDirection,
} from '@civ-clone/core-world/SquareTopology';

// The world's grid as the game's data names it (#88, #89, #825): `client`'s `topologyFor` builds the grid itself.
//  Only square worlds can be started or loaded for now (see `supportedTopologies`), so the direction types are still
//  square's: they widen to every grid's when another grid can be drawn.

/** Which way a neighbour is. */
export type Direction = SquareDirection;

/** Which way a neighbour that shares an edge is. */
export type EdgeDirection = SquareEdgeDirection;

/** The grids a world can be on, as the engine names them. Saves record them, so they are never renamed. */
export type { TopologyId } from '@civ-clone/core-world/topologies';
