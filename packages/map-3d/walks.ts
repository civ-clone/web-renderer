// How units walk from square to square on the 3D map (docs/3d-renderer.md §6.4, §8.2). Pure, and by the clock: the
//  view asks where each walker is at the time it draws, and the tests say what time it is.
//
// - A walk is one or more steps: from where the unit was drawn as it set off, through the middle of each square it
//   steps onto, to where it'll stand on the last.
// - Steps join. A step from the square a walk's bound for goes on from there, as a GoTo's steps come, all at once, and
//   as a unit moved again before it's arrived does.
// - It gets up to pace from standing, and slows to a stop only at its end: a step joined mid-walk goes on at the pace
//   it's at.
// - However many steps, what's left of a walk takes no longer than its pace's `most`: a railroad trip of a hundred
//   squares hurries, rather than taking half a minute.
// - Units that step together walk as one: a unit drawn where a walk is, stepping from and to the squares its last step
//   was, as it was taken, rides along. A ship and what it carries step so, the ship first, as do units sent the same
//   way at once. One stepping on from where its walk's bound goes on along it, the others staying bound there unless
//   they step along too; one stepping from elsewhere sets off from where it's drawn, and a walk it leaves empty is
//   given up (`dropped`).
// - It faces the way from one square's middle to the next (each point's `middle`), turning as it passes one, and,
//   when a step's joined, from the way it faced then.
//
// Where it walks is on the ground (`u`, `v`), each point with a `lift`: how far above the land there the unit stands,
//  which the view sets, so a walk starts and ends where the unit's drawn standing.

/** A square, as the engine has it. */
export type WalkSquare = { readonly x: number; readonly y: number };

/**
 * A point on the ground (`u`, `v`), and how far above the land there a unit stands; and the middle of the square it's
 *  on, which a walk faces between, as a unit standing faces the way it last went from one square's middle to the next.
 *  Its own point, without one.
 */
export type WalkPoint = {
  at: readonly [number, number];
  lift: number;
  middle?: readonly [number, number];
};

/** How fast a walk goes. */
export type Pace = {
  // How long a step takes at full pace, in ms.
  step: number;
  // How long it takes to get up to pace from standing, and to stop, in ms.
  ramp: number;
  // The longest what's left of a walk may take, in ms.
  most: number;
};

/** A walk under way: its units, the first leading, and where it is now. */
export type Walker = {
  id: string;
  units: readonly string[];
  // Where it is on the ground, and how far above the land there.
  at: [number, number];
  lift: number;
  // Which way it faces, turned from south (`+v`) towards east (`+u`), in radians: the way it's going, turning as it
  //  passes a square's middle.
  facing: number;
  // The square it set off from, the square its last step set off from, and the square it's bound for.
  from: WalkSquare;
  before: WalkSquare;
  to: WalkSquare;
};

/** How the player's own units walk: a step in a quarter of a second, a tenth getting going and stopping. */
export const OWN_PACE: Pace = { step: 250, ramp: 100, most: 2000 };

/** How other players' units walk, on the screen: twice as fast, and never longer than a second. */
export const RIVALS_PACE: Pace = { step: 125, ramp: 50, most: 1000 };

/** How long after a walk's last step a unit making the same step rides along with it, in ms. */
export const RIDE = 50;

// How near, on the ground, a unit walking must be drawn to another walk to ride along with it.
const BESIDE = 0.05;

// How it moves: from `from` steps along its path at `started`, going `speed` steps a ms, up to `pace` at `rise` steps a
//  ms², then on at `top`, then stopping at `fall`, to `to`.
type Motion = {
  started: number;
  from: number;
  speed: number;
  // How long it gets up to `top` (or slows to it), goes on at it, and stops, in ms; and how fast it changes pace.
  rising: number;
  rise: number;
  top: number;
  going: number;
  stopping: number;
  fall: number;
  to: number;
};

type Walk = {
  id: string;
  units: string[];
  // The square it set off from; and those it goes through, with their points, from the one before where it is now.
  from: WalkSquare;
  points: WalkPoint[];
  squares: WalkSquare[];
  // When its last step was taken: a unit making the same step this soon after rides along.
  stepped: number;
  motion: Motion;
  // The way it faced as its last step was joined, when, and how long it takes to turn from it to the way its path
  //  goes, so it turns rather than snapping round.
  turned: { facing: number; at: number; over: number } | null;
};

const sameSquare = (a: WalkSquare, b: WalkSquare): boolean =>
  a.x === b.x && a.y === b.y;

