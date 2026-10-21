import SquareTopology, {
  SquareDirection,
  SquareEdgeDirection,
} from '@civ-clone/core-world/SquareTopology';
import { ITopology } from '@civ-clone/core-world/Topology';
import { createTopology } from '@civ-clone/core-world/topologies';

// The shape of the world's grid, for the UI: which tile neighbours which, and which ways there are (#88). It is the
//  engine's own implementation, and the only thing the UI takes from the engine: `createTopology` and the topologies
//  it builds import nothing but each other, so they bring no rules or state with them.
//
// The world says which grid it is on (#89), and a world that does not (one sent by an older engine, or a save made
//  before the grid was recorded) is square. Only square worlds can be started or loaded for now (see
//  `supportedTopologies`), so the direction types below are still square's: they widen to every grid's when another
//  grid can be drawn.

/** Which way a neighbour is. */
export type Direction = SquareDirection;

/** Which way a neighbour that shares an edge is. */
export type EdgeDirection = SquareEdgeDirection;

export type Topology = ITopology<Direction>;

/** The grids a world can be on, as the engine names them. Saves record them, so they are never renamed. */
export type { TopologyId } from '@civ-clone/core-world/topologies';

/** The grids there are, for what the UI keeps per grid (the keys that move a unit). */
export type TopologyName = 'square';

/** Which grid `topology` is, or `null` for one the UI has nothing for. */
export const topologyName = (topology: Topology): TopologyName | null =>
  topology instanceof SquareTopology ? 'square' : null;

/**
 * The topology of a world on the `topologyId` grid (square if it does not say), `width` tiles across and `height` down,
 * as the engine builds it: the staggered and hexagonal grids always wrap north to south, so they need an even height.
 * Throws for a grid it does not know, or a size that grid cannot be.
 */
export const topologyFor = ({
  height,
  topologyId = 'square',
  width,
}: {
  height: number;
  topologyId?: string;
  width: number;
}): Topology =>
  // Only a square world reaches here until another grid can be drawn: see the direction types above.
  createTopology(topologyId, width, height) as unknown as Topology;

export default topologyFor;
