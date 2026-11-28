// Which square's unit is under a point on the screen, by what's drawn of it (docs/3d-renderer.md §9.2). Units are drawn
//  twice life size, and an aircraft flies over its stand, so a unit's figures can stand over the ground of the square
//  behind it: a click, a GoTo's square or a tooltip there goes to the square whose unit it's on, as it's seen, not to
//  the ground the figures hide.

import { Camera, Mesh, Object3D, Raycaster, Vector2 } from 'three';
import { FIGURES_PART, UNIT_PART } from './drawMarker';

const raycaster = new Raycaster();

// On every layer: a unit's meshes are drawn as instances, on a layer of their own (`instances.ts`).
raycaster.layers.enableAll();

/**
 * Set in the `userData` of a unit's figures the blink has hidden (`Stage#showFigures`, §6.3): they're still picked, as
 *  they're seen there every other half a second, and the 2D map's blink doesn't change what's clicked either.
 */
export const BLINKED_OUT = 'blinkedOut';

/** `marker`'s figures, where it has them, shown or hidden by the blink: hidden, they're flagged to be picked still. */
export const blinkFigures = (
  marker: Object3D | undefined,
  shown: boolean
): void => {
  const figures = marker?.getObjectByName(FIGURES_PART);

  if (figures !== undefined) {
    figures.visible = shown;
    figures.userData[BLINKED_OUT] = !shown;
  }
};

/** `to`'s figures shown or hidden as `from`'s are, mid-blink, so a copy made afresh blinks with them. */
export const blinkAs = (from: Object3D, to: Object3D): void => {
  const blinking = from.getObjectByName(FIGURES_PART),
    figures = to.getObjectByName(FIGURES_PART);

  if (blinking !== undefined && figures !== undefined) {
    figures.visible = blinking.visible;
    figures.userData[BLINKED_OUT] = blinking.userData[BLINKED_OUT] === true;
  }
};

// `part` and what's in it shown, or hidden by the blink, gathered with its square's `key`.
const gather = (
  part: Object3D,
  key: string,
  meshes: Mesh[],
  keys: Map<Object3D, string>
): void => {
  if (!part.visible && part.userData[BLINKED_OUT] !== true) {
    return;
  }

  if (part instanceof Mesh) {
    meshes.push(part);
    keys.set(part, key);
  }

  part.children.forEach((child) => gather(child, key, meshes, keys));
};

/**
 * The square whose unit is drawn under the point `ndc` on the screen (from -1 to 1 across, and up), as `camera` sees
 *  it, the nearest to the camera where several are: its key, or nothing. `marked` is each square's key with the copies
 *  of its marker drawn, their matrices up to date. A unit's figures, its stand and the ring at its feet count, the
 *  figures even while the blink hides them; its flag and labels, and a city's buildings, don't. None further from the
 *  camera than `within`: where the land's nearer, as a mountain in front of a unit is, the unit's hidden there.
 */
export const unitUnder = (
  marked: Iterable<readonly [string, readonly Object3D[]]>,
  camera: Camera,
  ndc: readonly [number, number],
  within: number = Infinity
): string | null => {
  const meshes: Mesh[] = [],
    keys = new Map<Object3D, string>();

  for (const [key, drawn] of marked) {
    drawn.forEach((copy) => {
      const unit = copy.getObjectByName(UNIT_PART);

      if (unit !== undefined) {
        gather(unit, key, meshes, keys);
      }
    });
  }

  if (meshes.length === 0) {
    return null;
  }

  raycaster.setFromCamera(new Vector2(ndc[0], ndc[1]), camera);
  raycaster.far = within;

  const [hit] = raycaster.intersectObjects(meshes, false);

  return hit === undefined ? null : keys.get(hit.object) ?? null;
};

export default unitUnder;
