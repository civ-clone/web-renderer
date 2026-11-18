// How much a square's relief counts at a point, by how far the point is from the square's middle (docs/3d-renderer.md
//  §4.1): Wendland's C2 kernel, 1 at the middle and falling smoothly to 0 at `REACH`, with no kink anywhere, so the land
//  has no seams along squares' edges.

/** How far a square's relief reaches, in world units: neighbours' middles are 1 apart on every grid (§3). */
export const REACH = 1.2;

/** The kernel at `distance` from the middle. */
export const weight = (distance: number): number => {
  const r = distance / REACH;

  if (r >= 1) {
    return 0;
  }

  const fall = 1 - r;

  return fall * fall * fall * fall * (4 * r + 1);
};