/** How far along its path (in steps) a motion is at `now`, and how fast it's going there (steps a ms). */
export const motionAt = (
  motion: Motion,
  now: number
): { along: number; speed: number } => {
  const { started, from, speed, rising, rise, top, going, stopping, fall, to } =
      motion,
    t = Math.max(0, now - started);

  if (t < rising) {
    return {
      along: from + speed * t + (rise * t * t) / 2,
      speed: speed + rise * t,
    };
  }

  const risen = from + ((speed + top) / 2) * rising;

  if (t < rising + going) {
    return { along: risen + top * (t - rising), speed: top };
  }

  const went = risen + top * going,
    s = t - rising - going;

  if (s < stopping) {
    return {
      along: went + top * s - (fall * s * s) / 2,
      speed: top - fall * s,
    };
  }

  return { along: to, speed: 0 };
};

/** When a motion stops. */
export const motionEnds = (motion: Motion): number =>
  motion.started + motion.rising + motion.going + motion.stopping;

/**
 * A motion from `from` steps along a path, going `speed`, to `to`, from `now`, at `pace`: up to full pace, or as near as
 *  it gets before it has to slow, then stopping at `to`. Hurried, where what's left would take longer than its most.
 */
export const plan = (
  now: number,
  from: number,
  speed: number,
  to: number,
  pace: Pace
): Motion => {
  const left = Math.max(0, to - from),
    ramp = Math.max(1, pace.ramp),
    // At full pace from standing, `left` steps take `left` steps' time and a ramp's: hurried to fit its most.
    full = Math.max(
      1 / pace.step,
      pace.most > ramp * 2 ? left / (pace.most - ramp) : 0
    ),
    rate = full / ramp;

  if (left <= 0) {
    return {
      started: now,
      from: to,
      speed: 0,
      rising: 0,
      rise: 0,
      top: 0,
      going: 0,
      stopping: 0,
      fall: 0,
      to,
    };
  }

  // Too fast to stop in time at its rate: it slows as it must, from now.
  if ((speed * speed) / (2 * rate) >= left) {
    const stopping = (2 * left) / speed;

    return {
      started: now,
      from,
      speed,
      rising: 0,
      rise: 0,
      top: speed,
      going: 0,
      stopping,
      fall: speed / stopping,
      to,
    };
  }

  // The fastest it gets: full pace, or, short of the room for it, where rising and stopping meet.
  const top = Math.min(full, Math.sqrt(rate * left + (speed * speed) / 2)),
    rising = Math.abs(top - speed) / rate,
    rise = top >= speed ? rate : -rate,
    stopping = top / rate,
    risen = ((speed + top) / 2) * rising,
    stopped = (top * stopping) / 2,
    going = Math.max(0, (left - risen - stopped) / top);

  return {
    started: now,
    from,
    speed,
    rising,
    rise,
    top,
    going,
    stopping,
    fall: rate,
    to,
  };
};

// `value` taken to the copy, a whole `period` round, nearest `near`; as it is where it doesn't wrap.
const nearest = (value: number, near: number, period: number | null): number =>
  period === null
    ? value
    : value + period * Math.round((near - value) / period);

// The way from `a` to `b`, turned from south (`+v`) towards east (`+u`); `null` where they're the same.
const wayOf = (
  a: readonly [number, number],
  b: readonly [number, number]
): number | null =>
  a[0] === b[0] && a[1] === b[1] ? null : Math.atan2(b[0] - a[0], b[1] - a[1]);

// `a` turned towards `b` by `t`, the short way round.
const turnTowards = (a: number, b: number, t: number): number => {
  const delta = b - a - Math.PI * 2 * Math.round((b - a) / (Math.PI * 2));

  return a + delta * t;
};

/** The units walking on a map whose ground repeats every `period` across, and down where it wraps. */
export class Walks {
  #period: { u: number; v: number | null };
  #walks = new Map<string, Walk>();
  // Which walk each unit walking is in.
  #walkOf = new Map<string, string>();
  // The walks given up as their last unit left them, since last asked.
  #dropped: string[] = [];
  #made = 0;

  constructor(period: { u: number; v: number | null }) {
    this.#period = period;
  }

  /** Whether `unit` is walking. */
  walking(unit: string): boolean {
    return this.#walkOf.has(unit);
  }

  /** How many walks are under way. */
  size(): number {
    return this.#walks.size;
  }

  /**
   * `unit` steps from the square `from` to `to`, at `now`, at `pace`. Walking, it goes on from there, or rides along
   *  with the walk that's just made that step; otherwise it sets off from `setOff`, where it's drawn. It arrives at
   *  `arrive`, where it'll stand on `to`. The walk it's in.
   */
  step(
    unit: string,
    from: WalkSquare,
    to: WalkSquare,
    setOff: WalkPoint,
    arrive: WalkPoint,
    now: number,
    pace: Pace
  ): string {
    const ownId = this.#walkOf.get(unit),
      own = ownId === undefined ? undefined : this.#walks.get(ownId),
      drawn = own === undefined ? setOff : this.#drawn(own, now),
      // Another walk that's just made this step, drawn where this unit was as it made it: it rides along with it, as
      //  what a ship carries does, stepping after the ship.
      riding = [...this.#walks.values()].find(
        (walk) =>
          walk !== own &&
          this.#justMade(walk, from, to, now) &&
          this.#beside(
            this.#drawn(walk, walk.stepped),
            own === undefined ? setOff : this.#drawn(own, walk.stepped)
          )
      );

