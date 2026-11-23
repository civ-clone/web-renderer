// The 3D map's camera (docs/3d-renderer.md §9.1), as numbers: an orbit round a focus point on the ground, with a yaw
//  (which way it looks), a pitch (how far down) and a distance (the zoom). Pure: the stage turns it into three.js's
//  camera, and the view's input changes it. Kept apart so it's tested without a GPU.
//
// The ground's axes are three.js's, as the land's are: `u` east is `x`, height is `y`, and `v` south is `z`. A yaw is
//  the bearing the camera looks towards: 0 north, a quarter turn east.

/** A point on the ground. */
export type GroundPoint = readonly [number, number];

/** A point in the scene: `u`, height, `v`. */
export type ScenePoint = readonly [number, number, number];

export type Orbit = {
  // The point on the ground it looks at.
  focus: GroundPoint;
  // Radians: the bearing it looks towards, 0 north, increasing clockwise seen from above.
  yaw: number;
  // Radians above the ground it looks down from.
  pitch: number;
  // How far it is from the focus, in world units.
  distance: number;
};

const degrees = (value: number): number => (value * Math.PI) / 180;

/** How far the camera can tilt: from a low look across the land to almost straight down. */
export const PITCH_MIN = degrees(25),
  PITCH_MAX = degrees(80);

/** How near and how far the camera can be. */
export const DISTANCE_MIN = 5,
  DISTANCE_MAX = 90;

/** How much nearer each step of zoom takes the camera: about the 2D map's tenth of zoom. */
export const ZOOM_STEP = 1.12;

/** The camera's field of view, top to bottom. */
export const FIELD_OF_VIEW = degrees(40);

/** How far one turn of the keys turns the view. */
export const TURN_STEP = degrees(45);

export type PresetName = 'above' | 'classic' | 'isometric';

/** The three views to start from (§9.1), as a yaw and a pitch: the classic strategy view is the default. */
export const presets: {
  [name in PresetName]: { yaw: number; pitch: number };
} = {
  above: { yaw: 0, pitch: degrees(80) },
  classic: { yaw: 0, pitch: degrees(55) },
  // Turned 45° on the square grid, so its squares are diamonds as the isometric grid's are (D4). On the others it
  //  looks north (`presetFor`).
  isometric: { yaw: degrees(45), pitch: degrees(30) },
};

/** A preset's yaw and pitch on a grid: the isometric view turns only the square grid, whose squares it makes diamonds. */
export const presetFor = (
  name: PresetName,
  topologyId: string
): { yaw: number; pitch: number } =>
  name === 'isometric' && topologyId !== 'square'
    ? { ...presets.isometric, yaw: 0 }
    : presets[name];

