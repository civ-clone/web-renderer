// Shots on the 3D map (plan 2.2): what a unit drawn with a rigged copy throws or fires as it fights, as its clip has
//  it (`ClipShot`). Each figure's shot leaves the node its clip names, at the time it names, the figure's own delay
//  after (`FIGURE_STAGGER`), and lands on the loser's square `SHOT_FLIGHT` after, in an arc, a little apart from the
//  others. Pure: the view says where each leaves from and lands, and when, and asks where it is when it draws.

import { ClipShot } from './models/modelSet';

/** A figure's shot in a clip: the figure, which of the clip's shots, the node it leaves, and when, in seconds in. */
export type ShotTime = {
  figure: number;
  shot: number;
  joint: string;
  leaves: number;
};

/** How high a shot's arc rises at its middle, for each square it goes. */
export const SHOT_ARC = 0.25;

/** How far apart the shots of a squad's figures land, across the way they go, in squares. */
export const SHOT_SPREAD = 0.06;

/** How high over the ground a shot lands, and leaves where its figure isn't drawn with a rigged copy. */
export const SHOT_TARGET = 0.05;

/** How long the puff where a shot lands lasts, in ms. */
export const HIT_PUFF = 500;

/**
 * When each of `figures` figures' shots leaves in a clip whose shots are `shots`, each figure `stagger` seconds after
 *  the one before (`FIGURE_STAGGER`), in the order they leave.
 */
export const shotTimes = (
  shots: readonly ClipShot[],
  figures: number,
  stagger: number
): ShotTime[] =>
  shots
    .flatMap(({ at, joint }, shot) =>
      Array.from({ length: Math.max(1, figures) }, (_, figure) => ({
        figure,
        shot,
        joint,
        leaves: at + figure * stagger,
      }))
    )
    .sort((a, b) => a.leaves - b.leaves);

/**
 * Where the shot of figure `figure` of `figures` lands, going from `from` to `target`: a little to one side of it or
 *  the other, across the way it goes, so a squad's don't land as one.
 */
export const landsAt = (
  from: readonly [number, number, number],
  target: readonly [number, number, number],
  figure: number,
  figures: number
): [number, number, number] => {
  const du = target[0] - from[0],
    dv = target[2] - from[2],
    length = Math.hypot(du, dv),
    aside = (figure - (Math.max(1, figures) - 1) / 2) * SHOT_SPREAD;

  if (length === 0) {
    return [target[0], target[1], target[2]];
  }

  return [
    target[0] - (dv / length) * aside,
    target[1],
    target[2] + (du / length) * aside,
  ];
};

/**
 * Where a shot from `from` to `to` is `through` its flight, from 0 (leaving) to 1 (landed): along the line between them,
 *  rising over it in an arc (`SHOT_ARC`).
 */
export const shotAt = (
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  through: number
): [number, number, number] => {
  const t = Math.min(1, Math.max(0, through)),
    rise =
      SHOT_ARC * Math.hypot(to[0] - from[0], to[2] - from[2]) * 4 * t * (1 - t);

  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t + rise,
    from[2] + (to[2] - from[2]) * t,
  ];
};
