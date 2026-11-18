// The ground layout for a world's grid (docs/3d-renderer.md §3).

import { GroundLayout, GroundWorld } from './GroundLayout';
import hexOddRLayout from './hexOddR';
import squareLayout from './square';
import staggeredIsoLayout from './staggeredIso';

const layouts: {
  [id in GroundWorld['topologyId']]: (world: GroundWorld) => GroundLayout;
} = {
  square: squareLayout,
  'staggered-iso': staggeredIsoLayout,
  'hex-odd-r': hexOddRLayout,
};

/** The layout of `world`'s squares on the ground. Throws for a grid it has none for, or a world its grid can't be. */
export const groundLayoutFor = (world: GroundWorld): GroundLayout => {
  // Its own entries only: not `constructor` or `toString`, say, from the object's prototype.
  if (!Object.prototype.hasOwnProperty.call(layouts, world.topologyId)) {
    throw new Error(`No ground layout for the ${world.topologyId} grid.`);
  }

  // A staggered row can only follow one of the other parity, so these grids wrap over the poles only with an even
  //  number of rows (`validate` in their topologies).
  if (world.wrapsY && world.topologyId !== 'square' && world.height % 2 !== 0) {
    throw new Error(
      `The ${world.topologyId} grid can't wrap over the poles with an odd number of rows (${world.height}).`
    );
  }

  return layouts[world.topologyId](world);
};

export type { GroundLayout, GroundPoint, GroundWorld } from './GroundLayout';

export default groundLayoutFor;