/** The default orbit round `focus`. */
export const defaultOrbit = (focus: GroundPoint): Orbit => ({
  focus,
  ...presets.classic,
  distance: 24,
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** A yaw between 0 and a full turn. */
export const normaliseYaw = (yaw: number): number => {
  const turn = Math.PI * 2;

  return ((yaw % turn) + turn) % turn;
};

/** `orbit` with its pitch and distance kept within their ranges, and its yaw within a turn. */
export const clampOrbit = (orbit: Orbit): Orbit => ({
  ...orbit,
  yaw: normaliseYaw(orbit.yaw),
  pitch: clamp(orbit.pitch, PITCH_MIN, PITCH_MAX),
  distance: clamp(orbit.distance, DISTANCE_MIN, DISTANCE_MAX),
});

/** `orbit` zoomed in by `steps` (out, for fewer than none). */
export const zoomed = (orbit: Orbit, steps: number): Orbit =>
  clampOrbit({ ...orbit, distance: orbit.distance / ZOOM_STEP ** steps });

/** The camera's basis: which way is forward, right and up on the screen, in the scene. */
const basis = ({
  yaw,
  pitch,
}: Pick<Orbit, 'yaw' | 'pitch'>): {
  forward: ScenePoint;
  right: ScenePoint;
  up: ScenePoint;
} => {
  const sinYaw = Math.sin(yaw),
    cosYaw = Math.cos(yaw),
    sinPitch = Math.sin(pitch),
    cosPitch = Math.cos(pitch);

  return {
    forward: [sinYaw * cosPitch, -sinPitch, -cosYaw * cosPitch],
    right: [cosYaw, 0, sinYaw],
    up: [sinYaw * sinPitch, cosPitch, -cosYaw * sinPitch],
  };
};

/** Where the camera is, looking at its focus raised to `height`. */
export const eye = (orbit: Orbit, height: number): ScenePoint => {
  const { forward } = basis(orbit),
    [u, v] = orbit.focus;

  return [
    u - forward[0] * orbit.distance,
    height - forward[1] * orbit.distance,
    v - forward[2] * orbit.distance,
  ];
};

/**
 * Where `point` in the scene is on the screen, as `groundAt` takes a point on the screen (-1 to 1 across and up, on a
 *  screen `aspect` times as wide as it's tall), seen by the camera looking at its focus raised to `height`. Nothing for
 *  a point behind the camera.
 */
export const toScreen = (
  orbit: Orbit,
  height: number,
  [u, up, v]: ScenePoint,
  aspect: number
): [number, number] | null => {
  const { forward, right, up: upward } = basis(orbit),
    from = eye(orbit, height),
    along = [u - from[0], up - from[1], v - from[2]],
    dot = (axis: ScenePoint): number =>
      (along[0] ?? 0) * axis[0] +
      (along[1] ?? 0) * axis[1] +
      (along[2] ?? 0) * axis[2],
    depth = dot(forward),
    spread = Math.tan(FIELD_OF_VIEW / 2);

  if (depth <= 1e-6) {
    return null;
  }

  return [
    dot(right) / (depth * spread * aspect),
    dot(upward) / (depth * spread),
  ];
};

/**
 * The ray from the camera, looking at its focus raised to `height`, through a point on the screen (as `groundAt` takes
 *  it): where it starts, and which way it goes, as far for each unit along as the screen's middle goes for one.
 */
export const rayThrough = (
  orbit: Orbit,
  height: number,
  [x, y]: readonly [number, number],
  aspect: number
): { from: ScenePoint; direction: ScenePoint } => {
  const { forward, right, up } = basis(orbit),
    spread = Math.tan(FIELD_OF_VIEW / 2);

  return {
    from: eye(orbit, height),
    direction: [0, 1, 2].map(
      (axis) =>
        (forward[axis] ?? 0) +
        x * spread * aspect * (right[axis] ?? 0) +
        y * spread * (up[axis] ?? 0)
    ) as unknown as ScenePoint,
  };
};

/**
 * Where a ray from the camera through a point on the screen meets the level ground at `plane`: the point as the
 *  screen's own `x` and `y`, from -1 at the left and bottom to 1 at the right and top, on a screen `aspect` times as
 *  wide as it's tall. Nothing for a point at or above the horizon, which never meets it.
 */
export const groundAt = (
  orbit: Orbit,
  height: number,
  point: readonly [number, number],
  aspect: number,
  plane: number = height
): GroundPoint | null => {
  const { from, direction } = rayThrough(orbit, height, point, aspect);

  // Level with the horizon or above it: never down to the ground.
  if (direction[1] > -1e-6) {
    return null;
  }

  const along = (plane - from[1]) / direction[1];

  if (along <= 0) {
    return null;
  }

  return [from[0] + direction[0] * along, from[2] + direction[2] * along];
};

/**
 * The orbit moved so the ground under the pointer stays under it as it goes from `from` to `to` on the screen (each as
 *  `groundAt` takes it), measured on the level of the focus. Where either is above the horizon, the ground the focus
 *  is on moves by as much as it does at the middle of the screen.
 */
export const panned = (
  orbit: Orbit,
  height: number,
  from: readonly [number, number],
  to: readonly [number, number],
  aspect: number
): Orbit => {
  const start = groundAt(orbit, height, from, aspect),
    end = groundAt(orbit, height, to, aspect);

  if (start !== null && end !== null) {
    return {
      ...orbit,
      focus: [
        orbit.focus[0] + start[0] - end[0],
        orbit.focus[1] + start[1] - end[1],
      ],
    };
  }

  // As far on the ground as the middle of the screen moves for it: across the screen at the focus's distance, and
  //  into it as much more as the ground is foreshortened.
  const across = (from[0] - to[0]) * aspect,
    into = (from[1] - to[1]) / Math.sin(orbit.pitch),
    scale = orbit.distance * Math.tan(FIELD_OF_VIEW / 2),
    { right } = basis(orbit),
    ahead = [Math.sin(orbit.yaw), -Math.cos(orbit.yaw)];

  return {
    ...orbit,
    focus: [
      orbit.focus[0] + (across * right[0] + into * (ahead[0] ?? 0)) * scale,
      orbit.focus[1] + (across * right[2] + into * (ahead[1] ?? 0)) * scale,
    ],
  };
};

/**
 * `orbit` with its yaw within a turn, and its focus kept on the world: taken round its period where it wraps (`u`
 *  across, and `v` down where that's a number), and kept between 0 and `extentV` down where it doesn't.
 */
export const settled = (
  orbit: Orbit,
  period: { u: number; v: number | null },
  extentV: number
): Orbit => {
  const wrap = (value: number, span: number): number =>
      ((value % span) + span) % span,
    [u, v] = orbit.focus;

  return {
    ...orbit,
    yaw: normaliseYaw(orbit.yaw),
    focus: [
      wrap(u, period.u),
      period.v === null ? clamp(v, 0, extentV) : wrap(v, period.v),
    ],
  };
};

/**
 * The orbit part of the way, `t` from 0 to 1, from `from` to `to`: the focus the short way round the world's period,
 *  and the yaw the short way round, or by `turn` exactly where it's given (more than half a turn, or the long way).
 */
export const between = (
  from: Orbit,
  to: Orbit,
  t: number,
  period: { u: number; v: number | null },
  turn?: number
): Orbit => {
  const short = (delta: number, span: number | null): number =>
      span === null ? delta : delta - span * Math.round(delta / span),
    whole = Math.PI * 2,
    eased = t * t * (3 - 2 * t);

  return {
    focus: [
      from.focus[0] + short(to.focus[0] - from.focus[0], period.u) * eased,
      from.focus[1] + short(to.focus[1] - from.focus[1], period.v) * eased,
    ],
    yaw: from.yaw + (turn ?? short(to.yaw - from.yaw, whole)) * eased,
    pitch: from.pitch + (to.pitch - from.pitch) * eased,
    distance: from.distance + (to.distance - from.distance) * eased,
  };
};

/**
 * How far the camera sees before the haze hides everything, for an orbit `distance` from its focus: and, on a world
 *  that repeats every `period` (across, and down where it wraps), no further along the way it looks than half of it
 *  past its focus, so it never sees past the far side of the world from where it looks (#1316). A world so small that
 *  half of it is nearer than the camera ever comes repeats wherever it looks, so it's seen as far as any.
 */
export const sightFor = (
  distance: number,
  period?: { u: number; v: number | null }
): { near: number; far: number } => {
  const repeat =
      period === undefined
        ? Infinity
        : Math.min(period.u, period.v ?? Infinity) / 2,
    half = repeat < DISTANCE_MIN ? Infinity : repeat,
    far = Math.min(distance * 3.5, distance + half);

  // The haze starting no nearer than it did, but for a world so small it has to, to thicken before it's all there is.
  return { near: Math.min(distance * 1.2, (distance + far) / 2), far };
};

/**
 * The lowest the camera looks, `distance` from its focus on a world that repeats every `period`: `PITCH_MIN` while the
 *  haze is as far off as it is close in, and higher as the world's size draws it in (`sightFor`), so the top of the
 *  view is as deep in it as close in. Drawn back from the world, it looks down on the land rather than out over it to
 *  the horizon, as strategy games' cameras do (#1316).
 */
export const lowestPitch = (
  distance: number,
  period?: { u: number; v: number | null }
): number => {
  const half = FIELD_OF_VIEW / 2,
    // The pitch at which the top of the view, half the field of view above where the camera looks, meets the ground
    //  `far` along the way it looks: by the sine rule, sin(pitch) / sin(pitch - half) = far / (distance cos(half)).
    meeting = (far: number): number => {
      const reach = far / (distance * Math.cos(half));

      return Math.atan2(reach * Math.sin(half), reach * Math.cos(half) - 1);
    };

  return clamp(
    PITCH_MIN +
      meeting(sightFor(distance, period).far) -
      meeting(sightFor(distance).far),
    PITCH_MIN,
    PITCH_MAX
  );
};