    if (riding !== undefined) {
      if (own !== undefined) {
        this.#leave(own, unit);
      }

      riding.units.push(unit);
      this.#walkOf.set(unit, riding.id);

      return riding.id;
    }

    // Going on from where its walk's bound: it goes on, at the pace it's going, along the way it's come. Those walking
    //  with it stay bound where they were, unless they step along too, as they do just after it.
    if (
      own !== undefined &&
      sameSquare(own.squares[own.squares.length - 1]!, from)
    ) {
      if (own.units.length > 1) {
        const behind: Walk = {
          ...own,
          id: `walk-${++this.#made}`,
          units: own.units.filter((id) => id !== unit),
          points: [...own.points],
          squares: [...own.squares],
        };

        this.#walks.set(behind.id, behind);
        behind.units.forEach((other) => this.#walkOf.set(other, behind.id));
        own.units = [unit];
      }

      this.#goOn(own, to, arrive, now, pace);

      return own.id;
    }

    // Elsewhere, or not walking: it sets off from where it's drawn.
    if (own !== undefined) {
      this.#leave(own, unit);
    }

    return this.#setOff(unit, from, to, drawn, arrive, now, pace);
  }

  /** The walks under way at `now`, and those that have ended since, taken off. */
  at(now: number): { going: Walker[]; ended: Walker[] } {
    const going: Walker[] = [],
      ended: Walker[] = [];

    this.#walks.forEach((walk) => {
      const walker = this.#walker(walk, now);

      if (now >= motionEnds(walk.motion)) {
        ended.push(walker);
        this.#end(walk);

        return;
      }

      going.push(walker);
    });

    return { going, ended };
  }

  /** The walks given up since last asked, as their last unit left them for another: none of them goes on. */
  dropped(): string[] {
    return this.#dropped.splice(0);
  }

  /** When the next walk under way ends, or nothing with none. */
  nextEnd(): number | null {
    let soonest: number | null = null;

    this.#walks.forEach((walk) => {
      const ends = motionEnds(walk.motion);

      soonest = soonest === null ? ends : Math.min(soonest, ends);
    });

    return soonest;
  }

  /**
   * The walks whose units `test` picks ended now, there at once: each as it is at its end, as `endAll` has them.
   */
  endWhere(test: (units: readonly string[]) => boolean, now: number): Walker[] {
    const ended: Walker[] = [];

    this.#walks.forEach((walk) => {
      if (test(walk.units)) {
        ended.push(this.#walker(walk, Math.max(now, motionEnds(walk.motion))));
        this.#end(walk);
      }
    });

    return ended;
  }

  /**
   * Every walk ended now, there at once: each as it is at its end, so one that waits there for its patch stands where it
   *  was bound, not mid-way.
   */
  endAll(now: number): Walker[] {
    const ended = [...this.#walks.values()].map((walk) =>
      this.#walker(walk, Math.max(now, motionEnds(walk.motion)))
    );

    this.#walks.clear();
    this.#walkOf.clear();

    return ended;
  }

  // Whether `walk`'s last step, from `from` to `to`, was made just now.
  #justMade(
    walk: Walk,
    from: WalkSquare,
    to: WalkSquare,
    now: number
  ): boolean {
    const last = walk.squares.length - 1;

    return (
      last > 0 &&
      now - walk.stepped <= RIDE &&
      sameSquare(walk.squares[last - 1]!, from) &&
      sameSquare(walk.squares[last]!, to)
    );
  }

  #setOff(
    unit: string,
    from: WalkSquare,
    to: WalkSquare,
    setOff: WalkPoint,
    arrive: WalkPoint,
    now: number,
    pace: Pace
  ): string {
    const id = `walk-${++this.#made}`,
      walk: Walk = {
        id,
        units: [unit],
        from,
        points: [setOff],
        squares: [from],
        stepped: now,
        motion: plan(now, 0, 0, 0, pace),
        turned: null,
      };

    this.#walks.set(id, walk);
    this.#walkOf.set(unit, id);
    this.#goOn(walk, to, arrive, now, pace);

    return id;
  }

  // `walk` goes on to `to`, arriving at `arrive`, taken to the copy of the world nearest where it's been, from where it
  //  is now and at the pace it's going, turning from the way it faces. The points it's passed are let go, but the one
  //  before where it is, which it turns from.
  #goOn(
    walk: Walk,
    to: WalkSquare,
    arrive: WalkPoint,
    now: number,
    pace: Pace
  ): void {
    const { u, v } = this.#period,
      last = walk.points[walk.points.length - 1]!,
      lastMiddle = last.middle ?? last.at,
      { along, speed } = motionAt(walk.motion, now),
      passed = Math.max(0, Math.floor(along) - 1),
      facing = walk.points.length > 1 ? this.#walker(walk, now).facing : null,
      end = walk.points.length - 1,
      into = along - (end - 1);

    // Where it was to stop is a square it passes through now: through its middle, not in front of a city there, where
    //  that moves it no more than a hundredth of a square from where it's drawn, as when a GoTo's steps come together.
    if (
      last.middle !== undefined &&
      into *
        Math.hypot(last.middle[0] - last.at[0], last.middle[1] - last.at[1]) <
        0.01
    ) {
      walk.points[end] = { at: last.middle, lift: 0, middle: last.middle };
    }

    walk.points.splice(0, passed);
    walk.squares.splice(0, passed);
    walk.points.push({
      at: [
        nearest(arrive.at[0], last.at[0], u),
        nearest(arrive.at[1], last.at[1], v),
      ],
      lift: arrive.lift,
      ...(arrive.middle === undefined
        ? {}
        : {
            middle: [
              nearest(arrive.middle[0], lastMiddle[0], u),
              nearest(arrive.middle[1], lastMiddle[1], v),
            ] as [number, number],
          }),
    });
    walk.squares.push(to);
    walk.stepped = now;
    walk.turned =
      facing === null ? null : { facing, at: now, over: pace.step / 2 };
    walk.motion = plan(
      now,
      along - passed,
      speed,
      walk.points.length - 1,
      pace
    );
  }

  // `unit` leaves `walk`: one walking alone ends it there.
  #leave(walk: Walk, unit: string): void {
    walk.units = walk.units.filter((id) => id !== unit);
    this.#walkOf.delete(unit);

    if (walk.units.length === 0) {
      this.#walks.delete(walk.id);
      this.#dropped.push(walk.id);
    }
  }

  // Whether two points on the ground are as good as the same, a copy of the world round or not.
  #beside(a: WalkPoint, b: WalkPoint): boolean {
    const { u, v } = this.#period;

    return (
      Math.hypot(
        nearest(a.at[0], b.at[0], u) - b.at[0],
        nearest(a.at[1], b.at[1], v) - b.at[1]
      ) < BESIDE
    );
  }

  #end(walk: Walk): void {
    this.#walks.delete(walk.id);
    walk.units.forEach((unit) => this.#walkOf.delete(unit));
  }

  // Where `walk` is drawn at `now`, as a point to set off from.
  #drawn(walk: Walk, now: number): WalkPoint {
    const { at, lift } = this.#walker(walk, now);

    return { at, lift };
  }

  #walker(walk: Walk, now: number): Walker {
    const { points, squares, turned } = walk,
      last = points.length - 1,
      along = Math.min(last, Math.max(0, motionAt(walk.motion, now).along)),
      index = Math.min(last - 1, Math.floor(along)),
      t = along - index,
      a = points[index]!,
      b = points[index + 1] ?? a,
      at: [number, number] = [
        a.at[0] + (b.at[0] - a.at[0]) * t,
        a.at[1] + (b.at[1] - a.at[1]) * t,
      ],
      middle = (i: number): readonly [number, number] =>
        points[i]!.middle ?? points[i]!.at,
      way = (i: number): number | null =>
        i < 0 || i >= last ? null : wayOf(middle(i), middle(i + 1)),
      here = way(index) ?? 0,
      // Turning at each square's middle: a quarter of a step either side, from the way it came to the way it goes.
      pathFacing =
        t > 0.75 && way(index + 1) !== null
          ? turnTowards(here, way(index + 1)!, (t - 0.75) * 2)
          : t < 0.25 && way(index - 1) !== null
          ? turnTowards(way(index - 1)!, here, (t + 0.25) * 2)
          : here,
      // Just after a step's joined, from the way it faced then.
      facing =
        turned !== null && now - turned.at < turned.over
          ? turnTowards(
              turned.facing,
              pathFacing,
              Math.max(0, now - turned.at) / turned.over
            )
          : pathFacing;

    return {
      id: walk.id,
      units: [...walk.units],
      at,
      lift: a.lift + (b.lift - a.lift) * t,
      facing,
      from: walk.from,
      before: squares[last - 1] ?? squares[last]!,
      to: squares[last]!,
    };
  }
}

export default Walks;
