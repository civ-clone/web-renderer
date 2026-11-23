// Clips played on a model's rigged copy's figures (plan 2.2): each figure posed as a role's clip has it a time in, by
//  the clock, not by what's passed since the last frame, so a frame drawn late or twice poses it the same. A squad's
//  figures are a little apart in it, so they don't move as one. Without a clip, a figure stands as the model does.

import { AnimationMixer, LoopRepeat, Object3D } from 'three';
import { ClipRole, ClipShot } from '../models/modelSet';
import { LoadedRig } from '../models/loadModels';
import { RIG_FIGURE } from './drawMarker';

/** The roles whose clips play round and round: the rest play once, held at their end. */
export const LOOPED_ROLES: readonly ClipRole[] = ['idle', 'move', 'work'];

/**
 * How far a unit walks, in squares, for each second of its walk's clip: its figures' legs keep up with how fast it
 *  goes, quicker for a rival's walk or a quick one, slower as it gets going and stops. At a quarter of a second a
 *  square, as a player's units walk, the clip plays twice as quick as it's made.
 */
export const STRIDE = 2;

/**
 * How far apart in its clip each figure of a squad is, in seconds: each further on in one that loops, and each a little
 *  after the one before in one played once, so none is ahead of the clip's start.
 */
export const FIGURE_STAGGER = 0.13;

/** A role's clip on a rigged copy: how long it is, in seconds, and the shots its figures fire in it (`ClipShot`). */
export type ClipFacts = { duration: number; shots: readonly ClipShot[] };

/**
 * What a unit drawn with a rigged copy plays, as battles are paced for it (`clipPace`): its clips, by role; how many
 *  figures it's drawn with; and how far apart in a clip each is, in seconds (`FIGURE_STAGGER`).
 */
export type RigFacts = {
  figures: number;
  stagger: number;
  clips: Partial<Record<ClipRole, ClipFacts>>;
};

/** What `rig` plays, drawn with `figures` figures (`RigFacts`). */
export const rigFacts = (rig: LoadedRig, figures: number): RigFacts => ({
  figures,
  stagger: FIGURE_STAGGER,
  clips: Object.fromEntries(
    [...rig.clips].map(([role, clip]) => [
      role,
      { duration: clip.duration, shots: rig.shots.get(role) ?? [] },
    ])
  ),
});

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
 *  figure `FIGURE_STAGGER` further in a clip that loops, and that far behind in one played once, and so on; or, for no
 *  role, or one `rig` has no clip for, as the model stands. What each figure plays is kept in `playing`.
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
      // Stopped, a clip puts back what it moved as it was before it played: the figure as the model stands.
      now.mixer.stopAllAction();
      now.role = asked;

      // Round and round, as `clipTime` says when it's at, so it never pauses at its end.
      if (clip !== undefined) {
        now.mixer.clipAction(clip).setLoop(LoopRepeat, Infinity).play();
      }
    }

    if (clip !== undefined && asked !== null) {
      now.mixer.setTime(
        clipTime(
          asked,
          clip.duration,
          LOOPED_ROLES.includes(asked)
            ? seconds + index * FIGURE_STAGGER
            : seconds - index * FIGURE_STAGGER
        )
      );
    }
  });
