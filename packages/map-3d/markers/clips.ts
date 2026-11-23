// Clips played on a model's rigged copy's figures (plan 2.2): each figure posed as a role's clip has it a time in, by
//  the clock, not by what's passed since the last frame, so a frame drawn late or twice poses it the same. A squad's
//  figures are a little apart in it, so they don't move as one. Without a clip, a figure stands as the model does.

import { AnimationMixer, LoopRepeat, Object3D, SkinnedMesh } from 'three';
import { ClipRole } from '../models/modelSet';
import { LoadedRig } from '../models/loadModels';
import { RIG_FIGURE } from './drawMarker';

/** The roles whose clips play round and round: the rest play once, held at their end. */
export const LOOPED_ROLES: readonly ClipRole[] = ['idle', 'move', 'work'];

/**
 * How much quicker than its clip's own pace a walk plays: a unit crosses a square in a quarter of a second or less, far
 *  quicker than a stride, so its figures trot, rather than stroll and slide.
 */
export const MOVE_RATE = 2;

/** How far apart in its clip each figure of a squad is, in seconds. */
export const FIGURE_STAGGER = 0.13;

/**
 * How far into `role`'s clip, `duration` seconds long, it is `seconds` after it began: round and round for one that
 *  loops, and held just short of its end for one that doesn't, where its last frame is.
 */
export const clipTime = (
  role: ClipRole,
  duration: number,
  seconds: number
): number => {
  if (!(duration > 0)) {
    return 0;
  }

  const since = Math.max(0, seconds);

  return LOOPED_ROLES.includes(role)
    ? since % duration
    : Math.min(since, duration - 1e-4);
};

/** A figure's mixer, and the role it plays. */
export type Playing = { mixer: AnimationMixer; role: ClipRole | null };

/**
 * Each of `drawn`'s figures drawn with `rig` (`RIG_FIGURE`) posed as `role`'s clip has it `seconds` in, the second
 *  figure `FIGURE_STAGGER` further in, and so on; or, for no role, or one `rig` has no clip for, as the model stands.
 *  What each figure plays is kept in `playing`.
 */
export const poseFigures = (
  drawn: Object3D,
  rig: LoadedRig,
  role: ClipRole | null,
  seconds: number,
  playing: WeakMap<Object3D, Playing>
): void =>
  drawn.getObjectsByProperty('name', RIG_FIGURE).forEach((figure, index) => {
    const clip = role === null ? undefined : rig.clips.get(role),
      now = playing.get(figure) ?? {
        mixer: new AnimationMixer(figure),
        role: null,
      },
      asked = clip === undefined ? null : role;

    playing.set(figure, now);

    if (now.role !== asked) {
      now.mixer.stopAllAction();
      now.role = asked;

      if (clip === undefined) {
        // As the model stands: its bind pose.
        figure.traverse((object) => {
          if ((object as SkinnedMesh).isSkinnedMesh) {
            (object as SkinnedMesh).skeleton.pose();
          }
        });
      } else {
        // Round and round, as `clipTime` says when it's at, so it never pauses at its end.
        now.mixer.clipAction(clip).setLoop(LoopRepeat, Infinity).play();
      }
    }

    if (clip !== undefined && asked !== null) {
      now.mixer.setTime(
        clipTime(asked, clip.duration, seconds + index * FIGURE_STAGGER)
      );
    }
  });
