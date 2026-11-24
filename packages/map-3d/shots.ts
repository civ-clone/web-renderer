// Shots on the 3D map (plan 2.2): what a unit drawn with a rigged copy throws or fires as it fights, as its clip has
//  it (`ClipShot`). Each figure's shot leaves the node its clip names, at the time it names, the figure's own delay
//  after (`FIGURE_STAGGER`), and lands on the loser's square as long after as its kind flies (`SHOT_LOOKS`), in an arc
//  or straight, a little apart from the others. Pure: the view says where each leaves from and lands, and when, and
//  asks where it is, and which way it's going, when it draws.

import { ClipShot, ShotKind } from './models/modelSet';

/**
 * A figure's shot in a clip: the figure, which of the clip's shots, the node it leaves, when, in seconds in, and what
 *  it is.
 */
export type ShotTime = {
  figure: number;
  shot: number;
  joint: string;
  leaves: number;
  kind: ShotKind;
};

/** How high a thrown bottle's arc rises at its middle, for each square it goes. */
export const SHOT_ARC = 0.25;

/**
 * How each kind of shot goes: how long it flies, in ms; how high its arc rises at its middle, for each square it goes;
 *  how big the puff where it lands is, a bottle's 1; and how big the smoke where it leaves is, with a flash, a
 *  muzzle's, or 0 for none. A shell's burst flashes too.
 */
export type ShotLook = {
  flight: number;
  arc: number;
  hit: number;
  muzzle: number;
  burst: boolean;
};

export const SHOT_LOOKS: Readonly<Record<ShotKind, ShotLook>> = {
  bottle: { flight: 350, arc: SHOT_ARC, hit: 1, muzzle: 0, burst: false },
  arrow: { flight: 450, arc: 0.2, hit: 0.3, muzzle: 0, burst: false },
  bullet: { flight: 80, arc: 0, hit: 0.35, muzzle: 0.35, burst: false },
  shell: { flight: 700, arc: 0.35, hit: 1.6, muzzle: 0.8, burst: true },
};

/** What `shot` is: a bottle, where it doesn't say, as the Partisans' first was. */
export const kindOf = (shot: Pick<ClipShot, 'kind'>): ShotKind =>
  shot.kind ?? 'bottle';

/** How far apart the shots of a squad's figures land, across the way they go, in squares. */
export const SHOT_SPREAD = 0.06;

/** How high over the ground a shot lands, and leaves where its figure isn't drawn with a rigged copy. */
export const SHOT_TARGET = 0.05;

/** How long the puff where a shot lands lasts, in ms. */
export const HIT_PUFF = 500;

/**
 * How long the smoke where a shot leaves a muzzle lasts, in ms: no longer than the puff where it lands, so that's
 *  always over last.
 */
export const MUZZLE_PUFF = 400;

/** How long after it leaves the last of a shot's own is over, in ms: the puff where it lands. */
export const shotOver = (kind: ShotKind): number =>
  SHOT_LOOKS[kind].flight + HIT_PUFF;

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
    .flatMap(({ at, joint, kind }, shot) =>
      Array.from({ length: Math.max(1, figures) }, (_, figure) => ({
        figure,
        shot,
        joint,
        leaves: at + figure * stagger,
        kind: kindOf({ kind }),
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
 *  rising over it in an arc `arc` high at its middle for each square it goes (`SHOT_ARC`, a thrown bottle's), or
 *  straight, for none.
 */
export const shotAt = (
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  through: number,
  arc = SHOT_ARC
): [number, number, number] => {
  const t = Math.min(1, Math.max(0, through)),
    rise = arc * Math.hypot(to[0] - from[0], to[2] - from[2]) * 4 * t * (1 - t);

  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t + rise,
    from[2] + (to[2] - from[2]) * t,
  ];
};

/**
 * Which way a shot from `from` to `to` is going `through` its flight, in an arc `arc` high (`shotAt`): a direction one
 *  long, as an arrow or a bullet's streak points.
 */
export const shotHeading = (
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  through: number,
  arc = SHOT_ARC
): [number, number, number] => {
  const t = Math.min(1, Math.max(0, through)),
    du = to[0] - from[0],
    dv = to[2] - from[2],
    // The rise's rate of change, through the flight: steepest at either end, level at the middle.
    dy = to[1] - from[1] + arc * Math.hypot(du, dv) * 4 * (1 - 2 * t),
    length = Math.hypot(du, dy, dv);

  return length === 0 ? [0, -1, 0] : [du / length, dy / length, dv / length];
};
