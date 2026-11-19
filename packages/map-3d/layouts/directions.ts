// The way each of a grid's directions points on the ground, as its squares are laid out: for the keys that move a
//  unit, which turn with the camera (`MapRenderer#heading`).

import type { Topology } from '@civ-clone/ui-client/lib/topologyFor';
import type { GroundLayout } from './GroundLayout';

/**
 * The way each of `topology`'s directions points on the ground, east and south, from a square's middle to its
 *  neighbour's, as `layout` lays them: the same from every square, on even rows and odd.
 */
export const groundDirections = (
  layout: Pick<GroundLayout, 'centre'>,
  topology: Pick<Topology, 'directions' | 'offset'>
): { [direction: string]: readonly [number, number] } => {
  const [u, v] = layout.centre(0, 0);

  return Object.fromEntries(
    topology.directions().map((direction) => {
      const [x, y] = topology.offset(direction, 0, 0),
        [toU, toV] = layout.centre(x, y);

      return [direction, [toU - u, toV - v] as const];
    })
  );
};

export default groundDirections;
