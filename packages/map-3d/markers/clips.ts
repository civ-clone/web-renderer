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
export type ClipFacts = {
  duration: number;
  shots: readonly ClipShot[];
  // When its blow lands, in seconds into it, where it says: hand to hand, with no shots.
  strike?: number;
};

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
      {
        duration: clip.duration,
        shots: rig.shots.get(role) ?? [],
        ...(rig.strikes.has(role) ? { strike: rig.strikes.get(role) } : {}),
      },
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

/** How far apart in their idle clips stacks idling are, at most, in seconds (`idlePhase`). */
export const IDLE_SPREAD = 10;

/**
 * How far ahead of the clock in its idle clip the stack on the square `key` is, in seconds, the same each time: each its
 *  own way into it, so stacks idling side by side don't move as one.
 */
export const idlePhase = (key: string): number => {
  let hash = 2166136261;

  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  }

  return ((hash >>> 0) / 2 ** 32) * IDLE_SPREAD;
};

/** A figure's mixer, and what it plays: a role, or one over another (`ClipUnder`), as `role/under`. */
export type Playing = { mixer: AnimationMixer; role: string | null };

/**
 * What a figure plays till its own time in a clip played once comes, as each is a little behind the one before: a role
 *  and how far into it, by the same clock (an attacker that's lost goes on fighting till its own fall begins).
 */
export type ClipBefore = { role: ClipRole; seconds: number };

/**
 * A clip played under another, as a walker eases into its stride from how it stands and back (plan 2.2): its role, how
 *  far into it by the same clock, and how much of the pose is its (0 to 1), the rest the clip over it. For no role, or
 *  one the rig has no clip for, the figure eases to stand as the model does instead.
 */
export type ClipUnder = {
  role: ClipRole | null;
  seconds: number;
  weight: number;
};

// How far into `role`'s clip figure `index` is, `seconds` in for the first: each further on in one that loops, and
//  each a little behind the one before in one played once (`FIGURE_STAGGER`).
const figureSeconds = (
  role: ClipRole,
  seconds: number,
  index: number
): number =>
  LOOPED_ROLES.includes(role)
    ? seconds + index * FIGURE_STAGGER
    : seconds - index * FIGURE_STAGGER;

/**
 * Each of `drawn`'s figures drawn with `rig` (`RIG_FIGURE`) posed as `role`'s clip has it `seconds` in, the second
 *  figure `FIGURE_STAGGER` further in a clip that loops, and that far behind in one played once, and so on; or, for no
 *  role, or one `rig` has no clip for, as the model stands. In one played once, a figure whose own time hasn't come
 *  plays `before`, where it's given, as it would. With `under`, its clip's pose blends in as far as it says (each
 *  figure as far into it as it would be on its own), or, for one `rig` hasn't, the model's own. What each figure plays
 *  is kept in `playing`.
 */
export const poseFigures = (
  drawn: Object3D,
  rig: LoadedRig,
  role: ClipRole | null,
  seconds: number,
  playing: WeakMap<Object3D, Playing>,
  before?: ClipBefore,
  under?: ClipUnder
): void =>
  drawn.getObjectsByProperty('name', RIG_FIGURE).forEach((figure, index) => {
    const own = role === null ? 0 : figureSeconds(role, seconds, index),
      // Its own time in `role` not come yet: still playing what it was.
      waiting =
        role !== null &&
        before !== undefined &&
        !LOOPED_ROLES.includes(role) &&
        own < 0,
      plays = waiting ? before!.role : role,
      at = waiting ? figureSeconds(before!.role, before!.seconds, index) : own,
      clip = plays === null ? undefined : rig.clips.get(plays),
      now = playing.get(figure) ?? {
        mixer: new AnimationMixer(figure),
        role: null,
      },
      asked = clip === undefined ? null : plays,
      // How much of the pose is `under`'s, and its clip, where it has one: none with nothing over it.
      weight =
        asked === null || under === undefined || under.role === asked
          ? 0
          : Math.min(1, Math.max(0, under.weight)),
      beneath =
        weight > 0 && under!.role !== null
          ? rig.clips.get(under!.role)
          : undefined,
      key =
        asked === null
          ? null
          : beneath === undefined
          ? asked
          : `${asked}/${under!.role}`;

    playing.set(figure, now);

    if (now.role !== key) {
      // Stopped, a clip puts back what it moved as it was before it played: the figure as the model stands.
      now.mixer.stopAllAction();
      now.role = key;

      // Round and round, as `clipTime` says when it's at, so it never pauses at its end.
      [clip, beneath].forEach((played) => {
        if (key !== null && played !== undefined) {
          now.mixer.clipAction(played).setLoop(LoopRepeat, Infinity).play();
        }
      });
    }

    if (clip === undefined || asked === null) {
      return;
    }

    // Each as far into its clip as it is, by the clock, and as much of the pose as it has: what's left of the clip
    //  over `under`'s, the model's own where it has no clip.
    const over = now.mixer.clipAction(clip);

    over.setEffectiveWeight(1 - weight);
    over.time = clipTime(asked, clip.duration, at);

    if (beneath !== undefined) {
      const lower = now.mixer.clipAction(beneath);

      lower.setEffectiveWeight(weight);
      lower.time = clipTime(
        under!.role!,
        beneath.duration,
        figureSeconds(under!.role!, under!.seconds, index)
      );
    }

    now.mixer.update(0);
  });
