// How high what's marked on a square stands on the land (docs/3d-renderer.md §6): a unit's stand is flat, so on a peak
//  or a steep slope it stands on the highest of the land under it, never sunk into it.

import type { Ground } from '../terrain/ribbons';

/** How far round a unit's stand reaches from its middle (`figures.ts`'s stand). */
export const STAND_REACH = 0.2;

// How many points round the stand's rim the land's looked at, besides where the rim crosses its creases: between two,
//  on one of its flat triangles, it's under them by no more than about 0.001 on a mountain's steepest side.
const AROUND = 48;

/**
 * How high a stand with its middle at (`u`, `v`) stands on `ground`, the land as it's drawn: on the highest of it under
 *  the stand, and on the sea, where that's lower. The land's flat triangles between its points, each cell split from
 *  its bottom left to its top right, so its highest under the stand is at one of its points there, or on the stand's
 *  rim: where the rim crosses a line between its points, or between those, all round.
 */
export const standHeight = (ground: Ground, u: number, v: number): number => {
  const { spacingU, spacingV } = ground,
    r = STAND_REACH;
  let highest = ground.at(u, v);
  const look = (pu: number, pv: number): void => {
      highest = Math.max(highest, ground.at(pu, pv));
    },
    // Where the rim crosses the line through the ground where `nu` across and `nv` down make `k`.
    crossings = (nu: number, nv: number, k: number): void => {
      const length = Math.hypot(nu, nv),
        off = (k - nu * u - nv * v) / length;

      if (Math.abs(off) > r) {
        return;
      }

      const [au, av] = [nu / length, nv / length],
        along = Math.sqrt(r * r - off * off);

      look(u + au * off - av * along, v + av * off + au * along);
      look(u + au * off + av * along, v + av * off - au * along);
    };

  for (let way = 0; way < AROUND; way++) {
    const angle = (way / AROUND) * Math.PI * 2;

    look(u + Math.cos(angle) * r, v + Math.sin(angle) * r);
  }

  // The land's points under the stand, and where the rim crosses the lines across and down between them.
  for (let a = Math.ceil((u - r) / spacingU); a * spacingU <= u + r; a++) {
    crossings(1, 0, a * spacingU);

    for (let b = Math.ceil((v - r) / spacingV); b * spacingV <= v + r; b++) {
      if (Math.hypot(a * spacingU - u, b * spacingV - v) <= r) {
        look(a * spacingU, b * spacingV);
      }
    }
  }

  for (let b = Math.ceil((v - r) / spacingV); b * spacingV <= v + r; b++) {
    crossings(0, 1, b * spacingV);
  }

  // And the cells' diagonals, where `u / spacingU + v / spacingV` is whole.
  const middle = u / spacingU + v / spacingV,
    reach = r * Math.hypot(1 / spacingU, 1 / spacingV);

  for (let k = Math.ceil(middle - reach); k <= middle + reach; k++) {
    crossings(1 / spacingU, 1 / spacingV, k);
  }

  return Math.max(0, highest);
};

export default standHeight;
