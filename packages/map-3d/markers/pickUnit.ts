// Which square's unit is under a point on the screen, by what's drawn of it (docs/3d-renderer.md §9.2). Units are drawn
//  twice life size, and an aircraft flies over its stand, so a unit's figures can stand over the ground of the square
//  behind it: a click, a GoTo's square or a tooltip there goes to the square whose unit it's on, as it's seen, not to
//  the ground the figures hide.

import { Camera, Mesh, Object3D, Raycaster, Vector2 } from 'three';
import { UNIT_PART } from './drawMarker';

const raycaster = new Raycaster();

/**
 * The square whose unit is drawn under the point `ndc` on the screen (from -1 to 1 across, and up), as `camera` sees
 *  it, the nearest to the camera where several are: its key, or nothing. `marked` is each square's key with the copies
 *  of its marker drawn, their matrices up to date. A unit's figures, its stand and the ring at its feet count; its
 *  flag and labels, and a city's buildings, don't.
 */
export const unitUnder = (
  marked: Iterable<readonly [string, readonly Object3D[]]>,
  camera: Camera,
  ndc: readonly [number, number]
): string | null => {
  const meshes: Mesh[] = [],
    keys = new Map<Object3D, string>();

  for (const [key, drawn] of marked) {
    drawn.forEach((copy) =>
      copy.getObjectByName(UNIT_PART)?.traverseVisible((part) => {
        if (part instanceof Mesh) {
          meshes.push(part);
          keys.set(part, key);
        }
      })
    );
  }

  if (meshes.length === 0) {
    return null;
  }

  raycaster.setFromCamera(new Vector2(ndc[0], ndc[1]), camera);

  const [hit] = raycaster.intersectObjects(meshes, false);

  return hit === undefined ? null : keys.get(hit.object) ?? null;
};

export default unitUnder;
