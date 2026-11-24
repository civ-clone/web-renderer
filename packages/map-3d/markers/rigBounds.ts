// How far a model's rigged copy's clips take its figures (plan 2.2), so each is drawn only where the camera, or the
//  sun's shadows, would see it. A skinned mesh's own bounds are its bind pose's, worked out once, wherever a clip takes
//  it after: these cover every pose its clips have instead, as the rig's loaded, and its copies take them with them.

import { AnimationMixer, Box3, Object3D, SkinnedMesh, Sphere } from 'three';
import { LoadedRig } from '../models/loadModels';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** How often a clip's poses are taken for its rig's bounds, in seconds. */
export const BOUNDS_STEP = 0.1;

/** How much further than any pose taken a rig's bounds reach: for what a clip does between the poses taken. */
export const BOUNDS_SPARE = 1.1;

// The skinned meshes in `scene`, in the order a walk of it finds them.
const skinnedOf = (scene: Object3D): SkinnedMesh[] => {
  const found: SkinnedMesh[] = [];

  scene.traverse((object) => {
    if ((object as SkinnedMesh).isSkinnedMesh) {
      found.push(object as SkinnedMesh);
    }
  });

  return found;
};

/**
 * Each of `rig`'s skinned meshes bounded, in its own space, as far as it reaches as the model stands and at every
 *  `BOUNDS_STEP` of each of its clips, and its clip's end, and `BOUNDS_SPARE` further: then drawn only where it's seen,
 *  as every other mesh is. Its copies (`SkeletonUtils.clone`) take its bounds with them. Posed on a copy of its own, so
 *  the rig's scene stays as the model stands.
 */
export const boundClips = (rig: LoadedRig): void => {
  const posed = cloneSkinned(rig.scene),
    meshes = skinnedOf(posed),
    boxes = meshes.map(() => new Box3()),
    take = (): void => {
      posed.updateMatrixWorld(true);
      meshes.forEach((mesh, index) => {
        mesh.computeBoundingBox();
        boxes[index]!.union(mesh.boundingBox!);
      });
    },
    mixer = new AnimationMixer(posed);

  take();
  rig.clips.forEach((clip) => {
    mixer.stopAllAction();
    mixer.clipAction(clip).play();

    for (let at = 0; at < clip.duration; at += BOUNDS_STEP) {
      mixer.setTime(at);
      take();
    }

    mixer.setTime(Math.max(0, clip.duration - 1e-4));
    take();
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(posed);

  // One with no points to bound is drawn wherever it is.
  skinnedOf(rig.scene).forEach((mesh, index) => {
    const box = boxes[index];

    if (box === undefined || box.isEmpty()) {
      mesh.frustumCulled = false;

      return;
    }

    const sphere = box.getBoundingSphere(new Sphere());

    sphere.radius *= BOUNDS_SPARE;
    mesh.boundingSphere = sphere;
    mesh.frustumCulled = true;
  });
};

export default boundClips;
