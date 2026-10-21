import SquareTopology, {
  SquareDirection,
  SquareEdgeDirection,
} from '@civ-clone/core-world/SquareTopology';
import { ITopology } from '@civ-clone/core-world/Topology';

// The shape of the world's grid, for the UI: which tile neighbours which, and which ways there are (#88). It is the
//  engine's own implementation, and the only thing the UI takes from the engine: `SquareTopology` imports nothing but
//  the `ITopology` type, so it brings no rules or state with it.
//
// Every world is square for now. When the world says which grid it is on (#89), this is where that is read, and the
//  direction types below widen to every grid's.

/** Which way a neighbour is. */
export type Direction = SquareDirection;

/** Which way a neighbour that shares an edge is. */
export type EdgeDirection = SquareEdgeDirection;

export type Topology = ITopology<Direction>;

/** The grids there are, for what the UI keeps per grid (the keys that move a unit). */
export type TopologyName = 'square';

/** Which grid `topology` is, or `null` for one the UI has nothing for. */
export const topologyName = (topology: Topology): TopologyName | null =>
  topology instanceof SquareTopology ? 'square' : null;

/** The topology of a world `width` tiles across and `height` down. */
export const topologyFor = ({
  height,
  width,
}: {
  height: number;
  width: number;
}): Topology => new SquareTopology(width, height);

export default topologyFor;
